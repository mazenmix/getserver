#!/usr/bin/env python3
"""Index publicly visible IPTV server endpoints from two Telegram channels.

Only public host/portal URLs and Telegram post metadata are published.
The script deliberately does not collect, store, or republish passwords,
usernames, M3U auth querystrings, or device MAC addresses.
"""
from __future__ import annotations

import hashlib
import os
import json
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "servers.json"
CHANNELS = ("IPTVXtremeFlix", "AisosElho")
RECENT_PAGES = 8
BACKFILL_PAGES = 55
MAX_PER_CHANNEL = 2500
URL_RX = re.compile(r"https?://[^\s<>\[\]\"'،،]+", re.IGNORECASE)
MAC_RX = re.compile(r"(?<![0-9a-f])(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}(?![0-9a-f])", re.I)
USERNAME_RX = re.compile(r"\b(?:user(?:name)?|login)\s*[:=👉–-]\s*\S+", re.I)
PASSWORD_RX = re.compile(r"\b(?:pass(?:word)?|pwd)\s*[:=👉–-]\s*\S+", re.I)
PORTAL_WORDS = re.compile(r"\b(?:portal|stalker|stb.?emu|mac\s*address)\b", re.I)
XTREAM_WORDS = re.compile(r"\b(?:xtream|extream|m3u|username|password)\b", re.I)
HEADER_RX = re.compile(r"(?:host|server|portal|url|link)\s*[:=👉–-]\s*(https?://[^\s]+)", re.I)
DENY_HOSTS = ("t.me", "telegram.me", "youtube.com", "youtu.be", "facebook.com",
              "instagram.com", "github.com", "raw.githubusercontent.com",
              "tinyurl.com", "bit.ly", "wa.me", "linktr.ee", "play.google.com")
S = requests.Session()
S.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; MXGetServer/1.0; +https://github.com/mazenmix/getserver)",
    "Accept-Language": "en-US,en;q=0.8",
})


def clean_url(raw: str) -> str | None:
    """Discard any credentials, paths, fragments or auth query parameters."""
    raw = raw.strip(" \t\r\n),.;!?]}>”'\"")
    try:
        u = urlsplit(raw)
        if u.scheme not in ("http", "https") or not u.hostname:
            return None
        host = u.hostname.lower().strip(".")
        if host in DENY_HOSTS or any(host.endswith("." + bad) for bad in DENY_HOSTS):
            return None
        if not re.fullmatch(r"[a-z0-9.-]+", host):
            return None
        if u.port and not 1 <= u.port <= 65535:
            return None
        if u.username or u.password:
            # Do not ingest URLs containing basic-auth credentials.
            return None
        port = (":" + str(u.port)) if u.port else ""
        p = u.path.lower().strip("/")
        path = "/c/" if p == "c" else "/stalker_portal/c/" if p == "stalker_portal/c" else ""
        # HTTPS/HTTP scheme comes from the post, not a connectivity test.
        return urlunsplit((u.scheme, host + port, path, "", ""))
    except ValueError:
        return None


def candidates(text: str, channel: str, postid: str, date: str, actual_channel: str = "") -> list[dict]:
    text = unicodedata.normalize("NFKC", text).replace("\u200b", "")
    full_urls = [m.group(0) for m in URL_RX.finditer(text)]
    if not full_urls:
        return []
    mac_like = bool(MAC_RX.search(text))
    mac_context = mac_like or bool(PORTAL_WORDS.search(text))
    xtream_context = bool(XTREAM_WORDS.search(text)) or bool(USERNAME_RX.search(text) and PASSWORD_RX.search(text))
    candidates = []
    seen = set()
    for raw in full_urls:
        try:
            parsed = urlsplit(raw.rstrip("),.;"))
        except ValueError:
            continue
        path = (parsed.path or "").lower()
        query = (parsed.query or "").lower()
        explicit_mac = path.rstrip("/") == "/c" or "stalker_portal" in path
        explicit_xtream = "get.php" in path or ("username=" in query and "password=" in query)
        if explicit_mac:
            kind = "mac"
        elif explicit_xtream:
            kind = "xtream"
        elif mac_context and not xtream_context:
            kind = "mac"
        elif xtream_context:
            kind = "xtream"
        else:
            # Ignore generic websites, CDNs, channels and unrelated links.
            continue
        if not (explicit_mac or explicit_xtream or HEADER_RX.search(text) or ":" in parsed.netloc):
            continue
        server = clean_url(raw)
        if not server or (server, kind) in seen:
            continue
        seen.add((server, kind))
        digest = hashlib.sha256((channel + "/" + postid + "/" + server + "/" + kind).encode()).hexdigest()[:14]
        candidates.append({
            "id": channel + "-" + postid + "-" + digest,
            "type": kind,
            "server": server,
            "source": channel,
            "post_url": "https://t.me/" + (actual_channel or channel) + "/" + postid,
            "date": date,
        })
    return candidates


def parse_page(html: str, channel: str) -> tuple[list[dict], int | None]:
    soup = BeautifulSoup(html, "html.parser")
    messages = soup.select(".tgme_widget_message[data-post]")
    results = []
    numbers = []
    for el in messages:
        data_post = el.get("data-post", "")
        if "/" not in data_post:
            continue
        actual_channel, postid = data_post.rsplit("/", 1)
        if not re.fullmatch(r"[a-zA-Z0-9_]{4,64}", actual_channel):
            continue
        if not postid.isdigit():
            continue
        numbers.append(int(postid))
        message = el.select_one(".tgme_widget_message_text")
        if message is None:
            continue
        # get_text omits image-only and files-only posts by design.
        text = message.get_text(" ", strip=True)
        time_el = el.select_one("time[datetime]")
        posted_at = time_el.get("datetime", "") if time_el else ""
        results.extend(candidates(text, channel, postid, posted_at, actual_channel))
    return results, min(numbers) if numbers else None


def fetch(channel: str, page_limit: int) -> list[dict]:
    collected, seen_ids = [], set()
    before = None
    for page in range(page_limit):
        url = "https://t.me/s/" + channel
        params = {"before": before} if before else {}
        try:
            response = S.get(url, params=params, timeout=20)
            response.raise_for_status()
        except requests.RequestException:
            if page == 0:
                raise
            print(channel + ": reached connection limit after " + str(page) + " pages", file=sys.stderr)
            break
        posts, oldest = parse_page(response.text, channel)
        if oldest is None:
            if page == 0:
                raise RuntimeError("No public channel messages visible; channel may be private or blocked")
            break
        for item in posts:
            if item["id"] not in seen_ids:
                collected.append(item)
                seen_ids.add(item["id"])
        if oldest == before or oldest < 2:
            break
        before = oldest
        time.sleep(0.6)
    return sorted(collected, key=lambda x: (x["date"], x["id"]), reverse=True)[:MAX_PER_CHANNEL]


def main() -> int:
    try:
        previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previous = {}
    old_items = previous.get("items", []) if isinstance(previous.get("items"), list) else []
    archive_path = ROOT / "data" / "archive.json"
    try:
        archive = json.loads(archive_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        archive = []
    if not isinstance(archive, list):
        archive = []

    today = datetime.now(timezone.utc).date().isoformat()
    is_sunday_deep = datetime.now(timezone.utc).weekday() == 6 and previous.get("last_deep_scan", "")[:10] != today
    deep_scan = os.environ.get("MX_DEEP_SCAN") == "1" or not previous.get("deep_scan_completed") or is_sunday_deep
    pages = BACKFILL_PAGES if deep_scan else RECENT_PAGES
    print("Scan mode:", "historical backfill" if deep_scan else "recent", "- pages/channel:", pages)
    updated = []
    statuses = {}
    all_ok = True
    for channel in CHANNELS:
        try:
            channel_items = fetch(channel, pages)
            statuses[channel] = {"status": "ok", "found": len(channel_items)}
            updated.extend(channel_items)
            print(channel + ": " + str(len(channel_items)) + " public server endpoints indexed")
        except (requests.RequestException, RuntimeError) as err:
            all_ok = False
            statuses[channel] = {"status": "unavailable", "found": 0}
            print(channel + ": public preview unavailable (" + type(err).__name__ + ")", file=sys.stderr)

    # Preserve historical entries across scans and service interruptions.
    # Seed archive is limited to independently observed public hostnames.
    by_server = {}
    for x in archive + old_items + updated:
        if not isinstance(x, dict) or x.get("source") not in CHANNELS:
            continue
        if x.get("type") not in ("xtream", "mac"):
            continue
        sanitized = clean_url(str(x.get("server", "")))
        if not sanitized or not str(x.get("id", "")):
            continue
        source = x["source"]
        kind = x["type"]
        key = (source, kind, sanitized)
        post_url = str(x.get("post_url", ""))
        if not re.fullmatch(r"https://t[.]me/[A-Za-z0-9_]+(?:/[0-9]+)?", post_url):
            post_url = "https://t.me/" + source
        item = {
            "id": str(x["id"]),
            "type": kind,
            "server": sanitized,
            "source": source,
            "post_url": post_url,
            "date": str(x.get("date") or ""),
        }
        existing = by_server.get(key)
        # Prefer entries with an actual Telegram post and a known date.
        rank = (bool(re.search(r"/[0-9]+$", post_url)), item["date"])
        existing_url = existing.get("post_url", "") if existing else ""
        existing_rank = (bool(re.search(r"/[0-9]+$", existing_url)), existing.get("date", "")) if existing else (False, "")
        if existing is None or rank > existing_rank:
            by_server[key] = item

    result = sorted(by_server.values(), key=lambda x: (x["date"], x["id"]), reverse=True)
    result = [x for c in CHANNELS for x in [z for z in result if z["source"] == c][:MAX_PER_CHANNEL]]
    result.sort(key=lambda x: (x["date"], x["id"]), reverse=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    payload = {
        "updated_at": now,
        "last_deep_scan": now if deep_scan and all_ok else previous.get("last_deep_scan"),
        "deep_scan_completed": bool(previous.get("deep_scan_completed")) or (deep_scan and all_ok),
        "sources": statuses,
        "items": result,
        "note": "Historical public server endpoints only. No third-party account credentials or MACs are collected.",
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if not all_ok and not result and old_items:
        print("Keeping last saved dataset due to inaccessible feeds.", file=sys.stderr)
        return 0
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Total historical + recent endpoints:", len(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
