"""Query Semantic Scholar for crop-recommendation papers; dumps verified metadata to lit_raw.json."""
import json, sys, time, requests
Q = sys.argv[1:] or ["crop recommendation machine learning", "crop recommendation system India",
     "crop recommendation soil nutrients random forest", "crop yield prediction India district",
     "crop recommendation deep learning", "crop recommendation explainable", "crop recommendation ensemble",
     "conformal prediction agriculture", "crop recommendation profit", "crop suitability spatial cross-validation"]
F = "title,year,venue,externalIds,citationCount,authors,abstract,publicationVenue"
out = {}
for q in Q:
    for attempt in range(6):
        r = requests.get("https://api.semanticscholar.org/graph/v1/paper/search",
                         params={"query": q, "limit": 40, "fields": F, "year": "2019-2026"}, timeout=30)
        if r.status_code == 200: break
        time.sleep(3 + 3 * attempt)
    data = r.json().get("data", []) if r.status_code == 200 else []
    print(q, r.status_code, len(data), file=sys.stderr)
    for p in data: out[p["paperId"]] = p
    time.sleep(1.5)
json.dump(out, open("lit_raw.json", "w"), indent=1)
print(len(out))
