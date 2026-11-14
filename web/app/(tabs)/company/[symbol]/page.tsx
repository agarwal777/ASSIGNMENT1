import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import LedgerTimeline from "@/components/company/LedgerTimeline";
import NextQuestion from "@/components/company/NextQuestion";
import SnapshotTable from "@/components/company/SnapshotTable";
import BulletChart from "@/components/trust/BulletChart";
import StatusPill from "@/components/trust/StatusPill";
import Num from "@/components/trust/Num";
import { SourceLink } from "@/components/trust/SourceLink";
import { shortName, SNAPSHOT_AS_OF, companySymbols, getCompany, hasLedgerData } from "@/lib/companies";
import { copy } from "@/lib/copy";
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
              ₹<Num v={c.price.close} /> <Num v={c.price.dayChange} /> <span className="text-ink-3">· {date(`${c.price.asOf}T15:30:00+05:30`, SNAPSHOT_AS_OF)}</span>
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
          <ThesisRow title={copy.company.yourAssumptions} items={c.thesis.investor} empty={copy.company.noAssumptions} demo />
        </section>

        {/* 4 · promised vs delivered */}
        <section aria-labelledby="ledger" className="mt-6">
          <h2 id="ledger" className="scroll-mt-16 text-[13px] font-medium text-ink-2">{copy.company.ledger}</h2>
          {c.ledger.length > 0
            ? <div className="mt-2"><LedgerTimeline promises={c.ledger} asOf={SNAPSHOT_AS_OF} /></div>
            : <p className="mt-2 text-[15px] leading-[22px] text-ink-2">{hasLedgerData(c.symbol) ? copy.company.noPromises
              : c.transcripts?.since ? copy.company.transcriptsOffline(shortName(c.name), c.transcripts.count, date(`${c.transcripts.since}T12:00:00+05:30`))
              : copy.company.noTranscripts}</p>}
        </section>

        {/* 5 · snapshot */}
        <section aria-labelledby="snapshot" className="mt-6">
          <h2 id="snapshot" className="mb-1 text-[13px] font-medium text-ink-2">{copy.company.snapshot(c.quarters.length)}</h2>
          {c.quarters.length > 0 ? <SnapshotTable rows={c.quarters} /> : <p className="text-[15px] text-ink-2">{copy.company.noQuarters}</p>}
        </section>

        {/* 6 · next question and people */}
        {c.nextQuestion && (
          <section aria-labelledby="next" className="mt-6">
            <h2 id="next" className="mb-2 text-[13px] font-medium text-ink-2">{copy.company.nextQuestion}</h2>
            <NextQuestion text={c.nextQuestion.text} symbol={c.symbol} eventId={eventId} asOf={SNAPSHOT_AS_OF} />
          </section>
        )}

        {/* 8 · recent filings (bull vs bear, slot 7, arrives with the Pull block) */}
        {c.recentFilings.length > 0 && (
          <section aria-labelledby="filings" className="mt-6">
            <h2 id="filings" className="text-[13px] font-medium text-ink-2">{copy.company.recentFilings}</h2>
            <ul className="mt-1 divide-y divide-line">
              {c.recentFilings.map((f) => (
                <li key={f.id} className="py-1">
                  <p className="text-[13px] text-ink-3">{copy.tier[f.tier]} · {date(f.at, SNAPSHOT_AS_OF)}</p>
                  {f.source.documentId ? <SourceLink s={{ ...f.source, label: f.title }} refDate={SNAPSHOT_AS_OF} />
                    : <p className="text-[15px]">{f.title}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}

function ThesisRow({ title, items, empty, demo }: { title: string; items: ThesisItem[]; empty: string; demo?: boolean }) {
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
              {demo && <p className="mt-1 text-[11px] text-ink-3">{copy.company.demoAssumption}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
