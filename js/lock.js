'use strict';

// ══════════════════════════════════════════════════════════════════
//  PIN LOCK SCREEN
// ══════════════════════════════════════════════════════════════════
let _pinBuf='',_pinPhase='choose',_pinFirst='';

function setStep(n){
  [0,1].forEach(i=>document.getElementById('dot'+i).className='step-dot'+(i<n?' done':i===n?' active':''));
  ['login','pass'].forEach((s,i)=>document.getElementById('step-'+s).classList.toggle('active',i===n));
}
function goLogin(){if(_pinChangeMode){_pinChangeMode=false;document.getElementById('lockScreen').classList.add('hidden');return;}_pinBuf='';updateDots('l');setStep(0);}
function goSetup(){
  _pinBuf='';_pinPhase='choose';_pinFirst='';
  document.getElementById('pinSetupSubtitle').innerText='Choose a 4-digit PIN';
  document.getElementById('setupPassErr').classList.remove('show');
  updateDots('s');setStep(1);
}
function buildKeypad(id,onD,onDel){
  const el=document.getElementById(id);if(!el)return;
  el.innerHTML='';
  [1,2,3,4,5,6,7,8,9,'',0,'⌫'].forEach(k=>{
    const b=document.createElement('button');
    if(k===''){b.className='pin-key empty';}
    else if(k==='⌫'){b.className='pin-key del';b.textContent='⌫';b.onclick=onDel;}
    else{b.className='pin-key';b.textContent=k;b.onclick=()=>onD(String(k));}
    el.appendChild(b);
  });
}
function updateDots(p){
  const px=p==='l'?'l':'s';
  for(let i=0;i<4;i++){
    const d=document.getElementById(px+'d'+i);
    if(d)d.className='pin-dot'+(i<_pinBuf.length?' filled':'');
  }
}
function shakeAndClear(p){
  const px=p==='l'?'l':'s';
  for(let i=0;i<4;i++){const d=document.getElementById(px+'d'+i);if(d)d.className='pin-dot error';}
  setTimeout(()=>{_pinBuf='';updateDots(p);},600);
}
function loginDigit(d){if(_pinBuf.length>=4)return;_pinBuf+=d;updateDots('l');if(_pinBuf.length===4)setTimeout(doLogin,80);}
function loginDel(){_pinBuf=_pinBuf.slice(0,-1);updateDots('l');}
async function doLogin(){
  const pin=_pinBuf;
  const err=document.getElementById('loginErr');err.classList.remove('show');
  try{
    const v=localStorage.getItem('pt_pin_verify');
    if(!v) throw new Error('No PIN set.');
    if(await decrypt(v,pin)!=='PROTASKS_PIN_V1') throw new Error('wrong');
    SESSION_PIN=pin;unlockApp();
  }catch(e){
    shakeAndClear('l');err.innerText='Incorrect PIN';err.classList.add('show');SESSION_PIN=null;
    setTimeout(()=>err.classList.remove('show'),2000);
  }
}
function setupDigit(d){if(_pinBuf.length>=4)return;_pinBuf+=d;updateDots('s');if(_pinBuf.length===4)setTimeout(doSetupPin,80);}
function setupDel(){_pinBuf=_pinBuf.slice(0,-1);updateDots('s');}
async function doSetupPin(){
  const pin=_pinBuf;_pinBuf='';
  if(_pinPhase==='choose'){
    _pinFirst=pin;_pinPhase='confirm';
    document.getElementById('pinSetupSubtitle').innerText='Confirm your PIN';
    updateDots('s');
  }else{
    if(pin!==_pinFirst){
      document.getElementById('setupPassErr').innerText='PINs do not match — try again.';
      document.getElementById('setupPassErr').classList.add('show');
      shakeAndClear('s');
      setTimeout(()=>{_pinPhase='choose';_pinFirst='';document.getElementById('pinSetupSubtitle').innerText='Choose a 4-digit PIN';document.getElementById('setupPassErr').classList.remove('show');},1200);
      return;
    }
    SESSION_PIN=pin;
    const ver=await encrypt('PROTASKS_PIN_V1',pin);
    localStorage.setItem('pt_pin_verify',ver);
    if(_pinChangeMode){
      _pinChangeMode=false;
      await saveLocalCopy();setDirty(true);
      document.getElementById('lockScreen').classList.add('hidden');
      const ok=await saveToDropbox();
      alert(ok?'PIN changed. On your other devices, tap "First time on this device?" and enter the new PIN.'
              :'PIN changed on this device. Dropbox will be updated on the next successful sync.');
      return;
    }
    unlockApp();
  }
}
function unlockApp(){
  hideConnectScreen();
  document.getElementById('lockScreen').classList.add('hidden');
  const app=document.getElementById('app');
  app.style.display='flex';app.style.flexDirection='column';app.style.height='100%';
  initApp();
}
async function lockApp(){
  // Finish any pending upload BEFORE forgetting the PIN. Previously a save that was
  // still queued could fire after locking and upload an empty, wrongly-keyed file.
  clearTimeout(syncTimer);
  if(SESSION_PIN&&isDirty()){setSyncStatus('syncing');try{await saveToDropbox();}catch(e){}}
  if(typeof closeProjectView==='function')closeProjectView();
  SESSION_PIN=null;
  data={wsNames:['Workspace 1','Workspace 2'],ws:[emptyWS(),emptyWS()],_v:0};
  hideConnectScreen();
  document.getElementById('app').style.display='none';
  document.getElementById('lockScreen').classList.remove('hidden');
  _pinBuf='';updateDots('l');
  document.getElementById('loginErr').classList.remove('show');
  setStep(0);
}
function showConnectScreen(){
  document.getElementById('connectScreen').classList.add('show');
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('app').style.display='none';
}
function hideConnectScreen(){document.getElementById('connectScreen').classList.remove('show');}
function showConnectErr(msg){const e=document.getElementById('connectErr');e.innerText=msg;e.classList.add('show');}
function resetEverything(){if(!confirm('Clear all data? You will need to reconnect and set a new PIN.'))return;localStorage.clear();location.reload();}
let _pinChangeMode=false;
function changePin(){_pinChangeMode=true;closeSettings();_pinBuf='';_pinPhase='choose';_pinFirst='';document.getElementById('pinSetupSubtitle').innerText='Choose a new PIN';document.getElementById('setupPassErr').classList.remove('show');updateDots('s');document.getElementById('lockScreen').classList.remove('hidden');setStep(1);}
async function disconnectDropbox(){if(!confirm('Disconnect Dropbox?'))return;localStorage.removeItem('pt_refresh_token');_cachedToken=null;_tokenExpiry=0;closeSettings();showConnectScreen();}
