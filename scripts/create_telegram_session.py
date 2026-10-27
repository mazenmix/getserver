#!/usr/bin/env python3
"""Generate a local Telegram StringSession for the GitHub encrypted secret.

Run this only on a trusted personal computer, never inside GitHub Actions.
Do NOT paste your session, login code or API hash into issues or chats.
"""
from getpass import getpass
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

def main():
    app_id = int(input("Telegram app API ID: ").strip())
    app_hash = getpass("Telegram app API hash (input hidden): ").strip()
    if not app_hash:
        raise SystemExit("API hash required.")
    with TelegramClient(StringSession(), app_id, app_hash) as client:
        print("Telegram login succeeded. Save the following session as a GitHub Actions secret named TELEGRAM_SESSION.")
        print(client.session.save())
        print("Treat this session as a password and use a dedicated authorized account.")

if __name__ == "__main__":
    main()
