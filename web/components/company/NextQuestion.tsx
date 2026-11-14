"use client";

import { useEffect, useState } from "react";
import PersonChip from "@/components/people/PersonChip";
import { copy } from "@/lib/copy";
import { suggestionsFor, toPersonRef } from "@/lib/people";
import type { PersonRef } from "@/lib/types";
import { loadNetwork } from "@/lib/vault";

/** The question worth asking next, and up to two people from your own network who could answer it. */
export default function NextQuestion({ text, symbol, eventId, asOf }: {
  text: string; symbol: string; eventId?: string; asOf: string;
}) {
  const [people, setPeople] = useState<PersonRef[] | null>(null);
  useEffect(() => {
    let live = true;
    loadNetwork()
      .then((c) => { if (live) setPeople(suggestionsFor(symbol, eventId ?? `${symbol}-company`, c, asOf).slice(0, 2).map(toPersonRef)); })
      .catch(() => { if (live) setPeople([]); });
    return () => { live = false; };
  }, [symbol, eventId, asOf]);

  return (
    <div className="rounded-[12px] border border-line bg-surface p-4">
      <p className="text-[15px] leading-[22px]"><span className="font-medium text-accent">{copy.card.ask} </span>{text}</p>
      <div className="mt-2 space-y-1">
        {people === null && <p className="text-[13px] text-ink-3">{copy.company.findingPeople}</p>}
        {people?.length === 0 && <p className="text-[13px] text-ink-3">{copy.company.noPeople}</p>}
        {eventId && people?.map((p) => <PersonChip key={p.contactId} person={p} eventId={eventId} />)}
      </div>
    </div>
  );
}
