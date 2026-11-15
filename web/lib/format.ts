// All number and date formatting (FRONTEND.md §4.4). Components never format numbers themselves.
// No clock reads: "this year" is judged against a reference date the caller passes (the replay as-of).

const MINUS = "−"; // true minus sign reads better than a hyphen in tables
const IST = "Asia/Kolkata";

function sign(n: number, s: string): string {
  return n > 0 ? `+${s}` : n < 0 ? `${MINUS}${s}` : s;
}

/** ₹ crore, Indian grouping; 1 decimal under 1,000 cr, none above. ₹2,628.5 cr · ₹14,492 cr */
export function inrCr(v: number): string {
  const abs = Math.abs(v);
  const s = abs.toLocaleString("en-IN", { maximumFractionDigits: abs >= 1000 ? 0 : 1, minimumFractionDigits: abs >= 1000 ? 0 : 1 });
  return `${v < 0 ? MINUS : ""}₹${s} cr`;
}

/** A share price: rupees with paise, Indian grouping. ₹169.20 · ₹1,823.20 */
export function inr(v: number): string {
  return `${v < 0 ? MINUS : ""}₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Percent with 1 decimal. Signed for growth, unsigned for levels like a margin. */
export function pct(v: number, signed = true): string {
  const s = `${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return signed ? sign(v, s) : `${v < 0 ? MINUS : ""}${s}`;
}

/** Basis points, signed, Indian grouping. −180 bps */
export function bps(v: number): string {
  return sign(v, `${Math.abs(Math.round(v)).toLocaleString("en-IN")} bps`);
}

/** Ratio alerts. 2.6× */
export function ratio(v: number): string {
  return `${v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`;
}

export function count(v: number): string {
  return Math.round(v).toLocaleString("en-IN");
}

/** "Q2FY27" → "Q2 FY27", "FY27" stays, "H2FY27" → "H2 FY27". */
export function period(p: string): string {
  return p.replace(/^([QH]\d)(FY\d{2})$/, "$1 $2");
}

/** "14 Nov" within the reference year, "14 Nov 2025" otherwise; IST. */
export function date(iso: string, ref?: string | Date): string {
  const d = new Date(iso);
  const refYear = ref ? new Date(ref).toLocaleString("en-IN", { timeZone: IST, year: "numeric" }) : null;
  const y = d.toLocaleString("en-IN", { timeZone: IST, year: "numeric" });
  return d.toLocaleDateString("en-IN", {
    timeZone: IST, day: "numeric", month: "short", ...(refYear === y ? {} : { year: "numeric" }),
  });
}

/** "18:42" IST */
export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Display text for a NumValue-like input. Growth % is signed unless `signed` is false. */
export function formatValue(kind: "inr_cr" | "inr" | "pct" | "bps" | "ratio" | "count", value: number, signed = true): string {
  switch (kind) {
    case "inr_cr": return inrCr(value);
    case "inr": return inr(value);
    case "pct": return pct(value, signed);
    case "bps": return bps(value);
    case "ratio": return ratio(value);
    case "count": return count(value);
  }
}

/** Words for screen readers: "2,628.5 crore rupees", "up 12.4 percent". */
export function spoken(kind: "inr_cr" | "inr" | "pct" | "bps" | "ratio" | "count", value: number, signed = true): string {
  const a = Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 1 });
  const dir = !signed ? "" : value > 0 ? "up " : value < 0 ? "down " : "";
  switch (kind) {
    case "inr_cr": return `${value < 0 ? "minus " : ""}${a} crore rupees`;
    case "inr": return `${value < 0 ? "minus " : ""}${Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} rupees`;
    case "pct": return `${dir}${a} percent`;
    case "bps": return `${dir}${a} basis points`;
    case "ratio": return `${a} times`;
    case "count": return a;
  }
}
