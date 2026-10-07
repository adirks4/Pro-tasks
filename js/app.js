'use strict';

// ══════════════════════════════════════════════════════════════════
//  DATA MODEL
// ══════════════════════════════════════════════════════════════════
function emptyWS(){
  return {control:[],projects:[],reference:[]};
}
let data={
  wsNames:['Workspace 1','Workspace 2'],
  ws:[emptyWS(),emptyWS()],
  _v:0
};
let currentWS=0;
const ws=()=>data.ws[currentWS];
const uid=()=>Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);
const STATUSES=['Today','Next','Waiting','Done'];
const CYCLE_STATUSES=['Today','Next','Waiting'];
const BADGE_CLS={Next:'badge-Next',Today:'badge-Today',Waiting:'badge-Waiting',Done:'badge-Done'};
const PROJ_COLORS=['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#db2777','#0891b2','#65a30d','#ea580c','#64748b'];
const nextStatus=cur=>{
  const idx=CYCLE_STATUSES.indexOf(cur);
  return idx===-1?'Waiting':CYCLE_STATUSES[(idx+1)%CYCLE_STATUSES.length];
};
const escHtml=s=>!s?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function migrateIfNeeded(parsed){
  if(!parsed) return null;
  if(parsed.ws&&parsed.wsNames) return parsed;
  return null;
}

async function loadLocal(){
  try{
    const enc=localStorage.getItem('pt_data');
    if(enc&&SESSION_PIN){
      const pt=await decrypt(enc,SESSION_PIN);
      const parsed=JSON.parse(pt);
      if(parsed&&parsed.ws){data=parsed;return;}
    }
  }catch(e){setDirty(false);}
}

// ══════════════════════════════════════════════════════════════════
//  WORKSPACE SWITCHING
// ══════════════════════════════════════════════════════════════════
function switchWS(idx){
  if(typeof closeProjectView==='function')closeProjectView();
  currentWS=idx;
  document.querySelectorAll('.ws-btn').forEach((b,i)=>b.classList.toggle('active',i===idx));
  document.getElementById('drawerWsLabel').innerText=data.wsNames[idx]||'Workspace '+(idx+1);
  document.getElementById('ws-btn-0').textContent=data.wsNames[0]||'Workspace 1';
  document.getElementById('ws-btn-1').textContent=data.wsNames[1]||'Workspace 2';
  // Workspace 2 = dark mode
  document.body.classList.toggle('ws-dark', idx===1);
  switchSection('control',document.querySelector('[data-sec="control"]'));
  render();
}
function openRenameWS(){
  document.getElementById('ws0Name').value=data.wsNames[0]||'';
  document.getElementById('ws1Name').value=data.wsNames[1]||'';
  document.getElementById('renameOverlay').classList.add('open');
  closeDrawer();
}
function closeRenameWS(){document.getElementById('renameOverlay').classList.remove('open');}
function saveWSNames(){
  const n0=document.getElementById('ws0Name').value.trim()||'Workspace 1';
  const n1=document.getElementById('ws1Name').value.trim()||'Workspace 2';
  data.wsNames=[n0,n1];
  document.getElementById('ws-btn-0').textContent=n0;
  document.getElementById('ws-btn-1').textContent=n1;
  document.getElementById('drawerWsLabel').innerText=data.wsNames[currentWS];
  closeRenameWS();scheduleSync();
}

// ══════════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════════
function openSettings(){
  document.getElementById('settingsStatus').className='s-status';
  const info=document.getElementById('syncInfo');
  if(info)info.innerText=(lastSyncAt?'Last synced '+lastSyncAt.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'Not synced yet this session')
    +(isDirty()?' · changes waiting to upload':'')+(lastSyncError?' · '+lastSyncError:'');
  document.getElementById('settingsOverlay').classList.add('open');closeDrawer();
}
function closeSettings(){document.getElementById('settingsOverlay').classList.remove('open');}
function showSettingsStatus(type,msg){const el=document.getElementById('settingsStatus');el.className='s-status show '+type;el.innerText=msg;}
async function forceReload(){
  if(isDirty()&&!confirm('This device has changes that have not reached Dropbox yet. Reloading will discard them (a backup file will be downloaded first). Continue?'))return;
  showSettingsStatus('ok','Reloading from Dropbox…');
  const remote=await fetchRemote();
  if(remote.kind==='ok'){
    if(isDirty())downloadJSON(data,'pro-tasks-this-device-'+localDateStr()+'.json');
    adoptRemote(remote);showSettingsStatus('ok','✓ Reloaded.');
  }
  else if(remote.kind==='empty') showSettingsStatus('ok','No data in Dropbox yet.');
  else showSettingsStatus('err','✗ Could not reach Dropbox.');
}

// ══════════════════════════════════════════════════════════════════
//  DUE DATE HELPERS
// ══════════════════════════════════════════════════════════════════
// Local calendar date as YYYY-MM-DD (toISOString() is UTC and rolls to tomorrow after 8 PM Eastern)
function localDateStr(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function todayStr(){return localDateStr();}
function dueDiffDays(due){
  if(!due) return null;
  const now=new Date();now.setHours(0,0,0,0);
  return Math.round((new Date(due+'T00:00:00')-now)/(86400000));
}
function dueClass(due){
  if(!due) return 'no-date';
  const d=dueDiffDays(due);
  if(d<0) return 'overdue';
  if(d===0) return 'due-today';
  if(d<=3) return 'due-soon';
  return 'upcoming';
}
function dueLabel(due){
  if(!due) return '+ due date';
  const d=dueDiffDays(due);
  const short=new Date(due+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
  if(d<0) return '⚠ '+short+' (overdue)';
  if(d===0) return '● Today';
  if(d===1) return '● Tomorrow';
  return '📅 '+short;
}
function isOverdue(due){return due&&dueDiffDays(due)<0;}
function compareDue(a,b){if(!a.due&&!b.due)return 0;if(!a.due)return 1;if(!b.due)return -1;return a.due<b.due?-1:a.due>b.due?1:0;}

let _datePopCleanup=null;
function openDatePicker(chipEl,currentDue,onSave){
  document.querySelectorAll('.date-pop').forEach(p=>p.remove());
  if(_datePopCleanup){_datePopCleanup();_datePopCleanup=null;}
  const pop=document.createElement('div');pop.className='date-pop';
  pop.innerHTML=`<div class="date-pop-label">Set date</div>
    <input type="date" class="date-pop-input" id="datePopInput" value="${currentDue||''}">
    <div class="date-pop-quick">
      <button class="date-pop-btn" onclick="__dateQuick(0)">Today</button>
      <button class="date-pop-btn" onclick="__dateQuick(7)">+1 wk</button>
      <button class="date-pop-btn" onclick="__dateQuick(14)">+2 wk</button>
    </div>
    <div class="date-pop-row">
      <button class="date-pop-btn primary" onclick="__dateSave()">Save</button>
      <button class="date-pop-btn clear" onclick="__dateClear()">Clear</button>
      <button class="date-pop-btn" onclick="__dateCancel()">✕</button>
    </div>`;
  document.body.appendChild(pop);
  const rect=chipEl.getBoundingClientRect();
  let top=rect.bottom+6,left=rect.left;
  if(left+220>window.innerWidth)left=window.innerWidth-228;
  if(top+200>window.innerHeight)top=rect.top-206;
  pop.style.top=top+'px';pop.style.left=left+'px';
  pop.querySelector('#datePopInput').focus();
  window.__dateSave=()=>{onSave(pop.querySelector('#datePopInput').value||null);pop.remove();cleanup();};
  window.__dateClear=()=>{
    if(requireDates()&&!confirm('Clear this date? It will go back to the “Needs a date” list.'))return;
    onSave(null);pop.remove();cleanup();};
  window.__dateQuick=n=>{onSave(n===0?todayStr():deferDate(currentDue,n));pop.remove();cleanup();};
  window.__dateCancel=()=>{pop.remove();cleanup();};
  pop.querySelector('#datePopInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();window.__dateSave();}if(e.key==='Escape'){pop.remove();cleanup();}});
  function cleanup(){document.removeEventListener('mousedown',outsideClick);_datePopCleanup=null;}
  function outsideClick(e){if(!pop.contains(e.target)&&e.target!==chipEl){pop.remove();cleanup();}}
  setTimeout(()=>document.addEventListener('mousedown',outsideClick),0);
  _datePopCleanup=cleanup;
}

// ══════════════════════════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════════════════════════
function render(){runSchedule();renderControl();renderProjects();renderReference();renderMaintenance();renderToday();updateBadges();schedulePVRender();}
const showDone=()=>document.getElementById('showDoneChk').checked;

// Workspace 1 requires every open item to have a date ("Needs a date" queue).
const requireDates=()=>currentWS===0;
let _showLater=false;
function ctrlRows(){
  const rows=[];
  ws().control.forEach(t=>rows.push({...t,_src:'Manual',_projName:null,_color:null}));
  ws().projects.forEach(p=>(p.subtasks||[]).forEach(s=>rows.push({...s,_src:'Project',_projName:p.name,_pid:p.id,_color:p.color||null})));
  // checks (Workspace 1): anything not approved, plus approvals that go stale within 14 days
  if(currentWS===0) ws().projects.forEach(p=>(p.checks||[]).forEach(c=>{
    const exp=checkExpiry(c);
    if(c.state==='approved'&&(!exp||calDiff(exp)>14)) return;
    rows.push({id:c.id,name:c.name,owner:c.owner,deferrals:c.deferrals,status:'Next',done:false,due:checkDate(c),
      group:'Checks'+(c.cat?' › '+c.cat:''),_src:'Check',_ck:c,_projName:p.name,_pid:p.id,_color:p.color||null});
  }));
  return rows;
}
function ctrlBucket(t){
  if(t.done) return 'Done';
  if(requireDates()&&(t.gate?!t.target:(!t.due&&t.status!=='Today'))) return 'Need';
  if((t._src==='Project'||t._src==='Check')&&!isMine(t)) return 'Waiting';
  if(t.status==='Today') return 'Today';
  if(t.status==='Waiting') return 'Waiting';
  if(!t.due) return 'Next';
  if(requireDates()&&calDiff(t.due)>14) return 'Later';
  return 'Upcoming';
}
function renderControl(){
  const list=document.getElementById('controlList');
  const rows=ctrlRows();
  const B={Need:[],Today:[],Upcoming:[],Later:[],Next:[],Waiting:[],Done:[]};
  rows.forEach(t=>B[ctrlBucket(t)].push(t));
  // upcoming maintenance merges into Upcoming
  const UPCOMING_WINDOW_PT=2;
  const allMaint=(ws().maintCategories||[]).flatMap(c=>(c.tasks||[]).map(t=>({...t,_catId:c.id,_catName:c.name,_catColor:c.color||'#5b8fa8'})));
  allMaint.filter(m=>maintDiffDays_pt(m)<=UPCOMING_WINDOW_PT).forEach(m=>{
    B.Upcoming.push({id:'maint-pt-'+m.id,name:m.name,status:'Next',done:false,due:nextDueDate_pt(m),
      _src:'Maint',_projName:m._catName,_color:m._catColor,_pid:null,_maintCatId:m._catId,_maintId:m.id});
  });
  if(!rows.length&&!B.Upcoming.length){list.innerHTML='<div class="empty-state"><div class="ei">◈</div>No tasks yet</div>';return;}
  B.Upcoming.sort(compareDue);B.Later.sort(compareDue);B.Waiting.sort(compareDue);
  list.innerHTML='';
  const sections=[
    {key:'Need',    label:'Needs a date',badge:'badge-Need',cls:'need-date'},
    {key:'Today',   label:'Today',       badge:'badge-Today'},
    {key:'Upcoming',label:requireDates()?'Upcoming · next 14 days':'Upcoming',badge:'badge-Next'},
    {key:'Later',   label:'Later',       badge:'badge-Next',collapsible:true},
    {key:'Next',    label:'Next',        badge:'badge-Next'},
    {key:'Waiting', label:'Waiting',     badge:'badge-Waiting'},
    {key:'Done',    label:'Done',        badge:'badge-Done'},
  ];
  sections.forEach(sec=>{
    const secRows=B[sec.key];
    if(!secRows.length) return;
    if(sec.key==='Done'&&!showDone()) return;
    const grp=document.createElement('div');grp.className='status-group'+(sec.cls?' '+sec.cls:'');
    const lbl=document.createElement('div');lbl.className='status-group-label';
    lbl.innerHTML=`<span class="badge ${sec.badge}" style="cursor:default;pointer-events:none">${sec.label} · ${secRows.length}</span>`
      +(sec.collapsible?`<button class="later-toggle" onclick="_showLater=!_showLater;renderControl()">${_showLater?'Hide':'Show'}</button>`:'');
    grp.appendChild(lbl);
    if(!sec.collapsible||_showLater){
      const wrap=document.createElement('div');
      secRows.forEach((t,i)=>{wrap.appendChild(makeCtrlRow(t,i,secRows.length,sec.key));});
      grp.appendChild(wrap);
    }
    list.appendChild(grp);
  });
}

// Set a row's date from Control (chip, quick buttons). Links and deferrals are handled by setTaskDue.
function ctrlCheck(pid,id){const p=ws().projects.find(x=>x.id===pid);return p&&findCheck(p,id);}
function setRowDue(t,val){
  let msg=null;
  if(t._src==='Check'){
    const c=ctrlCheck(t._pid,t.id);if(!c) return;
    if(c.state==='approved'){toast('The re-review date comes from the approval date. Tick it (or use the badge) once it’s re-reviewed.');return;}
    if(c.due&&val&&val>c.due)c.deferrals=(c.deferrals||0)+1;
    c.due=val||null;save_render();return;
  }
  if(t._src==='Manual'){const item=ws().control.find(x=>x.id===t.id);if(item)msg=setTaskDue(item,val,null);}
  else if(t._src==='Project'&&t._pid){const p=ws().projects.find(x=>x.id===t._pid);const s=p&&p.subtasks.find(x=>x.id===t.id);if(s)msg=setTaskDue(s,val,currentWS===0?p:null);}
  save_render();if(msg)toast(msg);
}
function openTaskSource(t){
  if(t._src==='Check'){openProjectView(t._pid,t.id);return;}
  if(t._src!=='Project') return;
  if(currentWS===0) openProjectView(t._pid,t.id);
  else switchSection('projects',document.querySelector('[data-sec=projects]'));
}
// chips shown after a task name: gate status, owner, deferrals, links, workstream
function taskMetaChips(t,p){
  let h='';
  if(t._src==='Check'){const st=checkStatus(t._ck);h+=`<span class="check-chip" title="${escHtml(st.label)}"><span class="ck-light c-${st.color}"></span>${escHtml(st.label)}</span>`;}
  if(t.gate&&p&&currentWS===0){const st=gateStatus(p,t);h+=`<span class="gate-chip g-${st.color}" title="${escHtml(st.reasons.join(' · '))}">◆ ${escHtml(st.label)}</span>`;}
  if(t.owner&&!isMine(t)&&!t.done) h+=`<span class="meta-chip owner" title="Waiting on ${escHtml(t.owner)}">→ ${escHtml(t.owner)}</span>`;
  if(t.deferrals&&!t.done) h+=`<span class="meta-chip defer" title="Pushed later ${t.deferrals} time${t.deferrals>1?'s':''}">↻${t.deferrals}</span>`;
  if(t.preds&&t.preds.length&&!t.gate) h+=`<span class="meta-chip link" title="Date comes from linked tasks">🔗</span>`;
  return h;
}
function quickDateHTML(t){
  return `<button class="qd-btn" data-qd="0">Today</button><button class="qd-btn" data-qd="7">+1 week</button><button class="qd-btn" data-qd="14">+2 weeks</button>`;
}

function makeCtrlRow(t,i,total,bucket){
  const el=document.createElement('div');
  el.className='t-row ctrl'+(t.done?' done-row':'')+(t.status==='Today'&&bucket==='Today'?' today-hl':'')+(isOverdue(t.due)&&!t.done?' overdue-row':'')+(bucket==='Need'?' need-row':'');
  if(i===0&&total>1) el.style.borderRadius='var(--radius) var(--radius) 0 0';
  if(i===total-1&&total>1) el.style.borderRadius='0 0 var(--radius) var(--radius)';
  if(total===1) el.style.borderRadius='var(--radius)';
  el.dataset.id=t.id;el.dataset.src=t._src;if(t._pid)el.dataset.pid=t._pid;
  const cid='chkc-'+t.id;
  const proj=t._pid?ws().projects.find(x=>x.id===t._pid):null;
  const dot=(t._src==='Project'||t._src==='Check')&&t._color?`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${t._color};margin-right:2px;flex-shrink:0"></span>`:'';
  const chipDate=t.gate?t.target:t.due;
  const dueChip=bucket==='Need'?`<span class="due-chip overdue" id="dc-${t.id}">📅 Pick date</span>`
    :`<span class="due-chip ${dueClass(t.due)}" id="dc-${t.id}">${t.gate&&t.fc&&t.target&&t.fc>t.target?'◆ ':''}${t._src==='Check'&&t._ck.state==='approved'?'re-review ':''}${dueLabel(t.due)}</span>`;
  const grpLabel=t.group?`<span class="ws-label">${escHtml(t.group.split(' › ').pop())}</span>`:'';
  el.innerHTML=`
    <div class="c-check">
      <input type="checkbox" class="t-check" id="${cid}" ${t.done?'checked':''}>
      <label class="check-vis" for="${cid}"></label>
    </div>
    <div class="c-name">
      <div class="t-name" contenteditable="${t._src==='Manual'}" data-ph="Task name"
        ${t._src!=='Maint'?`onblur="updateCtrlName('${t.id}','${t._src}','${t._pid||''}',this)"`:''}
        onkeydown="handleKeydown(event)"
        ${t._src==='Project'||t._src==='Check'?`style="cursor:pointer"`:''}
      >${t.gate?'◆ ':''}${t._src==='Check'?'☑ ':''}${escHtml(t.name)}</div>
      ${t._src==='Project'||t._src==='Check'?`<span class="t-source" data-open="1" style="cursor:pointer" title="${currentWS===0?'Open project view':'Go to project'}">${dot}${escHtml(t._projName||'')}</span>${grpLabel}`:''}
      ${taskMetaChips(t,proj)}
      <div class="due-wrap">${dueChip}${bucket==='Need'?quickDateHTML(t):''}</div>
    </div>
    <div class="c-status">
      ${t._src==='Check'?`<span class="badge badge-Check" title="Click to move to the next stage" onclick="cycleCtrlStatus('${t.id}','Check','${t._pid}')">${CK_LABEL[t._ck.state||'missing']}</span>`
        :`<span class="badge ${BADGE_CLS[t.status]||'badge-Waiting'}" onclick="cycleCtrlStatus('${t.id}','${t._src}','${t._pid||''}')">${t.status}</span>`}
    </div>
    <div class="c-del">${t._src==='Check'?'':`<button class="del-btn" onclick="deleteCtrl('${t.id}','${t._src}','${t._pid||''}')">✕</button>`}</div>`;
  el.querySelector('.t-check').addEventListener('change',function(){
    if(t._src==='Maint'){
      if(this.checked){completeMaintTaskInCat_pt(t._maintCatId,t._maintId);this.checked=false;save_render();}
    } else {
      toggleDoneCtrl(t.id,t._src,t._pid||'',this);
    }
  });
  if(t._src==='Project'||t._src==='Check'){
    el.querySelector('.t-name').addEventListener('click',()=>openTaskSource(t));
    el.querySelector('[data-open]').addEventListener('click',()=>openTaskSource(t));
  }
  const chip=el.querySelector('#dc-'+t.id);
  if(chip&&t._src!=='Maint') chip.addEventListener('click',()=>openDatePicker(chip,chipDate||null,val=>setRowDue(t,val)));
  el.querySelectorAll('.qd-btn').forEach(b=>b.addEventListener('click',()=>{
    const q=b.dataset.qd;
    setRowDue(t,q==='0'?todayStr():deferDate(null,parseInt(q)));
  }));
  return el;
}

// Header chip: the next open gate and its status (Workspace 1)
function nextGateChip(p){
  const g=(p.subtasks||[]).filter(t=>t.gate&&!t.done).sort((a,b)=>(a.due||'9999')<(b.due||'9999')?-1:1)[0];
  if(!g) return '';
  const st=gateStatus(p,g);
  return `<span class="gate-chip g-${st.color}" onclick="openProjectView('${p.id}','${g.id}')" title="${escHtml(st.reasons.join(' · ')||st.label)}">◆ ${escHtml(g.name)} · ${g.due?fmtShort(g.due):'no date'}</span>`;
}
function checksChip(p){
  const cks=p.checks||[];if(!cks.length) return '';
  const cols=cks.map(c=>checkStatus(c).color),col=cols.includes('red')?'red':cols.includes('amber')?'amber':cols.every(c=>c==='green')?'green':'gray';
  return `<span class="check-chip" onclick="openProjectView('${p.id}');PV.tab='checks';renderPV();" title="Checks approved"><span class="ck-light c-${col}"></span>☑ ${cks.filter(checkOK).length}/${cks.length}</span>`;
}
function toggleProjNotes(pid){
  const p=ws().projects.find(x=>x.id===pid);if(!p)return;
  p.notesOpen=!p.notesOpen;
  if(p.notesOpen&&p.collapsed)p.collapsed=false;
  save_render();
  if(p.notesOpen)setTimeout(()=>{const ta=document.getElementById('proj-notes-'+pid)?.querySelector('textarea');if(ta)ta.focus();},50);
}

function renderProjects(){
  if(_kanbanMode){renderKanban();return;}
  const list=document.getElementById('projectsList');
  if(!ws().projects.length){list.innerHTML='<div class="empty-state"><div class="ei">⬡</div>No projects yet</div>';return;}
  list.innerHTML='';
  ws().projects.forEach((p,pidx)=>{
    const color=p.color||PROJ_COLORS[0];
    const isFirst=pidx===0,isLast=pidx===ws().projects.length-1;
    const grp=document.createElement('div');grp.className='proj-group';grp.dataset.pid=p.id;
    const hasSubs=p.subtasks&&p.subtasks.length>0;
    const hdr=document.createElement('div');
    hdr.className='proj-hdr-row'+(hasSubs?'':' solo')+(p.done?' done-row':'')+(isOverdue(p.due)?' overdue-row':'');
    hdr.style.boxShadow=`inset 3px 0 0 ${color}`;
    hdr.dataset.id=p.id;const ckid='chkp-'+p.id;
    hdr.innerHTML=`
      <div class="move-btns">
        <button class="move-btn" onclick="moveProject('${p.id}',-1)" ${isFirst?'disabled':''}>▲</button>
        <button class="move-btn" onclick="moveProject('${p.id}',1)" ${isLast?'disabled':''}>▼</button>
      </div>
      <div class="c-check">
        <input type="checkbox" class="t-check" id="${ckid}" ${p.done?'checked':''}>
        <label class="check-vis" for="${ckid}"></label>
      </div>
      <div class="c-proj-name" style="position:relative">
        <span class="proj-color-dot" style="background:${color}" onclick="openColorPicker('${p.id}',this)"></span>
        <button class="collapse-btn ${p.collapsed?'collapsed':''}" onclick="toggleCollapse('${p.id}')" style="color:${color}">▼</button>
        <div class="proj-name-text" contenteditable="true" data-ph="Project name"
          onblur="updateProjName('${p.id}',this)" onkeydown="handleKeydown(event)"
          style="color:${color}">${escHtml(p.name)}</div>
        <button class="add-sub-btn" onclick="addSubtask('${p.id}')">+ subtask</button>
        <button class="proj-notes-btn ${p.notesOpen?'active':''}" onclick="toggleProjNotes('${p.id}')">📝 Notes</button>
        ${currentWS===0?`<button class="open-proj-btn" onclick="openProjectView('${p.id}')" title="Open the full project view">⤢ Open</button>${nextGateChip(p)}${checksChip(p)}`:''}
      </div>
      <div class="c-status">
        <span class="badge ${BADGE_CLS[p.status]||'badge-Waiting'}" onclick="cycleProjStatus('${p.id}')">${p.status}</span>
      </div>
      <div class="c-del"><button class="del-btn" onclick="deleteProject('${p.id}')">✕</button></div>`;
    hdr.querySelector('.t-check').addEventListener('change',function(){toggleDoneProject(p.id,this);});
    grp.appendChild(hdr);
    if(hasSubs){
      const subsDiv=document.createElement('div');
      subsDiv.className='proj-subs'+(p.collapsed||p.notesOpen?' collapsed':'');
      subsDiv.dataset.pid=p.id;
      const sorted=[...p.subtasks].sort(compareDue);
      sorted.forEach(s=>{
        const sel=document.createElement('div');
        sel.className='t-row sub'+(s.done?' done-row':'')+(isOverdue(s.due)?' overdue-row':'');
        sel.dataset.id=s.id;sel.dataset.pid=p.id;
        const sid='chks-'+s.id;
        const sChip=`<span class="due-chip ${dueClass(s.due)}" id="dcs-${s.id}">${dueLabel(s.due)}</span>`;
        sel.innerHTML=`
          <div class="c-check">
            <input type="checkbox" class="t-check" id="${sid}" ${s.done?'checked':''}>
            <label class="check-vis" for="${sid}"></label>
          </div>
          <div class="c-name">
            <div class="t-name" contenteditable="true" data-ph="Subtask"
              onblur="updateSubName('${p.id}','${s.id}',this)" onkeydown="handleKeydown(event)">${escHtml(s.name)}</div>
            ${s.gate?'<span class="meta-chip owner">◆ gate</span>':''}${taskMetaChips(s,p)}
            <div class="due-wrap">${sChip}</div>
          </div>
          <div class="c-status">
            <span class="badge ${BADGE_CLS[s.status]||'badge-Waiting'}" onclick="cycleSubStatus('${p.id}','${s.id}')">${s.status}</span>
          </div>
          <div class="c-del"><button class="del-btn" onclick="deleteSubtask('${p.id}','${s.id}')">✕</button></div>`;
        sel.querySelector('.t-check').addEventListener('change',function(){toggleDoneSub(p.id,s.id,this);});
        const sc=sel.querySelector('#dcs-'+s.id);
        if(sc) sc.addEventListener('click',()=>{
          openDatePicker(sc,(s.gate?s.target:s.due)||null,val=>setRowDue({...s,_src:'Project',_pid:p.id},val));
        });

        subsDiv.appendChild(sel);
      });
      grp.appendChild(subsDiv);
    }
    // Notes panel
    const notesWrap2=document.createElement('div');notesWrap2.className='proj-notes-wrap'+(p.notesOpen?' open':'');notesWrap2.id='proj-notes-'+p.id;
    const notesTA2=document.createElement('textarea');notesTA2.className='proj-notes-area';notesTA2.placeholder='Project notes…';notesTA2.value=p.notes||'';
    const nL=Math.max(3,Math.min(8,(p.notes||'').split('\n').length+1));notesTA2.style.height=(nL*22+16)+'px';notesTA2.style.maxHeight='160px';
    notesTA2.addEventListener('input',function(){const l=Math.max(3,Math.min(8,this.value.split('\n').length+1));notesTA2.style.height=(l*22+16)+'px';});
    notesTA2.addEventListener('blur',function(){const proj=ws().projects.find(x=>x.id===p.id);if(proj)proj.notes=this.value;scheduleSync();});
    notesWrap2.appendChild(notesTA2);grp.appendChild(notesWrap2);
    list.appendChild(grp);
  });
}

function renderReference(){
  const list=document.getElementById('referenceList');
  if(!ws().reference.length){list.innerHTML='<div class="empty-state"><div class="ei">◻</div>No reference items</div>';return;}
  list.innerHTML='';
  ws().reference.forEach(r=>{
    const el=document.createElement('div');el.className='t-row ref';el.dataset.id=r.id;
    el.innerHTML=`
      <div class="ref-cell" contenteditable="true" data-ph="Item" onblur="updateRef('${r.id}','item',this)" onkeydown="handleKeydown(event)">${escHtml(r.item)}</div>
      <div class="ref-cell notes" contenteditable="true" data-ph="Notes" onblur="updateRef('${r.id}','notes',this)" onkeydown="handleKeydown(event)">${escHtml(r.notes)}</div>
      <div class="c-del"><button class="del-btn" onclick="deleteRef('${r.id}')">✕</button></div>`;
    list.appendChild(el);
  });
}

function renderToday(){
  const items=[];
  ws().control.forEach(t=>{if(t.status==='Today')items.push({id:t.id,name:t.name,done:t.done,src:'control',pid:null,projName:null,color:null});});
  ws().projects.forEach(p=>(p.subtasks||[]).forEach(s=>{if(s.status==='Today'&&isMine(s))items.push({id:s.id,name:s.name,done:s.done,src:'sub',pid:p.id,projName:p.name,color:p.color||null});}));
  document.getElementById('todayCount').innerText=items.filter(i=>!i.done).length;
  const rowsEl=document.getElementById('todayRows');rowsEl.innerHTML='';
  items.forEach(item=>{
    if(item.done&&!showDone()) return;
    const div=document.createElement('div');div.className='today-row-item'+(item.done?' done-today':'');
    const cid='trid-'+item.id;
    const dot=item.color?`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${item.color};margin-right:2px;vertical-align:middle"></span>`:'';
    div.innerHTML=`
      <input type="checkbox" class="tri-check" id="${cid}" ${item.done?'checked':''}>
      <label class="tri-visual" for="${cid}"></label>
      <span class="tri-name">${escHtml(item.name)}</span>
      ${item.projName?`<span class="tri-project">${dot}${escHtml(item.projName)}</span>`:''}`;
    div.querySelector('.tri-check').addEventListener('change',function(){
      if(item.src==='control') toggleDoneCtrl(item.id,'Manual','',this);
      else toggleDoneSub(item.pid,item.id,this);
    });
    rowsEl.appendChild(div);
  });
}

function updateBadges(){
  document.getElementById('db-control').innerText=ws().control.filter(t=>!t.done).length+ws().projects.reduce((a,p)=>a+(p.subtasks||[]).filter(s=>!s.done).length,0);
  document.getElementById('db-projects').innerText=ws().projects.length;
  document.getElementById('db-reference').innerText=ws().reference.length;
  const mEl2=document.getElementById('db-maintenance');if(mEl2)mEl2.innerText=(ws().maintCategories||[]).reduce((a,c)=>a+(c.tasks||[]).length,0);
}

// ══════════════════════════════════════════════════════════════════
//  ACTIONS — CONTROL
// ══════════════════════════════════════════════════════════════════
function addManualTask(){ws().control.push({id:uid(),name:'New Task',status:'Waiting',done:false,due:null});save_render();setTimeout(()=>focusLast('controlList'),50);}
function updateCtrlName(id,src,pid,el){
  const name=el.innerText.trim();
  if(src==='Manual'){const t=ws().control.find(x=>x.id===id);if(t&&name)t.name=name;}
  else if(src==='Project'&&pid){const p=ws().projects.find(x=>x.id===pid);const s=p&&p.subtasks.find(x=>x.id===id);if(s&&name)s.name=name;}
  scheduleSync();renderToday();updateBadges();
}
function advanceCheck(pid,id){
  const c=ctrlCheck(pid,id);if(!c) return;
  if(c.state==='approved'){if(!confirm('Mark "'+c.name+'" as re-reviewed today?'))return;c.approvedOn=todayStr();(c.hist||(c.hist=[])).push({d:todayStr(),s:'approved'});save_render();toast(c.name+' re-reviewed.');return;}
  const nx=CK_STATES[CK_STATES.indexOf(c.state||'missing')+1];
  setCheckState(c,nx);save_render();toast(c.name+' → '+CK_LABEL[nx]+(nx==='approved'?' ✓':''));
}
function cycleCtrlStatus(id,src,pid){
  if(src==='Maint')return;
  if(src==='Check'){advanceCheck(pid,id);return;}
  if(src==='Project'&&pid){const p=ws().projects.find(x=>x.id===pid);const s=p&&p.subtasks.find(x=>x.id===id);if(s){s.status=nextStatus(s.status);if(s.status==='Done')s.done=true;else s.done=false;}}
  else{const t=ws().control.find(x=>x.id===id);if(t){t.status=nextStatus(t.status);if(t.status==='Done')t.done=true;else t.done=false;}}
  save_render();
}
function toggleDoneCtrl(id,src,pid,chk){
  if(src==='Check'){
    const c=ctrlCheck(pid,id);if(!c||!chk.checked) return;
    if(c.state==='approved'){c.approvedOn=todayStr();(c.hist||(c.hist=[])).push({d:todayStr(),s:'approved'});}
    else{if(!confirm('Mark "'+c.name+'" approved?')){chk.checked=false;return;}setCheckState(c,'approved');}
    save_render();toast(c.name+' approved ✓');return;
  }
  if(src==='Project'&&pid){const p=ws().projects.find(x=>x.id===pid);const s=p&&p.subtasks.find(x=>x.id===id);if(s){s.done=chk.checked;s.status=chk.checked?'Done':'Waiting';}}
  else{const t=ws().control.find(x=>x.id===id);if(t){t.done=chk.checked;t.status=chk.checked?'Done':'Waiting';}}
  save_render();
}
function deleteCtrl(id,src,pid){
  if(src==='Maint')return;
  if(src==='Project'&&pid){const p=ws().projects.find(x=>x.id===pid);if(p)p.subtasks=p.subtasks.filter(s=>s.id!==id);}
  else data.ws[currentWS].control=ws().control.filter(t=>t.id!==id);
  save_render();
}

// ══════════════════════════════════════════════════════════════════
//  ACTIONS — PROJECTS
// ══════════════════════════════════════════════════════════════════
function addProject(){
  const p={id:uid(),name:'New Project',status:'Waiting',done:false,collapsed:false,due:null,
    color:PROJ_COLORS[ws().projects.length%PROJ_COLORS.length],
    subtasks:[{id:uid(),name:'New Subtask',status:'Waiting',done:false,due:null}]};
  ws().projects.push(p);save_render();
  setTimeout(()=>{const el=document.querySelector(`[data-pid="${p.id}"] .proj-name-text`);if(el){el.focus();selectAll(el);}},50);
}
function addSubtask(pid){
  const p=ws().projects.find(x=>x.id===pid);if(!p)return;
  p.subtasks.push({id:uid(),name:'New Subtask',status:'Waiting',done:false,due:null});
  p.collapsed=false;save_render();
  setTimeout(()=>{const subs=document.querySelector(`.proj-subs[data-pid="${pid}"]`);if(subs){const el=subs.lastElementChild&&subs.lastElementChild.querySelector('.t-name');if(el){el.focus();selectAll(el);}}},50);
}
function updateProjName(pid,el){const p=ws().projects.find(x=>x.id===pid);if(p&&el.innerText.trim())p.name=el.innerText.trim();scheduleSync();renderControl();renderToday();updateBadges();}
function cycleProjStatus(pid){const p=ws().projects.find(x=>x.id===pid);if(!p)return;p.status=nextStatus(p.status);if(p.status==='Done')p.done=true;else p.done=false;save_render();}
function toggleDoneProject(pid,chk){const p=ws().projects.find(x=>x.id===pid);if(!p)return;p.done=chk.checked;p.status=chk.checked?'Done':'Waiting';save_render();}
function toggleCollapse(pid){const p=ws().projects.find(x=>x.id===pid);if(!p)return;p.collapsed=!p.collapsed;save_render();}
function moveProject(pid,dir){const projs=ws().projects;const idx=projs.findIndex(p=>p.id===pid);if(idx===-1)return;const ni=idx+dir;if(ni<0||ni>=projs.length)return;[projs[idx],projs[ni]]=[projs[ni],projs[idx]];save_render();}
function deleteProject(pid){data.ws[currentWS].projects=ws().projects.filter(p=>p.id!==pid);save_render();}
function updateSubName(pid,sid,el){const p=ws().projects.find(x=>x.id===pid);const s=p&&p.subtasks.find(x=>x.id===sid);if(s&&el.innerText.trim())s.name=el.innerText.trim();scheduleSync();}
function cycleSubStatus(pid,sid){const p=ws().projects.find(x=>x.id===pid);const s=p&&p.subtasks.find(x=>x.id===sid);if(!s)return;s.status=nextStatus(s.status);if(s.status==='Done')s.done=true;else s.done=false;save_render();}
function toggleDoneSub(pid,sid,chk){const p=ws().projects.find(x=>x.id===pid);const s=p&&p.subtasks.find(x=>x.id===sid);if(!s)return;s.done=chk.checked;s.status=chk.checked?'Done':'Waiting';save_render();}
function deleteSubtask(pid,sid){const p=ws().projects.find(x=>x.id===pid);if(p)p.subtasks=p.subtasks.filter(s=>s.id!==sid);save_render();}
function openColorPicker(pid,dotEl){
  document.querySelectorAll('.color-picker-pop').forEach(p=>p.remove());
  const proj=ws().projects.find(p=>p.id===pid);
  const pop=document.createElement('div');pop.className='color-picker-pop';
  PROJ_COLORS.forEach(c=>{
    const sw=document.createElement('div');sw.className='color-swatch'+(proj&&proj.color===c?' selected':'');sw.style.background=c;
    sw.onclick=e=>{e.stopPropagation();if(proj)proj.color=c;pop.remove();save_render();};pop.appendChild(sw);
  });
  dotEl.closest('.c-proj-name').appendChild(pop);
  setTimeout(()=>{const close=e=>{if(!pop.contains(e.target)){pop.remove();document.removeEventListener('click',close);}};document.addEventListener('click',close);},0);
}

// ══════════════════════════════════════════════════════════════════
//  ACTIONS — REFERENCE
// ══════════════════════════════════════════════════════════════════
function addRefItem(){ws().reference.push({id:uid(),item:'New Item',notes:''});save_render();setTimeout(()=>focusLast('referenceList'),50);}
function updateRef(id,field,el){const r=ws().reference.find(x=>x.id===id);if(r)r[field]=el.innerText;scheduleSync();}
function deleteRef(id){data.ws[currentWS].reference=ws().reference.filter(r=>r.id!==id);save_render();}

// ══════════════════════════════════════════════════════════════════
//  NAV / UTILS
// ══════════════════════════════════════════════════════════════════
function handleKeydown(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.target.blur();}}
function toggleDrawer(){document.body.classList.toggle('drawer-open');}
function closeDrawer(){document.body.classList.remove('drawer-open');}
function switchSection(id,el){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.drawer-item').forEach(d=>d.classList.remove('active'));
  document.getElementById('section-'+id).classList.add('active');
  if(el)el.classList.add('active');
  closeDrawer();
}
function selectAll(el){const r=document.createRange();r.selectNodeContents(el);const s=window.getSelection();s.removeAllRanges();s.addRange(r);}
function focusLast(listId){const list=document.getElementById(listId);const last=list.lastElementChild;const el=last&&last.querySelector('[contenteditable]');if(el){el.focus();selectAll(el);}}
function save_render(){runSchedule();scheduleSync();render();}
let _toastT=null;
function toast(msg){
  let el=document.getElementById('toast');
  if(!el){el=document.createElement('div');el.id='toast';document.body.appendChild(el);}
  el.textContent=msg;el.classList.add('show');clearTimeout(_toastT);_toastT=setTimeout(()=>el.classList.remove('show'),3800);
}

function exportData(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pro-tasks-backup.json';a.click();
}
function importData(){
  const input=document.createElement('input');input.type='file';input.accept='.json';
  input.onchange=e=>{
    const reader=new FileReader();
    reader.onload=()=>{try{const parsed=JSON.parse(reader.result);if(parsed&&parsed.ws&&parsed.wsNames){if(!confirm('Replace all current data with this backup?'))return;data=parsed;scheduleSync();updateWSButtons();render();}else alert('Invalid backup file.');}catch(e){alert('Invalid JSON.');}};
    reader.readAsText(e.target.files[0]);
  };input.click();
}

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════
async function initApp(){
  await loadLocal();
  updateWSButtons();
  render();
  await syncOnStartup();
}

function updateWSButtons(){
  document.getElementById('ws-btn-0').textContent=data.wsNames[0]||'Workspace 1';
  document.getElementById('ws-btn-1').textContent=data.wsNames[1]||'Workspace 2';
  document.getElementById('drawerWsLabel').innerText=data.wsNames[currentWS]||'Workspace 1';
}

window.onload=async()=>{
  try{buildKeypad('loginKeypad',loginDigit,loginDel);}catch(e){console.error('loginKeypad error:',e);}
  try{buildKeypad('setupKeypad',setupDigit,setupDel);}catch(e){console.error('setupKeypad error:',e);}
  const params=new URLSearchParams(window.location.search);
  const code=params.get('code'),oauthErr=params.get('error');
  if(oauthErr){
    window.history.replaceState({},document.title,window.location.pathname);
    showConnectScreen();showConnectErr('Dropbox connection was cancelled.');return;
  }
  if(code){
    try{
      await handleOAuthCallback(code);
      hideConnectScreen();
      if(isPinSetup()){setStep(0);document.getElementById('lockScreen').classList.remove('hidden');}
      else{goSetup();document.getElementById('lockScreen').classList.remove('hidden');}
    }catch(e){
      window.history.replaceState({},document.title,window.location.pathname);
      showConnectScreen();showConnectErr('Connection failed: '+e.message);
    }
    return;
  }
  if(!isConnected()){showConnectScreen();return;}
  if(!isPinSetup()){goSetup();}else{setStep(0);}
};
