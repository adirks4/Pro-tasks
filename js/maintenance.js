'use strict';

// ── MAINTENANCE (Pro-tasks) ──
const PT_PROJ_COLORS=['#7a9e8e','#5b8fa8','#9b8ea0','#c49a7a','#7a8fa8','#a89e7a','#c17b6a','#8fa87a'];
function addDays_pt(s,n){const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return localDateStr(d);}
function addMonths_pt(s,n){const d=new Date(s+'T00:00:00');d.setMonth(d.getMonth()+n);return localDateStr(d);}
function nextDueDate_pt(m){
  const today=todayStr(),anchor=m.anchor||today;
  function adv(d){
    if(m.freq==='daily')return addDays_pt(d,1);
    if(m.freq==='every_n_days')return addDays_pt(d,parseInt(m.interval)||7);
    if(m.freq==='weekly')return addDays_pt(d,7);
    if(m.freq==='biweekly')return addDays_pt(d,14);
    if(m.freq==='monthly_date')return addMonths_pt(d,1);
    if(m.freq==='every_n_months')return addMonths_pt(d,parseInt(m.interval)||3);
    return addDays_pt(d,1);
  }
  let d=anchor;while(d<today)d=adv(d);return d;
}
function maintDiffDays_pt(m){const due=nextDueDate_pt(m);const now=new Date();now.setHours(0,0,0,0);return Math.round((new Date(due+'T00:00:00')-now)/86400000);}
function maintDateLabel_pt(diff){if(diff<0)return '⚠ Overdue by '+Math.abs(diff)+'d';if(diff===0)return '● Due today';if(diff===1)return 'Due tomorrow';return 'Due in '+diff+'d';}
function maintDateClass_pt(diff){if(diff<0)return 'overdue-lbl';if(diff===0)return 'today-lbl';if(diff<=2)return 'soon-lbl';return '';}
function freqLabel_pt(m){const map={daily:'Daily',every_n_days:'Every '+(m.interval||7)+'d',weekly:'Weekly',biweekly:'Bi-weekly',monthly_date:'Monthly',every_n_months:'Every '+(m.interval||3)+'mo'};return map[m.freq]||m.freq;}

function getMaintData(){const w=ws();if(!w.maintCategories)w.maintCategories=[];return w.maintCategories;}

function renderMaintenance(){
  const list=document.getElementById('maintList');if(!list)return;
  const cats=getMaintData();
  if(!cats.length){list.innerHTML='<div class="empty-state"><div class="ei">🔧</div>No maintenance categories yet.</div>';return;}
  list.innerHTML='';
  cats.forEach((cat,cidx)=>{
    const color=cat.color||PT_PROJ_COLORS[cidx%PT_PROJ_COLORS.length];
    const isFirst=cidx===0,isLast=cidx===cats.length-1;
    const hasTasks=cat.tasks&&cat.tasks.length>0;
    const grp=document.createElement('div');grp.className='maint-cat-group';
    const hdr=document.createElement('div');hdr.className='maint-cat-hdr'+(hasTasks?'':' solo');hdr.style.boxShadow='inset 3px 0 0 '+color;
    hdr.innerHTML=
      '<div class="move-btns">'
      +'<button class="move-btn" data-cid="'+cat.id+'" data-dir="-1" '+(isFirst?'disabled':'')+'>▲</button>'
      +'<button class="move-btn" data-cid="'+cat.id+'" data-dir="1" '+(isLast?'disabled':'')+'>▼</button>'
      +'</div>'
      +'<div class="maint-cat-name-cell">'
      +'<span class="maint-cat-color-dot" style="background:'+color+'"></span>'
      +'<button class="collapse-btn '+(cat.collapsed?'collapsed':'')+'" data-cid2="'+cat.id+'" style="color:'+color+'">▼</button>'
      +'<div class="maint-cat-name" contenteditable="true" data-cid3="'+cat.id+'" style="color:'+color+'">'+escHtml(cat.name)+'</div>'
      +'<button class="add-maint-task-btn" data-cid4="'+cat.id+'">+ task</button>'
      +'</div>'
      +'<div style="padding:12px 4px 0 0;font-size:0.7em;color:var(--text3)">'+(cat.tasks||[]).length+' task'+((cat.tasks||[]).length===1?'':'s')+'</div>'
      +'<div class="c-del"><button class="del-btn" data-cid5="'+cat.id+'">✕</button></div>';
    // Attach event handlers instead of inline onclick
    hdr.querySelectorAll('[data-cid]').forEach(b=>{if(b.dataset.dir)b.addEventListener('click',()=>moveMaintCat_pt(cat.id,parseInt(b.dataset.dir)));});
    hdr.querySelector('[data-cid2]')?.addEventListener('click',()=>toggleMaintCat_pt(cat.id));
    hdr.querySelector('[data-cid3]')?.addEventListener('blur',function(){updateMaintCatName_pt(cat.id,this);});
    hdr.querySelector('[data-cid4]')?.addEventListener('click',()=>openMaintModal(null,cat.id));
    hdr.querySelector('[data-cid5]')?.addEventListener('click',()=>deleteMaintCat_pt(cat.id));

    grp.appendChild(hdr);
    if(hasTasks){
      const taskWrap=document.createElement('div');taskWrap.className='maint-cat-tasks'+(cat.collapsed?' collapsed':'');
      [...cat.tasks].sort((a,b)=>{const da=nextDueDate_pt(a),db=nextDueDate_pt(b);return da<db?-1:da>db?1:0;}).forEach(m=>{
        const diff=maintDiffDays_pt(m);const due=nextDueDate_pt(m);
        const row=document.createElement('div');row.className='maint-row';
        const cid='mchk-pt-'+m.id;
        row.innerHTML='<div class="c-check"><input type="checkbox" class="t-check" id="'+cid+'"><label class="check-vis" for="'+cid+'"></label></div>'
          +'<div class="c-name"><div style="flex:1"><div class="t-name tm-open" style="cursor:pointer">'+escHtml(m.name)+'</div>'
          +'<div class="maint-meta"><span class="maint-next-date '+maintDateClass_pt(diff)+'">'+maintDateLabel_pt(diff)+' · '+due+'</span></div></div></div>'
          +'<div class="c-status"><span class="freq-badge fb-open">'+freqLabel_pt(m)+'</span></div>'
          +'<div class="c-del"><button class="del-btn mt-del">✕</button></div>';
        row.querySelector('.tm-open').addEventListener('click',()=>openMaintModal(m.id,cat.id));
        row.querySelector('.fb-open').addEventListener('click',()=>openMaintModal(m.id,cat.id));
        row.querySelector('.mt-del').addEventListener('click',()=>deleteMaintTaskFromCat_pt(cat.id,m.id));
        row.querySelector('.t-check').addEventListener('change',function(){if(this.checked){completeMaintTaskInCat_pt(cat.id,m.id);this.checked=false;}});
        taskWrap.appendChild(row);
      });
      grp.appendChild(taskWrap);
    }
    list.appendChild(grp);
  });
}

function addMaintCategory(){
  const cats=getMaintData();const idx=cats.length;
  cats.push({id:uid(),name:'New Category',color:PT_PROJ_COLORS[idx%PT_PROJ_COLORS.length],collapsed:false,tasks:[]});
  save_render();
}
function moveMaintCat_pt(id,dir){const cats=getMaintData();const idx=cats.findIndex(c=>c.id===id);if(idx===-1)return;const ni=idx+dir;if(ni<0||ni>=cats.length)return;[cats[idx],cats[ni]]=[cats[ni],cats[idx]];save_render();}
function toggleMaintCat_pt(id){const cat=getMaintData().find(c=>c.id===id);if(!cat)return;cat.collapsed=!cat.collapsed;save_render();}
function updateMaintCatName_pt(id,el){const cat=getMaintData().find(c=>c.id===id);if(cat&&el.innerText.trim())cat.name=el.innerText.trim();scheduleSync();}
function deleteMaintCat_pt(id){if(!confirm('Delete this category and all its tasks?'))return;ws().maintCategories=(ws().maintCategories||[]).filter(c=>c.id!==id);save_render();}
function deleteMaintTaskFromCat_pt(catId,tid){if(!confirm('Delete this task?'))return;const cat=getMaintData().find(c=>c.id===catId);if(cat)cat.tasks=(cat.tasks||[]).filter(x=>x.id!==tid);save_render();}
function completeMaintTaskInCat_pt(catId,tid){
  const cat=getMaintData().find(c=>c.id===catId);if(!cat)return;
  const m=(cat.tasks||[]).find(x=>x.id===tid);if(!m)return;
  const today=todayStr();m.lastDone=today;
  function adv(d){if(m.freq==='daily')return addDays_pt(d,1);if(m.freq==='every_n_days')return addDays_pt(d,parseInt(m.interval)||7);if(m.freq==='weekly')return addDays_pt(d,7);if(m.freq==='biweekly')return addDays_pt(d,14);if(m.freq==='monthly_date')return addMonths_pt(d,1);if(m.freq==='every_n_months')return addMonths_pt(d,parseInt(m.interval)||3);return addDays_pt(d,1);}
  m.anchor=adv(m.anchor||today);while(m.anchor<today)m.anchor=adv(m.anchor);
  save_render();
}

let _editingMaintId_pt=null,_editingMaintCatId_pt=null;
function openMaintModal(taskId,catId){
  _editingMaintId_pt=taskId||null;_editingMaintCatId_pt=catId||null;
  const cats=getMaintData();
  const sel=document.getElementById('maintCatSelect');sel.innerHTML='';
  cats.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;if(c.id===catId)o.selected=true;sel.appendChild(o);});
  document.getElementById('maintCatSelectWrap').style.display=cats.length?'':'none';
  let m=null;
  if(taskId){for(const c of cats){m=c.tasks&&c.tasks.find(x=>x.id===taskId);if(m){_editingMaintCatId_pt=c.id;break;}}}
  document.getElementById('maintModalTitle').innerText=m?'Edit Task':'New Task';
  document.getElementById('maintName').value=m?m.name:'';
  document.getElementById('maintFreq').value=m?m.freq:'weekly';
  document.getElementById('maintInterval').value=m?m.interval||7:7;
  document.getElementById('maintAnchor').value=m?m.anchor||todayStr():todayStr();
  document.getElementById('maintDeleteBtn').style.display=m?'':'none';
  onMaintFreqChange();
  document.getElementById('maintOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('maintName').focus(),50);
}
function closeMaintModal(){document.getElementById('maintOverlay').classList.remove('open');_editingMaintId_pt=null;_editingMaintCatId_pt=null;}
function onMaintFreqChange(){const f=document.getElementById('maintFreq').value;const show=f==='every_n_days'||f==='every_n_months';document.getElementById('maintIntervalWrap').style.display=show?'':'none';document.getElementById('maintIntervalLabel').innerText=f==='every_n_months'?'Every how many months?':'Every how many days?';}
function saveMaintTask(){
  const name=document.getElementById('maintName').value.trim();if(!name)return;
  const freq=document.getElementById('maintFreq').value;
  const interval=parseInt(document.getElementById('maintInterval').value)||7;
  const anchor=document.getElementById('maintAnchor').value||todayStr();
  const cats=getMaintData();
  let targetCatId=_editingMaintCatId_pt||document.getElementById('maintCatSelect').value||null;
  if(!targetCatId&&cats.length)targetCatId=cats[0].id;
  if(_editingMaintId_pt){
    for(const c of cats){const m=c.tasks&&c.tasks.find(x=>x.id===_editingMaintId_pt);if(m){Object.assign(m,{name,freq,interval,anchor});const nc=document.getElementById('maintCatSelect').value;if(nc&&c.id!==nc){c.tasks=c.tasks.filter(x=>x.id!==_editingMaintId_pt);const nc2=cats.find(x=>x.id===nc);if(nc2)nc2.tasks.push(m);}break;}}
  } else {
    const taskObj={id:uid(),name,freq,interval,anchor,lastDone:null};
    const cat=cats.find(c=>c.id===targetCatId);if(cat){if(!cat.tasks)cat.tasks=[];cat.tasks.push(taskObj);}
  }
  closeMaintModal();save_render();
}
function deleteMaintTask(){if(!_editingMaintId_pt||!confirm('Delete this task?'))return;for(const c of getMaintData()){if(c.tasks&&c.tasks.some(x=>x.id===_editingMaintId_pt)){c.tasks=c.tasks.filter(x=>x.id!==_editingMaintId_pt);break;}}closeMaintModal();save_render();}
