// Who to ask about an event: the investor's own contacts (from the vault, on the device) matched
// against public executive data. Shared by the cards and the call sheet so both say the same thing.
import executivesData from "@/data/executives.json";
import orgsData from "@/data/orgs.json";
import { whoToAsk, type Contact, type Executive, type Orgs, type Suggestion } from "@/lib/network";
import type { Card, PersonRef } from "@/lib/types";

const DAY = 24 * 3600_000;
export const orgs = orgsData as unknown as Orgs;
export const executives: Executive[] = executivesData.executives.map((x) => ({
  ...x, stints: x.stints.map((s) => ({ ...s, datesKnown: s.start != null })),
}));

/** 6 Nov 2026 → 2026.85; drives recency decay and the keep-warm rule. */
export const fracYear = (iso: string) => {
  const d = new Date(iso);
  return d.getUTCFullYear() + (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / (365.25 * DAY);
};

export function suggestionsFor(symbol: string, eventId: string, contacts: Contact[], asOf: string): Suggestion[] {
  return whoToAsk(symbol, eventId, contacts, executives, orgs, fracYear(asOf));
}

export const toPersonRef = (s: Suggestion): PersonRef => ({
  contactId: s.contact.id, displayName: s.contact.name, reason: s.reason, strength: s.score, confirmed: !s.probable,
});

/** Attach the strongest person (and, for a leadership change, the path to the appointee). */
export function withPerson(c: Card, contacts: Contact[] | null, asOf: string, you: string): Card {
  if (!contacts) return c;
  const [s] = suggestionsFor(c.companySymbol, c.id, contacts, asOf);
  if (!s) return c;
  const person = toPersonRef(s);
  if (c.variant === "management_change" && s.via) {
    return { ...c, person, path: { steps: [you, s.contact.name, s.via], strength: s.score, confirmed: !s.probable, explanation: s.reason } };
  }
  return { ...c, person };
}
