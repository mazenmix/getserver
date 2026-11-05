// Regression tests for filtering anonymous playlists and preserving full approved links.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const api = readFileSync(new URL("../functions/api/playlist-feed.js", import.meta.url),"utf8");
const client = readFileSync(new URL("../assets/playlists.js", import.meta.url),"utf8");
const importer = readFileSync(new URL("../assets/personal-import.js", import.meta.url),"utf8");
const css = readFileSync(new URL("../assets/playlists.css", import.meta.url),"utf8");
const {postedLinks,isM3U} = new Function(
  api.replace("export async function onRequestGet()","async function onRequestGet()")+
  "\nreturn {postedLinks,isM3U};"
)();
const cases=[
  ["anonymous direct M3U must be ignored",
   '<div class="tgme_widget_message_text">http://example.org/playlist.m3u8</div>',[]],
  ["signed URL without username must be ignored",
   '<div class="tgme_widget_message_text">https://example.org/playlist.m3u?token=ABC&amp;expires=999</div>',[]],
  ["full direct playlist with username preserved",
   '<div class="tgme_widget_message_text">https://example.org/playlist.m3u8?username=trial&amp;token=ABC%2FDEF&amp;expires=999</div>',
   ["https://example.org/playlist.m3u8?username=trial&token=ABC%2FDEF&expires=999"]],
  ["pipe headers and signed query preserved",
   '<div class="tgme_widget_message_text"><a href="https://example.org/main.m3u8?username=trial">https://example.org/main.m3u8?username=trial</a>|referer=https://site.example/&amp;User-Agent=NSPlayer</div>',
   ["https://example.org/main.m3u8?username=trial|referer=https://site.example/&User-Agent=NSPlayer"]],
  ["multiple links only include username-qualified",
   '<div class="tgme_widget_message_text">https://playztv-apps.pages.dev/ananda-tv/index.m3u8<br>https://example.org/live.m3u8?username=trial</div>',
   ["https://example.org/live.m3u8?username=trial"]],
  ["hidden hyperlink destination retained",
   '<div class="tgme_widget_message_text"><a href="https://example.org/f.m3u8?username=trial&amp;auth=123">Open playlist</a></div>',
   ["https://example.org/f.m3u8?username=trial&auth=123"]],
  ["Xtream M3U URL retains complete credentials",
   '<div class="tgme_widget_message_text">https://example.org/get.php?username=trial&amp;password=p&amp;type=m3u_plus&amp;output=ts</div>',
   ["https://example.org/get.php?username=trial&password=p&type=m3u_plus&output=ts"]],
  ["empty username is rejected",
   '<div class="tgme_widget_message_text">https://example.org/playlist.m3u?username=&amp;token=a</div>',[]],
  ["not a playlist",
   '<div class="tgme_widget_message_text">https://example.org/image.png?username=x</div>',[]]
];
for(const [label,html,expected] of cases)assert.deepEqual(postedLinks(html),expected,label);
assert.equal(isM3U("https://example.org/get.php?username=u&type=m3u_plus"),true);
assert.equal(isM3U("https://example.org/get.php?type=m3u_plus"),false);
assert.doesNotThrow(()=>new Function(client),"Playlist client syntax");
assert.doesNotThrow(()=>new Function(importer),"Manual import syntax");
assert.match(client,/navigator\.clipboard\.writeText\(original\.server\)/,"Original complete M3U copied");
assert.match(client,/hasUsername\(row\.server\)/,"Only username-qualified M3Us shown");
assert.doesNotMatch(importer,/field\('FULL LINK'/,"Full Link field removed from Xtream cards");
assert.match(client,/Date\.parse\(b\.date\)/,"Newest M3U first");
assert.match(api,/Date\.parse\(b\.date\)/,"Newest Telegram post first");
assert.match(css,/max-height:none;height:auto/,"No link clipping");
console.log("M3U username-only, full-link copy and Xtream card regression checks: PASS");
