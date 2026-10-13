#!/usr/bin/env python3
"""Search Internet Archive metadata and return a directly playable media URL.

This test pipeline searches by keyword and resolves an item's metadata to a
browser-facing file URL. It does not download or pin media and does not apply
a license/rights filter. Internet Archive search is a media catalogue, not a
guarantee that every item is available or playable.
"""
import json
import os
import re
import sys
import time
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

ARCHIVE_SEARCH_URL = os.environ.get(
    "INTERNET_ARCHIVE_SEARCH_URL",
    "https://archive.org/advancedsearch.php",
).rstrip("/")
ARCHIVE_METADATA_URL = os.environ.get(
    "INTERNET_ARCHIVE_METADATA_URL",
    "https://archive.org/metadata",
).rstrip("/")
DEFAULT_QUERY = os.environ.get("IPFS_MEDIA_QUERY", "Big Buck Bunny").strip() or "Big Buck Bunny"
TIMEOUT_SECONDS = max(5, min(int(os.environ.get("MEDIA_PIPELINE_TIMEOUT", "25")), 60))
MAX_SEARCH_RESULTS = max(1, min(int(os.environ.get("INTERNET_ARCHIVE_ROWS", "12")), 30))
PLAYABLE_EXTENSIONS = (".mp4", ".m4v", ".webm", ".ogv", ".ogg")
PLAYABLE_FORMATS = ("mpeg4", "h.264", "h264", "webm", "ogg video", "quicktime")


def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)


def request_json(url):
    req = Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "XoraTV-MediaLab/1.0 (Internet Archive metadata test)",
    })
    with urlopen(req, timeout=TIMEOUT_SECONDS) as response:
        raw = response.read(3_000_000)
        return json.loads(raw.decode("utf-8", "replace"))


def search_archive(query):
    params = {
        "q": f'mediatype:movies AND (title:("{query}") OR identifier:("{query}"))',
        "fl[]": ["identifier", "title", "year"],
        "rows": str(MAX_SEARCH_RESULTS),
        "page": "1",
        "output": "json",
    }
    # urllib's urlencode supports doseq for repeated fl[] fields.
    url = ARCHIVE_SEARCH_URL + "?" + urlencode(params, doseq=True)
    payload = request_json(url)
    docs = payload.get("response", {}).get("docs", [])
    if not docs:
        # Broader fallback, still a title/keyword search and not a rights filter.
        params["q"] = f'mediatype:movies AND "{query}"'
        payload = request_json(ARCHIVE_SEARCH_URL + "?" + urlencode(params, doseq=True))
        docs = payload.get("response", {}).get("docs", [])
    return docs


def choose_media_file(files):
    candidates = []
    for item in files if isinstance(files, list) else []:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        fmt = str(item.get("format", "")).lower()
        if not isinstance(name, str) or name.startswith("__MACOSX/"):
            continue
        if name.lower().endswith(PLAYABLE_EXTENSIONS) or any(tag in fmt for tag in PLAYABLE_FORMATS):
            # Prefer MP4, then WebM/OGV, and skip obvious metadata/thumbnail files.
            lower = name.lower()
            if lower.endswith((".jpg", ".jpeg", ".png", ".gif", ".xml", ".torrent")):
                continue
            rank = 0 if lower.endswith(".mp4") else 1 if lower.endswith(".m4v") else 2 if lower.endswith(".webm") else 3
            candidates.append((rank, int(item.get("size", 0) or 0), name, item))
    if not candidates:
        return None
    candidates.sort(key=lambda x: (x[0], -x[1]))
    return candidates[0][3]


def discover(query):
    docs = search_archive(query)
    failures = []
    for doc in docs:
        identifier = doc.get("identifier")
        if not isinstance(identifier, str) or not re.fullmatch(r"[A-Za-z0-9._-]+", identifier):
            continue
        try:
            metadata = request_json(f"{ARCHIVE_METADATA_URL}/{quote(identifier, safe='')}")
        except Exception as exc:
            failures.append(f"{identifier}: {str(exc)[:100]}")
            continue
        item = choose_media_file(metadata.get("files", []))
        if not item:
            continue
        filename = item.get("name")
        title = str(doc.get("title") or metadata.get("metadata", {}).get("title") or identifier)
        media_url = f"https://archive.org/download/{quote(identifier, safe='')}/{quote(filename, safe='/')}"
        return {
            "source": "Internet Archive",
            "identifier": identifier,
            "title": title[:240],
            "mediaUrl": media_url,
            "fileName": filename,
            "fileSize": item.get("size"),
            "metadataUrl": f"https://archive.org/details/{quote(identifier, safe='')}",
        }
    detail = (" Metadata lookup issues: " + " | ".join(failures[:3])) if failures else ""
    raise RuntimeError(
        f'No Internet Archive movie result with a recognized browser-playable file was found for "{query}".'
        + detail
        + " No media was downloaded."
    )


def run():
    started = time.monotonic()
    query = " ".join(sys.argv[1:]).strip() or DEFAULT_QUERY
    query = query[:180]
    result = discover(query)
    emit({
        "ok": True,
        "query": query,
        **result,
        "pinned": False,
        "pinNote": "Direct on-demand playback URL resolved from Internet Archive metadata. The pipeline did not download or pin the media.",
        "streamUrl": result["mediaUrl"],
        "elapsedMs": int((time.monotonic() - started) * 1000),
    })


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        emit({"ok": False, "error": str(exc)[:400], "elapsedMs": 0})
        sys.exit(1)
