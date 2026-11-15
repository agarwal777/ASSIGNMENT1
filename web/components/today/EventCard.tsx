import Link from "next/link";
import PathLine from "@/components/people/PathLine";
import PersonChip from "@/components/people/PersonChip";
import StintList from "@/components/people/StintList";
import MetricTable from "@/components/today/MetricTable";
import StatTiles from "@/components/today/StatTiles";
import TrendChart from "@/components/today/TrendChart";
import VolumeStrip from "@/components/today/VolumeStrip";
import BulletChart from "@/components/trust/BulletChart";
import EpistemicTag from "@/components/trust/EpistemicTag";
import { SourceLink } from "@/components/trust/SourceLink";
import StatusPill from "@/components/trust/StatusPill";
import { copy } from "@/lib/copy";
import { date, time } from "@/lib/format";
import { statusFromStance, type Status } from "@/lib/status";
import type { Card, Claim, Epistemic, PromiseCheck, SourceRef } from "@/lib/types";

/**
 * One card, one fixed order: meta · verdict · lead stats · trend · claims (bullet charts) · evidence ·
 * "All numbers" · person · question · sources + review. Slots without data are left out, never shown empty.
 */
export default function EventCard({ card, refDate, networkLoaded = false, reviewed = false, onReviewed }: {
  card: Card; refDate?: string; networkLoaded?: boolean; reviewed?: boolean; onReviewed?: () => void;
}) {
  const guidance = card.variant === "results" && card.promiseCheck && card.promiseCheck.promiseId !== card.assumption?.ref.id
    ? guidanceClaim(card.promiseCheck, card.period) : null;
  return (
    <article aria-labelledby={`${card.id}-h`}
      className={`rounded-[12px] border border-line bg-surface p-4 transition-opacity ${reviewed ? "opacity-55" : ""}`}>
      {/* 1 · meta */}
      <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-ink-3">
        <Link href={`/company/${encodeURIComponent(card.companySymbol)}`}
          className="-my-3 inline-flex min-h-11 items-center text-ink underline decoration-line underline-offset-4">{card.companyName}</Link>
        <span aria-hidden>·</span>
        <span>{copy.category[card.category] ?? card.category}</span>
        <span aria-hidden>·</span>
        <time dateTime={card.at}>{date(card.at, refDate)}, {time(card.at)}</time>
      </p>

      {/* 2 · verdict */}
      <h3 id={`${card.id}-h`} className="mt-1 font-serif text-[19px] font-medium leading-[26px]">{card.headline}</h3>
      {/* An Alert setting (Settings) put this card here: say so, so the ranking is never a mystery. */}
      {card.reasons.filter((r) => r.startsWith("you asked to be alerted")).map((r) => (
        <p key={r} className="mt-0.5 text-[13px] font-medium text-accent">{r[0].toUpperCase() + r.slice(1)}</p>
      ))}

      {/* 3 · lead stats, trend */}
      {card.tiles && <StatTiles tiles={card.tiles} />}
      {card.trend && <TrendChart trend={card.trend} />}

      {/* 4 · claims */}
      {card.assumption && (
        <ClaimBlock status={card.assumption.status ?? statusFromStance(card.assumption.stance)} text={card.assumption.ref.text}
          deadline={card.assumption.ref.deadline} claim={card.assumption.claim} rationale={card.assumption.rationale}
          edited={card.assumption.edited} />
      )}
      {guidance && card.variant === "results" && (
        <ClaimBlock status={guidance.claim.status} text={guidance.text} deadline={guidance.claim.deadline} claim={guidance.claim}
          source={card.promiseCheck?.quote} refDate={refDate} />
      )}

      {/* 5 · evidence that isn't a number */}
      <Evidence card={card} refDate={refDate} />

      {/* 6 · every number, with its source */}
      {card.variant === "results" && (
        <details className="mt-3 rounded-[8px] border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13px] font-medium text-ink-2">{copy.card.allNumbers}</summary>
          <div className="px-3 pb-2">
            <MetricTable metrics={card.metrics} exceptional={card.exceptional} />
            {card.metrics[0]?.value.source && <SourceLink s={card.metrics[0].value.source} refDate={refDate} />}
          </div>
        </details>
      )}

      <hr className="my-3 border-line" />

      {/* 7 · person */}
      {card.person ? <PersonChip person={card.person} eventId={card.id} />
        : networkLoaded && <p className="text-[13px] text-ink-2">{copy.card.noPerson(shortCompany(card.companyName))}</p>}

      {/* 8 · question */}
      {card.question && (
        <p className="mt-2 text-[15px] leading-[22px]"><span className="font-medium text-accent">{copy.card.ask} </span>{card.question}</p>
      )}

      {/* 9 · sources, review */}
      <footer className="mt-2 flex flex-wrap items-center gap-x-3">
        {card.sources.map((s) => <SourceLink key={s.documentId} s={s} refDate={refDate} />)}
        {card.sources.length === 0 && <span className="py-3 text-[13px] text-ink-3">{copy.card.priceSource}</span>}
        <EpistemicTag e={footerTag(card)} />
      </footer>
      {onReviewed && (
        <button type="button" onClick={onReviewed} aria-pressed={reviewed}
          aria-label={reviewed ? copy.card.undoReviewed : copy.card.markReviewed}
          className={`mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[8px] border text-[15px] font-medium ${
            reviewed ? "border-line text-ink-2" : "border-accent text-accent"}`}>
          {reviewed ? `✓ ${copy.card.reviewed}` : copy.card.markReviewed}
        </button>
      )}
    </article>
  );
}

const shortCompany = (n: string) => n.replace(/\s+(Limited|Ltd\.?)$/i, "");

/** Management's guidance for this year as a claim. Before Q4 it can only be on track or behind. */
function guidanceClaim(pc: PromiseCheck, period: string): { text: string; claim: Claim } {
  const floor = pc.guidedHigh === pc.guidedLow;
  const a = pc.actual.value;
  const inside = floor ? a >= pc.guidedLow : a >= pc.guidedLow && a <= pc.guidedHigh;
  const q = Number(period.match(/^Q([1-4])/)?.[1] ?? 0);
  const status: Status = q === 4 ? (inside ? "met" : "missed") : inside ? "on_track" : "behind";
  const t = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return {
    text: `${copy.card.guidedBy} EBITDA margin ${floor ? `at least ${t(pc.guidedLow)}%` : `${t(pc.guidedLow)}–${t(pc.guidedHigh)}%`}`,
    claim: { metric: "ebitda_margin", unit: "pct", deadline: period.slice(-4), status, target: pc.guidedLow,
      targetHigh: floor ? undefined : pc.guidedHigh, actual: a, quartersReported: q || undefined, quartersTotal: 4 },
  };
}

function ClaimBlock({ status, text, deadline, claim, rationale, source, refDate, edited }: {
  status: Status; text: string; deadline?: string; claim?: Claim; rationale?: string; source?: SourceRef; refDate?: string; edited?: boolean;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-start gap-2">
        <StatusPill status={status} />
        <p className="min-w-0 text-[15px] leading-[22px]">
          {text}{deadline && <span className="text-ink-3"> · {copy.card.by} {deadline}</span>}
          {edited && <span className="text-ink-3"> · {copy.card.editedByYou}</span>}
        </p>
      </div>
      {claim ? <div className="mt-2"><BulletChart claim={claim} label={text} /></div>
        : rationale && <p className="mt-1 text-[13px] text-ink-2">{rationale}</p>}
      {source && <SourceLink s={source} refDate={refDate} />}
    </div>
  );
}

function footerTag(card: Card): Epistemic {
  switch (card.variant) {
    case "results": return "CALCULATED";
    case "management_change": return card.profileQuote ? "SAID" : "EXTRACTED";
    case "anomaly": return "CALCULATED";
    case "material": return "EXTRACTED";
  }
}

function Evidence({ card, refDate }: { card: Card; refDate?: string }) {
  switch (card.variant) {
    case "results":
      return null;
    case "management_change":
      return (
        <div className="mt-2">
          <p className="text-[15px]">
            <span className="font-medium">{card.personName}</span>
            <span className="text-ink-2"> · {card.role} · {copy.card.effective} {date(card.effective, refDate)}</span>
          </p>
          {card.profileQuote && (
            <blockquote className="mt-2 border-l-2 border-line pl-3 text-[15px] italic leading-[22px] text-ink-2">
              “{card.profileQuote}” <EpistemicTag e="SAID" className="not-italic" />
            </blockquote>
          )}
          <StintList stints={card.stints} />
          {card.path && <PathLine {...card.path} />}
        </div>
      );
    case "anomaly":
      return (
        <div className="mt-3">
          <VolumeStrip values={card.volume30d} />
          <p className="mt-2 text-[13px] text-ink-2">{copy.card.noFiling(card.noFilingHours)}</p>
        </div>
      );
    case "material":
      return (
        <div className="mt-2">
          <p className="text-[15px] leading-[22px]">{card.summary} <EpistemicTag e="EXTRACTED" /></p>
          {card.fields && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              {Object.entries(card.fields).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-ink-3">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          )}
        </div>
      );
  }
}
