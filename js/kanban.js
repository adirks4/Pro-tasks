'use strict';

// ── KANBAN VIEW ──
let _kanbanMode=false;
// Per-project collapsed state in kanban (separate from list view)
// stored in p.kanbanCollapsed

function toggleKanbanView(){
  _kanbanMode=!_kanbanMode;
  document.getElementById('kanbanToggleBtn').classList.toggle('active',_kanbanMode);
  document.getElementById('projectsList').style.display=_kanbanMode?'none':'';
  document.getElementById('kanbanView').style.display=_kanbanMode?'':'none';
  if(_kanbanMode)renderKanban();
}

function renderKanban(){
  const kv=document.getElementById('kanbanView');if(!kv)return;
  kv.innerHTML='';
  const projects=ws().projects;
  if(!projects.length){kv.innerHTML='<div class="empty-state"><div class="ei">⬡</div>No projects yet</div>';return;}
  projects.forEach(p=>{
    const color=p.color||PROJ_COLORS[0];
    const subs=p.subtasks||[];
    const board=document.createElement('div');board.className='kanban-board';

    // ── Project header ──
    const isCollapsed=!!p.kanbanCollapsed;
    const hdr=document.createElement('div');
    hdr.className='kanban-proj-hdr'+(isCollapsed?' collapsed-hdr':'');
    hdr.style.boxShadow='inset 3px 0 0 '+color;
    hdr.innerHTML=
      '<div class="kanban-proj-color" style="background:'+color+'"></div>'
      +'<div class="kanban-proj-name">'+escHtml(p.name)+'</div>'
      +'<div class="kanban-proj-count">'+subs.filter(s=>!s.done).length+' open</div>'
      +'<div class="kanban-proj-actions" onclick="event.stopPropagation()">'
        +'<button class="kanban-proj-btn" data-pid="'+p.id+'">+ Subtask</button>'
        +'<button class="kanban-proj-btn del-action" data-pid="'+p.id+'">⬡ List view</button>'
      +'</div>'
      +'<div class="kanban-collapse-arrow'+(isCollapsed?' collapsed':'')+'">▼</div>';
    hdr.querySelectorAll('.kanban-proj-btn').forEach(btn=>{
      if(!btn.classList.contains('del-action'))
        btn.addEventListener('click',e=>{e.stopPropagation();addSubtask(p.id);});
      else
        btn.addEventListener('click',e=>{e.stopPropagation();_kanbanMode=false;document.getElementById('kanbanToggleBtn').classList.remove('active');document.getElementById('kanbanView').style.display='none';document.getElementById('projectsList').style.display='';renderProjects();});
    });
    hdr.addEventListener('click',()=>{
      p.kanbanCollapsed=!p.kanbanCollapsed;
      scheduleSync();renderKanban();
    });
    board.appendChild(hdr);

    // ── Columns ──
    const colsWrap=document.createElement('div');
    colsWrap.className='kanban-columns-wrap'+(isCollapsed?' collapsed':'');
    const cols=document.createElement('div');cols.className='kanban-columns';

    const KCOLS=[
      {key:'Waiting',cls:'kanban-col-waiting'},
      {key:'Next',   cls:'kanban-col-next'},
      {key:'Today',  cls:'kanban-col-today'},
      {key:'Done',   cls:'kanban-col-done'},
    ];
    KCOLS.forEach(({key,cls})=>{
      const colSubs=subs.filter(s=>s.status===key);
      const col=document.createElement('div');col.className='kanban-col '+cls;
      const colHdr=document.createElement('div');colHdr.className='kanban-col-hdr';
      colHdr.innerHTML='<span class="kanban-col-label">'+key+'</span><span class="kanban-col-count">'+colSubs.length+'</span>';
      col.appendChild(colHdr);
      const cards=document.createElement('div');cards.className='kanban-cards';
      if(!colSubs.length){
        const empty=document.createElement('div');empty.className='kanban-empty';empty.textContent='—';cards.appendChild(empty);
      }
      colSubs.forEach(s=>{
        const card=document.createElement('div');card.className='kanban-card'+(s.done?' done-card':'');
        // Check circle
        const ck=document.createElement('div');ck.className='kc-check'+(s.done?' checked':'');
        ck.addEventListener('click',e=>{
          e.stopPropagation();
          const proj=ws().projects.find(x=>x.id===p.id);
          const sub=proj&&proj.subtasks.find(x=>x.id===s.id);
          if(sub){sub.done=!sub.done;sub.status=sub.done?'Done':'Waiting';save_render_kanban();}
        });
        // Name
        const nm=document.createElement('div');nm.className='kc-name';nm.textContent=s.name;
        // Top row
        const top=document.createElement('div');top.className='kanban-card-top';top.appendChild(nm);top.appendChild(ck);
        card.appendChild(top);
        // Due chip if present
        if(s.due){
          const dc=document.createElement('div');dc.className='kc-due';
          dc.innerHTML='<span class="due-chip '+dueClass(s.due)+'">'+dueLabel(s.due)+'</span>';
          card.appendChild(dc);
        }
        // Move buttons — show other columns
        const moveRow=document.createElement('div');moveRow.className='kc-move';
        KCOLS.filter(c=>c.key!==key).forEach(({key:dest})=>{
          const mb=document.createElement('button');mb.className='kc-move-btn';
          mb.textContent='→ '+dest;
          mb.addEventListener('click',e=>{
            e.stopPropagation();
            const proj=ws().projects.find(x=>x.id===p.id);
            const sub=proj&&proj.subtasks.find(x=>x.id===s.id);
            if(sub){sub.status=dest;sub.done=dest==='Done';save_render_kanban();}
          });
          moveRow.appendChild(mb);
        });
        card.appendChild(moveRow);
        cards.appendChild(card);
      });
      col.appendChild(cards);
      cols.appendChild(col);
    });
    colsWrap.appendChild(cols);
    board.appendChild(colsWrap);
    kv.appendChild(board);
  });
}

function save_render_kanban(){
  save_render();
}

// Override render to also update kanban if active
// kanban is refreshed via save_render_kanban() and renderProjects() checks _kanbanMode
