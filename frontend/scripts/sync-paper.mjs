// Copies the compiled paper, its LaTeX source and the newsletter into public/paper/ so the Paper page
// never shows a stale copy. Runs before `npm run dev` and `npm run build`; safe to re-run by hand.
// Writes public/paper/meta.json with the page count and compile date read from the PDF itself.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); // repo root
const out = join(root, 'frontend', 'public', 'paper');
const PDF = join(root, 'paper', 'main.pdf');
const NEWSLETTER = join(root, 'docs', 'newsletter', 'AgroMind_Newsletter.pdf');
// Paths relative to the repo root, kept as-is in the zip so main.tex's ../docs/research/references.bib still resolves.
const SOURCES = ['paper/main.tex', 'paper/extra.bib', 'paper/tables', 'paper/figures', 'docs/research/references.bib'];

mkdirSync(out, { recursive: true });

// pdflatex packs most objects into compressed object streams, so look inside them too.
function pdfFacts(buf) {
  const text = [buf.toString('latin1')];
  const raw = text[0];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const end = raw.indexOf('endstream', m.index);
    if (end < 0) break;
    try {
      text.push(inflateSync(buf.subarray(m.index + m[0].length, end)).toString('latin1'));
    } catch {
      /* not a Flate stream */
    }
  }
  const all = text.join('\n');
  const pages = Math.max(0, ...[...all.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map((x) => Number(x[1] ?? x[2])));
  const d = all.match(/\/CreationDate\s*\(D:(\d{4})(\d{2})(\d{2})/);
  return { pages: pages || null, compiled: d ? `${d[1]}-${d[2]}-${d[3]}` : null };
}

const meta = { pdf: null, newsletter: null, latex: null };

if (existsSync(PDF)) {
  copyFileSync(PDF, join(out, 'AgroMind_v4_paper.pdf'));
  const facts = pdfFacts(readFileSync(PDF));
  meta.pdf = 'AgroMind_v4_paper.pdf';
  Object.assign(meta, facts, { compiled: facts.compiled ?? statSync(PDF).mtime.toISOString().slice(0, 10), bytes: statSync(PDF).size });
} else console.warn('sync-paper: paper/main.pdf not found; the Paper page will link to the repository instead.');

if (existsSync(NEWSLETTER)) {
  copyFileSync(NEWSLETTER, join(out, 'AgroMind_Newsletter.pdf'));
  meta.newsletter = 'AgroMind_Newsletter.pdf';
}

// LaTeX source: a zip when the system `zip` exists, otherwise main.tex alone.
const zipPath = join(out, 'AgroMind_v4_latex.zip');
rmSync(zipPath, { force: true });
try {
  execFileSync('zip', ['-q', '-r', zipPath, ...SOURCES.filter((p) => existsSync(join(root, p)))], { cwd: root });
  meta.latex = 'AgroMind_v4_latex.zip';
} catch {
  if (existsSync(join(root, 'paper', 'main.tex'))) {
    copyFileSync(join(root, 'paper', 'main.tex'), join(out, 'main.tex'));
    meta.latex = 'main.tex';
  }
}

writeFileSync(join(out, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
console.log(`sync-paper: ${meta.pdf ?? 'no PDF'}${meta.pages ? `, ${meta.pages} pages` : ''}${meta.compiled ? `, compiled ${meta.compiled}` : ''}; ${meta.latex ?? 'no source'}; ${meta.newsletter ?? 'no newsletter'}`);
