# AgroMind — Interface Design

An **academic research tool**: clean white page, navy and green accents, serif headings, dense bordered tables, numbers up front. It is inspired by university/ICAR research pages but is **not** a government-portal replica. No tricolour, emblem, ticker, breadcrumbs, visitor counter or portal boilerplate.

## Hard rules

- The site never claims to be an official Government of India service. The one-line footer and the About disclaimer say so.
- University, department, programme, team (name, roll no.), supervisor and contact live only in `SITE` at the top of `src/App.jsx`; `AUTHORS` (students, then the supervisor) feeds the Paper page and BibTeX. No university logo or emblem.
- No shadows, gradients or rounded cards. Structure comes from 1px rules (`--rule`) and whitespace.

## Pages (hash routes)

| Route | Page |
|---|---|
| `#/` | **Advisory** (landing): State → District → Season with editable season climate on the left (only fields the user changes are sent to `/predict`; the server fills the rest from the latest recorded season). On the right, **AgroMind v4 (final)** `/predict` output: the top crop with expected yield (`yield_unit`, Tonnes/ha shown as t/ha), P(best), the 90% conformal set ("we are 90% confident the best crop is among these N"), a little-history note when `history_years` < `FEW_YEARS`, and the district's candidate crops ranked by expected yield with in-set ✓ and a cold-start tag. When `fallback` is set (district-seasons with no yield records), it shows the v3 P(grown) list behind a warning. Then district history, crop calendar, and district soil (labelled "used by the model" when `/model-info` features include soil). Saved analyses below (localStorage `agromind.saved-analyses.v4`) |
| `#/results` | v4 first. Final model box (`research.final.headline`), then numbered sections: (1) From v1 to v4: version strip + v1 \| v2 \| v3 \| v4 (final) table; (2) AgroMind v4 (final): headline, ranking table (YieldRank and its components), the three conformal configurations of paper Table III (LAC i.i.d., LAC cross-group, state-robust served) from `final.numbers`, per-state served coverage, live `/model-info`; (3) Method comparison (`method_comparison`: Hit@1 dot plot across 3 splits, selection table, ablation, why); (4) Recent work (`related_work.papers`) and gap matrix with the AgroMind row (`related_work_ours`); (5) Intermediate step: v3; (6) Earlier step: v2. Missing keys render nothing. Captions are numbered by CSS counters (`.tcap` tables, `.fcap` figures); `#/report` still works |
| `#/dataset` | The data behind AgroMind v4: a paged, filterable browser of the district crop records (`/dataset`) |
| `#/paper` | Title, authors (`AUTHORS`), affiliation, compile date and page count (from `public/paper/meta.json`), abstract (`ABSTRACT_TEX` from `paper/main.tex`, `\Macros` filled from `research.v4.numbers`), then **Full paper**: a toolbar (Download PDF, Open in new tab, Copy BibTeX, LaTeX source zip, Newsletter PDF, Open in Colab, Print) over the PDF in the browser's own viewer (`iframe`, 85vh). Under 640px the frame is hidden and an "Open the paper" button shows instead (phones render only page 1 inline). Then notebooks (Colab links) and BibTeX |
| `#/about` | Project, team, system, data sources with licences, disclaimer |

The header carries a `v4 (final)` tag (`FINAL` constant in `App.jsx` holds the label used across pages), a small A−/A/A+ text-size control and EN/हि (Hindi covers navigation and headings only).

## Type and colour

- Headings: Source Serif 4 (`--serif`). Body: Noto Sans (`--sans`), with Noto Sans Devanagari for Hindi. Numbers: `tabular-nums`.
- Tokens are in `:root` in `src/styles.css`: `--navy`, `--green`, `--ink`, `--muted`, `--rule`, `--tint`, `--warn`.

## Building blocks

- `Section` renders a serif `h2` with a rule underneath, plus optional actions on the right.
- Tables: `.data` (bordered, tinted header, `.num` right-aligned) and `.kv` (label/value). Captions use `caption.tcap` (or `p.tcap`).
- `.keybox` holds a key-result sentence (computed from data, never typed). `.note` is a small source/definition line under a table.
- `.hide-sm` hides secondary columns under 640px.

## Data sources

- Live: `/options`, `/district`, `/predict` (v4: YieldRank + conformal set), `/dataset`, `/model-info` (v4 nests its counts in `data`; the site reads `data.records ?? data.rows`).
- Research: `src/research.json` (see below): every Results number, including the v1 → v2 → v3 history.

## Results data

`src/research.json` is a copy of `docs/research/results.json`; only the two figures shown (`07_loso.png`, `13_v3_generalisation.png`) are copied to `public/research/`. `FinalBox`, `VersionHistory`, `ImprovementTable`, `V4Section`, `MethodComparison`, `RelatedWork`, `V3Section` and `V2Section` read named keys from it;  `method_comparison` rates are percentages (0–100), NDCG is 0–1. Never put mock data in `src/research.json`: test with Playwright route interception instead.

## Paper files

`scripts/sync-paper.mjs` runs before `npm run dev` and `npm run build` (also `npm run sync-paper`). It copies `paper/main.pdf` and `docs/newsletter/AgroMind_Newsletter.pdf` into `public/paper/` (git-ignored), zips the LaTeX source (`paper/main.tex`, `tables/`, `figures/`, `extra.bib`, `docs/research/references.bib`, with repo-relative paths so it compiles as unzipped) using the system `zip` (or copies `main.tex` alone if `zip` is missing), and writes `meta.json` with the page count and compile date read from the PDF. After the paper is recompiled, any build picks up the new copy.
