import PathLine from "@/components/people/PathLine";
import PersonChip from "@/components/people/PersonChip";
import StintList from "@/components/people/StintList";
import MetricTable from "@/components/today/MetricTable";
import PromiseCheckLine from "@/components/today/PromiseCheckLine";
import StanceBadge from "@/components/today/StanceBadge";
import VolumeStrip from "@/components/today/VolumeStrip";
import EpistemicTag from "@/components/trust/EpistemicTag";
import Num from "@/components/trust/Num";
import { SourceLink } from "@/components/trust/SourceLink";
import { copy } from "@/lib/copy";
import { date, time } from "@/lib/format";
import type { Card, Epistemic } from "@/lib/types";

/**
 * One card, one fixed order (FRONTEND.md §5.1): meta · verdict · evidence · assumption · divider ·
 * person · question · sources. Slots without data are left out, never shown empty.
 */
export default function EventCard({ card, refDate }: { card: Card; refDate?: string }) {
  return (
    <article aria-labelledby={`${card.id}-h`} className="rounded-[12px] border border-line bg-surface p-4">
      {/* 1 · meta */}
      <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-ink-3">
        <span className="text-ink">{card.companyName}</span>
        <span aria-hidden>·</span>
        <span>{copy.category[card.category] ?? card.category}</span>
        <span aria-hidden>·</span>
        <time dateTime={card.at}>{date(card.at, refDate)}, {time(card.at)}</time>
      </p>

      {/* 2 · verdict */}
      <h3 id={`${card.id}-h`} className="mt-1 font-serif text-[19px] font-medium leading-[26px]">{card.headline}</h3>

      {/* 3 · evidence */}
      <Evidence card={card} refDate={refDate} />

      {/* 4 · assumption */}
      {card.assumption && (
        <div className="mt-3 flex items-start gap-2">
          <StanceBadge stance={card.assumption.stance} />
          <p className="text-[15px] leading-[22px]">
            {card.assumption.ref.text}
            {card.assumption.ref.deadline && <span className="text-ink-3"> · {copy.card.by} {card.assumption.ref.deadline}</span>}
            {card.assumption.rationale && <span className="block text-[13px] text-ink-2">{card.assumption.rationale}</span>}
          </p>
        </div>
      )}

      {(card.person || card.question) && <hr className="my-3 border-line" />}

      {/* 6 · person: tap for the call sheet */}
      {card.person && <PersonChip person={card.person} eventId={card.id} />}

      {/* 7 · question */}
      {card.question && (
        <p className="mt-2 text-[15px] leading-[22px]"><span className="font-medium text-accent">{copy.card.ask} </span>{card.question}</p>
      )}

      {/* 8 · sources */}
      <footer className="mt-2 flex flex-wrap items-center gap-x-3">
        {card.sources.map((s) => <SourceLink key={s.documentId} s={s} refDate={refDate} />)}
        {card.sources.length === 0 && <span className="py-3 text-[13px] text-ink-3">{copy.card.priceSource}</span>}
        <EpistemicTag e={footerTag(card)} />
      </footer>
    </article>
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
      return (
        <>
          <MetricTable metrics={card.metrics} exceptional={card.exceptional} />
          {card.promiseCheck && <PromiseCheckLine check={card.promiseCheck} />}
        </>
      );
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
          <div className="grid grid-cols-2 gap-2">
            {card.volumeRatio && (
              <div className="rounded-[8px] bg-bg px-3 py-2">
                <p className="text-[13px] text-ink-3">{copy.card.volumeVsAvg}</p>
                <Num v={card.volumeRatio} className="text-[19px] font-medium" />
              </div>
            )}
            {card.priceChange && (
              <div className="rounded-[8px] bg-bg px-3 py-2">
                <p className="text-[13px] text-ink-3">{copy.card.priceChange}</p>
                <Num v={card.priceChange} className="text-[19px] font-medium" />
              </div>
            )}
          </div>
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
