#!/usr/bin/env python3
"""Discover an IPFS media result and return a gateway URL for on-demand playback.

This script does not pin content by default: recursive pinning can fetch and retain
the entire content DAG, which is not the same as on-the-fly streaming. Run it on
the same host as the configured IPFS gateway, or set IPFS_GATEWAY_URL accordingly.
"""
import json
import os
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# IPFS Search documents this endpoint in its public OpenAPI specification.
# Additional endpoints may be configured as a semicolon-separated fallback list.
DEFAULT_SEARCH_URL = "https://api.ipfs-search.com/v1/search"
SEARCH_URLS = []
for candidate in os.environ.get("IPFS_SEARCH_URLS", os.environ.get("IPFS_SEARCH_URL", DEFAULT_SEARCH_URL)).split(";"):
    candidate = candidate.strip().rstrip("/")
    if candidate and candidate not in SEARCH_URLS:
        SEARCH_URLS.append(candidate)
GATEWAY_URL = os.environ.get("IPFS_GATEWAY_URL", os.environ.get("KUBO_GATEWAY_URL", "http://127.0.0.1:8080")).rstrip("/")
TIMEOUT_SECONDS = max(5, min(int(os.environ.get("IPFS_PIPELINE_TIMEOUT", "35")), 90))
DEFAULT_QUERIES = ["animation", "documentary", "short film", "feature film"]
QUERIES = [q.strip() for q in os.environ.get("IPFS_MEDIA_QUERIES", ";".join(DEFAULT_QUERIES)).split(";") if q.strip()]
CID_RE = re.compile(r"^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,})$")


def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)


def request_json(url, timeout=TIMEOUT_SECONDS):
    req = Request(url, headers={"Accept": "application/json", "User-Agent": "XoraTV-IPFS-MediaLab/1.0"})
    with urlopen(req, timeout=timeout) as response:
        raw = response.read(2_000_000)
        return json.loads(raw.decode("utf-8", "replace"))


def walk_dicts(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_dicts(child)


def field_text(item, keys):
    parts = []
    for key in keys:
        value = item.get(key)
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, dict):
            parts.extend(str(v) for v in value.values() if isinstance(v, str))
    return " ".join(parts)


def cid_from(item):
    for key in ("cid", "CID", "hash", "ipfs_hash", "ipfsHash", "content_id"):
        value = item.get(key)
        if isinstance(value, str):
            value = value.removeprefix("/ipfs/").strip()
            if CID_RE.fullmatch(value):
                return value
    for key in ("path", "url", "uri", "ipfs_url"):
        value = item.get(key)
        if isinstance(value, str):
            match = re.search(r"/ipfs/((?:Qm[1-9A-HJ-NP-Za-km-z]{44})|(?:bafy[a-z2-7]{20,}))", value)
            if match:
                return match.group(1)
    return None


def discover(manual_query=""):
    if manual_query.strip():
        query_text = manual_query.strip()[:180]
    else:
        if not QUERIES:
            raise RuntimeError("Enter a title or configure IPFS_MEDIA_QUERIES.")
        query_text = QUERIES[0]
    failures = []
    for search_url in SEARCH_URLS:
        url = search_url + ("&" if "?" in search_url else "?") + urlencode({"q": query_text})
        try:
            payload = request_json(url)
        except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
            reason = str(exc)
            if "TLSV1_UNRECOGNIZED_NAME" in reason or "unrecognized name" in reason.lower():
                reason = "TLS hostname rejected by provider"
            failures.append(search_url + ": " + reason[:140])
            continue

        for item in walk_dicts(payload):
            cid = cid_from(item)
            if not cid:
                continue
            title = field_text(item, ("title", "name", "filename", "file_name", "path")) or query_text
            return query_text, {"cid": cid, "title": title[:240]}

        failures.append(search_url + ": response contained no recognized CID")
    raise RuntimeError(
        "No configured IPFS keyword-search endpoint returned a usable CID. "
        "Set IPFS_SEARCH_URLS to one or more semicolon-separated, verified search API URLs. "
        + " | ".join(failures)[:260]
        + ". Nothing was pinned or downloaded."
    )


def run():
    started = time.monotonic()
    query_text, result = discover(" ".join(sys.argv[1:]))
    emit({
        "ok": True,
        "query": query_text,
        "title": result["title"],
        "cid": result["cid"],
        "pinned": False,
        "pinNote": "On-demand gateway playback requested. This pipeline does not pin the CID or intentionally fetch the complete media file.",
        "streamUrl": GATEWAY_URL + "/ipfs/" + result["cid"],
        "elapsedMs": int((time.monotonic() - started) * 1000),
    })


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        emit({"ok": False, "error": str(exc)[:400], "elapsedMs": 0})
        sys.exit(1)
