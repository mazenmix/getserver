/* MX GetServer: password-gated M3U Playlist view. */
(()=>{
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={items:[],sources:{},loading:false,ready:false};
let tab,panel;
function hasUsername(link){
 // Keep only original M3U links with an explicit, nonempty username query parameter.
 try{
   const base=String(link||'').split('|',1)[0];
   const u=new URL(base);
   return [...u.searchParams.entries()].some(([key,value])=>key.toLowerCase()==='username'&&value.trim().length>0);
 }catch{return false}
}
function allPlaylists(){
 const updates=window.MXPersonalUpdates?.get?.()||[];
 const personal=updates.flatMap(row=>{
   if(row.type==='playlist')return [row];
   if(row.type==='xtream'&&typeof row.original==='string'&&hasUsername(row.original)){
     return [{...row,id:'m3u-'+row.id,type:'playlist',server:row.original}];
   }
   return [];
 });
 const dedup=new Map();
 for(const row of [...state.items,...personal]){
   if(!row||typeof row.server!=='string'||!hasUsername(row.server))continue;
   const previous=dedup.get(row.server);
   if(!previous||(Date.parse(row.date)||0)>(Date.parse(previous.date)||0))dedup.set(row.server,row);
 }
 return [...dedup.values()].sort((a,b)=>{
   const time=(Date.parse(b.date)||0)-(Date.parse(a.date)||0);
   if(time)return time;
   return String(a.id||'').localeCompare(String(b.id||''));
 });
}
function card(item,i){
 const url=String(item.server||'');
 let hostname='Playlist';try{hostname=new URL(url.split('|')[0]).host}catch{}
 return '<article class="mx-m3u-card"><div class="mx-m3u-meta"><span class="mx-m3u-type">♡ M3U Playlist</span><span>#'+String(i+1).padStart(3,'0')+'</span></div>'+
 '<div class="mx-m3u-domain">'+esc(hostname)+'</div>'+
 '<div class="mx-m3u-url" dir="ltr">'+esc(url)+'</div>'+
 '<div class="mx-m3u-actions"><button type="button" class="mx-m3u-copy" data-playlist-id="'+esc(item.id)+'">Copy Playlist</button></div></article>';
}
function render(){
 if(!panel)return;
 const q=(document.querySelector('#search')?.value||'').trim().toLowerCase();
 const items=allPlaylists().filter(x=>(x.server+' '+x.source).toLowerCase().includes(q));
 const heading='<div class="mx-m3u-heading"><span class="mx-m3u-count">'+items.length+' playlists</span></div>';
 const empty=state.loading?'<p class="mx-m3u-state">Checking public Telegram sources…</p>':(!items.length?'<p class="mx-m3u-state">No M3U links available.</p>':'');
 panel.innerHTML=heading+'<div class="mx-m3u-list">'+items.map(card).join('')+'</div>'+empty;
}
async function load(){
 if(state.loading)return;
 state.loading=true;render();
 try{
  const res=await fetch('/api/playlist-feed?t='+Date.now(),{credentials:'same-origin',cache:'no-store'});
  if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json();
  state.items=(Array.isArray(data.items)?data.items:[]).filter(x=>x&&x.type==='playlist'&&/^https?:\/\//.test(x.server)&&typeof x.source==='string')
   .sort((a,b)=>{
     const diff=(Date.parse(b.date)||0)-(Date.parse(a.date)||0);
     if(diff)return diff;
     if(a.source===b.source){
       const id=x=>Number(String(x.post_url||'').match(/\/(\d+)$/)?.[1]||0);
       const num=id(b)-id(a);
       if(num)return num;
     }
     return String(a.id).localeCompare(String(b.id));
   });
  state.sources=data.sources||{};
 }catch{state.sources={Feed:{status:'unavailable',found:0}}}
 finally{state.loading=false;render()}
}
function mount(){
 if(state.ready)return;
 const tabs=document.querySelector('.tabs'),toolbar=document.querySelector('.toolbar'),grid=document.querySelector('#grid');
 if(!tabs||!toolbar||!grid)return;
 const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/assets/playlists.css?v=20261105-clean';document.head.appendChild(sheet);
 tab=document.createElement('button');tab.type='button';tab.className='tab mx-m3u-tab';tab.textContent='♡ M3U Playlist';tab.setAttribute('aria-pressed','false');tabs.appendChild(tab);
 panel=document.createElement('section');panel.id='mx-playlists';panel.setAttribute('aria-live','polite');toolbar.insertAdjacentElement('afterend',panel);
 tab.addEventListener('click',()=>{
  document.body.classList.add('mx-playlist-mode');
  document.querySelectorAll('.tabs [data-filter]').forEach(b=>b.setAttribute('aria-pressed','false'));
  tab.setAttribute('aria-pressed','true');render();
 });
 document.querySelectorAll('.tabs [data-filter]').forEach(b=>b.addEventListener('click',()=>{
  document.body.classList.remove('mx-playlist-mode');tab.setAttribute('aria-pressed','false');
 }));
 document.querySelector('#search')?.addEventListener('input',render);
 panel.addEventListener('click',async event=>{
  const button=event.target.closest('[data-playlist-id]');
  if(!button)return;
  const original=allPlaylists().find(entry=>entry.id===button.dataset.playlistId);
  if(!original)return;
  try{await navigator.clipboard.writeText(original.server);button.textContent='Copied ✓';setTimeout(()=>button.textContent='Copy Playlist',1250)}catch{button.textContent='Copy unavailable'}
 });
 window.addEventListener('mx-personal-updates',render);
 state.ready=true;render();load();setInterval(load,60000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();