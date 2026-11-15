"use client";

import { ChevronRight, UserRound } from "lucide-react";
import { ProbableBadge } from "@/components/people/PathLine";
import { copy } from "@/lib/copy";
import { useSheetNav } from "@/lib/sheet";
import type { PersonRef } from "@/lib/types";

/** One person and why; tap opens their call sheet (URL-synced, back closes it). */
export default function PersonChip({ person, eventId, about, asOf }: { person: PersonRef; eventId?: string; about?: string; asOf?: string }) {
  const { open } = useSheetNav();
  // With an event: questions about that event. Without one (a company with no filing in the snapshot):
  // the call sheet about the company itself.
  return (
    <button type="button" onClick={() => open("call", eventId ? { event: eventId, contact: person.contactId }
      : { contact: person.contactId, about, at: asOf })}
      aria-label={copy.people.openCallSheet(person.displayName)}
      className="flex min-h-11 w-full items-center gap-3 rounded-[8px] text-left">
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <UserRound size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-[15px] font-medium">{person.displayName}</span>
        {!person.confirmed && <> <ProbableBadge /></>}
        <span className="block text-[13px] leading-[18px] text-ink-2">{person.reason}</span>
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-3" />
    </button>
  );
}
