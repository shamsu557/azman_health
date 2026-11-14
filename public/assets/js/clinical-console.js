let csrf='',clinicians=[];
const $=id=>document.getElementById(id);
async function api(url,method='GET',data){
 let r;try{r=await fetch(url,{method,headers:{'Content-Type':'application/json','x-csrf-token':csrf},credentials:'same-origin',body:data?JSON.stringify(data):undefined})}
 catch(e){throw Error('Cannot reach the server. Check the connection or Render deployment and try again.')}
 let out;try{out=await r.json()}catch(e){throw Error('The server returned an unreadable response.')}
 if(!r.ok)throw Error(out.error||out.message||`Request failed (${r.status})`);return out
}
function fields(f){return Object.fromEntries(new FormData(f).entries())}
function show(id,obj){$(id).textContent=JSON.stringify(obj,null,2)}
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
  const edit=document.createElement('button');edit.textContent='Edit';edit.onclick=()=>editShift(r);td.append(edit);
  const del=document.createElement('button');del.textContent='Delete';del.onclick=async()=>{if(!confirm('Delete this shift?'))return;try{await api('/api/shifts/'+r.id,'DELETE');await loadShifts()}catch(e){$('result').textContent=e.message}};td.append(del)
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
