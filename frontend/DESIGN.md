# AgroMind — Interface Design

An **academic research tool**: clean white page, navy and green accents, serif headings, dense bordered tables, numbers up front. It is inspired by university/ICAR research pages but is **not** a government-portal replica. No tricolour, emblem, ticker, breadcrumbs, visitor counter or portal boilerplate.

## Hard rules

- The site never claims to be an official Government of India service. The one-line footer and the About disclaimer say so.
- College, department, team, guide and contact live only in `SITE` at the top of `src/App.jsx`.
- No shadows, gradients or rounded cards. Structure comes from 1px rules (`--rule`) and whitespace.

## Pages (hash routes)

| Route | Page |
|---|---|
| `#/` | **Advisory** (landing, the only mode): State → District → Season with editable season climate on the left; recommended crop with P(crop), ranked crops with historical yield, district history, crop calendar (when `/options` has months) and a read-only soil profile on the right; saved analyses below (localStorage `agromind.saved-analyses.v3`) |
| `#/results` | Three numbered sections from `src/research.json`: (1) improvement table v1 → v3 → v4, (2) current system v3 (served model from `/model-info`, grouped evaluation, per-state grid, soil test, figs 11–13), (3) improved method v4 (headline, unseen-states ranking, conformal summary, per-state coverage), (4) recent work and gap matrix (`related_work`, `related_work_ours`), (5) method comparison: Hit@1 dot plot, selection table, ablation, reasons (`method_comparison`). Sections 4–5 render only when their keys exist. Captions are numbered with CSS counters (`.tcap::before` tables, `.fcap::before` figures); wide tables put `p.tcap` outside `.table-wrap` so mobile does not clip it; `#/report` still works |
| `#/dataset` | Paged, filterable browser of the district crop records (`/dataset`) |
| `#/paper` | Title, abstract (`ABSTRACT_TEX` from `paper/main.tex`, `\Macros` filled from `research.v4.numbers`), PDF/newsletter/code links, Colab links, BibTeX |
| `#/about` | Project, team, system, data sources with licences, disclaimer |

The header has a small A−/A/A+ text-size control and EN/हि (Hindi covers navigation and headings only).

## Type and colour

- Headings: Source Serif 4 (`--serif`). Body: Noto Sans (`--sans`), with Noto Sans Devanagari for Hindi. Numbers: `tabular-nums`.
- Tokens are in `:root` in `src/styles.css`: `--navy`, `--green`, `--ink`, `--muted`, `--rule`, `--tint`, `--warn`.

## Building blocks

- `Section` renders a serif `h2` with a rule underneath, plus optional actions on the right.
- Tables: `.data` (bordered, tinted header, `.num` right-aligned) and `.kv` (label/value). Captions use `caption.tcap` (or `p.tcap`).
- `.keybox` holds a key-result sentence (computed from data, never typed). `.note` is a small source/definition line under a table.
- `.hide-sm` hides secondary columns under 640px.

## Data sources

- Live: `/options`, `/district`, `/predict`, `/dataset`, `/model-info` (all counts and years shown on the site come from `/model-info`).
- Research: `src/research.json` (see below). v1/v2 appear only there, as history.

## Results data

`src/research.json` is a copy of `docs/research/results.json`; only the v3 figures (11–13) are copied to `public/research/`. `ImprovementTable`, `V3Section`, `V4Section`, `RelatedWork` and `MethodComparison` read named keys from it; v1/v2 detail is no longer shown. `method_comparison` rates are percentages (0–100), NDCG is 0–1. Never put mock data in `src/research.json`: test with Playwright route interception instead.
