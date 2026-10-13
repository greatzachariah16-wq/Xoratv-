#!/usr/bin/env python3
"""Seed XoraTV's CID/title index from the public IPFS Search historical exports.

Only small metadata exports are read (2018-2020 by default). Video content is never
downloaded or pinned. Newer discoveries are added by the normal Source Lab search path.
"""
import json
import os
import re
import sqlite3
import sys
import time
from urllib.request import Request, urlopen

DB_PATH = os.environ.get("IPFS_INDEX_DB", os.path.join(os.getcwd(), "data", "ipfs-search.sqlite3"))
GATEWAYS = [x.strip().rstrip("/") for x in os.environ.get(
    "IPFS_EXPORT_GATEWAYS", "https://ipfs.io;https://dweb.link;https://gateway.ipfs.io"
).split(";") if x.strip()]
EXPORTS = [
    {"year": "2018", "cid": "Qmb2JizJSE5HCmzP6qKiRPmamGdgV6Aes2UudzYrgphfvC", "max_bytes": 8 * 1024 * 1024},
    {"year": "2019", "cid": "QmZgP278dJHA5RZgsD1kVQM2Jzmo5sN8Z7Aoj179j3G49c", "max_bytes": 14 * 1024 * 1024},
    {"year": "2020", "cid": "QmZcMDBpAso15QqaGeG4jtiKavXmQkFBEPhGHxNGkD9qcN", "max_bytes": 25 * 1024 * 1024},
]
CID_RE = re.compile(r"^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$")

def connect():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.execute("""CREATE TABLE IF NOT EXISTS media_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT, cid TEXT NOT NULL, title TEXT NOT NULL,
      path TEXT NOT NULL, gateway_url TEXT NOT NULL, source_cid TEXT NOT NULL,
      indexed_at INTEGER NOT NULL, UNIQUE(cid, path))""")
    db.execute("CREATE INDEX IF NOT EXISTS media_title_idx ON media_index(title)")
    return db

def open_export(cid, max_bytes):
    errors = []
    for gateway in GATEWAYS:
        url = gateway + "/ipfs/" + cid
        try:
            req = Request(url, headers={"User-Agent": "XoraTV-SourceLab/1.0", "Accept": "application/json"})
            response = urlopen(req, timeout=8)
            length = response.headers.get("Content-Length")
            if length and int(length) > max_bytes:
                response.close()
                errors.append(gateway + ": export exceeds configured size limit")
                continue
            return response, url
        except Exception as exc:
            errors.append(gateway + ": " + str(exc)[:100])
    raise RuntimeError("; ".join(errors[:3]) or "No export gateway responded")

def import_export(db, item):
    response, url = open_export(item["cid"], item["max_bytes"])
    imported = 0
    total = 0
    buffer = b""
    try:
        # The upstream export is newline-delimited JSON records: [CID, title, first-seen].
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > item["max_bytes"]:
                raise RuntimeError("Export exceeded configured size limit; import stopped safely.")
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                parse_record(db, line, item["year"])
                imported += 1
                if imported % 5000 == 0:
                    db.commit()
        if buffer.strip():
            parse_record(db, buffer, item["year"])
            imported += 1
        db.commit()
        return {"year": item["year"], "cid": item["cid"], "bytesRead": total,
                "recordsProcessed": imported, "source": url, "ok": True}
    finally:
        response.close()

def parse_record(db, raw, year):
    raw = raw.strip().rstrip(b",")
    if not raw or raw in (b"[", b"]"):
        return
    try:
        row = json.loads(raw.decode("utf-8", "replace"))
    except Exception:
        return
    if not isinstance(row, list) or len(row) < 2:
        return
    cid, title = str(row[0]).strip(), str(row[1]).strip()
    first_seen = str(row[2]).strip() if len(row) > 2 else ""
    if not CID_RE.fullmatch(cid) or not title or title == cid:
        return
    # Keep metadata only. Gateway URL is a candidate pointer, not a claim of availability.
    db.execute("""INSERT INTO media_index (cid,title,path,gateway_url,source_cid,indexed_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(cid,path) DO UPDATE SET
      title=CASE WHEN excluded.title != '' THEN excluded.title ELSE media_index.title END,
      source_cid=excluded.source_cid""",
      (cid, title[:240], "", "https://ipfs.io/ipfs/" + cid,
       "historical-ipfs-search-" + year + (":" + first_seen if first_seen else ""),
       int(time.time())))

def main():
    # Limit the work per request; skip years already imported to make retries cheap.
    db = connect()
    results = []
    try:
        existing = {row[0] for row in db.execute(
            "SELECT DISTINCT source_cid FROM media_index WHERE source_cid LIKE 'historical-ipfs-search-%'")}
        for item in EXPORTS:
            prefix = "historical-ipfs-search-" + item["year"]
            if any(value.startswith(prefix) for value in existing):
                results.append({"year": item["year"], "ok": True, "skipped": True, "reason": "already seeded"})
                continue
            try:
                results.append(import_export(db, item))
            except Exception as exc:
                db.rollback()
                results.append({"year": item["year"], "ok": False, "error": str(exc)[:240]})
        count = db.execute("SELECT COUNT(*) FROM media_index").fetchone()[0]
        historical = db.execute("SELECT COUNT(*) FROM media_index WHERE source_cid LIKE 'historical-ipfs-search-%'").fetchone()[0]
        emit({"ok": any(row.get("ok") for row in results), "results": results,
              "indexSize": count, "historicalRecords": historical,
              "message": "Historical title records seeded where their export gateways responded. Normal Source Lab searches continue adding newer public discoveries. Metadata only; no video files downloaded or pinned."})
    finally:
        db.close()

def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit({"ok": False, "error": str(exc)[:300]})
        sys.exit(1)
