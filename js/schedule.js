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
//  GATE STATUS
//  green  = every linked task done (or gate passed)
//  red    = target passed, a linked task overdue, or forecast after target
//  amber  = open criteria within 14 days, or a linked task has no date
//  gray   = on track
// ══════════════════════════════════════════════════════════════════
function gateStatus(p,g){
  const crit=(g.preds||[]).map(x=>findTask(p,x.id)).filter(Boolean);
  const met=crit.filter(t=>t.done).length,total=crit.length;
  const r={color:'gray',label:'On track',reasons:[],met,total,crit};
  if(g.done){r.color='green';r.label='Passed'+(g.doneOn?' '+fmtShort(g.doneOn):'');return r;}
  if(!g.target) r.reasons.push('No target date');
  if(total&&met===total){r.color='green';r.label='Ready';return r;}
  const today=todayStr();
  const overdue=crit.filter(t=>!t.done&&t.due&&t.due<today);
  const undated=crit.filter(t=>!t.done&&!t.due);
  if(g.target&&g.target<today) r.reasons.push('Target date passed');
  if(overdue.length) r.reasons.push(overdue.length+' linked task'+(overdue.length>1?'s':'')+' overdue');
  if(g.target&&g.fc&&g.fc>g.target) r.reasons.push('Forecast '+fmtShort(g.fc)+' is after target');
  if(r.reasons.some(x=>x!=='No target date')){r.color='red';r.label='At risk';return r;}
  const d=calDiff(g.target);
  if(undated.length) r.reasons.push(undated.length+' linked task'+(undated.length>1?'s have':' has')+' no date');
  if(undated.length||(d!==null&&d<=14&&total>met)){r.color='amber';r.label=d!==null&&d<=14?'Due in '+d+'d':'Check dates';return r;}
  if(!total) r.reasons.push('No tasks linked yet');
  return r;
}
