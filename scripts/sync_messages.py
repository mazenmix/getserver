#!/usr/bin/env python3
"""Publish safe, short previews of public Telegram posts from two channels.

Credentials and raw full post bodies must never be stored or published.
Historical fallback entries are summaries reconstructed from indexed post links.
"""
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from sync import S, CHANNELS, candidates, clean_url

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "messages.json"
SERVERS = ROOT / "data" / "servers.json"
SAFE_TOPIC = re.compile(
    r"\b(?:iptv|xtream|stalker|playlist|streaming|channels?|updates?|new|trial|test|free|server|portal|m3u|live|vod)\b|"
    r"(?:سيرفر|تحديث|قنوات|اكستريم|ستالكر|بث|تجربة|جديد|اشتراك|افلام)", re.I)
SECRETS = re.compile(
    r"pass(?:word)?|pwd|user(?:name)?|login|mac(?:\s*address)?|token|secret|auth|pin|apikey|serial|credential|"
    r"كلمة\s*المرور|باسورد|اليوزر|مستخدم|الماك", re.I)
URL = re.compile(r"https?://|www\.|t\.me", re.I)
MAC = re.compile(r"(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}", re.I)
POST_LINK = re.compile(r"https://t\.me/[A-Za-z0-9_]+/(\d+)")


def safe_preview(text):
    parts = []
    for raw in text.splitlines():
        line = " ".join(raw.split())
        if not (5 <= len(line) <= 110 and SAFE_TOPIC.search(line)):
            continue
        if SECRETS.search(line) or URL.search(line) or MAC.search(line):
            continue
        if any(char in line for char in ("@", "=", ":", "/", "\\", "|", "#", chr(96))):
            continue
        if re.search(r"\d{4,}|\b(?=\w*[a-z])(?=\w*\d)[a-z0-9]{6,}\b", line, re.I):
            continue
        if any(len(word) > 22 for word in line.split()):
            continue
        if line not in parts:
            parts.append(line)
        if len(parts) == 2:
            break
    return " • ".join(parts)[:220]


def parse_page(html, source):
    soup = BeautifulSoup(html, "html.parser")
    results, post_numbers = [], []
    for el in soup.select(".tgme_widget_message[data-post]"):
        ref = el.get("data-post", "")
        if "/" not in ref:
            continue
        actual_channel, post_id = ref.rsplit("/", 1)
        if not post_id.isdigit():
            continue
        post_numbers.append(int(post_id))
        body = el.select_one(".tgme_widget_message_text")
        if body is None:
            continue
        text = body.get_text("\n", strip=True)
        date_el = el.select_one("time[datetime]")
        date = date_el.get("datetime", "") if date_el else ""
        endpoints = candidates(text, source, post_id, date, actual_channel)
        hosts, kinds = [], set()
        for endpoint in endpoints:
            safe_host = clean_url(endpoint["server"])
            if safe_host and safe_host not in hosts:
                hosts.append(safe_host)
            kinds.add(endpoint["type"])
        summary = safe_preview(text)
        if not summary:
            summary = ("منشور عن سيرفرات " + " و ".join(sorted(kinds))) if kinds else "منشور عام من القناة"
        results.append({
            "id": source + "-" + post_id, "source": source, "post_id": post_id,
            "date": date, "summary": summary, "servers": hosts[:8], "excerpt": True,
        })
    return results, min(post_numbers) if post_numbers else None


def fetch_channel(source, max_pages):
    results, before = {}, None
    for index in range(max_pages):
        try:
            response = S.get("https://t.me/s/" + source,
                             params={"before": before} if before else {}, timeout=20)
            response.raise_for_status()
        except requests.RequestException:
            if index == 0:
                raise
            break
        posts, oldest = parse_page(response.text, source)
        if oldest is None:
            if index == 0:
                raise RuntimeError("No publicly readable messages")
            break
        for post in posts:
            results[post["id"]] = post
        if oldest == before or oldest < 2:
            break
        before = oldest
        time.sleep(0.5)
    return list(results.values())


def fallback():
    try:
        catalog = json.loads(SERVERS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    groups = {}
    for item in catalog.get("items", []):
        source = item.get("source")
        m = POST_LINK.fullmatch(item.get("post_url", ""))
        if source not in CHANNELS or not m:
            continue
        post_id = m.group(1)
        key = source + "-" + post_id
        row = groups.setdefault(key, {
            "id": key, "source": source, "post_id": post_id, "date": item.get("date", ""),
            "summary": "ملخص مفهرس: منشور عن سيرفرات IPTV", "servers": [], "excerpt": False
        })
        address = clean_url(item.get("server", ""))
        if address and address not in row["servers"] and len(row["servers"]) < 8:
            row["servers"].append(address)
    return list(groups.values())


def main():
    try:
        previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previous = {}
    old = previous.get("items", [])
    if not isinstance(old, list):
        old = []
    depth = 55 if not previous.get("deep_scan_completed") else 7
    merged = {}
    for item in fallback() + old:
        if isinstance(item, dict) and item.get("source") in CHANNELS:
            merged[item.get("id")] = item
    sources, successes = {}, 0
    for source in CHANNELS:
        try:
            posts = fetch_channel(source, depth)
            successes += 1
            for item in posts:
                merged[item["id"]] = item
            sources[source] = {"status": "ok", "posts": len(posts)}
        except (requests.RequestException, RuntimeError) as error:
            sources[source] = {"status": "unavailable", "posts": 0}
            print(source + ": preview unavailable: " + type(error).__name__, file=sys.stderr)
    cleaned = []
    for item in merged.values():
        if not isinstance(item, dict) or item.get("source") not in CHANNELS:
            continue
        source, post_id = item["source"], str(item.get("post_id", ""))
        if not post_id.isdigit():
            continue
        excerpt = bool(item.get("excerpt"))
        old_summary = str(item.get("summary") or "")
        summary = safe_preview(old_summary) if excerpt else ""
        if not summary:
            if excerpt and (old_summary.startswith("منشور عن سيرفرات") or old_summary == "منشور عام من القناة"):
                summary = old_summary
            else:
                summary = "ملخص مفهرس: منشور عن سيرفرات IPTV"
        hosts = []
        for raw in item.get("servers", []):
            address = clean_url(str(raw))
            if address and address not in hosts:
                hosts.append(address)
        cleaned.append({
            "id": source + "-" + post_id, "source": source, "post_id": post_id,
            "date": str(item.get("date", "")), "summary": summary[:220],
            "servers": hosts[:8], "excerpt": excerpt,
        })
    cleaned.sort(key=lambda x: (x["date"], int(x["post_id"])), reverse=True)
    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "deep_scan_completed": bool(previous.get("deep_scan_completed")) or (depth == 55 and successes == len(CHANNELS)),
        "sources": sources, "items": cleaned[:3000],
        "note": "Safe excerpts of public messages and historical summaries only. No authentication data.",
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Telegram posts indexed:", len(output["items"]))


if __name__ == "__main__":
    main()
