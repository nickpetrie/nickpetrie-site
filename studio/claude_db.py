"""Claude's access to Studio's database (D1) through the Cloudflare API, for the hourly check.

Usage:
  python studio/claude_db.py list <collection> [--status S] [--out DIR]  # docs as JSON (files in DIR)
  python studio/claude_db.py get <collection> <id>
  python studio/claude_db.py patch <collection> <id> <rev> <json-file>   # merge; {"__delete__": true} removes
  python studio/claude_db.py put <collection> <id> <json-file>           # create only
  python studio/claude_db.py log [n]

Every write checks `rev` the same way the app does, so Claude never overwrites an edit Nick made
since Claude read the doc: a stale write fails with "conflict" and the current rev. In a Claude Code
cloud session the proxy adds the Cloudflare token; elsewhere set CLOUDFLARE_API_TOKEN.
"""
import json, os, sys, time, urllib.request

ACCOUNT = "97b38e997c8ed5ed5eb3264ef052e31f"
DB = "c6080381-5b9b-44c0-bee0-19de01eff234"
URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{DB}/query"
WHO = "claude"


def q(sql, params=()):
    headers = {"content-type": "application/json"}
    if os.environ.get("CLOUDFLARE_API_TOKEN", "proxy-injected") != "proxy-injected":
        headers["authorization"] = f"Bearer {os.environ['CLOUDFLARE_API_TOKEN']}"
    req = urllib.request.Request(URL, json.dumps({"sql": sql, "params": list(params)}).encode(), headers, method="POST")
    r = json.load(urllib.request.urlopen(req))
    if not r.get("success"):
        sys.exit(f"D1 error: {r.get('errors')}")
    return r["result"][0]


def doc(row):
    return {"id": row["id"], "rev": row["rev"], "updatedAt": row["updated_at"], "data": json.loads(row["data"])}


def merge(data, patch):
    for k, v in patch.items():
        if isinstance(v, dict) and v.get("__delete__") is True:
            data.pop(k, None)
        else:
            data[k] = v
    return data


def main(a):
    cmd = a[0] if a else "help"
    if cmd == "list":
        col, status, out = a[1], None, None
        if "--status" in a: status = a[a.index("--status") + 1]
        if "--out" in a: out = a[a.index("--out") + 1]
        rows = q("SELECT * FROM docs WHERE collection=?" + (" AND status=?" if status else "") + " ORDER BY id",
                 [col] + ([status] if status else []))["results"]
        docs = [doc(r) for r in rows]
        if out:
            os.makedirs(f"{out}/{col}", exist_ok=True)
            for d in docs: json.dump(d, open(f"{out}/{col}/{d['id']}.json", "w"), ensure_ascii=False, indent=1)
            print(f"{len(docs)} docs written to {out}/{col}/")
        else:
            print(json.dumps(docs, ensure_ascii=False, indent=1))
    elif cmd == "get":
        rows = q("SELECT * FROM docs WHERE collection=? AND id=?", [a[1], a[2]])["results"]
        print(json.dumps(doc(rows[0]) if rows else None, ensure_ascii=False, indent=1))
    elif cmd == "patch":
        col, id_, rev, patch = a[1], a[2], int(a[3]), json.load(open(a[4]))
        rows = q("SELECT * FROM docs WHERE collection=? AND id=?", [col, id_])["results"]
        if not rows: sys.exit("not found")
        cur = doc(rows[0])
        if cur["rev"] != rev: sys.exit(f"conflict: current rev is {cur['rev']}; re-read and redo")
        data = merge(cur["data"], patch)
        r = q("UPDATE docs SET data=?, rev=rev+1, updated_at=?, updated_by=? WHERE collection=? AND id=? AND rev=?",
              [json.dumps(data, ensure_ascii=False), int(time.time() * 1000), WHO, col, id_, rev])
        if not r["meta"]["changes"]: sys.exit("conflict: changed while writing; re-read and redo")
        q("INSERT INTO log (at, who, action, collection, doc_id, detail) VALUES (?,?,?,?,?,?)",
          [int(time.time() * 1000), WHO, "patch", col, id_, json.dumps(sorted(patch))])
        print(f"ok: {col}/{id_} now rev {rev + 1}")
    elif cmd == "put":
        col, id_, data = a[1], a[2], json.load(open(a[3]))
        if q("SELECT 1 FROM docs WHERE collection=? AND id=?", [col, id_])["results"]: sys.exit("exists")
        q("INSERT INTO docs (collection,id,data,rev,updated_at,updated_by) VALUES (?,?,?,1,?,?)",
          [col, id_, json.dumps(data, ensure_ascii=False), int(time.time() * 1000), WHO])
        q("INSERT INTO log (at, who, action, collection, doc_id) VALUES (?,?,?,?,?)", [int(time.time() * 1000), WHO, "put", col, id_])
        print(f"ok: created {col}/{id_}")
    elif cmd == "log":
        n = int(a[1]) if len(a) > 1 else 20
        for r in q("SELECT * FROM log ORDER BY at DESC LIMIT ?", [n])["results"]: print(json.dumps(r, ensure_ascii=False))
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
