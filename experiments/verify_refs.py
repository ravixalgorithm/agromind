"""Verify DOIs (Crossref) and arXiv ids (arXiv API); prints title/year/venue as recorded upstream."""
import re, sys, requests, xml.etree.ElementTree as ET
H = {"User-Agent": "AgroMind-research/1.0 (mailto:research@example.org)"}
def doi(d):
    import time
    for k in range(6):
        r = requests.get(f"https://api.crossref.org/works/{d}", headers=H, timeout=30)
        if r.status_code != 429: break
        time.sleep(5 * (k + 1))
    if r.status_code != 200: return f"FAIL {r.status_code}"
    m = r.json()["message"]
    y = (m.get("issued", {}).get("date-parts") or [[None]])[0][0]
    a = "; ".join(f"{x.get('given','')} {x.get('family','')}" for x in m.get("author", [])[:8])
    return f"{y} | {(m.get('container-title') or [''])[0]} | {m['title'][0]} | {a} | vol {m.get('volume')} p {m.get('page') or m.get('article-number')}"
def arxiv(i):
    r = requests.get(f"http://export.arxiv.org/api/query?id_list={i}", timeout=30)
    e = ET.fromstring(r.text).find("{http://www.w3.org/2005/Atom}entry")
    t = e.find("{http://www.w3.org/2005/Atom}title")
    if t is None: return "FAIL"
    au = [x.find("{http://www.w3.org/2005/Atom}name").text for x in e.findall("{http://www.w3.org/2005/Atom}author")]
    return f"{e.find('{http://www.w3.org/2005/Atom}published').text[:4]} | arXiv | {' '.join(t.text.split())} | {'; '.join(au[:8])}"
for x in sys.argv[1:]:
    print(x, "->", arxiv(x[6:]) if x.startswith("arxiv:") else doi(x), flush=True)
