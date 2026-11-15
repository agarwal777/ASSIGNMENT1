import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import BullBear from "@/components/company/BullBear";
import CompanyQuestion from "@/components/company/CompanyQuestion";
import InvestorAssumption from "@/components/company/InvestorAssumption";
import LedgerTimeline from "@/components/company/LedgerTimeline";
import NextQuestion from "@/components/company/NextQuestion";
import PriceChart from "@/components/company/PriceChart";
import Statements from "@/components/company/Statements";
import QuarterCharts from "@/components/company/QuarterCharts";
import SnapshotTable from "@/components/company/SnapshotTable";
import BulletChart from "@/components/trust/BulletChart";
import StatusPill from "@/components/trust/StatusPill";
import Num from "@/components/trust/Num";
import { SourceLink } from "@/components/trust/SourceLink";
import { shortName, SNAPSHOT_AS_OF, companySymbols, getCompany, hasLedgerData } from "@/lib/companies";
import { DATA_TO_DAY, DEFAULT_AS_OF } from "@/lib/api";
import { copy } from "@/lib/copy";
import { priceSeries } from "@/lib/priceChart";
import { statementsFor } from "@/lib/statements";
import rptLinks from "@/data/rpt_links.json";
import { date, period } from "@/lib/format";
import type { ThesisItem } from "@/lib/types";

// Every snapshot company is prerendered; unseen tickers are handled by Ask (B7).
export function generateStaticParams() {
  return companySymbols().map((symbol) => ({ symbol }));
}

export default async function CompanyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const c = getCompany(decodeURIComponent(symbol));
  if (!c) notFound();
  const eventId = c.recentFilings.find((f) => f.tier === "needs_you")?.id ?? c.recentFilings[0]?.id;
  const cred = c.credibility;
  // The demo assumption (seed/theses.csv, all "at or above"); the investor's own edit replaces it on the device.
  const seed = c.thesis.investor[0]?.claim;
  const important = c.recentFilings.filter((f) => f.tier !== "collapsed");
  const routine = c.recentFilings.filter((f) => f.tier === "collapsed");
  const prices = priceSeries(c.symbol);
  const statements = statementsFor(c.symbol);

  return (
    <article>
      {/* 1 · header */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 px-2 backdrop-blur">
        <Link href="/portfolio" className="inline-flex min-h-11 items-center gap-1 px-2 text-[13px] font-medium text-accent">
          <ChevronLeft size={18} aria-hidden /> {copy.portfolio.title}
        </Link>
      </header>
      <div className="px-4 pb-8">
        <h1 className="mt-3 font-serif text-[26px] leading-[32px]">{c.name}</h1>
        <p className="text-[13px] text-ink-3">
          {c.symbol} · {c.sector}
          {c.price && (
            <span className="ml-2 text-ink-2">
              <Num v={c.price.close} signed={false} /> <Num v={c.price.dayChange} /> <span className="text-ink-3">· {date(`${c.price.asOf}T15:30:00+05:30`, SNAPSHOT_AS_OF)}</span>
            </span>
          )}
        </p>

        {/* 2 · credibility */}
        <p className="mt-4 rounded-[12px] bg-surface p-3 text-[15px] leading-[22px] border border-line">
          {cred && cred.resolved >= 2 ? (
            <>{copy.company.met} <Num v={{ value: cred.met, kind: "count", epistemic: "CALCULATED" }} /> {copy.company.of}{" "}
              <Num v={{ value: cred.resolved, kind: "count", epistemic: "CALCULATED" }} /> {copy.company.promisesWindow}</>
          ) : cred && cred.resolved === 1 ? (
            <>{copy.company.notEnough} <span className="text-ink-2">({copy.company.oneResolved(cred.met === 1)})</span></>
          ) : (
            <span className="text-ink-2">{hasLedgerData(c.symbol) ? copy.company.noneCheckable : copy.company.noTranscripts}</span>
          )}
        </p>

        {/* 3 · thesis */}
        <section aria-labelledby="thesis" className="mt-6">
          <h2 id="thesis" className="text-[13px] font-medium text-ink-2">{copy.company.thesis}</h2>
          <ThesisRow title={copy.company.managementClaims} items={c.thesis.management}
            empty={hasLedgerData(c.symbol) ? copy.company.noManagementClaims : copy.company.noClaimsWithoutTranscripts} />
          {/* Reads ?sheet=assumption, so it sits in a Suspense boundary; the fallback is the same card. */}
          <Suspense fallback={<p className="mt-3 text-[13px] text-ink-3">{copy.company.yourAssumptions}</p>}>
            <InvestorAssumption symbol={c.symbol} items={c.thesis.investor} quarters={c.quarters} dataTo={DATA_TO_DAY}
            seed={seed && (seed.metric === "ebitda_margin" || seed.metric === "revenue_growth")
              ? { metric: seed.metric, operator: ">=", target: seed.target, deadline: seed.deadline } : null} />
          </Suspense>
        </section>

        {/* 4 · promised vs delivered */}
        <section aria-labelledby="ledger" className="mt-6">
          <h2 id="ledger" className="scroll-mt-16 text-[13px] font-medium text-ink-2">{copy.company.ledger}</h2>
          {c.ledger.length > 0
            ? <div className="mt-2"><LedgerTimeline promises={c.ledger} asOf={DEFAULT_AS_OF} /* the latest brief, as on Today */ /></div>
            : <p className="mt-2 text-[15px] leading-[22px] text-ink-2">{hasLedgerData(c.symbol) ? copy.company.noPromises
              : c.transcripts?.since ? copy.company.transcriptsOffline(shortName(c.name), c.transcripts.count, date(`${c.transcripts.since}T12:00:00+05:30`))
              : copy.company.noTranscripts}</p>}
        </section>

        {/* 5 · snapshot */}
        <section aria-labelledby="snapshot" className="mt-6">
          <h2 id="snapshot" className="mb-1 text-[13px] font-medium text-ink-2">{copy.company.snapshot(c.quarters.length)}</h2>
          {c.quarters.length > 0 ? (
            <>
              <QuarterCharts rows={c.quarters} />
              <details className="mt-3 rounded-[8px] border border-line">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13px] font-medium text-ink-2">{copy.company.allQuarters}</summary>
                <div className="px-3 pb-2"><SnapshotTable rows={c.quarters} /></div>
              </details>
            </>
          ) : <p className="text-[15px] text-ink-2">{copy.company.noQuarters}</p>}
        </section>

        {/* 5a · balance sheet, cash flow, segment mix (annual and half-year XBRL filings) */}
        {statements && (
          <section aria-labelledby="statements" className="mt-6">
            <h2 id="statements" className="mb-2 text-[13px] font-medium text-ink-2">{copy.statements.title}</h2>
            <Statements v={statements} />
          </section>
        )}

        {/* 5b · price over the snapshot year, with FINN's dated events */}
        {prices && (
          <section aria-labelledby="price" className="mt-6">
            <h2 id="price" className="mb-1 text-[13px] font-medium text-ink-2">{copy.price.title}</h2>
            <PriceChart s={prices} />
          </section>
        )}

        {/* 6 · next question and people */}
        {c.nextQuestion && (
          <section aria-labelledby="next" className="mt-6">
            <h2 id="next" className="mb-2 text-[13px] font-medium text-ink-2">{copy.company.nextQuestion}</h2>
            <NextQuestion text={c.nextQuestion.text} symbol={c.symbol} eventId={eventId} asOf={SNAPSHOT_AS_OF} />
            <LinksNote symbol={c.symbol} />
          </section>
        )}

        {/* 7 · bull vs bear */}
        {c.quarters.length > 0 && (
          <section aria-labelledby="bullbear" className="mt-6">
            <h2 id="bullbear" className="mb-2 text-[13px] font-medium text-ink-2">{copy.bullBear.title}</h2>
            <BullBear symbol={c.symbol} />
          </section>
        )}

        {/* 7b · a cited question about this company */}
        {c.quarters.length > 0 && (
          <section aria-labelledby="question" className="mt-6">
            <h2 id="question" className="mb-2 text-[13px] font-medium text-ink-2">{copy.question.title}</h2>
            <CompanyQuestion symbol={c.symbol} name={shortName(c.name)} />
          </section>
        )}

        {/* 8 · recent filings */}
        {c.recentFilings.length > 0 && (
          <section aria-labelledby="filings" className="mt-6">
            <h2 id="filings" className="text-[13px] font-medium text-ink-2">{copy.company.recentFilings}</h2>
            <ul className="mt-1 divide-y divide-line">
              {important.map((f) => (
                <li key={f.id} className="flex min-w-0 items-center gap-2 py-1">
                  <span className={`shrink-0 rounded-full px-2 text-[11px] font-medium leading-5 ${
                    f.tier === "needs_you" ? "bg-accent/10 text-accent" : "bg-line/60 text-ink-2"}`}>{copy.tier[f.tier]}</span>
                  {f.source.documentId
                    ? <span className="min-w-0 flex-1 truncate"><SourceLink s={{ ...f.source, label: f.headline ?? f.title }} refDate={SNAPSHOT_AS_OF} oneLine /></span>
                    : <p className="min-w-0 flex-1 truncate text-[15px]">{f.headline ?? f.title}</p>}
                </li>
              ))}
            </ul>
            {routine.length > 0 && (
              <details className="mt-2 rounded-[8px] border border-line">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13px] font-medium text-ink-2">{copy.company.routine(routine.length)}</summary>
                <ul className="px-3 pb-2">
                  {routine.map((f) => (
                    <li key={f.id} className="min-w-0">
                      {f.source.documentId ? <SourceLink s={{ ...f.source, label: f.title }} refDate={SNAPSHOT_AS_OF} />
                        : <p className="text-[13px]">{f.title}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}
      </div>
    </article>
  );
}

function ThesisRow({ title, items, empty }: { title: string; items: ThesisItem[]; empty: string }) {
  return (
    <div className="mt-2">
      <h3 className="text-[13px] text-ink-3">{title}</h3>
      {items.length === 0 ? <p className="mt-1 text-[15px] text-ink-2">{empty}</p> : (
        <ul className="mt-1 space-y-2">
          {items.map((i) => (
            <li key={i.ref.id} className="rounded-[12px] border border-line bg-surface p-3">
              <div className="flex items-start gap-2">
                <StatusPill status={i.status} />
                <p className="min-w-0 text-[15px] leading-[22px]">
                  {i.ref.text}
                  {i.ref.deadline && <span className="text-ink-3"> · {copy.card.by} {period(i.ref.deadline)}</span>}
                </p>
              </div>
              {i.claim ? <div className="mt-2"><BulletChart claim={i.claim} label={i.ref.text} /></div>
                : i.evidence && <p className="mt-1 text-[13px] text-ink-2">{i.evidence}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Where supplier/customer links come from, or that there are none: never an invented link. */
function LinksNote({ symbol }: { symbol: string }) {
  const r = (rptLinks as unknown as Record<string, { source: string; filed: string; suppliers: unknown[]; customers: unknown[] }>)[symbol];
  if (!r) return <p className="mt-2 text-[12px] leading-4 text-ink-3">{copy.links.none}</p>;
  return (
    <div className="mt-2 text-[12px] leading-4 text-ink-3">
      <p>{copy.links.sourced(r.suppliers.length, r.customers.length)}</p>
      <SourceLink s={{ documentId: r.source, label: copy.links.filing(symbol), publishedAt: r.filed }} oneLine />
    </div>
  );
}
