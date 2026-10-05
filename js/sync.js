'use strict';

// ══════════════════════════════════════════════════════════════════
//  SESSION
// ══════════════════════════════════════════════════════════════════
let SESSION_PIN=null;
const isPinSetup=()=>!!localStorage.getItem('pt_pin_verify');
const isConnected=()=>!!localStorage.getItem('pt_refresh_token');

// ══════════════════════════════════════════════════════════════════
//  OAUTH PKCE
// ══════════════════════════════════════════════════════════════════
// ── SET YOUR DROPBOX APP KEY HERE ──
const DBX_APP_KEY='svs3trw79bajcjd';
const REDIRECT_URI=window.location.origin+window.location.pathname.replace(/\/$/,'');
const DBX_PATH='/pro-tasks.json';

let _cachedToken=null,_tokenExpiry=0,syncTimer=null,lastSyncError=null,lastSyncAt=null;

function b64url(buf){return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function sha256(s){return crypto.subtle.digest('SHA-256',_e.encode(s));}
function randStr(n=64){const a=new Uint8Array(n);crypto.getRandomValues(a);return b64url(a);}

async function startOAuth(){
  if(DBX_APP_KEY==='YOUR_APP_KEY_HERE'){
    showConnectErr('App key not set — open the file and set DBX_APP_KEY.');return;
  }
  const v=randStr(64),ch=b64url(await sha256(v));
  sessionStorage.setItem('pt_verifier',v);
  const p=new URLSearchParams({client_id:DBX_APP_KEY,redirect_uri:REDIRECT_URI,response_type:'code',code_challenge:ch,code_challenge_method:'S256',token_access_type:'offline'});
  window.location.href='https://www.dropbox.com/oauth2/authorize?'+p;
}
async function handleOAuthCallback(code){
  const v=sessionStorage.getItem('pt_verifier');
  if(!v) throw new Error('No PKCE verifier — please try connecting again.');
  const res=await fetch('https://api.dropboxapi.com/oauth2/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({code,grant_type:'authorization_code',client_id:DBX_APP_KEY,redirect_uri:REDIRECT_URI,code_verifier:v})
  });
  if(!res.ok){const t=await res.text();throw new Error('Token exchange failed: '+t);}
  const json=await res.json();
  if(!json.refresh_token) throw new Error('No refresh token returned.');
  localStorage.setItem('pt_refresh_token',json.refresh_token);
  _cachedToken=json.access_token;
  _tokenExpiry=Date.now()+(json.expires_in||14400)*1000-60000;
  sessionStorage.removeItem('pt_verifier');
  window.history.replaceState({},document.title,window.location.pathname);
}

// Only forget the Dropbox connection when Dropbox actually rejects it.
// Being offline (network error) keeps the connection and works from local data.
async function getToken(){
  if(_cachedToken&&Date.now()<_tokenExpiry) return _cachedToken;
  const refresh=localStorage.getItem('pt_refresh_token');
  if(!refresh) return null;
  let res;
  try{
    res=await fetch('https://api.dropboxapi.com/oauth2/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh,client_id:DBX_APP_KEY})
    });
  }catch(e){
    lastSyncError='Offline — working from this device';return null;
  }
  if(res.status===400||res.status===401){
    _cachedToken=null;localStorage.removeItem('pt_refresh_token');showConnectScreen();return null;
  }
  if(!res.ok){lastSyncError='Dropbox token error (HTTP '+res.status+')';return null;}
  const json=await res.json();
  _cachedToken=json.access_token;
  _tokenExpiry=Date.now()+(json.expires_in||14400)*1000-60000;
  return _cachedToken;
}

// ══════════════════════════════════════════════════════════════════
//  SYNC STATE
//  pt_rev   = the Dropbox revision this device's data is based on
//  pt_dirty = '1' while this device has changes not yet uploaded
//  Uploads only succeed if Dropbox still holds pt_rev; otherwise
//  another device saved in between and we stop to ask (no silent loss).
// ══════════════════════════════════════════════════════════════════
const getBaseRev=()=>localStorage.getItem('pt_rev')||null;
const setBaseRev=r=>{if(r)localStorage.setItem('pt_rev',r);else localStorage.removeItem('pt_rev');};
const isDirty=()=>localStorage.getItem('pt_dirty')==='1';
const setDirty=v=>{if(v)localStorage.setItem('pt_dirty','1');else localStorage.removeItem('pt_dirty');};
let _editSeq=0,_saving=false,_saveAgain=false,_inConflict=false;

const setSyncStatus=s=>{const d=document.getElementById('syncDot');if(d)d.className=s;};

async function decodeRemote(raw){
  try{return JSON.parse(await decrypt(raw,SESSION_PIN));}
  catch(e){try{return JSON.parse(raw);}catch(e2){throw new Error('Cannot read Dropbox data (wrong PIN?).');}}
}

async function getRemoteRev(token){
  const res=await fetch('https://api.dropboxapi.com/2/files/get_metadata',{
    method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({path:DBX_PATH})
  });
  if(res.status===409) return null;
  if(!res.ok) throw new Error('HTTP '+res.status);
  return (await res.json()).rev||null;
}

// Returns {kind:'ok',data,rev} | {kind:'empty'} | {kind:'error'}
async function fetchRemote(){
  const token=await getToken();if(!token){setSyncStatus('offline');return {kind:'error'};}
  setSyncStatus('syncing');
  try{
    const res=await fetch('https://content.dropboxapi.com/2/files/download',{
      method:'POST',headers:{'Authorization':'Bearer '+token,'Dropbox-API-Arg':JSON.stringify({path:DBX_PATH})}
    });
    if(res.status===409){setSyncStatus('synced');return {kind:'empty'};}
    if(!res.ok) throw new Error('HTTP '+res.status);
    let rev=null;
    try{rev=JSON.parse(res.headers.get('Dropbox-API-Result')||'{}').rev||null;}catch(e){}
    const raw=await res.text();
    if(!rev) rev=await getRemoteRev(token);
    const parsed=await decodeRemote(raw);
    setSyncStatus('synced');
    return {kind:'ok',data:parsed,rev};
  }catch(e){setSyncStatus('error');lastSyncError=e.message;return {kind:'error'};}
}

// Upload. force=true overwrites whatever is in Dropbox (used only after the user chooses to).
async function saveToDropbox(force=false){
  if(!SESSION_PIN) return false;          // never upload while locked
  if(_inConflict&&!force) return false;   // wait for the user's decision
  if(_saving){_saveAgain=true;return false;}
  const token=await getToken();if(!token){setSyncStatus('offline');return false;}
  _saving=true;setSyncStatus('syncing');
  const seq=_editSeq;
  try{
    const base=getBaseRev();
    const mode=force?'overwrite':(base?{'.tag':'update','update':base}:'add');
    const ct=await encrypt(JSON.stringify(data),SESSION_PIN);
    const res=await fetch('https://content.dropboxapi.com/2/files/upload',{
      method:'POST',
      headers:{'Authorization':'Bearer '+token,'Dropbox-API-Arg':JSON.stringify({path:DBX_PATH,mode,autorename:false,mute:true}),'Content-Type':'application/octet-stream'},
      body:ct
    });
    if(res.status===409){
      const t=await res.text();
      if(/conflict/.test(t)){_saving=false;await onSyncConflict();return false;}
      throw new Error('Dropbox error: '+t.slice(0,120));
    }
    if(!res.ok) throw new Error('HTTP '+res.status);
    const json=await res.json();
    setBaseRev(json.rev);
    if(seq===_editSeq) setDirty(false);
    lastSyncAt=new Date();lastSyncError=null;
    setSyncStatus(isDirty()?'syncing':'synced');
    return true;
  }catch(e){setSyncStatus('error');lastSyncError=e.message;return false;}
  finally{
    _saving=false;
    if(_saveAgain||(isDirty()&&seq!==_editSeq&&!_inConflict)){_saveAgain=false;scheduleUpload();}
  }
}

function scheduleUpload(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>saveToDropbox(),2000);}

function scheduleSync(){
  if(!SESSION_PIN) return;
  data._v=Date.now();_editSeq++;setDirty(true);
  saveLocalCopy();
  setSyncStatus('syncing');
  scheduleUpload();
}
async function saveLocalCopy(){
  try{localStorage.setItem('pt_data',await encrypt(JSON.stringify(data),SESSION_PIN));}catch(e){}
}
async function syncNow(){clearTimeout(syncTimer);if(isDirty())await saveToDropbox();else await pullIfChanged(true);}

// Called once after unlocking. Reconciles this device's copy with Dropbox.
async function syncOnStartup(){
  const remote=await fetchRemote();
  if(remote.kind==='error') return;                         // offline: keep local, retry on next edit
  if(remote.kind==='empty'){setBaseRev(null);await saveToDropbox();return;}
  if(!isDirty()){adoptRemote(remote);return;}               // nothing pending here: take Dropbox's copy
  if(remote.rev&&remote.rev===getBaseRev()){await saveToDropbox();return;} // only we changed: upload
  _pendingRemote=remote;await onSyncConflict(remote);        // both changed
}

function adoptRemote(remote){
  if(!remote.data||!remote.data.ws||!remote.data.wsNames){setSyncStatus('error');lastSyncError='Dropbox file is not valid Pro Tasks data';return;}
  data=remote.data;
  setBaseRev(remote.rev);setDirty(false);
  saveLocalCopy();
  lastSyncAt=new Date();
  if(typeof updateWSButtons==='function') updateWSButtons();
  if(currentWS>=data.ws.length) currentWS=0;
  render();
}

// When you come back to this tab, pick up changes made on other devices.
let _pullBusy=false;
async function pullIfChanged(showResult=false){
  if(!SESSION_PIN||_pullBusy||_saving||_inConflict) return;
  if(isDirty()){await saveToDropbox();return;}             // upload pending edits; conflicts are caught there
  _pullBusy=true;
  try{
    const token=await getToken();if(!token){setSyncStatus('offline');return;}
    const rev=await getRemoteRev(token);
    if(rev&&rev!==getBaseRev()){
      const remote=await fetchRemote();
      if(remote.kind==='ok'&&!isDirty()) adoptRemote(remote);
    }else{setSyncStatus('synced');lastSyncAt=new Date();}
  }catch(e){setSyncStatus('error');lastSyncError=e.message;}
  finally{_pullBusy=false;}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pullIfChanged();});
window.addEventListener('focus',()=>pullIfChanged());

// ══════════════════════════════════════════════════════════════════
//  CONFLICT — both this device and another device changed the data.
//  Whichever version you don't keep is downloaded as a backup file.
// ══════════════════════════════════════════════════════════════════
let _pendingRemote=null;
async function onSyncConflict(remote){
  _inConflict=true;clearTimeout(syncTimer);
  setSyncStatus('error');lastSyncError='Changed on another device';
  _pendingRemote=remote||await fetchRemote();
  const when=(_pendingRemote&&_pendingRemote.data&&_pendingRemote.data._v)?new Date(_pendingRemote.data._v).toLocaleString():'unknown time';
  const mine=data._v?new Date(data._v).toLocaleString():'unknown time';
  document.getElementById('conflictOtherTime').innerText=when;
  document.getElementById('conflictMineTime').innerText=mine;
  document.getElementById('conflictOverlay').classList.add('open');
}
function downloadJSON(obj,name){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
async function resolveConflict(keep){
  const stamp=localDateStr()+'-'+String(new Date().getHours()).padStart(2,'0')+String(new Date().getMinutes()).padStart(2,'0');
  const remote=_pendingRemote;
  document.getElementById('conflictOverlay').classList.remove('open');
  if(keep==='remote'){
    downloadJSON(data,'pro-tasks-this-device-'+stamp+'.json');
    _inConflict=false;
    if(remote&&remote.kind==='ok') adoptRemote(remote); else await syncOnStartup();
  }else{
    if(remote&&remote.kind==='ok') downloadJSON(remote.data,'pro-tasks-other-device-'+stamp+'.json');
    _inConflict=false;
    await saveToDropbox(true);
  }
  _pendingRemote=null;
}
