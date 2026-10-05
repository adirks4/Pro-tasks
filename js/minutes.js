'use strict';

// ══════════════════════════════════════════════════════════════════
//  MEETING MINUTES (ephemeral — no persistence)
// ══════════════════════════════════════════════════════════════════
let _mmActionCount=0;
function openMM(){
  // Reset form — no persistence
  document.getElementById('mm-date').value=todayStr();
  document.getElementById('mm-people').value='';
  document.getElementById('mm-mode').value='';
  document.getElementById('mm-agenda').value='';
  document.getElementById('mm-minutes').value='';
  document.getElementById('mm-actions-list').innerHTML='';
  _mmActionCount=0;
  // Populate project selector
  const sel=document.getElementById('mm-proj-sel');sel.innerHTML='<option value="">-- Select project --</option>';
  ws().projects.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;sel.appendChild(o);});
  document.getElementById('mmOverlay').classList.add('open');
}
function closeMM(){document.getElementById('mmOverlay').classList.remove('open');}

function addMMAction(){
  _mmActionCount++;
  const list=document.getElementById('mm-actions-list');
  const row=document.createElement('div');row.className='mm-action-row';row.dataset.n=_mmActionCount;
  row.innerHTML=`<input type="text" class="mm-field" placeholder="Action item description…" style="font-size:0.85em;padding:6px 8px">
    <select class="mm-proj-sel" style="width:140px">
      <option value="">Use page default</option>
      ${ws().projects.map(p=>`<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
    </select>
    <button onclick="this.closest('.mm-action-row').remove()" style="background:none;border:1px solid var(--border);color:var(--text3);padding:5px 8px;border-radius:4px;cursor:pointer;font-family:var(--font);font-size:0.8em">✕</button>`;
  list.appendChild(row);
  setTimeout(()=>row.querySelector('input').focus(),30);
}

function commitMMActions(){
  const defaultProjId=document.getElementById('mm-proj-sel').value;
  const rows=document.querySelectorAll('#mm-actions-list .mm-action-row');
  let added=0;
  rows.forEach(row=>{
    const name=row.querySelector('input').value.trim();if(!name)return;
    const projId=row.querySelector('select').value||defaultProjId;
    const p=ws().projects.find(x=>x.id===projId);
    if(p){if(!p.subtasks)p.subtasks=[];p.subtasks.push({id:uid(),name,status:'Next',done:false,due:null});added++;}
  });
  if(!added){alert('No action items to add, or no project selected.');return;}
  scheduleSync();render();
  alert(`✓ Added ${added} action item${added!==1?'s':''} to project.`);
  document.getElementById('mm-actions-list').innerHTML='';_mmActionCount=0;
}

async function exportMMtoDocx(){
  const date=document.getElementById('mm-date').value||todayStr();
  const people=document.getElementById('mm-people').value.trim();
  const mode=document.getElementById('mm-mode').value.trim();
  const agenda=document.getElementById('mm-agenda').value.trim();
  const minutes=document.getElementById('mm-minutes').value.trim();
  const actionRows=document.querySelectorAll('#mm-actions-list .mm-action-row');
  const actions=[...actionRows].map(r=>r.querySelector('input').value.trim()).filter(Boolean);

  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function para(text,opts={}){
    const style=opts.heading?`<w:pStyle w:val="${opts.heading}"/>`:'';
    const bold=opts.bold?'<w:b/>':'';
    const rPr=bold?`<w:rPr>${bold}</w:rPr>`:'';
    const pPr=style?`<w:pPr>${style}</w:pPr>`:'';
    return String(text||'').split('\n').map((l,i)=>
      `<w:p>${i===0?pPr:''}<w:r>${rPr}<w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p>`
    ).join('');
  }
  const h1=t=>para(t,{heading:'Heading1'});
  const h2=t=>para(t,{heading:'Heading2'});
  const blank=()=>'<w:p><w:r><w:t></w:t></w:r></w:p>';

  let body=h1('Meeting Minutes');
  body+=para(`Date: ${date}`,{bold:true});
  if(people)body+=para(`Attendees: ${people}`);
  if(mode)body+=para(`Mode: ${mode}`);
  body+=blank();
  if(agenda){body+=h2('Agenda');body+=para(agenda);body+=blank();}
  if(minutes){body+=h2('Minutes');body+=para(minutes);body+=blank();}
  if(actions.length){body+=h2('Action Items');actions.forEach((a,i)=>{body+=para(`${i+1}. ${a}`);});}

  const docXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style></w:styles>`;
  const relsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const appRelsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const ctXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

  const enc=new TextEncoder();
  const crc32t=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?(0xEDB88320^(c>>>1)):c>>>1;t[i]=c>>>0;}return t;})();
  const crc32=(buf)=>{let c=0xFFFFFFFF;const a=new Uint8Array(buf);for(let i=0;i<a.length;i++)c=((c>>>8)^crc32t[(c^a[i])&0xFF])>>>0;return(c^0xFFFFFFFF)>>>0;};
  const u16=(n)=>new Uint8Array([n&0xFF,(n>>8)&0xFF]);
  const u32=(n)=>{n=n>>>0;return new Uint8Array([n&0xFF,(n>>8)&0xFF,(n>>16)&0xFF,(n>>24)&0xFF]);};

  const files=[['[Content_Types].xml',ctXml],['_rels/.rels',appRelsXml],['word/document.xml',docXml],['word/styles.xml',stylesXml],['word/_rels/document.xml.rels',relsXml]];
  const parts=[];const cdirs=[];let off=0;
  for(const [name,content] of files){
    const nb=enc.encode(name),db=enc.encode(content),crc=crc32(db);
    const lh=new Uint8Array([0x50,0x4B,0x03,0x04,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(db.length),...u32(db.length),...u16(nb.length),0,0,...nb]);
    parts.push(lh);parts.push(db);
    cdirs.push({nb,crc,size:db.length,off});
    off+=lh.length+db.length;
  }
  const cdStart=off;
  for(const {nb,crc,size,off:fo} of cdirs){
    const cd=new Uint8Array([0x50,0x4B,0x01,0x02,20,0,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(size),...u32(size),...u16(nb.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(fo),...nb]);
    parts.push(cd);off+=cd.length;
  }
  const cdSize=off-cdStart;
  parts.push(new Uint8Array([0x50,0x4B,0x05,0x06,0,0,0,0,...u16(files.length),...u16(files.length),...u32(cdSize),...u32(cdStart),0,0]));
  const total=parts.reduce((a,b)=>a+b.length,0);
  const zip=new Uint8Array(total);let pos=0;
  for(const p of parts){zip.set(p,pos);pos+=p.length;}
  const blob=new Blob([zip],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`Meeting-${date}.docx`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
