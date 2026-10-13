#!/usr/bin/env python3
"""Scheduled XoraTV IPFS metadata discovery worker.

This searches public web indexes for newly indexed IPFS gateway links and submits
filename/CID metadata to XoraTV. It does not download or pin video bytes.
It is NOT a full DHT sniffer: public search indexes only expose a subset of IPFS.
"""
import html
import json
import os
import re
import time
from urllib.parse import quote_plus, urlparse, unquote
from urllib.request import Request, urlopen

APP_URL = os.environ.get("XORATV_SOURCE_URL", "https://xoratv-x.onrender.com").rstrip("/")
TOKEN = os.environ.get("IPFS_INGEST_TOKEN", "")
USER_AGENT = "Mozilla/5.0 (compatible; XoraTV-IPFS-Metadata-Discovery/1.0)"
CID = r"(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})"
EXT = re.compile(r"\.(?:mp4|webm|m4v|mov|mkv|avi|ogv|m3u8|mpg|mpeg|3gp)$", re.I)
CID_PATH = re.compile(r"/(?:ipfs|ipns)/(" + CID + r")(?:/([^?#\"'<> ]*))?", re.I)
MAX_RECORDS = 100
QUERIES = [
    'site:ipfs.io/ipfs/ (mp4 OR webm OR mkv)',
    'site:dweb.link/ipfs/ (mp4 OR webm OR mkv)',
    'site:gateway.pinata.cloud/ipfs/ (mp4 OR webm OR mkv)',
    '"ipfs://" (mp4 OR webm OR mkv) video',
    'site:ipfs.io/ipfs/ 2026 video mp4',
]

def get(url, limit=1_000_000):
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json;q=0.9,*/*;q=0.5"})
    with urlopen(req, timeout=12) as res:
        return res.read(limit).decode("utf-8", "replace"), res.geturl()

def search_page(query):
    # DuckDuckGo HTML results only; if blocked, that source is skipped.
    url = "https://html.duckduckgo.com/html/?q=" + quote_plus(query)
    page, _ = get(url, 1_200_000)
    links = re.findall(r'href=["\\']([^"\\']+)["\\']', page, re.I)
    return [html.unescape(x) for x in links]

def discover():
    found = {}
    errors = []
    for query in QUERIES:
        try:
            for link in search_page(query):
                if len(found) >= MAX_RECORDS:
                    break
                link = html.unescape(link).replace("&amp;", "&")
                # Search result wrappers can contain the destination URL in uddg.
                if "uddg=" in link:
                    from urllib.parse import parse_qs
                    dest = parse_qs(urlparse(link).query).get("uddg", [""])[0]
                    if dest:
                        link = dest
                match = CID_PATH.search(link)
                if not match:
                    continue
                cid = match.group(1)
                path = unquote(match.group(2) or "").strip("/")
                filename = path.rsplit("/", 1)[-1] if path else ""
                if not EXT.search(filename):
                    continue
                key = (cid, path)
                found[key] = {"cid": cid, "title": filename[:240], "filename": filename[:240],
                              "path": path, "source": "scheduled-public-web-discovery"}
        except Exception as exc:
            errors.append(type(exc).__name__ + ": " + str(exc)[:100])
        if len(found) >= MAX_RECORDS:
            break
        time.sleep(1.0)
    return list(found.values())[:MAX_RECORDS], errors

def main():
    if not TOKEN:
        raise RuntimeError("IPFS_INGEST_TOKEN is not configured on this worker.")
    records, errors = discover()
    if not records:
        print(json.dumps({"ok": True, "discovered": 0, "ingested": 0, "errors": errors[:4],
                          "note": "No new public-web IPFS video links found this run. This is not a full DHT scan."}))
        return
    body = json.dumps({"records": records}).encode()
    req = Request(APP_URL + "/api/source-ipfs-ingest", data=body, method="POST",
                  headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json",
                           "User-Agent": USER_AGENT})
    with urlopen(req, timeout=25) as res:
        result = json.loads(res.read(200_000).decode("utf-8", "replace"))
    print(json.dumps({"ok": result.get("ok", False), "discovered": len(records),
                      "ingest": result, "searchErrors": errors[:4]}, ensure_ascii=False))
    if not result.get("ok"):
        raise RuntimeError("XoraTV ingest endpoint did not accept records.")

if __name__ == "__main__":
    main()
