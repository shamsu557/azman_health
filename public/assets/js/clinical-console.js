let csrf='',clinicians=[];

function clinicalIcon(name){
 const paths={edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
 delete:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
 refresh:'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/>',
 send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
 whatsapp:'<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20l1.2-5.2A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.5 8.5c.6 2.5 2 4 4.5 5"/>',
 open:'<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 close:'<path d="m18 6-12 12M6 6l12 12"/>'};
 return `<svg class="clinical-action-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.open}</svg>`;
}
function enhanceClinicalButtons(scope=document){
 const map={'Refresh shifts and coverage':'refresh','Refresh emergency requests':'refresh','Refresh chat':'refresh','Open consultant WhatsApp':'whatsapp','Send secure message':'send','Open consultation':'open','Respond':'check'};
 scope.querySelectorAll('button').forEach(btn=>{
  const label=(btn.textContent||'').trim();
  if(!map[label]||btn.dataset.clinicalIcon==='1')return;
  btn.title=label;btn.setAttribute('aria-label',label);btn.innerHTML=clinicalIcon(map[label]);btn.dataset.clinicalIcon='1';btn.classList.add('clinical-icon-button');
 });
}
const clinicalIconObserver=new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1)enhanceClinicalButtons(n)})));
clinicalIconObserver.observe(document.body,{childList:true,subtree:true});

enhanceClinicalButtons();
const backToDashboard=()=>{location.replace('/?returnToDashboard=1')};
document.getElementById('backDashboard')?.addEventListener('click',backToDashboard);

const $=id=>document.getElementById(id);
async function api(url,method='GET',data){
 let r;try{r=await fetch(url,{method,headers:{'Content-Type':'application/json','x-csrf-token':csrf},credentials:'same-origin',body:data?JSON.stringify(data):undefined})}
 catch(e){throw Error('Cannot reach the server. Check the connection or Render deployment and try again.')}
 let out;try{out=await r.json()}catch(e){throw Error('The server returned an unreadable response.')}
 if(!r.ok)throw Error(out.error||out.message||`Request failed (${r.status})`);return out
}
function fields(f){return Object.fromEntries(new FormData(f).entries())}
function show(id,obj){
 const host=$(id);if(!host)return;host.replaceChildren();
 const safe=v=>v===null||v===undefined||v===''?'—':typeof v==='object'?(Array.isArray(v)?v.map(x=>typeof x==='object'?Object.entries(x).map(([k,val])=>`${k}: ${safe(val)}`).join(', '):String(x)).join('; '):Object.entries(v).map(([k,val])=>`${k}: ${safe(val)}`).join('; ')):String(v);
 if(obj===null||obj===undefined){host.textContent='No records available.';return}
 if(Array.isArray(obj)){
  if(!obj.length){host.textContent='No records available.';return}
  const keys=[...new Set(obj.flatMap(row=>row&&typeof row==='object'?Object.keys(row):['Details']))];
  const table=document.createElement('table');table.className='data-table';
  const thead=document.createElement('thead'),hr=document.createElement('tr');
  keys.forEach(k=>{const th=document.createElement('th');th.textContent=k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());hr.append(th)});thead.append(hr);table.append(thead);
  const tbody=document.createElement('tbody');
  obj.forEach(row=>{const tr=document.createElement('tr');keys.forEach(k=>{const td=document.createElement('td');td.textContent=safe(row&&typeof row==='object'?row[k]:row);tr.append(td)});tbody.append(tr)});
  table.append(tbody);host.append(table);return;
 }
 if(typeof obj==='object'){
  const entries=Object.entries(obj);
  const grid=document.createElement('div');grid.className='summary-grid';
  entries.forEach(([key,value])=>{const card=document.createElement('div');card.className='summary-item';const label=document.createElement('span');label.textContent=key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());const val=document.createElement('strong');val.textContent=safe(value);card.append(label,val);grid.append(card)});
  host.append(grid);return;
 }
 const p=document.createElement('p');p.textContent=String(obj);host.append(p);
}
function action(fn){return async e=>{e?.preventDefault?.();try{await fn(e);$('result').textContent='Request completed'}catch(err){$('result').textContent=err.message}}}
function dateTime(d,t){return d+' '+t+':00'}
function fillDoctors(){
 for(const id of ['shiftClinician','emergencyClinician','backupClinician']){
  const el=$(id);if(!el)continue;el.replaceChildren(new Option('Select doctor or consultant',''));
  clinicians.forEach(c=>el.add(new Option(`${c.name}${c.department?' — '+c.department:''}`,c.id)));
 }
}
async function loadDoctors(){clinicians=await api('/api/clinicians');fillDoctors()}
async function loadShifts(){
 const [coverage,rows]=await Promise.all([api('/api/coverage'),api('/api/shifts')]);
 show('coverage',coverage);
 const box=$('shifts');box.replaceChildren();
 if(!rows.length){box.textContent='No shifts have been scheduled.';return}
 const table=document.createElement('table');table.className='data-table';
 const head=document.createElement('tr');['Doctor','Start','End','Coverage','Status','Actions'].forEach(t=>{const th=document.createElement('th');th.textContent=t;head.append(th)});table.append(head);
 rows.forEach(r=>{const tr=document.createElement('tr');[r.clinician_name||'Unknown doctor',r.starts_at,r.ends_at,r.coverage,r.status].forEach(v=>{const td=document.createElement('td');td.textContent=v??'—';tr.append(td)});
 const td=document.createElement('td');
 if(['admin','support'].includes(window.currentRole)&&r.status!=='completed'){
  const edit=document.createElement('button');edit.innerHTML=clinicalIcon('edit');edit.title='Edit shift';edit.setAttribute('aria-label','Edit shift');edit.onclick=()=>editShift(r);td.append(edit);
  const del=document.createElement('button');del.innerHTML=clinicalIcon('delete');del.title='Delete shift';del.setAttribute('aria-label','Delete shift');del.onclick=async()=>{if(!confirm('Delete this shift?'))return;try{await api('/api/shifts/'+r.id,'DELETE');await loadShifts()}catch(e){$('result').textContent=e.message}};td.append(del)
 }tr.append(td);table.append(tr)});
 box.append(table)
}
async function editShift(r){
 const doctor=prompt('Select doctor by entering the doctor name shown below:\n'+clinicians.map(c=>c.name).join('\n'),r.clinician_name);if(!doctor)return;
 const selected=clinicians.find(c=>c.name.toLowerCase()===doctor.trim().toLowerCase());if(!selected){$('result').textContent='Doctor name not found. Refresh the page and select a listed doctor.';return}
 const sd=prompt('Start date (YYYY-MM-DD)',String(r.starts_at).slice(0,10));if(!sd)return;
 const st=prompt('Start time (HH:MM)',String(r.starts_at).slice(11,16));if(!st)return;
 const ed=prompt('End date (YYYY-MM-DD)',String(r.ends_at).slice(0,10));if(!ed)return;
 const et=prompt('End time (HH:MM)',String(r.ends_at).slice(11,16));if(!et)return;
 const coverage=prompt('Coverage: physical, online, both, on_call',r.coverage);if(!coverage)return;
 try{await api('/api/shifts/'+r.id,'PATCH',{clinician_id:selected.id,starts_at:dateTime(sd,st),ends_at:dateTime(ed,et),coverage});await loadShifts()}catch(e){$('result').textContent=e.message}
}
async function loadEmergencies(){
 const rows=await api('/api/emergencies');show('emergencies',rows);
 const box=$('emergencyContacts');box.replaceChildren();
 rows.forEach(item=>{const b=document.createElement('button');b.type='button';b.textContent='WhatsApp '+(item.doctor_name||'doctor')+' — emergency #'+item.id;b.onclick=async()=>{try{const contact=await api('/api/whatsapp/contact/'+item.clinician_id);window.open(contact.url,'_blank','noopener,noreferrer')}catch(e){$('result').textContent=e.message}};box.append(b)})
}
async function loadConsultation(){show('consultation',await api('/api/consultations/'+$('cid').value))}
async function openWhatsApp(){try{const r=await api('/api/consultations/'+$('cid').value+'/whatsapp');window.open(r.url,'_blank','noopener,noreferrer')}catch(e){$('result').textContent=e.message}}
(async()=>{try{csrf=(await api('/api/csrf')).token;const u=(await api('/api/auth/me')).user;if(u){$('who').textContent='Signed in: '+u.name+' ('+u.role+')';window.currentRole=u.role;}await loadDoctors();await loadShifts();await loadEmergencies()}catch(e){$('result').textContent=e.message}})();
$('shift').onsubmit=action(async()=>{const d=fields($('shift'));await api('/api/shifts','POST',{clinician_id:Number(d.clinician_id),starts_at:dateTime(d.start_date,d.start_time),ends_at:dateTime(d.end_date,d.end_time),coverage:d.coverage});$('shift').reset();await loadShifts()});
$('emergency').onsubmit=action(async()=>{const d=fields($('emergency'));await api('/api/emergencies','POST',{...d,clinician_id:Number(d.clinician_id)});$('emergency').reset();await loadEmergencies()});
$('response').onsubmit=action(async()=>{const f=fields($('response'));await api('/api/emergencies/'+f.id+'/respond','POST',{accept:f.accept==='true',estimated_arrival:f.estimated_arrival,reason:f.reason});await loadEmergencies()});
$('start').onsubmit=action(async()=>{const r=await api('/api/consultations','POST',fields($('start')));$('cid').value=r.id;await loadConsultation()});
$('chat').onsubmit=action(async()=>{await api('/api/consultations/'+$('cid').value+'/messages','POST',fields($('chat')));$('chat').reset();await loadConsultation()});
$('method').onsubmit=action(async()=>{await api('/api/consultations/'+$('cid').value+'/method','POST',fields($('method')));await loadConsultation()});
$('methodResponse').onsubmit=action(async()=>{const f=fields($('methodResponse'));await api('/api/consultations/method-requests/'+f.id+'/respond','POST',{accept:f.accept==='true'});await loadConsultation()});
$('escalate').onsubmit=action(async()=>{const f=fields($('escalate'));await api('/api/emergencies/'+encodeURIComponent(f.id)+'/escalate','POST',{backup_clinician_id:Number(f.backup_clinician_id)});await loadEmergencies()});
for(const [id,fn] of [['refreshShifts',loadShifts],['refreshEmergencies',loadEmergencies],['refreshConsultation',loadConsultation],['openConsultantWhatsapp',openWhatsApp]])$(id)?.addEventListener('click',fn);
(async()=>{try{const user=(await api('/api/auth/me')).user;if(!user||!['admin','support'].includes(user.role)){$('clinicalSections').hidden=true;$('clinicalAccess').hidden=false;$('clinicalAccess').textContent=user?'This console is available to administrators and support personnel only.':'Please sign in first.'}}catch(e){}})();
