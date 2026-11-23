import { useEffect, useRef, useState } from 'react';
import research from './research.json';

// Project identity (from the lead). No university logo or emblem anywhere on the site.
const SITE = {
  department: 'Computer Science and Engineering',
  college: 'Harcourt Butler Technical University (HBTU), Kanpur',
  short: 'Dept. of CSE, HBTU Kanpur',
  programme: 'B.Tech, Computer Science and Engineering, Semester VII',
  team: [
    ['Rajat Patel', '230104046'],
    ['Harshit Jain', '230104023'],
    ['Sanyam Jain', '230104055'],
    ['Ravi Pratap Singh', '230104047'],
  ],
  guide: 'Dr. Imran Khan',
  guideTitle: 'Professor, Dept. of CSE, HBTU Kanpur',
  contact: ['Ravi Pratap Singh', '230104047@hbtu.ac.in'],
  session: '2026–27',
  repo: 'https://github.com/ravixalgorithm/agromind',
};
const AUTHORS = [...SITE.team.map(([name]) => name), SITE.guide]; // paper order: students, then the supervisor

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const FINAL = 'AgroMind v4 (final)';
const SAVED_KEY = 'agromind.saved-analyses.v4';
// Keys left by earlier versions (v2 soil-test mode, v3 saved analyses); cleared once so old entries don't linger.
const OLD_KEYS = ['agromind.saved-analyses.v2', 'agromind.active-analysis.v2', 'agromind.advisory-mode', 'agromind.saved-analyses.v3'];
const PREFS_KEY = 'agromind.prefs.v1';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEASONS = {
  kharif: { name: 'Kharif', months: 'Jun–Oct' },
  rabi: { name: 'Rabi', months: 'Oct–Mar' },
  zaid: { name: 'Zaid', months: 'Mar–Jun' },
};
const FONT_SIZES = [13, 15, 17];

const PAGES = ['advisory', 'results', 'dataset', 'paper', 'about'];

// Hindi covers navigation and headings only.
const T = {
  en: {
    skip: 'Skip to main content',
    advisory: 'Advisory',
    results: 'Results',
    dataset: 'Dataset',
    paper: 'Paper',
    about: 'About',
    fieldInputs: 'Field inputs',
    recommended: 'Recommended crop',
    topCrops: 'Top-ranked crops',
    calendar: 'Crop calendar',
    saved: 'Saved analyses',
    newAnalysis: 'New analysis',
    rawData: 'District crop records',
  },
  hi: {
    skip: 'मुख्य सामग्री पर जाएं',
    advisory: 'परामर्श',
    results: 'परिणाम',
    dataset: 'डेटासेट',
    paper: 'शोध पत्र',
    about: 'परिचय',
    fieldInputs: 'खेत का विवरण',
    recommended: 'अनुशंसित फसल',
    topCrops: 'शीर्ष फसलें',
    calendar: 'फसल कैलेंडर',
    saved: 'सहेजे गए विश्लेषण',
    newAnalysis: 'नया विश्लेषण',
    rawData: 'ज़िला फसल अभिलेख',
  },
};

const prob = (p) => (typeof p !== 'number' ? '—' : p > 0 && p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`);
const longDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function loadSaved() {
  try {
    OLD_KEYS.forEach((k) => localStorage.removeItem(k));
    const list = JSON.parse(localStorage.getItem(SAVED_KEY)) ?? [];
    return Array.isArray(list) ? list.filter((e) => e?.id && e.state && e.district && e.season && e.pick?.crop) : [];
  } catch {
    return [];
  }
}

function loadPrefs() {
  try {
    return { font: 15, lang: 'en', ...JSON.parse(localStorage.getItem(PREFS_KEY)) };
  } catch {
    return { font: 15, lang: 'en' };
  }
}

// FastAPI returns 422 with {detail: [{loc, msg}]}; turn that into something a person can read.
async function readError(res, fields) {
  try {
    const body = await res.json();
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d) => `${fields.find((f) => f.key === d.loc?.at(-1))?.label ?? d.loc?.at(-1)} ${d.msg.replace(/^Input should be /i, 'should be ')}`).join(' · ');
    }
  } catch {
    /* fall through */
  }
  return `Server error (${res.status})`;
}

// '#/', '' and unknown hashes open the advisory; '#/report' is the old name of the results page.
function useRoute() {
  const read = () => {
    const h = window.location.hash.startsWith('#/') ? window.location.hash.slice(2) : '';
    if (h === 'report') return 'results';
    return PAGES.includes(h) ? h : 'advisory';
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onHash = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

/* ── Shell ────────────────────────────────────────────── */

function App() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const route = useRoute();
  const mainRef = useRef(null);
  const t = (k) => T[prefs.lang]?.[k] ?? T.en[k];

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${prefs.font}px`;
    root.lang = prefs.lang;
    delete root.dataset.contrast;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ font: prefs.font, lang: prefs.lang }));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  const pref = (patch) => setPrefs((p) => ({ ...p, ...patch }));
  let page;
  if (route === 'advisory') page = <Advisory t={t} />;
  else if (route === 'dataset') page = <DatasetPage t={t} />;
  else if (route === 'results') page = <ResultsPage t={t} />;
  else if (route === 'paper') page = <PaperPage />;
  else page = <AboutPage />;

  return (
    <>
      <a
        href="#main"
        className="skip"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
          mainRef.current?.scrollIntoView();
        }}
      >
        {t('skip')}
      </a>

      <header className="site-header">
        <div className="wrap header-inner">
          <a href="#/" className="brand">
            <LeafMark />
            <span className="brand-name">AgroMind</span>
            <span className="brand-sep" aria-hidden="true">
              ·
            </span>
            <span className="brand-sub">Crop Recommendation Research</span>
            <span className="tag">v4 (final)</span>
          </a>
          <div className="header-tools">
            <span role="group" aria-label="Text size">
              {FONT_SIZES.map((size, i) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={prefs.font === size}
                  onClick={() => pref({ font: size })}
                  aria-label={['Smaller text', 'Normal text', 'Larger text'][i]}
                >
                  {['A−', 'A', 'A+'][i]}
                </button>
              ))}
            </span>
            <span role="group" aria-label="Language">
              <button type="button" aria-pressed={prefs.lang === 'en'} onClick={() => pref({ lang: 'en' })}>
                EN
              </button>
              <button type="button" aria-pressed={prefs.lang === 'hi'} onClick={() => pref({ lang: 'hi' })} lang="hi">
                हि
              </button>
            </span>
          </div>
        </div>
        <nav className="main-nav" aria-label="Main">
          <ul className="wrap">
            {PAGES.map((p) => (
              <li key={p}>
                <a href={p === 'advisory' ? '#/' : `#/${p}`} aria-current={route === p ? 'page' : undefined}>
                  {t(p)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="wrap main">
        {page}
      </main>

      <footer className="site-footer">
        <p className="wrap">
          AgroMind · B.Tech final year project, {SITE.short} ({SITE.session}). An academic research prototype, not an official Government of India service.
        </p>
      </footer>
    </>
  );
}

function LeafMark() {
  return (
    <svg className="leaf" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 4C11 4 5 9 5 16c0 1.4.3 2.6.8 3.6C7 13 11 9.5 16 8c-4 2.3-7.3 6-8.8 11.2.9.5 2 .8 3.3.8C17 20 20 13 20 4z" fill="currentColor" />
    </svg>
  );
}

function Section({ id, title, children, className = '', actions }) {
  return (
    <section className={`sec ${className}`} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="sec-head">
        <h2 id={id ? `${id}-h` : undefined}>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ── Advisory (Government district crop statistics) ─────── */

const V3_SEL_KEY = 'agromind.v3.selection';
const V3_CLIMATE = [
  { key: 'temperature', label: 'Temperature', unit: '°C', min: 0, max: 50, step: 0.1 },
  { key: 'humidity', label: 'Relative humidity', unit: '%', min: 0, max: 100, step: 0.1 },
  { key: 'rainfall', label: 'Seasonal rainfall', unit: 'mm', min: 0, max: 6000, step: 1 },
];
const SOIL_ROWS = [
  ['soil_ph', 'pH', ''],
  ['soil_n_gkg', 'Total nitrogen', 'g/kg'],
  ['soil_soc_gkg', 'Organic carbon', 'g/kg'],
  ['soil_clay_pct', 'Clay', '%'],
  ['soil_sand_pct', 'Sand', '%'],
  ['soil_cec_cmolkg', 'Cation exchange capacity', 'cmol/kg'],
];
const SOIL_SOURCE = { soilgrids_centroid: 'SoilGrids point at the district centre', state_median: 'State median (no SoilGrids point for this district yet)' };
const EXAMPLES = [
  ['Punjab', 'Ludhiana', 'rabi'],
  ['Tamil Nadu', 'Thanjavur', 'kharif'],
  ['Maharashtra', 'Nashik', 'kharif'],
  ['Uttar Pradesh', 'Lucknow', 'rabi'],
];
const V3_PAGE = 100;
// Climate fields the user changed from the district averages; only these go to /predict as overrides.
const overrides = (climate, base) =>
  Object.fromEntries(V3_CLIMATE.filter((f) => climate[f.key] !== '' && base[f.key] !== null && Number(climate[f.key]) !== base[f.key]).map((f) => [f.key, Number(climate[f.key])]));
const FEW_YEARS = 5; // fewer recorded years than this for a district-season counts as little history
const UNITS = { 'Tonnes/ha': 't/ha' };
const yieldText = (v, unit) => (typeof v === 'number' ? `${num(v, v >= 100 ? 0 : 2)} ${UNITS[unit] ?? unit ?? ''}`.trim() : '—');

const seasonLabel = (s) => (s === 'whole_year' ? 'Whole year' : SEASONS[s] ? `${SEASONS[s].name} (${SEASONS[s].months})` : s);
const round2 = (n) => Math.round(n * 100) / 100;
const analysisId = (x) => `${x.state}|${x.district}|${x.season}`;
const climateStrings = (c) => Object.fromEntries(V3_CLIMATE.map((f) => [f.key, typeof c?.[f.key] === 'number' ? String(round2(c[f.key])) : '']));
const num = (n, digits = 1) => (typeof n === 'number' ? n.toLocaleString('en-IN', { maximumFractionDigits: digits }) : '—');

// One request per path for the whole session (options are ~60 KB; model-info rarely changes).
const jsonCache = {};
function getJSON(path) {
  jsonCache[path] ??= fetch(`${API_BASE_URL}${path}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Server returned ${r.status}`))))
    .catch((e) => {
      delete jsonCache[path];
      throw e;
    });
  return jsonCache[path];
}

// The served model's metadata (/model-info). Every count and year shown on the site comes from here.
function useV3Info() {
  const [v3, setV3] = useState(null);
  useEffect(() => {
    getJSON('/model-info')
      .then((d) => {
        const flat = { ...d, ...(d.data ?? {}) };
        setV3(flat.rows ? flat : null);
      })
      .catch(() => setV3(null));
  }, []);
  return v3;
}

// The API gives crop-year starts: [1997, 2022] means crop years 1997-98 to 2022-23.
const cropYear = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
const yearSpan = (years) => (years ? `crop years ${cropYear(years[0])} to ${cropYear(years[1])}` : '');
const districtCount = (v3) => (v3.districts ? `${v3.districts} districts${v3.locations ? ` (${v3.locations} locations)` : ''}` : '');

function useV3Stats() {
  const v3 = useV3Info();
  if (!v3?.rows) return null;
  return [`${(v3.records ?? v3.rows).toLocaleString('en-IN')} records`, districtCount(v3), `${v3.states} states`, yearSpan(v3.years)].filter(Boolean).join(' · ');
}

function Advisory({ t }) {
  const [options, setOptions] = useState(null);
  const [optError, setOptError] = useState('');
  const [sel, setSel] = useState(() => {
    const blank = { state: '', district: '', season: '' };
    try {
      return { ...blank, ...JSON.parse(localStorage.getItem(V3_SEL_KEY)) };
    } catch {
      return blank;
    }
  });
  const [info, setInfo] = useState(null);
  const [climate, setClimate] = useState({});
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [message, setMessage] = useState('');
  const warm = useRef(false); // the first prediction after the server starts loads the model (~3 s)
  const resultsRef = useRef(null);
  const stats = useV3Stats();
  const served = useV3Info();
  const soilUsed = Boolean(served?.features?.some((f) => f.startsWith('soil')));
  const [saved, setSaved] = useState(loadSaved);
  const reopen = useRef(null); // {id, climate} of a saved analysis being reopened

  useEffect(() => {
    getJSON('/options')
      .then(setOptions)
      .catch((e) => setOptError(e.message || `Cannot reach the model server at ${API_BASE_URL}.`));
  }, []);

  const stateOpt = options?.states.find((s) => s.state === sel.state);
  const districtOpt = stateOpt?.districts.find((d) => d.district === sel.district);
  const complete = Boolean(districtOpt?.seasons.includes(sel.season));
  const base = Object.fromEntries(V3_CLIMATE.map((f) => [f.key, typeof info?.climate?.[f.key] === 'number' ? round2(info.climate[f.key]) : null]));
  const climateReady = Boolean(info) && V3_CLIMATE.every((f) => climate[f.key] !== '' && climate[f.key] !== undefined && !Number.isNaN(Number(climate[f.key])));
  const edited = V3_CLIMATE.some((f) => base[f.key] !== null && climate[f.key] !== '' && Number(climate[f.key]) !== base[f.key]);

  useEffect(() => {
    try {
      localStorage.setItem(V3_SEL_KEY, JSON.stringify(sel));
    } catch {
      /* ignore */
    }
  }, [sel]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [saved]);

  // District defaults: season climate averaged over the years, soil, crop history.
  useEffect(() => {
    setInfo(null);
    setResult(null);
    if (!complete) {
      setStatus('idle');
      return undefined;
    }
    const controller = new AbortController();
    setStatus('loading');
    fetch(`${API_BASE_URL}/district?${new URLSearchParams(sel)}`, { signal: controller.signal })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(await readError(r, [])))))
      .then((d) => {
        setInfo(d);
        const back = reopen.current?.id === analysisId(d) ? reopen.current.climate : d.climate;
        reopen.current = null;
        setClimate(climateStrings(back));
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setStatus('error');
        setMessage(e.name === 'TypeError' ? `Cannot reach the model server at ${API_BASE_URL}.` : e.message);
      });
    return () => controller.abort();
  }, [complete, sel.state, sel.district, sel.season]);

  // Live prediction whenever the district or the climate values change.
  useEffect(() => {
    if (!info || !climateReady) return undefined;
    const controller = new AbortController();
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: info.state, district: info.district, season: info.season, ...overrides(climate, base) }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(await readError(res, V3_CLIMATE));
        setResult(await res.json());
        setStatus('ready');
        warm.current = true;
      } catch (e) {
        if (e.name === 'AbortError') return;
        setStatus('error');
        setMessage(e.name === 'TypeError' ? `Cannot reach the model server at ${API_BASE_URL}.` : e.message);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [info, climate, climateReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave: one entry per district and season, updated with the latest climate and pick.
  useEffect(() => {
    const top = result?.recommendations?.[0];
    if (status !== 'ready' || !top) return;
    const entry = {
      id: analysisId(result),
      state: result.state,
      district: result.district,
      season: result.season,
      climate: Object.fromEntries(V3_CLIMATE.map((f) => [f.key, Number(climate[f.key])])), // the form's values, so reopening restores the form
      edited,
      pick: { crop: top.crop, name: top.name, probability: result.fallback ? null : top.probability_best }, // v3 fallback has no P(best)
      savedAt: new Date().toISOString(),
    };
    setSaved((list) => {
      const prev = list.find((e) => e.id === entry.id);
      if (prev && prev.pick.crop === entry.pick.crop && prev.pick.probability === entry.pick.probability && JSON.stringify(prev.climate) === JSON.stringify(entry.climate))
        return list;
      return [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, 50);
    });
  }, [status, result]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentId = complete ? analysisId(sel) : null;
  const openSaved = (e) => {
    if (e.id === currentId) setClimate(climateStrings(e.climate));
    else {
      reopen.current = { id: e.id, climate: e.climate };
      setSel({ state: e.state, district: e.district, season: e.season });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const removeSaved = (id) => {
    setSaved((list) => list.filter((e) => e.id !== id));
    // Clearing the open analysis stops autosave from putting it straight back.
    if (id === currentId) setSel({ state: '', district: '', season: '' });
  };

  const examples = EXAMPLES.filter(([s, d, season]) =>
    options?.states
      .find((x) => x.state === s)
      ?.districts.find((x) => x.district === d)
      ?.seasons.includes(season),
  );
  const cropInfo = (slug) => options?.crops.find((c) => c.slug === slug);
  const recs = result?.recommendations ?? [];
  const top = recs[0];
  const fallback = Boolean(result?.fallback);
  const setCrops = recs.filter((r) => r.in_set);
  const place = info ? `${info.district}, ${info.state}` : '';
  const loadingText = warm.current ? 'Updating…' : 'Loading model… the first prediction after the server starts takes a few seconds.';
  const cal = top && cropInfo(top.crop);
  const calendarCrop = cal?.sow_months?.length && cal?.harvest_months?.length ? cal : null;

  return (
    <>
      {stats && <p className="stat-line">Government of India district crop statistics · {stats}</p>}
      <div className="advisory">
        <form
          className="adv-form"
          onSubmit={(e) => {
            e.preventDefault();
            resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          aria-labelledby="v3-form-title"
        >
          <div className="sec-head">
            <h2 id="v3-form-title">{t('fieldInputs')}</h2>
          </div>

          {optError && <p className="error">{optError}</p>}

          <fieldset>
            <legend>Location &amp; season</legend>
            <div className="field">
              <label htmlFor="v3-state">
                State <span className="req">*</span>
              </label>
              <select id="v3-state" value={sel.state} onChange={(e) => setSel({ state: e.target.value, district: '', season: '' })} disabled={!options}>
                <option value="">{options ? '-- Select --' : 'Loading…'}</option>
                {options?.states.map((s) => (
                  <option key={s.state} value={s.state}>
                    {s.state}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="v3-district">
                District <span className="req">*</span>
              </label>
              <select
                id="v3-district"
                value={sel.district}
                onChange={(e) => {
                  const d = stateOpt?.districts.find((x) => x.district === e.target.value);
                  setSel((s) => ({ ...s, district: e.target.value, season: d?.seasons.includes(s.season) ? s.season : (d?.seasons[0] ?? '') }));
                }}
                disabled={!stateOpt}
              >
                <option value="">-- Select --</option>
                {stateOpt?.districts.map((d) => (
                  <option key={d.district} value={d.district}>
                    {d.district}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="v3-season">
                Season <span className="req">*</span>
              </label>
              <select id="v3-season" value={sel.season} onChange={(e) => setSel((s) => ({ ...s, season: e.target.value }))} disabled={!districtOpt}>
                <option value="">-- Select --</option>
                {districtOpt?.seasons.map((s) => (
                  <option key={s} value={s}>
                    {seasonLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <fieldset disabled={!info}>
            <legend>Season climate (NASA POWER, editable)</legend>
            {V3_CLIMATE.map((f) => (
              <ClimateField key={f.key} field={f} value={climate[f.key] ?? ''} base={base[f.key]} onChange={(v) => setClimate((c) => ({ ...c, [f.key]: v }))} />
            ))}
            <p className="note">
              {info ? `Pre-filled with this district's ${info.season === 'whole_year' ? 'yearly' : 'season'} average over ${info.climate_years} years. ` : ''}Values you leave alone
              are taken from the latest recorded season (shown as &quot;Climate used&quot;); a value you change is used instead.
            </p>
            {edited && (
              <button
                type="button"
                className="btn btn-plain btn-small reset-climate"
                onClick={() => setClimate(Object.fromEntries(V3_CLIMATE.map((f) => [f.key, base[f.key] === null ? '' : String(base[f.key])])))}
              >
                Reset to district averages
              </button>
            )}
          </fieldset>

          {examples.length > 0 && (
            <p className="samples">
              <span>Example districts:</span>
              {examples.map(([s, d, season]) => (
                <button key={d} type="button" className="link-btn" onClick={() => setSel({ state: s, district: d, season })}>
                  {d} ({seasonLabel(season).split(' ')[0]})
                </button>
              ))}
            </p>
          )}
        </form>

        <div className="adv-results" ref={resultsRef}>
          {status === 'error' ? (
            <div className="status-box is-error">
              <p>{message}</p>
            </div>
          ) : !complete ? (
            <div className="status-box">
              <p>
                Choose a <strong>state, district and season</strong>. The district&apos;s season climate (NASA POWER) and soil (SoilGrids) are filled in, and {FINAL} ranks the
                crops grown there by the yield they can be expected to give, with a 90% prediction set.
              </p>
            </div>
          ) : !top ? (
            <div className="status-box">
              <p>{loadingText}</p>
            </div>
          ) : (
            <>
              <section className="rec" aria-labelledby="v3-rec-h">
                <p className="eyebrow">
                  {t('recommended')} · {place} · {seasonLabel(info.season).split(' (')[0]}
                  {result.target_year ? ` ${cropYear(result.target_year)}` : ''}
                </p>
                <h2 id="v3-rec-h" className="rec-crop">
                  {top.name} <span className="rec-type">{cropInfo(top.crop)?.type}</span>
                </h2>
                {fallback ? (
                  <p className="keybox is-warn">
                    No crop in this district and season has a recorded yield, so {FINAL} cannot rank them. The list below comes from the earlier v3 model: the crops most likely to
                    be grown here, not the best-yielding ones.
                  </p>
                ) : (
                  <>
                    <dl className="stats">
                      <div>
                        <dt>Expected yield</dt>
                        <dd>{yieldText(top.expected_yield, top.yield_unit)}</dd>
                      </div>
                      <div>
                        <dt>P(best crop)</dt>
                        <dd>{prob(top.probability_best)}</dd>
                      </div>
                      <div>
                        <dt>Grown here</dt>
                        <dd>{top.years_grown ? `${top.years_grown} yrs` : '—'}</dd>
                      </div>
                      <div>
                        <dt>Climate used</dt>
                        <dd className="dd-text">
                          {num(result.inputs.temperature)} °C · {num(result.inputs.humidity)}% · {num(result.inputs.rainfall, 0)} mm
                        </dd>
                      </div>
                    </dl>
                    {setCrops.length > 0 && (
                      <p className="keybox conformal-set">
                        <strong>We are 90% confident the best crop is among {setCrops.length === 1 ? 'this one' : `these ${setCrops.length}`}:</strong>{' '}
                        {setCrops.map((r) => r.name).join(', ')}.
                        {result.set_was_empty && <span className="muted"> (The set came out empty, so the top-ranked crop was put in.)</span>}
                      </p>
                    )}
                    {typeof result.history_years === 'number' && result.history_years < FEW_YEARS && (
                      <p className="note cold-note">
                        Little history: this district and season has only {result.history_years} {result.history_years === 1 ? 'year' : 'years'} of records, so the ranking leans on
                        climate, soil and the few yields there are. Treat it as a starting point and check locally.
                      </p>
                    )}
                  </>
                )}
                {status === 'loading' && <p className="muted small">{loadingText}</p>}
                {result.note && <p className="note">{result.note}</p>}
              </section>

              <section className="block" aria-labelledby="v3-top-h">
                <h3 id="v3-top-h">
                  {fallback ? t('topCrops') : 'Crops grown here, ranked by expected yield'} · {place}
                </h3>
                {fallback ? (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          <th scope="col">Crop</th>
                          <th scope="col" className="num">
                            P(grown)
                          </th>
                          <th scope="col" className="num wrap hide-sm">
                            Years grown
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {recs.slice(0, 10).map((r, i) => (
                          <tr key={r.crop}>
                            <td>{i + 1}</td>
                            <th scope="row">{r.name}</th>
                            <td className="num">{prob(r.probability)}</td>
                            <td className="num hide-sm">{r.grown_here ? r.years_grown : <span className="muted">not grown</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <>
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th scope="col">#</th>
                            <th scope="col">Crop</th>
                            <th scope="col" className="c wrap">
                              In 90% set
                            </th>
                            <th scope="col" className="num wrap">
                              Expected yield
                            </th>
                            <th scope="col" className="num wrap">
                              P(best)
                            </th>
                            <th scope="col" className="num wrap hide-sm">
                              Median yield, all years
                            </th>
                            <th scope="col" className="num wrap hide-sm">
                              Years grown
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {recs.map((r) => (
                            <tr key={r.crop}>
                              <td>{r.rank}</td>
                              <th scope="row">
                                {r.name}
                                {r.cold_start && (
                                  <span className="tag tag-muted" title="No yield record for this crop here last year">
                                    cold start
                                  </span>
                                )}
                              </th>
                              <td className={`c ${r.in_set ? 'ok' : ''}`}>{r.in_set ? '✓' : <span className="muted">–</span>}</td>
                              <td className="num">{yieldText(r.expected_yield, r.yield_unit)}</td>
                              <td className="num">{prob(r.probability_best)}</td>
                              <td className="num hide-sm">{yieldText(r.historical_median_yield, r.yield_unit)}</td>
                              <td className="num hide-sm">{r.years_grown ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="note">
                      Only crops grown in this district and season in its last five recorded years are ranked. Expected yield = the crop&apos;s median yield here over those years;
                      P(best) = calibrated probability that it gives the best yield of these crops. The 90% set is sized so that it contains the best-yielding crop at least 90% of
                      the time, state by state, including states the model has not seen. &quot;Cold start&quot;: no yield record for that crop here last year, so the model relies
                      more on climate, soil and older years.
                    </p>
                  </>
                )}
              </section>

              {info.history?.top_crops?.length > 0 && (
                <section className="block" aria-labelledby="v3-hist-h">
                  <h3 id="v3-hist-h">
                    District history · {info.history.years?.[0]}–{info.history.years?.[1]}
                  </h3>
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th scope="col">Crop</th>
                          <th scope="col" className="num wrap">
                            Mean area (ha)
                          </th>
                          <th scope="col" className="num wrap">
                            Median yield
                          </th>
                          <th scope="col" className="num wrap hide-sm">
                            Years recorded
                          </th>
                          <th scope="col" className="num wrap">
                            Years in top 3
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {info.history.top_crops.map((c) => (
                          <tr key={c.crop}>
                            <th scope="row">{c.name ?? c.crop}</th>
                            <td className="num">{num(c.mean_area_ha, 0)}</td>
                            <td className="num">{yieldText(c.median_yield, c.yield_unit)}</td>
                            <td className="num hide-sm">{c.years}</td>
                            <td className="num">{c.recommended_years}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="note">
                    Largest crops by area in this district and season over the last five crop years with records. &quot;Top 3&quot; = among the three best yields that year.
                  </p>
                </section>
              )}

              {calendarCrop && (
                <section className="block" aria-labelledby="v3-cal-h">
                  <h3 id="v3-cal-h">{t('calendar')}</h3>
                  <div className="table-wrap">
                    <table className="data cal-table">
                      <thead>
                        <tr>
                          <th scope="col">Crop</th>
                          {MONTHS.map((m) => (
                            <th key={m} scope="col" className="c">
                              {m}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <CalendarRow crop={calendarCrop} />
                      </tbody>
                    </table>
                  </div>
                  <p className="legend">
                    <span>
                      <i className="cal-sow">S</i> Sowing
                    </span>
                    <span>
                      <i className="cal-grow">G</i> Growing
                    </span>
                    <span>
                      <i className="cal-harvest">H</i> Harvest
                    </span>
                  </p>
                </section>
              )}

              {info.soil && (
                <section className="block" aria-labelledby="v3-soil-h">
                  <h3 id="v3-soil-h">District soil (SoilGrids){soilUsed ? ', used by the model' : ', context only'}</h3>
                  <table className="kv">
                    <tbody>
                      {SOIL_ROWS.map(([k, labelText, unit]) => (
                        <tr key={k}>
                          <th scope="row">{labelText}</th>
                          <td>{typeof info.soil[k] === 'number' ? `${num(info.soil[k], 2)}${unit ? ` ${unit}` : ''}` : '—'}</td>
                        </tr>
                      ))}
                      <tr>
                        <th scope="row">Soil class</th>
                        <td>{info.soil.soil_class ?? '—'}</td>
                      </tr>
                      <tr>
                        <th scope="row">Source</th>
                        <td>{SOIL_SOURCE[info.soil.source] ?? 'Not available'}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="note">
                    {soilUsed ? `${FINAL} uses these values as inputs.` : 'Not used by the served model.'} District centre {num(info.location?.lat, 3)}° N,{' '}
                    {num(info.location?.lon, 3)}° E.
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <Section
        id="saved"
        title={`${t('saved')} (${saved.length})`}
        actions={
          <button type="button" className="btn btn-plain btn-small" onClick={() => setSel({ state: '', district: '', season: '' })}>
            + {t('newAnalysis')}
          </button>
        }
      >
        {saved.length === 0 ? (
          <p className="muted small">Each district and season you analyse is saved here automatically, in this browser only.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">District · season</th>
                  <th scope="col">Recommended</th>
                  <th scope="col" className="num">
                    P(best)
                  </th>
                  <th scope="col" className="hide-sm">
                    Climate
                  </th>
                  <th scope="col" className="hide-sm">
                    Saved
                  </th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {saved.map((e, i) => (
                  <SavedRow key={e.id} index={i + 1} entry={e} active={e.id === currentId} onOpen={() => openSaved(e)} onDelete={() => removeSaved(e.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function ClimateField({ field, value, base, onChange }) {
  const n = Number(value);
  const isSet = value !== '' && !Number.isNaN(n);
  const id = `v3-${field.key}`;
  const edited = isSet && base !== null && n !== base;
  return (
    <div className={`field num-field${edited ? ' is-edited' : ''}`}>
      <label htmlFor={id}>
        {field.label} ({field.unit})
      </label>
      <div className="num-row">
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={isSet ? Math.min(field.max, Math.max(field.min, n)) : field.min}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${field.label} slider`}
          tabIndex={-1}
        />
        <input id={id} type="number" min={field.min} max={field.max} step={field.step} value={value} onChange={(e) => onChange(e.target.value)} required />
      </div>
      <small className="hint">
        District average: {base === null ? '—' : `${num(base, 2)} ${field.unit}`}
        {edited && <strong> · edited</strong>}
      </small>
    </div>
  );
}

const V3_HEADERS = {
  state: 'State',
  district: 'District',
  crop_year: 'Crop year',
  season: 'Season',
  crop: 'Crop',
  area_ha: 'Area (ha)',
  production: 'Production',
  production_unit: 'Unit',
  yield: 'Yield',
  yield_pct: 'Yield pctl.',
  recommend: 'Top 3',
  temperature: '°C',
  humidity: 'RH %',
  rainfall: 'Rain mm',
  soil_ph: 'Soil pH',
  soil_class: 'Soil',
  soil_source: 'Soil source',
};
const V3_NUM = new Set(['area_ha', 'production', 'yield', 'yield_pct', 'temperature', 'humidity', 'rainfall', 'soil_ph']);

function v3Cell(col, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (col === 'district') return v;
  if (col === 'yield_pct') return `${Math.round(v * 100)}`;
  if (col === 'recommend') return v ? 'Yes' : '';
  if (col === 'soil_source') return v === 'soilgrids_centroid' ? 'point' : v === 'state_median' ? 'state median' : v;
  if (col === 'yield' || col === 'soil_ph') return num(v, 2);
  if (V3_NUM.has(col)) return num(v, 1);
  return v;
}

function V3DataBrowser() {
  const [options, setOptions] = useState(null);
  const [filters, setFilters] = useState({ state: '', district: '', crop: '', year: '' });
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    getJSON('/options')
      .then(setOptions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    const params = new URLSearchParams({ page: String(page), page_size: String(V3_PAGE), ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
    fetch(`${API_BASE_URL}/dataset?${params}`, { signal: controller.signal })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(await readError(r, [])))))
      .then((d) => {
        setPayload(d);
        setStatus('ready');
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setStatus('error');
        setError(e.name === 'TypeError' ? `Cannot reach the model server at ${API_BASE_URL}.` : e.message);
      });
    return () => controller.abort();
  }, [filters, page]);

  const setFilter = (k, v) => {
    setFilters((f) => ({ ...f, [k]: v, ...(k === 'state' && { district: '' }) }));
    setPage(1);
  };
  const stateOpt = options?.states.find((s) => s.state === filters.state);
  const cols = payload?.columns.filter((c) => c !== 'crop_slug') ?? [];
  const v3 = useV3Info();
  const years = v3?.years ? Array.from({ length: v3.years[1] - v3.years[0] + 1 }, (_, i) => v3.years[0] + i) : [];
  const first = payload && payload.total ? (payload.page - 1) * payload.page_size + 1 : 0;
  const last = payload ? Math.min(payload.page * payload.page_size, payload.total) : 0;

  return (
    <>
      <div className="toolbar filters">
        <label className="inline-field">
          <span>State</span>
          <select value={filters.state} onChange={(e) => setFilter('state', e.target.value)}>
            <option value="">All</option>
            {options?.states.map((s) => (
              <option key={s.state} value={s.state}>
                {s.state}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <span>District</span>
          <select value={filters.district} onChange={(e) => setFilter('district', e.target.value)} disabled={!stateOpt}>
            <option value="">All</option>
            {stateOpt?.districts.map((d) => (
              <option key={d.district} value={d.district}>
                {d.district}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <span>Crop</span>
          <select value={filters.crop} onChange={(e) => setFilter('crop', e.target.value)}>
            <option value="">All</option>
            {options?.crops.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <span>Year</span>
          <select value={filters.year} onChange={(e) => setFilter('year', e.target.value)}>
            <option value="">All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {cropYear(y)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="toolbar">
        <p className="range-note" aria-live="polite">
          {status === 'ready' && payload ? `Rows ${first.toLocaleString('en-IN')}–${last.toLocaleString('en-IN')} of ${payload.total.toLocaleString('en-IN')}` : '…'}
        </p>
        <div className="pager">
          <button type="button" className="btn btn-plain btn-small" disabled={status === 'loading' || !payload || payload.page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Previous
          </button>
          <button
            type="button"
            className="btn btn-plain btn-small"
            disabled={status === 'loading' || !payload || payload.page >= payload.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      </div>

      {status === 'error' && <p className="error">{error}</p>}
      {status === 'ready' && payload?.rows.length === 0 && <p className="muted">No rows for these filters.</p>}
      {payload?.rows.length > 0 && status !== 'error' && (
        <div className="table-wrap table-scroll">
          <table className="data dense">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} scope="col" className={V3_NUM.has(c) ? 'num' : undefined}>
                    {V3_HEADERS[c] ?? c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payload.rows.map((row, i) => (
                <tr key={`${payload.page}-${i}`}>
                  {cols.map((c) => (
                    <td key={c} className={V3_NUM.has(c) ? 'num' : undefined}>
                      {v3Cell(c, row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="note">
        One row per state × district × crop year × season × crop (Government of India APY). Yield pctl. = yield percentile among the same crop and year across districts; Top 3 =
        among the district&apos;s three best-yielding crops that season (the v3 training label). Climate: NASA POWER season averages; soil: SoilGrids.
      </p>
    </>
  );
}

function CalendarRow({ crop }) {
  const sow = new Set(crop.sow_months);
  const harvest = new Set(crop.harvest_months);
  const grow = new Set();
  // Fill the months between the last sowing month and the first harvest month (wrapping past December).
  if (crop.sow_months.length && crop.harvest_months.length && !crop.sow_months.some((m) => harvest.has(m))) {
    const last = Math.max(...crop.sow_months);
    const first = crop.harvest_months.find((m) => m > last) ?? crop.harvest_months[0];
    for (let m = (last + 1) % 12; m !== first; m = (m + 1) % 12) grow.add(m);
  }
  return (
    <tr>
      <th scope="row">{crop.name}</th>
      {MONTHS.map((label, m) => {
        const kind = sow.has(m) && harvest.has(m) ? 'both' : sow.has(m) ? 'sow' : harvest.has(m) ? 'harvest' : grow.has(m) ? 'grow' : 'idle';
        const text = { both: 'S/H', sow: 'S', harvest: 'H', grow: 'G', idle: '' }[kind];
        return (
          <td key={m} className={`c cal-${kind}`} title={`${label}: ${kind === 'idle' ? '—' : kind}`}>
            {text}
          </td>
        );
      })}
    </tr>
  );
}

function SavedRow({ index, entry, active, onOpen, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <tr className={active ? 'is-selected' : undefined}>
      <td>{index}</td>
      <th scope="row">
        {entry.district}, {entry.state} · {seasonLabel(entry.season).split(' (')[0]}
        {active && <span className="tag">Open</span>}
      </th>
      <td>{entry.pick.name}</td>
      <td className="num">{prob(entry.pick.probability)}</td>
      <td className="hide-sm">{entry.edited ? 'edited' : 'district average'}</td>
      <td className="hide-sm">{longDate(entry.savedAt)}</td>
      <td className="actions">
        <button type="button" className="link-btn" onClick={onOpen}>
          Open
        </button>
        {confirming ? (
          <>
            <button type="button" className="link-btn danger" onClick={onDelete} aria-label={`Confirm delete ${entry.district}`}>
              Confirm delete
            </button>
            <button type="button" className="link-btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="link-btn danger" onClick={() => setConfirming(true)} aria-label={`Delete ${entry.district}`}>
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

/* ── Dataset ──────────────────────────────────────────── */

function DatasetPage({ t }) {
  const stats = useV3Stats();
  return (
    <>
      <header className="page-head">
        <h1>{t('dataset')}</h1>
        <p className="lede">
          The data behind {FINAL}: Government of India district-wise, season-wise crop statistics (APY){stats ? `: ${stats}` : ''}, joined with NASA POWER climate and SoilGrids
          soil. The model learns from these yields, and the advisory shows each district&apos;s history from them. Licences are listed on the <a href="#/about">About</a> page.
        </p>
      </header>
      <Section id="records" title={t('rawData')}>
        <V3DataBrowser />
      </Section>
    </>
  );
}

/* ── Results ──────────────────────────────────────────── */

// Every number on this page comes from src/research.json (a copy of docs/research/results.json) or /model-info.
const pct1 = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(1)}%` : '—');
const pct2 = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(2)}%` : '—');
const pval = (p) => (typeof p !== 'number' ? '—' : p < 0.0001 ? '< 0.0001' : p.toFixed(3));
const metric = (r, m) => r?.[`${m}_mean`] ?? r?.[m];
const isOurs = (name) => name.includes('(ours)');
const isClassifier = (name) => /\[[\d,]+\]/.test(name); // literature classifiers carry their citation numbers
// The pointwise LightGBM row uses the proposed yield-ranking formulation too; name it so it doesn't read as an outside baseline.
const methodName = (name) =>
  /pointwise/i.test(name) ? 'LightGBM pointwise (YieldRank component)' : /lambdamart/i.test(name) ? 'LambdaMART listwise (earlier v4 model; YieldRank component)' : name;
const V3_TESTS = [
  ['leave_districts_out', 'Unseen districts'],
  ['leave_years_out', 'Future crop years'],
  ['leave_states_out', 'Unseen states'],
];

// For one grouped test: the ExtraTrees row (the v3 model) and the best popularity baseline by Hit@1.
function v3Pair(test) {
  const rows = Object.entries(test ?? {});
  const model = rows.find(([n]) => n.startsWith('ExtraTrees'));
  const base = rows.filter(([n]) => n.startsWith('baseline')).sort((a, b) => metric(b[1], 'hit1') - metric(a[1], 'hit1'))[0];
  return model && base ? { model, base } : null;
}

// Numbers each version is summarised by, all read from results.json (v1/v2 from the v2 notebook, v3 and v4 from theirs).
const V2_MODEL = 'RandomForest (v2 deployed)';
const SOURCE_NAMES = { india: 'Multi-state (india)', tamilnadu: 'Tamil Nadu', kaggle: 'Kaggle' };
function versionNumbers(r) {
  const v1 = r.v1?.RandomForest;
  const v2 = r.models?.[V2_MODEL];
  const loso = Object.entries(r.loso ?? {})
    .filter(([k]) => k.endsWith('|open set'))
    .map(([k, x]) => [k.split('|')[0], x.accuracy]);
  const losoVals = loso.map(([, a]) => a).filter((a) => typeof a === 'number');
  const v3 = r.v3 ?? {};
  const pairs = Object.fromEntries(V3_TESTS.map(([k]) => [k, v3Pair(v3[k])]));
  const h3 = (k) => metric(pairs[k]?.model[1], 'hit1');
  return {
    v1,
    v2,
    loso,
    losoRange: losoVals.length ? `${(Math.min(...losoVals) * 100).toFixed(1)}–${pct1(Math.max(...losoVals))}` : '—',
    v3,
    pairs,
    h3,
    n: r.v4?.numbers ?? {},
    f: r.final?.numbers ?? {},
    m4: r.v4?.meta ?? {},
    sources: Object.keys(r.dataset?.rows_by_source ?? {}),
  };
}

// Four steps; each fixed the previous one's weakness. The prose is fixed, every number comes from results.json.
function VersionHistory({ r }) {
  const x = versionNumbers(r);
  const steps = [
    {
      v: 'v1',
      name: 'Previous project',
      fact: `${pct1(x.v1?.reported_accuracy)} accuracy on ${r.dataset?.rows_by_source?.kaggle?.toLocaleString('en-IN') ?? '—'} Kaggle rows`,
      fixed: 'Starting point',
      lacked: `Argmax decode bug (GaussianNB exact-match ${pct1(r.v1?.GaussianNB?.exact_match_accuracy)} vs ${pct1(r.v1?.GaussianNB?.reported_accuracy)} reported); one random split`,
    },
    {
      v: 'v2',
      name: 'Merged sources',
      fact: `${pct2(x.v2?.accuracy_mean)} ± ${pct2(x.v2?.accuracy_std)} (5-fold), top-3 ${pct2(x.v2?.top3_mean)} on ${r.dataset?.rows?.toLocaleString('en-IN') ?? '—'} rows`,
      fixed: `One multiclass model, ${x.sources.length} merged sources, cross-validation`,
      lacked: `The sources disagree: on an unseen source accuracy falls to ${x.losoRange}`,
    },
    {
      v: 'v3',
      name: 'Intermediate',
      fact: `Hit@1 ${pct1(x.h3('leave_districts_out'))} / ${pct1(x.h3('leave_states_out'))} / ${pct1(x.h3('leave_years_out'))} on unseen districts / states / years`,
      fixed: `${x.v3.data?.rows?.toLocaleString('en-IN') ?? '—'} real district records, tested on places and years it has not seen`,
      lacked: 'Predicts what is grown, not what yields best; no uncertainty',
    },
    {
      v: 'v4',
      name: 'Final',
      fact: `Hit@1 ${x.n.OursHitLSO ?? '—'}% on unseen states; 90% sets of ${x.f.CCSRSizeLSO ?? x.n.SizeIIDLSO ?? '—'} crops`,
      fixed: 'Ranks crops by realised yield and gives a 90% prediction set',
      lacked: null,
    },
  ];
  return (
    <ol className="versions" aria-label="Version history">
      {steps.map((s) => (
        <li key={s.v} className={s.v === 'v4' ? 'is-final' : undefined}>
          <p className="ver-name">
            <strong>{s.v}</strong> {s.v === 'v4' ? FINAL.replace('AgroMind v4 ', '') : s.name.toLowerCase()}
          </p>
          <p className="ver-fact">{s.fact}</p>
          <p className="ver-line">
            <span>Fixed:</span> {s.fixed}
          </p>
          {s.lacked && (
            <p className="ver-line">
              <span>Still lacked:</span> {s.lacked}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function ImprovementTable({ r }) {
  const x = versionNumbers(r);
  const imp = Object.fromEntries((r.improvement ?? []).map((row) => [row.aspect, row]));
  const { v3, pairs, n, m4 } = x;
  const v3sum = Object.fromEntries((v3.summary ?? []).map((row) => [row.aspect, row.v3]));
  const kaggle = r.dataset?.rows_by_source?.kaggle;
  const vs = (p) => (p ? `${pct1(metric(p.model[1], 'hit1'))} vs ${pct1(metric(p.base[1], 'hit1'))} baseline` : '—');
  const rows = [
    [
      'Data',
      `Kaggle crop-recommendation table, ${kaggle?.toLocaleString('en-IN') ?? '—'} rows`,
      `${r.dataset?.rows?.toLocaleString('en-IN') ?? '—'} rows merged from ${x.sources.map((k) => SOURCE_NAMES[k] ?? k).join(', ')}`,
      `Government of India district crop statistics, ${v3.data?.rows?.toLocaleString('en-IN') ?? '—'} records`,
      `Same statistics as ${n.NQueries ?? '—'} district-season-year queries`,
    ],
    [
      'Coverage',
      `${r.dataset?.crops_by_source?.kaggle ?? '—'} crops; no location or season`,
      `${r.dataset?.crops ?? '—'} crops; inputs ${imp.Inputs?.v2 ?? '—'}`,
      `${v3.data?.crops_app ?? '—'} crops · ${v3.data?.districts ?? '—'} districts · ${v3.data?.states ?? '—'} states · ${v3.data?.crop_years ?? '—'} crop years`,
      `${m4.crops ?? '—'} crops · ${m4.states ?? '—'} states · ${n.YearA ?? '—'}–${n.YearB ?? '—'}`,
    ],
    [
      'What is predicted',
      'One crop label per row',
      'One crop label per row (single multiclass model)',
      v3sum.Labels ?? '—',
      'A ranking of the crops grown in a district by realised yield, plus a 90% prediction set',
    ],
    [
      'Evaluation',
      imp['Evaluation protocol']?.v1 ?? '—',
      'Stratified 5-fold CV, leave-one-source-out, McNemar',
      v3sum.Validation ?? '—',
      'Random split, unseen states and future years; Wilcoxon tests',
    ],
    [
      'Headline result',
      `${pct2(x.v1?.reported_accuracy)} accuracy on a random split (reported)`,
      `${pct2(x.v2?.accuracy_mean)} ± ${pct2(x.v2?.accuracy_std)} accuracy, top-3 ${pct2(x.v2?.top3_mean)} (5-fold)`,
      `Unseen districts: ${vs(pairs.leave_districts_out)} (Hit@1)`,
      `Unseen states: ${n.OursHitLSO ?? '—'}% vs ${n.BaseHitLSO ?? '—'}% for the best classifier (${n.BaseNameLSO ?? '—'}); persistence ${n.PersHitLSO ?? '—'}%`,
    ],
    [
      'Tested on new places and years',
      imp['Generalisation to an unseen source']?.v1 ?? 'not tested',
      `Unseen source: ${x.losoRange} accuracy`,
      `Unseen states ${vs(pairs.leave_states_out)}; future years ${vs(pairs.leave_years_out)}`,
      'Unseen states and future years (Section 2)',
    ],
    [
      'Uncertainty',
      imp['Probability calibration']?.v1 ?? 'not measured',
      `Probability per crop (ECE ${typeof r.calibration?.[V2_MODEL]?.ece === 'number' ? r.calibration[V2_MODEL].ece.toFixed(3) : '—'})`,
      'Probability per crop',
      x.f.CCSRCovLSO
        ? `90% prediction sets (state-robust, served): ${x.f.CCSRCovLSO}% coverage on unseen states with ${x.f.CCSRSizeLSO} crops on average`
        : `90% prediction sets: ${n.CovIIDLSO ?? '—'}% coverage with ${n.SizeIIDLSO ?? '—'} crops on average`,
    ],
  ];
  return (
    <>
      <p className="tcap">From the previous project (v1) through v2 and v3 to {FINAL}</p>
      <div className="table-wrap">
        <table className="data compare">
          <thead>
            <tr>
              <th scope="col">Aspect</th>
              <th scope="col">Previous project (v1)</th>
              <th scope="col">v2</th>
              <th scope="col">Intermediate (v3)</th>
              <th scope="col" className="is-final">
                {FINAL}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([aspect, a, b, c, d]) => (
              <tr key={aspect}>
                <th scope="row">{aspect}</th>
                <td>{a}</td>
                <td>{b}</td>
                <td>{c}</td>
                <td className="is-final">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// The model the advisory serves right now, read live from /model-info.
function ServedModel({ served, failed }) {
  return (
    <>
      {served ? (
        <table className="kv">
          <caption className="tcap">Model served by the advisory (live from the server)</caption>
          <tbody>
            <tr>
              <th scope="row">Algorithm</th>
              <td>{served.model}</td>
            </tr>
            <tr>
              <th scope="row">Input features</th>
              <td>{served.features?.join(', ')}</td>
            </tr>
            {served.label && (
              <tr>
                <th scope="row">Label</th>
                <td>{served.label}</td>
              </tr>
            )}
            <tr>
              <th scope="row">Training data</th>
              <td>
                {[
                  served.training_rows && `${served.training_rows.toLocaleString('en-IN')} rows`,
                  served.training_queries && `${served.training_queries.toLocaleString('en-IN')} district-season-year queries`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </td>
            </tr>
            <tr>
              <th scope="row">Coverage</th>
              <td>{[`${served.crops} crops`, `${served.states} states`, districtCount(served), yearSpan(served.years)].filter(Boolean).join(' · ')}</td>
            </tr>
            {served.metrics?.leave_states_out?.served_set_coverage != null && (
              <tr>
                <th scope="row">Served 90% sets</th>
                <td>
                  Unseen states: {pct1(served.metrics.leave_states_out.served_set_coverage)} coverage with {num(served.metrics.leave_states_out.served_set_size, 2)} crops on
                  average
                  {served.metrics.worst_state_coverage?.state
                    ? `; worst state ${served.metrics.worst_state_coverage.state} ${pct1(served.metrics.worst_state_coverage.coverage)}`
                    : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        <p className="muted small">{failed ? `Cannot reach the model server at ${API_BASE_URL}; the tables on this page come from results.json.` : 'Loading the served model…'}</p>
      )}
    </>
  );
}

// v3 step, kept short: one table and the generalisation figure.
function researchFigure(f) {
  // Figure images are copied from docs/research/figures/ into frontend/public/research/.
  const src = `${import.meta.env.BASE_URL}research/${f.file.split('/').pop()}`;
  return (
    <figure key={f.file} className="figure">
      <a href={src} target="_blank" rel="noreferrer" title="Open full size">
        <img src={src} alt={f.caption} loading="lazy" />
      </a>
      <figcaption className="fcap">{f.caption}</figcaption>
    </figure>
  );
}

function V3Section({ v }) {
  const pairs = V3_TESTS.map(([k, name]) => [name, v3Pair(v[k])]).filter(([, p]) => p);
  const fig = (v.figures ?? []).find((f) => f.file?.includes('generalisation'));

  return (
    <>
      <p>
        v3 moved to {v.data?.rows?.toLocaleString('en-IN') ?? '—'} Government of India district records and was tested on districts, states and years it had not seen. It still
        predicted which crops are grown rather than which yield best, and gave no uncertainty; {FINAL} addresses both.
      </p>
      {pairs.length > 0 && (
        <div className="sub-section">
          <p className="tcap">v3 (ExtraTrees) against the best popularity baseline</p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Test</th>
                  <th scope="col" className="num">
                    Hit@1
                  </th>
                  <th scope="col" className="num">
                    Hit@3
                  </th>
                  <th scope="col" className="num wrap">
                    Baseline Hit@1
                  </th>
                  <th scope="col" className="num wrap">
                    Baseline Hit@3
                  </th>
                  <th scope="col" className="hide-sm">
                    Baseline
                  </th>
                </tr>
              </thead>
              <tbody>
                {pairs.map(([name, p]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td className="num">{pct2(metric(p.model[1], 'hit1'))}</td>
                    <td className="num">{pct2(metric(p.model[1], 'hit3'))}</td>
                    <td className="num">{pct2(metric(p.base[1], 'hit1'))}</td>
                    <td className="num">{pct2(metric(p.base[1], 'hit3'))}</td>
                    <td className="hide-sm">{p.base[0].replace(/^baseline:\s*/, '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {fig && <div className="sub-section figures one">{researchFigure(fig)}</div>}
    </>
  );
}

// v2 step, kept short: one table (cross-validation and leave-one-source-out) and the LOSO figure.
function V2Section({ r }) {
  const x = versionNumbers(r);
  const fig = (r.figures ?? []).find((f) => f.file?.includes('_loso'));
  return (
    <>
      <p>
        v2 merged {x.sources.length} sources into {r.dataset?.rows?.toLocaleString('en-IN') ?? '—'} rows and replaced v1&apos;s per-crop heads with one multiclass model. It scored
        well within its own data, but the sources disagree: trained on two and tested on the third, it falls to {x.losoRange} accuracy. That led to v3.
      </p>
      <div className="sub-section">
        <p className="tcap">v2 deployed Random Forest: cross-validation and unseen sources</p>
        <div className="table-wrap">
          <table className="data narrow">
            <tbody>
              <tr>
                <th scope="row">Accuracy (5-fold CV)</th>
                <td className="num">
                  {pct2(x.v2?.accuracy_mean)} ± {pct2(x.v2?.accuracy_std)}
                </td>
              </tr>
              <tr>
                <th scope="row">Macro-F1 (5-fold CV)</th>
                <td className="num">{pct2(x.v2?.macro_f1_mean)}</td>
              </tr>
              <tr>
                <th scope="row">Top-3 accuracy (5-fold CV)</th>
                <td className="num">{pct2(x.v2?.top3_mean)}</td>
              </tr>
              {x.loso.map(([src, acc]) => (
                <tr key={src}>
                  <th scope="row">Unseen source: {src}</th>
                  <td className="num">{pct2(acc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">Unseen source = trained on the other two sources, tested on this one, open crop vocabulary.</p>
      </div>
      {fig && <div className="sub-section figures one">{researchFigure(fig)}</div>}
    </>
  );
}

function V4Section({ v, fin, served, failed }) {
  const lso = v.metrics?.main?.['leave-states-out'] ?? {};
  const entries = Object.entries(lso);
  const ours = entries.find(([name]) => isOurs(name));
  const bestClf = entries.filter(([name]) => isClassifier(name)).sort((a, b) => b[1].mean['hit@1'] - a[1].mean['hit@1'])[0];
  const pers = entries.find(([name]) => /persistence/i.test(name));
  const pointwise = entries.find(([name]) => /pointwise/i.test(name));
  const listwise = entries.find(([name]) => /lambdamart/i.test(name));
  const n = v.numbers ?? {};
  const f = fin ?? {}; // results.json final.numbers: the served (state-robust) and plain LAC sets, same pipeline
  const hasSets = f.CCSRCovLSO && f.CCLACCovLSO;
  const srKey = Object.values(v.coverage_by_state_leave_states_out ?? {}).some((s) => typeof s.cov_SR === 'number') ? 'SR' : 'LAC';
  const states = Object.entries(v.coverage_by_state_leave_states_out ?? {}).sort((a, b) => a[1][`cov_${srKey}`] - b[1][`cov_${srKey}`]);
  const SPLIT_SUFFIX = [
    ['R', 'Random split'],
    ['LSO', 'Unseen states'],
    ['LYO', 'Future years'],
  ];
  const setRows = [
    ['LAC (marginal 90%)', 'CCLAC'],
    ['State-robust (served)', 'CCSR'],
  ];

  return (
    <>
      {ours && bestClf && (
        <p className="keybox">
          <strong>Headline:</strong> on unseen states, YieldRank ranks the best-yielding crop first in <strong>{pct1(ours[1].mean['hit@1'])}</strong> of district-season-year
          queries, against {pct1(bestClf[1].mean['hit@1'])} for the best literature classifier ({bestClf[0]}); NDCG@3 {ours[1].mean['ndcg@3'].toFixed(3)} vs{' '}
          {bestClf[1].mean['ndcg@3'].toFixed(3)} (Wilcoxon p {pval(bestClf[1]['wilcoxon_vs_ours_hit@1']?.p)}, n = {bestClf[1]['wilcoxon_vs_ours_hit@1']?.n?.toLocaleString('en-IN')}
          ).
          {pers && (
            <>
              {' '}
              <strong>But</strong> a simple persistence rule (last year&apos;s crop) reaches {pct1(pers[1].mean['hit@1'])} (difference p{' '}
              {pval(pers[1]['wilcoxon_vs_ours_hit@1']?.p)})
              {pointwise && listwise && (
                <>
                  ; its two learned components alone reach {pct1(pointwise[1].mean['hit@1'])} (pointwise LightGBM) and {pct1(listwise[1].mean['hit@1'])} (listwise LambdaMART)
                </>
              )}
              .
            </>
          )}
          {n.OursHitColdLSO && n.PersHitColdLSO && (
            <>
              {' '}
              Its clear gain over persistence is on cold-start queries ({n.ColdShareLSO}% of cases, where some candidate crop has no yield history): {n.OursHitColdLSO}% vs{' '}
              {n.PersHitColdLSO}%.
            </>
          )}
          {hasSets && (
            <>
              {' '}
              The served 90% prediction sets use a state-robust threshold: on unseen states they contain the best crop <strong>{f.CCSRCovLSO}%</strong> of the time with{' '}
              {f.CCSRSizeLSO} crops on average, and the worst state ({f.SRWorstState}) still reaches {f.SRWorstCov}%. Plain LAC sets are smaller ({f.CCLACSizeLSO} crops) but reach
              only {f.CCWorstCov}% in {f.CCWorstState}.
            </>
          )}
        </p>
      )}

      <ServedModel served={served} failed={failed} />

      {entries.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <caption className="tcap">
              Ranking quality on unseen states (leave-states-out, mean ± sd over folds)
              <span className="tcap-note">
                YieldRank (ours) blends its two learned components, pointwise LightGBM and listwise LambdaMART, with last-year persistence; the blend was chosen on held-out
                training states and years (paper §V).
              </span>
            </caption>
            <thead>
              <tr>
                <th scope="col">Method</th>
                {['hit@1', 'hit@3', 'ndcg@3'].map((m) => (
                  <th key={m} scope="col" className="num">
                    {m.replace('ndcg', 'NDCG').replace('hit', 'Hit')}
                  </th>
                ))}
                <th scope="col" className="num wrap">
                  YieldRank − method (Hit@1)
                </th>
                <th scope="col" className="num hide-sm">
                  p (Wilcoxon)
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([name, r]) => {
                const w = r['wilcoxon_vs_ours_hit@1'];
                return (
                  <tr key={name} className={isOurs(name) ? 'is-highlight' : undefined}>
                    <th scope="row">{methodName(name)}</th>
                    {['hit@1', 'hit@3', 'ndcg@3'].map((m) => (
                      <td key={m} className="num">
                        {m.startsWith('ndcg') ? `${r.mean[m].toFixed(3)} ± ${r.std[m].toFixed(3)}` : `${(r.mean[m] * 100).toFixed(1)} ± ${(r.std[m] * 100).toFixed(1)}%`}
                      </td>
                    ))}
                    <td className="num">{w ? `${w.mean_diff >= 0 ? '+' : '−'}${Math.abs(w.mean_diff * 100).toFixed(1)} pts` : '—'}</td>
                    <td className="num hide-sm">{w ? pval(w.p) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasSets && (
        <div className="sub-section">
          <p className="tcap">
            90% prediction sets: coverage · average set size
            <span className="tcap-note">
              Coverage = share of queries whose set contains the best-yielding crop. The advisory serves the state-robust sets: their threshold targets 90% coverage in each state
              rather than on average.
            </span>
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Sets</th>
                  {SPLIT_SUFFIX.map(([k, label]) => (
                    <th key={k} scope="col" className="num">
                      {label}
                    </th>
                  ))}
                  <th scope="col" className="num wrap">
                    Worst state (unseen states)
                  </th>
                  <th scope="col" className="num wrap hide-sm">
                    States below 90%
                  </th>
                </tr>
              </thead>
              <tbody>
                {setRows.map(([title, pre]) => {
                  const worst = pre === 'CCSR' ? ['SRWorstCov', 'SRWorstState', 'SRStatesBelowNinety'] : ['CCWorstCov', 'CCWorstState', 'CCStatesBelowNinety'];
                  return (
                    <tr key={pre} className={pre === 'CCSR' ? 'is-highlight' : undefined}>
                      <th scope="row">{title}</th>
                      {SPLIT_SUFFIX.map(([k]) => (
                        <td key={k} className="num">
                          {f[`${pre}Cov${k}`] ? `${f[`${pre}Cov${k}`]}% · ${f[`${pre}Size${k}`]} crops` : '—'}
                        </td>
                      ))}
                      <td className="num">{f[worst[0]] ? `${f[worst[0]]}% (${f[worst[1]]})` : '—'}</td>
                      <td className="num hide-sm">{f[worst[2]] ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {states.length > 0 && (
        <div className="sub-section table-wrap">
          <table className="data">
            <caption className="tcap">Coverage of 90% sets for each held-out state (lowest served coverage first)</caption>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col" className="num">
                  Queries
                </th>
                <th scope="col" className="num wrap">
                  Coverage, {srKey === 'SR' ? 'state-robust (served)' : 'LAC'}
                </th>
                <th scope="col" className="num wrap">
                  Set size
                </th>
                {srKey === 'SR' && (
                  <th scope="col" className="num wrap hide-sm">
                    Coverage, LAC
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {states.map(([name, s]) => (
                <tr key={name} className={Math.round(s[`cov_${srKey}`] * 1000) < 850 ? 'is-warn' : undefined}>
                  <th scope="row">{name}</th>
                  <td className="num">{s.n.toLocaleString('en-IN')}</td>
                  <td className="num">{pct1(s[`cov_${srKey}`])}</td>
                  <td className="num">{s[`size_${srKey}`]?.toFixed(2) ?? '—'}</td>
                  {srKey === 'SR' && <td className="num hide-sm">{pct1(s.cov_LAC)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">
            Rows shaded red have served coverage below 85%. The method, its abstract and the full paper are on the <a href="#/paper">Paper</a> page.
          </p>
        </div>
      )}
    </>
  );
}

/* ── Results: related work and method comparison ───────── */

// Gap codes used in research.json.related_work[].gaps. A cell shows ✗ when the paper has the shortcoming, ✓ when it avoids it.
const GAPS = {
  KAGGLE_ONLY: 'Kaggle table only',
  RANDOM_SPLIT_ONLY: 'Random split only',
  NO_YIELD: 'No yield outcome',
  NO_UNCERTAINTY: 'No uncertainty',
  SINGLE_REGION: 'Single region',
  NO_STAT_TEST: 'No significance test',
  LEAKAGE: 'Leakage risk',
  NOT_REPRODUCIBLE: 'Not reproducible',
};
const isOursEntry = (p) => p?.ours === true;
const paperList = (rw) => (Array.isArray(rw) ? rw : Array.isArray(rw?.papers) ? rw.papers : []);
const authorList = (p) => (Array.isArray(p.authors) ? p.authors : String(p.authors ?? '').split(/,\s*| and /)).filter(Boolean);
const authorText = (p) => (Array.isArray(p.authors) ? p.authors.join(', ') : p.authors);
// Short label "Dey et al. 2024": the first author's surname comes from the curated bib key (names with trailing initials break a last-word rule).
function paperShort(p) {
  const fromKey = String(p.key ?? '').replace(/\d+[a-z]?$/, '');
  const first = fromKey ? fromKey[0].toUpperCase() + fromKey.slice(1) : (authorList(p)[0] ?? '').split(/\s+/).pop();
  return `${first}${authorList(p).length > 1 ? ' et al.' : ''} ${p.year ?? ''}`.trim();
}

function reported(p) {
  const v = p.reported_value;
  if (typeof v !== 'number') return v ?? '—';
  const rate = /acc|f1|top|hit|precision|recall/i.test(p.reported_metric ?? '');
  const shown = rate ? `${(v <= 1 ? v * 100 : v).toFixed(2)}%` : v.toLocaleString('en-IN');
  return `${p.reported_metric ? `${p.reported_metric} ` : ''}${shown}`;
}

function RelatedWork({ papers, ours }) {
  const codes = Object.keys(GAPS).filter((c) => papers.some((p) => p.gaps?.includes(c)) || ours);
  const rows = ours ? [...papers, ours] : papers;
  return (
    <>
      <div>
        <p className="tcap">
          Recent crop-recommendation studies
          <span className="tcap-note">Reported numbers are on their own data and splits, not comparable to ours.</span>
        </p>
        <div className="table-wrap">
          <table className="data related-table">
            <thead>
              <tr>
                <th scope="col">Paper</th>
                <th scope="col">Dataset</th>
                <th scope="col">Method</th>
                <th scope="col">Reported result</th>
                <th scope="col">Protocol</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((p) => (
                <tr key={p.key}>
                  <th scope="row">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer">
                        {p.title}
                      </a>
                    ) : (
                      p.title
                    )}
                    <span className="paper-meta">
                      {authorText(p)}
                      {p.year ? ` · ${p.year}` : ''}
                      {p.venue ? ` · ${p.venue}` : ''}
                    </span>
                  </th>
                  <td>
                    {p.dataset ?? '—'}
                    {typeof p.n_rows === 'number' && <span className="paper-meta">{p.n_rows.toLocaleString('en-IN')} rows</span>}
                  </td>
                  <td>{p.method ?? '—'}</td>
                  <td>
                    {reported(p)}
                    {typeof p.reported_value !== 'number' && p.reported_metric && <span className="paper-meta">{p.reported_metric}</span>}
                  </td>
                  <td>{p.protocol ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sub-section">
        <p className="tcap">
          Where each study falls short
          <span className="tcap-note">✗ the study has this shortcoming · ✓ it avoids it{ours ? '. The last row is this project.' : ''}</span>
        </p>
        <div className="table-wrap">
          <table className="data gap-matrix">
            <thead>
              <tr>
                <th scope="col">Study</th>
                {codes.map((c) => (
                  <th key={c} scope="col" className="c wrap">
                    {GAPS[c]}
                  </th>
                ))}
                <th scope="col" className="num">
                  Gaps
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const has = new Set(p.gaps ?? []);
                const n = codes.filter((c) => has.has(c)).length;
                return (
                  <tr key={p.key} className={isOursEntry(p) ? 'is-highlight' : undefined}>
                    <th scope="row">{isOursEntry(p) ? 'AgroMind (ours)' : paperShort(p)}</th>
                    {codes.map((c) => (
                      <td key={c} className={`c ${has.has(c) ? 'off' : 'ok'}`} aria-label={`${GAPS[c]}: ${has.has(c) ? 'yes' : 'no'}`}>
                        {has.has(c) ? '✗' : '✓'}
                      </td>
                    ))}
                    <td className="num">
                      {n} / {codes.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {ours?.note && <p className="note">{ours.note}</p>}
        {papers.some((p) => p.gap_text) && (
          <details className="gap-details">
            <summary>What each study gets wrong ({papers.filter((p) => p.gap_text).length} notes)</summary>
            <ul className="gap-notes">
              {papers
                .filter((p) => p.gap_text)
                .map((p) => (
                  <li key={p.key}>
                    <strong>{paperShort(p)}:</strong> {p.gap_text}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>
    </>
  );
}

// Split keys come as strings or {key, label}; colours follow the split, never its rank (validated: blue, orange, aqua on white, all pairs).
const SPLIT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'];
const pctP = (v) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '—'); // method_comparison rates are already percentages
const isChosen = (m, chosen) => (chosen ? m.name.replace(/\s*\(ours\)$/, '') === chosen : m.source === 'ours');
const SPLIT_NAMES = { random: 'Random split', 'leave-states-out': 'Unseen states', 'leave-years-out': 'Future years' };
const splitList = (splits, labels = {}) =>
  (splits ?? []).map((s, i) => ({ key: s.key ?? s, label: labels[s.key ?? s] ?? s.label ?? SPLIT_NAMES[s.key ?? s] ?? s.key ?? s, color: SPLIT_COLORS[i] })).slice(0, 3);

// Citation for a reimplemented method, unless its name already carries it, e.g. "XGBoost (Dey 2024)".
function sourceLabel(src, papers, name = '') {
  if (!src || src === 'ours' || src === 'baseline') return null;
  const p = papers.find((x) => x.key === src);
  const label = p ? paperShort(p) : String(src);
  return name.toLowerCase().includes(label.split(' ')[0].toLowerCase()) ? null : label;
}
const bySplit = (v, split) => (v && typeof v === 'object' ? v[split] : v); // fields come per split or as one number

function HitDotPlot({ methods, splits, chosen, papers }) {
  const [active, setActive] = useState(null); // index of the row whose readout is open
  const sortKey = (splits.find((s) => /state/.test(s.key)) ?? splits[0])?.key;
  const rows = [...methods].sort((a, b) => (b.hit1?.[sortKey] ?? -1) - (a.hit1?.[sortKey] ?? -1));
  const values = rows.flatMap((m) => splits.map((s) => m.hit1?.[s.key])).filter((v) => typeof v === 'number');
  const top = Math.min(100, Math.ceil((Math.max(...values, 10) + 2) / 10) * 10);
  const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10).filter((t, i, all) => all.length <= 6 || i % 2 === 0);
  const x = (v) => `${(v / top) * 100}%`;
  const offset = (i) => (i - (splits.length - 1) / 2) * 7; // separate the three dots a little vertically
  const describe = (m) => `${m.name}: ${splits.map((s) => `${s.label} ${pctP(m.hit1?.[s.key])}`).join(', ')}`;

  return (
    <figure className="dotplot">
      <figcaption className="fcap">
        Hit@1 of each method on the three test splits{sortKey ? `, sorted by ${splits.find((s) => s.key === sortKey)?.label.toLowerCase()}` : ''}
        <span className="tcap-note">Hover or focus a row for its values; the selection table below lists them all.</span>
      </figcaption>
      <ul className="dp-legend" aria-label="Splits">
        {splits.map((s) => (
          <li key={s.key}>
            <span className="dp-key" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="dp-body">
        {rows.map((m, r) => {
          const ours = isChosen(m, chosen);
          const cite = sourceLabel(m.source, papers, m.name);
          const shown = splits.map((s) => m.hit1?.[s.key]).filter((v) => typeof v === 'number');
          // One hit target per row: close dots would otherwise overlap each other's hover area on narrow screens.
          return (
            <div
              key={m.name}
              className={`dp-row${ours ? ' is-ours' : ''}${active === r ? ' is-active' : ''}`}
              tabIndex={0}
              role="group"
              aria-label={describe(m)}
              onMouseEnter={() => setActive(r)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(r)}
              onBlur={() => setActive(null)}
            >
              <div className="dp-label">
                {m.name}
                {cite && <span className="dp-cite">{cite}</span>}
              </div>
              <div className="dp-track" aria-hidden="true">
                {ticks.map((t) => (
                  <span key={t} className="dp-grid" style={{ left: x(t) }} />
                ))}
                {splits.map((s, i) =>
                  typeof m.hit1?.[s.key] === 'number' ? (
                    <span key={s.key} className="dp-dot" style={{ left: x(m.hit1[s.key]), top: `calc(50% + ${offset(i)}px)`, background: s.color }} />
                  ) : null,
                )}
                {ours && typeof m.hit1?.[sortKey] === 'number' && active !== r && (
                  <span className="dp-value" style={{ left: x(m.hit1[sortKey]) }}>
                    {pctP(m.hit1[sortKey])}
                  </span>
                )}
                {active === r && shown.length > 0 && (
                  <span className="dp-tip" style={{ left: `clamp(0px, calc(${x(Math.max(...shown))} - 4.75rem), calc(100% - 9.5rem))` }}>
                    {splits.map((s) =>
                      typeof m.hit1?.[s.key] === 'number' ? (
                        <span key={s.key}>
                          <strong>{pctP(m.hit1[s.key])}</strong>
                          <i style={{ background: s.color }} />
                          {s.label}
                        </span>
                      ) : null,
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div className="dp-row dp-axis" aria-hidden="true">
          <div className="dp-label" />
          <div className="dp-track">
            {ticks.map((t) => (
              <span key={t} className="dp-tick" style={{ left: x(t) }}>
                {t}%
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

const yesNo = (v) => (v === true ? 'yes' : v === false ? 'no' : (v ?? '—'));
const ms = (v) => (typeof v !== 'number' ? '—' : v < 1 ? v.toFixed(2) : v.toLocaleString('en-IN', { maximumFractionDigits: 1 }));

function MethodComparison({ mc, papers }) {
  const splits = splitList(mc.splits, mc.split_labels);
  const methods = mc.methods ?? [];
  const sortKey = mc.primary_split ?? (splits.find((s) => /state/.test(s.key)) ?? splits[0])?.key;
  const rows = [...methods].sort((a, b) => (b.hit1?.[sortKey] ?? -1) - (a.hit1?.[sortKey] ?? -1));
  const ablation = Array.isArray(mc.ablation) ? mc.ablation.filter((a) => a && typeof a === 'object') : [];
  const pSplit = sortKey;
  const conf = (c) => (c && typeof c.cov === 'number' ? `${c.cov.toFixed(1)}% · ${typeof c.size === 'number' ? c.size.toFixed(2) : '—'}` : '—');

  return (
    <>
      {splits.length > 0 && methods.length > 0 && <HitDotPlot methods={methods} splits={splits} chosen={mc.chosen} papers={papers} />}

      {methods.length > 0 && (
        <div className="sub-section">
          <p className="tcap">
            Selection table
            <span className="tcap-note">
              Hit@1 per split. Cold start = queries where some candidate crop has no yield record for the previous year. p = paired Wilcoxon test against the chosen method on
              {` ${splits.find((s) => s.key === pSplit)?.label.toLowerCase() ?? 'the main split'}`}. Conformal ={' '}
              {methods.find((m) => m.conformal?.calibration)?.conformal.calibration ?? '90%'} set on unseen states: coverage · average set size, the same for every method (the
              served state-robust sets are in Section 2).
            </span>
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  <th scope="col" className="hide-sm">
                    Family
                  </th>
                  {splits.map((s) => (
                    <th key={s.key} scope="col" className="num wrap">
                      {s.label}
                    </th>
                  ))}
                  <th scope="col" className="num wrap">
                    Cold start ({splits.find((s) => s.key === pSplit)?.label.toLowerCase()})
                  </th>
                  <th scope="col" className="num">
                    p
                  </th>
                  <th scope="col" className="num wrap">
                    Train (s)
                  </th>
                  <th scope="col" className="num wrap">
                    Infer (ms)
                  </th>
                  <th scope="col" className="num wrap">
                    Conformal
                  </th>
                  <th scope="col" className="wrap hide-sm">
                    Interpretability
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.name} className={isChosen(m, mc.chosen) ? 'is-highlight' : undefined}>
                    <th scope="row">
                      {m.name}
                      {sourceLabel(m.source, papers, m.name) && <span className="paper-meta">after {sourceLabel(m.source, papers, m.name)}</span>}
                    </th>
                    <td className="hide-sm">{m.family ?? '—'}</td>
                    {splits.map((s) => (
                      <td key={s.key} className="num">
                        {pctP(m.hit1?.[s.key])}
                      </td>
                    ))}
                    <td className="num">{pctP(bySplit(m.hit1_cold, pSplit))}</td>
                    <td className="num">{isChosen(m, mc.chosen) ? '—' : pval(typeof m.p_vs_ours === 'object' ? m.p_vs_ours?.[pSplit] : m.p_vs_ours)}</td>
                    <td className="num">{ms(m.train_s)}</td>
                    <td className="num">{ms(m.infer_ms)}</td>
                    <td className="num">{conf(m.conformal)}</td>
                    <td className="hide-sm">{typeof m.interpretable === 'string' ? m.interpretable : yesNo(m.interpretable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ablation.length > 0 && (
        <div className="sub-section">
          <p className="tcap">Ablation of {mc.chosen ?? 'the chosen method'}: what each component contributes</p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Variant</th>
                  <th scope="col" className="hide-sm">
                    Removed
                  </th>
                  {splits.map((s) => (
                    <th key={s.key} scope="col" className="num wrap">
                      Hit@1 {s.label.toLowerCase()}
                    </th>
                  ))}
                  <th scope="col" className="num wrap">
                    NDCG@3 {splits.find((s) => s.key === pSplit)?.label.toLowerCase()}
                  </th>
                  <th scope="col" className="num">
                    Conformal
                  </th>
                </tr>
              </thead>
              <tbody>
                {ablation.map((a, r) => (
                  <tr key={a.name ?? r}>
                    <th scope="row">
                      {a.name}
                      {a.note && <span className="paper-meta">{a.note}</span>}
                    </th>
                    <td className="hide-sm">{a.removed ?? '—'}</td>
                    {splits.map((s) => (
                      <td key={s.key} className="num">
                        {pctP(a.hit1?.[s.key])}
                      </td>
                    ))}
                    <td className="num">{typeof a.ndcg3?.[pSplit] === 'number' ? a.ndcg3[pSplit].toFixed(3) : '—'}</td>
                    <td className="num">{conf(a.conformal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {Array.isArray(mc.why) && mc.why.length > 0 && (
        <div className="sub-section">
          <h3 className="why-h">Why {mc.chosen ?? 'this method'}</h3>
          <ul className="why">
            {mc.why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// Headline of the final model, from results.json `final`. Renders nothing until CC5 writes it.
function FinalBox({ f }) {
  const items = Array.isArray(f?.headline) ? f.headline.filter((h) => h && h.label && h.value != null) : [];
  if (!items.length) return null;
  return (
    <section className="keybox final-box" aria-labelledby="final-h">
      <h2 id="final-h">Final model: {f.name ?? FINAL}</h2>
      {f.method && <p>{f.method}</p>}
      <dl className="final-stats">
        {items.map((h) => (
          <div key={h.label}>
            <dt>{h.label}</dt>
            <dd>
              {h.value}
              {h.unit === '%' ? '%' : h.unit ? ` ${h.unit}` : ''}
              {h.split && <small>{SPLIT_NAMES[h.split] ?? h.split}</small>}
            </dd>
          </div>
        ))}
      </dl>
      {f.note && <p className="note">{f.note}</p>}
    </section>
  );
}

function ResultsPage({ t }) {
  const [info, setInfo] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getJSON('/model-info')
      .then(setInfo)
      .catch(() => setFailed(true));
  }, []);
  const served = info?.model ? { ...info, ...(info.data ?? {}) } : null; // v4 nests its counts in data

  return (
    <div className="results">
      <header className="page-head">
        <h1>{t('results')}</h1>
        <p className="lede">
          {FINAL} ranks the crops grown in a district by the yield they can be expected to give, with a 90% prediction set. This page shows how it holds up on states and years it
          has not seen, how it compares with other methods and recent work, and how it grew out of the earlier versions v1, v2 and v3. Every number below is generated from{' '}
          <code>docs/research/results.json</code>, written by the research notebooks.
        </p>
      </header>

      {research._placeholder && (
        <div className="keybox is-warn" role="note">
          <strong>Placeholder data.</strong> {research.note}
        </div>
      )}

      <FinalBox f={research.final} />

      <Section id="r-improvement" title={`From v1 to ${FINAL}`} className="numbered">
        <VersionHistory r={research} />
        <ImprovementTable r={research} />
      </Section>

      {research.v4?.metrics?.main && (
        <Section id="r-v4" title={`${FINAL}: YieldRank and conformal prediction sets`} className="numbered">
          <V4Section v={research.v4} fin={research.final?.numbers} served={served} failed={failed} />
        </Section>
      )}

      {research.method_comparison?.methods?.length > 0 && (
        <Section id="r-methods" title={`Method comparison: why we chose ${research.method_comparison.chosen ?? 'YieldRank'}`} className="numbered">
          <MethodComparison mc={research.method_comparison} papers={paperList(research.related_work)} />
        </Section>
      )}

      {paperList(research.related_work).length > 0 && (
        <Section id="r-related" title="Recent work and where it falls short" className="numbered">
          <RelatedWork papers={paperList(research.related_work)} ours={research.related_work_ours ? { key: 'agromind', ours: true, ...research.related_work_ours } : null} />
        </Section>
      )}

      {research.v3 && (
        <Section id="r-v3" title="Intermediate step: v3" className="numbered">
          <V3Section v={research.v3} />
        </Section>
      )}

      {research.models?.[V2_MODEL] && (
        <Section id="r-v2" title="Earlier step: v2" className="numbered">
          <V2Section r={research} />
        </Section>
      )}
    </div>
  );
}

/* ── Paper ────────────────────────────────────────────── */

const PAPER_TITLE = 'Beyond 99%: Yield-Grounded Crop Ranking with Conformal Prediction Sets, Evaluated on Unseen Indian States and Years';

// Abstract copied from paper/main.tex; \Macros are filled from results.json v4.numbers (the same values numbers.tex holds).
const ABSTRACT_TEX = String.raw`Crop-recommendation papers routinely report 97--99.9\% accuracy, almost always on a small,
augmented, location-free table split at random. We ask how such recommenders behave on real data
in states and years they have never seen. From Government of India
district\,$\times$\,season\,$\times$\,year crop statistics joined with NASA POWER climate and
SoilGrids soil, we build a benchmark of \NQueries{} district-season-years (\NCrops{} crops,
\NStates{} states/UTs, \YearA--\YearB). We recast recommendation as \emph{ranking the crops grown in
a district by realised yield}. Four classifier families from the literature, which reach
\KaggleRF\% on the Kaggle table, pick the best-yielding crop in at most \BaseHitR\% of cases under
a random split. On held-out states this falls to \BaseHitLSO\%, below a one-line rule that repeats
last year's yield ranking (\PersHitLSO\%). A yield-grounded ranker (YieldRank) reaches
\OursHitLSO\% on held-out states (+\GainHitLSO{} points over \BaseNameLSO, NDCG@3
\BaseNDCGLSO$\to$\OursNDCGLSO). Its margin over persistence is small overall but
\OursHitColdLSO\% vs \PersHitColdLSO\% on the \ColdShareLSO\% of cases where some crop lacks
last-year history. Split-conformal sets at a 90\% target cover the best crop in \CovIIDLSO\% of
unseen-state cases with \SizeIIDLSO{} crops on average, but coverage drops to \WorstIID\% in the
worst state. Calibrating the classifiers on held-out states rather than i.i.d.\ queries raises
Random-Forest coverage from \RFCovIIDMean\% to \RFCovGRPMean\%.`;

function texToText(tex, numbers) {
  return tex
    .replace(/\\emph\{([^}]*)\}/g, '$1')
    .replace(/\\,\$\\times\$\\,/g, ' × ')
    .replace(/\$\\to\$/g, ' → ')
    .replace(/\\([A-Za-z]+)(\{\})?/g, (m, name) => numbers[name] ?? '—')
    .replace(/\\%/g, '%')
    .replace(/\\ /g, ' ')
    .replace(/--/g, '–')
    .replace(/\s*\n\s*/g, ' ');
}

// Final model first, then the steps that led to it.
const NOTEBOOKS = [
  [
    'AgroMind_v4_Novel_Method.ipynb',
    `${FINAL}: YieldRank (a listwise ranker and a pointwise yield model blended with last-year persistence) with state-robust conformal sets; the v1 → v4 progression at the top.`,
  ],
  [
    'AgroMind_Method_Comparison.ipynb',
    'Every method (6 recent papers reimplemented, classic baselines and ranker variants) on the same v4 queries and splits, with the ablation and why YieldRank.',
  ],
  ['AgroMind_v3_LargeScale.ipynb', 'v3: Government district crop statistics with NASA POWER climate and SoilGrids soil; unseen districts, states and years.'],
  ['AgroMind_v2_Research.ipynb', 'v1 reproduction and corrected decode; v2 merged data, 10-model comparison, ablation, leave-one-source-out, McNemar, calibration.'],
];

function PaperPage() {
  const numbers = research.v4?.numbers ?? {};
  const [copied, setCopied] = useState(false);
  const copyBib = () =>
    navigator.clipboard?.writeText(bibtex).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  const authors = AUTHORS.map((n) => n.replace(/^Dr\.\s*/, '')).join(' and '); // no titles in BibTeX author fields
  const bibtex = `@misc{agromind2026,
  title        = {${PAPER_TITLE.replace('%', '\\%')}},
  author       = {${authors}},
  year         = {2026},
  note         = {B.Tech project, Department of ${SITE.department}, ${SITE.college}},
  howpublished = {\\url{${SITE.repo}}}
}`;
  const blob = (path) => `${SITE.repo}/blob/main/${path}`;
  const colab = (file) => `https://colab.research.google.com/github/${SITE.repo.replace('https://github.com/', '')}/blob/main/notebooks/${file}`;
  // public/paper/ is filled by scripts/sync-paper.mjs before dev/build; without it the links fall back to the repository.
  const [meta, setMeta] = useState(null);
  const frame = useRef(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}paper/meta.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);
  const local = (file) => (file ? `${import.meta.env.BASE_URL}paper/${file}` : null);
  const pdf = local(meta?.pdf);
  const pdfHref = pdf ?? blob('paper/main.pdf');
  const print = () => {
    // Print the embedded PDF; where the viewer is hidden (phones) or blocked, open the PDF to print from there.
    try {
      if (!frame.current?.offsetParent) throw new Error('viewer hidden');
      frame.current.contentWindow.focus();
      frame.current.contentWindow.print();
    } catch {
      window.open(pdfHref, '_blank', 'noopener');
    }
  };
  const facts = [meta?.compiled && `Compiled ${longDate(meta.compiled)}`, meta?.pages && `${meta.pages} pages`, meta?.bytes && `PDF, ${Math.round(meta.bytes / 1024)} KB`].filter(
    Boolean,
  );

  return (
    <article className="paper">
      <header className="page-head">
        <p className="eyebrow">Paper · preprint · {FINAL}</p>
        <h1>{PAPER_TITLE}</h1>
        <p className="authors">
          {AUTHORS.join(', ')}
          <br />
          Department of {SITE.department}, {SITE.college} · Supervisor: {SITE.guide}, {SITE.guideTitle}
        </p>
        {facts.length > 0 && <p className="paper-facts">{facts.join(' · ')}</p>}
      </header>

      <Section id="abstract" title="Abstract">
        <p className="abstract">{texToText(ABSTRACT_TEX, numbers)}</p>
        {!research.v4?.numbers && <p className="note">Numbers appear once results.json contains v4.numbers.</p>}
      </Section>

      <Section id="full-paper" title="Full paper">
        <div className="paper-tools" role="toolbar" aria-label="Paper actions">
          <a className="btn btn-small" href={pdfHref} {...(pdf ? { download: 'AgroMind_v4_paper.pdf' } : { target: '_blank', rel: 'noreferrer' })}>
            Download PDF
          </a>
          <a className="btn btn-plain btn-small" href={pdfHref} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
          <button type="button" className="btn btn-plain btn-small" onClick={copyBib}>
            {copied ? 'BibTeX copied' : 'Copy BibTeX'}
          </button>
          <a
            className="btn btn-plain btn-small"
            href={local(meta?.latex) ?? blob('paper/main.tex')}
            {...(meta?.latex ? { download: meta.latex } : { target: '_blank', rel: 'noreferrer' })}
          >
            LaTeX source{meta?.latex?.endsWith('.zip') ? ' (zip)' : ''}
          </a>
          <a className="btn btn-plain btn-small" href={local(meta?.newsletter) ?? blob('docs/newsletter/AgroMind_Newsletter.pdf')} target="_blank" rel="noreferrer">
            Newsletter PDF
          </a>
          <a className="btn btn-plain btn-small" href={colab(NOTEBOOKS[0][0])} target="_blank" rel="noreferrer">
            Open in Colab
          </a>
          <button type="button" className="btn btn-plain btn-small" onClick={print}>
            Print
          </button>
        </div>
        {pdf ? (
          <>
            <iframe ref={frame} className="pdf-frame" src={`${pdf}#view=FitH`} title={`${PAPER_TITLE} (PDF)`} />
            <p className="pdf-mobile">
              Phones show only the first page of an embedded PDF.{' '}
              <a className="btn" href={pdf} target="_blank" rel="noreferrer">
                Open the paper{meta.pages ? ` (${meta.pages} pages)` : ''}
              </a>
            </p>
          </>
        ) : (
          <p className="note">
            The PDF copy is not in this build.{' '}
            <a href={pdfHref} target="_blank" rel="noreferrer">
              Read the paper in the repository
            </a>
            .
          </p>
        )}
      </Section>

      <Section id="notebooks" title="Notebooks">
        <div className="table-wrap">
          <table className="data nb-table">
            <caption className="visually-hidden">Research notebooks</caption>
            <thead>
              <tr>
                <th scope="col">Notebook</th>
                <th scope="col">Contents</th>
                <th scope="col">Run</th>
              </tr>
            </thead>
            <tbody>
              {NOTEBOOKS.map(([file, about]) => (
                <tr key={file}>
                  <th scope="row">
                    <a href={blob(`notebooks/${file}`)} target="_blank" rel="noreferrer">
                      {file}
                    </a>
                  </th>
                  <td>{about}</td>
                  <td>
                    <a href={colab(file)} target="_blank" rel="noreferrer">
                      <span className="badge">Open in Colab</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="cite" title="Cite this">
        <pre className="bibtex">{bibtex}</pre>
      </Section>
    </article>
  );
}

/* ── About ────────────────────────────────────────────── */

const DATA_SOURCES = [
  // Wording for the four district-data rows follows docs/research/DATA_PROVENANCE.md.
  [
    'Crop area & production: Directorate of Economics & Statistics, Ministry of Agriculture & Farmers Welfare, Govt. of India — APY district-wise season-wise statistics, 1997-98 to 2022-23, data.desagri.gov.in',
    `${FINAL}: crops grown, area, production and yield (training data and benchmark; also v3)`,
    'Reproduced with acknowledgement under the DES copyright policy',
  ],
  ['Climate: NASA POWER (power.larc.nasa.gov), 1997–2023', 'Season temperature, humidity and rainfall at district centres', 'NASA open data, no restrictions; cite POWER'],
  ['Soil: ISRIC SoilGrids 2.0', `District soil inputs to ${FINAL}`, 'CC BY 4.0'],
  ['District boundaries: datta07/INDIAN-SHAPEFILES', 'District centres', 'MIT'],
  ['Kaggle Crop Recommendation dataset (2,200 rows)', 'v1 and v2 research models (Results page)', 'As listed on the Kaggle dataset page'],
  [
    'Multi-state India crop records (8,000 rows) and Tamil Nadu field records (57,000 rows)',
    'v2 research model (Results page)',
    'Supplied with the original project; source licence to be confirmed',
  ],
];

function AboutPage() {
  return (
    <>
      <header className="page-head">
        <h1>About</h1>
        <p className="lede">
          AgroMind is a final year project of the Department of {SITE.department}, {SITE.college} ({SITE.programme}, session {SITE.session}). Its final model, {FINAL}, ranks the
          crops grown in an Indian district by the yield they can be expected to give, from the district&apos;s yield history, season climate and soil, with a 90% prediction set;
          the project also studies how such recommenders hold up on states and years they have never seen.
        </p>
      </header>

      <Section id="team" title="Team">
        <table className="data narrow">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Roll no.</th>
              <th scope="col">Role</th>
            </tr>
          </thead>
          <tbody>
            {SITE.team.map(([name, roll]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td className="num">{roll}</td>
                <td>Student, {SITE.programme}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">{SITE.guide}</th>
              <td />
              <td>Professor &amp; Project Supervisor, {SITE.short}</td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          Contact: {SITE.contact[0]}, <a href={`mailto:${SITE.contact[1]}`}>{SITE.contact[1]}</a>
        </p>
      </Section>

      <Section id="system" title="System">
        <table className="kv">
          <tbody>
            <tr>
              <th scope="row">Advisory model</th>
              <td>
                {FINAL}: YieldRank ranks the crops grown in a district by expected yield and gives a 90% conformal prediction set. Trained on Government of India district crop
                statistics. The previous project (v1) and the intermediate system (v3) are documented on the Results page.
              </td>
            </tr>
            <tr>
              <th scope="row">Method</th>
              <td>YieldRank, a yield-grounded ranker with split-conformal prediction sets (see Paper)</td>
            </tr>
            <tr>
              <th scope="row">Software</th>
              <td>React 18 and Vite (interface); Python, FastAPI, LightGBM and scikit-learn (server and research)</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section id="sources" title="Data sources and licences">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Used for</th>
                <th scope="col">Licence</th>
              </tr>
            </thead>
            <tbody>
              {DATA_SOURCES.map(([src, use, lic]) => (
                <tr key={src}>
                  <th scope="row">{src}</th>
                  <td>{use}</td>
                  <td>{lic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          Full provenance, file hashes and processing steps: <code>docs/research/DATASET.md</code>.
        </p>
      </Section>

      <p className="disclaimer">
        Academic project. Recommendations come from a statistical model and are not agronomic advice; this is not an official Government of India website or service.
      </p>
    </>
  );
}

export default App;
