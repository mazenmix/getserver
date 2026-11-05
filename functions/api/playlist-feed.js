// Public Telegram M3U links, returned only through the existing password-protected site.
// This endpoint never fetches playlists or stores post data in the public GitHub repository.
const SOURCES = ["IPTVXtremeFlix", "AisosElho", "StbEmucodesStalkerPortal"];
const PLAYLIST_RE = /https?:\\?\/\\?\/[^\\s<>"']+?\\.m3u8?(?:\\?[^\\s<>"']*)?/gi;
const POST_RE = /data-post=["']([A-Za-z0-9_]+)\/(\d+)["']/g;

function decodeEntities(value) {
  return value.replace(/&amp;/gi, "&").replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/").replace(/&quot;/gi, '"');
}
function validatePlaylist(candidate) {
  try {
    const url = new URL(decodeEntities(candidate).replace(/\\\//g, "/"));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password || !/\\.m3u8?$/i.test(url.pathname)) return null;
    if (["t.me", "telegram.me", "youtube.com"].includes(url.hostname.toLowerCase())) return null;
    // Do not publish account/password query parameters in this feed.
    if (Array.from(url.searchParams.keys()).some(k => /user|pass|token|key|auth|session/i.test(k))) return null;
    return url.href;
  } catch { return null; }
}
async function readSource(source) {
  const url = "https://t.me/s/" + source;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: abort.signal,
      headers: { "Accept": "text/html", "User-Agent": "Mozilla/5.0" },
      cf: { cacheTtl: 60, cacheEverything: true }
    });
    if (!response.ok) return { source, status: "unavailable", items: [] };
    const html = await response.text();
    const starts = [...html.matchAll(POST_RE)];
    if (!starts.length) return { source, status: "unavailable", items: [] };
    const items = [];
    for (let i = 0; i < starts.length; i++) {
      const match = starts[i], next = starts[i + 1];
      const postHtml = html.slice(match.index, next ? next.index : html.length);
      const dt = postHtml.match(/<time[^>]*datetime=["']([^"']+)/i);
      const date = dt ? dt[1] : "";
      const links = postHtml.match(PLAYLIST_RE) || [];
      for (const raw of links) {
        const playlist = validatePlaylist(raw);
        if (playlist) items.push({
          id: source + "-" + match[2] + "-" + items.length,
          type: "playlist", server: playlist,
          source, date, post_url: "https://t.me/" + match[1] + "/" + match[2]
        });
      }
    }
    const unique = [...new Map(items.map(x => [x.server, x])).values()];
    return { source, status: "ok", items: unique };
  } catch { return { source, status: "unavailable", items: [] }; }
  finally { clearTimeout(timer); }
}
export async function onRequestGet() {
  const sources = await Promise.all(SOURCES.map(readSource));
  const items = sources.flatMap(s => s.items).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return new Response(JSON.stringify({
    updated_at: new Date().toISOString(),
    sources: Object.fromEntries(sources.map(s => [s.source, { status: s.status, found: s.items.length }])),
    items
  }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
