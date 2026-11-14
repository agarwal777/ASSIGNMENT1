"use client";

import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import Sheet from "@/components/shell/Sheet";
import EpistemicTag from "@/components/trust/EpistemicTag";
import { copy } from "@/lib/copy";
import { date } from "@/lib/format";
import { useSheetNav } from "@/lib/sheet";

/**
 * Renders whichever sheet the URL names (?sheet=source|formula). Mounted once in the shell inside
 * <Suspense>, because reading search params makes this subtree client-rendered (Next 16).
 * Call and quote sheets register here in later blocks.
 */
export default function SheetHost() {
  const q = useSearchParams();
  const { close } = useSheetNav();
  const sheet = q.get("sheet");
  const doc = q.get("doc") ?? "";
  const label = q.get("label") ?? copy.sheet.untitledSource;
  const at = q.get("at");
  const page = q.get("page");
  const isUrl = /^https?:\/\//.test(doc);

  return (
    <>
      <Sheet open={sheet === "source"} onClose={close} kicker={copy.sheet.sourceKicker} title={label}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          {at && (<><dt className="text-ink-3">{copy.sheet.filed}</dt><dd>{date(at)}</dd></>)}
          {page && (<><dt className="text-ink-3">{copy.sheet.page}</dt><dd>{page}</dd></>)}
        </dl>
        <p className="mt-3 rounded-[8px] bg-bg p-3 text-[13px] text-ink-2">{copy.sheet.noExcerpt}</p>
        {isUrl && (
          <a href={doc} target="_blank" rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line px-3 text-[15px] font-medium">
            <ExternalLink size={16} aria-hidden /> {copy.sheet.openOriginal}
          </a>
        )}
      </Sheet>

      <Sheet open={sheet === "formula"} onClose={close} kicker={copy.sheet.formulaKicker} title={copy.sheet.formulaTitle}>
        <p className="rounded-[8px] bg-bg p-3 text-[15px]">{q.get("text")}</p>
        <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-2">
          <EpistemicTag e="CALCULATED" /> {copy.sheet.formulaNote}
        </p>
        {isUrl && (
          <a href={doc} target="_blank" rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-[13px] font-medium underline">
            <ExternalLink size={14} aria-hidden /> {label}{at ? ` · ${date(at)}` : ""}
          </a>
        )}
      </Sheet>
    </>
  );
}
