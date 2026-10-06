'use strict';

// ══════════════════════════════════════════════════════════════════
//  TIMELINE (Gantt) — project view tab
//  Left: sticky task labels. Right: one SVG with shading, bars, gate
//  diamonds and link arrows. Drag from the dot at the end of a bar onto
//  another bar to link them. Click an arrow to remove that link.
// ══════════════════════════════════════════════════════════════════
const TL={get LABEL_W(){return window.innerWidth<700?150:290;},HEAD_H:46,ROW:30,GROUP:28,ZOOM:{day:22,week:8,month:2.6},drag:null,justDragged:false};
Object.assign(PV,{zoom:'day',crit:true,tlScroll:null});

function tlRows(p){
  const rows=[],subs=(p.subtasks||[]).filter(t=>PV.showDone||!t.done);
  pvGroupNames(p).forEach(g=>{
    const all=(p.subtasks||[]).filter(t=>(t.group||'')===g);if(!all.length) return;
    const col=!!PV.collapsed[p.id+'|'+g];
    rows.push({kind:'group',g,col,all});
    if(!col) subs.filter(t=>(t.group||'')===g).forEach(t=>rows.push({kind:'task',t}));
  });
  let y=0;rows.forEach(r=>{r.y=y;r.h=r.kind==='group'?TL.GROUP:TL.ROW;y+=r.h;});
  return {rows,H:Math.max(y,TL.ROW*4)};
}
function tlRange(p){
  const ds=[todayStr()];
  (p.subtasks||[]).forEach(t=>[t.cs,t.due,t.target,t.fc,t.doneOn].forEach(d=>{if(d)ds.push(d);}));
  ds.sort();
  let a=addCalDays(ds[0],-7);let b=addCalDays(ds[ds.length-1],28);
  if(PV.zoom==='month') a=a.slice(0,8)+'01';
  else while(_pd(a).getDay()!==1) a=addCalDays(a,-1);
  const m=document.getElementById('pvMain'),avail=m?m.clientWidth-TL.LABEL_W-40:900;
  const minDays=Math.ceil(avail/TL.ZOOM[PV.zoom])+1;
  let days=Math.round((_pd(b)-_pd(a))/86400000)+1;
  if(days<minDays){b=addCalDays(a,minDays-1);days=minDays;}
  return {a,b,days};
}
// span of a task on the chart (calendar days), or null if it has no dates
function tlSpan(t){
  if(t.gate){const d=t.done?(t.doneOn||t.due):t.due;return d?{s:d,e:d}:null;}
  const e=t.done?(t.due||t.doneOn):t.due;const s=t.cs||e;
  return s&&e?{s:s<e?s:e,e}:null;
}

function pvTimelineHTML(p){
  const dw=TL.ZOOM[PV.zoom],R=tlRange(p),W=R.days*dw,{rows,H}=tlRows(p);
  const X=d=>Math.round((_pd(d)-_pd(R.a))/86400000)*dw;
  const crit=PV.crit?criticalPath(p):{tasks:new Set(),links:new Set()};
  const today=todayStr(),LW=TL.LABEL_W;
  const pos={};                                       // task id → geometry for arrows
  rows.forEach(r=>{if(r.kind!=='task')return;const sp=tlSpan(r.t);if(!sp)return;
    const yc=r.y+r.h/2;
    if(r.t.gate){const cx=X(sp.s)+dw;pos[r.t.id]={x1:cx-7,x2:cx+7,yc,gate:true,cx};}
    else pos[r.t.id]={x1:X(sp.s),x2:X(sp.e)+dw,yc};});

  // ── toolbar ──
  let h=`<div class="pv-toolbar">
    <button class="add-btn" data-act="add-task">+ Task</button>
    <button class="add-btn" data-act="add-gate">◆ Gate</button>
    <div class="tl-seg">${['day','week','month'].map(z=>`<button data-act="zoom" data-z="${z}" class="${PV.zoom===z?'active':''}">${z==='day'?'Days':z==='week'?'Weeks':'Months'}</button>`).join('')}</div>
    <button class="add-btn" data-act="tl-today">Today</button>
    <label class="pv-chk"><input type="checkbox" data-act="crit" ${PV.crit?'checked':''}> Critical path</label>
    <label class="pv-chk" style="margin-left:0"><input type="checkbox" data-act="show-done" ${PV.showDone?'checked':''}> Show done</label>
    <span class="tl-legend"><i class="lg task"></i>Task<i class="lg crit"></i>Critical<i class="lg late"></i>Overdue<i class="lg done"></i>Done<i class="lg wait"></i>Someone else's</span>
  </div>
  <div class="pv-hint tl-hint">Drag from the dot at the end of a bar onto another bar to link them · click an arrow to remove a link · click a bar for details</div>`;

  // ── header scale ──
  let top='',bot='';
  const months=[];for(let d=R.a.slice(0,8)+'01';d<=R.b;){const n=addCalDays(d,32).slice(0,8)+'01';months.push([d,n]);d=n;}
  if(PV.zoom==='month'){
    const years={};months.forEach(([m,n])=>{const y=m.slice(0,4);const s=m<R.a?R.a:m;(years[y]=years[y]||[]).push([s,n]);});
    Object.entries(years).forEach(([y,segs])=>{const x=X(segs[0][0]),x2=Math.min(W,X(segs[segs.length-1][1]));top+=`<div class="tl-hc" style="left:${x}px;width:${x2-x}px">${x2-x>34?y:''}</div>`;});
    months.forEach(([m,n])=>{const s=m<R.a?R.a:m;const x=X(s),x2=Math.min(W,X(n));if(x2-x>14)bot+=`<div class="tl-hc sm" style="left:${x}px;width:${x2-x}px">${_pd(m).toLocaleDateString('en-US',{month:'short'})}</div>`;});
  }else{
    months.forEach(([m,n])=>{const s=m<R.a?R.a:m;const x=X(s),x2=Math.min(W,X(n));
      const wd=x2-x,lbl=wd>120?_pd(m).toLocaleDateString('en-US',{month:'long',year:'numeric'}):wd>62?_pd(m).toLocaleDateString('en-US',{month:'short',year:'numeric'}):wd>30?_pd(m).toLocaleDateString('en-US',{month:'short'}):'';
      top+=`<div class="tl-hc" style="left:${x}px;width:${wd}px">${lbl}</div>`;});
    if(PV.zoom==='day'){
      for(let i=0,d=R.a;i<R.days;i++,d=addCalDays(d,1))
        bot+=`<div class="tl-hc sm ${isWorkday(d)?'':'off'} ${d===today?'now':''}" style="left:${i*dw}px;width:${dw}px">${_pd(d).getDate()}</div>`;
    }else{
      for(let i=0,d=R.a;i<R.days;i+=7,d=addCalDays(d,7))
        bot+=`<div class="tl-hc sm" style="left:${i*dw}px;width:${7*dw}px">${_pd(d).getDate()}</div>`;
    }
  }

  // ── labels column ──
  let labels='';
  rows.forEach(r=>{
    if(r.kind==='group'){
      const open=r.all.filter(t=>!t.done).length;
      labels+=`<div class="tl-lrow grp" style="height:${r.h}px"><button class="pv-caret ${r.col?'col':''}" data-act="toggle-group" data-group="${escAttr(r.g)}">▼</button>
        <span class="tl-gname">${r.g?escHtml(r.g):NO_GROUP}</span><span class="tl-gcount">${open} open</span></div>`;
    }else{
      const t=r.t,isC=crit.tasks.has(t.id);
      labels+=`<div class="tl-lrow ${PV.sel===t.id?'sel':''} ${t.done?'done':''}" style="height:${r.h}px" data-act="select" data-id="${t.id}">
        <span class="tl-num ${isC?'crit':''}">${t.num}</span>${t.gate?'<span class="pv-dia sm">◆</span>':''}
        <span class="tl-name" title="${escAttr(t.name)}">${escHtml(t.name)}</span>${!isMine(t)&&!t.done?`<span class="tl-owner">${escHtml(t.owner)}</span>`:''}</div>`;
    }
  });

  // ── svg body ──
  let bg='',grid='',body='',arrows='';
  rows.forEach(r=>{
    if(r.kind==='group') bg+=`<rect class="tl-grp-bg" x="0" y="${r.y}" width="${W}" height="${r.h}"/>`;
    else if(PV.sel===r.t.id) bg+=`<rect class="tl-sel-bg" x="0" y="${r.y}" width="${W}" height="${r.h}"/>`;
  });
  if(dw>=6) for(let i=0,d=R.a;i<R.days;i++,d=addCalDays(d,1)) if(!isWorkday(d)) grid+=`<rect class="tl-off" x="${i*dw}" y="0" width="${dw}" height="${H}"/>`;
  if(PV.zoom!=='month') for(let i=0,d=R.a;i<R.days;i+=7,d=addCalDays(d,7)) grid+=`<line class="tl-wk" x1="${i*dw}" x2="${i*dw}" y1="0" y2="${H}"/>`;
  else months.forEach(([m])=>{if(m>=R.a){const x=X(m);grid+=`<line class="tl-wk" x1="${x}" x2="${x}" y1="0" y2="${H}"/>`;}});
  rows.forEach(r=>{
    if(r.kind==='group'){                              // summary bracket for the workstream
      const sps=r.all.map(tlSpan).filter(Boolean);if(!sps.length) return;
      const s=sps.map(x=>x.s).sort()[0],e=sps.map(x=>x.e).sort().pop();
      const x1=X(s),x2=X(e)+dw,y=r.y+r.h/2-3;
      body+=`<path class="tl-sum" d="M${x1} ${y+8}V${y}H${x2}V${y+8}"/>`;
      return;
    }
    const t=r.t,g=pos[t.id],yc=r.y+r.h/2,isC=crit.tasks.has(t.id);
    if(!g){body+=`<text class="tl-nodate" x="${X(today)+4}" y="${yc+4}" data-act="select" data-id="${t.id}">no date — set one in Tasks or details</text>`;return;}
    const tip=escAttr(`#${t.num} ${t.name}\n`+(t.gate?`Gate ${t.target?'target '+fmtShort(t.target):'(no target)'}${t.fc?' · forecast '+fmtShort(t.fc):''}`:`${fmtShort(t.cs)} – ${fmtShort(t.due)} · ${taskDur(t)} workday${taskDur(t)>1?'s':''}`)+(t.owner?` · ${t.owner}`:''));
    if(t.gate){
      const st=gateStatus(p,t),cx=g.cx;
      if(!t.done&&t.target&&t.fc&&t.fc>t.target){        // slip: ghost at target, solid at forecast
        const tx=X(t.target)+dw;
        body+=`<line class="tl-slip" x1="${tx}" x2="${cx}" y1="${yc}" y2="${yc}"/><polygon class="tl-ghost" points="${tx},${yc-6} ${tx+6},${yc} ${tx},${yc+6} ${tx-6},${yc}"><title>Target ${fmtShort(t.target)}</title></polygon>`;
      }
      body+=`<g class="tl-bar-g" data-act="select" data-id="${t.id}" data-bar="${t.id}"><title>${tip}\n${escAttr(st.label)}</title>
        <polygon class="tl-dia g-${st.color} ${isC?'crit':''}" points="${cx},${yc-8} ${cx+8},${yc} ${cx},${yc+8} ${cx-8},${yc}"/>
        <text class="tl-label b" x="${cx+16}" y="${yc+4}">${escHtml(t.name)}${t.due?' · '+fmtShort(t.due):''}</text>
        <circle class="tl-handle" cx="${cx+11}" cy="${yc}" r="4" data-handle="${t.id}"/></g>`;
      return;
    }
    const late=!t.done&&t.due<today,cls=t.done?'done':isC?'crit':late?'late':!isMine(t)?'wait':'task';
    body+=`<g class="tl-bar-g" data-act="select" data-id="${t.id}" data-bar="${t.id}"><title>${tip}</title>
      <rect class="tl-bar ${cls}" x="${g.x1+1}" y="${r.y+8}" width="${Math.max(3,g.x2-g.x1-2)}" height="${r.h-16}" rx="3"/>
      <text class="tl-label" x="${g.x2+16}" y="${yc+4}">${escHtml(t.name)}</text>
      <circle class="tl-handle" cx="${g.x2+7}" cy="${yc}" r="4" data-handle="${t.id}"/></g>`;
  });
  // arrows
  rows.forEach(r=>{
    if(r.kind!=='task'||!r.t.preds) return;
    const t=r.t,b=pos[t.id];if(!b) return;
    t.preds.forEach(x=>{
      const a=pos[x.id];if(!a) return;
      const isC=crit.links.has(x.id+'>'+t.id),sg=b.yc>a.yc?1:-1;
      let d;const xo=a.x2+6,ym=a.yc+sg*TL.ROW/2;     // just past the bar, then the row edge
      const tx=b.gate?b.cx:b.x1+5,ty=b.gate?b.yc-sg*9:b.yc-sg*(TL.ROW/2-8);
      if(tx>=xo) d=`M${a.x2} ${a.yc}H${xo}V${ym}H${tx}V${ty}`;
      else{const yb=b.yc-sg*TL.ROW/2;d=`M${a.x2} ${a.yc}H${xo}V${yb}H${b.x1-8}V${b.yc}H${b.x1}`;}
      const pt=findTask(p,x.id),lag=parseInt(x.lag)||0;
      arrows+=`<path class="tl-arrow ${isC?'crit':''}" d="${d}" marker-end="url(#${isC?'tlArrC':'tlArr'})"/>
        <path class="tl-hit" d="${d}" data-act="rm-link" data-id="${t.id}" data-pred="${x.id}"><title>#${pt.num} → #${t.num}${lag?` (+${lag} workdays)`:''} · click to remove</title></path>`;
    });
  });
  const tx=X(today)+dw/2;
  const svg=`<svg class="tl-svg" id="tlSvg" width="${W}" height="${H}" style="left:${LW}px;top:${TL.HEAD_H}px">
    <defs><marker id="tlArr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" class="tl-arrhead"/></marker>
    <marker id="tlArrC" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" class="tl-arrhead crit"/></marker></defs>
    ${bg}${grid}<line class="tl-today" x1="${tx}" x2="${tx}" y1="0" y2="${H}"/>${arrows}${body}</svg>`;

  h+=`<div class="tl-wrap" id="tlWrap"><div class="tl-content" style="width:${LW+W}px;height:${TL.HEAD_H+H}px">
    <div class="tl-head" style="height:${TL.HEAD_H}px">
      <div class="tl-corner" style="width:${LW}px">${rows.filter(r=>r.kind==='task').length} rows · ${crit.tasks.size?`<span class="txt-bad">${crit.tasks.size} critical</span>`:'no critical path'}</div>
      <div class="tl-scale" style="left:${LW}px;width:${W}px"><div class="tl-top">${top}</div><div class="tl-bot">${bot}</div>
        <div class="tl-now" style="left:${tx}px"></div></div>
    </div>
    <div class="tl-labels" style="width:${LW}px">${labels}</div>
    ${svg}
  </div></div>`;
  PV._tl={R,dw,X};
  return h;
}

// after the HTML is in place: restore scroll, wire up drag-to-link
function pvTimelineAfter(){
  const w=document.getElementById('tlWrap');if(!w) return;
  if(PV.tlScroll){w.scrollLeft=PV.tlScroll.x;w.scrollTop=PV.tlScroll.y;}
  else tlScrollToday();
  w.addEventListener('scroll',()=>{PV.tlScroll={x:w.scrollLeft,y:w.scrollTop};});
  const svg=document.getElementById('tlSvg');
  svg.addEventListener('pointerdown',tlDragStart);
  svg.addEventListener('pointermove',tlDragMove);
  svg.addEventListener('pointerup',tlDragEnd);
  svg.addEventListener('pointercancel',tlDragCancel);
  svg.addEventListener('click',e=>{if(TL.justDragged){e.stopPropagation();e.preventDefault();}},true);
}
function tlScrollToday(){
  const w=document.getElementById('tlWrap');if(!w||!PV._tl) return;
  w.scrollLeft=Math.max(0,PV._tl.X(todayStr())-(w.clientWidth-TL.LABEL_W)*0.2);
}

function tlPoint(svg,e){const r=svg.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function tlDragStart(e){
  const hd=e.target.closest('[data-handle]');if(!hd) return;
  e.preventDefault();e.stopPropagation();
  const svg=e.currentTarget,c=hd.getBoundingClientRect(),r=svg.getBoundingClientRect();
  const x0=c.left+c.width/2-r.left,y0=c.top+c.height/2-r.top;
  const line=document.createElementNS('http://www.w3.org/2000/svg','path');
  line.setAttribute('class','tl-dragline');line.setAttribute('d',`M${x0} ${y0}L${x0} ${y0}`);
  svg.appendChild(line);svg.setPointerCapture(e.pointerId);
  TL.drag={from:hd.dataset.handle,x0,y0,line,target:null};
  svg.classList.add('dragging');
}
function tlDragMove(e){
  const D=TL.drag;if(!D) return;
  const svg=e.currentTarget,pt=tlPoint(svg,e);
  D.line.setAttribute('d',`M${D.x0} ${D.y0}L${pt.x} ${pt.y}`);
  const el=document.elementFromPoint(e.clientX,e.clientY),g=el&&el.closest&&el.closest('[data-bar]');
  const id=g&&g.dataset.bar!==D.from?g.dataset.bar:null;
  if(id!==D.target){
    svg.querySelectorAll('.tl-drop').forEach(x=>x.classList.remove('tl-drop'));
    D.target=id;if(g&&id) g.classList.add('tl-drop');
  }
}
function tlDragEnd(e){
  const D=TL.drag;if(!D) return;
  tlDragCancel(e);
  TL.justDragged=true;setTimeout(()=>{TL.justDragged=false;},50);
  if(D.target) tlLink(D.from,D.target);
}
function tlDragCancel(e){
  const D=TL.drag;if(!D) return;
  const svg=document.getElementById('tlSvg');
  if(D.line.parentNode) D.line.remove();
  if(svg){svg.classList.remove('dragging');svg.querySelectorAll('.tl-drop').forEach(x=>x.classList.remove('tl-drop'));
    try{svg.releasePointerCapture(e.pointerId);}catch(_){}}
  TL.drag=null;
}
// predId must finish before succId starts
function tlLink(predId,succId){
  const p=pvProj();if(!p) return;
  const a=findTask(p,predId),t=findTask(p,succId);if(!a||!t) return;
  if((t.preds||[]).some(x=>x.id===predId)){toast(`#${t.num} already follows #${a.num}.`);return;}
  if(!canLink(p,succId,predId)){toast(`Can’t link: #${a.num} already depends on #${t.num}, so this would make a loop.`);return;}
  const wasLinked=!!(t.preds&&t.preds.length);
  t.preds=(t.preds||[]).concat([{id:predId,lag:0}]);
  if(!wasLinked&&!t.gate) t.start=null;
  runSchedule();
  pvCommit(`Linked: #${a.num} ${a.name} → #${t.num} ${t.name}`+(t.due?` (now ${t.gate?'forecast':'finishes'} ${fmtShort(t.gate?(t.fc||t.due):t.due)})`:''));
}
