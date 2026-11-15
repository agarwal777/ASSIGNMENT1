// Run: node --test web/scripts/network.test.mjs   (Node 24 strips TypeScript types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { stintOverlap, whoToAsk, explainOverlap, toYear } from "../lib/network.ts";

const orgs = {
  symbols: { VOLTAS: "Voltas" },
  aliases: { Voltbek: "Voltbek Home Appliances" },
  large: ["Voltas"],
  relations: { VOLTAS: { competitors: ["Blue Star"] } },
};
const AS_OF = 2026.85;
const st = (org, fn, start, end, datesKnown = true) => ({ org, function: fn, start, end, datesKnown });

test("year parsing", () => {
  assert.equal(toYear("1999"), 1999);
  assert.ok(Math.abs(toYear("2001", true) - 2001.999) < 1e-9);
  assert.equal(toYear(null), null);
});

test("no overlap in time → null", () => {
  assert.equal(stintOverlap(st("Voltas", "sales", "2010", "2012"), st("Voltas", "sales", "2015", "2018"), orgs, AS_OF), null);
});

test("different orgs → null; aliases and suffixes resolve", () => {
  assert.equal(stintOverlap(st("Voltas", "sales", "2010", "2020"), st("Blue Star", "sales", "2010", "2020"), orgs, AS_OF), null);
  const o = stintOverlap(st("Voltbek Pvt Ltd", "supply_chain", "2019-06-01", "2022-03-31"),
                         st("Voltbek Home Appliances", "general_management", "2019", "2026"), orgs, AS_OF);
  assert.ok(o && o.confirmed && o.org === "Voltbek Home Appliances");
});

test("longer, same-function, small-org, recent overlap scores higher", () => {
  const long = stintOverlap(st("X", "finance", "2015", "2021"), st("X", "finance", "2015", "2021"), orgs, AS_OF);
  const short = stintOverlap(st("X", "finance", "2015", "2016"), st("X", "finance", "2015", "2021"), orgs, AS_OF);
  const otherFn = stintOverlap(st("X", "sales", "2015", "2021"), st("X", "finance", "2015", "2021"), orgs, AS_OF);
  const large = stintOverlap(st("Voltas", "finance", "2015", "2021"), st("Voltas", "finance", "2015", "2021"), orgs, AS_OF);
  const old = stintOverlap(st("X", "finance", "1995", "2001"), st("X", "finance", "1995", "2001"), orgs, AS_OF);
  assert.ok(long.strength > short.strength);
  assert.ok(long.strength > otherFn.strength);
  assert.ok(long.strength > large.strength);
  assert.ok(long.strength > old.strength);
});

test("unknown dates → probable 0.25 with honest wording", () => {
  const o = stintOverlap(st("X", "sales", null, null, false), st("X", "sales", "2010", "2015"), orgs, AS_OF);
  assert.deepEqual([o.strength, o.confirmed], [0.25, false]);
  assert.equal(explainOverlap(o, "A. Person"), "Both worked at X; overlap not confirmed");
});

test("education without years is probable, never confirmed", () => {
  const o = stintOverlap(st("SPJIMR", "education", null, null, false), st("SPJIMR", "education", null, null), orgs, AS_OF);
  assert.deepEqual([o.strength, o.confirmed, o.education], [0.25, false, true]);
});

test("whoToAsk ranks a second-degree link, alumni and a competitor peer", () => {
  const exec = { id: "e", name: "Jayant Balan", company: "VOLTAS", role: "MD", events: ["EV"],
                 stints: [st("Voltbek Home Appliances", "general_management", "2019", "2026")] };
  const contacts = [
    { id: "a", name: "Rohan M.", closeness: 4, lastContacted: "2026-09-10", tags: [],
      stints: [st("Voltbek Home Appliances", "supply_chain", "2019-06-01", "2022-03-31")] },
    { id: "b", name: "Ananya I.", closeness: 3, lastContacted: "2025-11-20", tags: [],
      stints: [st("Voltas", "marketing", "2012-07-01", "2018-05-31"), st("Blue Star", "marketing", "2018-06-01", null)] },
    { id: "c", name: "Nobody", closeness: 5, lastContacted: null, tags: [], stints: [st("Elsewhere", "sales", "2010", null)] },
  ];
  const r = whoToAsk("VOLTAS", "EV", contacts, [exec], orgs, AS_OF);
  assert.equal(r.length, 2, "unrelated contact is not suggested");
  assert.equal(r[0].contact.id, "a");
  assert.equal(r[0].kind, "second_degree");
  assert.match(r[0].reason, /Overlapped with Jayant Balan at Voltbek Home Appliances, 2019–2022/);
  assert.equal(r.find((s) => s.contact.id === "b").keepWarm?.startsWith("Last spoke Nov 2025"), true);
});

test("themes: who knows a theme, and the expertise map", async () => {
  const { whoKnows, expertiseMap } = await import("../lib/network.ts");
  const people = [
    { id: "a", name: "Ishaan K.", closeness: 4, lastContacted: "2026-10-05", tags: ["specialty chemicals", "pigments"],
      stints: [{ org: "Clariant", role: "Head of Applications", function: "r_and_d", start: "2020-01-01", end: null, datesKnown: true }] },
    { id: "b", name: "Ritu A.", closeness: 2, lastContacted: "2025-04-18", tags: ["agrochemicals", "specialty chemicals"],
      stints: [{ org: "UPL", role: "Head of Process Chemistry", function: "r_and_d", start: "2018-12-01", end: null, datesKnown: true }] },
    { id: "c", name: "Rohan M.", closeness: 4, lastContacted: "2026-09-10", tags: ["consumer durables"], stints: [] },
  ];
  const hits = whoKnows("specialty chemicals", people, [], orgs, AS_OF);
  assert.deepEqual(hits.map((h) => h.contact.name), ["Ishaan K.", "Ritu A."]);   // closer contact first
  assert.equal(hits[0].kind, "expertise");
  assert.match(hits[0].reason, /go-to on specialty chemicals: now Head of Applications at Clariant/);
  const map = expertiseMap(people);
  assert.deepEqual(map[0], { theme: "specialty chemicals", people: ["Ishaan K.", "Ritu A."] });
  assert.equal(map.length, 4);
});

test("peers: sourced link first, then same NSE industry, then our classification (labelled)", async () => {
  const { whoToAsk } = await import("../lib/network.ts");
  const o = {
    symbols: { VOLTAS: "Voltas" }, aliases: {}, large: [],
    relations: { VOLTAS: { competitors: ["Godrej Appliances", "Blue Star"] } },
    industry: { "Voltas": { symbol: "VOLTAS", basic_industry: "Household Appliances", source: "x" },
                "Blue Star": { symbol: "BLUESTARCO", basic_industry: "Household Appliances", source: "x" } },
    sourced: { VOLTAS: [{ org: "Voltbek Home Appliances", kind: "supplier", page: 4, source: "x" }] },
  };
  const at = (name, org) => ({ id: name, name, closeness: 3, lastContacted: "2026-10-01", tags: [],
    stints: [{ org, role: "Manager", function: "sales", start: "2018-01-01", end: null, datesKnown: true }] });
  const r = whoToAsk("VOLTAS", "ev", [at("A", "Blue Star"), at("B", "Godrej Appliances"), at("C", "Voltbek Home Appliances")], [], o, AS_OF);
  const reason = (n) => r.find((s) => s.contact.name === n).reason;
  assert.match(reason("A"), /same NSE industry \(Household Appliances\)/);
  assert.match(reason("B"), /competitor, our classification/);
  assert.match(reason("C"), /a supplier of Voltas in its related-party filing \(p\. 4\)/);
});

test("themes match whole words: 'titan' is not the tag 'IT'", async () => {
  const { whoKnows } = await import("../lib/network.ts");
  const c = [{ id: "a", name: "Aakash G.", closeness: 4, lastContacted: "2026-08-21", tags: ["IT", "banking technology"], stints: [] },
             { id: "b", name: "Ishaan K.", closeness: 4, lastContacted: "2026-10-05", tags: ["specialty chemicals"], stints: [] }];
  assert.deepEqual(whoKnows("Titan", c, [], orgs, AS_OF).map((s) => s.contact.name), []);
  assert.deepEqual(whoKnows("IT", c, [], orgs, AS_OF).map((s) => s.contact.name), ["Aakash G."]);
  assert.deepEqual(whoKnows("chemicals", c, [], orgs, AS_OF).map((s) => s.contact.name), ["Ishaan K."]);
  assert.deepEqual(whoKnows("banking", c, [], orgs, AS_OF).map((s) => s.contact.name), ["Aakash G."]);
});
