// Regression checks for exact public M3U extraction and complete card rendering.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const api = readFileSync(new URL("../functions/api/playlist-feed.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../assets/playlists.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/playlists.css", import.meta.url), "utf8");
const functions = new Function(api.replace("export async function onRequestGet()", "async function onRequestGet()")
  + "\nreturn { postedLinks, isM3U };")();
const cases = [
  ["original full example",
   '<div class="tgme_widget_message_text">http://cc1189ace333.mylistbest.net/playlists/uplist/43563d87414cc212ba15ad5da897c1dc/playlist.m3u</div>',
   ["http://cc1189ace333.mylistbest.net/playlists/uplist/43563d87414cc212ba15ad5da897c1dc/playlist.m3u"]],
  ["signed query untouched",
   '<div class="tgme_widget_message_text">https://example.org/playlist.m3u?user=trial&amp;token=ABC%2FDEF&amp;expires=1800000000</div>',
   ["https://example.org/playlist.m3u?user=trial&token=ABC%2FDEF&expires=1800000000"]],
  ["pipe header intact",
   '<div class="tgme_widget_message_text"><a href="https://example.org/main.m3u8">https://example.org/main.m3u8</a>|referer=https://site.example/&amp;User-Agent=NSPlayer</div>',
   ["https://example.org/main.m3u8|referer=https://site.example/&User-Agent=NSPlayer"]],
  ["real channel formatting: multiple URLs",
   '<div class="tgme_widget_message_text">https://playztv-apps.pages.dev/ananda-tv/index.m3u8<br>https://playztv-apps.pages.dev/asian-tv/index.m3u8</div>',
   ["https://playztv-apps.pages.dev/ananda-tv/index.m3u8", "https://playztv-apps.pages.dev/asian-tv/index.m3u8"]],
  ["adjacent link anchors",
   '<div class="tgme_widget_message_text"><a href="https://a.example/a.m3u8">https://a.example/a.m3u8</a><a href="https://b.example/b.m3u8">https://b.example/b.m3u8</a></div>',
   ["https://a.example/a.m3u8","https://b.example/b.m3u8"]],
  ["anchor label differs from full href",
   '<div class="tgme_widget_message_text"><a href="https://example.org/f.m3u8?auth=123&amp;expires=999">Open playlist</a></div>',
   ["https://example.org/f.m3u8?auth=123&expires=999"]],
  ["Xtream M3U URL query preserved",
   '<div class="tgme_widget_message_text">https://example.org/get.php?username=trial&amp;password=p&amp;type=m3u_plus&amp;output=ts</div>',
   ["https://example.org/get.php?username=trial&password=p&type=m3u_plus&output=ts"]],
  ["not a playlist",
   '<div class="tgme_widget_message_text">https://example.org/image.png</div>', []]
];
for (const [label, html, expected] of cases) {
  assert.deepEqual(functions.postedLinks(html), expected, label);
}
assert.doesNotThrow(() => new Function(client), "UI script syntax");
assert.match(client, /navigator\.clipboard\.writeText\(original\.server\)/,
  "Copy uses original server property rather than reserializing it");
assert.match(client, /Telegram post/, "Original Telegram post links appear");
assert.match(client, /Date\.parse\(b\.date\)/, "Newest first by message date");
assert.match(api, /Date\.parse\(b\.date\)/, "Backend sorts by actual date");
assert.match(css, /max-height:none;height:auto/, "No URL clipping");
assert.match(css, /white-space:pre-wrap/, "URL wraps while preserving text");
console.log("M3U extraction, exact copying, sorting, and full-card regression checks: PASS");
