#!/usr/bin/env python3
"""Resolve BitTorrent magnet metadata only. Never download torrent payload pieces."""
import json
import sys
import time
import traceback

TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://tracker.torrent.eu.org:451/announce",
]


def emit(payload):
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def main():
    started = time.monotonic()
    try:
        import libtorrent as lt
    except Exception as exc:
        emit({
            "ok": False, "code": "engine-start-failed",
            "error": "Python libtorrent is not installed or could not be loaded.",
            "detail": str(exc)[:240], "elapsedMs": int((time.monotonic() - started) * 1000),
        })
        return

    try:
        request = json.load(sys.stdin)
        magnet = str(request.get("magnet", "")).strip()
        timeout_ms = min(max(int(request.get("timeoutMs", 28000)), 1000), 28000)
        session = lt.session({
            "enable_dht": True,
            "enable_lsd": False,
            "enable_upnp": False,
            "enable_natpmp": False,
            "listen_interfaces": "0.0.0.0:0",
        })
        params = lt.parse_magnet_uri(magnet)
        params.save_path = "/tmp/xoratv-metadata-only"
        params.trackers = list(dict.fromkeys(list(getattr(params, "trackers", [])) + TRACKERS))
        # Upload mode blocks payload-piece downloads; only the small torrent metadata is requested.
        params.flags |= lt.torrent_flags.upload_mode
        handle = session.add_torrent(params)
        handle.set_upload_mode(True)
        deadline = time.monotonic() + timeout_ms / 1000.0

        while time.monotonic() < deadline:
            status = handle.status()
            if status.has_metadata:
                info = handle.get_torrent_info()
                storage = info.files()
                files = []
                total_size = 0
                for index in range(storage.num_files()):
                    path = storage.file_path(index)
                    size = int(storage.file_size(index))
                    total_size += size
                    name = path.rsplit("/", 1)[-1] or path
                    suffix = name.rsplit(".", 1)[-1].lower() if "." in name else ""
                    mime = {
                        "mp4": "video/mp4", "mkv": "video/x-matroska",
                        "webm": "video/webm", "avi": "video/x-msvideo",
                        "mov": "video/quicktime", "m4v": "video/x-m4v",
                        "mp3": "audio/mpeg", "srt": "application/x-subrip",
                    }.get(suffix, "application/octet-stream")
                    files.append({"name": name, "path": path, "size": size, "type": mime})
                emit({
                    "ok": True,
                    "infoHash": str(info.info_hash()).lower(),
                    "name": info.name(),
                    "files": files[:12],
                    "totalSize": total_size,
                    "peerCount": int(status.num_peers),
                    "downloadedBytes": int(status.total_download),
                    "elapsedMs": int((time.monotonic() - started) * 1000),
                    "engine": "libtorrent-python",
                    "payloadDownloaded": False,
                })
                session.pause()
                return
            time.sleep(0.25)

        status = handle.status()
        emit({
            "ok": False,
            "infoHash": str(handle.info_hash()).lower(),
            "code": "metadata-timeout",
            "error": "libtorrent did not receive torrent metadata before the deadline.",
            "peerCount": int(status.num_peers),
            "downloadedBytes": int(status.total_download),
            "elapsedMs": int((time.monotonic() - started) * 1000),
        })
        session.pause()
    except Exception as exc:
        emit({
            "ok": False,
            "code": "torrent-error",
            "error": str(exc)[:240],
            "detail": traceback.format_exc(limit=2)[-500:],
            "elapsedMs": int((time.monotonic() - started) * 1000),
        })


if __name__ == "__main__":
    main()
