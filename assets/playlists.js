/* MX GetServer: password-gated M3U Playlist view. */
(()=>{
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={items:[],sources:{},loading:false,ready:false};
let tab,panel;
function card(item,i){
 const url=String(item.server||''),source=String(item.source||'');
 const time=Date.parse(item.date||'');
 const date=Number.isFinite(time)?new Date(time).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}):'';
 let hostname='Playlist';try{hostname=new URL(url).host}catch{}
 return '<article class="mx-m3u-card"><div class="mx-m3u-meta"><span class="mx-m3u-type">♡ M3U Playlist</span><span>#'+String(i+1).padStart(3,'0')+'</span></div>'+
 '<div class="mx-m3u-domain">'+esc(hostname)+'</div>'+
 '<div class="mx-m3u-url" title="'+esc(url)+'">'+esc(url)+'</div>'+
 '<div class="mx-m3u-actions"><button type="button" class="mx-m3u-copy" data-playlist-id="'+esc(item.id)+'">Copy Playlist</button>'+
 '<span class="mx-m3u-from">@'+esc(source)+(date?' · '+esc(date):'')+'</span></div></article>';
}
function render(){
 if(!panel)return;
 const q=(document.querySelector('#search')?.value||'').trim().toLowerCase();
 const items=state.items.filter(x=>(x.server+' '+x.source).toLowerCase().includes(q));
 const status=Object.entries(state.sources).map(([name,s])=>'@'+name+': '+(s.status==='ok'?String(s.found)+' found':'unavailable')).join(' · ');
 const heading='<div class="mx-m3u-heading"><div><h2>M3U Playlist</h2><p>Direct playlist links · newest first</p></div><span class="mx-m3u-count">'+items.length+' playlists</span></div>';
 const empty=state.loading?'<p class="mx-m3u-state">Checking public Telegram sources…</p>':(!items.length?'<p class="mx-m3u-state">No accessible M3U links found in recent public posts.</p>':'');
 panel.innerHTML=heading+'<div class="mx-m3u-list">'+items.map(card).join('')+'</div>'+empty+'<p class="mx-m3u-sources">'+esc(status||'Waiting for source check')+'</p>';
}
async function load(){
 if(state.loading)return;
 state.loading=true;render();
 try{
  const res=await fetch('/api/playlist-feed?t='+Date.now(),{credentials:'same-origin',cache:'no-store'});
  if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json();
  state.items=(Array.isArray(data.items)?data.items:[]).filter(x=>x&&x.type==='playlist'&&/^https?:\/\//.test(x.server)&&typeof x.source==='string')
   .sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
  state.sources=data.sources||{};
 }catch{state.sources={Feed:{status:'unavailable',found:0}}}
 finally{state.loading=false;render()}
}
function mount(){
 if(state.ready)return;
 const tabs=document.querySelector('.tabs'),toolbar=document.querySelector('.toolbar'),grid=document.querySelector('#grid');
 if(!tabs||!toolbar||!grid)return;
 const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/assets/playlists.css?v=20261105';document.head.appendChild(sheet);
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
  const original=state.items.find(entry=>entry.id===button.dataset.playlistId);
  if(!original)return;
  try{await navigator.clipboard.writeText(original.server);button.textContent='Copied ✓';setTimeout(()=>button.textContent='Copy Playlist',1250)}catch{button.textContent='Copy unavailable'}
 });
 state.ready=true;render();load();setInterval(load,60000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();