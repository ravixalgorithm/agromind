# AgroMind — Interface Design

The UI follows the look of Indian government information portals (GIGW style): plain, dense, light, boxed. It is an **academic project** and must never look like, or claim to be, an official site.

## Hard rules

- No State Emblem / Ashoka emblem, Digital India logo, ministry names or logos, or `.gov.in` styling claims.
- The footer disclaimer "This is an academic project and is not an official Government of India website." stays on every page.
- College, department, team, guide and contact details live only in the `SITE` constant at the top of `src/App.jsx`.

## Layout (top to bottom)

1. Accessibility strip (navy-dark): skip link, A- / A / A+ (sets root `font-size`; all CSS uses `rem`), high-contrast toggle (`html[data-contrast=high]`), English | हिन्दी (`T` dictionary in `App.jsx`; only nav and headings are translated).
2. Tricolour band, white header with the wheat logo SVG, English + Hindi title, project line on the right.
3. Navy nav bar (hash routes `#/advisory`, `#/dataset`, `#/report`, …), saffron for the current page; collapses to a Menu button under 720px.
4. "What's New" ticker (`NEWS` array), breadcrumb, page content, dark footer.

## Building blocks

- `Panel` — white box, coloured title bar (navy default, `tone="green"` for results/summaries, `tone="orange"` for notices/errors).
- Tables: `.data` (bordered, zebra, navy-light header) and `.kv` (label/value). Use `.num` for right-aligned numbers.
- Tags: `.tag`, `.tag-ok`, `.tag-warn`.
- Form controls are native: `<select>`, and `<input type=range>` paired with a number box (`NumField`).
- Palette tokens are in `:root` of `src/styles.css`; the high-contrast override redefines the same tokens.

## Model Report

`src/research.json` is a copy of `docs/research/results.json`. The page renders it generically: arrays of rows and `{name: {metric: value}}` maps become tables, flat maps become key/value tables, `figures: [{file, caption}]` load from `public/research/<file name>`. When the file has `"_placeholder": true` an orange notice is shown.
