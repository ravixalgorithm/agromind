"""Build the AgroMind newsletter (HTML + A4 PDF) from the research outputs.

Every number in the newsletter is read from docs/research/results.json (and gap counts from
docs/research/related_work.json); none is typed into the text. v4 numbers come from
results.json["final"] when it exists, otherwise from results.json["v4"]["numbers"].

usage (repo root):  python3 docs/newsletter/build_newsletter.py [--pdf]
--pdf prints AgroMind_Newsletter.pdf with headless Chrome / chrome-headless-shell (set CHROME=path).
"""
import html, json, os, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/newsletter"
R = json.loads((ROOT / "docs/research/results.json").read_text())
RW = json.loads((ROOT / "docs/research/related_work.json").read_text())["papers"]
LIT = (ROOT / "docs/research/LITERATURE.md").read_text()

# CC5 schema: final = {version, name, method, headline, numbers: {flat display strings}, note}
FINAL = (R.get("final") or {}).get("numbers") or {}
NUM = FINAL or R["v4"]["numbers"]
V4_SOURCE = 'results.json["final"]["numbers"]' if FINAL else 'results.json["v4"]["numbers"]'


def V(k):
    """v4 display string, exactly as written by the experiments."""
    if k not in NUM:
        raise KeyError(f"v4 number {k!r} not found in {V4_SOURCE}")
    return str(NUM[k])


def texp(s):
    """'<10^{-300}' or '=2.7\\times10^{-2}' (LaTeX from numbers.tex) -> HTML."""
    s = s.replace("\\times", " × ").replace("<", "&lt; ").replace("=", "= ")
    s = re.sub(r"\^\{(-?)(\d+)\}", lambda m: f"<sup>{'−' if m.group(1) else ''}{m.group(2)}</sup>", s)
    return " ".join(s.split())


def pct(x, d=2):
    return f"{100 * x:.{d}f}"


def indian(n):
    """Indian digit grouping: 400379 -> 4,00,379."""
    s = str(int(n))
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    head = re.sub(r"(\d)(?=(\d{2})+$)", r"\1,", head)
    return f"{head},{tail}"


# ---------------------------------------------------------------- v1 / v2 / v3 numbers
v1 = R["v1"]
V1 = dict(
    reported=pct(v1["RandomForest"]["reported_accuracy"]),
    zero=f"{max(m['zero_fire_pct'] for m in v1.values()):.2f}",
    multi=f"{max(m['multi_fire_pct'] for m in v1.values()):.2f}",
    gnb_rep=pct(v1["GaussianNB"]["reported_accuracy"]),
    gnb_exact=pct(v1["GaussianNB"]["exact_match_accuracy"]),
    box=f"{100 * R['dataset']['separability']['Kaggle (v1 data)']['box_rule_accuracy']:.0f}",
    rows=f"{2200:,}",  # the Kaggle table size, R['dataset']['rows_by_source']['kaggle']
)
assert R["dataset"]["rows_by_source"]["kaggle"] == 2200
V1["rows"] = f"{R['dataset']['rows_by_source']['kaggle']:,}"
loso_open = [x["accuracy"] for k, x in R["loso"].items() if k.endswith("open set")]
_rf2 = R["models"]["RandomForest (v2 deployed)"]
_cal = R["calibration"]["RandomForest (v2 deployed)"]
V2 = dict(rows=f"{R['dataset']['rows']:,}", crops=str(R["dataset"]["crops"]), acc=pct(_rf2["accuracy_mean"]),
          sd=pct(_rf2["accuracy_std"]), top3=pct(_rf2["top3_mean"]), lo=f"{100 * min(loso_open):.0f}", hi=f"{100 * max(loso_open):.0f}",
          ece=f"{_cal['ece']:.3f}", conf=pct(_cal["mean_top1_confidence"]), calacc=pct(_cal["accuracy"]))
v3 = R["v3"]
et_d = v3["leave_districts_out"]["ExtraTrees: + state + lat/lon"]
bl_d = v3["leave_districts_out"]["baseline: state x season popularity"]
V3 = dict(rows=indian(v3["data"]["rows"]), districts=f"{v3['data']['districts']:,}", years=str(v3["data"]["crop_years"]),
          d1=pct(et_d["hit1_mean"]), d3=pct(et_d["hit3_mean"]), b1=pct(bl_d["hit1_mean"]), b3=pct(bl_d["hit3_mean"]),
          s1=pct(v3["leave_states_out"]["ExtraTrees: climate + season + lat/lon"]["hit1_mean"]),
          sb=pct(v3["leave_states_out"]["baseline: season popularity"]["hit1_mean"]),
          y1=pct(v3["leave_years_out"]["ExtraTrees: + state + lat/lon"]["hit1"]),
          yb=pct(v3["leave_years_out"]["baseline: state x season popularity"]["hit1"]),
          soil_no=pct(v3["soil_subset"]["RF: + state + lat/lon"]["hit1_mean"]),
          soil_yes=pct(v3["soil_subset"]["RF: + state + lat/lon + soil"]["hit1_mean"]),
          soil_d=str(v3["soil_subset"]["districts"]))

# ---------------------------------------------------------------- recent-work gap counts
CODES = ["KAGGLE_ONLY", "RANDOM_SPLIT_ONLY", "NO_YIELD", "NO_UNCERTAINTY", "NO_STAT_TEST", "LEAKAGE", "NOT_REPRODUCIBLE", "SINGLE_REGION"]
GAP_LABEL = {"KAGGLE_ONLY": "Headline on the Kaggle 2,200-row table only", "RANDOM_SPLIT_ONLY": "Random train/test splits only",
             "NO_YIELD": "Never check the crop's realised yield", "NO_UNCERTAINTY": "No per-prediction uncertainty or shortlist",
             "NO_STAT_TEST": "No significance test", "LEAKAGE": "Leakage admitted in the paper's own text",
             "NOT_REPRODUCIBLE": "No code (or data) released", "SINGLE_REGION": "One state or region only"}
GAPS = {c: sum(c in p["gaps"] for p in RW) for c in CODES}
NPAPERS = len(RW)
REFS_RW = sorted(p["ref"] for p in RW)
KAGGLE_REFS = [p["ref"] for p in RW if "KAGGLE_ONLY" in p["gaps"]]
kaggle_vals = [p["reported_value"] for p in RW if "KAGGLE_ONLY" in p["gaps"]]


# ---------------------------------------------------------------- method comparison
def method_rows():
    """[(label, ref, random, states, years)] Hit@1 strings."""
    # CC5 schema: method_comparison = {splits: [...], methods: [{name, source: "ours"|"baseline"|bib key, note, hit1: {split: v}, ...}]}
    mc = (R.get("method_comparison") or {}).get("methods")
    if mc:
        bibkeys = re.findall(r"^@\w+\{(\w+),", (ROOT / "docs/research/references.bib").read_text(), re.M)
        num = {k: i + 1 for i, k in enumerate(bibkeys)}  # bib order == LITERATURE.md numbering
        out = []
        for m in mc:
            h = m["hit1"]
            ref = num.get(m.get("source"))
            name = f"<b>{m['name']}</b>" if m.get("source") == "ours" else m["name"]
            out.append((name, str(ref) if ref else None, h.get("random"), h.get("leave-states-out"), h.get("leave-years-out")))
        return out
    spec = [("Crop prior (naive)", None, "PriorHit"), ("Last-year persistence (naive)", None, "PersHit"),
            ("Gaussian Naive Bayes", "6, 12", "NBHit"), ("Random Forest", "8, 21", "RFHit"),
            ("XGBoost", "11, 22", "XGBHit"), ("MLP", "13", "MLPHit"), ("<b>YieldRank (ours)</b>", None, "OursHit")]
    return [(lab, ref, V(k + "R"), V(k + "LSO"), V(k + "LYO")) for lab, ref, k in spec]


# ---------------------------------------------------------------- references: only those cited
def references(body):
    refs = {int(m.group(1)): l for l in LIT.split("## 4. References")[1].splitlines() if (m := re.match(r"^\[(\d+)\]", l))}
    cited = set()
    for grp in re.findall(r'<span class="cite">(.*?)</span>', body):
        for a, b in re.findall(r"\[(\d+)\](?:–\[(\d+)\])?", grp):
            cited.update(range(int(a), int(b or a) + 1))
    missing = cited - set(refs)
    assert not missing, f"cited but not in LITERATURE.md: {missing}"
    return "\n    ".join("<p>" + re.sub(r"\*([^*]+)\*", r"<i>\1</i>", html.escape(refs[k])) + "</p>" for k in sorted(cited)), len(refs)


def cite(*ns):
    return '<span class="cite">' + ", ".join(f"[{n}]" for n in ns) + "</span>"


# ---------------------------------------------------------------- team (from the lead, 2026-11-23)
UNIV = "Harcourt Butler Technical University (HBTU), Kanpur"
DEPT = "Department of Computer Science and Engineering"
PROGRAMME = "B.Tech, Computer Science and Engineering · Semester VII · Academic session 2026–27"
SUPERVISOR = ("Prof. (Dr.) Imran Khan", "Professor, Dept. of CSE, HBTU Kanpur")
TEAM = [("Rajat Patel", "230104046"), ("Harshit Jain", "230104023"), ("Sanyam Jain", "230104055"), ("Ravi Pratap Singh", "230104047")]
CONTACT = ("230104047@hbtu.ac.in", "Ravi Pratap Singh")
TEAM_HTML = "\n".join(f"    <div><b>{n}</b>Roll No. {r}</div>" for n, r in TEAM)

# ---------------------------------------------------------------- page content
GAP_TABLE = "\n".join(f"<tr><td>{GAP_LABEL[c]}</td><td class=\"num\">{GAPS[c]} / {NPAPERS}</td></tr>" for c in CODES)
MC = method_rows()
MC_TABLE = "\n".join(
    f"<tr{' class=\"best\"' if 'ours' in lab.lower() or lab.startswith('<b>') else ''}><td>{lab}{(' ' + cite(*[int(x) for x in str(ref).split(', ')])) if ref else ''}</td>"
    f"<td class=\"num\">{a}%</td><td class=\"num\">{b}%</td><td class=\"num\">{c}%</td></tr>" for lab, ref, a, b, c in MC)

BODY = f"""
<!-- ============ PAGE 1 ============ -->
<div class="page">
  <header class="mast">
    <div class="inst">
      <div>{UNIV}<br>{DEPT}</div>
    </div>
    <h1>Agro<span>Mind</span> Bulletin</h1>
    <p class="tag">A newsletter on data-driven crop recommendation for Indian fields</p>
  </header>
  <div class="dateline"><span>Vol. 1 · Issue 1</span><span>Final-Year Project Edition</span><span>November 2026</span></div>

  <h2 class="lead">From a 98% benchmark to ranking crops by real yield</h2>
  <p class="standfirst">AgroMind went through four versions. Each one fixed what the last got wrong. The final one,
    v4, ranks crops by the yield they actually achieved in official records, and is tested on Indian states it has
    never seen.</p>

  <div class="cols">
    <p class="drop">Most crop recommenders map soil N, P, K, pH and weather to a crop name and report about 99% accuracy
      {cite(8, 11, 12)}, nearly always on one Kaggle table that its own page says was built by <i>augmenting</i> Indian
      data {cite(31)}.</p>
    <p><b>v1</b> was such a model: {V1['reported']}% on {V1['rows']} Kaggle rows. <i>Still lacking:</i> its decoding left
      up to {V1['zero']}% of test rows with no answer and {V1['multi']}% with several, and a fixed lookup table already
      scores {V1['box']}% on that data.</p>
    <p><b>v2</b> <i>fixed</i> the decoding with one multiclass model and grew the data to {V2['rows']} rows and
      {V2['crops']} crops from three public tables: {V2['acc']}% accuracy, {V2['top3']}% within the top three.
      <i>Still lacking:</i> the tables disagreed, so trained on two and tested on the third it scored only
      {V2['lo']}–{V2['hi']}%.</p>
    <p><b>v3</b> <i>fixed</i> the data: {V3['rows']} official district–season–year records {cite(30, 38)}, tested on
      districts, states and years it had not seen. On new districts its first pick was a top-yielding crop {V3['d1']}%
      of the time, against {V3['b1']}% for "what this state usually grows". <i>Still lacking:</i> it still classified,
      counting any of three good crops as a hit; it could not say which crop yields best, or how sure it was.</p>
    <p><b>v4 (final)</b> asks the farmer's question directly: which crops do best here? <b>YieldRank</b> orders the
      crops grown in each district, season and year by expected yield, and adds a shortlist that comes with a coverage
      guarantee. On {V('NStates')} states held out entirely, its first pick is the single best-yielding crop
      {V('OursHitLSO')}% of the time, against {V('BaseHitLSO')}% for the best classifier from recent papers, and its
      90% shortlists of {V('SizeIIDLSO')} crops cover the best crop {V('CovIIDLSO')}% of the time.</p>
  </div>

  <div class="box" style="margin-top:3mm">
    <div class="box-title">Key Results · v1 → v2 → v3 → v4</div>
    <table class="kr">
      <thead><tr><th></th><th>v1</th><th>v2</th><th>v3</th><th>v4 (final)</th></tr></thead>
      <tbody>
        <tr><th>Data</th><td>{V1['rows']} Kaggle rows<br><small>no place or year</small></td>
          <td>{V2['rows']} rows<br><small>3 public tables</small></td>
          <td>{V3['rows']} Govt. records<br><small>{V3['districts']} districts · {V3['years']} yrs</small></td>
          <td>{V('NRows')} Govt. records<br><small>{V('NQueries')} queries · {V('YearA')}–{V('YearB')}</small></td></tr>
        <tr><th>Question</th><td>crop label</td><td>crop label</td><td>top-3-yield crop first?</td>
          <td>best-yielding crop first?</td></tr>
        <tr><th>Random split</th><td class="num">{V1['reported']}%<br><small>as reported</small></td>
          <td class="num">{V2['acc']}%<br><small>5-fold</small></td><td class="num">—</td>
          <td class="num">{V('OursHitR')}%<br><small>hit@1</small></td></tr>
        <tr><th>Unseen data</th><td class="num">—</td><td class="num">{V2['lo']}–{V2['hi']}%<br><small>unseen source</small></td>
          <td class="num">{V3['d1']}% / {V3['s1']}%<br><small>districts / states</small></td>
          <td class="num">{V('OursHitLSO')}%<br><small>states (best classifier {V('BaseHitLSO')}%)</small></td></tr>
        <tr><th>Future years</th><td class="num">—</td><td class="num">—</td>
          <td class="num">{V3['y1']}%<br><small>baseline {V3['yb']}%</small></td>
          <td class="num">{V('OursHitLYO')}%<br><small>best classifier {V('BaseHitLYO')}%</small></td></tr>
        <tr class="best"><th>Confidence</th><td class="num">—</td><td class="num">ECE {V2['ece']}<br><small>under-confident</small></td>
          <td class="num">—</td><td class="num">{V('CovIIDLSO')}% coverage<br><small>90% shortlist, {V('SizeIIDLSO')} crops</small></td></tr>
      </tbody>
    </table>
    <p class="note">All figures are generated from <code>docs/research/results.json</code> (v4: <code>{html.escape(V4_SOURCE)}</code>).
      Each version answers a harder question, so compare within a row with care: v3's hit@1 counts any top-3 crop, v4's
      only the single best one.</p>
  </div>

  <div class="inissue-row"><b>In this issue:</b> Key results · How v4 works · Why YieldRank · Results ·
    Recent work and where it falls short · Limitations · Team · References</div>
</div>

<!-- ============ PAGE 2 ============ -->
<div class="page">
  <div class="runhead"><span>AgroMind Bulletin</span><span>Method · Future work</span><span>Vol. 1 · Issue 1 · Nov 2026</span></div>
  <p class="kicker">Methodology</p>
  <h2>How AgroMind v4 works</h2>
  <div class="cols">
    <h3>Data</h3>
    <p>{V('NRows')} area-and-production records from the Directorate of Economics and Statistics {cite(38)}, covering
      {V('NStates')} states and {V('NDistricts')} districts from {V('YearA')} to {V('YearB')}. Each district gets season
      climate from NASA POWER {cite(29)} and topsoil properties from SoilGrids 2.0 {cite(27)} at its centre point.</p>
    <h3>The question</h3>
    <p>One query is a district, season and year; the candidates are the crops grown there ({V('MeanCand')} on average).
      A crop's relevance is its yield percentile, i.e. how well it did compared with the same crop elsewhere that year.
      Hit@1 counts how often the top-ranked crop is the one that yielded best.</p>
    <h3>YieldRank</h3>
    <p>A LightGBM {cite(35)} learning-to-rank model trained on (district-season-year, crop) pairs. It sees season
      climate, soil, season and the district's own history: each crop's yield percentile last year and over three years,
      and its share of area. It never sees the state name, which says nothing about a state it has not met.</p>
    <h3>Shortlists with a guarantee</h3>
    <p>Split-conformal prediction turns scores into a shortlist meant to contain the best crop 90% of the time. The
      calibration data is either a random slice of training data or whole held-out states.</p>
    <h3>How we test</h3>
    <ul>
      <li><b>Random</b>: 5-fold cross-validation over queries.</li>
      <li><b>Leave-states-out</b>: whole states are hidden from training.</li>
      <li><b>Leave-years-out</b>: contiguous blocks of years are hidden.</li>
      <li>Paired Wilcoxon tests between YieldRank and each baseline. Classifiers from recent papers are retrained on the
        same data {cite(11, 21, 22)}.</li>
    </ul>
  </div>

  <div class="duo">
    <div class="box why">
      <div class="box-title">Why YieldRank</div>
      <ul>
        <li><b>It answers the farmer's question.</b> Classifiers guess the crop that happened to be grown; YieldRank
          orders the options by how well they actually yielded.</li>
        <li><b>It is trained on outcomes.</b> Labels come from realised yield in official records, not from an
          augmented table.</li>
        <li><b>It holds up in new states.</b> Moving from random to unseen-state tests costs classifiers up to
          {V('ClfDropMax')} points of hit@1 and YieldRank {V('OursDrop')}; it ends {V('GainHitLSO')} points ahead of the
          best classifier ({V('BaseNameLSO')}).</li>
        <li><b>It helps where history is missing.</b> On cold-start cases ({V('ColdShareLSO')}% of queries) it picks the
          best crop {V('OursHitColdLSO')}% of the time, against {V('PersHitColdLSO')}% for repeating last year.</li>
        <li><b>It says how sure it is.</b> A {V('SizeIIDLSO')}-crop shortlist covers the best crop {V('CovIIDLSO')}% of
          the time on unseen states.</li>
      </ul>
    </div>
    <figure><img src="figs/hit1_protocols.png" alt="Bar chart of hit@1 for crop prior, persistence, Naive Bayes, Random Forest, XGBoost, MLP and YieldRank under random, leave-states-out and leave-years-out tests">
      <figcaption><b>Fig. 1.</b> Hit@1 (best crop ranked first) for each method under the three tests, mean ± s.d. over
        five folds. Classifiers drop on unseen states; YieldRank and persistence do not.</figcaption></figure>
  </div>

  <p class="kicker" style="margin-top:3mm">Future work</p>
  <ul class="cols fw">
    <li>Add prices and costs (minimum support prices, cost of cultivation) to rank by expected income.</li>
    <li>Use season forecasts instead of realised weather, and Soil Health Card readings {cite(24, 25)} instead of district soil.</li>
    <li>Make shortlists reliable per state, not just on average.</li>
    <li>Field validation with Krishi Vigyan Kendra staff; Hindi and regional-language interfaces.</li>
  </ul>

</div>

<!-- ============ PAGE 3 ============ -->
<div class="page">
  <div class="runhead"><span>AgroMind Bulletin</span><span>Results · Limitations</span><span>Vol. 1 · Issue 1 · Nov 2026</span></div>
  <p class="kicker">Evaluation</p>
  <h2>What the tests showed</h2>
  <div class="duo">
    <div>
      <table class="mc">
        <thead><tr><th>Method (hit@1, %)</th><th class="num">Random</th><th class="num">Unseen states</th><th class="num">Unseen years</th></tr></thead>
        <tbody>
{MC_TABLE}
        </tbody>
      </table>
      <p class="note">{V('NQueries')} district–season–years; mean over five folds. YieldRank vs the best classifier on
        unseen states: +{V('GainHitLSO')} points, paired Wilcoxon p {texp(V('PHitLSO'))}.</p>
    </div>
    <div class="cols1">
      <p><b>Classifiers do not travel.</b> The models used in recent papers lose most of their skill when the test state
        is new: Random Forest falls from {V('RFHitR')}% to {V('RFHitLSO')}%, XGBoost from {V('XGBHitR')}% to
        {V('XGBHitLSO')}%. YieldRank keeps {V('OursHitLSO')}%.</p>
      <p><b>A simple rule is hard to beat.</b> Repeating last year's best crop scores {V('PersHitLSO')}% on unseen states,
        close to YieldRank. No paper we reviewed reports this baseline.</p>
      <p><b>Shortlists mostly keep their promise.</b> With random calibration, 90% shortlists cover {V('CovIIDLSO')}%
        overall, but only {V('WorstIID')}% in {V('WorstState')}. For a Random Forest, calibrating on held-out states lifts
        coverage from {V('RFCovIIDMean')}% to {V('RFCovGRPMean')}%.</p>
    </div>
  </div>

  <div class="duo">
    <figure><img src="figs/coverage_states.png" alt="Per-state coverage of 90 percent shortlists, most states near or above 90 percent, Telangana and Andhra Pradesh lowest">
      <figcaption><b>Fig. 2.</b> Coverage of YieldRank's 90% shortlists per held-out state (states with ≥30 test
        queries). Dashed line: the 90% target.</figcaption></figure>
    <div class="box">
      <div class="box-title">Recent work and where it falls short</div>
      <p style="margin-bottom:1.5mm">We read {NPAPERS} crop-recommendation papers from 2024–2026 in full
        {cite(*REFS_RW)}. How many show each gap:</p>
      <table class="gaps"><tbody>
{GAP_TABLE}
      </tbody></table>
      <p class="note"><b>Different target:</b> these papers report accuracy at naming one of 22 crop labels, mostly on the
        Kaggle table, where a plain Random Forest scores {V('KaggleRF')}% in our own run. Our hit@1 asks for the single
        best-yielding crop in an unseen state, a harder question, so the percentages are not directly comparable.
        Details: <code>docs/research/RECENT_WORK.md</code>.</p>
    </div>
  </div>

  <div class="box limits" style="margin-top:4mm">
    <div class="box-title">Limitations</div>
    <ul class="cols">
      <li><b>History does most of the work.</b> Without each district's past yields, every model collapses on unseen
        states (YieldRank {V('NHOursHitLSO')}%, crop prior {V('NHPriorHitLSO')}%), and repeating last year is almost as
        good as YieldRank overall ({V('PersHitLSO')}% vs {V('OursHitLSO')}%).</li>
      <li><b>The ranking loss is not the secret.</b> A simpler yield regressor scores {V('PointHitLSO')}% on unseen
        states; the gain comes from ranking (crop, place) pairs by realised yield.</li>
      <li><b>Yield is not profit.</b> Percentiles measure comparative advantage, not income, price, water or risk.</li>
      <li><b>Only crops already grown are ranked.</b> The data cannot score a crop a district has never tried.</li>
      <li><b>Coarse inputs.</b> Weather and soil come from one point per district, and the weather is the season that
        actually happened, not a forecast. Adding soil did not help (v3 hit@1 {V3['soil_no']}% without soil, {V3['soil_yes']}% with it, on
        {V3['soil_d']} districts).</li>
      <li><b>Shortlist guarantees are on average.</b> The 90% target holds overall, but coverage falls below 85% in
        {V('StatesBelowIID')} of {V('StatesN')} audited states (Fig. 2).</li>
      <li><b>One country, past seasons.</b> Results describe Indian districts from {V('YearA')} to {V('YearB')}; no field
        trial has been run.</li>
    </ul>
  </div>

</div>

<!-- ============ PAGE 4 ============ -->
<div class="page">
  <div class="runhead"><span>AgroMind Bulletin</span><span>Team · References</span><span>Vol. 1 · Issue 1 · Nov 2026</span></div>
  <p class="kicker">The Team</p>
  <div class="team avoid">
{TEAM_HTML}
  </div>
  <p style="margin-top:2mm;font-size:8.4pt;text-align:center">Project supervisor: <b>{SUPERVISOR[0]}</b>, {SUPERVISOR[1]}<br>
    {PROGRAMME}<br>Contact: {CONTACT[0]} ({CONTACT[1]})</p>
  <p style="font-size:7.4pt;line-height:1.3;color:var(--muted);text-align:center"><i>Disclaimer:</i> AgroMind is an academic
    project, not an official Government of India service. Recommendations are for education and demonstration only and are not validated agronomic advice.
    Paper in preparation: "Beyond 99%: Yield-Grounded Crop Ranking with Conformal Prediction Sets, Evaluated on Unseen
    Indian States and Years", targeting IATMSI-2027 (IEEE).</p>

  <hr class="sep">
  <p class="kicker">References</p>
  <p class="note" style="margin-bottom:1.5mm">Numbers follow the full literature review
    (<code>docs/research/LITERATURE.md</code>, {{NREFS}} sources); only works cited in this issue are listed.</p>
  <div class="refs">
    {{REFS}}
  </div>
  <div class="foot">AgroMind Bulletin · {DEPT}, {UNIV} · Vol. 1, Issue 1 · November 2026<br>
    Built by docs/newsletter/build_newsletter.py from docs/research/results.json</div>
</div>
"""

refs_html, nrefs = references(BODY)
BODY = BODY.replace("{NREFS}", str(nrefs)).replace("{REFS}", refs_html)
leftover = re.findall(r"\{[A-Za-z_]+\}", BODY)
assert not leftover, leftover

PAGE = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AgroMind Bulletin — Vol. 1, Issue 1</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
{BODY}
</body>
</html>
"""
(OUT / "AgroMind_Newsletter.html").write_text(PAGE)
print(f"wrote AgroMind_Newsletter.html (v4 numbers from {V4_SOURCE})")

# refresh the two paper figures if the PDFs are newer than the PNGs
try:
    import pymupdf
    for n in ("hit1_protocols", "coverage_states"):
        src, dst = ROOT / f"paper/figures/{n}.pdf", OUT / f"figs/{n}.png"
        if src.exists() and (not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime):
            pymupdf.open(src)[0].get_pixmap(dpi=220).save(dst)
except ImportError:
    pass

if "--pdf" in sys.argv:
    chrome = os.environ.get("CHROME") or shutil.which("google-chrome") or "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    subprocess.run([chrome, "--headless", "--no-pdf-header-footer", "--virtual-time-budget=10000",
                    f"--print-to-pdf={OUT / 'AgroMind_Newsletter.pdf'}", (OUT / "AgroMind_Newsletter.html").as_uri()],
                   check=True, stderr=subprocess.DEVNULL)
    print("wrote AgroMind_Newsletter.pdf")
