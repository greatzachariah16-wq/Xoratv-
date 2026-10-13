#!/usr/bin/env python3
"""Search an existing IPFS metadata index, verify playable candidates, then use XoraTV's local fallback.
Only metadata and HEAD/one-byte availability checks are made. Video files are never downloaded or pinned.
"""
import concurrent.futures
import html
import importlib.util
import json
import os
import re
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

CID_PATTERN = r"(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,})"
CID_RE = re.compile("^" + CID_PATTERN + "$")
VIDEO_EXT = re.compile(r"\.(mp4|webm|m4v|mov|mkv|avi|ogv|m3u8|mpg|mpeg|3gp)$", re.I)
GATEWAY = os.environ.get("IPFS_GATEWAY_URL", "https://ipfs.io").rstrip("/")
GATEWAYS = [GATEWAY] + [x.strip().rstrip("/") for x in os.environ.get("IPFS_GATEWAY_FALLBACKS", "https://dweb.link").split(";") if x.strip() and x.strip().rstrip("/") != GATEWAY]
ENDPOINTS = [x.strip().rstrip("/") for x in os.environ.get("IPFS_SEARCH_URLS", "https://api.ipfs-search.com/v1/search").split(";") if x.strip()]
LOCAL_SCRIPT = os.path.join(os.path.dirname(__file__), "ipfs_local_search_index.py")

def emit(data):
    print(json.dumps(data, ensure_ascii=False, separators=(",", ":")), flush=True)

def fetch_json(url):
    req = Request(url, headers={"Accept": "application/json", "User-Agent": "XoraTV-SourceLab/2.0"})
    with urlopen(req, timeout=7) as response:
        return json.loads(response.read(1_500_000).decode("utf-8", "replace"))

def is_video(name, mime=""):
    return bool(VIDEO_EXT.search(name or "")) or str(mime).lower().split(";", 1)[0].startswith("video/")

def verify(cid, title, path="", mime=""):
    if not CID_RE.fullmatch(cid) or not is_video(title or path, mime):
        return None
    for gateway in GATEWAYS:
        url = gateway + "/ipfs/" + cid
        for use_range in (False, True):
            try:
                headers = {"User-Agent": "XoraTV-SourceLab/2.0", "Accept": "video/*,*/*;q=0.5"}
                if use_range:
                    headers["Range"] = "bytes=0-0"
                    req = Request(url, headers=headers)
                else:
                    req = Request(url, method="HEAD", headers=headers)
                with urlopen(req, timeout=4) as response:
                    mime_seen = response.headers.get("Content-Type", "").lower()
                    if response.status in (200, 206) and "text/html" not in mime_seen:
                        return {"cid": cid, "title": (title or path or cid)[:240], "path": path,
                                "streamUrl": url, "contentType": mime_seen, "source": "existing-ipfs-metadata-index"}
            except Exception:
                continue
    return None

def search_existing(query):
    errors = []
    for endpoint in ENDPOINTS:
        url = endpoint + ("&" if "?" in endpoint else "?") + urlencode({"q": query, "type": "file", "page": 0})
        try:
            payload = fetch_json(url)
            hits = payload.get("hits", []) if isinstance(payload, dict) else []
            if isinstance(hits, dict):
                hits = hits.get("hits", [])
            candidates = []
            for hit in hits[:20] if isinstance(hits, list) else []:
                if not isinstance(hit, dict):
                    continue
                cid = str(hit.get("hash") or hit.get("cid") or "").strip()
                metadata = hit.get("metadata") if isinstance(hit.get("metadata"), dict) else {}
                refs = hit.get("references") if isinstance(hit.get("references"), list) else []
                filename = next((str(ref.get("name") or "") for ref in refs if isinstance(ref, dict) and VIDEO_EXT.search(str(ref.get("name") or ""))), "")
                mime = str(hit.get("mimetype") or metadata.get("Content-Type") or "")
                title = html.unescape(re.sub(r"<[^>]+>", "", str(hit.get("title") or metadata.get("title") or metadata.get("dc:title") or filename or cid))).strip()
                if CID_RE.fullmatch(cid) and is_video(filename or title, mime):
                    candidates.append((cid, title, filename, mime))
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                checked = list(pool.map(lambda row: verify(*row), candidates[:8]))
            found = [row for row in checked if row]
            if found:
                return {"ok": True, "query": query, "results": found[:10], "count": len(found),
                        "source": "existing-ipfs-metadata-index", "indexProvider": endpoint,
                        "message": "Found matching metadata in an existing IPFS index and checked gateway availability. Streaming stays on the gateway; no video was downloaded or pinned."}
            errors.append(endpoint + (": no video matches" if not hits else ": no playable video candidates"))
        except Exception as exc:
            errors.append(endpoint + ": " + str(exc)[:140])
    return None, errors

def main():
    query = " ".join(sys.argv[1:]).strip()[:180]
    if len(query) < 2:
        raise ValueError("Enter a video title or keyword.")
    external = search_existing(query)
    if external and isinstance(external, dict):
        emit(external)
        return
    errors = external[1] if external else []
    # Keep the existing local index and its public-discovery fallback as backup.
    spec = importlib.util.spec_from_file_location("xoratv_ipfs_local_index", LOCAL_SCRIPT)
    if not spec or not spec.loader:
        raise RuntimeError("Could not load XoraTV's existing local index fallback.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    result = module.search(query)
    result["providerErrors"] = errors[:3]
    result["source"] = result.get("source") or "xoratv-local-index"
    if result.get("results"):
        result["message"] = "External IPFS index was unavailable or had no playable match; showing fallback results. " + str(result.get("message", ""))
    else:
        result["message"] = "No playable match found in the external IPFS index or fallback sources. " + str(result.get("message", ""))
    emit(result)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit({"ok": False, "error": str(exc)[:400]})
        sys.exit(1)
