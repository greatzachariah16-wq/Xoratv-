import json
import sys
from urllib.parse import urlencode

try:
    from curl_cffi import requests
except Exception as exc:
    print(json.dumps({"ok": False, "error": "curl_cffi is not installed in the Render build environment.", "detail": str(exc)[:200]}))
    raise SystemExit(0)

query = (sys.argv[1] if len(sys.argv) > 1 else "").strip()[:160]
try:
    category = int(sys.argv[2]) if len(sys.argv) > 2 else 201
except ValueError:
    category = 201

url = "https://apibay.org/q.php?" + urlencode({"q": query, "cat": category})
try:
    response = requests.get(
        url,
        impersonate="chrome",
        timeout=15,
        headers={"Accept": "application/json,text/plain,*/*"},
    )
    body = response.text[:200000]
    result = {
        "ok": response.status_code == 200,
        "status": response.status_code,
        "url": str(response.url),
        "contentType": response.headers.get("content-type", ""),
        "body": body,
    }
    print(json.dumps(result, ensure_ascii=False))
except Exception as exc:
    print(json.dumps({"ok": False, "error": "curl_cffi request failed.", "detail": str(exc)[:300]}))
