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
// All badge counts original native results plus the separate imported cards, not "accounts".
const countSource=importer.match(/function updateAllCount\(\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(countSource,"All count calculation must exist");
for(const [native,imported,expected] of [["237 results",14,"251 cards"],["0 results",14,"14 cards"],["5 posts",14,"20 cards"]]){
 const badge={textContent:""};
 const section={querySelectorAll:()=>Array(imported).fill({})};
 const document={
   querySelector:key=>key==="#mx-all-count"?badge:key==="#count"?{textContent:native}:null,
   querySelectorAll:()=>Array(6).fill({})
 };
 const calculate=new Function("document","section",countSource+"\nreturn updateAllCount;")(document,section);
 calculate();
 assert.equal(badge.textContent,expected,"All should count native and imported cards");
}
assert.match(importer,/MutationObserver\(updateAllCount\)/,"All badge updates on native async results");


const memory=new Map();
const browserWindow={dispatchEvent(){}};
const browserDocument={readyState:"loading",addEventListener(){}};
const browserStorage={
  getItem:key=>memory.get(key)||null,
  setItem:(key,value)=>memory.set(key,value)
};
class BrowserEvent{constructor(name){this.type=name}}
new Function("window","document","localStorage","Event",importer)(
  browserWindow,browserDocument,browserStorage,BrowserEvent);
const rawLinks=[
  "https://example.org/live.m3u8?username=trial&token=ABC%2FDEF&expires=999",
  "https://example.org/get.php?username=user&password=pass&type=m3u_plus",
  "https://example.org/anonymous.m3u8",
  "https://example.org/live.m3u8?username=trial&token=ABC%2FDEF&expires=999",
  "https://example.org/playlist.m3u?token=withoutUsername"
];
const parsedPlaylists=browserWindow.MXPersonalUpdates.importPlaylistBatch(rawLinks.join("\n"));
assert.equal(parsedPlaylists.items.length,2,"Import Playlist must accept only unique, qualified URLs");
assert.equal(parsedPlaylists.skipped,2,"Anonymous URLs are excluded");
assert.ok(parsedPlaylists.items.every(item=>item.type==="playlist"),"No Xtream cards created in Playlist mode");
assert.equal(parsedPlaylists.items[0].server,rawLinks[0],"Exact signed M3U copied");
assert.equal(parsedPlaylists.items[1].server,rawLinks[1],"Exact get.php URL copied");
const savedPlaylists=browserWindow.MXPersonalUpdates.savePlaylistBatch(rawLinks.join("\n"));
assert.equal(savedPlaylists.items.length,2,"Playlist import saved");
assert.equal(browserWindow.MXPersonalUpdates.get().filter(row=>row.type==="playlist").length,2,
  "Saved Playlist entries appear in shared M3U source list");
assert.match(importer,/data-import-mode="playlist"/,"Import Playlist option is present");
assert.match(importer,/document\.querySelector\('\.mx-m3u-tab'\)\?\.click\(\)/,
  "Successful Playlist import opens existing M3U tab");

console.log("M3U username-only, full-link copy and Xtream card regression checks: PASS");
