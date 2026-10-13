#!/usr/bin/env python3
"""Small, local IPFS filename index for XoraTV Source Lab.

Only directory listing HTML is fetched. Media files are never downloaded or pinned.
The index grows from CID seeds submitted by an operator; IPFS has no global
filename-search protocol, so this cannot discover unindexed content by magic.
"""
import html
import json
import os
import re
import sqlite3
import sys
import time
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen

GATEWAY = os.environ.get("IPFS_GATEWAY_URL", "https://ipfs.io").rstrip("/")
DB_PATH = os.environ.get("IPFS_INDEX_DB", os.path.join(os.getcwd(), "data", "ipfs-search.sqlite3"))
CID_PATTERN = r"(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,})"
CID_RE = re.compile(r"^" + CID_PATTERN + r"$")
LINK_RE = re.compile(r'''href=["']([^"']+)["']''', re.I)
IPFS_PATH_RE = re.compile(r"/ipfs/(" + CID_PATTERN + r")(?:/([^?#\"']*))?")

def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)

def connect():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.execute("""CREATE TABLE IF NOT EXISTS media_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT, cid TEXT NOT NULL, title TEXT NOT NULL,
        path TEXT NOT NULL, gateway_url TEXT NOT NULL, source_cid TEXT NOT NULL,
        indexed_at INTEGER NOT NULL, UNIQUE(cid, path)
    )""")
    db.execute("CREATE INDEX IF NOT EXISTS media_title_idx ON media_index(title)")
    return db

def fetch_listing(url):
    req = Request(url, headers={"Accept": "text/html,*/*;q=0.8", "User-Agent": "XoraTV-SourceLab-Indexer/1.0"})
    with urlopen(req, timeout=12) as response:
        content_type = response.headers.get("Content-Type", "")
        if "text/html" not in content_type and "application/xhtml" not in content_type:
            return "", response.geturl()
        return response.read(1_000_000).decode("utf-8", "replace"), response.geturl()

def index_seed(cid, title=""):
    if not CID_RE.fullmatch(cid):
        raise ValueError("Enter a valid IPFS CID (Qm… or bafy…).")
    db = connect()
    indexed = 0
    seen = set()
    queue = [(cid, "", 0)]
    try:
        while queue and len(seen) < 80:
            current, parent_path, depth = queue.pop(0)
            marker = (current, parent_path)
            if marker in seen:
                continue
            seen.add(marker)
            listing_url = GATEWAY + "/ipfs/" + current + ("/" + parent_path if parent_path else "")
            label = title.strip() if not parent_path and title.strip() else (parent_path.rsplit("/", 1)[-1] or current)
            db.execute("INSERT INTO media_index (cid,title,path,gateway_url,source_cid,indexed_at) VALUES (?,?,?,?,?,?) "
                       "ON CONFLICT(cid,path) DO UPDATE SET title=excluded.title,gateway_url=excluded.gateway_url,indexed_at=excluded.indexed_at",
                       (current, label[:240], parent_path, listing_url, cid, int(time.time())))
            indexed += 1
            if depth >= 3:
                continue
            try:
                page, final_url = fetch_listing(listing_url)
            except Exception:
                continue
            for raw_href in LINK_RE.findall(page):
                href = html.unescape(raw_href)
                if href.startswith(("#", "?", "javascript:", "mailto:")):
                    continue
                absolute = urljoin(final_url, href)
                parsed = urlparse(absolute)
                match = IPFS_PATH_RE.search(parsed.path)
                if not match:
                    continue
                child_cid = match.group(1)
                tail = unquote(match.group(2) or "").strip("/")
                if not tail:
                    continue
                name = tail.rsplit("/", 1)[-1]
                if re.search(r"\.(mp4|webm|m4v|mov|mkv|avi|ogv|m3u8)$", name, re.I):
                    stream_url = GATEWAY + "/ipfs/" + child_cid + "/" + tail if child_cid == current else GATEWAY + "/ipfs/" + child_cid + ("/" + name if "/" not in tail else "/" + tail)
                    db.execute("INSERT INTO media_index (cid,title,path,gateway_url,source_cid,indexed_at) VALUES (?,?,?,?,?,?) "
                               "ON CONFLICT(cid,path) DO UPDATE SET title=excluded.title,gateway_url=excluded.gateway_url,indexed_at=excluded.indexed_at",
                               (child_cid, name[:240], tail, stream_url, cid, int(time.time())))
                    indexed += 1
                elif depth < 3 and not re.search(r"\.[a-z0-9]{1,8}$", name, re.I):
                    queue.append((child_cid, tail, depth + 1))
        db.commit()
        return {"ok": True, "seedCid": cid, "indexedCount": indexed, "visitedDirectories": len(seen),
                "pinned": False, "downloadedMedia": False,
                "message": "CID added to the local search index. Directory listings only were read; media was not downloaded or pinned."}
    finally:
        db.close()

def search(query):
    terms = [part.lower() for part in re.findall(r"[\w.-]+", query) if len(part) > 1][:8]
    if not terms:
        raise ValueError("Enter a title or keyword with at least two letters.")
    db = connect()
    try:
        rows = db.execute("SELECT cid,title,path,gateway_url FROM media_index ORDER BY indexed_at DESC LIMIT 2000").fetchall()
        ranked = []
        for cid, title, path, gateway_url in rows:
            haystack = (title + " " + path).lower()
            score = sum(3 if term in title.lower() else 1 if term in haystack else 0 for term in terms)
            if score:
                ranked.append((score, cid, title, path, gateway_url))
        ranked.sort(key=lambda row: (-row[0], row[2].lower()))
        results = [{"cid": cid, "title": title, "path": path, "streamUrl": gateway_url, "score": score}
                   for score, cid, title, path, gateway_url in ranked[:20]]
        return {"ok": True, "query": query, "results": results, "count": len(results),
                "indexSize": len(rows), "source": "xoratv-local-index",
                "message": "Results come from CIDs indexed by XoraTV Source Lab, not a complete search of all IPFS."}
    finally:
        db.close()

def main():
    if len(sys.argv) < 2:
        raise ValueError("Use index <cid> [title] or search <query>.")
    action = sys.argv[1]
    if action == "index":
        if len(sys.argv) < 3:
            raise ValueError("Supply a CID to add to the index.")
        emit(index_seed(sys.argv[2].strip(), " ".join(sys.argv[3:])[:240]))
    elif action == "search":
        emit(search(" ".join(sys.argv[2:])[:180]))
    elif action == "status":
        db = connect()
        try:
            count = db.execute("SELECT COUNT(*) FROM media_index").fetchone()[0]
            emit({"ok": True, "indexSize": count, "database": DB_PATH})
        finally:
            db.close()
    else:
        raise ValueError("Unknown action.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit({"ok": False, "error": str(exc)[:400]})
        sys.exit(1)
