#!/usr/bin/env python3
"""Import authorized Telegram group messages without persisting account secrets.

Requires a Telethon StringSession with access to the specified group.
Only sanitized, public host/portal URLs are written to data/servers.json.
Never print a session, message body, user/pass pair, or device MAC address.
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone

from telethon import TelegramClient
from telethon.sessions import StringSession

from sync import OUTPUT, SOURCE_LIMITS, candidates, clean_url

GROUP = "IPTVXtremeFlix"
READ_LIMIT = 150


async def collect(api_id: int, api_hash: str, session: str) -> list[dict]:
    client = TelegramClient(StringSession(session), api_id, api_hash)
    try:
        await client.connect()
        if not await client.is_user_authorized():
            raise RuntimeError("Telegram session is no longer authorized")
        entity = await client.get_entity(GROUP)
        found: list[dict] = []
        async for post in client.iter_messages(entity, limit=READ_LIMIT):
            if not post.message:
                continue
            found.extend(
                candidates(
                    post.message,
                    GROUP,
                    str(post.id),
                    post.date.isoformat() if post.date else "",
                    GROUP,
                )
            )
        return found
    finally:
        await client.disconnect()


def main() -> int:
    api_id = os.getenv("TELEGRAM_API_ID", "").strip()
    api_hash = os.getenv("TELEGRAM_API_HASH", "").strip()
    session = os.getenv("TELEGRAM_SESSION", "").strip()
    if not (api_id and api_hash and session):
        print("Telegram group sync skipped: API secrets/session not configured.")
        return 0
    if not api_id.isdecimal():
        print("Telegram group sync skipped: invalid API ID.")
        return 0
    try:
        new = asyncio.run(collect(int(api_id), api_hash, session))
    except Exception as exc:
        # Keep last-known data; do not expose raw group content or credentials.
        print("Telegram group sync unavailable:", type(exc).__name__)
        return 0

    try:
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    older = data.get("items", [])
    if not isinstance(older, list):
        older = []
    merged = {}
    for item in older + new:
        if not isinstance(item, dict):
            continue
        if item.get("type") not in ("xtream", "mac"):
            continue
        source = str(item.get("source") or "")
        kind = str(item["type"])
        server = clean_url(str(item.get("server") or ""))
        if not source or not server:
            continue
        key = (source, kind, server)
        safe = {
            "id": str(item.get("id") or ""),
            "type": kind,
            "server": server,
            "source": source,
            "post_url": str(item.get("post_url") or ""),
            "date": str(item.get("date") or ""),
        }
        if not safe["id"]:
            continue
        current = merged.get(key)
        if current is None or safe["date"] > current["date"]:
            merged[key] = safe

    per_source = {}
    for item in sorted(merged.values(), key=lambda x: (x["date"], x["id"]), reverse=True):
        bucket = per_source.setdefault(item["source"], [])
        if len(bucket) < SOURCE_LIMITS.get(item["source"], 2500):
            bucket.append(item)

    data["items"] = sorted(
        [record for bucket in per_source.values() for record in bucket],
        key=lambda x: (x["date"], x["id"]),
        reverse=True,
    )
    data.setdefault("sources", {})[GROUP] = {
        "status": "ok",
        "found": len(new),
    }
    data["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    data["note"] = "Only sanitized public server endpoints are indexed. Credentials and device MACs are never stored."
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Telegram group sync completed; sanitized endpoints found:", len(new))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
