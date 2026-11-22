import { useEffect, useRef, useState } from 'react';
import research from './research.json';

// Project identity: fill in the placeholders before submission.
const SITE = {
  department: '[Department]',
  college: '[College Name]',
  address: '[College Address, City, State – PIN]',
  team: ['[Student Name 1]', '[Student Name 2]', '[Student Name 3]', '[Student Name 4]'],
  guide: '[Guide Name], [Designation]',
  email: '[project-email@college.edu]',
  session: '2026–27',
  repo: 'https://github.com/ravixalgorithm/agromind',
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const SAVED_KEY = 'agromind.saved-analyses.v3';
// Keys left by the removed soil-test mode; cleared once so old v2 entries don't linger.
const OLD_KEYS = ['agromind.saved-analyses.v2', 'agromind.active-analysis.v2', 'agromind.advisory-mode'];
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

const prob = (p) => (p > 0 && p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`);
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
          AgroMind · final year project, Dept. of {SITE.department}, {SITE.college} ({SITE.session}). An academic research prototype, not an official Government of India service.
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
      .then((d) => setV3(d.rows ? d : null))
      .catch(() => setV3(null));
  }, []);
  return v3;
}

// The API gives crop-year starts: [1997, 2022] means crop years 1997-98 to 2022-23.
const cropYear = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
const yearSpan = (years) => (years ? `crop years ${cropYear(years[0])} to ${cropYear(years[1])}` : '');
const districtCount = (v3) => `${v3.districts} districts${v3.locations ? ` (${v3.locations} locations)` : ''}`;

function useV3Stats() {
  const v3 = useV3Info();
  if (!v3?.rows) return null;
  return [`${v3.rows.toLocaleString('en-IN')} records`, districtCount(v3), `${v3.states} states`, yearSpan(v3.years)].filter(Boolean).join(' · ');
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
  const [showAll, setShowAll] = useState(false);
  const warm = useRef(false); // the first prediction after the server starts loads the model (~3 s)
  const resultsRef = useRef(null);
  const stats = useV3Stats();
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
    setShowAll(false);
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
          body: JSON.stringify({ state: info.state, district: info.district, season: info.season, ...Object.fromEntries(V3_CLIMATE.map((f) => [f.key, Number(climate[f.key])])) }),
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
  }, [info, climate, climateReady]);

  // Autosave: one entry per district and season, updated with the latest climate and pick.
  useEffect(() => {
    const top = result?.recommendations?.[0];
    if (status !== 'ready' || !top) return;
    const entry = {
      id: analysisId(result),
      state: result.state,
      district: result.district,
      season: result.season,
      climate: Object.fromEntries(V3_CLIMATE.map((f) => [f.key, result.inputs?.[f.key]])),
      edited,
      pick: { crop: top.crop, name: top.name, probability: top.probability },
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
  const shown = showAll ? recs : recs.slice(0, 10);
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
              {info ? `Pre-filled with this district's ${info.season === 'whole_year' ? 'yearly' : 'season'} average over ${info.climate_years} years. ` : ''}Changing a value
              changes the prediction.
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
                Choose a <strong>state, district and season</strong>. The district&apos;s season climate is filled in from NASA POWER, and every crop is ranked by the model trained
                on Government of India district crop statistics.
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
                </p>
                <h2 id="v3-rec-h" className="rec-crop">
                  {top.name} <span className="rec-type">{cropInfo(top.crop)?.type}</span>
                </h2>
                <dl className="stats">
                  <div>
                    <dt>P(crop)</dt>
                    <dd>{prob(top.probability)}</dd>
                  </div>
                  <div>
                    <dt>Grown in this district</dt>
                    <dd className={top.grown_here ? 'ok' : 'off'}>{top.grown_here ? `${top.years_grown} yrs` : 'No'}</dd>
                  </div>
                  <div>
                    <dt>Median yield here</dt>
                    <dd>
                      {typeof top.historical_median_yield === 'number' ? num(top.historical_median_yield, 2) : '—'}
                      {typeof top.historical_median_yield === 'number' && <small className="unit"> {top.yield_unit}</small>}
                    </dd>
                  </div>
                  <div>
                    <dt>Climate used</dt>
                    <dd className="dd-text">
                      {num(result.inputs.temperature)} °C · {num(result.inputs.humidity)}% · {num(result.inputs.rainfall, 0)} mm
                    </dd>
                  </div>
                </dl>
                {status === 'loading' && <p className="muted small">{loadingText}</p>}
                {result.note && <p className="note">{result.note}</p>}
              </section>

              <section className="block" aria-labelledby="v3-top-h">
                <h3 id="v3-top-h">
                  {t('topCrops')} · {place}
                </h3>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Crop</th>
                        <th scope="col" className="hide-sm">
                          Type
                        </th>
                        <th scope="col" className="num">
                          P(crop)
                        </th>
                        <th scope="col" className="num wrap">
                          Median yield here
                        </th>
                        <th scope="col" className="num wrap hide-sm">
                          Years grown
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r, i) => (
                        <tr key={r.crop} className={i === 0 ? 'is-selected' : undefined}>
                          <td>{i + 1}</td>
                          <th scope="row">{r.name}</th>
                          <td className="hide-sm">{cropInfo(r.crop)?.type ?? ''}</td>
                          <td className="num">{prob(r.probability)}</td>
                          <td className="num">{typeof r.historical_median_yield === 'number' ? `${num(r.historical_median_yield, 2)} ${r.yield_unit ?? ''}` : '—'}</td>
                          <td className="num hide-sm">{r.grown_here ? r.years_grown : <span className="muted">not grown</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="note">
                  P(crop) is the model&apos;s probability that the crop is among this district&apos;s three best-yielding crops for the season. Median yield is the district&apos;s
                  historical median for that crop in this season (Government APY records).{' '}
                  {recs.length > 10 && (
                    <button type="button" className="link-btn" onClick={() => setShowAll((s) => !s)}>
                      {showAll ? 'Show top 10' : `Show all ${recs.length} crops`}
                    </button>
                  )}
                </p>
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
                            <td className="num">{typeof c.median_yield === 'number' ? `${num(c.median_yield, 2)} ${c.yield_unit ?? ''}` : '—'}</td>
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
                  <h3 id="v3-soil-h">District soil profile (SoilGrids, context only)</h3>
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
                    Not used by the model: adding soil gave no gain in the study (Results, v3). District centre {num(info.location?.lat, 3)}° N, {num(info.location?.lon, 3)}° E.
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
                    P(crop)
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
          Government of India district-wise, season-wise crop statistics (APY){stats ? `: ${stats}` : ''}, joined with NASA POWER climate and SoilGrids soil. These are the records
          behind the advisory. Licences are listed on the <a href="#/about">About</a> page.
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
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const metric = (r, m) => r?.[`${m}_mean`] ?? r?.[m];
const isOurs = (name) => name.includes('(ours)');
const isClassifier = (name) => /\[[\d,]+\]/.test(name); // literature classifiers carry their citation numbers
// The pointwise LightGBM row uses the proposed yield-ranking formulation too; name it so it doesn't read as an outside baseline.
const methodName = (name) => (/pointwise/i.test(name) ? 'LightGBM pointwise (same yield-ranking formulation, ours)' : name);
const MIN_STATE_QUERIES = 30;
const V3_TESTS = [
  ['leave_districts_out', 'Unseen districts'],
  ['leave_years_out', 'Future crop years'],
  ['leave_states_out', 'Unseen states'],
];

// For one grouped test: the ExtraTrees row (the served model) and the best popularity baseline by Hit@1.
function v3Pair(test) {
  const rows = Object.entries(test ?? {});
  const model = rows.find(([n]) => n.startsWith('ExtraTrees'));
  const base = rows.filter(([n]) => n.startsWith('baseline')).sort((a, b) => metric(b[1], 'hit1') - metric(a[1], 'hit1'))[0];
  return model && base ? { model, base } : null;
}

function ImprovementTable({ r }) {
  const v1 = r.v1?.RandomForest;
  const imp = Object.fromEntries((r.improvement ?? []).map((x) => [x.aspect, x.v1]));
  const v3 = r.v3 ?? {};
  const v3sum = Object.fromEntries((v3.summary ?? []).map((x) => [x.aspect, x.v3]));
  const n = r.v4?.numbers ?? {};
  const m4 = r.v4?.meta ?? {};
  const kaggle = r.dataset?.rows_by_source?.kaggle;
  const pairs = Object.fromEntries(V3_TESTS.map(([k]) => [k, v3Pair(v3[k])]));
  const vs = (p) => (p ? `${pct1(metric(p.model[1], 'hit1'))} vs ${pct1(metric(p.base[1], 'hit1'))} baseline` : '—');
  const rows = [
    [
      'Data',
      `Kaggle crop-recommendation table, ${kaggle?.toLocaleString('en-IN') ?? '—'} rows`,
      `Government of India district crop statistics, ${v3.data?.rows?.toLocaleString('en-IN') ?? '—'} records`,
      `Same statistics as ${n.NQueries ?? '—'} district-season-year queries`,
    ],
    [
      'Coverage',
      `${r.dataset?.crops_by_source?.kaggle ?? '—'} crops; no location or season`,
      `${v3.data?.crops_app ?? '—'} crops · ${v3.data?.districts ?? '—'} districts · ${v3.data?.states ?? '—'} states · ${v3.data?.crop_years ?? '—'} crop years`,
      `${m4.crops ?? '—'} crops · ${m4.states ?? '—'} states · ${n.YearA ?? '—'}–${n.YearB ?? '—'}`,
    ],
    ['What is predicted', 'One crop label per row', v3sum.Labels ?? '—', 'A ranking of the crops grown in a district by realised yield, plus a 90% prediction set'],
    ['Evaluation', imp['Evaluation protocol'] ?? '—', v3sum.Validation ?? '—', 'Random split, unseen states and future years; Wilcoxon tests'],
    [
      'Headline result',
      `${pct2(v1?.reported_accuracy)} accuracy on a random split (reported)`,
      `Unseen districts: ${vs(pairs.leave_districts_out)} (Hit@1)`,
      `Unseen states: ${n.OursHitLSO ?? '—'}% vs ${n.BaseHitLSO ?? '—'}% for the best classifier (${n.BaseNameLSO ?? '—'}); persistence ${n.PersHitLSO ?? '—'}%`,
    ],
    [
      'Tested on new places and years',
      imp['Generalisation to an unseen source'] ?? 'not tested',
      `Unseen states ${vs(pairs.leave_states_out)}; future years ${vs(pairs.leave_years_out)}`,
      'Unseen states and future years (Section 3)',
    ],
    [
      'Uncertainty',
      imp['Probability calibration'] ?? 'not measured',
      'Probability per crop',
      `90% prediction sets: ${n.CovIIDLSO ?? '—'}% coverage with ${n.SizeIIDLSO ?? '—'} crops on average`,
    ],
  ];
  return (
    <div className="table-wrap">
      <table className="data compare">
        <caption className="tcap">From the previous project (v1) to the current system (v3) and the improved method (v4)</caption>
        <thead>
          <tr>
            <th scope="col">Aspect</th>
            <th scope="col">Previous project (v1)</th>
            <th scope="col">Current system (v3, live)</th>
            <th scope="col">Improved method (v4)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([aspect, a, b, c]) => (
            <tr key={aspect}>
              <th scope="row">{aspect}</th>
              <td>{a}</td>
              <td>{b}</td>
              <td>{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function V3Section({ v, served, failed }) {
  const pairs = V3_TESTS.map(([k, name]) => [name, v3Pair(v[k])]).filter(([, p]) => p);
  const [first, ...rest] = pairs;
  const states = Object.entries(v.leave_states_out_per_state_hit1 ?? {}).sort((a, b) => b[1] - a[1]);
  const stateN = v.leave_states_out_per_state_n; // queries per held-out state, when results.json carries it
  const soil = Object.entries(v.soil_subset ?? {}).filter(([, x]) => x && typeof x === 'object' && 'hit1_mean' in x);
  const figures = (v.figures?.length ? v.figures : (research.figures ?? []).filter((f) => f.file?.includes('_v3_'))) ?? [];

  return (
    <>
      {first && (
        <p className="keybox">
          <strong>Headline:</strong> for {first[0].toLowerCase()}, the served model ({first[1].model[0]}) ranks a high-yield crop first in{' '}
          <strong>{pct1(metric(first[1].model[1], 'hit1'))}</strong> of district-season queries ({pct1(metric(first[1].model[1], 'hit3'))} within its top 3), against{' '}
          {pct1(metric(first[1].base[1], 'hit1'))} / {pct1(metric(first[1].base[1], 'hit3'))} for the best popularity baseline.
          {rest.map(([name, p]) => (
            <span key={name}>
              {' '}
              {name}: {pct1(metric(p.model[1], 'hit1'))} vs {pct1(metric(p.base[1], 'hit1'))}.
            </span>
          ))}
        </p>
      )}

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
              <th scope="row">Records · training rows</th>
              <td>
                {served.rows?.toLocaleString('en-IN')} · {served.training_rows?.toLocaleString('en-IN')}
              </td>
            </tr>
            <tr>
              <th scope="row">Coverage</th>
              <td>
                {served.crops} crops · {served.states} states · {districtCount(served)} · {yearSpan(served.years)}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="muted small">{failed ? `Cannot reach the model server at ${API_BASE_URL}; the tables below come from results.json.` : 'Loading the served model…'}</p>
      )}

      <div className="sub-section table-wrap">
        <table className="data">
          <caption className="tcap">Grouped evaluation: the served ExtraTrees model against the best popularity baseline</caption>
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
      {typeof v.meta?.doc === 'string' && <p className="note">{v.meta.doc}</p>}

      {states.length > 0 && (
        <div className="sub-section grid-table">
          <p className="tcap">Hit@1 for each held-out state (unseen states test), best first</p>
          <ul className="kv-grid">
            {states.map(([name, x]) => {
              const count = stateN?.[name];
              const small = typeof count === 'number' && count < MIN_STATE_QUERIES;
              return (
                <li key={name} className={small ? 'is-small' : undefined} title={small ? 'Too few queries for a reliable figure' : undefined}>
                  <span>{name}</span>
                  <span className="grid-val">
                    <strong>{pct2(x)}</strong>
                    {typeof count === 'number' && <small> · n {count.toLocaleString('en-IN')}</small>}
                  </span>
                </li>
              );
            })}
          </ul>
          {stateN && (
            <p className="note">
              n = district-season-year queries for the held-out state. States with fewer than {MIN_STATE_QUERIES} queries are greyed out: their Hit@1 rests on too few cases to read
              as a success or a failure.
            </p>
          )}
        </div>
      )}

      {soil.length > 0 && (
        <div className="sub-section table-wrap">
          <table className="data narrow">
            <caption className="tcap">Does soil help? Districts with a measured SoilGrids point</caption>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col" className="num">
                  Hit@1
                </th>
                <th scope="col" className="num">
                  Hit@3
                </th>
              </tr>
            </thead>
            <tbody>
              {soil.map(([name, x]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td className="num">{pct2(x.hit1_mean)}</td>
                  <td className="num">{pct2(x.hit3_mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">
            {v.soil_subset.queries?.toLocaleString('en-IN')} queries in {v.soil_subset.districts} districts. Adding soil does not improve the ranking, so the served model leaves it
            out.
          </p>
        </div>
      )}

      {figures.length > 0 && (
        <div className="sub-section figures">
          {figures.map((f, i) => {
            // Figure images are copied from docs/research/figures/ into frontend/public/research/.
            const src = `${import.meta.env.BASE_URL}research/${f.file.split('/').pop()}`;
            return (
              <figure key={f.file} className="figure">
                <a href={src} target="_blank" rel="noreferrer" title="Open full size">
                  <img src={src} alt={f.caption} loading="lazy" />
                </a>
                <figcaption>
                  <strong>Fig. {i + 1}:</strong> {f.caption}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </>
  );
}

function V4Section({ v }) {
  const lso = v.metrics?.main?.['leave-states-out'] ?? {};
  const entries = Object.entries(lso);
  const ours = entries.find(([name]) => isOurs(name));
  const bestClf = entries.filter(([name]) => isClassifier(name)).sort((a, b) => b[1].mean['hit@1'] - a[1].mean['hit@1'])[0];
  const pers = entries.find(([name]) => /persistence/i.test(name));
  const pointwise = entries.find(([name]) => /pointwise/i.test(name));
  const n = v.numbers ?? {};
  const iid = v.conformal?.['leave-states-out']?.conformal_iid_cal?.['LAC@0.9'];
  const states = Object.entries(v.coverage_by_state_leave_states_out ?? {}).sort((a, b) => a[1].cov_LAC - b[1].cov_LAC);
  const splits = { random: 'Random split', 'leave-states-out': 'Unseen states', 'leave-years-out': 'Future years' };
  const conformalRows = [
    ['i.i.d. calibration (paper headline)', (s) => v.conformal?.[s]?.conformal_iid_cal?.['LAC@0.9']],
    ['Held-out-group calibration', (s) => v.conformal?.[s]?.conformal_group_cal?.['LAC@0.9']],
    [
      'Cross-group calibration (mean of 5 folds)',
      (s) => {
        const cs = (v.crossconf?.[s] ?? []).map((f) => f.conformal_crossgroup?.['LAC@0.9']).filter(Boolean);
        return cs.length ? { coverage: avg(cs.map((c) => c.coverage)), size: avg(cs.map((c) => c.size)) } : null;
      },
    ],
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
              {pval(pers[1]['wilcoxon_vs_ours_hit@1']?.p)}){pointwise && <>, and the pointwise LightGBM variant of the same formulation {pct1(pointwise[1].mean['hit@1'])}</>}.
            </>
          )}
          {n.OursHitColdLSO && n.PersHitColdLSO && (
            <>
              {' '}
              Its clear gain over persistence is on cold-start queries ({n.ColdShareLSO}% of cases, where some candidate crop has no yield history): {n.OursHitColdLSO}% vs{' '}
              {n.PersHitColdLSO}%.
            </>
          )}
          {iid && (
            <>
              {' '}
              With 90% conformal prediction sets (i.i.d. calibration), coverage on unseen states is <strong>{pct1(iid.coverage)}</strong> with {iid.size.toFixed(2)} crops per set
              on average{n.WorstState && n.WorstIID ? `, but it drops to ${n.WorstIID}% in ${n.WorstState}` : ''}.
            </>
          )}
        </p>
      )}

      {entries.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <caption className="tcap">
              Ranking quality on unseen states (leave-states-out, mean ± sd over folds)
              <span className="tcap-note">
                Both YieldRank variants use the proposed yield-grounded formulation; the gain over the classifiers comes from the formulation, not the loss function (paper §V).
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

      {v.conformal && (
        <div className="sub-section table-wrap">
          <table className="data">
            <caption className="tcap">90% prediction sets (LAC): coverage · average set size</caption>
            <thead>
              <tr>
                <th scope="col">Calibration</th>
                {Object.values(splits).map((s) => (
                  <th key={s} scope="col" className="num">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conformalRows.map(([title, get]) => (
                <tr key={title}>
                  <th scope="row">{title}</th>
                  {Object.keys(splits).map((s) => {
                    const c = get(s);
                    return (
                      <td key={s} className="num">
                        {c ? `${pct1(c.coverage)} · ${c.size.toFixed(2)} crops` : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {states.length > 0 && (
        <div className="sub-section table-wrap">
          <table className="data">
            <caption className="tcap">Coverage of 90% sets for each held-out state, cross-group calibration (lowest first)</caption>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col" className="num">
                  Queries
                </th>
                <th scope="col" className="num">
                  Coverage (LAC)
                </th>
                <th scope="col" className="num">
                  Set size
                </th>
                <th scope="col" className="num wrap hide-sm">
                  Coverage (Mondrian, candidates)
                </th>
                <th scope="col" className="num wrap hide-sm">
                  Coverage (Mondrian, region)
                </th>
              </tr>
            </thead>
            <tbody>
              {states.map(([name, s]) => (
                <tr key={name} className={Math.round(s.cov_LAC * 1000) < 850 ? 'is-warn' : undefined}>
                  <th scope="row">{name}</th>
                  <td className="num">{s.n.toLocaleString('en-IN')}</td>
                  <td className="num">{pct1(s.cov_LAC)}</td>
                  <td className="num">{s.size_LAC.toFixed(2)}</td>
                  <td className="num hide-sm">{pct1(s.cov_Mncand)}</td>
                  <td className="num hide-sm">{pct1(s.cov_Mregion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">
            Rows shaded red have coverage below 85%. Per-state values use cross-group calibration, so they differ slightly from the i.i.d. figure in the headline. The method, its
            abstract and the full paper are on the <a href="#/paper">Paper</a> page.
          </p>
        </div>
      )}
    </>
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
  const served = info?.rows ? info : null;

  return (
    <div className="results">
      <header className="page-head">
        <h1>{t('results')}</h1>
        <p className="lede">
          What changed since the previous project, how the current advisory model performs on districts, states and years it has not seen, and the improved ranking method. Every
          number below is generated from <code>docs/research/results.json</code>, written by the research notebooks.
        </p>
      </header>

      {research._placeholder && (
        <div className="keybox is-warn" role="note">
          <strong>Placeholder data.</strong> {research.note}
        </div>
      )}

      <Section id="r-improvement" title="Improvement over the previous version" className="numbered">
        <ImprovementTable r={research} />
      </Section>

      {research.v3 && (
        <Section id="r-v3" title="Current system (v3, live model)" className="numbered">
          <V3Section v={research.v3} served={served} failed={failed} />
        </Section>
      )}

      {research.v4?.metrics?.main && (
        <Section id="r-v4" title="Improved method (v4): YieldRank and conformal prediction sets" className="numbered">
          <V4Section v={research.v4} />
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

const NOTEBOOKS = [
  ['AgroMind_v2_Research.ipynb', 'v1 reproduction and corrected decode; v2 merged data, 10-model comparison, ablation, leave-one-source-out, McNemar, calibration.'],
  ['AgroMind_v3_LargeScale.ipynb', 'v3: Government district crop statistics with NASA POWER climate and SoilGrids soil; unseen districts, states and years.'],
  ['AgroMind_v4_Novel_Method.ipynb', 'v4: YieldRank (LambdaMART yield ranking) against literature classifiers and persistence, with split-conformal prediction sets.'],
];

function PaperPage() {
  const numbers = research.v4?.numbers ?? {};
  const [copied, setCopied] = useState(false);
  const authors = SITE.team.join(' and ');
  const bibtex = `@misc{agromind2026,
  title        = {${PAPER_TITLE.replace('%', '\\%')}},
  author       = {${authors}},
  year         = {2026},
  note         = {Final year project, Dept. of ${SITE.department}, ${SITE.college}},
  howpublished = {\\url{${SITE.repo}}}
}`;
  const blob = (path) => `${SITE.repo}/blob/main/${path}`;

  return (
    <article className="paper">
      <header className="page-head">
        <p className="eyebrow">Paper · preprint</p>
        <h1>{PAPER_TITLE}</h1>
        <p className="authors">
          {SITE.team.join(', ')}
          <br />
          Dept. of {SITE.department}, {SITE.college} · Guide: {SITE.guide}
        </p>
        <p className="paper-links">
          <a className="btn" href={blob('paper/main.pdf')} target="_blank" rel="noreferrer">
            Paper (PDF)
          </a>
          <a className="btn btn-plain" href={blob('docs/newsletter/AgroMind_Newsletter.pdf')} target="_blank" rel="noreferrer">
            Newsletter (PDF)
          </a>
          <a className="btn btn-plain" href={SITE.repo} target="_blank" rel="noreferrer">
            Source code
          </a>
        </p>
      </header>

      <Section id="abstract" title="Abstract">
        <p className="abstract">{texToText(ABSTRACT_TEX, numbers)}</p>
        {!research.v4?.numbers && <p className="note">Numbers appear once results.json contains v4.numbers.</p>}
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
                    <a
                      href={`https://colab.research.google.com/github/${SITE.repo.replace('https://github.com/', '')}/blob/main/notebooks/${file}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="badge">Open in Colab</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="cite"
        title="Cite this"
        actions={
          <button
            type="button"
            className="btn btn-plain btn-small"
            onClick={() => {
              navigator.clipboard?.writeText(bibtex).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? 'Copied' : 'Copy BibTeX'}
          </button>
        }
      >
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
    'District mode and the v3/v4 benchmark: crops grown, area, production and yield',
    'Reproduced with acknowledgement under the DES copyright policy',
  ],
  ['Climate: NASA POWER (power.larc.nasa.gov), 1997–2023', 'Season temperature, humidity and rainfall at district centres', 'NASA open data, no restrictions; cite POWER'],
  ['Soil: ISRIC SoilGrids 2.0', 'District soil profile (context only)', 'CC BY 4.0'],
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
          AgroMind is a final year project of the Dept. of {SITE.department}, {SITE.college} ({SITE.session}). It recommends crops for Indian districts from the season and its
          climate and the district's location, and studies how such recommenders hold up on states and years they have never seen.
        </p>
      </header>

      <Section id="team" title="Team">
        <table className="data narrow">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
            </tr>
          </thead>
          <tbody>
            {SITE.team.map((name) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>Student</td>
              </tr>
            ))}
            <tr>
              <th scope="row">{SITE.guide}</th>
              <td>Project guide</td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          Contact: {SITE.email} · {SITE.address}
        </p>
      </Section>

      <Section id="system" title="System">
        <table className="kv">
          <tbody>
            <tr>
              <th scope="row">Advisory model</th>
              <td>
                ExtraTrees over season climate, district location, season and state, trained on Government of India district crop statistics. Earlier models (v1, v2) are documented
                on the Results page.
              </td>
            </tr>
            <tr>
              <th scope="row">Research method</th>
              <td>YieldRank, a yield-grounded ranker with conformal prediction sets (see Paper)</td>
            </tr>
            <tr>
              <th scope="row">Software</th>
              <td>React 18 and Vite (interface); Python, FastAPI and scikit-learn (server); LightGBM (research)</td>
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
