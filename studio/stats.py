"""Website numbers for Studio's Stats tab, from Cloudflare Web Analytics.

  python3 studio/stats.py          # refresh config/site-stats in Studio's database
  python3 studio/stats.py --print  # print what it would store
  python3 studio/stats.py --full   # re-read all 90 days, not just the ones since the last refresh
  python3 studio/stats.py --weekly # refresh only if the stored numbers are at least 7 days old

The Studio check runs it with --weekly. Web Analytics uses no cookies, so "visits" are visits that
arrived from another site or were typed in, not unique people. Only nickpetrie.co and www are
counted: the same Web Analytics site also covers other nickpetrie.co hostnames.
Page titles come from this repo's src/content, so the Stats tab can show names instead of paths.
"""
import json, re, sys, time, urllib.request
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from claude_db import ACCOUNT, q

API = "https://api.cloudflare.com/client/v4"
HOSTS = ["nickpetrie.co", "www.nickpetrie.co"]
DAYS = 90
CONTENT = Path(__file__).resolve().parent.parent / "src" / "content"


def call(url, body=None):
    req = urllib.request.Request(url, json.dumps(body).encode() if body else None, {"content-type": "application/json"},
                                 method="POST" if body else "GET")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def per_day(dates):
    """One query per day, ten days to a request: a long date range comes back sampled (estimates in
    multiples of 10), a single day comes back exact."""
    out = []
    for i in range(0, len(dates), 10):
        out += _per_day(dates[i:i + 10])
    return out


def _per_day(dates):
    hosts = json.dumps(HOSTS)
    parts = " ".join(f'd{i}:rumPageloadEventsAdaptiveGroups(limit:5000,filter:{{date:"{d}",bot:0,requestHost_in:{hosts}}})'
                     "{count sum{visits} dimensions{requestPath refererHost deviceType}}" for i, d in enumerate(dates))
    r = call(f"{API}/graphql", {"query": f'query{{viewer{{accounts(filter:{{accountTag:"{ACCOUNT}"}}){{{parts}}}}}}}'})
    if r.get("errors"):
        sys.exit(f"analytics error: {r['errors']}")
    acc = r["data"]["viewer"]["accounts"][0]
    out = []
    for i, d in enumerate(dates):
        day = {"date": d, "views": 0, "visits": 0, "pages": {}, "from": {}, "devices": {}}
        for g in acc[f"d{i}"]:
            dim, n, v = g["dimensions"], g["count"], g["sum"]["visits"]
            day["views"] += n
            day["visits"] += v
            page = day["pages"].setdefault(dim["requestPath"] or "/", [0, 0])
            page[0] += n
            page[1] += v
            if v:
                host = (dim["refererHost"] or "").removeprefix("www.").removeprefix("m.").removeprefix("l.")
                day["from"][host] = day["from"].get(host, 0) + v
            day["devices"][dim["deviceType"] or "other"] = day["devices"].get(dim["deviceType"] or "other", 0) + n
        out.append(day)
    return out


def titles():
    """{"/<slug>/": title} for every post and page in the repo."""
    out = {}
    for f in sorted(CONTENT.glob("*/*.md")):
        m = re.search(r'^title:\s*"?(.*?)"?\s*$', f.read_text(encoding="utf-8").split("\n---", 1)[0], re.M)
        if m:
            out[f"/{f.stem}/"] = m.group(1).replace('\\"', '"')
    return out


def build(old=None):
    """Re-reads every day from the day before the last refresh (that day was still filling up) and
    any day not stored yet; older days are kept from the stored copy."""
    today = date.today()
    dates = [(today - timedelta(days=i)).isoformat() for i in range(DAYS)]
    last = date.fromtimestamp((old or {}).get("updatedAt", 0) / 1000) - timedelta(days=1)
    kept = {d["date"]: d for d in (old or {}).get("days", []) if d["date"] in dates and d["date"] < last.isoformat()}
    fresh = {d["date"]: d for d in per_day([d for d in dates if d not in kept])}
    days = [x for d in reversed(dates) if (x := kept.get(d) or fresh.get(d)) and x["views"]]
    return {"updatedAt": int(time.time() * 1000), "days": days, "titles": titles()}


def stored():
    r = q("SELECT data FROM docs WHERE collection='config' AND id='site-stats'")["results"]
    return json.loads(r[0]["data"]) if r else None


def save(data):
    now = int(time.time() * 1000)
    blob = json.dumps(data, ensure_ascii=False)
    if q("SELECT 1 FROM docs WHERE collection='config' AND id='site-stats'")["results"]:
        q("UPDATE docs SET data=?, rev=rev+1, updated_at=?, updated_by='claude' WHERE collection='config' AND id='site-stats'", [blob, now])
    else:
        q("INSERT INTO docs (collection,id,data,rev,updated_at,updated_by) VALUES ('config','site-stats',?,1,?,'claude')", [blob, now])


if __name__ == "__main__":
    old = stored()
    if "--weekly" in sys.argv and old and time.time() * 1000 - old.get("updatedAt", 0) < 7 * 86400000 - 3600000:
        sys.exit(0)
    data = build(None if "--full" in sys.argv else old)
    if "--print" in sys.argv:
        print(json.dumps(data, indent=1))
    else:
        save(data)
        print(f"site-stats saved: {sum(d['visits'] for d in data['days'])} visits, {sum(d['views'] for d in data['days'])} page views over {DAYS} days")
