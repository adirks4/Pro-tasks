'use strict';

// ══════════════════════════════════════════════════════════════════
//  SCHEDULING ENGINE  (Workspace 1 projects)
//
//  Subtask fields used here (all optional, older data keeps working):
//    num       stable task number within the project (#1, #2 …)
//    group     workstream label, e.g. "Launch › In-House Test Unit"
//    owner     '' = me; anything else = someone I'm waiting on
//    start     user-entered start. On a linked task it means "not before".
//    dur       duration in workdays (default 1)
//    preds     [{id, lag}]  finish-to-start links, lag in workdays
//    gate      true = milestone/gate (zero duration)
//    target    gate's committed date
//    deferrals how many times the date was pushed later by hand
//    doneOn    date it was completed
//  Written by the engine:
//    cs        computed start
//    due       computed finish (gates: max(target, forecast))
//    fc        gates only: forecast = when its linked tasks finish
// ══════════════════════════════════════════════════════════════════

const DEFAULT_HOLIDAYS=[
  {date:'2026-01-01',name:"New Year's Day"},{date:'2026-05-25',name:'Memorial Day'},
  {date:'2026-07-03',name:'Independence Day (obs.)'},{date:'2026-09-07',name:'Labor Day'},
  {date:'2026-11-26',name:'Thanksgiving'},{date:'2026-11-27',name:'Day after Thanksgiving'},
  {date:'2026-12-25',name:'Christmas'},
  {date:'2027-01-01',name:"New Year's Day"},{date:'2027-05-31',name:'Memorial Day'},
  {date:'2027-07-05',name:'Independence Day (obs.)'},{date:'2027-09-06',name:'Labor Day'},
  {date:'2027-11-25',name:'Thanksgiving'},{date:'2027-11-26',name:'Day after Thanksgiving'},
  {date:'2027-12-24',name:'Christmas (obs.)'}
];

function getCalendar(){
  if(!data.calendar) data.calendar={holidays:DEFAULT_HOLIDAYS.map(h=>({...h}))};
  if(!Array.isArray(data.calendar.holidays)) data.calendar.holidays=[];
  return data.calendar;
}
let _holidaySet=null,_holidayKey='';
function holidaySet(){
  const key=JSON.stringify(getCalendar().holidays.map(h=>h.date));
  if(key!==_holidayKey){_holidayKey=key;_holidaySet=new Set(getCalendar().holidays.map(h=>h.date));}
  return _holidaySet;
}

// ── date math on 'YYYY-MM-DD' strings (local time, never UTC) ──
const _pd=s=>new Date(s+'T00:00:00');
function addCalDays(s,n){const d=_pd(s);d.setDate(d.getDate()+n);return localDateStr(d);}
function isWorkday(s){const w=_pd(s).getDay();return w!==0&&w!==6&&!holidaySet().has(s);}
function nextWorkday(s){let d=s;for(let i=0;i<400&&!isWorkday(d);i++)d=addCalDays(d,1);return d;}
function prevWorkday(s){let d=s;for(let i=0;i<400&&!isWorkday(d);i++)d=addCalDays(d,-1);return d;}
// Move n workdays from s (n may be negative). n=0 returns s snapped forward to a workday.
function addWorkdays(s,n){
  let d=n>=0?nextWorkday(s):prevWorkday(s);
  const step=n>=0?1:-1;let left=Math.abs(n);
  while(left>0){d=addCalDays(d,step);if(isWorkday(d))left--;}
  return d;
}
// Inclusive count of workdays from a to b (a<=b). Returns 0 if b<a.
function workdaysBetween(a,b){
  if(!a||!b||b<a) return 0;
  let n=0,d=a;
  for(let i=0;i<2000&&d<=b;i++){if(isWorkday(d))n++;d=addCalDays(d,1);}
  return n;
}
function fmtShort(s){return s?_pd(s).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';}
function calDiff(s){if(!s)return null;return Math.round((_pd(s)-_pd(todayStr()))/86400000);}

// ── helpers on tasks ──
const isMine=t=>!t.owner||/^me$/i.test(t.owner.trim());
const taskDur=t=>t.gate?0:Math.max(1,parseInt(t.dur)||1);
function findTask(p,id){return (p.subtasks||[]).find(s=>s.id===id);}

// True if `from` (directly or indirectly) depends on `target`.
function dependsOn(p,from,target,seen=new Set()){
  if(from===target) return true;
  if(seen.has(from)) return false;seen.add(from);
  const t=findTask(p,from);if(!t||!t.preds) return false;
  return t.preds.some(x=>dependsOn(p,x.id,target,seen));
}
// Can `predId` be added as a predecessor of `taskId` without a loop?
function canLink(p,taskId,predId){return taskId!==predId&&!dependsOn(p,predId,taskId);}

// Effective date successors build on.
function finishFor(t){return t.done?(t.doneOn||t.due||null):(t.due||null);}

// ── main pass: tidy fields, then compute dates in dependency order ──
function scheduleProject(p){
  const subs=p.subtasks||(p.subtasks=[]);
  if(!p.nextNum) p.nextNum=1;
  const ids=new Set(subs.map(s=>s.id));
  subs.forEach(s=>{
    if(!s.num){s.num=p.nextNum++;} else if(s.num>=p.nextNum) p.nextNum=s.num+1;
    if(s.preds){s.preds=s.preds.filter(x=>x&&ids.has(x.id)&&x.id!==s.id);if(!s.preds.length)delete s.preds;}
    if(s.checks){s.checks=s.checks.filter(id=>findCheck(p,id));if(!s.checks.length)delete s.checks;}
    if(s.done&&!s.doneOn) s.doneOn=todayStr();
    if(!s.done&&s.doneOn) delete s.doneOn;
  });
  // topological order (Kahn); anything stuck in a loop is scheduled last without its links
  const indeg=new Map(subs.map(s=>[s.id,0])),out=new Map(subs.map(s=>[s.id,[]]));
  subs.forEach(s=>(s.preds||[]).forEach(x=>{indeg.set(s.id,indeg.get(s.id)+1);out.get(x.id).push(s.id);}));
  const q=subs.filter(s=>indeg.get(s.id)===0).map(s=>s.id),order=[];
  while(q.length){const id=q.shift();order.push(id);out.get(id).forEach(n=>{indeg.set(n,indeg.get(n)-1);if(indeg.get(n)===0)q.push(n);});}
  const placed=new Set(order);subs.forEach(s=>{if(!placed.has(s.id))order.push(s.id);});

  order.forEach(id=>{
    const t=findTask(p,id);
    if(t.done) return;                                  // finished work keeps its dates
    const dur=taskDur(t);
    // earliest start allowed by links
    let es=null,blocked=false;
    (t.preds||[]).forEach(x=>{
      const pt=findTask(p,x.id);const f=pt&&finishFor(pt);
      if(!f){blocked=true;return;}
      const lag=parseInt(x.lag)||0;
      const s=t.gate?addWorkdays(f,lag):addWorkdays(f,1+lag);
      if(!es||s>es) es=s;
    });
    if(t.gate){
      t.fc=es||null;
      if(blocked) t.fc=null;
      const tgt=t.target||null;
      t.cs=null;
      t.due=(tgt&&t.fc)?(t.fc>tgt?t.fc:tgt):(tgt||t.fc||null);
      return;
    }
    if(t.preds&&t.preds.length){
      if(blocked&&!es){                                 // linked only to undated tasks
        if(t.start){es=nextWorkday(t.start);} else {t.cs=null;t.due=null;return;}
      }
      if(t.start){const c=nextWorkday(t.start);if(c>es)es=c;}
      t.cs=es;t.due=addWorkdays(es,dur-1);
      return;
    }
    if(t.start){t.cs=nextWorkday(t.start);t.due=addWorkdays(t.cs,dur-1);return;}
    if(t.due){t.cs=dur>1?addWorkdays(t.due,-(dur-1)):t.due;return;}   // finish-anchored (older tasks)
    t.cs=null;
  });
}

function runSchedule(){
  if(!data||!data.ws||!data.ws[0]) return;
  getCalendar();
  (data.ws[0].projects||[]).forEach(scheduleProject);
}

// ══════════════════════════════════════════════════════════════════
//  SETTING DATES FROM ANYWHERE (chips, defer buttons, needs-a-date queue)
//  Moves the task so it FINISHES on `val`, keeping its duration.
//  Returns a message if links prevent that date.
// ══════════════════════════════════════════════════════════════════
function setTaskDue(t,val,p){
  const old=t.gate?(t.target||null):(t.due||null);
  if(!val){                                            // clearing
    if(t.gate){t.target=null;} else {t.due=null;t.start=null;}
    return null;
  }
  if(old&&val>old) t.deferrals=(t.deferrals||0)+1;
  if(t.gate){t.target=val;return null;}
  const dur=taskDur(t);
  const linked=t.preds&&t.preds.length;
  if(linked||t.start){
    t.start=dur>1?addWorkdays(val,-(dur-1)):val;
  }else{
    t.due=val;
  }
  if(p&&linked){
    scheduleProject(p);
    if(t.due&&t.due>val){
      const lim=t.preds.map(x=>findTask(p,x.id)).filter(Boolean).map(x=>'#'+x.num).join(', ');
      return 'Linked after '+lim+' — earliest finish is '+fmtShort(t.due)+'.';
    }
  }
  return null;
}
// "+1 week" style pushes: calendar days from the current date (or today), landing on a workday.
function deferDate(cur,days){
  const base=cur&&cur>todayStr()?cur:todayStr();
  return nextWorkday(addCalDays(base,days));
}

// ══════════════════════════════════════════════════════════════════
//  CHECKS — documentation / QC / training items with a red-green light
//  p.checks: [{id,name,cat,state,owner,due,rev,link,every,approvedOn,notes,hist,deferrals}]
//    state  'missing' → 'draft' → 'review' → 'approved'
//    every  re-review interval in months (optional); approval goes stale after it
// ══════════════════════════════════════════════════════════════════
const CK_STATES=['missing','draft','review','approved'];
const CK_LABEL={missing:'Not started',draft:'Drafted',review:'In review',approved:'Approved'};
function getChecks(p){if(!p.checks)p.checks=[];return p.checks;}
function findCheck(p,id){return (p.checks||[]).find(c=>c.id===id);}
function addCalMonths(s,n){const d=_pd(s);const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);
  const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return localDateStr(d);}
// when an approval needs re-review (null if it never expires)
function checkExpiry(c){return c.state==='approved'&&c.every&&c.approvedOn?addCalMonths(c.approvedOn,parseInt(c.every)):null;}
// approved and not stale
function checkOK(c){if(c.state!=='approved')return false;const e=checkExpiry(c);return !e||e>=todayStr();}
// the date that matters for this check right now
function checkDate(c){return c.state==='approved'?checkExpiry(c):(c.due||null);}
function checkStatus(c){
  const today=todayStr();
  if(c.state==='approved'){
    const e=checkExpiry(c);
    if(e&&e<today) return {color:'red',label:'Re-review overdue'};
    if(e&&calDiff(e)<=14) return {color:'amber',label:'Re-review in '+calDiff(e)+'d'};
    return {color:'green',label:'Approved'};
  }
  if(!c.due) return {color:'red',label:'No date'};
  if(c.due<today) return {color:'red',label:'Overdue'};
  if(calDiff(c.due)<=14) return {color:'amber',label:'Due in '+calDiff(c.due)+'d'};
  return {color:'gray',label:CK_LABEL[c.state]||'Not started'};
}
function setCheckState(c,st){
  if(!CK_STATES.includes(st)||c.state===st) return;
  c.state=st;
  if(st==='approved') c.approvedOn=todayStr(); else delete c.approvedOn;
  (c.hist||(c.hist=[])).push({d:todayStr(),s:st});
}

// ══════════════════════════════════════════════════════════════════
//  INVENTORY · UNITS · ISSUES · TESTS  (Phase 4)
//  p.stock  [{id,name,cat,unit,onHand,min,perUnit,leadDays,onOrder,orderDue,loc,notes,log:[{d,delta,qty,note}]}]
//  p.units  [{id,serial,batch,model,status,customer,shipDate,lic,licExp,fw,notes}]
//  p.issues [{id,code,name,sev,status,owner,due,unit,gate,notes,closedOn,deferrals}]
//  p.tests  [{id,name,unit,status,ranOn,gate,issue,notes}]
// ══════════════════════════════════════════════════════════════════
const UNIT_STATUSES=['Planned','Building','Testing','Ready','Shipped','Installed','Returned'];
const ISSUE_STATUSES=['Open','Investigating','Fix ready','Closed'];
const ISSUE_SEV=['Low','Medium','High','Critical'];
const TEST_STATUSES=['Not run','Running','Pass','Fail','Blocked'];
const listOf=(p,k)=>p[k]||(p[k]=[]);
const findIn=(p,k,id)=>(p[k]||[]).find(x=>x.id===id);

function stockStatus(s){
  const q=+s.onHand||0,m=+s.min||0;
  if(m>0&&q<=m) return s.onOrder?{color:'amber',label:'Low · on order'}:{color:'red',label:q<=0?'Out of stock':'Below minimum'};
  if(m>0&&q<=Math.ceil(m*1.25)) return {color:'amber',label:'Near minimum'};
  return {color:'green',label:s.onOrder?'OK · on order':'OK'};
}
// license on a unit: red expired, amber within 30 days
function licenseStatus(u){
  if(!u.licExp) return null;
  const d=calDiff(u.licExp);
  if(d<0) return {color:'red',label:'License expired'};
  if(d<=30) return {color:'amber',label:'License expires in '+d+'d'};
  return {color:'green',label:'Licensed to '+fmtShort(u.licExp)};
}
const issueOpen=i=>i.status!=='Closed';
function issueStatus(i){
  if(!issueOpen(i)) return {color:'green',label:'Closed'};
  if(!i.due) return {color:'red',label:'No date'};
  if(i.due<todayStr()) return {color:'red',label:'Overdue'};
  if(i.sev==='Critical'||i.sev==='High') return {color:'amber',label:i.sev};
  if(calDiff(i.due)<=14) return {color:'amber',label:'Due in '+calDiff(i.due)+'d'};
  return {color:'gray',label:i.status};
}
function testStatus(t){
  return {Pass:{color:'green',label:'Pass'},Fail:{color:'red',label:'Fail'},Blocked:{color:'amber',label:'Blocked'},Running:{color:'gray',label:'Running'}}[t.status]||{color:'gray',label:'Not run'};
}

// Low stock → a "Reorder …" task (due today). Placing the order or restocking completes it.
// Returns the names of items that just got a new reorder task.
function inventorySweep(p){
  const made=[];
  (p.stock||[]).forEach(s=>{
    const st=stockStatus(s),low=(+s.min||0)>0&&(+s.onHand||0)<=(+s.min||0);
    const task=(p.subtasks||[]).find(t=>t.stockId===s.id&&!t.done);
    if(low&&!s.onOrder&&!task){
      if(!p.subtasks)p.subtasks=[];
      const nm=s.name.toLowerCase(),grp=(p.subtasks.map(t=>t.group||'').find(g=>{const l=g.toLowerCase();return l===nm||l.endsWith(' › '+nm);}))||s.cat||'Inventory';
      p.subtasks.push({id:uid(),name:'Reorder '+s.name,group:grp,status:'Next',done:false,due:todayStr(),stockId:s.id,
        notes:`Created automatically: ${s.onHand||0} ${s.unit||''} on hand, minimum ${s.min}.`+(s.leadDays?` Lead time about ${s.leadDays} days.`:'')});
      made.push(s.name);
    }else if(task&&(s.onOrder||!low)){
      task.done=true;task.status='Done';
    }
  });
  return made;
}
function runInventory(){
  if(!data||!data.ws||!data.ws[0]) return [];
  return (data.ws[0].projects||[]).flatMap(inventorySweep);
}

// ══════════════════════════════════════════════════════════════════
//  GATE STATUS
//  green  = every linked task done (or gate passed)
//  red    = target passed, a linked task overdue, or forecast after target
//  amber  = open criteria within 14 days, or a linked task has no date
//  gray   = on track
// ══════════════════════════════════════════════════════════════════
function gateStatus(p,g){
  const crit=(g.preds||[]).map(x=>findTask(p,x.id)).filter(Boolean);
  const cks=(g.checks||[]).map(id=>findCheck(p,id)).filter(Boolean);
  const iss=(p.issues||[]).filter(i=>i.gate===g.id),tst=(p.tests||[]).filter(t=>t.gate===g.id);
  const met=crit.filter(t=>t.done).length+cks.filter(checkOK).length+iss.filter(i=>!issueOpen(i)).length+tst.filter(t=>t.status==='Pass').length;
  const total=crit.length+cks.length+iss.length+tst.length;
  const r={color:'gray',label:'On track',reasons:[],met,total,crit,cks,iss,tst};
  if(g.done){r.color='green';r.label='Passed'+(g.doneOn?' '+fmtShort(g.doneOn):'');return r;}
  if(!g.target) r.reasons.push('No target date');
  if(total&&met===total){r.color='green';r.label='Ready';return r;}
  const today=todayStr();
  const overdue=crit.filter(t=>!t.done&&t.due&&t.due<today);
  const undated=crit.filter(t=>!t.done&&!t.due);
  if(g.target&&g.target<today) r.reasons.push('Target date passed');
  if(overdue.length) r.reasons.push(overdue.length+' linked task'+(overdue.length>1?'s':'')+' overdue');
  if(g.target&&g.fc&&g.fc>g.target) r.reasons.push('Forecast '+fmtShort(g.fc)+' is after target');
  const ckOpen=cks.filter(c=>!checkOK(c));
  const ckLate=ckOpen.filter(c=>{const d=checkDate(c);return d&&d<today;});
  if(ckLate.length) r.reasons.push(ckLate.length+' check'+(ckLate.length>1?'s':'')+' overdue');
  const ckAfter=ckOpen.filter(c=>{const d=checkDate(c);return d&&g.target&&d>g.target&&d>=today;});
  if(ckAfter.length) r.reasons.push(ckAfter.map(c=>c.name).join(', ')+' due after target');
  const isLate=iss.filter(i=>issueOpen(i)&&i.due&&i.due<today);
  if(isLate.length) r.reasons.push(isLate.length+' blocking issue'+(isLate.length>1?'s':'')+' overdue');
  const isAfter=iss.filter(i=>issueOpen(i)&&i.due&&g.target&&i.due>g.target&&i.due>=today);
  if(isAfter.length) r.reasons.push(isAfter.map(i=>i.code||i.name).join(', ')+' due after target');
  const tFail=tst.filter(t=>t.status==='Fail');
  if(tFail.length) r.reasons.push(tFail.length+' required test'+(tFail.length>1?'s':'')+' failed');
  if(r.reasons.some(x=>x!=='No target date')){r.color='red';r.label='At risk';return r;}
  const d=calDiff(g.target);
  if(undated.length) r.reasons.push(undated.length+' linked task'+(undated.length>1?'s have':' has')+' no date');
  const ckNoDate=ckOpen.filter(c=>!checkDate(c));
  if(ckNoDate.length) r.reasons.push(ckNoDate.length+' check'+(ckNoDate.length>1?'s have':' has')+' no date');
  const isNoDate=iss.filter(i=>issueOpen(i)&&!i.due);
  if(isNoDate.length) r.reasons.push(isNoDate.length+' blocking issue'+(isNoDate.length>1?'s have':' has')+' no date');
  if(undated.length||ckNoDate.length||isNoDate.length||(d!==null&&d<=14&&total>met)){r.color='amber';r.label=d!==null&&d<=14?'Due in '+d+'d':'Check dates';return r;}
  if(!total) r.reasons.push('No tasks or checks linked yet');
  return r;
}

// ══════════════════════════════════════════════════════════════════
//  CRITICAL PATH
//  A link "drives" a task when it is the one setting that task's date.
//  Critical = the driving chains behind (a) the project's last finish
//  and (b) any open gate whose forecast is later than its target.
//  Finished tasks are never critical.
// ══════════════════════════════════════════════════════════════════
function linkStart(p,t,x){
  const pt=findTask(p,x.id),f=pt&&finishFor(pt);if(!f) return null;
  const lag=parseInt(x.lag)||0;
  return t.gate?addWorkdays(f,lag):addWorkdays(f,1+lag);
}
function drivingPreds(p,t){
  if(t.done||!t.preds||!t.preds.length) return [];
  let es;
  if(t.gate){
    if(!t.fc) return [];
    if(t.target&&t.fc<t.target) return [];          // the target date, not the links, sets this gate
    es=t.fc;
  }else{
    if(!t.cs) return [];
    es=t.cs;
    const fromLinks=t.preds.map(x=>linkStart(p,t,x)).filter(Boolean).sort().pop();
    if(!fromLinks||fromLinks<es) return [];          // held later by its "not before" date
  }
  return t.preds.filter(x=>linkStart(p,t,x)===es).map(x=>findTask(p,x.id)).filter(pt=>pt&&!pt.done);
}
function criticalPath(p){
  const tasks=new Set(),links=new Set();
  const walk=t=>{
    if(tasks.has(t.id)) return;tasks.add(t.id);
    drivingPreds(p,t).forEach(pt=>{links.add(pt.id+'>'+t.id);walk(pt);});
  };
  const open=(p.subtasks||[]).filter(t=>!t.done&&t.due);
  const end=open.reduce((m,t)=>t.due>m?t.due:m,'');
  // only chains of linked work count toward the finish; a lone unlinked task is just "last"
  open.filter(t=>t.due===end).forEach(t=>{if(drivingPreds(p,t).length||open.some(s=>(s.preds||[]).some(x=>x.id===t.id)))walk(t);});
  open.filter(t=>t.gate&&t.fc&&t.target&&t.fc>t.target).forEach(walk);
  return {tasks,links,end};
}
