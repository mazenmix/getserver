// Extract only explicitly published public trial codes on demand.
// Route is protected by the existing Cloudflare Pages password middleware.
// Never store the credentials in GitHub, KV, logs, or caches.
const CHANNELS=new Set(["AisosElho","IPTVXtremeFlix","StbEmucodesStalkerPortal"]);
const SMALL={"ʜ":"h","ᴏ":"o","ꜱ":"s","ᴛ":"t","ᴜ":"u","ᴇ":"e","ʀ":"r","ᴘ":"p","ᴀ":"a","ᴍ":"m","ɴ":"n","ʟ":"l","ᴅ":"d","ɪ":"i","ᴄ":"c","ꜰ":"f","ɢ":"g","ᴠ":"v","ʏ":"y","ᴋ":"k","ʙ":"b","ᴎ":"n"};
function normal(s){return String(s||"").normalize("NFKC").replace(/[ʜᴏꜱᴛᴜᴇʀᴘᴀᴍɴʟᴅɪᴄꜰɢᴠʏᴋʙᴎ]/g,c=>SMALL[c]||c).replace(/[\u200B-\u200D\uFEFF]/g,"")}
function urlOf(raw){
 try{
  const u=new URL(raw.replace(/[),.;\]}>]+$/,""));
  if(!["http:","https:"].includes(u.protocol)||!u.hostname||u.username||u.password)return null;
  if(/(?:^|\.)(?:t\.me|telegram\.me|linktr\.ee|youtube\.com|facebook\.com|instagram\.com|apktvpro\.com)$/i.test(u.hostname))return null;
  return u;
 }catch{return null}
}
function parseTrials(raw){
 const text=normal(raw);
 const lines=text.split(/\n|\r/).map(s=>s.trim()).filter(Boolean);
 const results=[],seen=new Set(),linkRE=/https?:\/\/[^\s<>"'،]+/gi,macRE=/(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}/i;
 let current="",user="",pass="",mac="",bare=[];
 const serverOf=u=>u.protocol+"//"+u.host + (/\/(?:c|stalker_portal\/c)\/?$/i.test(u.pathname)?u.pathname:"");
 function add(type,server,username,password,identifier){
  if(!server||(type==="xtream"&&!(username&&password))||(type==="mac"&&!identifier)||results.length>70)return;
  const record={server,type,username:username||"",password:password||"",mac:String(identifier||"").replace(/-/g,":").toUpperCase()};
  const key=[record.server,record.type,record.username,record.password,record.mac].join("|");
  if(!seen.has(key)){seen.add(key);results.push(record)}
 }
 function finish(){
  if(!user&&!pass&&bare.length===2){user=bare[0];pass=bare[1]}
  if(user&&pass)add("xtream",current,user,pass,"");
  if(mac)add("mac",current,"","",mac);
  user="";pass="";mac="";bare=[];
 }
 for(const line of lines){
  const matches=[...line.matchAll(linkRE)];
  for(const match of matches){
   const u=urlOf(match[0]);if(!u)continue;
   const server=serverOf(u);
   const fromQuery=u.searchParams.get("username")||u.searchParams.get("user");
   const passwordQuery=u.searchParams.get("password")||u.searchParams.get("pass");
   if(fromQuery&&passwordQuery)add("xtream",server,fromQuery,passwordQuery,"");
   const lead=line.slice(0,match.index);
   if(/(?:host|server|portal|url|link|سيرفر|رابط|الرابط|بوابة)/i.test(lead)||(/^\s*https?:\/\//.test(line)&&!fromQuery&&!passwordQuery)){
    if(current&&(current!==server||user||pass||mac||bare.length))finish();
    current=server;
   }
  }
  const l=line.replace(/^[^A-Za-z0-9\u0600-\u06FF]+/u,"");
  const um=l.match(/^(?:username|user|login|اليوزر|اسم المستخدم)\s*[:=：\-→👉|]+\s*(\S+)/iu);
  const pm=l.match(/^(?:password|pass|pwd|باسورد|كلمة المرور)\s*[:=：\-→👉|]+\s*(\S+)/iu);
  const mm=l.match(/^(?:mac|mac address|ماك)\s*[:=：\-→👉|]+\s*((?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2})/iu)||line.match(macRE);
  if(um){if(user&&pass)finish();user=um[1]}
  if(pm)pass=pm[1];
  if(mm&&current){mac=mm[1]||mm[0];add("mac",current,"","",mac);mac=""}
  if(current&&!matches.length&&!um&&!pm&&!mm&&/^[A-Za-z0-9_.@-]{3,120}$/.test(l)&&bare.length<2)bare.push(l);
  if(current&&user&&pass){add("xtream",current,user,pass,"");user="";pass="";bare=[]}
 }
 finish();return results;
}
const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers});
export async function onRequestGet({request}){
 const q=new URL(request.url).searchParams;
 const source=q.get("source"),id=q.get("id");
 if(!CHANNELS.has(source)||!/^[1-9]\d{0,9}$/.test(String(id||"")))return reply({records:[],error:"invalid"},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const remote=await fetch("https://t.me/"+source+"/"+id+"?embed=1",{
   headers:{"Accept":"text/html","User-Agent":"Mozilla/5.0"},signal:controller.signal
  });
  if(!remote.ok)return reply({records:[],error:"post_unavailable"},404);
  if(Number(remote.headers.get("content-length")||0)>500000)return reply({records:[],error:"too_large"},413);
  const raw=await remote.text();
  if(raw.length>500000)return reply({records:[],error:"too_large"},413);
  const textParts=[];
  await new HTMLRewriter()
   .on(".tgme_widget_message_text",{text(t){textParts.push(t.text)}})
   .on(".tgme_widget_message_text br",{element(){textParts.push("\n")}})
   .transform(new Response(raw,{headers:{"Content-Type":"text/html"}})).text();
  const content=textParts.join("").slice(0,40000);
  if(!content.trim())return reply({records:[],error:"no_text"},404);
  return reply({records:parseTrials(content),source,id});
 }catch{return reply({records:[],error:"telegram_unavailable"},502)}
 finally{clearTimeout(timer)}
}
