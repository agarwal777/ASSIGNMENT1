# BSE vs NSE: a one-week spot-check (15 Nov 2026)

**Why:** FINN reads corporate announcements from NSE only. BSE's announcements API refuses scripted
requests (HTTP 403 "Access Denied" from its Akamai edge), and BSE's data products are paid, so FINN does
not fetch BSE. The working assumption is that a company listed on both exchanges files the same
disclosures with each. This check tests that assumption on three portfolio companies.

**How:** BSE's public "Corporate Announcements" page for each company, viewed in a browser (manual
viewing; no scripted access), for 6–12 November 2026, compared with the NSE rows FINN fetched
(`seed/filings/recent.json`) for the same companies and dates.

| Company (BSE code) | BSE announcements | NSE rows | BSE items with an NSE counterpart | BSE-only |
|---|---|---|---|---|
| Voltas (500575) | 9 | 13 | 9 / 9 | 0 |
| Lupin (500257) | 2 | 2 | 2 / 2 | 0 |
| Tata Power (500400) | 12 | 11 | 12 / 12 | 0 |
| **Total** | **23** | **26** | **23 / 23** | **0** |

Matching is by subject and time; each pair was filed within a few minutes, usually the same minute.

- **Voltas:** NSE has more rows because it files one row per attachment. Its 6 Nov board outcome is 3 rows,
  the appointments 3 and the retirements 2; BSE groups each as one announcement.
- **Tata Power:** BSE has one more row because it lists the 11 Nov results and the board-meeting outcome
  separately; NSE files them as one "Outcome of Board Meeting" row.

Pairs, for the record:
- **Voltas:** board outcome, results, change in directorate (appointments), retirement, auditor
  appointment, press release, investor presentation, call recording (6 Nov); transcript (12 Nov).
- **Lupin:** call transcript (6 Nov); press release on the European launch of biosimilar ranibizumab (12 Nov).
- **Tata Power:** Reg. 30 disclosure (7 Nov); investor-meet intimation, ESOP allotment, results, board
  outcome, investor presentation, press release, capacity addition, change in management, Reg. 30(5)
  disclosure, investor-meet outcome (11 Nov); newspaper publication (12 Nov).

**Conclusion (limited):** for these three dual-listed companies over one busy results week, NSE carried
every disclosure BSE did. This is a sample of 3 companies and 1 week, not proof for every company, and a
company listed only on BSE would need BSE. FINN's filings keep `source_exchange` and a `dedupe_key`
(company + IST day + normalised subject) on every event, so a licensed BSE feed could be added later as a
data change: same key, keep one.
