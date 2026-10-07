'use strict';

// ══════════════════════════════════════════════════════════════════
//  CHECKS TAB — readiness matrix for documentation, QC and training
//  Each row moves Draft → Review → Approved; "Current" shows whether an
//  approval has gone stale (optional re-review interval).
// ══════════════════════════════════════════════════════════════════
const CK_COMMON=[
  ['Documentation','Architectural diagrams'],['Documentation','Risk assessment'],['Documentation','Technical file'],
  ['QC','QC documentation'],['QC','Receiving instructions'],['QC','Incoming inspection procedure'],
  ['Training','Training plan'],['Training','Training executed'],
  ['Records','Serial no. tracking'],['Records','License tracking'],
];
Object.assign(PV,{ckShowOK:true});

function ckCats(p){
  const seen=[];getChecks(p).forEach(c=>{const g=c.cat||'';if(!seen.includes(g))seen.push(g);});
  return seen.filter(Boolean).concat(seen.includes('')?['']:[]);
}
const ckLight=(c,big)=>{const st=checkStatus(c);return `<span class="ck-light c-${st.color}${big?' big':''}" title="${escAttr(st.label)}"></span>`;};

function pvChecksHTML(p){
  const cks=getChecks(p),have=new Set(cks.map(c=>c.name.toLowerCase()));
  const counts={green:0,amber:0,red:0,gray:0};cks.forEach(c=>counts[checkStatus(c).color]++);
  const common=CK_COMMON.filter(([,n])=>!have.has(n.toLowerCase()));
  let h=`<div class="pv-toolbar">
    <button class="add-btn" data-act="ck-add">+ Check</button>
    ${common.length?`<select class="form-select ck-common" data-f="ck-common" data-id="-"><option value="">Add a common item…</option>
      ${common.map(([c,n])=>`<option value="${escAttr(c+'|'+n)}">${escHtml(n)} (${escHtml(c)})</option>`).join('')}
      <option value="__all">➕ Add all ${common.length}</option></select>`:''}
    ${cks.length?`<div class="ck-summary">
      <span class="ck-sum c-green">${counts.green} approved</span><span class="ck-sum c-amber">${counts.amber} due soon</span>
      <span class="ck-sum c-red">${counts.red} need action</span><span class="ck-sum c-gray">${counts.gray} on track</span></div>`:''}
    <label class="pv-chk"><input type="checkbox" data-act="ck-show-ok" ${PV.ckShowOK?'checked':''}> Show approved</label>
  </div>`;
  if(!cks.length){
    return h+`<div class="pv-empty ck-empty"><b>No checks yet.</b> Checks are the documents and sign-offs that must exist and be approved, like the risk assessment, technical file, QC documentation or a training plan. Each gets a red/amber/green light, can be made a gate criterion, and shows up in Control when it needs action.
      <div class="ck-sugg">${CK_COMMON.map(([c,n])=>`<button class="qd-btn" data-act="ck-add-common" data-cat="${escAttr(c)}" data-name="${escAttr(n)}">+ ${escHtml(n)}</button>`).join('')}
      <button class="qd-btn strong" data-act="ck-add-all">Add all</button></div></div>`;
  }
  h+=`<div class="pv-table-wrap"><div class="pv-table ck-table">
    <div class="ck-tr pv-th"><div></div><div>Item</div><div>Owner</div><div>Due</div>
      <div class="ck-c">Draft</div><div class="ck-c">Review</div><div class="ck-c">Approved</div><div class="ck-c">Current</div><div>Rev</div><div>Doc</div><div></div></div>`;
  ckCats(p).forEach(cat=>{
    const all=cks.filter(c=>(c.cat||'')===cat),rows=all.filter(c=>PV.ckShowOK||!checkOK(c));
    const key=p.id+'|ck|'+cat,col=!!PV.collapsed[key];
    const red=all.filter(c=>checkStatus(c).color==='red').length;
    h+=`<div class="pv-group"><button class="pv-caret ${col?'col':''}" data-act="ck-toggle-cat" data-cat="${escAttr(cat)}">▼</button>
      <div class="pv-group-name ${cat?'':'none'}">${cat?escHtml(cat):'Uncategorized'}</div>
      <span class="pv-group-count">${all.filter(checkOK).length}/${all.length} approved${red?` · <span class="txt-bad">${red} need action</span>`:''}</span>
      <button class="add-sub-btn" data-act="ck-add" data-cat="${escAttr(cat)}">+ check</button></div>`;
    if(!col) rows.forEach(c=>{h+=ckRowHTML(p,c);});
  });
  return h+'</div></div>';
}

function ckRowHTML(p,c){
  const st=checkStatus(c),idx=CK_STATES.indexOf(c.state||'missing'),id=c.id;
  const fk=f=>`data-id="${id}" data-f="${f}" data-fk="${id}:${f}"`;
  const stage=i=>{
    const reached=idx>=i,next=idx===i-1;
    const cls=reached?'on':next?('next '+(st.color==='red'?'late':st.color==='amber'?'soon':'')):'';
    return `<div class="ck-c"><button class="ck-step ${cls}" data-act="ck-stage" data-id="${id}" data-stage="${CK_STATES[i]}" title="${reached&&idx===i?'Click to step back':'Mark '+CK_LABEL[CK_STATES[i]].toLowerCase()}">${reached?'✓':''}</button></div>`;
  };
  const exp=checkExpiry(c);
  const current=c.state!=='approved'?'<span class="pv-muted">—</span>'
    :!exp?'<span class="ck-cur ok">✓ current</span>'
    :exp<todayStr()?`<span class="ck-cur bad">stale since ${fmtShort(exp)}</span>`
    :`<span class="ck-cur ${calDiff(exp)<=14?'warn':'ok'}">✓ until ${fmtShort(exp)}</span>`;
  const late=c.state!=='approved'&&c.due&&c.due<todayStr();
  return `<div class="ck-tr pv-task ${PV.sel===id?'sel':''} ${st.color==='red'?'overdue':''}" data-row="${id}">
    <div class="ck-c">${ckLight(c)}</div>
    <div class="pv-name-cell"><div class="pv-name" contenteditable="true" data-ph="Check name" ${fk('ck-name')}>${escHtml(c.name)}</div>
      <span class="ck-lbl c-${st.color}">${escHtml(st.label)}</span>${(c.deferrals||0)>0?`<span class="pv-defer" title="Pushed later ${c.deferrals}×">↻${c.deferrals}</span>`:''}</div>
    <div><input class="pv-in" list="pvOwners" placeholder="Me" value="${escAttr(c.owner||'')}" ${fk('ck-owner')}></div>
    <div><input type="date" class="pv-in ${!c.due&&c.state!=='approved'?'need':''} ${late?'late':''}" value="${c.due||''}" ${fk('ck-due')}></div>
    ${stage(1)}${stage(2)}${stage(3)}
    <div class="ck-c">${current}</div>
    <div><input class="pv-in" placeholder="—" value="${escAttr(c.rev||'')}" ${fk('ck-rev')}></div>
    <div>${c.link?`<a class="ck-doc" href="${escAttr(ckHref(c.link))}" target="_blank" rel="noopener" title="${escAttr(c.link)}">Open ↗</a>`:'<span class="pv-muted">—</span>'}</div>
    <div><button class="pv-more" data-act="select" data-id="${id}" title="Details">⋯</button></div>
  </div>`;
}
// links can be web addresses or plain notes like a file path; only web addresses open
function ckHref(l){return /^https?:\/\//i.test(l)?l:(/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(l)?'https://'+l:'#');}

// ── side panel for a check ──
function pvCheckSideHTML(p,c){
  const id=c.id,fk=f=>`data-id="${id}" data-f="${f}" data-fk="side:${id}:${f}"`,st=checkStatus(c),exp=checkExpiry(c);
  const gates=(p.subtasks||[]).filter(t=>t.gate),used=gates.filter(g=>(g.checks||[]).includes(id)),free=gates.filter(g=>!(g.checks||[]).includes(id));
  let h=`<div class="pv-side-hdr"><span class="pv-num">☑ Check</span><button class="pv-x" data-act="close-side" title="Close (Esc)">✕</button></div>
    <div class="pv-gate-box g-${st.color}"><div class="pv-gate-pill">${escHtml(st.label)}</div>
      <div class="pv-small">${c.state==='approved'?'Approved '+(c.approvedOn?fmtShort(c.approvedOn):''):escHtml(CK_LABEL[c.state||'missing'])}${exp?' · re-review by '+fmtShort(exp):''}${c.due&&c.state!=='approved'?' · due '+fmtShort(c.due):''}</div></div>
    <div class="pv-field"><label>Name</label><input class="form-input" value="${escAttr(c.name)}" ${fk('ck-name')}></div>
    <div class="pv-2col">
      <div class="pv-field"><label>Category</label><input class="form-input" list="pvCkCats" placeholder="e.g. Documentation" value="${escAttr(c.cat||'')}" ${fk('ck-cat')}>
        <datalist id="pvCkCats">${[...new Set(ckCats(p).filter(Boolean).concat(['Documentation','QC','Training','Records']))].map(x=>`<option value="${escAttr(x)}">`).join('')}</datalist></div>
      <div class="pv-field"><label>Owner</label><input class="form-input" list="pvOwners" placeholder="Me" value="${escAttr(c.owner||'')}" ${fk('ck-owner')}></div>
    </div>
    <div class="pv-2col">
      <div class="pv-field"><label>State</label><select class="form-select" ${fk('ck-state')}>${CK_STATES.map(s=>`<option value="${s}" ${c.state===s?'selected':''}>${CK_LABEL[s]}</option>`).join('')}</select></div>
      <div class="pv-field"><label>Due date</label><input type="date" class="form-input" value="${c.due||''}" ${fk('ck-due')}></div>
    </div>
    <div class="pv-2col">
      <div class="pv-field"><label>Revision</label><input class="form-input" placeholder="e.g. B" value="${escAttr(c.rev||'')}" ${fk('ck-rev')}></div>
      <div class="pv-field"><label>Re-review every</label><div class="ck-every"><input type="number" min="0" class="form-input" placeholder="never" value="${c.every||''}" ${fk('ck-every')}><span>months</span></div></div>
    </div>
    ${c.state==='approved'?`<div class="pv-field"><label>Approved on</label><input type="date" class="form-input" value="${c.approvedOn||''}" ${fk('ck-approvedOn')}></div>`:''}
    <div class="pv-field"><label>Document link or location</label><input class="form-input" placeholder="https://… or a file path" value="${escAttr(c.link||'')}" ${fk('ck-link')}>
      ${c.link&&ckHref(c.link)!=='#'?`<a class="ck-doc" href="${escAttr(ckHref(c.link))}" target="_blank" rel="noopener">Open document ↗</a>`:''}</div>
    <div class="pv-field"><label>Gate criterion for</label><div class="pv-links">${used.map(g=>{const gs=gateStatus(p,g);return `<div class="pv-link-row">
        <span class="pv-dia sm">◆</span><span class="pv-link-name" data-act="select" data-id="${g.id}">${escHtml(g.name)}</span><span class="gate-pill g-${gs.color}">${escHtml(gs.label)}</span>
        <button class="pv-x" data-act="ck-gate-rm" data-id="${id}" data-gate="${g.id}" title="Remove from gate">✕</button></div>`;}).join('')||'<div class="pv-small">Not required by any gate.</div>'}</div>
      ${free.length?`<div class="pv-link-add"><select class="form-select" id="ckGateSel"><option value="">Require for a gate…</option>${free.map(g=>`<option value="${g.id}">◆ ${escHtml(g.name)}</option>`).join('')}</select>
        <button class="btn" data-act="ck-gate-add" data-id="${id}">Add</button></div>`:''}</div>
    <div class="pv-field"><label>Notes</label><textarea class="form-input pv-notes" placeholder="Notes…" ${fk('ck-notes')}>${escHtml(c.notes||'')}</textarea></div>`;
  if(c.hist&&c.hist.length) h+=`<div class="pv-field"><label>History</label><div class="ck-hist">${c.hist.slice(-8).reverse().map(x=>`<div><span>${fmtShort(x.d)}</span>${escHtml(CK_LABEL[x.s]||x.s)}</div>`).join('')}</div></div>`;
  if(c.deferrals) h+=`<div class="pv-small">↻ Due date pushed later ${c.deferrals} time${c.deferrals>1?'s':''}. <a href="#" data-act="ck-reset-defer" data-id="${id}">Reset</a></div>`;
  h+=`<div class="pv-side-actions">
    ${c.state!=='approved'?`<button class="btn primary" data-act="ck-stage" data-id="${id}" data-stage="${CK_STATES[Math.min(3,CK_STATES.indexOf(c.state||'missing')+1)]}">Mark ${CK_LABEL[CK_STATES[Math.min(3,CK_STATES.indexOf(c.state||'missing')+1)]].toLowerCase()}</button>`
      :`<button class="btn primary" data-act="ck-reapprove" data-id="${id}">Re-reviewed today</button>`}
    <button class="btn danger" data-act="ck-del" data-id="${id}">Delete</button></div>`;
  return h;
}

// ── gate side panel: checks that must be approved ──
function pvGateChecksHTML(p,g){
  const cks=(g.checks||[]).map(x=>findCheck(p,x)).filter(Boolean);
  const free=getChecks(p).filter(c=>!(g.checks||[]).includes(c.id));
  return `<div class="pv-field"><label>Checks that must be approved (${cks.filter(checkOK).length}/${cks.length})</label>
    <div class="pv-links">${cks.map(c=>{const st=checkStatus(c);return `<div class="pv-link-row">${ckLight(c)}
      <span class="pv-link-name" data-act="select" data-id="${c.id}">${escHtml(c.name)}</span><span class="ck-lbl c-${st.color}">${escHtml(st.label)}</span>
      <button class="pv-x" data-act="ck-gate-rm" data-id="${c.id}" data-gate="${g.id}" title="Remove">✕</button></div>`;}).join('')
      ||`<div class="pv-small">${getChecks(p).length?'No checks required yet.':'No checks in this project yet — add them on the Checks tab.'}</div>`}</div>
    ${free.length?`<div class="pv-link-add"><select class="form-select" id="gckSel"><option value="">Add a check…</option>${free.map(c=>`<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}</select>
      <button class="btn" data-act="gck-add" data-id="${g.id}">Add</button></div>`:''}</div>`;
}

// ── actions ──
function ckNew(p,cat,name){
  const c={id:uid(),name:name||'New check',cat:cat||'',state:'missing',due:null};
  getChecks(p).push(c);PV.collapsed[p.id+'|ck|'+c.cat]=false;return c;
}
function ckClick(e,el,act,p){
  const id=el.dataset.id,c=id&&findCheck(p,id);
  switch(act){
    case 'ck-add':{
      const sel=PV.sel&&findCheck(p,PV.sel);
      const nc=ckNew(p,el.dataset.cat!==undefined?el.dataset.cat:(sel?sel.cat:''));
      PV.sel=nc.id;PV.tab='checks';pvCommit();
      setTimeout(()=>{const n=document.querySelector(`#pvMain [data-fk="${nc.id}:ck-name"]`);if(n){n.scrollIntoView({block:'center'});n.focus();selectAll(n);}},40);return;}
    case 'ck-add-common': ckNew(p,el.dataset.cat,el.dataset.name);pvCommit();return;
    case 'ck-add-all': {const have=new Set(getChecks(p).map(x=>x.name.toLowerCase()));
      CK_COMMON.forEach(([cat,n])=>{if(!have.has(n.toLowerCase()))ckNew(p,cat,n);});pvCommit('Added — each one needs a due date (see “Needs a date” in Control).');return;}
    case 'ck-show-ok': PV.ckShowOK=el.checked;renderPV();return;
    case 'ck-toggle-cat': {const k=p.id+'|ck|'+el.dataset.cat;PV.collapsed[k]=!PV.collapsed[k];renderPV();return;}
    case 'ck-stage': {
      if(!c) return;
      const i=CK_STATES.indexOf(el.dataset.stage),cur=CK_STATES.indexOf(c.state||'missing');
      setCheckState(c,i===cur?CK_STATES[i-1]:CK_STATES[i]);
      pvCommit(c.state==='approved'?`${c.name} approved.`:null);return;}
    case 'ck-reapprove': if(!c)return;c.approvedOn=todayStr();(c.hist||(c.hist=[])).push({d:todayStr(),s:'approved'});pvCommit(`${c.name} re-reviewed today.`);return;
    case 'ck-del': if(!c||!confirm('Delete check "'+c.name+'"?'))return;
      p.checks=getChecks(p).filter(x=>x.id!==id);PV.sel=null;pvCommit();return;
    case 'ck-reset-defer': if(c){delete c.deferrals;pvCommit();}return;
    case 'ck-gate-add': {const gid=document.getElementById('ckGateSel').value,g=gid&&findTask(p,gid);if(!g||!c)return;
      g.checks=(g.checks||[]).concat([c.id]);pvCommit(`${c.name} is now required for ◆ ${g.name}.`);return;}
    case 'gck-add': {const cid=document.getElementById('gckSel').value,g=findTask(p,id);if(!cid||!g)return;
      g.checks=(g.checks||[]).concat([cid]);pvCommit();return;}
    case 'ck-gate-rm': {const g=findTask(p,el.dataset.gate);if(!g)return;
      g.checks=(g.checks||[]).filter(x=>x!==id);if(!g.checks.length)delete g.checks;pvCommit();return;}
  }
}
function ckEdit(p,id,f,val,el){
  if(f==='ck-common'){
    if(!val) return;
    if(val==='__all'){ckClick(null,{dataset:{}},'ck-add-all',p);return;}
    const [cat,name]=val.split('|');ckNew(p,cat,name);pvCommit();return;
  }
  const c=findCheck(p,id);if(!c) return;
  switch(f){
    case 'ck-name': {const v=String(val).trim();if(!v){if(el.isContentEditable)el.innerText=c.name;else el.value=c.name;return;}if(v===c.name)return;c.name=v;break;}
    case 'ck-cat': c.cat=String(val).trim();PV.collapsed[p.id+'|ck|'+c.cat]=false;break;
    case 'ck-owner': {const v=String(val).trim();c.owner=/^me$/i.test(v)?'':v;break;}
    case 'ck-due': if(c.due&&val&&val>c.due)c.deferrals=(c.deferrals||0)+1;c.due=val||null;break;
    case 'ck-state': setCheckState(c,val);break;
    case 'ck-rev': c.rev=String(val).trim();break;
    case 'ck-link': c.link=String(val).trim();break;
    case 'ck-every': {const n=parseInt(val);if(n>0)c.every=n;else delete c.every;break;}
    case 'ck-approvedOn': if(val)c.approvedOn=val;break;
    case 'ck-notes': c.notes=val;break;
    default: return;
  }
  pvCommit();
}
