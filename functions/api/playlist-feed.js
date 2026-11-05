// Read public Telegram messages without rewriting posted M3U URLs.
// Protected by the site's existing password middleware; never checked into public data JSON.
const SOURCES = ["IPTVXtremeFlix", "AisosElho", "StbEmucodesStalkerPortal", "IPTVPlaylistZONE"];
const URL_RE = /https?:\/\/[^\s<>"'\x60]+/gi;
const POST_RE = /data-post=["']([A-Za-z0-9_]+)\/(\d+)["']/g;

// HTML character entities belong to Telegram's HTML representation, not to the posted link.
// Decode once and NEVER serialize a link back with URL.href or remove its query/header suffix.
function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/gi, "&").replace(/&#(?:38|0*38);/gi, "&")
    .replace(/&#x0*26;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#(?:34|0*34);/gi, '"')
    .replace(/&#x0*22;/gi, '"')
    .replace(/&#(?:47|0*47);/gi, "/").replace(/&#x0*2f;/gi, "/")
    .replace(/&#(?:124|0*124);/gi, "|").replace(/&#x0*7c;/gi, "|")
    .replace(/&vert;/gi, "|")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function isM3U(raw) {
  // Only inspect the base URL. The exact raw string is returned unchanged.
  const base = raw.split("|", 1)[0];
  try {
    const u = new URL(base);
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname) return false;
    if (/\.m3u8?$/i.test(u.pathname)) return true;
    if (/\/get\.php$/i.test(u.pathname) &&
        /^(m3u|m3u8|m3u_plus)$/i.test(u.searchParams.get("type") || "")) return true;
    return false;
  } catch {
    return false;
  }
}
function extractElementBody(post, className) {
  // Use only the actual message text; do not read unrelated Telegram page chrome.
  const openRx = new RegExp('<div\\b[^>]*\\bclass=["\\x27][^"\\x27]*\\b' +
    className + '\\b[^"\\x27]*["\\x27][^>]*>', 'i');
  const found = openRx.exec(post);
  if (!found) return "";
  const start = found.index + found[0].length;
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 1, match;
  while ((match = tags.exec(post))) {
    depth += /^<\//.test(match[0]) ? -1 : 1;
    if (depth === 0) return post.slice(start, match.index);
  }
  return post.slice(start);
}
function postedLinks(postHtml) {
  const body = extractElementBody(postHtml, "tgme_widget_message_text");
  if (!body) return [];
  // Preserve text across Telegram auto-linked anchors. In particular:
  // <a href="...main.m3u8">...main.m3u8</a>|referer=https://site/
  // must become a SINGLE, exact, copyable link including "|referer=...".
  const visible = decodeHtml(
    body.replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/a>(?=\s*<a\b)/gi, "</a>\n")
        .replace(/<\/(?:p|blockquote|div)>/gi, "\n")
        .replace(/<[^>]*>/g, "")
  );
  const originalHrefValues = [];
  const hrefRx = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi;
  for (const match of body.matchAll(hrefRx)) {
    originalHrefValues.push(decodeHtml(match[2]));
  }
  const matched = [];
  const seen = new Set();
  // Visible lines first: includes custom |referer / |User-Agent suffixes.
  // href values second: includes full click targets with shortened link labels.
  for (const rawSource of [visible, ...originalHrefValues]) {
    for (const match of rawSource.matchAll(URL_RE)) {
      const original = match[0];
      if (isM3U(original) && !seen.has(original)) {
        seen.add(original);
        matched.push(original);
      }
    }
  }
  // If the same URL appears in an anchor without its visible header/query suffix,
  // keep only the complete posted version. Never truncate either value.
  return matched.filter(link => !matched.some(other =>
    other !== link && other.startsWith(link) &&
    /[?#|]/.test(other.charAt(link.length))));
}
async function readSource(source) {
  const items = [];
  let before = null;
  let accessed = false;
  for (let page = 0; page < 3; page++) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 7500);
    try {
      const url = "https://t.me/s/" + source + (before ? "?before=" + before : "");
      const response = await fetch(url, {
        signal: abort.signal,
        headers: { "Accept": "text/html", "User-Agent": "Mozilla/5.0" },
        cf: { cacheTtl: 60, cacheEverything: true }
      });
      if (!response.ok) break;
      const html = await response.text();
      const starts = [...html.matchAll(POST_RE)];
      if (!starts.length) break;
      accessed = true;
      for (let i = 0; i < starts.length; i++) {
        const match = starts[i], next = starts[i + 1];
        const postHtml = html.slice(match.index, next ? next.index : html.length);
        const dt = postHtml.match(/<time[^>]*datetime=["']([^"']+)/i);
        const date = dt ? dt[1] : "";
        const links = postedLinks(postHtml);
        for (let index = 0; index < links.length; index++) {
          items.push({
            id: source + "-" + match[2] + "-" + index,
            type: "playlist", server: links[index], source, date,
            post_url: "https://t.me/" + match[1] + "/" + match[2]
          });
        }
      }
      const oldest = Math.min(...starts.map(x => Number(x[2])).filter(Number.isFinite));
      if (!Number.isFinite(oldest) || oldest < 2 || oldest === before) break;
      before = oldest;
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  const byExactLink = new Map();
  for (const item of items) {
    const old = byExactLink.get(item.server);
    if (!old || item.date > old.date) byExactLink.set(item.server, item);
  }
  return { source, status: accessed ? "ok" : "unavailable", items: [...byExactLink.values()] };
}
export async function onRequestGet() {
  const sources = await Promise.all(SOURCES.map(readSource));
  const items = sources.flatMap(s => s.items)
    .sort((a, b) => {
      // UTC date comparison; newer Telegram posts must always appear first.
      const time = (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);
      if (time) return time;
      if (a.source === b.source) {
        const id = item => Number(String(item.post_url || "").match(/\/(\d+)$/)?.[1] || 0);
        const postOrder = id(b) - id(a);
        if (postOrder) return postOrder;
      }
      return String(a.id).localeCompare(String(b.id));
    });
  return new Response(JSON.stringify({
    updated_at: new Date().toISOString(),
    sources: Object.fromEntries(sources.map(s => [s.source,
      { status: s.status, found: s.items.length }])),
    items
  }), { headers: { "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
