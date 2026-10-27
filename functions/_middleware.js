// Password-only gate for the entire Cloudflare Pages project.
// Configure encrypted MX_SITE_PASSWORD in Cloudflare Production settings.
// Never place the actual password in GitHub.
const COOKIE = "__Host-mxgs";
const TTL = 43200; // 12 hours
const encoder = new TextEncoder();

const loginHTML = '<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#090d17"><title>MX GetServer — Admin</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;font:15px system-ui,Tahoma,sans-serif;color:#f4f6ff;background:radial-gradient(ellipse at 85% 0%,#84204e66,transparent 45%),radial-gradient(ellipse at 0 100%,#0b53625a,transparent 45%),#080c15}main{width:min(390px,calc(100% - 32px));border:1px solid #303951;border-radius:23px;padding:30px;background:linear-gradient(145deg,#1d2539,#101625);box-shadow:0 25px 75px #0008}.brand{display:flex;direction:ltr;align-items:center;justify-content:center;gap:0;margin-bottom:25px;font-size:23px;font-weight:850}.mark{background:linear-gradient(130deg,#f04a6a,#74224b);border-radius:15px;padding:14px;color:white}.brand b{color:#fd5778}h1{text-align:center;margin:0;font-size:25px}p{text-align:center;color:#9ca9c1;font-size:13px;margin:10px 0 27px}label{display:block;font-size:13px;color:#9daec5;margin-bottom:8px}input{width:100%;height:52px;padding:0 14px;color:#fff;background:#09101e;border:1px solid #34435d;border-radius:12px;font-size:18px}input:focus{outline:2px solid #fa5675}button{width:100%;margin-top:17px;padding:14px;border:0;border-radius:12px;color:white;font:700 15px system-ui;background:linear-gradient(135deg,#fa5675,#ae2f56);cursor:pointer}.err{background:#58233788;border:1px solid #a94868;padding:10px;border-radius:11px;margin-bottom:18px;text-align:center}small{display:block;text-align:center;color:#8291aa;margin-top:21px;font-size:11px}</style></head><body><main><div class="brand"><span>MX <b>GetServer</b></span></div><h1>Private Access</h1><p>Enter your password to access the server dashboard.</p><!--ERROR--><form action="/__mx_login" method="post"><label for="password">Password</label><input id="password" name="password" type="password" required autofocus autocomplete="current-password" maxlength="200"><button type="submit">Sign In</button></form><small>MX GetServer · Private Access</small></main></body></html>';

function heads(extra={}) {
 return {'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...extra};
}
function page(error=false) {
 const errorHTML = error ? '<div class="err" role="alert">Incorrect password. Please try again.</div>' : '';
 return new Response(loginHTML.replace('<!--ERROR-->',errorHTML),{
  status:error?401:200,
  headers:heads({'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"})
 });
}
function go(where,cookie){
 const h = new Headers(heads({'Location':where}));
 if(cookie) h.set('Set-Cookie',cookie);
 return new Response(null,{status:303,headers:h});
}
function cookieValue(req){
 const raw=req.headers.get('Cookie')||'';
 for(const part of raw.split(';')){
  const [key,...rest]=part.trim().split('=');
  if(key===COOKIE)return rest.join('=');
 }
 return '';
}
function b64u(value){
 let result='';for(const v of new Uint8Array(value))result+=String.fromCharCode(v);
 return btoa(result).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unb64u(value){
 const x=atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'='));
 return Uint8Array.from(x,c=>c.charCodeAt(0));
}
async function signingKey(password){
 return crypto.subtle.importKey('raw',encoder.encode(password),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function authCookie(password){
 const exp=Math.floor(Date.now()/1000)+TTL;
 const nonce=b64u(crypto.getRandomValues(new Uint8Array(12)));
 const data=exp+'.'+nonce;
 const key=await signingKey(password);
 const signature=b64u(await crypto.subtle.sign('HMAC',key,encoder.encode('mxgs:v1:'+data)));
 return COOKIE+'='+data+'.'+signature+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+TTL;
}
async function authorized(request,password){
 const token=cookieValue(request);
 if(!/^\d{10,13}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/.test(token))return false;
 const [exp,nonce,signature]=token.split('.');
 const now=Math.floor(Date.now()/1000), expiry=Number(exp);
 if(!Number.isSafeInteger(expiry)||expiry<=now||expiry>now+TTL+60)return false;
 try{
  const key=await signingKey(password);
  return crypto.subtle.verify('HMAC',key,unb64u(signature),encoder.encode('mxgs:v1:'+exp+'.'+nonce));
 }catch{return false}
}
async function matches(candidate,password){
 const [x,y]=await Promise.all([
  crypto.subtle.digest('SHA-256',encoder.encode(candidate)),
  crypto.subtle.digest('SHA-256',encoder.encode(password))
 ]);
 const a=new Uint8Array(x), b=new Uint8Array(y);
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
 return mismatch===0;
}
function sameOrigin(request){
 const origin=request.headers.get('Origin');
 return !origin||origin===new URL(request.url).origin;
}
export async function onRequest(ctx){
 const {request,env}=ctx;
 const path=new URL(request.url).pathname;
 const secret=env&&env.MX_SITE_PASSWORD;
 if(typeof secret!=='string'||secret.length<12){
  return new Response('Admin password has not been configured.',{status:503,headers:heads({'Content-Type':'text/plain; charset=utf-8'})});
 }
 if(path==='/__mx_login'){
  if(request.method!=='POST')return go('/');
  // Authentication checks the shared password before issuing a session.
  // Do not reject browser login forms due to proxy/extension Origin header differences.
  if(Number(request.headers.get('Content-Length')||0)>4096)return new Response('Request too large',{status:413,headers:heads()});
  try{
   const body=await request.formData();
   const attempt=body.get('password');
   if(typeof attempt!=='string'||attempt.length>200||!(await matches(attempt,secret)))return page(true);
   return go('/',await authCookie(secret));
  }catch{return page(true)}
 }
 if(path==='/__mx_logout'){
  if(request.method!=='POST'||!sameOrigin(request))return new Response('Method not allowed',{status:405,headers:heads()});
  return go('/',COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');
 }
 if(!(await authorized(request,secret)))return page();
 const resp=await ctx.next();
 const clean=new Response(resp.body,resp);
 for(const [k,v] of Object.entries(heads()))clean.headers.set(k,v);
 return clean;
}
