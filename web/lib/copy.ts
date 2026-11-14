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
  comingNext: "This screen is being built next.",
} as const;
