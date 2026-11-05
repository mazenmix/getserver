/* MX GetServer private browser-only import: account credentials never enter GitHub or server logs. */
(()=>{
'use strict';
const KEY='mx-getserver-personal-updates-v1';
const ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const URL_PATTERN=/https?:\/\/[^\s<>"'\x60\\]+/gi;
const today=()=>new Date().toISOString();
const copyText=async text=>navigator.clipboard.writeText(text);
let modal,section,button;
let published=[];
function readAll(){
  const all=new Map();
  for(const row of [...published,...readSaved()]){
    if(!row||!['playlist','xtream'].includes(row.type))continue;
    all.set(keyOf(row),row);
  }
  return [...all.values()].sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
}
async function loadPublished(){
  try{
    const r=await fetch('/data/manual-updates.json?t='+Date.now(),{cache:'no-store',credentials:'same-origin'});
    if(!r.ok)throw Error('HTTP '+r.status);
    const data=await r.json();
    if(!Array.isArray(data.items))throw Error('Invalid update data');
    published=data.items.filter(row=>row&&['xtream','playlist'].includes(row.type)&&
      typeof row.server==='string'&&typeof row.id==='string');
    renderXtream();
    window.dispatchEvent(new Event('mx-personal-updates'));
  }catch(e){
    // Preserve already loaded updates during network interruptions.
    console.warn('Personal published update feed unavailable:',e);
  }
}

function normalizePostedText(raw){
  // Only reverse the extra backslashes inserted by message formatting.
  // Do not strip URL components, change case, sort query params or rebuild the links.
  return String(raw||'').replace(/\b(https?)\\:\/\//gi,'$1://').replace(/\\\r?\n/g,'\n');
}
function readSaved(){
  try{
    const value=JSON.parse(localStorage.getItem(KEY)||'[]');
    return Array.isArray(value)?value.filter(x=>x&&['xtream','playlist'].includes(x.type)):[]; 
  }catch{return []}
}
function keyOf(x){
  return x.type==='playlist'?'playlist|'+x.server:'xtream|'+x.server+'|'+x.username+'|'+x.password;
}
function isPlaylist(url){
  return /\.m3u8?$/i.test(url.pathname) || (/\/get\.php$/i.test(url.pathname)&&/^(m3u|m3u_plus|m3u8)$/i.test(url.searchParams.get('type')||''));
}
function importBatch(raw){
  const text=normalizePostedText(raw);
  const urls=[...text.matchAll(URL_PATTERN)];
  const found=[];
  for(let i=0;i<urls.length;i++){
    const match=urls[i], original=match[0];
    let url;
    try{url=new URL(original)}catch{continue}
    if(!['http:','https:'].includes(url.protocol))continue;
    const after=text.slice(match.index+original.length,urls[i+1]?.index??text.length);
    const extractedUsername=after.match(/\b(?:username|user|login)\s*[:=]\s*([^\s\\]+)/i)?.[1]||'';
    const extractedPassword=after.match(/\b(?:password|pass|pwd)\s*[:=]\s*([^\s\\]+)/i)?.[1]||'';
    const user=url.searchParams.get('username')||url.searchParams.get('user')||extractedUsername;
    const pass=url.searchParams.get('password')||url.searchParams.get('pass')||extractedPassword;
    const endpoint=original.match(/^https?:\/\/[^\/?#|]+/i)?.[0]||url.origin;
    const xtream=user&&pass;
    const playlist=isPlaylist(url);
    if(xtream){
      found.push({type:'xtream',server:endpoint,original,username:user,password:pass,date:today(),source:'Manual Update'});
    } else if(playlist && [...url.searchParams.entries()].some(([key,value])=>
      key.toLowerCase()==='username'&&value.trim().length>0)){
      found.push({type:'playlist',server:original,date:today(),source:'Manual Update'});
    }
  }
  const results=new Map();
  for(const row of found)results.set(keyOf(row),row);
  return {items:[...results.values()],rawCount:found.length,duplicateCount:found.length-results.size};
}
function importPlaylistBatch(raw){
  // Manual Playlist mode accepts full, direct .m3u/.m3u8 URLs even without
  // username: the user explicitly supplied the link. get.php still needs username.
  const text=normalizePostedText(raw);
  const matches=[...text.matchAll(URL_PATTERN)];
  const accepted=new Map();
  let skipped=0;
  for(const match of matches){
    const original=match[0];
    const base=original.split('|',1)[0];
    try{
      const url=new URL(base);
      const username=[...url.searchParams.entries()].some(([key,value])=>
        key.toLowerCase()==='username' && value.trim().length>0);
      const directFile=/\.m3u8?$/i.test(url.pathname);
      if(!['http:','https:'].includes(url.protocol)||!isPlaylist(url)||(!directFile&&!username)){
        skipped++;
        continue;
      }
      const row={type:'playlist',server:original,source:'Manual Update',manualImport:true,date:today()};
      accepted.set(keyOf(row),row);
    }catch{skipped++}
  }
  return {items:[...accepted.values()],rawCount:matches.length,
    duplicateCount:matches.length-skipped-accepted.size,skipped};
}
function savePlaylistBatch(raw){
  const batch=importPlaylistBatch(raw);
  if(!batch.items.length)return batch;
  const combined=new Map(readSaved().map(row=>[keyOf(row),row]));
  for(const row of batch.items){
    combined.set(keyOf(row),{...row,
      id:'personal-playlist-'+Date.now()+'-'+Math.round(Math.random()*1e9)});
  }
  // Persist in the current browser without publishing URL tokens to GitHub.
  localStorage.setItem(KEY,JSON.stringify([...combined.values()]));
  window.dispatchEvent(new Event('mx-personal-updates'));
  return batch;
}
function saveBatch(raw){
  const batch=importBatch(raw);
  if(!batch.items.length)return batch;
  const combined=new Map();
  for(const row of readSaved())combined.set(keyOf(row),row);
  for(const row of batch.items){
    const id='personal-'+String(Date.now())+'-'+String(Math.round(Math.random()*1e9));
    combined.set(keyOf(row),{...row,id});
  }
  localStorage.setItem(KEY,JSON.stringify([...combined.values()]));
  window.dispatchEvent(new Event('mx-personal-updates'));
  return batch;
}
function copyButton(id,field,label){
  return '<button class="mx-import-copy" data-personal-copy="'+ESC(id)+'" data-field="'+field+'">'+label+'</button>';
}
function field(label,value,id,fieldKey){
  return '<div class="mx-import-field"><span>'+ESC(label)+'</span><code dir="ltr">'+ESC(value)+'</code>'+copyButton(id,fieldKey,'Copy')+'</div>';
}
function updateAllCount(){
  // Count every All card, including the paginated native server cards.
  // The packed dashboard's hidden #count contains the complete result count
  // (not merely the first page's rendered DOM nodes).
  const badge=document.querySelector('#mx-all-count');
  if(!badge)return;
  const personalCards=section?.querySelectorAll('.mx-import-card').length||0;
  const nativeText=document.querySelector('#count')?.textContent||'';
  const nativeMatch=nativeText.match(/^\s*(\d+)\s+results\b/i);
  const nativeCards=nativeMatch?Number(nativeMatch[1]):document.querySelectorAll('#grid > article.card:not(.post-card)').length;
  const total=personalCards+nativeCards;
  badge.textContent=total+' Servers';
}
function renderXtream(){
  if(!section)return;
  const items=readAll().filter(x=>x.type==='xtream').sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
  section.innerHTML=items.length?'<div class="mx-import-heading"><h2>Xtream Updates</h2><span class="mx-m3u-count" id="mx-all-count">0 Servers</span></div>'+
    '<div class="mx-import-grid">'+items.map((row,i)=>
      '<article class="mx-import-card"><div class="mx-import-card-title"><b>◈ XTREAM CODES</b><span>#'+String(i+1).padStart(3,'0')+'</span></div>'+
      field('SERVER',row.server,row.id,'server')+
      field('USERNAME',row.username,row.id,'username')+
      field('PASSWORD',row.password,row.id,'password')+'</article>'
    ).join('')+'</div>':'';
  section.hidden=!items.length;
  updateAllCount();
}
function updateDialog(){
  modal=document.createElement('div');modal.className='mx-import-backdrop';modal.hidden=true;
  modal.innerHTML='<section class="mx-import-dialog" role="dialog" aria-modal="true" aria-labelledby="mx-import-title">'+
  '<h2 id="mx-import-title">Xtream</h2>'+
  '<div class="mx-import-modes" role="group" aria-label="Import type">'+
    '<button type="button" class="mx-import-mode is-active" data-import-mode="update" aria-pressed="true">Xtream</button>'+
    '<button type="button" class="mx-import-mode" data-import-mode="playlist" aria-pressed="false">M3U Playlist</button></div>'+
  '<p id="mx-import-help">Paste Xtream credentials or complete M3U URLs. Entries are saved in this browser.</p>'+
  '<textarea rows="12" id="mx-import-text" dir="ltr" spellcheck="false" placeholder="Paste your Telegram update here..."></textarea>'+
  '<p id="mx-import-result" role="status"></p>'+
  '<div class="mx-import-controls"><button id="mx-import-cancel" type="button">Cancel</button>'+
  '<button id="mx-import-save" type="button">Import & Save</button></div></section>';
  document.body.appendChild(modal);
  const input=modal.querySelector('#mx-import-text');
  const status=modal.querySelector('#mx-import-result');
  const heading=modal.querySelector('#mx-import-title');
  const help=modal.querySelector('#mx-import-help');
  const save=modal.querySelector('#mx-import-save');
  let mode='update';
  const setMode=next=>{
    mode=next;
    heading.textContent=mode==='playlist'?'M3U Playlist':'Xtream';
    help.textContent=mode==='playlist'
      ?'Paste complete .m3u/.m3u8 links (username optional), or get.php playlists with username. They appear in M3U Playlist.'
      :'Paste Xtream credentials or complete M3U URLs. Entries are saved in this browser.';
    input.placeholder=mode==='playlist'
      ?'https://server.example/get.php?username=trial&password=pass&type=m3u_plus'
      :'Paste your Telegram update here...';
    save.textContent=mode==='playlist'?'Save Playlists':'Import & Save';
    status.textContent='';
    modal.querySelectorAll('[data-import-mode]').forEach(button=>{
      const active=button.dataset.importMode===mode;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  };
  modal.querySelectorAll('[data-import-mode]').forEach(button=>
    button.addEventListener('click',()=>setMode(button.dataset.importMode)));
  const close=()=>{modal.hidden=true;input.value='';status.textContent='';setMode('update')};
  modal.querySelector('#mx-import-cancel').addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close()});
  save.addEventListener('click',()=>{
    const batch=mode==='playlist'?importPlaylistBatch(input.value):importBatch(input.value);
    if(!batch.items.length){
      status.textContent=mode==='playlist'
        ?'No valid playlist URLs found. Paste a full .m3u/.m3u8 link or get.php link containing username.'
        :'No Xtream accounts or M3U Playlist links detected.';
      return;
    }
    try{
      if(mode==='playlist'){
        savePlaylistBatch(input.value);
        renderXtream();
        close();
        // Show the saved cards in the existing pink M3U section immediately.
        document.querySelector('.mx-m3u-tab')?.click();
      }else{
        saveBatch(input.value);
        status.textContent='Saved '+batch.items.filter(x=>x.type==='xtream').length+' Xtream accounts and '+
          batch.items.filter(x=>x.type==='playlist').length+' M3U playlists. '+batch.duplicateCount+' duplicate entries ignored.';
        renderXtream();input.value='';
      }
    }catch{
      status.textContent='Browser storage unavailable. No changes were saved.';
    }
  });
  return {show:()=>{modal.hidden=false;setMode('update');input.focus()}};
}
function mount(){
  const tabs=document.querySelector('.tabs'),grid=document.querySelector('#grid'),toolbar=document.querySelector('.toolbar');
  if(!tabs||!grid||!toolbar)return;
  // Relabel the visible all-records filter without changing its data-filter behavior.
  const allTab=tabs.querySelector('[data-filter="all"]');
  if(allTab)allTab.textContent='Xtream';
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/assets/personal-import.css?v=20261105-import-playlist';document.head.appendChild(sheet);
  button=document.createElement('button');button.type='button';button.className='mx-import-trigger';button.textContent='Import';
  tabs.appendChild(button);
  section=document.createElement('section');section.className='mx-import-xtream';section.id='mx-import-xtream';
  toolbar.insertAdjacentElement('afterend',section);
  const dialog=updateDialog();button.addEventListener('click',dialog.show);
  document.addEventListener('click',async event=>{
    const target=event.target.closest('[data-personal-copy]');
    if(!target)return;
    const row=readAll().find(x=>x.id===target.dataset.personalCopy);
    const text=row?.[target.dataset.field];
    if(typeof text!=='string')return;
    try{await copyText(text);target.textContent='Copied ✓';setTimeout(()=>target.textContent='Copy',1200)}
    catch{target.textContent='Copy failed'}
  });
  window.addEventListener('mx-personal-updates',renderXtream);
  // The original site resolves account details asynchronously and updates #count.
  // Observe that count, so the All badge always includes every original card.
  const nativeCount=document.querySelector('#count');
  if(nativeCount&&typeof MutationObserver!=='undefined'){
    new MutationObserver(updateAllCount).observe(nativeCount,{childList:true,subtree:true,characterData:true});
  }
  renderXtream();
  loadPublished();
  setInterval(loadPublished,60000);
}
window.MXPersonalUpdates={get:readAll,importBatch,saveBatch,importPlaylistBatch,savePlaylistBatch};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();