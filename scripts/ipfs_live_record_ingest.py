#!/usr/bin/env python3
"""Ingest CID metadata emitted by an IPFS DHT/sniffer worker into XoraTV's search index.

This accepts metadata only. It never downloads media bytes, pins content, or follows
user-supplied URLs. The discovery worker should send records it observed from IPFS.
"""
import json
import os
import re
import sqlite3
import sys
import time

DB_PATH = os.environ.get("IPFS_INDEX_DB", os.path.join(os.getcwd(), "data", "ipfs-search.sqlite3"))
CID_RE = re.compile(r"^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$")
VIDEO_EXT = re.compile(r"\.(mp4|webm|m4v|mov|mkv|avi|ogv|m3u8|mpg|mpeg|3gp)$", re.I)

def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)

def main():
    payload = json.load(sys.stdin)
    records = payload.get("records") if isinstance(payload, dict) else None
    if not isinstance(records, list) or not records:
        raise ValueError("Send a non-empty records array.")
    if len(records) > 100:
        raise ValueError("Maximum 100 records per request.")
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.execute("""CREATE TABLE IF NOT EXISTS media_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT, cid TEXT NOT NULL, title TEXT NOT NULL,
      path TEXT NOT NULL, gateway_url TEXT NOT NULL, source_cid TEXT NOT NULL,
      indexed_at INTEGER NOT NULL, UNIQUE(cid, path))""")
    db.execute("CREATE INDEX IF NOT EXISTS media_title_idx ON media_index(title)")
    accepted = rejected = 0
    now = int(time.time())
    try:
        for item in records:
            if not isinstance(item, dict):
                rejected += 1
                continue
            cid = str(item.get("cid") or "").strip()
            title = str(item.get("title") or item.get("filename") or "").strip()[:240]
            path = str(item.get("path") or "").strip().lstrip("/")[:500]
            source = str(item.get("source") or "ipfs-dht-sniffer")[:80]
            # The index is for media discovery, not arbitrary file catalogs.
            if not CID_RE.fullmatch(cid) or not title or not VIDEO_EXT.search(title) and not VIDEO_EXT.search(path):
                rejected += 1
                continue
            db.execute("""INSERT INTO media_index (cid,title,path,gateway_url,source_cid,indexed_at)
              VALUES (?,?,?,?,?,?) ON CONFLICT(cid,path) DO UPDATE SET
              title=excluded.title,gateway_url=excluded.gateway_url,source_cid=excluded.source_cid,
              indexed_at=excluded.indexed_at""",
              (cid, title, path, "https://ipfs.io/ipfs/" + cid + ("/" + path if path else ""), source, now))
            accepted += 1
        db.commit()
        total = db.execute("SELECT COUNT(*) FROM media_index").fetchone()[0]
        emit({"ok": True, "accepted": accepted, "rejected": rejected, "indexSize": total,
              "message": "Metadata records saved. A live DHT/sniffer worker must send new observations to keep this index fresh; media was not downloaded or pinned."})
    finally:
        db.close()

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit({"ok": False, "error": str(exc)[:240]})
        sys.exit(1)
