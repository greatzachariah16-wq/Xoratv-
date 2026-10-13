#!/usr/bin/env python3
"""XoraTV IPFS search index with automatic public-web CID discovery.
Search pages and metadata are inspected; media bytes are never downloaded or pinned.
Public search coverage varies and cannot guarantee that every IPFS file is discoverable.
"""
import html
import json
import os
import re
import sqlite3
import sys
import time
from urllib.parse import unquote, urljoin, urlparse, urlencode
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

def discover_from_public_search(query):
    """Search public web indexes for IPFS gateway links; never fetch candidate media."""
    found = []
    search_url = "https://html.duckduckgo.com/html/?" + urlencode({"q": '"' + query + '" (ipfs OR bafy OR Qm) video'})
    try:
        req = Request(search_url, headers={"User-Agent": "Mozilla/5.0 (compatible; XoraTVSourceLab/1.0)", "Accept": "text/html"})
        with urlopen(req, timeout=10) as response:
            page = response.read(1_500_000).decode("utf-8", "replace")
        # CID must appear in a gateway path or a URL; a bare CID in random page text is not enough.
        for match in re.finditer(r'https?://(?:[^/"\\s<>]+/)*(?:ipfs/)?(' + CID_PATTERN + r')(?:/([^"\\s<>?#]*))?', html.unescape(page), re.I):
            cid = match.group(1)
            tail = unquote(match.group(2) or "").strip("/")
            title = tail.rsplit("/", 1)[-1] if tail else query
            if re.search(r"\.(mp4|webm|m4v|mov|mkv|avi|ogv|m3u8)$", title, re.I):
                found.append((cid, title[:240], tail, GATEWAY + "/ipfs/" + cid + ("/" + tail if tail else "")))
    except Exception:
        pass
    # Internet Archive is discovery-only: accept records only when metadata explicitly contains an IPFS CID.
    try:
        ia_url = "https://archive.org/advancedsearch.php?" + urlencode({
            "q": query + ' AND (mediatype:movies OR mediatype:movies)',
            "fl[]": ["identifier"], "rows": "8", "output": "json"
        }, doseq=True)
        req = Request(ia_url, headers={"User-Agent": "XoraTVSourceLab/1.0", "Accept": "application/json"})
        with urlopen(req, timeout=8) as response:
            records = json.loads(response.read(500_000).decode("utf-8", "replace")).get("response", {}).get("docs", [])
        for record in records:
            identifier = record.get("identifier")
            if not identifier:
                continue
            metadata_url = "https://archive.org/metadata/" + identifier
            req = Request(metadata_url, headers={"User-Agent": "XoraTVSourceLab/1.0", "Accept": "application/json"})
            with urlopen(req, timeout=6) as response:
                metadata = json.loads(response.read(700_000).decode("utf-8", "replace"))
            raw = json.dumps(metadata, ensure_ascii=False)
            cids = set(re.findall(r"(?<![a-zA-Z0-9])" + CID_PATTERN + r"(?![a-zA-Z0-9])", raw))
            for cid in cids:
                found.append((cid, str(identifier)[:240], "", GATEWAY + "/ipfs/" + cid))
    except Exception:
        pass
    unique = {}
    for item in found:
        unique[(item[0], item[2])] = item
    return list(unique.values())[:20]

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
        results = [{"cid": cid, "title": title, "path": path, "streamUrl": gateway_url, "score": score,
                    "source": "xoratv-local-index"} for score, cid, title, path, gateway_url in ranked[:20]]
        source = "xoratv-local-index"
        if not results:
            discovered = discover_from_public_search(query)
            for cid, title, path, stream_url in discovered:
                db.execute("INSERT INTO media_index (cid,title,path,gateway_url,source_cid,indexed_at) VALUES (?,?,?,?,?,?)",
                           (cid, title, path, stream_url, "automatic-public-discovery", int(time.time())))
                results.append({"cid": cid, "title": title, "path": path, "streamUrl": stream_url,
                                "score": 1, "source": "automatic-public-discovery"})
            db.commit()
            source = "automatic-public-discovery"
        return {"ok": True, "query": query, "results": results[:20], "count": len(results),
                "indexSize": len(rows), "source": source,
                "message": ("Automatically discovered candidates from public search pages; check playback because availability varies."
                            if source == "automatic-public-discovery" else
                            "Results come from XoraTV's local index.") }
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
