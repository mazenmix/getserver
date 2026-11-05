/* MX GetServer private browser-only import: account credentials never enter GitHub or server logs. */
(()=>{
'use strict';
const KEY='mx-getserver-personal-updates-v1';
const ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const URL_PATTERN=/https?:\/\/[^\s<>"'\x60\\]+/gi;
const today=()=>new Date().toISOString();
const copyText=async text=>navigator.clipboard.writeText(text);
let modal,section,button;

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
    const endpoint=url.origin;
    const xtream=user&&pass;
    const playlist=isPlaylist(url);
    if(xtream){
      found.push({type:'xtream',server:endpoint,original,username:user,password:pass,date:today(),source:'Manual Update'});
    } else if(playlist){
      found.push({type:'playlist',server:original,date:today(),source:'Manual Update'});
    }
  }
  const results=new Map();
  for(const row of found)results.set(keyOf(row),row);
  return {items:[...results.values()],rawCount:found.length,duplicateCount:found.length-results.size};
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
function renderXtream(){
  if(!section)return;
  const items=readSaved().filter(x=>x.type==='xtream').sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
  section.innerHTML=items.length?'<h2>Xtream Updates <small>'+items.length+' accounts · newest first</small></h2>'+
    '<div class="mx-import-grid">'+items.map((row,i)=>
      '<article class="mx-import-card"><div class="mx-import-card-title"><b>◈ XTREAM CODES</b><span>#'+String(i+1).padStart(3,'0')+'</span></div>'+
      field('SERVER',row.server,row.id,'server')+
      field('USERNAME',row.username,row.id,'username')+
      field('PASSWORD',row.password,row.id,'password')+
      (row.original?field('FULL LINK',row.original,row.id,'original'):'')+'</article>'
    ).join('')+'</div>':'';
  section.hidden=!items.length;
}
function updateDialog(){
  modal=document.createElement('div');modal.className='mx-import-backdrop';modal.hidden=true;
  modal.innerHTML='<section class="mx-import-dialog" role="dialog" aria-modal="true" aria-label="Import Update">'+
  '<h2>Import Update</h2><p>Paste a batch containing Xtream credentials and complete M3U URLs. Parsing happens inside this browser only; nothing is uploaded.</p>'+
  '<textarea rows="12" id="mx-import-text" dir="ltr" spellcheck="false" placeholder="Paste your Telegram update here..."></textarea>'+
  '<p id="mx-import-result" role="status"></p>'+
  '<div class="mx-import-controls"><button id="mx-import-cancel" type="button">Cancel</button><button id="mx-import-save" type="button">Import & Save</button></div></section>';
  document.body.appendChild(modal);
  const input=modal.querySelector('#mx-import-text'),status=modal.querySelector('#mx-import-result');
  const close=()=>{modal.hidden=true;input.value='';status.textContent=''};
  modal.querySelector('#mx-import-cancel').addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close()});
  modal.querySelector('#mx-import-save').addEventListener('click',()=>{
    const batch=importBatch(input.value);
    if(!batch.items.length){status.textContent='No Xtream accounts or M3U Playlist links detected.';return}
    try{
      saveBatch(input.value);
      status.textContent='Saved '+batch.items.filter(x=>x.type==='xtream').length+' Xtream accounts and '+
        batch.items.filter(x=>x.type==='playlist').length+' M3U playlists. '+batch.duplicateCount+' duplicate entries ignored.';
      renderXtream();
      input.value='';
    }catch{
      status.textContent='Browser storage unavailable. No changes were saved.';
    }
  });
  return {show:()=>{modal.hidden=false;input.focus()}};
}
function mount(){
  const tabs=document.querySelector('.tabs'),grid=document.querySelector('#grid'),toolbar=document.querySelector('.toolbar');
  if(!tabs||!grid||!toolbar)return;
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/assets/personal-import.css?v=20261105';document.head.appendChild(sheet);
  button=document.createElement('button');button.type='button';button.className='mx-import-trigger';button.textContent='＋ Import Update';
  tabs.appendChild(button);
  section=document.createElement('section');section.className='mx-import-xtream';section.id='mx-import-xtream';
  toolbar.insertAdjacentElement('afterend',section);
  const dialog=updateDialog();button.addEventListener('click',dialog.show);
  document.addEventListener('click',async event=>{
    const target=event.target.closest('[data-personal-copy]');
    if(!target)return;
    const row=readSaved().find(x=>x.id===target.dataset.personalCopy);
    const text=row?.[target.dataset.field];
    if(typeof text!=='string')return;
    try{await copyText(text);target.textContent='Copied ✓';setTimeout(()=>target.textContent='Copy',1200)}
    catch{target.textContent='Copy failed'}
  });
  window.addEventListener('mx-personal-updates',renderXtream);
  renderXtream();
}
window.MXPersonalUpdates={get:readSaved,importBatch,saveBatch};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();