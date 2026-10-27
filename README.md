# MX GetServer

Responsive IPTV server endpoint index for these public Telegram channels:

- https://t.me/IPTVXtremeFlix
- https://t.me/AisosElho
- https://t.me/StbEmucodesStalkerPortal

## Automatic updates

GitHub Actions fetches publicly visible Telegram posts every **15 minutes** (GitHub scheduled jobs may run later than the exact minute). The dashboard checks its JSON feed again every 60 seconds.

Only the **server/portal URL, type, source post URL and date** are published. Passwords, Xtream account usernames, M3U login query parameters, and STB MAC identifiers are never harvested or copied into the repository.

The dashboard supports search, filters, one-click copying of endpoints, and manual session-only entry of your own Username/Password or MAC.

## Deployment

GitHub Pages deployment is configured using `.github/workflows/pages.yml`. If the first deployment is not enabled automatically, open GitHub repository **Settings → Pages** and choose **GitHub Actions**.

Website: https://mazenmix.github.io/getserver/

## Run manually

From **Actions → Telegram feed sync → Run workflow**, invoke an immediate update.

## Implementation

- `index.html` — responsive dashboard.
- `scripts/sync.py` — reads Telegram public preview pages with requests + BeautifulSoup, extracts and sanitizes host/portal addresses.
- `data/servers.json` — generated data.
- `.github/workflows/telegram-sync.yml` — 15-minute scheduler.
- `.github/workflows/pages.yml` — Pages deployment.

## Limitations

Private channels, inaccessible public previews, rate limits, GitHub cron latency and deleted/edited posts may delay or prevent collection. Images are not OCR'ed, and server/account validity is not tested.

## Optional Telegram group API sync

The public HTML-preview importer does not reliably read Telegram group messages.
For a group your Telegram account is authorized to access, an optional Telethon
importer runs after the public feed scraper on the existing 15-minute schedule.

**Do not put any API credentials or session strings in GitHub files.**

Configure three encrypted GitHub Actions **repository secrets** under
`Settings -> Secrets and variables -> Actions`:

- `TELEGRAM_API_ID`: numeric app ID from my.telegram.org.
- `TELEGRAM_API_HASH`: matching secret app hash.
- `TELEGRAM_SESSION`: authorized Telegram account session string.

To create the session on your trusted local computer:

```sh
python -m pip install telethon
python scripts/create_telegram_session.py
```

The script prompts for your Telegram API ID and hash, then the Telegram login
code (and two-step password if required). Copy the resulting session string
**only** into the `TELEGRAM_SESSION` repository secret. Use a dedicated Telegram
account with authorized group access and never publish the session.

Then run `Actions -> Telegram feed sync -> Run workflow`, or wait for the next
scheduled run. With any secret missing, the optional group importer skips
without breaking the two existing public-feed sources. Only sanitized server
URLs are stored: **no usernames, passwords, access tokens or MAC addresses**.

