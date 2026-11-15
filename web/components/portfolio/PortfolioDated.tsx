"use client";

import { useSearchParams } from "next/navigation";
import PortfolioView from "@/components/portfolio/PortfolioView";
import type { PortfolioRow } from "@/lib/types";

/** Reads Today's date from the URL so "Needs you" here matches the brief the investor is looking at. */
export default function PortfolioDated({ rows, refDate, needsByDay, movesSince }: {
  rows: PortfolioRow[]; refDate: string; needsByDay: Record<string, string[]>; movesSince: string;
}) {
  const asked = useSearchParams().get("date");
  const days = Object.keys(needsByDay).sort();
  const day = asked && needsByDay[asked] ? asked : days[days.length - 1];
  return <PortfolioView rows={rows} refDate={refDate} needs={needsByDay[day] ?? []} movesSince={movesSince} />;
}
