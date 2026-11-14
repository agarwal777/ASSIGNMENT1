"use client";

import { Drawer } from "vaul";
import { X } from "lucide-react";
import { copy } from "@/lib/copy";

/** Bottom sheet on vaul: scrim, focus trap, drag-to-close, labelled title. Close = URL change. */
export default function Sheet({ open, onClose, title, kicker, children }: {
  open: boolean; onClose: () => void; title: string; kicker?: string; children: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/35" />
        <Drawer.Content aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-[480px] flex-col rounded-t-[12px] bg-surface shadow-[0_-8px_30px_rgba(0,0,0,0.18)] outline-none">
          <Drawer.Handle className="mx-auto mt-2 !h-1 !w-10 rounded-full !bg-line" />
          <div className="flex items-start justify-between gap-3 px-4 pt-3">
            <div className="min-w-0">
              {kicker && <p className="text-[13px] font-medium text-ink-3">{kicker}</p>}
              <Drawer.Title className="font-serif text-[19px] leading-[26px]">{title}</Drawer.Title>
            </div>
            <button onClick={onClose} aria-label={copy.sheet.close}
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2">
              <X size={20} aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
