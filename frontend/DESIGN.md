# AgroMind — Interface Design

An **academic research tool**: clean white page, navy and green accents, serif headings, dense bordered tables, numbers up front. It is inspired by university/ICAR research pages but is **not** a government-portal replica. No tricolour, emblem, ticker, breadcrumbs, visitor counter or portal boilerplate.

## Hard rules

- The site never claims to be an official Government of India service. The one-line footer and the About disclaimer say so.
- College, department, team, guide and contact live only in `SITE` at the top of `src/App.jsx`.
- No shadows, gradients or rounded cards. Structure comes from 1px rules (`--rule`) and whitespace.

## Pages (hash routes)

| Route | Page |
|---|---|
| `#/` | **Advisory** (landing): field inputs left, results right (recommended crop with P(crop), top-ranked crops table, calendar, readings vs typical range), saved analyses below |
| `#/results` | Model results v1 → v4 from `src/research.json`; sections and table captions are numbered with CSS counters (`.results .numbered h2::before`, `.tcap::before`); `#/report` still works |
| `#/dataset` | Training-data summary and paged raw-data browser |
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

## Results data

`src/research.json` is a copy of `docs/research/results.json`; figures are copied to `public/research/`. Generic renderers turn arrays, `{name: {metric}}` maps and flat maps into tables. v4 has its own `V4Report`.
