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

/* ── District mode (v3: Government district crop statistics) ── */

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

// The served district model's metadata (/model-info v3). Every count and year shown for district mode comes from here.
function useV3Info() {
  const [v3, setV3] = useState(null);
  useEffect(() => {
    getJSON('/model-info')
      .then((d) => setV3(d.v3 ?? (d.rows ? d : null)))
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
    getJSON('/v3/options')
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
    fetch(`${API_BASE_URL}/v3/district?${new URLSearchParams(sel)}`, { signal: controller.signal })
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
        const res = await fetch(`${API_BASE_URL}/v3/predict`, {
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
    getJSON('/v3/options')
      .then(setOptions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    const params = new URLSearchParams({ page: String(page), page_size: String(V3_PAGE), ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
    fetch(`${API_BASE_URL}/v3/dataset?${params}`, { signal: controller.signal })
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

// Section titles and order for docs/research/results.json; keys not listed here (and future v5…) still render generically.
const SECTIONS = {
  v1: 'v1 baseline: the original model, reproduced',
  v1_fixed: 'v1 corrected: plain multiclass models on the Kaggle data',
  improvement: 'From v1 to v2: what changed',
  models: 'v2: model comparison (stratified 5-fold CV)',
  app_protocol: "v2: deployed model on the application's test split",
  ablation: 'v2: feature ablation',
  loso: 'v2: leave-one-source-out validation',
  leave_states_out: 'v2: leave-states-out validation (multi-state source)',
  mcnemar: "v2: McNemar's test against v1 corrected",
  calibration: 'v2: calibration of predicted probabilities',
  importance: 'v2: permutation feature importance',
  confusion_top_pairs: 'v2: most frequent confusions',
  v3: 'v3: large real dataset (district crop statistics)',
  v4: 'v4: YieldRank and conformal prediction sets (proposed)',
  dataset: 'Audit of the v2 training data',
};
// Table captions where the section title alone would be vague.
const CAPTIONS = {
  v1: 'v1 models as originally trained: reported vs reproduced accuracy and decode failures',
  v1_fixed: 'v1 estimators refit as plain multiclass models',
  improvement: 'Summary of changes from v1 to v2',
  models: 'Ten classifiers on the merged v2 data, sorted by macro-F1 (deployed model highlighted)',
  app_protocol: "Deployed Random Forest on the backend's own 80/20 split",
  ablation: 'Deployed configuration with different categorical feature sets',
  loso: 'Train on two sources, test on the third',
  leave_states_out: 'Multi-state source: random split vs unseen states',
  mcnemar: 'Paired comparison of v1 corrected and v2',
  calibration: 'Calibration of the deployed model on the application test split',
  importance: 'Accuracy drop when each input is shuffled (sorted)',
  confusion_top_pairs: 'Crop pairs most often confused by the deployed model',
  dataset: 'Merged v2 training data',
};
const SPLIT_KEYS = { loso: ['Held-out source', 'Variant'], mcnemar: ['Model', 'Comparison'] };
const COLS = {
  accuracy: 'Accuracy',
  macro_f1: 'Macro-F1',
  top3: 'Top-3 accuracy',
  fit_seconds_per_fold: 'Fit time / fold (s)',
  train_rows_cap: 'Train rows cap',
  oof_accuracy_india: 'OOF acc. multi-state',
  oof_accuracy_tamilnadu: 'OOF acc. Tamil Nadu',
  oof_accuracy_kaggle: 'OOF acc. Kaggle',
  n_test: 'Test rows',
  'coverage_%': 'Rows covered',
  in_distribution_acc: 'In-distribution acc.',
  accuracy_drop: 'Accuracy drop when shuffled',
  ece: 'ECE',
  brier: 'Brier score',
  chi2_cc: 'χ² (continuity corr.)',
  p_chi2: 'p (χ²)',
  p_exact: 'p (exact)',
  b_v1_right_v2_wrong: 'v1 right, v2 wrong',
  c_v1_wrong_v2_right: 'v1 wrong, v2 right',
  acc_v1_fixed: 'Acc. v1 corrected',
  acc_v2: 'Acc. v2',
  aspect: 'Aspect',
  hit1: 'Hit@1',
  hit3: 'Hit@3',
  recall3: 'Recall@3',
  hit1_by_year: 'Hit@1',
  hist: 'Yield history used',
  v1: 'v1',
  v2: 'v2',
  v3: 'v3',
  v4: 'v4',
};
// Sub-section headings inside nested results (e.g. v3); checked before the top-level titles.
const SUBTITLES = {
  summary: 'v2 vs v3',
  leave_districts_out: 'Unseen districts (grouped by district)',
  leave_years_out: 'Future crop years',
  leave_states_out: 'Unseen states',
  leave_states_out_per_state_hit1: 'Hit@1 for each held-out state',
  soil_subset: 'Rows with a measured soil point only',
  data: 'Data',
  task: 'Task',
  meta: 'Run details',
  project_md_claim: 'Figures stated in PROJECT.md',
};
const label = (k) => {
  const [base, sub] = k.split(':');
  if (sub) return `${label(base)} ${sub}`;
  return COLS[k] ?? SECTIONS[k] ?? k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
};
// Data keys like "rows_by_source" get a label; free-text names like "RF: + state" are shown as written.
const rowName = (k) => (/^[a-z0-9_%]+$/.test(k) ? label(k) : k);
const isPlain = (v) => v === null || typeof v !== 'object';
const RATE = /acc|f1|top3|chance|drop|confidence|hit|recall/;

// Rates (0–1) as percentages, *_pct / *_% as given, p-values and scores as decimals.
const cell = (v, key = '') => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v !== 'number') return String(v);
  if (/_pct$|%/.test(key)) return `${v.toFixed(1)}%`;
  if (/^p_/.test(key)) return v < 0.0001 ? '< 0.0001' : v.toFixed(4);
  if (RATE.test(key) && Math.abs(v) <= 1) return `${(v * 100).toFixed(2)}%`;
  return Number.isInteger(v) ? v.toLocaleString('en-IN') : String(Number(v.toFixed(v >= 100 ? 1 : 4)));
};
const meanStd = (mean, std, key) => {
  if (mean === null || mean === undefined) return '—';
  if (std === null || std === undefined) return cell(mean, key);
  return RATE.test(key) && Math.abs(mean) <= 1 ? `${(mean * 100).toFixed(2)} ± ${(std * 100).toFixed(2)}%` : `${cell(mean, key)} ± ${cell(std, key)}`;
};

// rows: [{...}]. head: leading row-header columns. Pairs x_mean / x_std are merged into one "mean ± sd" column.
function RowsTable({ rows, head = [], highlight, caption }) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => !head.includes(k));
  // One column per metric: "hit1", "hit1_mean" and "hit1_std" (from different rows) all land in the "hit1" column.
  const bases = [...new Set(keys.filter((k) => !(k.endsWith('_std') && keys.includes(`${k.slice(0, -4)}_mean`))).map((k) => (k.endsWith('_mean') ? k.slice(0, -5) : k)))];
  const cols = bases.map((key) => ({ key, mean: `${key}_mean`, std: `${key}_std` }));
  const value = (r, c) => r[c.mean] ?? r[c.key];
  return (
    <div className="table-wrap">
      <table className="data">
        {caption && <caption className="tcap">{caption}</caption>}
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {label(h)}
              </th>
            ))}
            {cols.map((c) => (
              <th key={c.key} scope="col" className={rows.some((r) => typeof value(r, c) === 'number') ? 'num wrap' : 'wrap'}>
                {label(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={highlight?.(r) ? 'is-highlight' : undefined}>
              {head.map((h) => (
                <th key={h} scope="row">
                  {r[h]}
                </th>
              ))}
              {cols.map((c) => (
                <td key={c.key} className={typeof value(r, c) === 'number' ? 'num' : undefined}>
                  {r[c.mean] !== undefined ? meanStd(r[c.mean], r[c.std], c.key) : cell(r[c.key], c.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const isFlatObj = (x) => x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every(isPlain);
// {name: {metric: n}} maps; one extra level ({hit1_by_year: {2015: n}}) is flattened into "hit1_by_year:2015" columns.
const isMetricMap = (v) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.values(v).length > 0 &&
  Object.values(v).every((x) => x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every((y) => isPlain(y) || isFlatObj(y)));
const flatten = (row) => Object.fromEntries(Object.entries(row).flatMap(([k, v]) => (isPlain(v) ? [[k, v]] : Object.entries(v).map(([s, x]) => [`${k}:${s}`, x]))));

// Render any results.json value: arrays of rows and {name: {metric: n}} maps become tables, flat values a key/value table.
function ReportValue({ value, name = 'Name', split, highlight, ctx = '', caption }) {
  if (isPlain(value)) return <p>{cell(value)}</p>;
  if (Array.isArray(value)) return value.every((v) => v && typeof v === 'object') ? <RowsTable rows={value} caption={caption} /> : <p>{cell(value)}</p>;
  if (isMetricMap(value)) {
    const rows = Object.entries(value).map(([k, v]) => {
      if (!split) return { [name]: k, ...flatten(v) };
      const [a, b = ''] = k.split('|').map((s) => s.trim());
      return { [split[0]]: a, [split[1]]: b, ...flatten(v) };
    });
    return <RowsTable rows={rows} head={split ?? [name]} highlight={highlight} caption={caption} />;
  }
  const entries = Object.entries(value);
  // A long map of name -> rate (e.g. 35 states) reads better as a compact grid, best first.
  if (entries.length > 12 && entries.every(([, v]) => typeof v === 'number')) {
    return (
      <div className="grid-table">
        {caption && <p className="tcap">{caption}</p>}
        <ul className="kv-grid">
          {entries
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => (
              <li key={k}>
                <span>{k}</span>
                <strong>{cell(v, RATE.test(k) ? k : ctx)}</strong>
              </li>
            ))}
        </ul>
      </div>
    );
  }
  const flat = entries.filter(([, v]) => isPlain(v) || (Array.isArray(v) && v.every(isPlain)));
  // Sibling {metric: n} objects with the same keys (e.g. two models) become one table.
  const shape = (v) => (isFlatObj(v) ? Object.keys(v).sort().join() : null);
  const shapes = entries.map(([, v]) => shape(v)).filter(Boolean);
  const grouped = entries.filter(([, v]) => shape(v) && shapes.filter((x) => x === shape(v)).length > 1);
  const nested = entries.filter((e) => !flat.includes(e) && !grouped.includes(e));
  return (
    <>
      {grouped.length > 0 && (
        <RowsTable rows={grouped.map(([k, v]) => ({ [name]: rowName(k), ...v }))} head={[name]} caption={flat.length ? grouped.map(([k]) => rowName(k)).join(', ') : caption} />
      )}
      {flat.length > 0 && (
        <table className="kv">
          {caption && <caption className="tcap">{caption}</caption>}
          <tbody>
            {flat.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{label(k)}</th>
                <td>{cell(v, RATE.test(k) ? k : ctx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {nested.map(([k, v]) => (
        <div key={k} className="sub-section">
          <ReportValue value={v} ctx={k} caption={SUBTITLES[k] ?? rowName(k)} />
        </div>
      ))}
    </>
  );
}

// One honest sentence on leave-one-source-out, computed from the numbers so it stays true when they change.
function losoSummary(loso) {
  const all = Object.entries(loso ?? {}).filter(([, r]) => typeof r.accuracy === 'number');
  const open = all.filter(([k]) => k.includes('open set'));
  const rows = (open.length ? open : all).map(([, r]) => r);
  if (!rows.length) return null;
  const pc = (v) => `${Math.round(v * 100)}%`;
  const acc = rows.map((r) => r.accuracy);
  const ind = rows.map((r) => r.in_distribution_acc).filter((v) => typeof v === 'number');
  return (
    <p className="keybox">
      <strong>Reading this table:</strong> the model is trained on two data sources and tested on the third{open.length ? ' (open-set rows)' : ''}. Accuracy falls to{' '}
      {pc(Math.min(...acc))}–{pc(Math.max(...acc))}, against {pc(Math.min(...ind))}–{pc(Math.max(...ind))} when testing on unseen rows of the same sources. The three sources record
      the same crops under very different conditions, so the cross-validated accuracy should not be expected to carry over to a new, independent data source.
    </p>
  );
}

// v3-style results: best learned model vs best popularity baseline for each grouped split, computed from the numbers.
function generalisationSummary(v) {
  const val = (r, m) => r[`${m}_mean`] ?? r[m];
  const best = (split) => {
    const rows = Object.entries(v?.[split] ?? {}).filter(([, r]) => r && typeof val(r, 'hit1') === 'number');
    const top = (list) => list.sort((a, b) => val(b[1], 'hit1') - val(a[1], 'hit1'))[0];
    const model = top(rows.filter(([n]) => !n.startsWith('baseline')));
    const base = top(rows.filter(([n]) => n.startsWith('baseline')));
    return model && base ? { model: model[0], m1: val(model[1], 'hit1'), m3: val(model[1], 'hit3'), b1: val(base[1], 'hit1'), b3: val(base[1], 'hit3') } : null;
  };
  const pc = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(1)}%` : '—');
  const parts = [
    ['unseen districts', best('leave_districts_out')],
    ['future crop years', best('leave_years_out')],
    ['unseen states', best('leave_states_out')],
  ].filter(([, r]) => r);
  if (!parts.length) return null;
  const [[firstName, first], ...rest] = parts;
  return (
    <p className="keybox">
      <strong>Headline:</strong> for {firstName}, the best model ({first.model}) ranks a high-yield crop first in <strong>{pc(first.m1)}</strong> of district-season queries (
      {pc(first.m3)} within its top 3), against {pc(first.b1)} / {pc(first.b3)} for the best popularity baseline.
      {rest.map(([name, r]) => (
        <span key={name}>
          {' '}
          For {name}: {pc(r.m1)} vs {pc(r.b1)}.
        </span>
      ))}
    </p>
  );
}

// v4 (YieldRank + conformal sets): metrics are {variant: {split: {method: {mean, std, wilcoxon_vs_ours_*}}}}, so it gets its own tables.
const V4_SPLITS = { random: 'Random split', 'leave-states-out': 'Unseen states (leave-states-out)', 'leave-years-out': 'Future years (leave-years-out)' };
const V4_VARIANTS = { main: 'All features (with yield history and soil)', nohist: 'Without yield history', nosoil: 'Without soil' };
const V4_CONFORMAL = { 'LAC@0.9': 'LAC, 90% target', 'APS@0.9': 'APS, 90% target', 'LAC@0.8': 'LAC, 80% target', 'APS@0.8': 'APS, 80% target' };
const pct1 = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(1)}%` : '—');
const pval = (p) => (typeof p !== 'number' ? '—' : p < 0.0001 ? '< 0.0001' : p.toFixed(3));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const isOurs = (name) => name.includes('(ours)');
const isClassifier = (name) => /\[[\d,]+\]/.test(name); // literature classifiers carry their citation numbers

function V4Report({ v }) {
  const main = v.metrics?.main ?? {};
  const lso = main['leave-states-out'] ?? {};
  const entries = Object.entries(lso);
  const ours = entries.find(([n]) => isOurs(n));
  const bestClf = entries.filter(([n]) => isClassifier(n)).sort((a, b) => b[1].mean['hit@1'] - a[1].mean['hit@1'])[0];
  const pers = entries.find(([n]) => /persistence/i.test(n));
  const pointwise = entries.find(([n]) => /pointwise/i.test(n));
  const n = v.numbers ?? {}; // exact paper values (paper/tables/numbers.tex), as strings
  const iid = v.conformal?.['leave-states-out']?.conformal_iid_cal?.['LAC@0.9'];
  const states = Object.entries(v.coverage_by_state_leave_states_out ?? {}).sort((a, b) => a[1].cov_LAC - b[1].cov_LAC);

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
              {pval(pers[1]['wilcoxon_vs_ours_hit@1']?.p)}){pointwise && <>, and a pointwise LightGBM model {pct1(pointwise[1].mean['hit@1'])}</>}.
            </>
          )}
          {n.OursHitColdLSO && n.PersHitColdLSO && (
            <>
              {' '}
              Its clear gain over persistence is on cold-start queries (
              {n.ColdShareLSO ? `${n.ColdShareLSO}% of cases, where some candidate crop has no yield history` : 'some candidate crop has no yield history'}): {n.OursHitColdLSO}% vs{' '}
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

      {Object.entries(main).map(([split, methods]) => (
        <div key={split} className="sub-section">
          <div className="table-wrap">
            <table className="data">
              <caption className="tcap">Ranking quality — {V4_SPLITS[split] ?? split}</caption>
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  {['ndcg@3', 'hit@1', 'hit@3', 'ndcg@1'].map((m) => (
                    <th key={m} scope="col" className="num">
                      {m.replace('ndcg', 'NDCG').replace('hit', 'Hit')}
                    </th>
                  ))}
                  <th scope="col" className="num wrap">
                    YieldRank − method (Hit@1)
                  </th>
                  <th scope="col" className="num">
                    p (Wilcoxon)
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(methods).map(([name, r]) => {
                  const w = r['wilcoxon_vs_ours_hit@1'];
                  return (
                    <tr key={name} className={isOurs(name) ? 'is-highlight' : undefined}>
                      <th scope="row">{name}</th>
                      {['ndcg@3', 'hit@1', 'hit@3', 'ndcg@1'].map((m) => (
                        <td key={m} className="num">
                          {m.startsWith('ndcg') ? `${r.mean[m].toFixed(3)} ± ${r.std[m].toFixed(3)}` : `${(r.mean[m] * 100).toFixed(1)} ± ${(r.std[m] * 100).toFixed(1)}%`}
                        </td>
                      ))}
                      <td className="num">{w ? `${w.mean_diff >= 0 ? '+' : '−'}${Math.abs(w.mean_diff * 100).toFixed(1)} pts` : '—'}</td>
                      <td className="num">{w ? pval(w.p) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="sub-section">
        <div className="table-wrap">
          <table className="data">
            <caption className="tcap">Ablation — Hit@1 without yield history or soil</caption>
            <thead>
              <tr>
                <th scope="col">Features</th>
                {Object.keys(V4_SPLITS).map((s) => (
                  <th key={s} scope="col" className="num wrap" colSpan={2}>
                    {V4_SPLITS[s]}
                  </th>
                ))}
              </tr>
              <tr>
                <th scope="col" />
                {Object.keys(V4_SPLITS).flatMap((s) => [
                  <th key={`${s}o`} scope="col" className="num">
                    YieldRank
                  </th>,
                  <th key={`${s}c`} scope="col" className="num">
                    Best classifier
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {Object.entries(v.metrics ?? {}).map(([variant, splits]) => (
                <tr key={variant}>
                  <th scope="row">{V4_VARIANTS[variant] ?? variant}</th>
                  {Object.keys(V4_SPLITS).flatMap((s) => {
                    const rows = Object.entries(splits[s] ?? {});
                    const o = rows.find(([n]) => isOurs(n));
                    const c = rows.filter(([n]) => isClassifier(n)).sort((a, b) => b[1].mean['hit@1'] - a[1].mean['hit@1'])[0];
                    return [
                      <td key={`${s}o`} className="num">
                        {pct1(o?.[1].mean['hit@1'])}
                      </td>,
                      <td key={`${s}c`} className="num">
                        {pct1(c?.[1].mean['hit@1'])}
                      </td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {v.crossconf && (
        <div className="sub-section">
          <div className="table-wrap">
            <table className="data">
              <caption className="tcap">Conformal prediction sets — coverage · average set size</caption>
              <thead>
                <tr>
                  <th scope="col">Calibration</th>
                  {Object.keys(v.crossconf).map((s) => (
                    <th key={s} scope="col" className="num wrap">
                      {V4_SPLITS[s] ?? s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['conformal_iid_cal', 'i.i.d. calibration (paper headline)'],
                  ['conformal_group_cal', 'Held-out-group calibration'],
                ]
                  .filter(([cal]) => v.conformal?.['leave-states-out']?.[cal])
                  .flatMap(([cal, title]) => [
                    <tr key={cal} className="group-row">
                      <th scope="colgroup" colSpan={Object.keys(v.crossconf).length + 1}>
                        {title}
                      </th>
                    </tr>,
                    ...Object.keys(V4_CONFORMAL).map((key) => (
                      <tr key={`${cal}-${key}`}>
                        <th scope="row">{V4_CONFORMAL[key]}</th>
                        {Object.keys(v.crossconf).map((s) => {
                          const c = v.conformal?.[s]?.[cal]?.[key];
                          return (
                            <td key={s} className="num">
                              {c ? `${pct1(c.coverage)} · ${c.size.toFixed(2)} crops` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    )),
                  ])}
                <tr className="group-row">
                  <th scope="colgroup" colSpan={Object.keys(v.crossconf).length + 1}>
                    Cross-group calibration (mean of 5 folds)
                  </th>
                </tr>
                {[...Object.keys(V4_CONFORMAL), 'mondrian_ncand', 'mondrian_region'].map((key) => (
                  <tr key={key}>
                    <th scope="row">{V4_CONFORMAL[key] ?? (key === 'mondrian_ncand' ? 'Mondrian by no. of candidates, 90%' : 'Mondrian by region, 90%')}</th>
                    {Object.entries(v.crossconf).map(([s, fs]) => {
                      const cs = fs.map((f) => f.conformal_crossgroup?.[key] ?? f[key]).filter(Boolean);
                      return (
                        <td key={s} className="num">
                          {cs.length ? `${pct1(avg(cs.map((c) => c.coverage)))} · ${avg(cs.map((c) => c.size)).toFixed(2)} crops` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {states.length > 0 && (
        <div className="sub-section">
          <div className="table-wrap">
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
                    Set size (LAC)
                  </th>
                  <th scope="col" className="num wrap">
                    Coverage (Mondrian, candidates)
                  </th>
                  <th scope="col" className="num wrap">
                    Set size (Mondrian)
                  </th>
                  <th scope="col" className="num wrap">
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
                    <td className="num">{pct1(s.cov_Mncand)}</td>
                    <td className="num">{s.size_Mncand.toFixed(2)}</td>
                    <td className="num">{pct1(s.cov_Mregion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Rows shaded red have LAC coverage below 85%. Per-state values use cross-group calibration, so they differ slightly from the i.i.d. figure in the headline.
          </p>
        </div>
      )}

      {v.kaggle_random_split_accuracy && (
        <div className="sub-section">
          <ReportValue value={v.kaggle_random_split_accuracy} ctx="accuracy" caption="Sanity check: accuracy on the Kaggle set with a random split" />
          <p className="note">Near-perfect scores on the small Kaggle set show that task is almost a lookup; the grouped splits above are the meaningful test.</p>
        </div>
      )}

      {v.meta && (
        <div className="sub-section">
          <ReportValue
            caption="v4 run details"
            value={{
              ...v.meta,
              ...(Array.isArray(v.meta.years) && { years: v.meta.years.join('–') }),
              ...('hist' in v.meta && { hist: v.meta.hist ? 'Yes' : 'No' }),
              ...(v.meta.soil_coverage && { soil_coverage: Object.fromEntries(Object.entries(v.meta.soil_coverage).map(([k, x]) => [k === 'NaN' ? 'No soil data' : k, x])) }),
            }}
          />
        </div>
      )}
      {typeof v._doc === 'string' && <p className="note">{v._doc}</p>}
    </>
  );
}

function ResultsPage({ t }) {
  const [info, setInfo] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE_URL}/model-info`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setInfo)
      .catch(() => setFailed(true));
  }, []);

  const served = info?.v3 ?? (info?.rows ? info : null);
  const { _placeholder, note, _doc: doc = {}, figures = [], meta: runMeta, ...sections } = research;
  const order = Object.keys(SECTIONS);
  const keys = [...order.filter((k) => k in sections), ...Object.keys(sections).filter((k) => !order.includes(k) && !k.startsWith('_'))];
  const deployed = runMeta?.deployed_model;
  const byDesc = (obj, key) => Object.fromEntries(Object.entries(obj).sort((a, b) => (b[1][key] ?? 0) - (a[1][key] ?? 0)));
  const prepared = {
    ...sections,
    ...(isMetricMap(sections.models) && { models: byDesc(sections.models, 'macro_f1_mean') }),
    ...(isMetricMap(sections.importance) && { importance: byDesc(sections.importance, 'accuracy_drop_mean') }),
  };
  // vN sections: results first, setup last; their own figure list is already in the Figures section.
  const V_ORDER = ['summary', 'leave_districts_out', 'leave_years_out', 'leave_states_out', 'leave_states_out_per_state_hit1', 'soil_subset'];
  for (const v of Object.keys(prepared).filter((k) => /^v\d+$/.test(k) && !isPlain(prepared[k]) && !Array.isArray(prepared[k]))) {
    const { figures: _f, ...rest } = prepared[v];
    const ks = Object.keys(rest);
    prepared[v] = Object.fromEntries([...V_ORDER.filter((k) => k in rest), ...ks.filter((k) => !V_ORDER.includes(k))].map((k) => [k, rest[k]]));
  }

  const toc = [
    ...keys.map((k) => ({ id: `r-${k}`, title: SECTIONS[k] ?? label(k) })),
    { id: 'r-live', title: 'Deployed model (live from the server)' },
    ...(runMeta ? [{ id: 'r-setup', title: 'Experiment setup' }] : []),
    { id: 'r-figures', title: 'Figures' },
  ];

  return (
    <div className="results">
      <header className="page-head">
        <h1>{t('results')}</h1>
        <p className="lede">
          Evaluation of AgroMind from the original v1 model to the proposed v4 ranker. Every table and figure below is generated from <code>docs/research/results.json</code>,
          written by the research notebooks; nothing is typed in by hand.
        </p>
      </header>

      {_placeholder && (
        <div className="keybox is-warn" role="note">
          <strong>Placeholder data.</strong> {note}
        </div>
      )}

      <nav className="toc" aria-label="Contents">
        <p className="eyebrow">Contents</p>
        <ol>
          {toc.map((s) => (
            <li key={s.id}>
              <button type="button" className="link-btn" onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })}>
                {s.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {keys.map((k) => (
        <Section key={k} id={`r-${k}`} title={SECTIONS[k] ?? label(k)} className="numbered">
          {k === 'loso' && losoSummary(prepared.loso)}
          {/^v\d+$/.test(k) && !prepared[k]?.metrics?.main && generalisationSummary(prepared[k])}
          {k === 'v4' && prepared.v4?.metrics?.main ? (
            <V4Report v={prepared.v4} />
          ) : (
            <ReportValue
              value={prepared[k]}
              caption={CAPTIONS[k] ?? SECTIONS[k] ?? label(k)}
              name={k === 'importance' ? 'Input' : k === 'ablation' ? 'Feature set' : 'Model'}
              split={SPLIT_KEYS[k]}
              highlight={deployed ? (r) => Object.values(r).includes(deployed) : undefined}
            />
          )}
          {typeof doc[k] === 'string' && <p className="note">{doc[k]}</p>}
        </Section>
      ))}

      <Section id="r-live" title="Deployed model (live from the server)" className="numbered">
        {served ? (
          <>
            <table className="kv">
              <caption className="tcap">Model currently served by the advisory</caption>
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
            {served.metrics && (
              <div className="sub-section">
                <ReportValue
                  value={Object.fromEntries(Object.entries(served.metrics).filter(([, v]) => v && typeof v === 'object'))}
                  caption="Served model: grouped evaluation"
                  name="Split"
                />
                {typeof served.metrics.note === 'string' && <p className="note">{served.metrics.note}</p>}
              </div>
            )}
          </>
        ) : (
          <p className="muted">{failed ? `Cannot reach the model server at ${API_BASE_URL}.` : 'Loading…'}</p>
        )}
      </Section>

      {runMeta && (
        <Section id="r-setup" title="Experiment setup" className="numbered">
          <ReportValue value={runMeta} caption="Software and protocol used for the v1–v2 experiments" />
        </Section>
      )}

      <Section id="r-figures" title="Figures" className="numbered">
        <div className="figures">
          {(figures.length ? figures : [{ caption: 'Figure to be added' }]).map((f, i) => {
            // Figure images are copied from docs/research/figures/ into frontend/public/research/.
            const src = f.file && `${import.meta.env.BASE_URL}research/${f.file.split('/').pop()}`;
            return (
              <figure key={i} className="figure">
                {src ? (
                  <a href={src} target="_blank" rel="noreferrer" title="Open full size">
                    <img src={src} alt={f.caption} loading="lazy" />
                  </a>
                ) : (
                  <div className="figure-empty">Figure {i + 1}</div>
                )}
                <figcaption>
                  <strong>Fig. {i + 1}:</strong> {f.caption}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </Section>
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
          AgroMind is a final year project of the Dept. of {SITE.department}, {SITE.college} ({SITE.session}). It recommends crops for Indian fields from soil tests, climate,
          season and location, and studies how such recommenders hold up on states and years they have never seen.
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
