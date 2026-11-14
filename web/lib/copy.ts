// All user-facing strings (FRONTEND.md §14): plain words, sentence case, verdict first, no hype.
// Components import from here so tone can be reviewed in one place.

export const copy = {
  nav: { today: "Today", portfolio: "Portfolio", ask: "Ask" },
  today: {
    title: "Today",
    done: "That's everything that matters today.",
  },
  portfolio: {
    title: "Portfolio",
    empty: "Your portfolio will appear here.",
    syntheticNote: "Network and portfolio are synthetic demo data.",
  },
  ask: {
    title: "Ask",
    empty: "Search any NSE company to see its promises, its numbers and who you know there.",
  },
  sheet: {
    close: "Close",
    sourceKicker: "Source",
    untitledSource: "Source document",
    filed: "Filed",
    page: "Page",
    noExcerpt: "Source excerpt not available here. Open the original filing to read it.",
    openOriginal: "Open original",
    formulaKicker: "How this is calculated",
    formulaTitle: "Formula",
    formulaNote: "FINN computed this from the reported numbers. No model touched it.",
  },
  epistemic: {
    SAID: { label: "Said", hint: "Verbatim from a primary source" },
    EXTRACTED: { label: "Extracted", hint: "Structured by a model from a cited source" },
    CALCULATED: { label: "Calculated", hint: "Computed by FINN from reported numbers" },
    INFERRED: { label: "FINN's read", hint: "An interpretation of cited evidence" },
    UNKNOWN: { label: "Unknown", hint: "Not determinable from primary data" },
  },
  stance: {
    supports: "Supports",
    contradicts: "Contradicts",
    neutral: "Neutral",
    insufficient: "Not enough evidence",
  },
  dev: {
    title: "Components",
    note: "Fictional fixtures for review. Not shown to users.",
  },
  comingNext: "This screen is being built next.",
} as const;
