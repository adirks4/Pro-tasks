'use strict';

// ══════════════════════════════════════════════════════════════════
//  PROJECT VIEW — full-screen detail for one project (Workspace 1)
//  Tabs: Overview (gates, workstreams, attention) · Tasks (scheduling table)
//  Right-hand panel: details for the selected task or gate.
// ══════════════════════════════════════════════════════════════════
const PV={pid:null,tab:'overview',sel:null,showDone:false,collapsed:{}};
const escAttr=s=>escHtml(s).replace(/"/g,'&quot;');
const NO_GROUP='No workstream';
const normGroup=s=>String(s||'').split(/\s*(?:›|>)\s*/).map(x=>x.trim()).filter(Boolean).join(' › ');
function pvProj(){return PV.pid?(data.ws[0].projects||[]).find(p=>p.id===PV.pid):null;}
const pvOpen=()=>{const o=document.getElementById('pvOverlay');return !!(o&&o.classList.contains('open'));};

function openProjectView(pid,taskId){
  if(currentWS!==0) return;
  ensurePVDom();
  PV.pid=pid;PV.sel=taskId||null;PV.tab=taskId?'tasks':(PV.pid===pid&&PV.tab)||'overview';
  const p=pvProj();
  if(p&&taskId){const t=findTask(p,taskId);if(t)PV.collapsed[p.id+'|'+(t.group||'')]=false;if(t&&t.done)PV.showDone=true;}
  document.getElementById('pvOverlay').classList.add('open');
  runSchedule();renderPV();
  if(taskId)setTimeout(()=>{const r=document.querySelector(`#pvMain [data-row="${taskId}"]`);if(r)r.scrollIntoView({block:'center'});},40);
}
function closeProjectView(){
  const o=document.getElementById('pvOverlay');if(o)o.classList.remove('open');
  PV.sel=null;
}

let _pvTimer=null;
function schedulePVRender(){if(!pvOpen())return;clearTimeout(_pvTimer);_pvTimer=setTimeout(renderPV,0);}

function ensurePVDom(){
  if(document.getElementById('pvOverlay')) return;
  const o=document.createElement('div');o.id='pvOverlay';
  o.innerHTML=`
    <div id="pvHeader">
      <span class="pv-dot" id="pvDot"></span>
      <div id="pvTitle"></div>
      <div class="pv-tabs" id="pvTabs">
        <button data-act="tab" data-tab="overview">Overview</button>
        <button data-act="tab" data-tab="tasks">Tasks</button>
      </div>
      <div class="pv-hdr-actions">
        <button class="hdr-btn" data-act="calendar" title="Workdays and holidays used for scheduling">📅 Holidays</button>
        <button class="hdr-btn" data-act="close">✕ Close</button>
      </div>
    </div>
    <div id="pvBody"><div id="pvMain"></div><aside id="pvSide"></aside></div>
    <datalist id="pvOwners"></datalist><datalist id="pvGroups"></datalist>`;
  document.body.appendChild(o);
  o.addEventListener('click',pvClick);
  // Date fields save when you leave them (Chrome fires "change" mid-typing, e.g. year 0002).
  o.addEventListener('change',e=>{
    const el=e.target;if(!el.dataset||!el.dataset.f||el.tagName==='DIV')return;
    if(el.type==='date'){el.dataset.dirty='1';return;}
    pvEdit(el.dataset.id,el.dataset.f,el.value,el);
  });
  o.addEventListener('focusout',e=>{
    const el=e.target;if(!el.dataset||!el.dataset.f)return;
    if(el.isContentEditable){pvEdit(el.dataset.id,el.dataset.f,el.innerText,el);return;}
    if(el.type==='date'&&el.dataset.dirty){
      delete el.dataset.dirty;
      const y=el.value?+el.value.slice(0,4):0;
      if(el.value&&(y<2000||y>2100)){toast('Check the year on that date.');return;}
      pvEdit(el.dataset.id,el.dataset.f,el.value,el);
    }
  });
  o.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&(e.target.isContentEditable||e.target.tagName==='INPUT')){e.preventDefault();e.target.blur();}
  });
  // Escape: close the side panel, then the project view (works wherever focus is)
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||!pvOpen())return;
    if(document.querySelector('.date-pop'))return;
    const cal=document.getElementById('calOverlay');if(cal&&cal.classList.contains('open')){cal.classList.remove('open');return;}
    e.preventDefault();
    if(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#pvOverlay'))document.activeElement.blur();
    if(PV.sel){PV.sel=null;renderPV();}else closeProjectView();
  });
}

// ── render ──
function renderPV(){
  if(!pvOpen()) return;
  const p=pvProj();if(!p){closeProjectView();return;}
  const ae=document.activeElement,fk=ae&&ae.dataset?ae.dataset.fk:null;
  const main=document.getElementById('pvMain'),scroll=main.scrollTop;
  const color=p.color||PROJ_COLORS[0];
  document.getElementById('pvDot').style.background=color;
  document.getElementById('pvTitle').textContent=p.name;
  document.querySelectorAll('#pvTabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===PV.tab));
  const owners=new Set();(data.ws[0].projects||[]).forEach(x=>(x.subtasks||[]).forEach(s=>{if(s.owner)owners.add(s.owner);}));
  document.getElementById('pvOwners').innerHTML=[...owners].sort().map(o=>`<option value="${escAttr(o)}">`).join('');
  document.getElementById('pvGroups').innerHTML=pvGroupNames(p).filter(Boolean).map(g=>`<option value="${escAttr(g)}">`).join('');
  main.innerHTML=PV.tab==='overview'?pvOverviewHTML(p):pvTasksHTML(p);
  main.scrollTop=scroll;
  const sel=PV.sel&&findTask(p,PV.sel);
  if(!sel)PV.sel=null;
  document.getElementById('pvBody').classList.toggle('with-side',!!sel);
  document.getElementById('pvSide').innerHTML=sel?pvSideHTML(p,sel):'';
  if(fk){
    const el=document.querySelector(`#pvOverlay [data-fk="${CSS.escape(fk)}"]`);
    if(el&&el!==document.activeElement){el.focus();if(el.isContentEditable){const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);}}
  }
}

function pvGroupNames(p){
  const seen=[];(p.subtasks||[]).forEach(t=>{const g=t.group||'';if(!seen.includes(g))seen.push(g);});
  return seen.filter(Boolean).concat(seen.includes('')?['']:[]);
}
const linksText=(p,t)=>(t.preds||[]).map(x=>{const pt=findTask(p,x.id);if(!pt)return '';const l=parseInt(x.lag)||0;return pt.num+(l>0?'+'+l:l<0?String(l):'');}).filter(Boolean).join(', ');
const needsDate=t=>!t.done&&(t.gate?!t.target:(!t.due&&t.status!=='Today'));

// ══ OVERVIEW ══
function pvOverviewHTML(p){
  const today=todayStr(),subs=p.subtasks||[];
  const open=subs.filter(t=>!t.done&&!t.gate);
  const overdue=open.filter(t=>t.due&&t.due<today);
  const undated=subs.filter(needsDate);
  const soon=open.filter(t=>t.due&&t.due>=today&&calDiff(t.due)<=14);
  const waiting=open.filter(t=>!isMine(t));
  const gates=subs.filter(t=>t.gate).sort((a,b)=>(a.due||'9999')<(b.due||'9999')?-1:1);
  const tile=(n,l,cls,act)=>`<div class="pv-stat ${cls||''}" ${act?`data-act="${act}"`:''}><div class="pv-stat-n">${n}</div><div class="pv-stat-l">${l}</div></div>`;
  let h=`<div class="pv-stats">
    ${tile(open.length,'Open tasks','','tab-tasks')}
    ${tile(overdue.length,'Overdue',overdue.length?'bad':'')}
    ${tile(undated.length,'Need a date',undated.length?'bad':'')}
    ${tile(soon.length,'Due next 14 days','')}
    ${tile(waiting.length,'Waiting on others','')}
  </div>`;
  // gate chain
  h+=`<div class="pv-sec-hdr"><span>Gates</span><button class="add-btn" data-act="add-gate">◆ Add gate</button></div>`;
  if(!gates.length){
    h+=`<div class="pv-empty">No gates yet. A gate is a milestone like <i>1st unit delivery</i>. Link the tasks that must be finished to it, and its color is worked out for you.</div>`;
  }else{
    h+='<div class="pv-gates">'+gates.map((g,i)=>{
      const st=gateStatus(p,g),pct=st.total?Math.round(st.met/st.total*100):0;
      return (i?'<div class="pv-gate-arrow">→</div>':'')+`
      <div class="pv-gate g-${st.color}${PV.sel===g.id?' sel':''}" data-act="select" data-id="${g.id}">
        <div class="pv-gate-top"><span class="pv-gate-dia">◆</span><span class="pv-gate-name">${escHtml(g.name)}</span></div>
        <div class="pv-gate-date">${g.target?'Target '+fmtShort(g.target):'<span class="txt-bad">No target date</span>'}${g.fc&&g.target&&g.fc>g.target?` · <b>Forecast ${fmtShort(g.fc)}</b>`:''}</div>
        <div class="pv-gate-pill">${escHtml(st.label)}</div>
        <div class="pv-gate-bar"><span style="width:${pct}%"></span></div>
        <div class="pv-gate-meta">${st.total?st.met+' of '+st.total+' linked tasks done':'No tasks linked yet'}</div>
      </div>`;}).join('')+'</div>';
  }
  // workstreams
  const groups=pvGroupNames(p).filter(g=>subs.some(t=>(t.group||'')===g&&!t.gate));
  h+=`<div class="pv-sec-hdr"><span>Workstreams</span><button class="add-btn" data-act="add-task">+ Add task</button></div>`;
  if(!groups.length){h+=`<div class="pv-empty">No tasks yet.</div>`;}
  else{
    h+='<div class="pv-ws">'+groups.map(g=>{
      const ts=subs.filter(t=>(t.group||'')===g&&!t.gate),done=ts.filter(t=>t.done).length;
      const od=ts.filter(t=>!t.done&&t.due&&t.due<today).length,nd=ts.filter(needsDate).length;
      const next=ts.filter(t=>!t.done&&t.due).sort(compareDue)[0];
      return `<div class="pv-ws-row" data-act="goto-group" data-group="${escAttr(g)}">
        <div class="pv-ws-name">${g?escHtml(g):'<i>'+NO_GROUP+'</i>'}</div>
        <div class="pv-ws-bar"><span style="width:${ts.length?Math.round(done/ts.length*100):0}%"></span></div>
        <div class="pv-ws-count">${done}/${ts.length}</div>
        <div class="pv-ws-next">${next?`#${next.num} ${escHtml(next.name)} · <span class="${dueClass(next.due)}-txt">${fmtShort(next.due)}</span>`:'—'}</div>
        <div class="pv-ws-flags">${od?`<span class="pv-flag bad">${od} overdue</span>`:''}${nd?`<span class="pv-flag bad">${nd} need date</span>`:''}</div>
      </div>`;}).join('')+'</div>';
  }
  // attention
  const att=[];
  gates.forEach(g=>{const st=gateStatus(p,g);if(st.color==='red'||st.color==='amber')att.push({t:g,cls:st.color==='red'?'bad':'warn',why:'Gate: '+st.reasons.join(' · ')});});
  overdue.forEach(t=>att.push({t,cls:'bad',why:'Overdue since '+fmtShort(t.due)}));
  undated.forEach(t=>att.push({t,cls:'bad',why:'Needs a date'}));
  open.filter(t=>(t.deferrals||0)>=3).forEach(t=>att.push({t,cls:'warn',why:'Deferred '+t.deferrals+' times'}));
  h+=`<div class="pv-sec-hdr"><span>Needs attention</span></div>`;
  h+=att.length?'<div class="pv-att">'+att.map(a=>`<div class="pv-att-row ${a.cls}" data-act="select" data-id="${a.t.id}">
      <span class="pv-num">${a.t.gate?'◆':'#'+a.t.num}</span><span class="pv-att-name">${escHtml(a.t.name)}</span><span class="pv-att-why">${escHtml(a.why)}</span></div>`).join('')+'</div>'
    :`<div class="pv-empty ok">Nothing overdue, undated or at risk.</div>`;
  return h;
}

// ══ TASKS TABLE ══
function pvTasksHTML(p){
  const subs=(p.subtasks||[]).filter(t=>PV.showDone||!t.done);
  const doneCount=(p.subtasks||[]).filter(t=>t.done).length;
  let h=`<div class="pv-toolbar">
    <button class="add-btn" data-act="add-task">+ Task</button>
    <button class="add-btn" data-act="add-gate">◆ Gate</button>
    <span class="pv-hint">Links: type task numbers, e.g. <code>3, 5+2</code> (5+2 = two workdays after #5 finishes).</span>
    <label class="pv-chk"><input type="checkbox" data-act="show-done" ${PV.showDone?'checked':''}> Show done (${doneCount})</label>
  </div>
  <div class="pv-table-wrap"><div class="pv-table">
    <div class="pv-tr pv-th"><div>#</div><div></div><div>Task</div><div>Owner</div><div>Start</div><div>Days</div><div>Finish</div><div>Links</div><div>Status</div><div></div></div>`;
  if(!(p.subtasks||[]).length) h+=`<div class="pv-empty">No tasks yet — add one above.</div>`;
  pvGroupNames(p).forEach(g=>{
    const all=(p.subtasks||[]).filter(t=>(t.group||'')===g);
    const ts=subs.filter(t=>(t.group||'')===g);
    if(!all.length) return;
    const key=p.id+'|'+g,col=!!PV.collapsed[key];
    const od=ts.filter(t=>!t.done&&t.due&&t.due<todayStr()).length;
    h+=`<div class="pv-group" data-group="${escAttr(g)}">
      <button class="pv-caret ${col?'col':''}" data-act="toggle-group" data-group="${escAttr(g)}">▼</button>
      ${g?`<div class="pv-group-name" contenteditable="true" data-f="groupname" data-id="${escAttr(g)}" data-fk="grp:${escAttr(g)}">${escHtml(g)}</div>`:`<div class="pv-group-name none">${NO_GROUP}</div>`}
      <span class="pv-group-count">${all.filter(t=>t.done).length}/${all.length} done${od?` · <span class="txt-bad">${od} overdue</span>`:''}</span>
      <button class="add-sub-btn" data-act="add-task" data-group="${escAttr(g)}">+ task</button>
    </div>`;
    if(!col) ts.forEach(t=>{h+=pvRowHTML(p,t);});
  });
  return h+'</div></div>';
}

function pvRowHTML(p,t){
  const today=todayStr(),linked=!!(t.preds&&t.preds.length);
  const overdue=!t.done&&t.due&&t.due<today,undated=needsDate(t);
  const cls=['pv-tr','pv-task'];
  if(t.done)cls.push('done');if(overdue)cls.push('overdue');if(undated)cls.push('undated');if(PV.sel===t.id)cls.push('sel');if(t.gate)cls.push('gate');
  const id=t.id,fk=f=>`data-id="${id}" data-f="${f}" data-fk="${id}:${f}"`;
  const defer=(t.deferrals||0)>0?`<span class="pv-defer" title="Pushed later ${t.deferrals} time${t.deferrals>1?'s':''}">↻${t.deferrals}</span>`:'';
  const owner=`<input class="pv-in" list="pvOwners" placeholder="Me" value="${escAttr(t.owner||'')}" ${fk('owner')}>`;
  let start,dur,finish,status;
  if(t.gate){
    const st=gateStatus(p,t);
    start=`<div class="pv-muted">—</div>`;
    dur=`<div class="pv-dia">◆</div>`;
    finish=`<input type="date" class="pv-in ${!t.target&&!t.done?'need':''}" value="${t.target||''}" ${fk('target')} title="Gate target date">`
      +(t.fc&&t.target&&t.fc>t.target&&!t.done?`<div class="pv-fc">forecast ${fmtShort(t.fc)}</div>`:'');
    status=`<span class="gate-pill g-${st.color}" data-act="select" data-id="${id}" title="${escAttr(st.reasons.join(' · '))}">${escHtml(st.label)}</span>`;
  }else{
    const pinned=linked&&t.start&&t.cs===nextWorkday(t.start);
    start=`<input type="date" class="pv-in ${linked?'linked':''}" value="${t.cs||''}" ${fk('start')} ${t.done?'disabled':''}
      title="${linked?(pinned?'Held by your “not before” date. Clear it to follow the links.':'Calculated from links. Picking a date sets “not before”.'):'Start date'}">`
      +(pinned?'<div class="pv-fc">not before</div>':'');
    dur=`<input type="number" min="1" step="1" class="pv-in num" value="${taskDur(t)}" ${fk('dur')} ${t.done?'disabled':''}>`;
    finish=`<input type="date" class="pv-in ${undated?'need':''} ${overdue?'late':''}" value="${t.due||''}" ${fk('finish')} ${t.done?'disabled':''}>`;
    status=`<span class="badge ${BADGE_CLS[t.status]||'badge-Waiting'}" data-act="cycle" data-id="${id}">${t.status}</span>`;
  }
  return `<div class="${cls.join(' ')}" data-row="${id}">
    <div class="pv-num" data-act="select" data-id="${id}">${t.num}</div>
    <div><span class="pv-check ${t.done?'on':''}" data-act="done" data-id="${id}"></span></div>
    <div class="pv-name-cell">${t.gate?'<span class="pv-dia sm">◆</span>':''}<div class="pv-name" contenteditable="true" data-ph="Task name" ${fk('name')}>${escHtml(t.name)}</div>${defer}${!isMine(t)&&!t.done?'<span class="pv-waiting" title="Owned by someone else — shows under Waiting in Control">waiting</span>':''}</div>
    <div>${owner}</div><div>${start}</div><div>${dur}</div><div>${finish}</div>
    <div><input class="pv-in" placeholder="—" value="${escAttr(linksText(p,t))}" ${fk('links')}></div>
    <div>${status}</div>
    <div><button class="pv-more" data-act="select" data-id="${id}" title="Details">⋯</button></div>
  </div>`;
}

// ══ SIDE PANEL ══
function pvSideHTML(p,t){
  const id=t.id,fk=f=>`data-id="${id}" data-f="${f}" data-fk="side:${id}:${f}"`,linked=!!(t.preds&&t.preds.length);
  const succ=(p.subtasks||[]).filter(s=>(s.preds||[]).some(x=>x.id===id));
  let h=`<div class="pv-side-hdr"><span class="pv-num">${t.gate?'◆ Gate':'#'+t.num}</span>
      <button class="pv-x" data-act="close-side" title="Close (Esc)">✕</button></div>
    <div class="pv-field"><label>Name</label><input class="form-input" value="${escAttr(t.name)}" ${fk('name')}></div>
    <div class="pv-2col">
      <div class="pv-field"><label>Type</label><select class="form-select" ${fk('type')}><option value="task" ${t.gate?'':'selected'}>Task</option><option value="gate" ${t.gate?'selected':''}>Gate (milestone)</option></select></div>
      <div class="pv-field"><label>Owner</label><input class="form-input" list="pvOwners" placeholder="Me" value="${escAttr(t.owner||'')}" ${fk('owner')}></div>
    </div>
    <div class="pv-field"><label>Workstream</label><input class="form-input" list="pvGroups" placeholder="e.g. Launch › In-House Test Unit" value="${escAttr(t.group||'')}" ${fk('group')}></div>`;
  if(t.gate){
    const st=gateStatus(p,t);
    h+=`<div class="pv-field"><label>Target date</label><input type="date" class="form-input" value="${t.target||''}" ${fk('target')}></div>
      <div class="pv-gate-box g-${st.color}"><div class="pv-gate-pill">${escHtml(st.label)}</div>
        ${t.fc?`<div class="pv-small">Forecast: linked tasks finish ${fmtShort(t.fc)}</div>`:''}
        ${st.reasons.length?'<ul>'+st.reasons.map(r=>`<li>${escHtml(r)}</li>`).join('')+'</ul>':''}</div>
`;
  }else{
    h+=`<div class="pv-3col">
      <div class="pv-field"><label>${linked?'Not before':'Start'}</label><input type="date" class="form-input" value="${linked?(t.start||''):(t.cs||'')}" ${fk('start')}></div>
      <div class="pv-field"><label>Workdays</label><input type="number" min="1" class="form-input" value="${taskDur(t)}" ${fk('dur')}></div>
      <div class="pv-field"><label>Finish</label><input type="date" class="form-input" value="${t.due||''}" ${fk('finish')}></div>
    </div>
    ${linked?`<div class="pv-small">Starts ${t.cs?fmtShort(t.cs):'when its linked tasks have dates'}, after the tasks below.${t.start?' Your “not before” date is also applied.':''}</div>`:''}`;
  }
  // links
  const cands=(p.subtasks||[]).filter(x=>x.id!==id&&!(t.preds||[]).some(y=>y.id===x.id)&&canLink(p,id,x.id));
  const met=(t.preds||[]).filter(x=>{const pt=findTask(p,x.id);return pt&&pt.done;}).length;
  h+=`<div class="pv-field"><label>${t.gate?'Criteria — tasks that must be done ('+met+'/'+(t.preds||[]).length+')':'Must finish first'}</label>
    <div class="pv-links">${(t.preds||[]).map(x=>{const pt=findTask(p,x.id);if(!pt)return '';return `<div class="pv-link-row">
      <span class="pv-check sm ${pt.done?'on':''}" data-act="done" data-id="${pt.id}" title="Mark done"></span>
      <span class="pv-num" data-act="select" data-id="${pt.id}">${pt.gate?'◆':'#'+pt.num}</span><span class="pv-link-name" data-act="select" data-id="${pt.id}">${escHtml(pt.name)}</span>
      <span class="due-chip ${pt.done?'no-date':dueClass(pt.due)}">${pt.done?'done':pt.due?fmtShort(pt.due):'no date'}</span>
      <span class="pv-small">+</span><input type="number" class="pv-in num" value="${parseInt(x.lag)||0}" data-id="${id}" data-f="lag" data-pred="${pt.id}" title="Workdays to wait after it finishes"><span class="pv-small">d</span>
      <button class="pv-x" data-act="rm-pred" data-id="${id}" data-pred="${pt.id}" title="Remove link">✕</button></div>`;}).join('')||(t.gate?'<div class="pv-small">Link the tasks that must be done before this gate.</div>':'<div class="pv-small">Nothing — this task is scheduled by its own dates.</div>')}</div>
    ${cands.length?`<div class="pv-link-add"><select class="form-select" id="pvPredSel"><option value="">Add a task…</option>${cands.map(c=>`<option value="${c.id}">${c.gate?'◆':'#'+c.num} ${escHtml(c.name)}</option>`).join('')}</select>
      <button class="btn" data-act="add-pred" data-id="${id}">Link</button></div>`:''}
  </div>`;
  if(succ.length) h+=`<div class="pv-field"><label>Followed by</label><div class="pv-links">${succ.map(s=>`<div class="pv-link-row" data-act="select" data-id="${s.id}"><span class="pv-num">${s.gate?'◆':'#'+s.num}</span><span class="pv-link-name">${escHtml(s.name)}</span><span class="due-chip ${dueClass(s.due)}">${s.due?fmtShort(s.due):'no date'}</span></div>`).join('')}</div></div>`;
  h+=`<div class="pv-field"><label>Notes</label><textarea class="form-input pv-notes" ${fk('notes')} placeholder="Notes…">${escHtml(t.notes||'')}</textarea></div>`;
  if(t.deferrals) h+=`<div class="pv-small">↻ Pushed later ${t.deferrals} time${t.deferrals>1?'s':''}. <a href="#" data-act="reset-defer" data-id="${id}">Reset</a></div>`;
  h+=`<div class="pv-side-actions">
      <button class="btn" data-act="done" data-id="${id}">${t.done?'Mark not done':(t.gate?'Mark gate passed':'Mark done')}</button>
      <button class="btn" data-act="move" data-dir="-1" data-id="${id}" title="Move up">▲</button>
      <button class="btn" data-act="move" data-dir="1" data-id="${id}" title="Move down">▼</button>
      <button class="btn danger" data-act="delete" data-id="${id}">Delete</button></div>`;
  return h;
}

// ══ EVENTS ══
function pvClick(e){
  const el=e.target.closest('[data-act]');if(!el) return;
  const act=el.dataset.act,id=el.dataset.id,p=pvProj();if(!p) return;
  if(el.tagName==='A') e.preventDefault();
  const t=id&&findTask(p,id);
  switch(act){
    case 'tab': PV.tab=el.dataset.tab;renderPV();return;
    case 'tab-tasks': PV.tab='tasks';renderPV();return;
    case 'close': closeProjectView();return;
    case 'calendar': openCalendarModal();return;
    case 'close-side': PV.sel=null;renderPV();return;
    case 'select':
      if(e.target.closest('input,[contenteditable="true"],.pv-check'))return;
      PV.sel=id;renderPV();return;
    case 'show-done': PV.showDone=el.checked;renderPV();return;
    case 'toggle-group': {const k=p.id+'|'+el.dataset.group;PV.collapsed[k]=!PV.collapsed[k];renderPV();return;}
    case 'goto-group': PV.tab='tasks';PV.collapsed[p.id+'|'+el.dataset.group]=false;renderPV();
      setTimeout(()=>{const g=[...document.querySelectorAll('#pvMain .pv-group')].find(x=>x.dataset.group===el.dataset.group);if(g)g.scrollIntoView({block:'start'});},30);return;
    case 'add-task': pvAddTask(false,el.dataset.group);return;
    case 'add-gate': pvAddTask(true);return;
    case 'done': if(!t)return;
      if(t.gate&&!t.done){const st=gateStatus(p,t);if(st.color!=='green'&&!confirm('Not all linked tasks are done ('+st.met+'/'+st.total+'). Mark this gate passed anyway?'))return;}
      t.done=!t.done;t.status=t.done?'Done':(t.gate?'Next':'Waiting');pvCommit();return;
    case 'cycle': if(!t)return;t.status=nextStatus(t.status);t.done=t.status==='Done';pvCommit();return;
    case 'rm-pred': if(!t)return;t.preds=(t.preds||[]).filter(x=>x.id!==el.dataset.pred);pvCommit();return;
    case 'add-pred': {const v=document.getElementById('pvPredSel').value;if(!v||!t)return;
      if(!canLink(p,t.id,v)){toast('That link would create a loop.');return;}
      const wasLinked=!!(t.preds&&t.preds.length);t.preds=(t.preds||[]).concat([{id:v,lag:0}]);if(!wasLinked&&!t.gate)t.start=null;pvCommit();return;}
    case 'reset-defer': if(t){delete t.deferrals;pvCommit();}return;
    case 'move': pvMove(p,t,parseInt(el.dataset.dir));return;
    case 'delete': if(!t||!confirm('Delete "'+t.name+'"?'))return;
      p.subtasks=p.subtasks.filter(s=>s.id!==t.id);PV.sel=null;pvCommit();return;
  }
}

function pvCommit(msg){runSchedule();scheduleSync();render();if(msg)toast(msg);}

function pvEdit(id,f,val,el){
  const p=pvProj();if(!p) return;
  if(f==='groupname'){                              // rename a whole workstream
    const nv=normGroup(val);if(!nv||nv===id){if(!nv)el.innerText=id;return;}
    const k=p.id+'|'+id;PV.collapsed[p.id+'|'+nv]=PV.collapsed[k];
    p.subtasks.forEach(s=>{if((s.group||'')===id)s.group=nv;});pvCommit();return;
  }
  const t=findTask(p,id);if(!t) return;
  let msg=null;const linked=!!(t.preds&&t.preds.length);
  switch(f){
    case 'name': {const v=String(val).trim();if(!v){if(el.isContentEditable)el.innerText=t.name;else el.value=t.name;return;}if(v===t.name)return;t.name=v;break;}
    case 'owner': {const v=String(val).trim();t.owner=/^me$/i.test(v)?'':v;break;}
    case 'group': t.group=normGroup(val);PV.collapsed[p.id+'|'+t.group]=false;break;
    case 'notes': t.notes=val;break;
    case 'type':
      if(val==='gate'&&!t.gate){t.gate=true;t.target=t.due||null;t.start=null;delete t.dur;}
      else if(val==='task'&&t.gate){delete t.gate;if(t.target)t.start=t.target;delete t.target;delete t.fc;}
      break;
    case 'start':
      if(t.gate) return;
      if(!val){t.start=null;}
      else{t.start=val;if(!isWorkday(val))msg='That’s not a workday — starts '+fmtShort(nextWorkday(val))+'.';}
      break;
    case 'dur': {const n=Math.max(1,parseInt(val)||1);if(!t.start&&!linked&&t.cs)t.start=t.cs;t.dur=n;break;}
    case 'finish': msg=pvSetFinish(p,t,val);break;
    case 'target':
      if(!val){t.target=null;break;}
      if(t.target&&val>t.target)t.deferrals=(t.deferrals||0)+1;
      t.target=val;break;
    case 'links': msg=pvSetLinks(p,t,val);break;
    case 'lag': {const x=(t.preds||[]).find(y=>y.id===el.dataset.pred);if(x)x.lag=parseInt(val)||0;break;}
    default: return;
  }
  pvCommit(msg);
}

function pvSetFinish(p,t,val){
  const linked=!!(t.preds&&t.preds.length);
  if(!val){
    if(linked) return 'This task gets its dates from its links.';
    t.due=null;t.start=null;return null;
  }
  if(!t.cs) return setTaskDue(t,val,p);               // first date for an undated task
  if(val<t.cs) return 'Finish can’t be before the start ('+fmtShort(t.cs)+').';
  if(t.due&&val>t.due) t.deferrals=(t.deferrals||0)+1;
  if(!t.start&&!linked) t.start=t.cs;
  t.dur=Math.max(1,workdaysBetween(t.cs,val));
  return isWorkday(val)?null:'That’s not a workday — finishes '+fmtShort(prevWorkday(val))+'.';
}

function pvSetLinks(p,t,val){
  const toks=String(val).split(/[,;]+/).map(s=>s.replace(/\s+/g,'')).filter(Boolean),out=[];
  for(const tok of toks){
    const m=tok.match(/^#?(\d+)(?:([+-])(\d+)d?)?$/i);
    if(!m) return 'Couldn’t read “'+tok+'”. Use task numbers, e.g. 3, 5+2';
    const pt=(p.subtasks||[]).find(s=>s.num===+m[1]);
    if(!pt) return 'There is no task #'+m[1]+' in this project.';
    if(pt.id===t.id) return 'A task can’t follow itself.';
    if(!out.some(x=>x.id===pt.id)) out.push({id:pt.id,lag:m[2]?(m[2]==='-'?-1:1)*parseInt(m[3]):0});
  }
  const old=t.preds,wasLinked=!!(old&&old.length);
  t.preds=[];
  for(const x of out){
    if(!canLink(p,t.id,x.id)){t.preds=old;return 'Linking #'+findTask(p,x.id).num+' would create a loop — it already waits on this task.';}
    t.preds.push(x);
  }
  if(!t.preds.length) delete t.preds;
  else if(!wasLinked&&!t.gate) t.start=null;          // its old start date would otherwise hold it back
  return null;
}

function pvAddTask(gate,group){
  const p=pvProj();if(!p) return;
  const sel=PV.sel&&findTask(p,PV.sel);
  const t={id:uid(),name:gate?'New gate':'New task',status:'Next',done:false,due:null};
  if(gate){t.gate=true;t.target=null;}
  t.group=group!==undefined?group:(sel&&!gate?sel.group||'':'');
  let idx=p.subtasks.length;
  if(group!==undefined){for(let i=p.subtasks.length-1;i>=0;i--)if((p.subtasks[i].group||'')===group){idx=i+1;break;}}
  else if(sel&&!gate) idx=p.subtasks.indexOf(sel)+1;
  p.subtasks.splice(idx,0,t);
  PV.collapsed[p.id+'|'+t.group]=false;PV.sel=t.id;PV.tab='tasks';
  pvCommit();
  setTimeout(()=>{const el=document.querySelector(`#pvMain [data-fk="${t.id}:name"]`);if(el){el.scrollIntoView({block:'center'});el.focus();selectAll(el);}},40);
}

function pvMove(p,t,dir){
  if(!t) return;
  const arr=p.subtasks,i=arr.indexOf(t),g=t.group||'';
  let j=i+dir;while(j>=0&&j<arr.length&&(arr[j].group||'')!==g)j+=dir;
  if(j<0||j>=arr.length) return;
  [arr[i],arr[j]]=[arr[j],arr[i]];pvCommit();
}

// ══ HOLIDAYS ══
function openCalendarModal(){
  let o=document.getElementById('calOverlay');
  if(!o){
    o=document.createElement('div');o.id='calOverlay';o.className='modal-overlay';
    o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');});
    document.body.appendChild(o);
  }
  renderCalendarModal();o.classList.add('open');
}
function renderCalendarModal(){
  const o=document.getElementById('calOverlay');if(!o) return;
  const hs=getCalendar().holidays.slice().sort((a,b)=>a.date<b.date?-1:1);
  o.innerHTML=`<div class="modal cal-modal"><h3>📅 Workdays & holidays</h3>
    <div class="s-desc">Durations and links count workdays only. Weekends are always skipped, and so are the dates below.</div>
    <div class="cal-list">${hs.map(h=>`<div class="cal-row"><span class="cal-date">${_pd(h.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</span>
      <span class="cal-name">${escHtml(h.name||'')}</span><button class="del-btn" onclick="removeHoliday('${h.date}')">✕</button></div>`).join('')||'<div class="pv-small">No holidays.</div>'}</div>
    <div class="cal-add"><input type="date" id="calNewDate" class="form-input"><input id="calNewName" class="form-input" placeholder="Name (optional)"><button class="btn primary" onclick="addHoliday()">Add</button></div>
    <div class="btn-row"><button class="btn" onclick="document.getElementById('calOverlay').classList.remove('open')">Done</button></div></div>`;
}
function addHoliday(){
  const d=document.getElementById('calNewDate').value;if(!d)return;
  const name=document.getElementById('calNewName').value.trim();
  const c=getCalendar();if(!c.holidays.some(h=>h.date===d))c.holidays.push({date:d,name});
  pvCommit();renderCalendarModal();
}
function removeHoliday(d){const c=getCalendar();c.holidays=c.holidays.filter(h=>h.date!==d);pvCommit();renderCalendarModal();}
