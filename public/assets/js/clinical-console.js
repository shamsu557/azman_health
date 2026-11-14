let csrf='',clinicians=[],emergencyRows=[];
const $=id=>document.getElementById(id);
const api=async(url,method='GET',data)=>{
 let response;try{response=await fetch(url,{method,headers:{'Content-Type':'application/json','x-csrf-token':csrf},credentials:'same-origin',body:data?JSON.stringify(data):undefined})}catch{throw Error('Cannot reach the server. Check your connection and try again.')}
 let body;try{body=await response.json()}catch{throw Error('The server returned an unreadable response.')}
 if(!response.ok)throw Error(body.error||body.message||`Request failed (${response.status})`);return body;
};
const fields=form=>Object.fromEntries(new FormData(form).entries());
const text=(value)=>String(value??'—');
const safe=(value)=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateValue=v=>String(v||'').replace(' ','T').slice(0,16);
const dateTime=(d,t)=>`${d} ${t}:00`;
function notify(message,ok=false){const el=$('result');el.textContent=message;el.className='result-message '+(ok?'success':'error');}
function setLoading(el,message){el.innerHTML=`<p class="empty-state">${safe(message)}</p>`}
function makeTable(containerId,headers,rows,empty){
 const host=$(containerId);host.replaceChildren();
 if(!rows.length){setLoading(host,empty);return}
 const wrap=document.createElement('div');wrap.className='table-scroll';const table=document.createElement('table');table.className='clinical-table';
 const thead=document.createElement('thead'),trh=document.createElement('tr');headers.forEach(h=>{const th=document.createElement('th');th.textContent=h;trh.append(th)});thead.append(trh);table.append(thead);
 const tbody=document.createElement('tbody');rows.forEach(row=>{const tr=document.createElement('tr');row.forEach(cell=>{const td=document.createElement('td');if(cell instanceof Node)td.append(cell);else td.textContent=text(cell);tr.append(td)});tbody.append(tr)});table.append(tbody);wrap.append(table);host.append(wrap);
}
function actionButton(label,icon,handler,kind='secondary'){
 const b=document.createElement('button');b.type='button';b.className=`icon-button action-icon ${kind}`;b.title=label;b.setAttribute('aria-label',label);b.innerHTML=`<span aria-hidden="true">${icon}</span>`;b.addEventListener('click',handler);return b;
}
function fillDoctors(){
 for(const id of ['shiftClinician','emergencyClinician','backupClinician']){
  const el=$(id);if(!el)continue;el.replaceChildren(new Option('Select doctor or consultant',''));
  clinicians.forEach(c=>el.add(new Option(`${c.name}${c.department?' — '+c.department:''}${c.specialty?' · '+c.specialty:''}`,c.id)));
 }
 const edit=$('shiftEditForm').elements.clinician_id;edit.replaceChildren(new Option('Select doctor or consultant',''));clinicians.forEach(c=>edit.add(new Option(`${c.name}${c.department?' — '+c.department:''}`,c.id)));
}
async function loadDoctors(){clinicians=await api('/api/clinicians');fillDoctors()}
async function loadCoverage(){
 const [coverage,shifts]=await Promise.all([api('/api/coverage'),api('/api/shifts')]);
 const active=coverage.active||[];
 const phys=active.filter(x=>['physical','both'].includes(x.coverage)).reduce((n,x)=>n+Number(x.doctors||0),0);
 const online=active.filter(x=>['online','both'].includes(x.coverage)).reduce((n,x)=>n+Number(x.doctors||0),0);
 $('coverageCards').innerHTML=`<article class="metric-card"><span>Active physical coverage</span><strong>${phys}</strong><small>Doctors currently checked in</small></article><article class="metric-card"><span>Active online coverage</span><strong>${online}</strong><small>Doctors currently checked in</small></article><article class="metric-card"><span>Upcoming / current shifts</span><strong>${shifts.length}</strong><small>Roster entries in the system</small></article>`;
}
function openShiftEdit(row){
 const f=$('shiftEditForm');f.elements.id.value=row.id;f.elements.clinician_id.value=String(row.clinician_id);
 f.elements.start_date.value=String(row.starts_at).slice(0,10);f.elements.start_time.value=String(row.starts_at).slice(11,16);
 f.elements.end_date.value=String(row.ends_at).slice(0,10);f.elements.end_time.value=String(row.ends_at).slice(11,16);f.elements.coverage.value=row.coverage;
 $('shiftEditDialog').hidden=false;
}
function closeShiftEdit(){$('shiftEditDialog').hidden=true}
async function loadShifts(){
 const rows=await api('/api/shifts');
 const output=rows.map(r=>{
  const status=document.createElement('span');status.className='status-pill status-'+String(r.status).replace(/[^a-z]/g,'');status.textContent=r.status;
  const actions=document.createElement('div');actions.className='table-actions';
  if(['admin','support'].includes(window.currentRole)&&r.status!=='completed'){
   actions.append(actionButton('Edit shift','✎',()=>openShiftEdit(r)));
   actions.append(actionButton('Delete shift','⌫',async()=>{if(!confirm('Delete this shift?'))return;try{await api('/api/shifts/'+r.id,'DELETE');await refreshAllData();notify('Shift deleted.',true)}catch(e){notify(e.message)}} ,'danger'));
  }else actions.textContent='—';
  return [r.clinician_name||'Unknown doctor',r.starts_at,r.ends_at,String(r.coverage).replace('_',' '),status,actions];
 });
 makeTable('shifts',['Doctor','Starts','Ends','Coverage','Status','Actions'],output,'No doctor shifts have been scheduled.');
}
async function loadEmergencies(){
 emergencyRows=await api('/api/emergencies');
 const rows=emergencyRows.map(r=>{
  const summary=document.createElement('div');summary.className='case-summary';summary.textContent=r.case_summary||'No case summary';
  const status=document.createElement('span');status.className='status-pill status-'+String(r.status).replace(/[^a-z]/g,'');status.textContent=r.status;
  const actions=document.createElement('div');actions.className='table-actions';
  actions.append(actionButton('Contact doctor on WhatsApp','↗',async()=>{try{const c=await api('/api/whatsapp/contact/'+r.clinician_id);window.open(c.url,'_blank','noopener,noreferrer')}catch(e){notify(e.message)}}));
  return [String(r.id),r.doctor_name||'Unknown doctor',r.priority,summary,r.location,r.required_by,r.estimated_arrival||'Not provided',status,actions];
 });
 makeTable('emergencies',['Request','Doctor','Priority','Case','Location','Required by','ETA','Status','Contact'],rows,'There are no emergency requests.');
 for(const id of ['escalationRequest','responseRequest']){
  const el=$(id),current=el.value;el.replaceChildren(new Option('Select emergency request',''));
  emergencyRows.filter(r=>!['completed','cancelled'].includes(r.status)).forEach(r=>el.add(new Option(`#${r.id} · ${r.doctor_name} · ${r.status}`,r.id)));
  if([...el.options].some(o=>o.value===current))el.value=current;
 }
 const contacts=$('emergencyContacts');contacts.replaceChildren();
 const pending=emergencyRows.filter(r=>r.status==='pending');
 if(pending.length){const label=document.createElement('p');label.className='helper-text';label.textContent=`${pending.length} emergency request(s) awaiting doctor response.`;contacts.append(label)}
}
async function loadConsultation(){
 const id=$('cid').value;if(!id){notify('Enter a consultation ID first.');return}
 const data=await api('/api/consultations/'+encodeURIComponent(id));
 const host=$('consultation');host.replaceChildren();
 const title=document.createElement('div');title.className='consultation-meta';title.textContent=`Consultation #${data.consultation.id} · ${data.consultation.status} · ${String(data.consultation.current_method||'').replaceAll('_',' ')}`;host.append(title);
 const messages=data.messages||[];
 if(!messages.length){setLoading(host,'No messages yet. Start the conversation below.');host.prepend(title)}
 messages.forEach(m=>{const bubble=document.createElement('article');bubble.className='chat-message';const meta=document.createElement('small');meta.textContent=`${m.sender_id===window.currentUserId?'You':'Participant'} · ${m.created_at}`;const body=document.createElement('p');body.textContent=m.body;bubble.append(meta,body);host.append(bubble)});
 const requests=data.requests||[];const pending=requests.filter(r=>r.status==='pending');
 const select=$('methodRequestId');select.replaceChildren(new Option('Select pending request',''));pending.forEach(r=>select.add(new Option(`#${r.id} · ${String(r.method).replaceAll('_',' ')}`,r.id)));
 if(requests.length){const box=document.createElement('div');box.className='method-requests';const h=document.createElement('strong');h.textContent='Communication method requests';box.append(h);requests.forEach(r=>{const p=document.createElement('p');p.textContent=`${String(r.method).replaceAll('_',' ')} — ${r.status}`;box.append(p)});host.append(box)}
}
async function openWhatsApp(){const id=$('cid').value;if(!id){notify('Enter a consultation ID first.');return}try{const r=await api('/api/consultations/'+encodeURIComponent(id)+'/whatsapp');window.open(r.url,'_blank','noopener,noreferrer')}catch(e){notify(e.message)}}
async function refreshAllData(){await Promise.all([loadCoverage(),loadShifts(),loadEmergencies()])}
(async()=>{
 try{
  const csrfData=await api('/api/csrf');csrf=csrfData.token;
  const user=(await api('/api/auth/me')).user;
  if(!user){$('clinicalSections').hidden=true;$('clinicalAccess').hidden=false;$('clinicalAccess').textContent='Your session has expired. Sign in through Azman HealthConnect, then reopen Clinical Operations.';notify('Not signed in.');return}
  window.currentRole=user.role;window.currentUserId=user.id;
  $('who').textContent=`${user.name} · ${user.role}`;
  if(!['admin','support'].includes(user.role)){$('clinicalSections').hidden=true;$('clinicalAccess').hidden=false;$('clinicalAccess').textContent='Clinical Operations is available to administrators and support personnel.';return}
  await loadDoctors();await refreshAllData();
 }catch(e){notify(e.message)}
})();
$('backToDashboard').addEventListener('click',()=>{
 const ref=document.referrer;
 if(ref&&new URL(ref).origin===location.origin){history.back();return}
 window.location.replace('/');
});
$('shift').onsubmit=async e=>{e.preventDefault();try{const d=fields($('shift'));await api('/api/shifts','POST',{clinician_id:Number(d.clinician_id),starts_at:dateTime(d.start_date,d.start_time),ends_at:dateTime(d.end_date,d.end_time),coverage:d.coverage});$('shift').reset();await refreshAllData();notify('Doctor shift assigned.',true)}catch(err){notify(err.message)}};
$('shiftEditForm').onsubmit=async e=>{e.preventDefault();const d=fields(e.target);try{await api('/api/shifts/'+d.id,'PATCH',{clinician_id:Number(d.clinician_id),starts_at:dateTime(d.start_date,d.start_time),ends_at:dateTime(d.end_date,d.end_time),coverage:d.coverage});closeShiftEdit();await refreshAllData();notify('Doctor shift updated.',true)}catch(err){notify(err.message)}};
$('emergency').onsubmit=async e=>{e.preventDefault();const d=fields(e.target);d.required_by=d.required_by.replace('T',' ')+':00';try{await api('/api/emergencies','POST',{...d,clinician_id:Number(d.clinician_id)});e.target.reset();await loadEmergencies();notify('Emergency request created.',true)}catch(err){notify(err.message)}};
$('response').onsubmit=async e=>{e.preventDefault();const f=fields(e.target);try{await api('/api/emergencies/'+f.id+'/respond','POST',{accept:f.accept==='true',estimated_arrival:f.estimated_arrival?f.estimated_arrival.replace('T',' ')+':00':null,reason:f.reason});await loadEmergencies();notify('Doctor response submitted.',true)}catch(err){notify(err.message)}};
$('start').onsubmit=async e=>{e.preventDefault();try{const r=await api('/api/consultations','POST',fields(e.target));$('cid').value=r.id;await loadConsultation();notify(`Consultation #${r.id} opened.`,true)}catch(err){notify(err.message)}};
$('chat').onsubmit=async e=>{e.preventDefault();try{await api('/api/consultations/'+$('cid').value+'/messages','POST',fields(e.target));e.target.reset();await loadConsultation();notify('Message sent.',true)}catch(err){notify(err.message)}};
$('method').onsubmit=async e=>{e.preventDefault();try{await api('/api/consultations/'+$('cid').value+'/method','POST',fields(e.target));await loadConsultation();notify('Method change requested.',true)}catch(err){notify(err.message)}};
$('methodResponse').onsubmit=async e=>{e.preventDefault();const f=fields(e.target);try{await api('/api/consultations/method-requests/'+f.id+'/respond','POST',{accept:f.accept==='true'});await loadConsultation();notify('Method request response saved.',true)}catch(err){notify(err.message)}};
$('escalate').onsubmit=async e=>{e.preventDefault();const f=fields(e.target);try{await api('/api/emergencies/'+encodeURIComponent(f.id)+'/escalate','POST',{backup_clinician_id:Number(f.backup_clinician_id)});await loadEmergencies();notify('Emergency escalated to backup doctor.',true)}catch(err){notify(err.message)}};
$('refreshShifts').onclick=async()=>{try{await Promise.all([loadShifts(),loadCoverage()]);notify('Shift roster refreshed.',true)}catch(e){notify(e.message)}};
$('refreshEmergencies').onclick=async()=>{try{await loadEmergencies();notify('Emergency requests refreshed.',true)}catch(e){notify(e.message)}};
$('refreshConsultation').onclick=()=>loadConsultation().catch(e=>notify(e.message));
$('refreshAll').onclick=()=>refreshAllData().then(()=>notify('Operations refreshed.',true)).catch(e=>notify(e.message));
$('openConsultantWhatsapp').onclick=openWhatsApp;
$('closeShiftEdit').onclick=closeShiftEdit;$('cancelShiftEdit').onclick=closeShiftEdit;
$('shiftEditDialog').addEventListener('click',e=>{if(e.target.id==='shiftEditDialog')closeShiftEdit()});
