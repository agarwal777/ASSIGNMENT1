// Network matching. Pure functions, no imports, no model: runs in the investor's own browser
// over their RLS-scoped contacts plus public executive data. Explanations are templates.

export type Stint = {
  org: string;
  role?: string | null;
  function: string;
  start: string | null; // "YYYY" or "YYYY-MM-DD"
  end: string | null;   // null = still there (or unknown when start is null)
  datesKnown: boolean;
};
export type Contact = {
  id: string; name: string; closeness: number; lastContacted: string | null; tags: string[]; stints: Stint[];
};
export type Executive = { id: string; name: string; company: string; role: string; events: string[]; stints: Stint[] };
export type Orgs = {
  symbols: Record<string, string>;
  aliases: Record<string, string>;
  large: string[];
  /** Our classification (judgement, not from filings); labelled so wherever it is shown. */
  relations: Record<string, Partial<Record<"competitors" | "customers" | "partners", string[]>>>;
  /** NSE's Basic Industry per organisation, from its NSE quote page: a peer is the same industry. */
  industry?: Record<string, { symbol: string; basic_industry: string; source: string }>;
  /** Supplier/customer links named in a related-party filing, with the page they are on. */
  sourced?: Record<string, { org: string; kind: "supplier" | "customer"; page: number; source: string }[]>;
};
export type Overlap = { strength: number; confirmed: boolean; org: string; from?: number; to?: number; years?: number; education?: boolean };
export type Suggestion = {
  contact: Contact; score: number; kind: "second_degree" | "alumni" | "peer" | "expertise"; reason: string;
  probable: boolean; keepWarm: string | null; via?: string;
};

const SUFFIX = /\b(ltd|limited|pvt|private|plc|inc|co)\b\.?/gi;
export function canonical(org: string, orgs: Pick<Orgs, "aliases">): string {
  const trimmed = org.replace(SUFFIX, "").replace(/^the\s+/i, "").replace(/\s+/g, " ").trim();
  return orgs.aliases[trimmed] ?? trimmed;
}

/** "1999" → 1999.0 as a start, 1999.999 as an end; "2016-03-01" → 2016.16 */
export function toYear(s: string | null, asEnd = false): number | null {
  if (!s) return null;
  if (/^\d{4}$/.test(s)) return Number(s) + (asEnd ? 0.999 : 0);
  const d = new Date(s + "T00:00:00Z");
  return d.getUTCFullYear() + d.getUTCMonth() / 12 + (d.getUTCDate() - 1) / 365;
}

const ADJACENT = new Set(["general_management"]);
function functionMatch(a: string, b: string): number {
  if (a === b) return 1;
  if (ADJACENT.has(a) || ADJACENT.has(b)) return 0.6;
  return 0.3;
}

/** README §6.5: saturating in duration, function match, org size, recency decay. */
export function stintOverlap(c: Stint, p: Stint, orgs: Orgs, asOf: number): Overlap | null {
  const org = canonical(c.org, orgs);
  if (org !== canonical(p.org, orgs)) return null;
  if (c.function === "education" || p.function === "education") {
    if (c.function !== p.function) return null;
    const yc = toYear(c.start), yp = toYear(p.start);
    if (yc != null && yp != null && Math.abs(yc - yp) <= 2) return { strength: 0.4, confirmed: true, org, education: true };
    return { strength: 0.25, confirmed: false, org, education: true };
  }
  if (!c.datesKnown || !p.datesKnown || c.start == null || p.start == null) {
    return { strength: 0.25, confirmed: false, org };
  }
  const cs = toYear(c.start)!, ps = toYear(p.start)!;
  const ce = toYear(c.end, true) ?? asOf, pe = toYear(p.end, true) ?? asOf;
  const from = Math.max(cs, ps), to = Math.min(ce, pe);
  const years = to - from;
  if (years <= 0) return null;
  const size = orgs.large.includes(org) ? 0.5 : 1;
  const strength = (1 - Math.exp(-years / 2)) * functionMatch(c.function, p.function) * size
    * Math.exp(-Math.max(0, asOf - to) / 10);
  return { strength: round(strength), confirmed: true, org, from, to, years: round(years, 1) };
}

export function bestOverlap(c: Contact, p: { stints: Stint[] }, orgs: Orgs, asOf: number): Overlap | null {
  let best: Overlap | null = null;
  for (const a of c.stints) for (const b of p.stints) {
    const o = stintOverlap(a, b, orgs, asOf);
    if (o && (!best || o.strength > best.strength)) best = o;
  }
  return best;
}

export function explainOverlap(o: Overlap, personName: string): string {
  if (o.education) return o.confirmed
    ? `Studied at ${o.org} around the same time as ${personName}`
    : `Studied at ${o.org}, like ${personName}; years not confirmed`;
  if (!o.confirmed) return `Both worked at ${o.org}; overlap not confirmed`;
  const y = o.years!;
  return `Overlapped with ${personName} at ${o.org}, ${Math.floor(o.from!)}–${Math.floor(o.to!)} (${y < 1 ? "under a year" : `${y} yr${y >= 1.5 ? "s" : ""}`})`;
}

const MIN_SHOWN = 0.2;
const KEEP_WARM_MONTHS = 6;

function keepWarm(c: Contact, asOf: number): string | null {
  const last = toYear(c.lastContacted);
  if (last == null || asOf - last < KEEP_WARM_MONTHS / 12) return null;
  const d = new Date(c.lastContacted + "T00:00:00Z");
  return `Last spoke ${d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })}: a natural reason to reconnect`;
}

function yr(s: string | null) { return s ? s.slice(0, 4) : "?"; }

/**
 * "Who knows …?": a typed person (matched against executives in public filings) or organisation
 * (matched against your contacts' employers). Same scoring and template wording as whoToAsk.
 */
export function whoKnows(query: string, contacts: Contact[], executives: Executive[], orgs: Orgs, asOf: number): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const people = executives.filter((e) => e.name.toLowerCase().includes(q));
  const symbolHit = Object.entries(orgs.symbols).find(([s, n]) => s.toLowerCase() === q || n.toLowerCase().includes(q));
  const orgQuery = symbolHit ? canonical(symbolHit[1], orgs).toLowerCase() : q;
  const out: Suggestion[] = [];
  for (const c of contacts) {
    const warm = keepWarm(c, asOf);
    for (const p of people) {
      const o = bestOverlap(c, p, orgs, asOf);
      if (o && o.strength >= MIN_SHOWN) out.push({ contact: c, kind: "second_degree", via: p.name, probable: !o.confirmed,
        keepWarm: warm, score: round(o.strength * (0.5 + c.closeness / 10)), reason: explainOverlap(o, p.name) });
    }
    for (const s of c.stints) {
      const org = canonical(s.org, orgs);
      if (s.function === "education" || !org.toLowerCase().includes(orgQuery)) continue;
      const end = toYear(s.end, true) ?? asOf;
      out.push({ contact: c, kind: "alumni", probable: false, keepWarm: warm,
        score: round((s.end == null ? 0.8 : 0.7 * Math.exp(-Math.max(0, asOf - end) / 10)) * (0.5 + c.closeness / 10)),
        reason: `${s.end == null ? "At" : "Worked at"} ${org} ${yr(s.start)}–${s.end ? yr(s.end) : "now"} (${s.role ?? s.function})` });
    }
  }
  // Themes: a contact the investor tagged with the searched theme (e.g. "specialty chemicals").
  for (const c of contacts) {
    const tag = c.tags.find((t) => t.toLowerCase().includes(q) || (q.length >= 4 && q.includes(t.toLowerCase())));
    if (!tag) continue;
    const now = c.stints.find((s) => s.end == null && s.function !== "education") ?? c.stints.at(-1);
    out.push({ contact: c, kind: "expertise", probable: false, keepWarm: keepWarm(c, asOf),
      score: round(0.5 * (0.5 + c.closeness / 10)),
      reason: `Your go-to on ${tag}${now ? `: ${now.end == null ? "now" : "was"} ${now.role ?? now.function} at ${canonical(now.org, orgs)}` : ""}` });
  }
  const best = new Map<string, Suggestion>();
  for (const s of out) {
    const prev = best.get(s.contact.id);
    if (!prev || s.score > prev.score) best.set(s.contact.id, s);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** Expertise map: every theme the investor's contacts are tagged with, and who covers it. */
export function expertiseMap(contacts: Contact[]): { theme: string; people: string[] }[] {
  const m = new Map<string, string[]>();
  for (const c of contacts) for (const t of c.tags) {
    const k = t.trim();
    if (!k) continue;
    m.set(k, [...(m.get(k) ?? []), c.name]);
  }
  return [...m.entries()].map(([theme, people]) => ({ theme, people }))
    .sort((a, b) => b.people.length - a.people.length || a.theme.localeCompare(b.theme));
}

/** Ranked people to ask about an event at `symbol`, optionally involving executives. */
export function whoToAsk(symbol: string, eventId: string, contacts: Contact[], executives: Executive[],
  orgs: Orgs, asOf: number): Suggestion[] {
  const out: Suggestion[] = [];
  const company = orgs.symbols[symbol] ?? symbol;
  const rel = orgs.relations[symbol] ?? {};
  const people = executives.filter((e) => e.events.includes(eventId));

  for (const c of contacts) {
    const warm = keepWarm(c, asOf);
    // 1. Second degree: the contact overlapped with a person named in this filing.
    for (const p of people) {
      const o = bestOverlap(c, p, orgs, asOf);
      if (!o || o.strength < MIN_SHOWN) continue;
      out.push({ contact: c, kind: "second_degree", via: p.name, probable: !o.confirmed, keepWarm: warm,
        score: round(o.strength * (0.5 + c.closeness / 10)), reason: explainOverlap(o, p.name) });
    }
    // 2. Alumni: worked at the company itself.
    for (const s of c.stints) {
      if (canonical(s.org, orgs) !== canonical(company, orgs) || s.function === "education") continue;
      const end = toYear(s.end, true) ?? asOf;
      const recency = Math.exp(-Math.max(0, asOf - end) / 10);
      out.push({ contact: c, kind: "alumni", probable: false, keepWarm: warm,
        score: round(0.7 * recency * (0.5 + c.closeness / 10)),
        reason: `Worked at ${company} ${yr(s.start)}–${s.end ? yr(s.end) : "now"} (${s.role ?? s.function})` });
    }
    // 3. Peers. Sourced first: same NSE industry, or a supplier/customer named in a related-party
    //    filing. Then our own classification (competitor/customer/partner), labelled as such.
    const ownCanon = canonical(company, orgs);
    const industry = orgs.industry?.[ownCanon]?.basic_industry;
    const sourced = orgs.sourced?.[symbol] ?? [];
    for (const s of c.stints) {
      if (s.function === "education") continue;
      const org = canonical(s.org, orgs);
      if (org === ownCanon) continue;
      const current = s.end == null;
      const when = current ? `since ${yr(s.start)}` : `${yr(s.start)}–${yr(s.end)}`;
      const at = current ? "At" : "Was at";
      const score = round((current ? 0.5 : 0.35) * (0.5 + c.closeness / 10));
      const link = sourced.find((x) => canonical(x.org, orgs).toLowerCase() === org.toLowerCase());
      if (link) {
        out.push({ contact: c, kind: "peer", probable: false, keepWarm: warm, score: round(score * 1.1),
          reason: `${at} ${org}, a ${link.kind} of ${company} in its related-party filing (p. ${link.page}) ${when}` });
        continue;
      }
      if (industry && orgs.industry?.[org]?.basic_industry === industry) {
        out.push({ contact: c, kind: "peer", probable: false, keepWarm: warm, score,
          reason: `${at} ${org}, same NSE industry (${industry}) ${when}` });
        continue;
      }
      for (const [kind, list] of Object.entries(rel)) {
        if (!list!.map((x) => canonical(x, orgs)).includes(org)) continue;
        const label = kind === "competitors" ? "competitor" : kind === "customers" ? "customer" : "partner";
        out.push({ contact: c, kind: "peer", probable: false, keepWarm: warm, score: round(score * 0.9),
          reason: `${at} ${org} (${label}, our classification) ${when}` });
      }
    }
  }
  // One row per contact: keep each contact's most specific, then strongest, reason.
  const best = new Map<string, Suggestion>();
  for (const s of out) {
    const prev = best.get(s.contact.id);
    const better = !prev || (s.kind === "second_degree" && prev.kind !== "second_degree")
      || (s.kind === prev.kind && s.score > prev.score)
      || (prev.kind !== "second_degree" && s.kind !== "second_degree" && s.score > prev.score);
    if (better) best.set(s.contact.id, s);
  }
  // Someone who knows the person named in the filing beats general company context.
  const rank = (s: Suggestion) => (s.kind === "second_degree" ? 1 : 0);
  return [...best.values()].sort((a, b) => rank(b) - rank(a) || b.score - a.score);
}

function round(x: number, d = 2) { const f = 10 ** d; return Math.round(x * f) / f; }
