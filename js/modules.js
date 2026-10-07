'use strict';

// ══════════════════════════════════════════════════════════════════
//  PHASE 4 MODULES — Inventory · Units · Issues & tests
//  Opt-in per project (⚙ in the project view header). A module with data
//  shows automatically; hiding a tab keeps its data.
// ══════════════════════════════════════════════════════════════════
const PV_MODULES=[
  {k:'checks',tab:'checks',label:'Checks'},
  {k:'inventory',tab:'inventory',label:'Inventory',keys:['stock']},
  {k:'units',tab:'units',label:'Units',keys:['units']},
  {k:'issues',tab:'issues',label:'Issues & tests',keys:['issues','tests']},
];
Object.assign(PV,{modMenu:false,stForm:null,unForm:false,showClosed:false});
const STOCK_SUGG=[['Consumables','Probes'],['Consumables','Probe boxes'],['Consumables','6-Pack boxes']];

function modOn(p,k){
  const m=p.modules||{};if(k in m) return !!m[k];
  if(k==='checks') return true;
  const def=PV_MODULES.find(x=>x.k===k);return !!(def&&def.keys.some(x=>(p[x]||[]).length));
}
function pvTabsHTML(p){
  const tabs=[['overview','Overview'],['tasks','Tasks'],['timeline','Timeline']].concat(PV_MODULES.filter(m=>modOn(p,m.k)).map(m=>[m.tab,m.label]));
  if(!tabs.some(([t])=>t===PV.tab)) PV.tab='overview';
  return tabs.map(([t,l])=>`<button data-act="tab" data-tab="${t}" class="${PV.tab===t?'active':''}">${l}</button>`).join('')
    +`<button class="pv-gear" data-act="mod-menu" title="Choose which tabs this project uses">⚙</button>`
    +(PV.modMenu?`<div class="pv-modmenu"><div class="pv-small">Tabs for this project</div>${PV_MODULES.map(m=>`<label class="pv-chk"><input type="checkbox" data-act="mod-toggle" data-k="${m.k}" ${modOn(p,m.k)?'checked':''}> ${m.label}</label>`).join('')}
      <div class="pv-small">Hiding a tab keeps its data.</div></div>`:'');
}
const light=(c,t)=>`<span class="ck-light c-${c}" title="${escAttr(t||'')}"></span>`;
const opts=(arr,v)=>arr.map(x=>`<option ${x===v?'selected':''}>${escHtml(x)}</option>`).join('');
const fkf=(id,f)=>`data-id="${id}" data-f="${f}" data-fk="${id}:${f}"`;
const sfk=(id,f)=>`data-id="${id}" data-f="${f}" data-fk="side:${id}:${f}"`;
const unitLabel=(p,id)=>{const u=id&&findIn(p,'units',id);return u?u.serial:'';};
const gateOpts=(p,v)=>`<option value="">—</option>`+(p.subtasks||[]).filter(t=>t.gate).map(g=>`<option value="${g.id}" ${g.id===v?'selected':''}>◆ ${escHtml(g.name)}</option>`).join('');
const unitOpts=(p,v)=>`<option value="">—</option>`+(p.units||[]).map(u=>`<option value="${u.id}" ${u.id===v?'selected':''}>${escHtml(u.serial)}</option>`).join('');

// ══ INVENTORY ══
function pvInventoryHTML(p){
  const items=listOf(p,'stock'),have=new Set(items.map(s=>s.name.toLowerCase()));
  const sugg=STOCK_SUGG.filter(([,n])=>!have.has(n.toLowerCase()));
  const cnt={red:0,amber:0,green:0};items.forEach(s=>cnt[stockStatus(s).color]++);
  let h=`<div class="pv-toolbar"><button class="add-btn" data-act="st-add">+ Item</button>
    ${sugg.map(([c,n])=>`<button class="qd-btn" data-act="st-add" data-name="${escAttr(n)}" data-cat="${escAttr(c)}">+ ${escHtml(n)}</button>`).join('')}
    ${items.length?`<div class="ck-summary"><span class="ck-sum c-red">${cnt.red} low</span><span class="ck-sum c-amber">${cnt.amber} watch</span><span class="ck-sum c-green">${cnt.green} OK</span></div>`:''}</div>`;
  if(!items.length) return h+`<div class="pv-empty"><b>No stock items yet.</b> Track consumables like probes and boxes: on-hand count, minimum, what's on order. When an item drops to its minimum and nothing is on order, a “Reorder” task is added to today's list in Control.</div>`;
  return h+'<div class="st-grid">'+items.map(s=>stCardHTML(p,s)).join('')+'</div>';
}
function stCardHTML(p,s){
  const st=stockStatus(s),q=+s.onHand||0,m=+s.min||0,scale=Math.max(m*2,q,1);
  const task=(p.subtasks||[]).find(t=>t.stockId===s.id&&!t.done);
  const last=(s.log||[]).slice(-1)[0];
  const f=PV.stForm&&PV.stForm.id===s.id?PV.stForm.kind:null;
  const formLbl={use:'Used',receive:'Received',count:'Counted (actual on hand)',order:'Ordered'}[f];
  const defQty=f==='receive'?(s.onOrder||''):f==='count'?q:f==='order'?Math.max(m*2-q,m||1):'';
  return `<div class="st-card g-${st.color} ${PV.sel===s.id?'sel':''}">
    <div class="st-top">${light(st.color,st.label)}<span class="st-name" data-act="select" data-id="${s.id}">${escHtml(s.name)}</span>
      <span class="ck-lbl c-${st.color}">${escHtml(st.label)}</span><button class="pv-more" data-act="select" data-id="${s.id}" title="Details">⋯</button></div>
    <div class="st-qty"><b>${q}</b> ${escHtml(s.unit||'pcs')} on hand<span>min ${m||'—'}</span></div>
    <div class="st-bar"><span class="c-${st.color}" style="width:${Math.min(100,q/scale*100)}%"></span>${m?`<i style="left:${m/scale*100}%" title="Minimum ${m}"></i>`:''}</div>
    <div class="st-meta">
      ${s.onOrder?`<div>📦 On order: <b>${s.onOrder}</b>${s.orderDue?' · due '+fmtShort(s.orderDue)+(s.orderDue<todayStr()?' <span class="txt-bad">(late)</span>':''):''}</div>`:''}
      ${s.perUnit?`<div>Covers about <b>${Math.floor(q/s.perUnit)}</b> more unit${Math.floor(q/s.perUnit)===1?'':'s'} (${s.perUnit} per unit)</div>`:''}
      ${task?`<div class="txt-bad" data-act="select" data-id="${task.id}" style="cursor:pointer">Reorder task open · due ${fmtShort(task.due)}</div>`:''}
      ${last?`<div class="pv-small" style="margin:0">Last: ${fmtShort(last.d)} · ${last.delta>0?'+':''}${last.delta||''} ${escHtml(last.note||'')}</div>`:''}
    </div>
    ${f?`<div class="st-form"><div class="pv-small" style="margin:0">${formLbl}</div>
        <div class="st-form-row"><input type="number" min="0" class="form-input" id="stQty" value="${defQty}" data-enter="st-save">
        ${f==='order'?`<input type="date" class="form-input" id="stDue" title="Expected delivery">`:`<input class="form-input" id="stNote" placeholder="Note (optional)" data-enter="st-save">`}</div>
        <div class="st-form-row"><button class="btn primary" data-act="st-save" data-id="${s.id}">Save</button><button class="btn" data-act="st-cancel">Cancel</button></div></div>`
      :`<div class="st-actions"><button class="qd-btn" data-act="st-form" data-kind="use" data-id="${s.id}">− Use</button>
        <button class="qd-btn" data-act="st-form" data-kind="receive" data-id="${s.id}">+ Receive</button>
        <button class="qd-btn" data-act="st-form" data-kind="count" data-id="${s.id}">Count</button>
        <button class="qd-btn" data-act="st-form" data-kind="order" data-id="${s.id}">${s.onOrder?'Change order':'Order'}</button></div>`}
  </div>`;
}
function stSideHTML(p,s){
  const st=stockStatus(s),id=s.id;
  return `<div class="pv-side-hdr"><span class="pv-num">📦 Stock item</span><button class="pv-x" data-act="close-side">✕</button></div>
    <div class="pv-gate-box g-${st.color}"><div class="pv-gate-pill">${escHtml(st.label)}</div><div class="pv-small">${+s.onHand||0} ${escHtml(s.unit||'pcs')} on hand · minimum ${s.min||'—'}</div></div>
    <div class="pv-field"><label>Name</label><input class="form-input" value="${escAttr(s.name)}" ${sfk(id,'st-name')}></div>
    <div class="pv-2col"><div class="pv-field"><label>Category</label><input class="form-input" value="${escAttr(s.cat||'')}" placeholder="e.g. Consumables" ${sfk(id,'st-cat')}></div>
      <div class="pv-field"><label>Counted in</label><input class="form-input" value="${escAttr(s.unit||'')}" placeholder="pcs" ${sfk(id,'st-unit')}></div></div>
    <div class="pv-3col"><div class="pv-field"><label>Minimum</label><input type="number" min="0" class="form-input" value="${s.min||''}" ${sfk(id,'st-min')}></div>
      <div class="pv-field"><label>Per unit</label><input type="number" min="0" class="form-input" value="${s.perUnit||''}" placeholder="—" ${sfk(id,'st-perUnit')}></div>
      <div class="pv-field"><label>Lead days</label><input type="number" min="0" class="form-input" value="${s.leadDays||''}" placeholder="—" ${sfk(id,'st-leadDays')}></div></div>
    <div class="pv-2col"><div class="pv-field"><label>On order</label><input type="number" min="0" class="form-input" value="${s.onOrder||''}" placeholder="0" ${sfk(id,'st-onOrder')}></div>
      <div class="pv-field"><label>Expected</label><input type="date" class="form-input" value="${s.orderDue||''}" ${sfk(id,'st-orderDue')}></div></div>
    <div class="pv-field"><label>Location</label><input class="form-input" value="${escAttr(s.loc||'')}" placeholder="e.g. Cabinet B" ${sfk(id,'st-loc')}></div>
    <div class="pv-field"><label>Notes</label><textarea class="form-input pv-notes" ${sfk(id,'st-notes')}>${escHtml(s.notes||'')}</textarea></div>
    ${(s.log||[]).length?`<div class="pv-field"><label>History</label><div class="ck-hist">${s.log.slice(-15).reverse().map(x=>`<div><span>${fmtShort(x.d)}</span>${x.delta>0?'+':''}${x.delta||0} → ${x.qty} ${escHtml(x.note||'')}</div>`).join('')}</div></div>`:''}
    <div class="pv-side-actions"><button class="btn" data-act="st-form" data-kind="count" data-id="${id}">Count</button><button class="btn danger" data-act="st-del" data-id="${id}">Delete</button></div>`;
}

// ══ UNITS ══
function pvUnitsHTML(p){
  const units=listOf(p,'units');
  const byStatus={};units.forEach(u=>{byStatus[u.status||'Planned']=(byStatus[u.status||'Planned']||0)+1;});
  let h=`<div class="pv-toolbar"><button class="add-btn" data-act="un-add">+ Unit</button><button class="add-btn" data-act="un-batch-form">+ Add a batch…</button>
    ${units.length?`<div class="ck-summary">${UNIT_STATUSES.filter(s=>byStatus[s]).map(s=>`<span class="ck-sum">${byStatus[s]} ${s.toLowerCase()}</span>`).join('')}</div>`:''}</div>`;
  if(PV.unForm) h+=`<div class="un-form"><div class="pv-field"><label>Batch name</label><input class="form-input" id="unB" placeholder="e.g. First 8 units"></div>
    <div class="pv-field"><label>Serial prefix</label><input class="form-input" id="unP" placeholder="e.g. LSI-" value="SN-"></div>
    <div class="pv-field"><label>First number</label><input type="number" class="form-input" id="unS" value="${units.length+1}"></div>
    <div class="pv-field"><label>How many</label><input type="number" class="form-input" id="unN" value="8"></div>
    <div class="pv-field"><label>Model</label><input class="form-input" id="unM" placeholder="e.g. V1"></div>
    <div class="un-form-btns"><button class="btn primary" data-act="un-batch">Create</button><button class="btn" data-act="un-batch-cancel">Cancel</button></div></div>`;
  if(!units.length&&!PV.unForm) return h+`<div class="pv-empty"><b>No units yet.</b> One row per serial number: build status, customer/site, ship date, license and firmware. Use “Add a batch” to create e.g. the first 8 units at once.</div>`;
  h+=`<div class="pv-table-wrap"><div class="pv-table un-table"><div class="un-tr pv-th"><div></div><div>Serial</div><div>Model</div><div>Status</div><div>Customer / site</div><div>Shipped</div><div>License key</div><div>Expires</div><div>Firmware</div><div>Issues</div><div></div></div>`;
  const batches=[];units.forEach(u=>{const b=u.batch||'';if(!batches.includes(b))batches.push(b);});
  batches.sort((a,b)=>!a?1:!b?-1:0).forEach(b=>{
    const us=units.filter(u=>(u.batch||'')===b),key=p.id+'|un|'+b,col=!!PV.collapsed[key];
    h+=`<div class="pv-group"><button class="pv-caret ${col?'col':''}" data-act="un-toggle" data-b="${escAttr(b)}">▼</button><div class="pv-group-name ${b?'':'none'}">${b?escHtml(b):'No batch'}</div>
      <span class="pv-group-count">${us.filter(u=>['Shipped','Installed'].includes(u.status)).length}/${us.length} shipped</span></div>`;
    if(!col) us.forEach(u=>{h+=unRowHTML(p,u);});
  });
  return h+'</div></div>';
}
function unRowHTML(p,u){
  const lic=licenseStatus(u),id=u.id;
  const iss=(p.issues||[]).filter(i=>i.unit===id&&issueOpen(i)).length;
  const tests=(p.tests||[]).filter(t=>t.unit===id),pass=tests.filter(t=>t.status==='Pass').length,fail=tests.filter(t=>t.status==='Fail').length;
  const col=lic&&lic.color!=='green'?lic.color:iss||fail?'amber':['Shipped','Installed'].includes(u.status)?'green':'gray';
  return `<div class="un-tr pv-task ${PV.sel===id?'sel':''}" data-row="${id}">
    <div class="ck-c">${light(col,lic?lic.label:u.status)}</div>
    <div><input class="pv-in strong" value="${escAttr(u.serial)}" ${fkf(id,'un-serial')}></div>
    <div><input class="pv-in" value="${escAttr(u.model||'')}" placeholder="—" ${fkf(id,'un-model')}></div>
    <div><select class="pv-in un-st s-${(u.status||'Planned').toLowerCase()}" ${fkf(id,'un-status')}>${opts(UNIT_STATUSES,u.status||'Planned')}</select></div>
    <div><input class="pv-in" value="${escAttr(u.customer||'')}" placeholder="—" ${fkf(id,'un-customer')}></div>
    <div><input type="date" class="pv-in" value="${u.shipDate||''}" ${fkf(id,'un-shipDate')}></div>
    <div><input class="pv-in mono" value="${escAttr(u.lic||'')}" placeholder="—" ${fkf(id,'un-lic')}></div>
    <div><input type="date" class="pv-in ${lic&&lic.color==='red'?'late':''}" value="${u.licExp||''}" ${fkf(id,'un-licExp')} title="${escAttr(lic?lic.label:'')}"></div>
    <div><input class="pv-in" value="${escAttr(u.fw||'')}" placeholder="—" ${fkf(id,'un-fw')}></div>
    <div>${iss?`<span class="pv-flag bad">${iss} open</span>`:''}${tests.length?`<span class="un-tests ${fail?'bad':''}">${pass}/${tests.length} pass</span>`:''}</div>
    <div><button class="pv-more" data-act="select" data-id="${id}" title="Details">⋯</button></div></div>`;
}
function unSideHTML(p,u){
  const id=u.id,lic=licenseStatus(u),iss=(p.issues||[]).filter(i=>i.unit===id),tests=(p.tests||[]).filter(t=>t.unit===id);
  return `<div class="pv-side-hdr"><span class="pv-num">🔧 Unit ${escHtml(u.serial)}</span><button class="pv-x" data-act="close-side">✕</button></div>
    ${lic?`<div class="pv-gate-box g-${lic.color}"><div class="pv-gate-pill">${escHtml(lic.label)}</div></div>`:''}
    <div class="pv-2col"><div class="pv-field"><label>Serial</label><input class="form-input" value="${escAttr(u.serial)}" ${sfk(id,'un-serial')}></div>
      <div class="pv-field"><label>Status</label><select class="form-select" ${sfk(id,'un-status')}>${opts(UNIT_STATUSES,u.status||'Planned')}</select></div></div>
    <div class="pv-2col"><div class="pv-field"><label>Batch</label><input class="form-input" value="${escAttr(u.batch||'')}" ${sfk(id,'un-batch')}></div>
      <div class="pv-field"><label>Model</label><input class="form-input" value="${escAttr(u.model||'')}" ${sfk(id,'un-model')}></div></div>
    <div class="pv-field"><label>Customer / site</label><input class="form-input" value="${escAttr(u.customer||'')}" ${sfk(id,'un-customer')}></div>
    <div class="pv-2col"><div class="pv-field"><label>Ship date</label><input type="date" class="form-input" value="${u.shipDate||''}" ${sfk(id,'un-shipDate')}></div>
      <div class="pv-field"><label>Firmware</label><input class="form-input" value="${escAttr(u.fw||'')}" ${sfk(id,'un-fw')}></div></div>
    <div class="pv-2col"><div class="pv-field"><label>License key</label><input class="form-input mono" value="${escAttr(u.lic||'')}" ${sfk(id,'un-lic')}></div>
      <div class="pv-field"><label>License expires</label><input type="date" class="form-input" value="${u.licExp||''}" ${sfk(id,'un-licExp')}></div></div>
    <div class="pv-field"><label>Issues (${iss.filter(issueOpen).length} open)</label><div class="pv-links">${iss.map(i=>{const s=issueStatus(i);return `<div class="pv-link-row" data-act="select" data-id="${i.id}">${light(s.color,s.label)}<span class="pv-num">${escHtml(i.code||'')}</span><span class="pv-link-name">${escHtml(i.name)}</span><span class="ck-lbl c-${s.color}">${escHtml(i.status)}</span></div>`;}).join('')||'<div class="pv-small">None.</div>'}</div></div>
    <div class="pv-field"><label>Tests</label><div class="pv-links">${tests.map(t=>{const s=testStatus(t);return `<div class="pv-link-row" data-act="select" data-id="${t.id}">${light(s.color,s.label)}<span class="pv-link-name">${escHtml(t.name)}</span><span class="ck-lbl c-${s.color}">${s.label}</span></div>`;}).join('')||'<div class="pv-small">None.</div>'}</div></div>
    <div class="pv-field"><label>Notes</label><textarea class="form-input pv-notes" ${sfk(id,'un-notes')}>${escHtml(u.notes||'')}</textarea></div>
    <div class="pv-side-actions"><button class="btn" data-act="is-add" data-unit="${id}">+ Issue</button><button class="btn" data-act="te-add" data-unit="${id}">+ Test</button><button class="btn danger" data-act="un-del" data-id="${id}">Delete</button></div>`;
}

// ══ ISSUES & TESTS ══
function pvIssuesHTML(p){
  const issues=listOf(p,'issues'),tests=listOf(p,'tests'),open=issues.filter(issueOpen);
  const late=open.filter(i=>i.due&&i.due<todayStr()).length;
  let h=`<div class="pv-toolbar"><button class="add-btn" data-act="is-add">+ Issue</button><button class="add-btn" data-act="te-add">+ Test</button>
    <div class="ck-summary"><span class="ck-sum ${open.length?'c-amber':''}">${open.length} open issue${open.length===1?'':'s'}</span>${late?`<span class="ck-sum c-red">${late} overdue</span>`:''}
    <span class="ck-sum c-green">${(n=>n+' test'+(n===1?'':'s')+' passed')(tests.filter(t=>t.status==='Pass').length)}</span>${tests.some(t=>t.status==='Fail')?`<span class="ck-sum c-red">${tests.filter(t=>t.status==='Fail').length} failed</span>`:''}</div>
    <label class="pv-chk"><input type="checkbox" data-act="is-show-closed" ${PV.showClosed?'checked':''}> Show closed</label></div>`;
  h+=`<div class="pv-sec-hdr"><span>Issues</span></div>`;
  const rows=issues.filter(i=>PV.showClosed||issueOpen(i));
  h+=rows.length?`<div class="pv-table-wrap" style="margin-bottom:22px"><div class="pv-table is-table"><div class="is-tr pv-th"><div>ID</div><div></div><div>Issue</div><div>Severity</div><div>Status</div><div>Owner</div><div>Due</div><div>Unit</div><div>Blocks gate</div><div></div></div>
    ${rows.map(i=>isRowHTML(p,i)).join('')}</div></div>`
    :`<div class="pv-empty ${issues.length?'ok':''}">${issues.length?'No open issues.':'No issues logged. Issues can block a gate, belong to a unit, and appear in Control until closed. A failed test opens one automatically.'}</div>`;
  h+=`<div class="pv-sec-hdr"><span>Tests</span></div>`;
  if(!tests.length) return h+`<div class="pv-empty">No tests yet. Add the test plan here (optionally per unit); tests can be required for a gate.</div>`;
  h+=`<div class="pv-table-wrap"><div class="pv-table te-table"><div class="te-tr pv-th"><div></div><div>Test</div><div>Unit</div><div>Result</div><div>Run on</div><div>Required for gate</div><div>Issue</div><div></div></div>`;
  const groups=[];tests.forEach(t=>{const u=t.unit||'';if(!groups.includes(u))groups.push(u);});
  groups.sort((a,b)=>!a?1:!b?-1:unitLabel(p,a)<unitLabel(p,b)?-1:1).forEach(u=>{
    const ts=tests.filter(t=>(t.unit||'')===u);
    h+=`<div class="pv-group"><div class="pv-group-name ${u?'':'none'}">${u?escHtml(unitLabel(p,u)):'General'}</div><span class="pv-group-count">${ts.filter(t=>t.status==='Pass').length}/${ts.length} pass</span></div>`;
    ts.forEach(t=>{h+=teRowHTML(p,t);});
  });
  return h+'</div></div>';
}
function isRowHTML(p,i){
  const s=issueStatus(i),id=i.id,late=issueOpen(i)&&i.due&&i.due<todayStr();
  return `<div class="is-tr pv-task ${PV.sel===id?'sel':''} ${!issueOpen(i)?'done':''} ${s.color==='red'?'overdue':''}" data-row="${id}">
    <div class="pv-num" data-act="select" data-id="${id}">${escHtml(i.code||'')}</div><div class="ck-c">${light(s.color,s.label)}</div>
    <div class="pv-name-cell"><div class="pv-name" contenteditable="true" data-ph="Issue" ${fkf(id,'is-name')}>${escHtml(i.name)}</div>${(i.deferrals||0)>0?`<span class="pv-defer">↻${i.deferrals}</span>`:''}</div>
    <div><select class="pv-in sev-${(i.sev||'Medium').toLowerCase()}" ${fkf(id,'is-sev')}>${opts(ISSUE_SEV,i.sev||'Medium')}</select></div>
    <div><select class="pv-in" ${fkf(id,'is-status')}>${opts(ISSUE_STATUSES,i.status||'Open')}</select></div>
    <div><input class="pv-in" list="pvOwners" placeholder="Me" value="${escAttr(i.owner||'')}" ${fkf(id,'is-owner')}></div>
    <div><input type="date" class="pv-in ${!i.due&&issueOpen(i)?'need':''} ${late?'late':''}" value="${i.due||''}" ${fkf(id,'is-due')}></div>
    <div><select class="pv-in" ${fkf(id,'is-unit')}>${unitOpts(p,i.unit)}</select></div>
    <div><select class="pv-in" ${fkf(id,'is-gate')}>${gateOpts(p,i.gate)}</select></div>
    <div><button class="pv-more" data-act="select" data-id="${id}">⋯</button></div></div>`;
}
function teRowHTML(p,t){
  const s=testStatus(t),id=t.id,iss=t.issue&&findIn(p,'issues',t.issue);
  return `<div class="te-tr pv-task ${PV.sel===id?'sel':''}" data-row="${id}">
    <div class="ck-c">${light(s.color,s.label)}</div>
    <div class="pv-name-cell"><div class="pv-name" contenteditable="true" data-ph="Test" ${fkf(id,'te-name')}>${escHtml(t.name)}</div></div>
    <div><select class="pv-in" ${fkf(id,'te-unit')}>${unitOpts(p,t.unit)}</select></div>
    <div><select class="pv-in res-${(t.status||'Not run').replace(' ','').toLowerCase()}" ${fkf(id,'te-status')}>${opts(TEST_STATUSES,t.status||'Not run')}</select></div>
    <div><input type="date" class="pv-in" value="${t.ranOn||''}" ${fkf(id,'te-ranOn')}></div>
    <div><select class="pv-in" ${fkf(id,'te-gate')}>${gateOpts(p,t.gate)}</select></div>
    <div>${iss?`<span class="pv-num" data-act="select" data-id="${iss.id}" title="${escAttr(iss.name)}">${escHtml(iss.code)}</span>`:'<span class="pv-muted">—</span>'}</div>
    <div><button class="pv-more" data-act="select" data-id="${id}">⋯</button></div></div>`;
}
function isSideHTML(p,i){
  const s=issueStatus(i),id=i.id,tst=(p.tests||[]).find(t=>t.issue===id);
  return `<div class="pv-side-hdr"><span class="pv-num">⚠ Issue ${escHtml(i.code||'')}</span><button class="pv-x" data-act="close-side">✕</button></div>
    <div class="pv-gate-box g-${s.color}"><div class="pv-gate-pill">${escHtml(s.label)}</div>${i.closedOn?`<div class="pv-small">Closed ${fmtShort(i.closedOn)}</div>`:''}</div>
    <div class="pv-field"><label>Title</label><input class="form-input" value="${escAttr(i.name)}" ${sfk(id,'is-name')}></div>
    <div class="pv-2col"><div class="pv-field"><label>Severity</label><select class="form-select" ${sfk(id,'is-sev')}>${opts(ISSUE_SEV,i.sev||'Medium')}</select></div>
      <div class="pv-field"><label>Status</label><select class="form-select" ${sfk(id,'is-status')}>${opts(ISSUE_STATUSES,i.status||'Open')}</select></div></div>
    <div class="pv-2col"><div class="pv-field"><label>Owner</label><input class="form-input" list="pvOwners" placeholder="Me" value="${escAttr(i.owner||'')}" ${sfk(id,'is-owner')}></div>
      <div class="pv-field"><label>Due</label><input type="date" class="form-input" value="${i.due||''}" ${sfk(id,'is-due')}></div></div>
    <div class="pv-2col"><div class="pv-field"><label>Unit</label><select class="form-select" ${sfk(id,'is-unit')}>${unitOpts(p,i.unit)}</select></div>
      <div class="pv-field"><label>Blocks gate</label><select class="form-select" ${sfk(id,'is-gate')}>${gateOpts(p,i.gate)}</select></div></div>
    ${tst?`<div class="pv-small">Opened from test: <a href="#" data-act="select" data-id="${tst.id}">${escHtml(tst.name)}</a></div>`:''}
    <div class="pv-field"><label>Notes</label><textarea class="form-input pv-notes" ${sfk(id,'is-notes')}>${escHtml(i.notes||'')}</textarea></div>
    ${i.deferrals?`<div class="pv-small">↻ Due date pushed later ${i.deferrals}×.</div>`:''}
    <div class="pv-side-actions">${issueOpen(i)?`<button class="btn primary" data-act="is-close" data-id="${id}">Close issue</button>`:`<button class="btn" data-act="is-reopen" data-id="${id}">Reopen</button>`}<button class="btn danger" data-act="is-del" data-id="${id}">Delete</button></div>`;
}
function teSideHTML(p,t){
  const s=testStatus(t),id=t.id;
  return `<div class="pv-side-hdr"><span class="pv-num">🧪 Test</span><button class="pv-x" data-act="close-side">✕</button></div>
    <div class="pv-gate-box g-${s.color}"><div class="pv-gate-pill">${s.label}</div>${t.ranOn?`<div class="pv-small">Run ${fmtShort(t.ranOn)}</div>`:''}</div>
    <div class="pv-field"><label>Test</label><input class="form-input" value="${escAttr(t.name)}" ${sfk(id,'te-name')}></div>
    <div class="pv-2col"><div class="pv-field"><label>Result</label><select class="form-select" ${sfk(id,'te-status')}>${opts(TEST_STATUSES,t.status||'Not run')}</select></div>
      <div class="pv-field"><label>Run on</label><input type="date" class="form-input" value="${t.ranOn||''}" ${sfk(id,'te-ranOn')}></div></div>
    <div class="pv-2col"><div class="pv-field"><label>Unit</label><select class="form-select" ${sfk(id,'te-unit')}>${unitOpts(p,t.unit)}</select></div>
      <div class="pv-field"><label>Required for gate</label><select class="form-select" ${sfk(id,'te-gate')}>${gateOpts(p,t.gate)}</select></div></div>
    <div class="pv-field"><label>Notes / results</label><textarea class="form-input pv-notes" ${sfk(id,'te-notes')}>${escHtml(t.notes||'')}</textarea></div>
    <div class="pv-side-actions"><button class="btn" data-act="te-dup" data-id="${id}" title="Copy this test to every unit in the same batch">Copy to batch</button><button class="btn danger" data-act="te-del" data-id="${id}">Delete</button></div>`;
}

// gate panel: blocking issues + required tests
function pvGateExtHTML(p,g){
  const iss=(p.issues||[]).filter(i=>i.gate===g.id),tst=(p.tests||[]).filter(t=>t.gate===g.id);
  if(!iss.length&&!tst.length&&!(p.issues||[]).length&&!(p.tests||[]).length) return '';
  const freeI=(p.issues||[]).filter(i=>issueOpen(i)&&i.gate!==g.id),freeT=(p.tests||[]).filter(t=>t.gate!==g.id);
  return `<div class="pv-field"><label>Blocking issues (${iss.filter(i=>!issueOpen(i)).length}/${iss.length} closed)</label><div class="pv-links">
    ${iss.map(i=>{const s=issueStatus(i);return `<div class="pv-link-row">${light(s.color,s.label)}<span class="pv-num">${escHtml(i.code)}</span><span class="pv-link-name" data-act="select" data-id="${i.id}">${escHtml(i.name)}</span><span class="ck-lbl c-${s.color}">${escHtml(i.status)}</span><button class="pv-x" data-act="gx-rm" data-k="issues" data-id="${i.id}">✕</button></div>`;}).join('')||'<div class="pv-small">None.</div>'}</div>
    ${freeI.length?`<div class="pv-link-add"><select class="form-select" id="gxIss"><option value="">Add a blocking issue…</option>${freeI.map(i=>`<option value="${i.id}">${escHtml(i.code+' '+i.name)}</option>`).join('')}</select><button class="btn" data-act="gx-add" data-k="issues" data-id="${g.id}">Add</button></div>`:''}</div>
  <div class="pv-field"><label>Required tests (${tst.filter(t=>t.status==='Pass').length}/${tst.length} pass)</label><div class="pv-links">
    ${tst.map(t=>{const s=testStatus(t);return `<div class="pv-link-row">${light(s.color,s.label)}<span class="pv-link-name" data-act="select" data-id="${t.id}">${escHtml(t.name)}${t.unit?' · '+escHtml(unitLabel(p,t.unit)):''}</span><span class="ck-lbl c-${s.color}">${s.label}</span><button class="pv-x" data-act="gx-rm" data-k="tests" data-id="${t.id}">✕</button></div>`;}).join('')||'<div class="pv-small">None.</div>'}</div>
    ${freeT.length?`<div class="pv-link-add"><select class="form-select" id="gxTst"><option value="">Require a test…</option>${freeT.map(t=>`<option value="${t.id}">${escHtml(t.name)}${t.unit?' · '+escHtml(unitLabel(p,t.unit)):''}</option>`).join('')}</select><button class="btn" data-act="gx-add" data-k="tests" data-id="${g.id}">Add</button></div>`:''}</div>`;
}

// overview tiles + attention
function pvExtTiles(p,tile){
  let h='';
  if(modOn(p,'inventory')){const s=p.stock||[],low=s.filter(x=>stockStatus(x).color==='red').length;h+=tile(s.length?low:'—',s.length?(low?'Stock items low':'Stock OK'):'No stock items',low?'bad':'','tab-inventory');}
  if(modOn(p,'units')){const u=p.units||[];h+=tile(u.length?u.filter(x=>['Shipped','Installed'].includes(x.status)).length+'/'+u.length:'—','Units shipped','','tab-units');}
  if(modOn(p,'issues')){const o=(p.issues||[]).filter(issueOpen),late=o.filter(i=>i.due&&i.due<todayStr()).length;h+=tile(o.length,'Open issues'+(late?' · '+late+' overdue':''),late?'bad':'','tab-issues');}
  return h;
}
function pvExtAttention(p,att){
  (p.stock||[]).forEach(s=>{const st=stockStatus(s);if(st.color==='red')att.push({t:s,icon:'📦',cls:'bad',why:`${st.label}: ${s.onHand||0} on hand, min ${s.min}`});
    if(s.onOrder&&s.orderDue&&s.orderDue<todayStr())att.push({t:s,icon:'📦',cls:'warn',why:'Order was due '+fmtShort(s.orderDue)});});
  (p.units||[]).forEach(u=>{const l=licenseStatus(u);if(l&&l.color!=='green')att.push({t:{id:u.id,name:u.serial},icon:'🔧',cls:l.color==='red'?'bad':'warn',why:l.label});});
  (p.issues||[]).forEach(i=>{const s=issueStatus(i);if(s.color==='red')att.push({t:i,icon:i.code,cls:'bad',why:'Issue: '+s.label+(i.owner?' · '+i.owner:'')});});
  (p.tests||[]).forEach(t=>{if(t.status==='Fail')att.push({t,icon:'🧪',cls:'bad',why:'Test failed'+(t.unit?' · '+unitLabel(p,t.unit):'')});});
}

// side panel dispatch
function pvExtSide(p,id){
  let o;
  if((o=findIn(p,'stock',id))) return stSideHTML(p,o);
  if((o=findIn(p,'units',id))) return unSideHTML(p,o);
  if((o=findIn(p,'issues',id))) return isSideHTML(p,o);
  if((o=findIn(p,'tests',id))) return teSideHTML(p,o);
  return null;
}

// ══ ACTIONS ══
function newIssue(p,o){
  p.nextIssue=(p.nextIssue||(p.issues||[]).length+1);
  const i={id:uid(),code:'I-'+p.nextIssue++,name:'New issue',sev:'Medium',status:'Open',due:null,...o};
  listOf(p,'issues').push(i);return i;
}
function modClick(e,el,act,p){
  const id=el.dataset.id;
  switch(act){
    case 'mod-menu': PV.modMenu=!PV.modMenu;renderPV();return;
    case 'mod-toggle': p.modules=p.modules||{};p.modules[el.dataset.k]=el.checked;
      if(el.checked)PV.tab=PV_MODULES.find(m=>m.k===el.dataset.k).tab;PV.modMenu=false;pvCommit();return;
    // inventory
    case 'st-add': {const s={id:uid(),name:el.dataset.name||'New item',cat:el.dataset.cat||'',unit:'pcs',onHand:0,min:0,log:[]};
      listOf(p,'stock').push(s);PV.sel=s.id;PV.tab='inventory';pvCommit();return;}
    case 'st-form': PV.stForm={id,kind:el.dataset.kind};PV.tab='inventory';renderPV();setTimeout(()=>{const q=document.getElementById('stQty');if(q){q.focus();q.select();}},30);return;
    case 'st-cancel': PV.stForm=null;renderPV();return;
    case 'st-save': {
      const s=findIn(p,'stock',PV.stForm&&PV.stForm.id);if(!s)return;
      const kind=PV.stForm.kind,q=Math.max(0,parseInt(document.getElementById('stQty').value)||0);
      const note=(document.getElementById('stNote')||{}).value||'',due=(document.getElementById('stDue')||{}).value||null;
      const before=+s.onHand||0;s.log=s.log||[];
      if(kind==='use'){if(!q)return;s.onHand=Math.max(0,before-q);s.log.push({d:todayStr(),delta:s.onHand-before,qty:s.onHand,note:note||'used'});}
      else if(kind==='receive'){if(!q)return;s.onHand=before+q;if(s.onOrder){s.onOrder=Math.max(0,s.onOrder-q);if(!s.onOrder){delete s.onOrder;delete s.orderDue;}}s.log.push({d:todayStr(),delta:q,qty:s.onHand,note:note||'received'});}
      else if(kind==='count'){s.onHand=q;s.log.push({d:todayStr(),delta:q-before,qty:q,note:note||'count'});}
      else if(kind==='order'){if(q){s.onOrder=q;s.orderDue=due;}else{delete s.onOrder;delete s.orderDue;}s.log.push({d:todayStr(),delta:0,qty:before,note:q?`ordered ${q}`+(due?' (due '+fmtShort(due)+')':''):'order cancelled'});}
      PV.stForm=null;pvCommit();return;}
    case 'st-del': {const s=findIn(p,'stock',id);if(!s||!confirm('Delete stock item "'+s.name+'"?'))return;p.stock=p.stock.filter(x=>x.id!==id);PV.sel=null;pvCommit();return;}
    // units
    case 'un-add': {const n=listOf(p,'units').length+1;const u={id:uid(),serial:'SN-'+String(n).padStart(3,'0'),status:'Planned'};p.units.push(u);PV.sel=u.id;PV.tab='units';pvCommit();return;}
    case 'un-batch-form': PV.unForm=true;renderPV();return;
    case 'un-batch-cancel': PV.unForm=false;renderPV();return;
    case 'un-batch': {
      const b=document.getElementById('unB').value.trim(),pre=document.getElementById('unP').value,st=parseInt(document.getElementById('unS').value)||1,n=Math.min(200,parseInt(document.getElementById('unN').value)||0),m=document.getElementById('unM').value.trim();
      if(!n){toast('Enter how many units.');return;}
      const have=new Set(listOf(p,'units').map(u=>u.serial));let made=0;
      for(let k=0;k<n;k++){const sn=pre+String(st+k).padStart(3,'0');if(have.has(sn))continue;p.units.push({id:uid(),serial:sn,batch:b,model:m,status:'Planned'});made++;}
      PV.unForm=false;pvCommit(`Added ${made} unit${made===1?'':'s'}${made<n?' (skipped serials that already exist)':''}.`);return;}
    case 'un-toggle': {const k=p.id+'|un|'+el.dataset.b;PV.collapsed[k]=!PV.collapsed[k];renderPV();return;}
    case 'un-del': {const u=findIn(p,'units',id);if(!u||!confirm('Delete unit '+u.serial+'? Its issues and tests are kept.'))return;
      p.units=p.units.filter(x=>x.id!==id);(p.issues||[]).concat(p.tests||[]).forEach(x=>{if(x.unit===id)delete x.unit;});PV.sel=null;pvCommit();return;}
    // issues
    case 'is-add': {const i=newIssue(p,el.dataset.unit?{unit:el.dataset.unit}:{});PV.sel=i.id;PV.tab='issues';pvCommit();
      setTimeout(()=>{const n=document.querySelector(`#pvMain [data-fk="${i.id}:is-name"]`);if(n){n.scrollIntoView({block:'center'});n.focus();selectAll(n);}},40);return;}
    case 'is-show-closed': PV.showClosed=el.checked;renderPV();return;
    case 'is-close': {const i=findIn(p,'issues',id);if(i){i.status='Closed';i.closedOn=todayStr();pvCommit(i.code+' closed.');}return;}
    case 'is-reopen': {const i=findIn(p,'issues',id);if(i){i.status='Open';delete i.closedOn;pvCommit();}return;}
    case 'is-del': {const i=findIn(p,'issues',id);if(!i||!confirm('Delete issue '+i.code+'?'))return;p.issues=p.issues.filter(x=>x.id!==id);(p.tests||[]).forEach(t=>{if(t.issue===id)delete t.issue;});PV.sel=null;pvCommit();return;}
    // tests
    case 'te-add': {const t={id:uid(),name:'New test',status:'Not run',unit:el.dataset.unit||''};listOf(p,'tests').push(t);PV.sel=t.id;PV.tab='issues';pvCommit();
      setTimeout(()=>{const n=document.querySelector(`#pvMain [data-fk="${t.id}:te-name"]`);if(n){n.scrollIntoView({block:'center'});n.focus();selectAll(n);}},40);return;}
    case 'te-dup': {const t=findIn(p,'tests',id),u=t&&t.unit&&findIn(p,'units',t.unit);if(!u){toast('Give this test a unit first — it is copied to the other units in that unit’s batch.');return;}
      const others=(p.units||[]).filter(x=>x.batch===u.batch&&x.id!==u.id&&!(p.tests||[]).some(y=>y.unit===x.id&&y.name===t.name));
      others.forEach(x=>p.tests.push({id:uid(),name:t.name,status:'Not run',unit:x.id,gate:t.gate}));pvCommit(`Copied to ${others.length} unit${others.length===1?'':'s'}.`);return;}
    case 'te-del': {const t=findIn(p,'tests',id);if(!t||!confirm('Delete test "'+t.name+'"?'))return;p.tests=p.tests.filter(x=>x.id!==id);PV.sel=null;pvCommit();return;}
    // gate panel
    case 'gx-add': {const sel=document.getElementById(el.dataset.k==='issues'?'gxIss':'gxTst').value,o=sel&&findIn(p,el.dataset.k,sel);if(!o)return;o.gate=id;pvCommit();return;}
    case 'gx-rm': {const o=findIn(p,el.dataset.k,id);if(o){delete o.gate;pvCommit();}return;}
  }
}
function modEdit(p,id,f,val,el){
  const [pre,key]=f.split('-'),coll={st:'stock',un:'units',is:'issues',te:'tests'}[pre];
  const o=findIn(p,coll,id);if(!o) return;
  let msg=null;const v=typeof val==='string'?val.trim():val;
  if(key==='name'||key==='serial'){if(!v){if(el.isContentEditable)el.innerText=o[key];else el.value=o[key];return;}if(v===o[key])return;}
  switch(pre+'-'+key){
    case 'st-min':case 'st-perUnit':case 'st-leadDays':case 'st-onOrder': {const n=parseInt(v);if(n>0)o[key]=n;else delete o[key];if(key==='onOrder'&&!o.onOrder)delete o.orderDue;break;}
    case 'is-status': o.status=v;if(v==='Closed')o.closedOn=todayStr();else delete o.closedOn;break;
    case 'is-due': if(o.due&&v&&v>o.due)o.deferrals=(o.deferrals||0)+1;o.due=v||null;break;
    case 'is-owner': case 'un-owner': o.owner=/^me$/i.test(v)?'':v;break;
    case 'te-status': {
      o.status=v;if((v==='Pass'||v==='Fail')&&!o.ranOn)o.ranOn=todayStr();
      if(v==='Fail'&&!o.issue){const i=newIssue(p,{name:'Test failed: '+o.name+(o.unit?' ('+unitLabel(p,o.unit)+')':''),sev:'High',unit:o.unit||undefined,gate:o.gate||undefined});o.issue=i.id;
        msg=`Opened ${i.code} for the failed test — give it a date in Control.`;}
      break;}
    case 'un-status': o.status=v;if(['Shipped','Installed'].includes(v)&&!o.shipDate){o.shipDate=todayStr();msg='Ship date set to today — change it if needed.';}break;
    default: if(key==='notes')o.notes=val;else if(v===''||v==null)delete o[key];else o[key]=v;
  }
  pvCommit(msg);
}
