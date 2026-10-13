#!/usr/bin/env python3
"""Discover and pin only search results that explicitly expose open-license metadata.

Run this script on the same host as a Kubo daemon, or set KUBO_RPC_URL to a
trusted Kubo RPC endpoint. Kubo RPC is an administrative API: never expose it
to the public internet.
"""
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SEARCH_URL = os.environ.get("IPFS_SEARCH_URL", "https://api.ipfs-search.com/v1/search")
KUBO_RPC_URL = os.environ.get("KUBO_RPC_URL", "http://127.0.0.1:5001").rstrip("/")
GATEWAY_URL = os.environ.get("KUBO_GATEWAY_URL", "http://127.0.0.1:8080").rstrip("/")
TIMEOUT_SECONDS = max(5, min(int(os.environ.get("IPFS_PIPELINE_TIMEOUT", "35")), 90))

# Automated rotation; these Blender Foundation films are distributed under
# Creative Commons licenses. Search-index metadata must independently confirm
# an open license before a CID is pinned.
CATALOG = [
    {"title": "Big Buck Bunny", "license_family": "Creative Commons", "license_reference": "https://peach.blender.org/about/"},
    {"title": "Sintel", "license_family": "Creative Commons", "license_reference": "https://durian.blender.org/about/"},
    {"title": "Tears of Steel", "license_family": "Creative Commons", "license_reference": "https://mango.blender.org/about/"},
    {"title": "Elephants Dream", "license_family": "Creative Commons", "license_reference": "https://orange.blender.org/about/"},
]
CID_RE = re.compile(r"^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,})$")
OPEN_LICENSE_RE = re.compile(r"creative\s*commons|\bcc0\b|public\s*domain|creativecommons\.org|\bmit\b", re.I)


def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)


def request_json(url, method="GET", body=None, timeout=TIMEOUT_SECONDS):
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Accept": "application/json", "User-Agent": "XoraTV-IPFS-MediaLab/1.0"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = Request(url, data=data, headers=headers, method=method)
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


def discover():
    day = datetime.now(timezone.utc).timetuple().tm_yday
    target = CATALOG[(day - 1) % len(CATALOG)]
    query = urlencode({"q": target["title"]})
    try:
        payload = request_json(SEARCH_URL + ("&" if "?" in SEARCH_URL else "?") + query)
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
        raise RuntimeError("IPFS search index is unavailable: " + str(exc)[:180])

    candidates = []
    for item in walk_dicts(payload):
        title = field_text(item, ("title", "name", "filename", "file_name", "path"))
        if target["title"].casefold() not in title.casefold():
            continue
        cid = cid_from(item)
        if not cid:
            continue
        license_text = field_text(item, ("license", "licence", "license_name", "license_url", "licence_url", "rights", "license_type"))
        if not OPEN_LICENSE_RE.search(license_text):
            continue
        candidates.append({"cid": cid, "title": title[:240], "license": license_text[:300]})

    if not candidates:
        raise RuntimeError(
            "No matching result exposed both a valid CID and explicit open-license metadata. "
            "Nothing was pinned; refusing to guess a CID or infer a license from the title."
        )
    return target, candidates[0]


def run():
    started = time.monotonic()
    target, result = discover()
    # Check that Kubo is actually reachable before mutating its pin set.
    try:
        request_json(KUBO_RPC_URL + "/api/v0/id", method="POST", body=None, timeout=5)
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
        raise RuntimeError("Kubo RPC is unreachable at " + KUBO_RPC_URL + ": " + str(exc)[:160])

    pin_url = KUBO_RPC_URL + "/api/v0/pin/add?" + urlencode({"arg": result["cid"], "recursive": "true", "progress": "false"})
    try:
        request_json(pin_url, method="POST", body=None, timeout=TIMEOUT_SECONDS)
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
        raise RuntimeError("Kubo could not pin the CID: " + str(exc)[:180])

    emit({
        "ok": True,
        "query": target["title"],
        "title": result["title"],
        "cid": result["cid"],
        "license": result["license"],
        "licenseReference": target["license_reference"],
        "pinned": True,
        "pinNote": "Recursive pinning may fetch the full file/DAG and use local disk space.",
        "streamUrl": GATEWAY_URL + "/ipfs/" + result["cid"],
        "elapsedMs": int((time.monotonic() - started) * 1000),
    })


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        emit({"ok": False, "error": str(exc)[:400], "elapsedMs": 0})
        sys.exit(1)
