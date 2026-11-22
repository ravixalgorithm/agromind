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
  phone: '[+91-XXXXX-XXXXX]',
  session: '2026–27',
  lastUpdated: '22 Nov 2026',
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const STORAGE_KEY = 'agromind.saved-analyses.v2';
const ACTIVE_KEY = 'agromind.active-analysis.v2';
const PREFS_KEY = 'agromind.prefs.v1';

const NUTRIENTS = ['N', 'P', 'K', 'ph'];
const SAMPLES = ['rice', 'wheat', 'cotton', 'maize', 'sugarcane', 'groundnut'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEASONS = {
  kharif: { name: 'Kharif', months: 'Jun–Oct' },
  rabi: { name: 'Rabi', months: 'Oct–Mar' },
  zaid: { name: 'Zaid', months: 'Mar–Jun' },
};
const SHORT = { N: 'N', P: 'P', K: 'K', ph: 'pH', temperature: '°C', humidity: 'RH', water: 'Rain' };
const MAX_ROWS = 8;
const FONT_SIZES = [13, 15, 17];

const PAGES = ['home', 'advisory', 'dataset', 'report', 'about', 'contact'];
const INFO_PAGES = ['disclaimer', 'privacy', 'help', 'sitemap'];

const T = {
  en: {
    skip: 'Skip to main content',
    contrast: 'High contrast',
    home: 'Home',
    advisory: 'Crop Advisory',
    dataset: 'Dataset',
    report: 'Model Report',
    about: 'About',
    contact: 'Contact',
    disclaimer: 'Disclaimer',
    privacy: 'Privacy Policy',
    help: 'Help',
    sitemap: 'Sitemap',
    whatsNew: "What's New",
    welcome: 'Welcome to AgroMind',
    glance: 'At a Glance',
    quick: 'Quick Links',
    notice: 'Important Notice',
    fieldDetails: 'Soil & Field Details',
    recommended: 'Recommended Crop',
    calendar: 'Crop Calendar',
    ranking: 'Ranking of Suitable Crops',
    readings: 'Field Readings vs Typical Range',
    saved: 'Saved Analyses',
    submit: 'Get Recommendation',
    reset: 'Reset',
    rawData: 'Raw Training Data',
    lastUpdated: 'Last Updated',
  },
  hi: {
    skip: 'मुख्य सामग्री पर जाएं',
    contrast: 'उच्च कंट्रास्ट',
    home: 'मुख्य पृष्ठ',
    advisory: 'फसल परामर्श',
    dataset: 'डेटासेट',
    report: 'मॉडल रिपोर्ट',
    about: 'परिचय',
    contact: 'संपर्क',
    disclaimer: 'अस्वीकरण',
    privacy: 'गोपनीयता नीति',
    help: 'सहायता',
    sitemap: 'साइटमैप',
    whatsNew: 'नया क्या है',
    welcome: 'एग्रोमाइंड में आपका स्वागत है',
    glance: 'एक नज़र में',
    quick: 'त्वरित लिंक',
    notice: 'महत्वपूर्ण सूचना',
    fieldDetails: 'मृदा एवं खेत विवरण',
    recommended: 'अनुशंसित फसल',
    calendar: 'फसल कैलेंडर',
    ranking: 'उपयुक्त फसलों की श्रेणी',
    readings: 'खेत के माप बनाम सामान्य सीमा',
    saved: 'सहेजे गए विश्लेषण',
    submit: 'अनुशंसा प्राप्त करें',
    reset: 'रीसेट',
    rawData: 'प्रशिक्षण डेटा',
    lastUpdated: 'अंतिम अद्यतन',
  },
};

const NEWS = [
  'Crop Advisory now covers 16 Indian states with Kharif, Rabi and Zaid seasons.',
  'Model Report page added: v1 vs v2 metrics and model comparison.',
  'Raw training data can now be browsed and filtered crop-wise on the Dataset page.',
  'Saved analyses are stored in your browser and can be reopened at any time.',
];

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const round = (n) => (Math.abs(n) >= 20 ? String(Math.round(n)) : fmt(n));
const withUnit = (text, unit) => (unit ? `${text}${unit === 'mm' ? ' ' : ''}${unit}` : text);
const prob = (p) => (p > 0 && p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`);
const range = (lo, hi, unit) => withUnit(round(lo) === round(hi) ? round(lo) : `${round(lo)}–${round(hi)}`, unit);
const longDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const formKey = (form) => JSON.stringify(form);
const plainName = (crop) => crop.name.replace(/ \(.*\)$/, '');

const emptyForm = (meta) => ({
  ...Object.fromEntries(meta.fields.map((f) => [f.key, ''])),
  soil: '',
  season: '',
  water_source: '',
  state: '',
});

function sampleValues(meta, id) {
  const crop = meta.crops[id];
  return {
    ...Object.fromEntries(meta.fields.map((f) => [f.key, String(crop.profile[f.key][1])])),
    soil: crop.soils.find((s) => s !== 'Other') ?? crop.soils[0],
    season: crop.season,
    water_source: crop.water_source,
    state: crop.states?.[0] ?? meta.options.state?.[0] ?? '',
  };
}

function dedupeSaved(list) {
  if (!Array.isArray(list)) return [];
  const best = new Map();
  for (const entry of list) {
    if (!entry?.id || !entry?.form) continue;
    const key = formKey(entry.form);
    const prev = best.get(key);
    if (!prev || new Date(entry.savedAt) >= new Date(prev.savedAt)) best.set(key, entry);
  }
  const winners = new Set([...best.values()].map((e) => e.id));
  return list.filter((e) => winners.has(e.id) && best.get(formKey(e.form))?.id === e.id);
}

function loadSaved() {
  try {
    const cleaned = dedupeSaved(JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return [];
  }
}

function loadPrefs() {
  try {
    return { font: 15, contrast: false, lang: 'en', ...JSON.parse(localStorage.getItem(PREFS_KEY)) };
  } catch {
    return { font: 15, contrast: false, lang: 'en' };
  }
}

// Counted once per page load, per browser; there is no server-side counter.
const VISITS = (() => {
  try {
    const n = Number(localStorage.getItem('agromind.visits') || 0) + 1;
    localStorage.setItem('agromind.visits', String(n));
    return n;
  } catch {
    return null;
  }
})();

// Compare the form against one crop's typical band (p10–p90) for every reading.
function assess(meta, id, form) {
  const crop = meta.crops[id];
  const readings = meta.fields.map((f) => {
    const [lo, , hi] = crop.profile[f.key];
    const v = Number(form[f.key]);
    const span = hi - lo || 1;
    const status = v < lo ? 'low' : v > hi ? 'high' : 'ok';
    return { ...f, lo, hi, v, status, gap: status === 'low' ? (lo - v) / span : status === 'high' ? (v - hi) / span : 0 };
  });
  return {
    id,
    crop,
    readings,
    inRange: readings.filter((r) => r.status === 'ok').length,
    distance: readings.reduce((sum, r) => sum + r.gap, 0),
    soilOk: crop.soils.includes(form.soil),
  };
}

function advice(r, cropName) {
  const d = (n) => round(Math.abs(n));
  if (r.status === 'ok') return 'Within range';
  const low = r.status === 'low';
  switch (r.key) {
    case 'N':
    case 'P':
    case 'K':
      return low ? `Add about ${d(r.lo - r.v)} ${r.key}` : `${d(r.v - r.hi)} more ${r.key} than usual`;
    case 'ph':
      return low ? 'More acidic than usual; liming raises pH' : 'More alkaline than usual';
    case 'temperature':
      return `${d(low ? r.lo - r.v : r.v - r.hi)}°C ${low ? 'cooler' : 'warmer'} than ${cropName} prefers`;
    case 'humidity':
      return low ? 'Drier air than usual' : 'More humid than usual';
    case 'water':
      return low ? `About ${d(r.lo - r.v)} mm short for the season` : `${d(r.v - r.hi)} mm more water than needed`;
    default:
      return low ? 'Below range' : 'Above range';
  }
}

// FastAPI returns 422 with {detail: [{loc, msg}]}; turn that into something a person can read.
async function readError(res, fields) {
  try {
    const body = await res.json();
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((d) => `${fields.find((f) => f.key === d.loc?.at(-1))?.label ?? d.loc?.at(-1)} ${d.msg.replace(/^Input should be /i, 'should be ')}`)
        .join(' · ');
    }
  } catch {
    /* fall through */
  }
  return `Server error (${res.status})`;
}

function useRoute() {
  const read = () => (window.location.hash.startsWith('#/') ? window.location.hash.slice(2) : 'home');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onHash = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return PAGES.includes(route) || INFO_PAGES.includes(route) ? route : 'home';
}

/* ── Shell ────────────────────────────────────────────── */

function App() {
  const [meta, setMeta] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [menuOpen, setMenuOpen] = useState(false);
  const route = useRoute();
  const mainRef = useRef(null);
  const t = (k) => T[prefs.lang][k] ?? T.en[k];

  useEffect(() => {
    setFailed(false);
    fetch(`${API_BASE_URL}/metadata`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMeta)
      .catch(() => setFailed(true));
  }, [attempt]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${prefs.font}px`;
    root.dataset.contrast = prefs.contrast ? 'high' : 'normal';
    root.lang = prefs.lang;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  useEffect(() => setMenuOpen(false), [route]);

  const pref = (patch) => setPrefs((p) => ({ ...p, ...patch }));
  const needsMeta = ['home', 'advisory', 'dataset'].includes(route);

  let page;
  if (needsMeta && !meta) {
    page = (
      <Panel title={failed ? 'Server not reachable' : 'Loading'} tone={failed ? 'orange' : undefined}>
        {failed ? (
          <>
            <p>Cannot reach the model server at {API_BASE_URL}. Start the backend and try again.</p>
            <button className="btn" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
          </>
        ) : (
          <p>Loading crop data…</p>
        )}
      </Panel>
    );
  } else if (route === 'home') page = <HomePage meta={meta} t={t} />;
  else if (route === 'advisory') page = <Advisory meta={meta} t={t} />;
  else if (route === 'dataset') page = <DatasetPage meta={meta} t={t} />;
  else if (route === 'report') page = <ReportPage t={t} />;
  else if (route === 'about') page = <AboutPage />;
  else if (route === 'contact') page = <ContactPage />;
  else page = <InfoPage route={route} t={t} />;

  return (
    <>
      <div className="a11y-strip">
        <div className="wrap a11y-inner">
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
          <div className="a11y-tools">
            <span className="font-tools" role="group" aria-label="Text size">
              {FONT_SIZES.map((size, i) => (
                <button key={size} type="button" aria-pressed={prefs.font === size} onClick={() => pref({ font: size })} aria-label={['Decrease text size', 'Normal text size', 'Increase text size'][i]}>
                  {['A-', 'A', 'A+'][i]}
                </button>
              ))}
            </span>
            <button type="button" className="contrast-btn" aria-pressed={prefs.contrast} onClick={() => pref({ contrast: !prefs.contrast })} title={t('contrast')}>
              <span aria-hidden="true">◐</span> {t('contrast')}
            </button>
            <span className="lang-tools" role="group" aria-label="Language">
              <button type="button" aria-pressed={prefs.lang === 'en'} onClick={() => pref({ lang: 'en' })}>
                English
              </button>
              <span aria-hidden="true">|</span>
              <button type="button" aria-pressed={prefs.lang === 'hi'} onClick={() => pref({ lang: 'hi' })} lang="hi">
                हिन्दी
              </button>
            </span>
          </div>
        </div>
      </div>
      <div className="tricolour" aria-hidden="true" />

      <header className="site-header">
        <div className="wrap header-inner">
          <a href="#/" className="logo-link">
            <Logo />
            <span className="site-title">
              <strong>AgroMind — Crop Recommendation System</strong>
              <span lang="hi">एग्रोमाइंड — फसल अनुशंसा प्रणाली</span>
            </span>
          </a>
          <p className="header-org">
            Final Year Project
            <br />
            Dept. of {SITE.department}, {SITE.college}
          </p>
        </div>
      </header>

      <nav className="main-nav" aria-label="Main">
        <div className="wrap nav-inner">
          <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="nav-list" onClick={() => setMenuOpen((o) => !o)}>
            ☰ Menu
          </button>
          <ul id="nav-list" className={menuOpen ? 'is-open' : ''}>
            {PAGES.map((p) => (
              <li key={p}>
                <a href={p === 'home' ? '#/' : `#/${p}`} aria-current={route === p ? 'page' : undefined}>
                  {t(p)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="ticker" role="region" aria-label={t('whatsNew')}>
        <div className="wrap ticker-inner">
          <strong className="ticker-label">{t('whatsNew')}</strong>
          <div className="ticker-track">
            <ul className="ticker-list">
              {[...NEWS, ...NEWS].map((n, i) => (
                <li key={i} aria-hidden={i >= NEWS.length || undefined}>
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="wrap">
        <ol className="breadcrumb" aria-label="Breadcrumb">
          <li>
            <a href="#/">{t('home')}</a>
          </li>
          {route !== 'home' && <li aria-current="page">{t(route)}</li>}
        </ol>
      </div>

      <main id="main" ref={mainRef} tabIndex={-1} className="wrap main">
        {page}
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <ul className="footer-links">
            {INFO_PAGES.map((p) => (
              <li key={p}>
                <a href={`#/${p}`}>{t(p)}</a>
              </li>
            ))}
            <li>
              <a href="#/contact">{t('contact')}</a>
            </li>
          </ul>
          <p className="footer-disclaimer">This is an academic project and is not an official Government of India website.</p>
          <p className="footer-meta">
            <span>
              {t('lastUpdated')}: {SITE.lastUpdated}
            </span>
            {VISITS !== null && <span>Visits from this browser: {String(VISITS).padStart(6, '0')}</span>}
            <span>
              © {SITE.session} Dept. of {SITE.department}, {SITE.college}
            </span>
          </p>
          <p className="footer-meta">Best viewed in the latest versions of Chrome, Firefox, Edge and Safari at 1280×800 or above.</p>
        </div>
      </footer>
    </>
  );
}

function Logo() {
  return (
    <svg className="logo" width="56" height="56" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#fff" stroke="#138808" strokeWidth="3" />
      <path d="M32 54V18" stroke="#8a5a14" strokeWidth="2.5" strokeLinecap="round" />
      {[22, 29, 36, 43].map((y) => (
        <g key={y} fill="#e0a526">
          <ellipse cx="26.5" cy={y} rx="4.2" ry="2.3" transform={`rotate(-35 26.5 ${y})`} />
          <ellipse cx="37.5" cy={y} rx="4.2" ry="2.3" transform={`rotate(35 37.5 ${y})`} />
        </g>
      ))}
      <ellipse cx="32" cy="15" rx="2.3" ry="4" fill="#e0a526" />
      <path d="M32 50c-6-1-11-5-13-10 6 0 11 4 13 10zM32 50c6-1 11-5 13-10-6 0-11 4-13 10z" fill="#138808" />
    </svg>
  );
}

function Panel({ title, tone, children, className = '', actions, id }) {
  return (
    <section className={`panel${tone ? ` panel-${tone}` : ''} ${className}`} aria-labelledby={id}>
      <h2 className="panel-title" id={id}>
        <span>{title}</span>
        {actions}
      </h2>
      <div className="panel-body">{children}</div>
    </section>
  );
}

/* ── Home ─────────────────────────────────────────────── */

function HomePage({ meta, t }) {
  const crops = Object.keys(meta.crops).length;
  return (
    <div className="grid-home">
      <div className="stack">
        <Panel title={t('welcome')}>
          <p>
            <strong>AgroMind</strong> is a crop recommendation system that suggests suitable crops for a field from its soil nutrients (N, P, K, pH), climate (temperature, humidity,
            seasonal rainfall), soil type, season, water source and state. The recommendation is produced by a machine-learning model trained on {meta.rows.toLocaleString('en-IN')}{' '}
            records of Indian crop data.
          </p>
          <p>
            For each field the system shows the recommended crop with model confidence, a month-wise sowing and harvest calendar, a ranking of other crops suited to the same season, and
            a reading-by-reading comparison against each crop's typical range.
          </p>
          <p>
            <a className="btn" href="#/advisory">
              Go to Crop Advisory »
            </a>
          </p>
        </Panel>

        <Panel title="How to Use">
          <ol className="steps">
            <li>
              Open <a href="#/advisory">Crop Advisory</a>.
            </li>
            <li>Select the state, season, soil type and water source of the field.</li>
            <li>Enter the soil test values (N, P, K, pH) and climate values, or use a sample field.</li>
            <li>Read the recommended crop, calendar and ranking. The analysis is saved in this browser automatically.</li>
          </ol>
        </Panel>

        <Panel title={t('notice')} tone="orange">
          <p>
            Recommendations are generated by a statistical model for academic demonstration. They are not agronomic advice. Farmers should consult the local Krishi Vigyan Kendra or
            agriculture department and their Soil Health Card before taking decisions.
          </p>
        </Panel>
      </div>

      <div className="stack">
        <Panel title={t('glance')} tone="green">
          <table className="kv">
            <tbody>
              <tr>
                <th scope="row">Training records</th>
                <td>{meta.rows.toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <th scope="row">Crops covered</th>
                <td>{crops}</td>
              </tr>
              <tr>
                <th scope="row">States covered</th>
                <td>{meta.options.state.length}</td>
              </tr>
              <tr>
                <th scope="row">Soil types</th>
                <td>{meta.options.soil.length}</td>
              </tr>
              <tr>
                <th scope="row">Seasons</th>
                <td>{meta.options.season.map((s) => SEASONS[s]?.name ?? s).join(', ')}</td>
              </tr>
              <tr>
                <th scope="row">Data sources</th>
                <td>{meta.sources?.join(', ')}</td>
              </tr>
            </tbody>
          </table>
        </Panel>

        <Panel title={t('quick')}>
          <ul className="link-list">
            <li>
              <a href="#/advisory">{t('advisory')}</a> — get a crop recommendation
            </li>
            <li>
              <a href="#/dataset">{t('dataset')}</a> — browse the training data
            </li>
            <li>
              <a href="#/report">{t('report')}</a> — accuracy and model comparison
            </li>
            <li>
              <a href="#/about">{t('about')}</a> — project and team
            </li>
            <li>
              <a href="#/help">{t('help')}</a> — field descriptions
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/* ── Crop Advisory ────────────────────────────────────── */

function initialAnalysis(meta, saved) {
  try {
    const activeId = localStorage.getItem(ACTIVE_KEY);
    const entry = saved.find((s) => s.id === activeId) ?? saved[0];
    if (entry) return { id: entry.id, name: entry.name, form: entry.form };
  } catch {
    /* fall through */
  }
  return { id: null, name: '', form: emptyForm(meta) };
}

function Advisory({ meta, t }) {
  const seed = useRef(null);
  if (!seed.current) {
    const saved = loadSaved();
    seed.current = { current: initialAnalysis(meta, saved), saved };
  }

  const [saved, setSaved] = useState(seed.current.saved);
  const [current, setCurrent] = useState(seed.current.current);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | invalid | offline
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const requestId = useRef(0);
  const resultsRef = useRef(null);

  const { form } = current;
  const numericDone = meta.fields.filter((f) => form[f.key] !== '' && !Number.isNaN(Number(form[f.key]))).length;
  const choicesDone = ['soil', 'season', 'water_source', 'state'].filter((k) => form[k]).length;
  const totalInputs = meta.fields.length + 4;
  const complete = numericDone + choicesDone === totalInputs;

  const setForm = (update) => setCurrent((c) => ({ ...c, form: typeof update === 'function' ? update(c.form) : update }));
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [saved]);

  useEffect(() => {
    try {
      if (current.id) localStorage.setItem(ACTIVE_KEY, current.id);
    } catch {
      /* ignore */
    }
  }, [current.id]);

  // Live prediction: debounce edits, ignore stale responses.
  useEffect(() => {
    if (!complete) {
      requestId.current++;
      setResult(null);
      setStatus('idle');
      return;
    }
    const id = ++requestId.current;
    const controller = new AbortController();
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...Object.fromEntries(meta.fields.map((f) => [f.key, Number(form[f.key])])),
            soil: form.soil,
            season: form.season,
            water_source: form.water_source,
            state: form.state,
          }),
          signal: controller.signal,
        });
        if (id !== requestId.current) return;
        if (!res.ok) {
          setStatus('invalid');
          setMessage(await readError(res, meta.fields));
          return;
        }
        setResult({ data: await res.json(), form });
        setStatus('ready');
      } catch (err) {
        if (err.name === 'AbortError' || id !== requestId.current) return;
        setStatus('offline');
        setMessage(`Cannot reach the model server at ${API_BASE_URL}.`);
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form, complete, meta]);

  // Rows: the model's pick plus the other crops of the same season, ranked by model probability.
  const pick = result?.data.top_recommendations[0];
  const rows = [];
  if (result) {
    const basis = result.form;
    const probs = new Map(result.data.top_recommendations.map((r) => [r.crop, r.confidence]));
    rows.push(
      ...Object.keys(meta.crops)
        .filter((id) => id === pick.crop || meta.crops[id].season === basis.season)
        .map((id) => ({ ...assess(meta, id, basis), confidence: probs.get(id) }))
        .sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1) || b.inRange - a.inRange || a.distance - b.distance)
        .slice(0, MAX_ROWS),
    );
  }
  const top = rows[0];
  const selected = rows.find((r) => r.id === selectedId) ?? top;
  const seasonName = result ? SEASONS[result.form.season]?.name ?? result.form.season : '';
  const displayName = current.name || (pick ? `${plainName(meta.crops[pick.crop])} · ${seasonName} · ${result.form.state || result.form.soil}` : 'Untitled analysis');

  // Autosave whenever a ready recommendation exists (and when the name changes).
  useEffect(() => {
    if (!pick || status !== 'ready') return undefined;
    const timer = window.setTimeout(() => {
      setSaved((list) => {
        const twin = list.find((s) => formKey(s.form) === formKey(form));
        const id = current.id ?? twin?.id ?? crypto.randomUUID();
        if (!current.id) queueMicrotask(() => setCurrent((c) => (c.id ? c : { ...c, id })));
        const prev = list.find((s) => s.id === id);
        if (prev && prev.name === displayName && prev.pick.crop === pick.crop && prev.pick.confidence === pick.confidence && formKey(prev.form) === formKey(form)) return list;
        const snapshot = { id, name: displayName, savedAt: new Date().toISOString(), form, pick: { crop: pick.crop, confidence: pick.confidence } };
        return [snapshot, ...list.filter((s) => s.id !== id && formKey(s.form) !== formKey(form))];
      });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [pick, status, form, displayName, current.id]);

  const open = (entry) => {
    setCurrent({ id: entry.id, name: entry.name, form: entry.form });
    setSelectedId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const startNew = () => {
    setCurrent({ id: null, name: '', form: emptyForm(meta) });
    setSelectedId(null);
  };
  const remove = (id) => {
    setSaved((list) => list.filter((s) => s.id !== id));
    // Deleting the open analysis also clears the form; otherwise autosave would save it straight back.
    if (current.id === id) startNew();
    try {
      if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  };

  const fieldRow = (f) => <NumField key={f.key} field={f} value={form[f.key]} onChange={(v) => set(f.key, v)} check={selected?.readings.find((r) => r.key === f.key)} cropName={selected?.crop.name} />;

  return (
    <>
      <h1 className="page-title">{t('advisory')}</h1>
      <div className="grid-advisory">
        <form
          className="panel form-panel"
          onSubmit={(e) => {
            e.preventDefault();
            resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          aria-labelledby="form-title"
        >
          <h2 className="panel-title" id="form-title">
            <span>{t('fieldDetails')}</span>
          </h2>
          <div className="panel-body">
            <p className="form-note">
              Fields marked <span className="req">*</span> are mandatory. Current analysis: <strong>{displayName}</strong>
            </p>

            <fieldset>
              <legend>A. Location &amp; Season</legend>
              <SelectField label="State" value={form.state} onChange={(v) => set('state', v)} options={meta.options.state.map((s) => [s, s])} />
              <SelectField label="Season" value={form.season} onChange={(v) => set('season', v)} options={meta.options.season.map((s) => [s, `${SEASONS[s]?.name ?? s} (${SEASONS[s]?.months ?? ''})`])} />
              <SelectField label="Soil type" value={form.soil} onChange={(v) => set('soil', v)} options={meta.options.soil.map((s) => [s, s])} />
              <SelectField
                label="Water source"
                value={form.water_source}
                onChange={(v) => set('water_source', v)}
                options={meta.options.water_source.map((w) => [w, w === 'irrigated' ? 'Irrigated' : 'Rainfed'])}
              />
            </fieldset>

            <fieldset>
              <legend>B. Soil Test Values</legend>
              {meta.fields.filter((f) => NUTRIENTS.includes(f.key)).map(fieldRow)}
            </fieldset>

            <fieldset>
              <legend>C. Climate</legend>
              {meta.fields.filter((f) => !NUTRIENTS.includes(f.key)).map(fieldRow)}
            </fieldset>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={!complete}>
                {t('submit')}
              </button>
              <button type="button" className="btn btn-plain" onClick={startNew}>
                {t('reset')}
              </button>
            </div>

            <div className="samples">
              <span>Fill with a sample field:</span>
              {SAMPLES.filter((s) => meta.crops[s]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setForm(sampleValues(meta, id));
                    setSelectedId(null);
                  }}
                >
                  {plainName(meta.crops[id])}
                </button>
              ))}
            </div>
          </div>
        </form>

        <div className="stack" ref={resultsRef}>
          {top ? (
            <>
              <Panel title={`${t('recommended')}: ${top.crop.name}`} tone="green" id="rec-title">
                <table className="kv">
                  <tbody>
                    <tr>
                      <th scope="row">Recommended crop</th>
                      <td>
                        <strong className="big">{top.crop.name}</strong> ({top.crop.type})
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Model confidence</th>
                      <td>
                        <strong>{prob(top.confidence)}</strong> <span className={`tag ${top.confidence >= 0.7 ? 'tag-ok' : 'tag-warn'}`}>{top.confidence >= 0.7 ? 'Strong fit' : 'Review'}</span>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Readings in typical range</th>
                      <td>
                        {top.inRange} of {top.readings.length}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Soil suitability ({result.form.soil})</th>
                      <td>{top.soilOk ? <span className="tag tag-ok">Suitable</span> : <span className="tag tag-warn">Not a usual soil for this crop</span>}</td>
                    </tr>
                    <tr>
                      <th scope="row">Sowing window</th>
                      <td>{top.crop.sown}</td>
                    </tr>
                    <tr>
                      <th scope="row">Harvest window</th>
                      <td>{top.crop.harvested}</td>
                    </tr>
                    <tr>
                      <th scope="row">Duration</th>
                      <td>About {top.crop.duration_days} days</td>
                    </tr>
                    <tr>
                      <th scope="row">Usually grown</th>
                      <td className="cap">{top.crop.water_source}</td>
                    </tr>
                  </tbody>
                </table>
                {status === 'loading' && <p className="muted">Updating…</p>}
              </Panel>

              <Panel title={t('calendar')}>
                <div className="table-wrap">
                  <table className="data cal-table">
                    <thead>
                      <tr>
                        <th scope="col">Crop</th>
                        {MONTHS.map((m) => (
                          <th key={m} scope="col">
                            {m}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <CalendarRow crop={top.crop} />
                      {selected.id !== top.id && <CalendarRow crop={selected.crop} />}
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
              </Panel>

              <Panel title={`${t('ranking')} — ${seasonName} season`}>
                <div className="table-wrap">
                  <table className="data rank-table">
                    <caption className="visually-hidden">Crops ranked for this field. ✓ means the reading is inside the crop's typical range.</caption>
                    <thead>
                      <tr>
                        <th scope="col">S.No.</th>
                        <th scope="col">Crop</th>
                        <th scope="col" className="hide-sm">
                          Type
                        </th>
                        {meta.fields.map((f) => (
                          <th key={f.key} scope="col" className="c" title={f.label}>
                            {SHORT[f.key] ?? f.key}
                          </th>
                        ))}
                        <th scope="col" className="num wrap">
                          Model probability
                        </th>
                        <th scope="col" className="num wrap">
                          Readings in range
                        </th>
                        <th scope="col">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        return (
                          <tr key={row.id} className={row.id === selected.id ? 'is-selected' : undefined}>
                            <td>{i + 1}</td>
                            <td>
                              {row.crop.name}
                              {i === 0 && <span className="tag tag-ok">Model pick</span>}
                            </td>
                            <td className="hide-sm">{row.crop.type}</td>
                            {row.readings.map((r) => (
                              <td key={r.key} className={`c ${r.status === 'ok' ? 'ok' : 'off'}`} title={`${r.label}: ${advice(r, row.crop.name.toLowerCase())}`}>
                                {r.status === 'ok' ? '✓' : '✗'}
                              </td>
                            ))}
                            <td className="num">{row.confidence === undefined ? '—' : prob(row.confidence)}</td>
                            <td className="num">
                              {row.inRange}/{row.readings.length}
                            </td>
                            <td>
                              <button type="button" className="link-btn" onClick={() => setSelectedId(row.id)} aria-pressed={row.id === selected.id}>
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="muted small">✓ inside the crop's typical range (10th–90th percentile), ✗ outside.</p>
              </Panel>

              <Panel title={`${t('readings')} — ${selected.crop.name}`}>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th scope="col">Parameter</th>
                        <th scope="col" className="num">
                          Your value
                        </th>
                        <th scope="col" className="num">
                          Typical range
                        </th>
                        <th scope="col">Status</th>
                        <th scope="col">Remark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.readings.map((r) => (
                        <tr key={r.key}>
                          <td>{r.label}</td>
                          <td className="num">{withUnit(fmt(r.v), r.unit)}</td>
                          <td className="num">{range(r.lo, r.hi, r.unit)}</td>
                          <td>{r.status === 'ok' ? <span className="tag tag-ok">In range</span> : <span className="tag tag-warn">{r.status === 'low' ? 'Low' : 'High'}</span>}</td>
                          <td>{advice(r, selected.crop.name.toLowerCase())}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted small">
                  Suitable soils: {selected.crop.soils.filter((s) => s !== 'Other').join(', ') || 'Varied'}
                  {!selected.soilOk && ` (not usual for ${result.form.soil.toLowerCase()} soil)`}.
                </p>
              </Panel>
            </>
          ) : (
            <Panel title="Result" tone={status === 'offline' || status === 'invalid' ? 'orange' : undefined}>
              {status === 'offline' || status === 'invalid' ? (
                <p className="error">{message}</p>
              ) : status === 'loading' ? (
                <p>Analysing your field…</p>
              ) : (
                <>
                  <p>
                    Fill in all {totalInputs} fields of the form to get a recommendation. <strong>{numericDone + choicesDone}</strong> of {totalInputs} filled.
                  </p>
                  <ul className="checklist">
                    {[
                      ['state', 'State'],
                      ['season', 'Season'],
                      ['soil', 'Soil type'],
                      ['water_source', 'Water source'],
                      ...meta.fields.map((f) => [f.key, f.label]),
                    ].map(([k, label]) => (
                      <li key={k} className={form[k] !== '' ? 'done' : ''}>
                        {form[k] !== '' ? '✓' : '○'} {label}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          )}
        </div>
      </div>

      <Panel
        title={`${t('saved')} (${saved.length})`}
        actions={
          <button type="button" className="btn btn-small" onClick={startNew}>
            + New analysis
          </button>
        }
      >
        {saved.length === 0 ? (
          <p className="muted">No saved analyses yet. Each completed recommendation is saved here automatically (in this browser only).</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">S.No.</th>
                  <th scope="col">Analysis</th>
                  <th scope="col">Crop</th>
                  <th scope="col" className="num">
                    Confidence
                  </th>
                  <th scope="col">Saved on</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {saved.map((s, i) => (
                  <SavedRow key={s.id} index={i + 1} entry={s} active={s.id === current.id} cropName={meta.crops[s.pick.crop]?.name ?? s.pick.crop} onOpen={() => open(s)} onDelete={() => remove(s.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function SelectField({ label, value, onChange, options }) {
  const id = `f-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="req">*</span>
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">-- Select --</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumField({ field, value, onChange, check, cropName }) {
  const num = Number(value);
  const isSet = value !== '' && !Number.isNaN(num);
  const outside = check && isSet && (num < check.lo || num > check.hi);
  const id = `f-${field.key}`;
  return (
    <div className={`field num-field${outside ? ' is-outside' : ''}`}>
      <label htmlFor={id}>
        {field.label}
        {field.unit ? ` (${field.unit})` : ''} <span className="req">*</span>
      </label>
      <div className="num-row">
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={isSet ? num : field.min}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${field.label} slider`}
          tabIndex={-1}
        />
        <input id={id} type="number" min={field.min} max={field.max} step={field.step} value={value} onChange={(e) => onChange(e.target.value)} required />
      </div>
      <small className="hint">
        Allowed {field.min}–{field.max}
        {check && (
          <>
            {' '}
            · Typical for {cropName} (selected below): {range(check.lo, check.hi, field.unit)}
            {outside && <strong> (outside)</strong>}
          </>
        )}
      </small>
    </div>
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

function SavedRow({ index, entry, active, cropName, onOpen, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <tr className={active ? 'is-selected' : undefined}>
      <td>{index}</td>
      <td>
        {entry.name}
        {active && <span className="tag">Open</span>}
      </td>
      <td>{cropName}</td>
      <td className="num">{prob(entry.pick.confidence)}</td>
      <td>{longDate(entry.savedAt)}</td>
      <td className="actions">
        <button type="button" className="link-btn" onClick={onOpen}>
          Open
        </button>
        {confirming ? (
          <>
            <button type="button" className="link-btn danger" onClick={onDelete} aria-label={`Confirm delete ${entry.name}`}>
              Confirm delete
            </button>
            <button type="button" className="link-btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="link-btn danger" onClick={() => setConfirming(true)} aria-label={`Delete ${entry.name}`}>
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

/* ── Dataset ──────────────────────────────────────────── */

const DATA_PAGE = 80;

const DATA_HEADERS = {
  crop: 'Crop',
  source: 'Set',
  state: 'State',
  soil: 'Soil',
  season: 'Season',
  water: 'Water',
  N: 'N',
  P: 'P',
  K: 'K',
  pH: 'pH',
  temp: 'Temp °C',
  RH: 'RH %',
  rain_mm: 'Rain mm',
};

const DATA_NUM_COLS = new Set(['N', 'P', 'K', 'pH', 'temp', 'RH', 'rain_mm']);

function DatasetPage({ meta, t }) {
  const [crop, setCrop] = useState('');
  const [offset, setOffset] = useState(0);
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setStatus('loading');
    setError('');
    const params = new URLSearchParams({ limit: String(DATA_PAGE), offset: String(offset) });
    if (crop) params.set('crop', crop);
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/dataset?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        setPayload(data);
        setStatus('ready');
      } catch (err) {
        if (err.name === 'AbortError' || !alive) return;
        setStatus('error');
        setError(err.message || `Cannot reach ${API_BASE_URL}`);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [crop, offset]);

  const crops = Object.entries(meta.crops).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const total = payload?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + (payload?.rows?.length ?? 0), total);
  const canPrev = offset > 0;
  const canNext = offset + DATA_PAGE < total;
  const coverage = Object.entries(meta.coverage ?? {});

  return (
    <>
      <h1 className="page-title">{t('dataset')}</h1>
      <Panel title="Dataset Summary" tone="green">
        <p>
          The model is trained on a merged dataset of <strong>{meta.rows.toLocaleString('en-IN')}</strong> rows covering <strong>{crops.length}</strong> crops and{' '}
          <strong>{meta.options.state.length}</strong> states.
        </p>
        {coverage.length > 0 && (
          <div className="table-wrap">
            <table className="data narrow">
              <thead>
                <tr>
                  <th scope="col">S.No.</th>
                  <th scope="col">Source</th>
                  <th scope="col" className="num">
                    Rows
                  </th>
                </tr>
              </thead>
              <tbody>
                {coverage.map(([key, rows], i) => (
                  <tr key={key}>
                    <td>{i + 1}</td>
                    <td>{meta.sources?.[i] ?? key}</td>
                    <td className="num">{rows.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td />
                  <th scope="row">Total</th>
                  <td className="num">{meta.rows.toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={t('rawData')}>
        <div className="toolbar">
          <label className="inline-field">
            <span>Filter by crop:</span>
            <select
              value={crop}
              onChange={(e) => {
                setCrop(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All crops</option>
              {crops.map(([id, c]) => (
                <option key={id} value={id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p className="range-note" aria-live="polite">
            {status === 'ready' ? `Showing ${from.toLocaleString('en-IN')}–${to.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} records` : '…'}
          </p>
          <div className="pager">
            <button type="button" className="btn btn-small" disabled={!canPrev || status === 'loading'} onClick={() => setOffset((o) => Math.max(0, o - DATA_PAGE))}>
              « Previous
            </button>
            <button type="button" className="btn btn-small" disabled={!canNext || status === 'loading'} onClick={() => setOffset((o) => o + DATA_PAGE)}>
              Next »
            </button>
          </div>
        </div>

        {status === 'loading' && <p>Loading rows…</p>}
        {status === 'error' && <p className="error">{error}</p>}
        {status === 'ready' && payload?.rows?.length === 0 && <p>No rows for this filter.</p>}
        {status === 'ready' && payload?.rows?.length > 0 && (
          <div className="table-wrap table-scroll">
            <table className="data dense">
              <thead>
                <tr>
                  <th scope="col">S.No.</th>
                  {payload.columns.map((col) => (
                    <th key={col} scope="col" className={DATA_NUM_COLS.has(col) ? 'num' : undefined}>
                      {DATA_HEADERS[col] ?? col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.rows.map((row, i) => (
                  <tr key={`${offset}-${i}`}>
                    <td>{offset + i + 1}</td>
                    {payload.columns.map((col) => (
                      <td key={col} className={DATA_NUM_COLS.has(col) ? 'num' : col === 'season' || col === 'water' ? 'cap' : undefined}>
                        {row[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ── Model Report ─────────────────────────────────────── */

// Panel titles and order for docs/research/results.json; keys not listed here (and future v3/v4) still render generically.
const SECTIONS = {
  improvement: 'v1 vs v2 — What Changed',
  app_protocol: "Deployed Model on the Application's Test Split",
  v1: 'Model v1 (original, reproduced)',
  v1_fixed: 'Model v1 Corrected (plain multiclass, Kaggle data)',
  models: 'Model Comparison on v2 Data (stratified 5-fold CV)',
  v3: 'Model v3 — Large Real Dataset (district crop statistics)',
  v4: 'Model v4',
  ablation: 'Feature Ablation (deployed Random Forest)',
  loso: 'Leave-One-Source-Out Validation',
  leave_states_out: 'Leave-States-Out Validation (multi-state source)',
  mcnemar: "McNemar's Test — v1 Corrected vs v2",
  calibration: 'Calibration of Predicted Probabilities',
  importance: 'Permutation Feature Importance',
  confusion_top_pairs: 'Most Frequent Confusions',
  dataset: 'Dataset Audit',
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
function RowsTable({ rows, head = [], highlight }) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => !head.includes(k));
  const cols = keys
    .filter((k) => !(k.endsWith('_std') && keys.includes(`${k.slice(0, -4)}_mean`)))
    .map((k) => (k.endsWith('_mean') ? { key: k.slice(0, -5), mean: k, std: keys.includes(`${k.slice(0, -5)}_std`) ? `${k.slice(0, -5)}_std` : null } : { key: k }));
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {label(h)}
              </th>
            ))}
            {cols.map((c) => (
              <th key={c.key} scope="col" className={typeof rows[0]?.[c.mean ?? c.key] === 'number' ? 'num wrap' : 'wrap'}>
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
                <td key={c.key} className={typeof r[c.mean ?? c.key] === 'number' ? 'num' : undefined}>
                  {c.mean ? meanStd(r[c.mean], c.std && r[c.std], c.key) : cell(r[c.key], c.key)}
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
const isMetricMap = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).length > 0 && Object.values(v).every((x) => x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every((y) => isPlain(y) || isFlatObj(y)));
const flatten = (row) => Object.fromEntries(Object.entries(row).flatMap(([k, v]) => (isPlain(v) ? [[k, v]] : Object.entries(v).map(([s, x]) => [`${k}:${s}`, x]))));

// Render any results.json value: arrays of rows and {name: {metric: n}} maps become tables, flat values a key/value table.
function ReportValue({ value, name = 'Name', split, highlight, ctx = '' }) {
  if (isPlain(value)) return <p>{cell(value)}</p>;
  if (Array.isArray(value)) return value.every((v) => v && typeof v === 'object') ? <RowsTable rows={value} /> : <p>{cell(value)}</p>;
  if (isMetricMap(value)) {
    const rows = Object.entries(value).map(([k, v]) => {
      if (!split) return { [name]: k, ...flatten(v) };
      const [a, b = ''] = k.split('|').map((s) => s.trim());
      return { [split[0]]: a, [split[1]]: b, ...flatten(v) };
    });
    return <RowsTable rows={rows} head={split ?? [name]} highlight={highlight} />;
  }
  const entries = Object.entries(value);
  // A long map of name -> rate (e.g. 35 states) reads better as a compact grid, best first.
  if (entries.length > 12 && entries.every(([, v]) => typeof v === 'number')) {
    return (
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
      {grouped.length > 0 && <RowsTable rows={grouped.map(([k, v]) => ({ [name]: rowName(k), ...v }))} head={[name]} />}
      {flat.length > 0 && (
        <table className="kv">
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
          <h3>{SUBTITLES[k] ?? rowName(k)}</h3>
          <ReportValue value={v} ctx={k} />
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
    <p className="notice">
      <strong>Reading this table:</strong> the model is trained on two data sources and tested on the third{open.length ? ' (open-set rows)' : ''}. Accuracy falls to {pc(Math.min(...acc))}–{pc(Math.max(...acc))}, against{' '}
      {pc(Math.min(...ind))}–{pc(Math.max(...ind))} when testing on unseen rows of the same sources. The three sources record the same crops under very different conditions, so the
      cross-validated accuracy should not be expected to carry over to a new, independent data source.
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
    <p className="notice">
      <strong>Headline:</strong> for {firstName}, the best model ({first.model}) ranks a high-yield crop first in <strong>{pc(first.m1)}</strong> of district-season queries ({pc(first.m3)}{' '}
      within its top 3), against {pc(first.b1)} / {pc(first.b3)} for the best popularity baseline.
      {rest.map(([name, r]) => (
        <span key={name}>
          {' '}
          For {name}: {pc(r.m1)} vs {pc(r.b1)}.
        </span>
      ))}
    </p>
  );
}

function ReportPage({ t }) {
  const [info, setInfo] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE_URL}/model-info`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setInfo)
      .catch(() => setFailed(true));
  }, []);

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

  // vN sections: results first, setup last; their own figure list is already in the Figures panel.
  const V_ORDER = ['summary', 'leave_districts_out', 'leave_years_out', 'leave_states_out', 'leave_states_out_per_state_hit1', 'soil_subset'];
  for (const v of Object.keys(prepared).filter((k) => /^v\d+$/.test(k) && !isPlain(prepared[k]) && !Array.isArray(prepared[k]))) {
    const { figures: _f, ...rest } = prepared[v];
    const ks = Object.keys(rest);
    prepared[v] = Object.fromEntries([...V_ORDER.filter((k) => k in rest), ...ks.filter((k) => !V_ORDER.includes(k))].map((k) => [k, rest[k]]));
  }

  return (
    <>
      <h1 className="page-title">{t('report')}</h1>
      {_placeholder && (
        <div className="notice notice-orange" role="note">
          <strong>Placeholder data.</strong> {note}
        </div>
      )}

      <Panel title="Deployed Model (live from server)" tone="green">
        {info ? (
          <table className="kv">
            <tbody>
              <tr>
                <th scope="row">Algorithm</th>
                <td>{info.model}</td>
              </tr>
              <tr>
                <th scope="row">Input features</th>
                <td>{info.features.join(', ')}</td>
              </tr>
              {Object.entries(info.metrics ?? {}).map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{label(k)}</th>
                  <td>{cell(v, k)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Data sources</th>
                <td>{info.sources.map((s) => `${s.name} (${s.rows.toLocaleString('en-IN')} rows)`).join('; ')}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p>{failed ? `Cannot reach the model server at ${API_BASE_URL}.` : 'Loading…'}</p>
        )}
      </Panel>

      {keys.map((k) => (
        <Panel key={k} title={SECTIONS[k] ?? label(k)}>
          {k === 'loso' && losoSummary(prepared.loso)}
          {/^v\d+$/.test(k) && generalisationSummary(prepared[k])}
          <ReportValue
            value={prepared[k]}
            name={k === 'importance' ? 'Input' : k === 'ablation' ? 'Feature set' : 'Model'}
            split={SPLIT_KEYS[k]}
            highlight={deployed ? (r) => Object.values(r).includes(deployed) : undefined}
          />
          {doc[k] && <p className="muted small">{doc[k]}</p>}
        </Panel>
      ))}

      {runMeta && (
        <Panel title="Experiment Setup">
          <ReportValue value={runMeta} />
        </Panel>
      )}

      <Panel title="Figures">
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
      </Panel>
    </>
  );
}

/* ── Static pages ─────────────────────────────────────── */

function AboutPage() {
  return (
    <>
      <h1 className="page-title">About the Project</h1>
      <div className="grid-home">
        <Panel title="Project Overview">
          <p>
            AgroMind is a final year project of the Department of {SITE.department}, {SITE.college}, session {SITE.session}. It applies machine learning to recommend crops for Indian
            fields from soil test values, climate, soil type, season, water source and state.
          </p>
          <h3>Technology used</h3>
          <table className="kv">
            <tbody>
              <tr>
                <th scope="row">Frontend</th>
                <td>React 18, Vite</td>
              </tr>
              <tr>
                <th scope="row">Backend</th>
                <td>Python, FastAPI</td>
              </tr>
              <tr>
                <th scope="row">Model</th>
                <td>scikit-learn Random Forest (see Model Report)</td>
              </tr>
              <tr>
                <th scope="row">Data</th>
                <td>Merged Indian crop datasets (see Dataset)</td>
              </tr>
            </tbody>
          </table>
        </Panel>
        <Panel title="Project Team" tone="green">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">S.No.</th>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {SITE.team.map((name, i) => (
                <tr key={name}>
                  <td>{i + 1}</td>
                  <td>{name}</td>
                  <td>Student</td>
                </tr>
              ))}
              <tr>
                <td>{SITE.team.length + 1}</td>
                <td>{SITE.guide}</td>
                <td>Project Guide</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}

function ContactPage() {
  return (
    <>
      <h1 className="page-title">Contact Us</h1>
      <Panel title="Project Contact">
        <table className="kv">
          <tbody>
            <tr>
              <th scope="row">Department</th>
              <td>Dept. of {SITE.department}</td>
            </tr>
            <tr>
              <th scope="row">Institution</th>
              <td>{SITE.college}</td>
            </tr>
            <tr>
              <th scope="row">Address</th>
              <td>{SITE.address}</td>
            </tr>
            <tr>
              <th scope="row">Project guide</th>
              <td>{SITE.guide}</td>
            </tr>
            <tr>
              <th scope="row">E-mail</th>
              <td>{SITE.email}</td>
            </tr>
            <tr>
              <th scope="row">Phone</th>
              <td>{SITE.phone}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">For farming queries, please contact your nearest Krishi Vigyan Kendra or state agriculture department.</p>
      </Panel>
    </>
  );
}

function InfoPage({ route, t }) {
  const body = {
    disclaimer: (
      <>
        <p>
          <strong>This is an academic project and is not an official Government of India website.</strong> It is not affiliated with, endorsed by or operated by any ministry,
          department or government body.
        </p>
        <p>
          Crop recommendations are produced by a machine-learning model for demonstration and evaluation purposes. They may be inaccurate and must not be used as the sole basis for
          farming, financial or policy decisions. The project team accepts no liability for any loss arising from use of this website.
        </p>
      </>
    ),
    privacy: (
      <>
        <p>This website does not collect personal information and uses no cookies or analytics.</p>
        <p>
          Field values you enter are sent to the project's model server only to compute a recommendation and are not stored there. Saved analyses, display preferences and the visit
          count are kept in your own browser (local storage) and can be removed by clearing site data.
        </p>
      </>
    ),
    help: (
      <>
        <table className="kv">
          <tbody>
            <tr>
              <th scope="row">N, P, K</th>
              <td>Nitrogen, phosphorus and potassium values from the soil test report (Soil Health Card).</td>
            </tr>
            <tr>
              <th scope="row">Soil pH</th>
              <td>Acidity / alkalinity of the soil, 3–10.</td>
            </tr>
            <tr>
              <th scope="row">Temperature, Humidity</th>
              <td>Average temperature (°C) and relative humidity (%) during the growing season.</td>
            </tr>
            <tr>
              <th scope="row">Seasonal rainfall</th>
              <td>Total rainfall expected over the season, in mm.</td>
            </tr>
            <tr>
              <th scope="row">Season</th>
              <td>Kharif (Jun–Oct), Rabi (Oct–Mar), Zaid (Mar–Jun).</td>
            </tr>
          </tbody>
        </table>
        <p>Use the A-, A, A+ buttons at the top to change text size, and the contrast button for a high-contrast view.</p>
      </>
    ),
    sitemap: (
      <ul className="link-list">
        {[...PAGES, ...INFO_PAGES].map((p) => (
          <li key={p}>
            <a href={p === 'home' ? '#/' : `#/${p}`}>{t(p)}</a>
          </li>
        ))}
      </ul>
    ),
  }[route];
  return (
    <>
      <h1 className="page-title">{t(route)}</h1>
      <Panel title={t(route)}>{body}</Panel>
    </>
  );
}

export default App;
