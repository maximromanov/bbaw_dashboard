# BBAW Dashboard

Static dashboard for the BBAW Akademie proposal "Invisible Authorship 
in the Global Arabic Written Tradition." Three-layer architecture, 
deployable to GitHub Pages, no backend.

## Architecture

Single-page app, top to bottom:

1. **Summary stats + cost calculator** — proposal-defense instrument.
   Headline corpus numbers, then sliders for OCR/LLM costs, FTE-hours
   per 1k pages, etc., with live recalculation of total Phase 1 budget.

2. **Preliminary clusters** — pie/bar charts of discipline distribution.
   Use the `discipline_normalized` field (14 buckets). Show ACO and 
   ShamelaAY side-by-side; "(مختلط)" buckets are intentionally visible 
   as the argument for L2 typology modeling.

3. **Searchable metadata table** — full-text search over ~30k records.
   Use Lunr.js or MiniSearch from CDN, no backend.

## Data

`data/corpus_merged.json` — single JSON array, 29,908 records.

Each record has these key fields (full schema in `corpus_merged_summary.txt`):
- `record_id`, `source` (`aco` | `shamela_ay` | `personal_other`)
- `title`, `author`, `publisher`, `pub_year`, `pub_place`
- `discipline_native` (raw label) and `discipline_normalized` (14-bucket)
- `pages`, `mb`, `language`, `provider`
- `permanent_link` (handle.net URL for ACO records)
- `work_id` for grouping multi-volume sets

Headline numbers (drop these into Layer 1 by default):
- 29,908 records (17,790 ACO + 11,578 ShamelaAY + 540 personal_other)
- ~17,000 unique works
- 10.8 million pages
- 90 GB known file sizes

## Tech stack — strict

- **Pure static HTML/CSS/JS.** No backend, no server-side rendering.
- **No build system.** No npm, no webpack, no vite. Libraries via CDN.
- **Chart library**: Chart.js (from CDN) — lightweight, good defaults.
- **Search library**: MiniSearch or Lunr.js (from CDN).
- **Deploy target**: GitHub Pages via `gh-pages` branch.
- **Browser support**: modern browsers only (Chrome/Firefox/Safari current).

## Audience

This is for BBAW Akademie reviewers and panel members — not for me. 
Optimize for their experience: serious tone, clean visuals, exportable 
budget summary, no clever interactivity for its own sake. Compare to:
https://sbb-majmus-corpus.netlify.app/

## Don't

- Don't add a backend "to make it more flexible." Plain static is the deliverable.
- Don't introduce npm/webpack/vite unless I explicitly say so.
- Don't add user accounts, persistence, or any "saving" features.
- Don't pretty-print the JSON in code; the file is already non-indented.

## Build order

Build Layer 1 first (calculator + summary stats — one Claude Code session).
Layer 3 (search) next — mechanical, one session.
Layer 2 (clusters) last — fastest to build but lowest priority.

## RTL / Arabic rendering

Most labels are in Arabic. Use `dir="rtl"` on Arabic-containing elements 
where appropriate. Chart labels and table cells with Arabic text need to 
render right-to-left. Numbers stay LTR.