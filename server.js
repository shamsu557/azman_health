'use strict';
require('dotenv').config();
const express=require('express'),path=require('path'),crypto=require('crypto'),bcrypt=require('bcryptjs'),helmet=require('helmet'),session=require('express-session'),rateLimit=require('express-rate-limit'),MySQLStore=require('express-mysql-session')(session),sharp=require('sharp');
const {pool,query}=require('./mysql');
const {questions,normalizeAnswer,validQuestion,validPassword}=require('./security');
const app=express();app.disable('x-powered-by');if(process.env.NODE_ENV==='production')app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'data:'],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"]}}}));
app.use(express.json({limit:'100kb'}));
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}));
if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw Error('Configure SESSION_SECRET (at least 32 characters)');
const store=new MySQLStore({createDatabaseTable:false},pool);
app.use(session({name:'azman.sid',secret:process.env.SESSION_SECRET,store,resave:false,saveUninitialized:false,rolling:true,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',maxAge:8*3600*1000}}));
// Explicit public page routes: do not depend on extension fallback.
app.get(['/forgot-password','/forgot-password/'],(req,res)=>res.sendFile(path.join(__dirname,'public','forgot-password.html')));
app.get(['/admin/password','/admin/password/'],(req,res)=>res.sendFile(path.join(__dirname,'public','admin-password.html')));
app.get(['/clinical-console','/clinical-console/'],(req,res)=>res.redirect('/clinical-console.html'));
app.use(express.static(path.join(__dirname,'public'),{dotfiles:'ignore'}));
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next()});
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const bad=(status,message)=>Object.assign(new Error(message),{status});
const auth=(req,res,next)=>{if(!req.session.user)return next(bad(401,'Please log in'));if(req.session.user.must_change_password&&!req.path.endsWith('/auth/first-login-setup')&&!req.path.endsWith('/auth/me'))return next(bad(403,'Complete your first-login password and security setup'));next()};
const approved=(req,res,next)=>req.session.user?.status==='approved'?next():next(bad(403,'Account pending approval'));
const allow=(...roles)=>(req,res,next)=>roles.includes(req.session.user?.role)?next():next(bad(403,'Insufficient permission'));
const getUser=req=>req.session.user;
const audit=async(req,action,type,id,details={})=>query('INSERT INTO audit_logs(actor_id,action,target_type,target_id,details) VALUES(?,?,?,?,?)',[getUser(req)?.id||null,action,type,String(id),JSON.stringify(details)]);
const positive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const text=x=>String(x??'').trim();
const validGender=g=>['female','male','other','prefer_not_to_say'].includes(g);
const validRank=r=>!r||typeof r==='string'&&r.length<=100;
const validDate=s=>/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s)&&!Number.isNaN(Date.parse(s.replace(' ','T')+'Z'));
const STAFF_ACCOUNT_ROLES=['staff','admin','doctor','consultant','nurse','lab','pharmacy','support','reception','records','it'];
app.get('/api/health',wrap(async(req,res)=>{await query('SELECT 1');res.json({ok:true})}));
app.get('/api/csrf',(req,res)=>{if(!req.session.csrf)req.session.csrf=crypto.randomBytes(24).toString('hex');res.json({token:req.session.csrf})});
app.use('/api',(req,res,next)=>{if(['GET','HEAD','OPTIONS'].includes(req.method))return next();if(!req.session.csrf||req.get('x-csrf-token')!==req.session.csrf)return next(bad(403,'Invalid security token'));next()});
app.get('/api/security/questions',(req,res)=>res.json({questions}));
app.post('/api/auth/register',(req,res)=>res.status(403).json({error:'Self-registration is disabled. Contact Azman University IT Support or the administrator to create your account.'}));
app.post('/api/auth/login',wrap(async(req,res)=>{
 const login=text(req.body.login);
 const [rows]=await query('SELECT * FROM users WHERE email=? OR identifier=? LIMIT 1',[login.toLowerCase(),login]);
 const u=rows[0];
 if(!u||!await bcrypt.compare(String(req.body.password||''),u.password_hash))throw bad(401,'Invalid login');
 if(u.status!=='approved')throw bad(403,'Your account is not active. Contact Azman University IT Support.');
 req.session.regenerate(err=>{if(err)return res.status(500).json({error:'Session failure'});req.session.user={id:u.id,name:u.name,role:u.role,admin_level:u.admin_level,status:u.status,profile_image_id:u.profile_image_id,must_change_password:!!u.must_change_password};req.session.csrf=crypto.randomBytes(24).toString('hex');res.json({user:req.session.user,csrf:req.session.csrf,must_change_password:!!u.must_change_password})});
}));
app.post('/api/auth/logout',auth,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/auth/me',wrap(async(req,res)=>{if(!req.session.user)return res.json({user:null});const [rows]=await query('SELECT id,name,role,status,admin_level,profile_image_id,must_change_password FROM users WHERE id=?',[req.session.user.id]);const u=rows[0];if(!u||u.status!=='approved'){req.session.destroy(()=>{});return res.json({user:null})}req.session.user={id:u.id,name:u.name,role:u.role,status:u.status,admin_level:u.admin_level,profile_image_id:u.profile_image_id,must_change_password:!!u.must_change_password};res.json({user:req.session.user})}));
app.post('/api/auth/first-login-setup',auth,wrap(async(req,res)=>{
 const password=String(req.body.password||''),confirm=String(req.body.confirm_password||''),question=req.body.security_question,answer=normalizeAnswer(req.body.security_answer);
 if(!req.session.user.must_change_password)throw bad(409,'First-login setup has already been completed');
 if(!validPassword(password)||password!==confirm||!validQuestion(question)||!answer)throw bad(400,'Choose a security question, enter an answer and provide matching passwords of at least 6 characters.');
 const hash=await bcrypt.hash(password,12),answerHash=await bcrypt.hash(answer,12),uid=req.session.user.id;
 const conn=await pool.getConnection();let recoveryCode=null;
 try{await conn.beginTransaction();
  await conn.execute('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?',[hash,uid]);
  await conn.execute('INSERT INTO user_security_questions(user_id,question,answer_hash) VALUES(?,?,?) ON DUPLICATE KEY UPDATE question=VALUES(question),answer_hash=VALUES(answer_hash)',[uid,question,answerHash]);
  if(req.session.user.role==='admin'){
   recoveryCode=crypto.randomBytes(18).toString('hex');const recoveryHash=await bcrypt.hash(recoveryCode,12);
   await conn.execute('INSERT INTO admin_recovery(user_id,question,answer_hash,recovery_code_hash) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE question=VALUES(question),answer_hash=VALUES(answer_hash),recovery_code_hash=VALUES(recovery_code_hash)',[uid,question,answerHash,recoveryHash]);
  }
  await conn.commit();
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
 req.session.user.must_change_password=false;await audit(req,'first_login_setup','user',uid);
 res.json({ok:true,message:'Your password and security question have been saved.',recovery_code:recoveryCode});
}));

app.get('/api/departments',auth,approved,wrap(async(req,res)=>{const [rows]=await query('SELECT id,name FROM departments WHERE active=1 ORDER BY name');res.json(rows)}));
app.get('/api/users',auth,approved,allow('admin','support','it'),wrap(async(req,res)=>{const [rows]=await query('SELECT id,name,email,identifier,phone,role,admin_level,status,department,gender,professional_rank,profile_image_id,created_at FROM users ORDER BY created_at DESC LIMIT 300');res.json(rows)}));
app.patch('/api/users/:id/status',auth,approved,allow('admin','support','it'),wrap(async(req,res)=>{if(!['approved','rejected','suspended','pending'].includes(req.body.status))throw bad(400,'Invalid status');const [target]=await query('SELECT role,admin_level FROM users WHERE id=?',[req.params.id]);if(!target.length)throw bad(404,'User not found');if(['support','it'].includes(req.session.user.role)&&!['student','staff'].includes(target[0].role))throw bad(403,'Only administrators can change professional accounts');if(target[0].role==='admin'&&(req.session.user.admin_level!=='super'||target[0].admin_level==='super'))throw bad(403,'Administrator protected');if(Number(req.params.id)===req.session.user.id)throw bad(400,'Cannot change own status');await query('UPDATE users SET status=? WHERE id=?',[req.body.status,req.params.id]);await audit(req,'user_status','user',req.params.id,{status:req.body.status});res.json({ok:true})}));
app.post('/api/users/professional',(req,res)=>res.status(410).json({error:'Use the authorized account creation screen. Accounts are provisioned with default passwords and first-login setup.'}));
app.get('/api/dependants',auth,approved,wrap(async(req,res)=>{const id=['admin','support'].includes(getUser(req).role)&&positive(req.query.staff_id)?Number(req.query.staff_id):getUser(req).id;const [rows]=await query('SELECT * FROM dependants WHERE staff_id=? ORDER BY id DESC',[id]);res.json(rows)}));
async function nextDepNumber(conn,staffId,relationship){
 const [owner]=await conn.execute('SELECT identifier FROM users WHERE id=? FOR UPDATE',[staffId]);
 const spn=String(owner[0]?.identifier||'').trim();if(!spn)throw bad(400,'Staff SPN is required before adding dependants');
 const [existing]=await conn.execute("SELECT dependant_number,relationship FROM dependants WHERE staff_id=? AND status='approved' FOR UPDATE",[staffId]);
 if(relationship==='spouse'&&existing.some(x=>x.relationship==='spouse'))throw bad(409,'Only one spouse can be registered');
 let slot=relationship==='spouse'?1:2;
 if(relationship!=='spouse')while(existing.some(x=>x.dependant_number===`${spn}/${String(slot).padStart(2,'0')}`))slot++;
 if(slot>3)throw bad(409,'Maximum of three dependants: spouse /01 and children /02 or /03');
 return `${spn}/${String(slot).padStart(2,'0')}`;
}
app.post('/api/dependants',auth,approved,allow('staff','admin','doctor','consultant','nurse','lab','pharmacy','support','reception','records','it'),wrap(async(req,res)=>{
 const staffId=getUser(req).id;const items=Array.isArray(req.body.dependants)?req.body.dependants:[req.body];
 if(!items.length||items.length>3)throw bad(400,'Add between one and three dependants');
 const conn=await pool.getConnection();try{await conn.beginTransaction();
  const [staff]=await conn.execute("SELECT id,identifier FROM users WHERE id=? AND role IN ('staff','admin','doctor','consultant','nurse','lab','pharmacy','support','reception','records','it') AND status='approved' FOR UPDATE",[staffId]);if(!staff.length)throw bad(403,'Only staff accounts can add dependants');
  const [count]=await conn.execute("SELECT COUNT(*) total FROM dependants WHERE staff_id=? AND status='approved'",[staffId]);if(Number(count[0].total)+items.length>3)throw bad(409,'Maximum of three dependants');
  const ids=[];
  for(const d of items){if(!text(d.name)||!['spouse','son','daughter','other'].includes(d.relationship))throw bad(400,'Each dependant needs a name and valid relationship');const depNo=await nextDepNumber(conn,staffId,d.relationship);const [r]=await conn.execute("INSERT INTO dependants(staff_id,dependant_number,name,relationship,birth_date,gender,phone,status) VALUES(?,?,?,?,?,?,?,'approved')",[staffId,depNo,text(d.name),d.relationship,d.birth_date||null,text(d.gender)||null,text(d.phone)||null]);ids.push({id:r.insertId,dependant_number:depNo});}
  await conn.commit();await audit(req,'dependants_created','dependant',ids.map(x=>x.id).join(','));res.status(201).json({dependants:ids,status:'approved'});
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
}));
app.patch('/api/dependants/:id',auth,approved,allow('staff','admin','doctor','consultant','nurse','lab','pharmacy','support','reception','records','it'),wrap(async(req,res)=>{
 const [rows]=await query("SELECT * FROM dependants WHERE id=? AND staff_id=? AND status='approved'",[req.params.id,getUser(req).id]);const d=rows[0];if(!d)throw bad(404,'Dependant not found');
 const name=text(req.body.name)||d.name,relationship=req.body.relationship||d.relationship;if(!['spouse','son','daughter','other'].includes(relationship))throw bad(400,'Invalid relationship');
 await query('UPDATE dependants SET name=?,relationship=?,birth_date=?,gender=?,phone=? WHERE id=? AND staff_id=?',[name,relationship,req.body.birth_date||d.birth_date,req.body.gender||d.gender,text(req.body.phone)||d.phone,d.id,getUser(req).id]);await audit(req,'dependant_updated','dependant',d.id);res.json({ok:true});
}));
app.delete('/api/dependants/:id',auth,approved,allow('staff','admin','doctor','consultant','nurse','lab','pharmacy','support','reception','records','it'),wrap(async(req,res)=>{
 const [r]=await query("UPDATE dependants SET status='inactive' WHERE id=? AND staff_id=? AND status='approved'",[req.params.id,getUser(req).id]);if(!r.affectedRows)throw bad(404,'Dependant not found');await audit(req,'dependant_deactivated','dependant',req.params.id);res.json({ok:true,message:'Dependant removed from your active list; medical records are retained.'});
}));
app.get('/api/clinicians',auth,approved,wrap(async(req,res)=>{const [rows]=await query("SELECT u.id,u.name,u.department,c.specialty FROM users u LEFT JOIN clinician_profiles c ON c.user_id=u.id WHERE u.role IN ('doctor','consultant') AND u.status='approved' ORDER BY u.name");res.json(rows)}));
app.get('/api/availability/slots',auth,approved,wrap(async(req,res)=>{
 const clinicianId=positive(req.query.clinician_id)?Number(req.query.clinician_id):null;
 const days=Math.min(30,Math.max(1,Number(req.query.days)||14));
 const params=[];let clinicianFilter='';if(clinicianId){clinicianFilter=' AND a.clinician_id=?';params.push(clinicianId)}
 const [windows]=await query(`SELECT a.clinician_id,a.starts_at,a.ends_at,u.name clinician FROM availability a JOIN users u ON u.id=a.clinician_id WHERE a.active=1 AND a.starts_at>=NOW() AND a.starts_at<DATE_ADD(NOW(),INTERVAL ${days} DAY) AND u.status='approved' ${clinicianFilter} ORDER BY a.starts_at`,params);
 const [busy]=await query("SELECT clinician_id,starts_at,ends_at FROM appointments WHERE status NOT IN ('cancelled','no_show') AND starts_at<DATE_ADD(NOW(),INTERVAL ? DAY) AND ends_at>NOW()",[days]);
 const slots=[];for(const w of windows){let cursor=new Date(String(w.starts_at).replace(' ','T')+'Z'),finish=new Date(String(w.ends_at).replace(' ','T')+'Z');while(cursor.getTime()+30*60000<=finish.getTime()){const end=new Date(cursor.getTime()+30*60000);const occupied=busy.some(b=>Number(b.clinician_id)===Number(w.clinician_id)&&new Date(String(b.starts_at).replace(' ','T')+'Z')<end&&new Date(String(b.ends_at).replace(' ','T')+'Z')>cursor);if(!occupied&&cursor>new Date()){const sql=d=>d.toISOString().slice(0,19).replace('T',' ');slots.push({clinician_id:w.clinician_id,clinician:w.clinician,starts_at:sql(cursor),ends_at:sql(end)});}cursor=end;}}
 res.json(slots);
}));
app.get('/api/availability',auth,approved,wrap(async(req,res)=>{const [rows]=await query('SELECT a.id,a.clinician_id,a.starts_at,a.ends_at,u.name clinician FROM availability a JOIN users u ON u.id=a.clinician_id WHERE a.active=1 AND a.starts_at>=NOW() ORDER BY a.starts_at LIMIT 100');res.json(rows)}));
app.post('/api/availability',auth,approved,allow('admin','support','doctor','consultant'),wrap(async(req,res)=>{const clinicianId=['doctor','consultant'].includes(getUser(req).role)?getUser(req).id:Number(req.body.clinician_id);if(!positive(clinicianId)||!validDate(req.body.starts_at)||!validDate(req.body.ends_at)||req.body.ends_at<=req.body.starts_at)throw bad(400,'Invalid availability');const [r]=await query('INSERT INTO availability(clinician_id,starts_at,ends_at) VALUES(?,?,?)',[clinicianId,req.body.starts_at,req.body.ends_at]);res.status(201).json({id:r.insertId})}));
const bookingScope=(u)=>['admin','support','reception','records','nurse','lab','pharmacy'].includes(u.role)?'1=1':['doctor','consultant'].includes(u.role)?'a.clinician_id='+Number(u.id):'a.patient_id='+Number(u.id);
app.get('/api/appointments',auth,approved,wrap(async(req,res)=>{const [rows]=await query(`SELECT a.*,u.name patient_name,d.name department_name,c.name clinician_name,dep.name dependant_name FROM appointments a JOIN users u ON u.id=a.patient_id JOIN departments d ON d.id=a.department_id LEFT JOIN users c ON c.id=a.clinician_id LEFT JOIN dependants dep ON dep.id=a.dependant_id WHERE ${bookingScope(getUser(req))} ORDER BY a.starts_at DESC LIMIT 300`);res.json(rows)}));
app.post('/api/appointments',auth,approved,wrap(async(req,res)=>{const u=getUser(req),patientId=['admin','support','reception'].includes(u.role)&&positive(req.body.patient_id)?Number(req.body.patient_id):u.id;const {department_id,mode,starts_at,reason}=req.body;const clinicianId=positive(req.body.clinician_id)?Number(req.body.clinician_id):null;const depId=positive(req.body.dependant_id)?Number(req.body.dependant_id):null;if(!['physical','online'].includes(mode)||!positive(department_id)||!validDate(starts_at)||!text(reason)||text(reason).length>500)throw bad(400,'Invalid booking details');const end=new Date(Date.parse(starts_at.replace(' ','T')+'Z')+30*60000).toISOString().slice(0,19).replace('T',' ');const conn=await pool.getConnection();try{await conn.beginTransaction();const [eligible]=await conn.execute("SELECT id FROM users WHERE id=? AND status='approved'",[patientId]);if(!eligible.length)throw bad(400,'Patient not approved');if(depId){const [dep]=await conn.execute("SELECT id FROM dependants WHERE id=? AND staff_id=? AND status='approved'",[depId,patientId]);if(!dep.length)throw bad(403,'Dependant not eligible')}if(clinicianId){const [clin]=await conn.execute("SELECT id FROM users WHERE id=? AND role IN ('doctor','consultant') AND status='approved'",[clinicianId]);if(!clin.length)throw bad(400,'Invalid clinician');const [slot]=await conn.execute('SELECT id FROM availability WHERE clinician_id=? AND active=1 AND starts_at<=? AND ends_at>=? LIMIT 1 FOR UPDATE',[clinicianId,starts_at,end]);if(!slot.length)throw bad(409,'This doctor is not available at the selected time. Choose one of the available slots or select another doctor.');const [busy]=await conn.execute("SELECT id FROM appointments WHERE clinician_id=? AND starts_at<? AND ends_at>? AND status NOT IN ('cancelled','no_show') FOR UPDATE",[clinicianId,end,starts_at]);if(busy.length)throw bad(409,'Doctor is already booked. Choose another available time.');}const [r]=await conn.execute('INSERT INTO appointments(patient_id,dependant_id,clinician_id,department_id,mode,starts_at,ends_at,reason) VALUES(?,?,?,?,?,?,?,?)',[patientId,depId,clinicianId,Number(department_id),mode,starts_at,end,text(reason)]);await conn.execute("INSERT INTO notifications(channel,message) VALUES('whatsapp',?)",[`New ${mode} appointment request #${r.insertId}; ${starts_at}; review in secure Azman HealthConnect dashboard.`]);await conn.commit();await audit(req,'appointment_requested','appointment',r.insertId,{mode});res.status(201).json({id:r.insertId,status:'requested',notification:'queued'})}catch(e){await conn.rollback();throw e}finally{conn.release()}}));
app.patch('/api/appointments/:id/status',auth,approved,allow('admin','support','reception','records','nurse','doctor','consultant','lab','pharmacy'),wrap(async(req,res)=>{const status=req.body.status;if(!['confirmed','checked_in','triage','in_consultation','completed','cancelled','no_show'].includes(status))throw bad(400,'Invalid status');if(getUser(req).role==='reception'&&!['confirmed','checked_in','no_show'].includes(status))throw bad(403,'Receptionists can only confirm, check in, or mark no-show');const [rows]=await query('SELECT clinician_id FROM appointments WHERE id=?',[req.params.id]);if(!rows.length)throw bad(404,'Appointment not found');if(['doctor','consultant'].includes(getUser(req).role)&&rows[0].clinician_id!==getUser(req).id)throw bad(403,'Not your appointment');await query('UPDATE appointments SET status=? WHERE id=?',[status,req.params.id]);await audit(req,'appointment_status','appointment',req.params.id,{status});res.json({ok:true})}));
async function accessible(req,id){const [rows]=await query('SELECT * FROM appointments WHERE id=?',[id]);const a=rows[0];if(!a)throw bad(404,'Appointment not found');const u=getUser(req);if(!['admin','support','reception','records','nurse','lab','pharmacy'].includes(u.role)&&a.patient_id!==u.id&&a.clinician_id!==u.id)throw bad(403,'Not authorized');return a;}
app.get('/api/encounters/:appointmentId',auth,approved,wrap(async(req,res)=>{await accessible(req,req.params.appointmentId);const [enc]=await query('SELECT * FROM encounters WHERE appointment_id=?',[req.params.appointmentId]);const [vitals]=await query('SELECT * FROM vitals WHERE appointment_id=? ORDER BY created_at DESC',[req.params.appointmentId]);const [labs]=await query('SELECT * FROM lab_orders WHERE appointment_id=?',[req.params.appointmentId]);const [rx]=await query('SELECT * FROM prescriptions WHERE appointment_id=?',[req.params.appointmentId]);res.json({encounter:enc[0]||null,vitals,labs,prescriptions:rx})}));
app.post('/api/encounters/:appointmentId',auth,approved,allow('doctor','consultant'),wrap(async(req,res)=>{const a=await accessible(req,req.params.appointmentId);if(a.clinician_id!==getUser(req).id)throw bad(403,'Not assigned');const [existing]=await query('SELECT signed_at FROM encounters WHERE appointment_id=?',[a.id]);if(existing[0]?.signed_at)throw bad(409,'Signed notes cannot be overwritten');const vals=['subjective','objective','assessment','plan'].map(k=>text(req.body[k]));await query('INSERT INTO encounters(appointment_id,clinician_id,subjective,objective,assessment,plan) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE subjective=VALUES(subjective),objective=VALUES(objective),assessment=VALUES(assessment),plan=VALUES(plan)',[a.id,getUser(req).id,...vals]);await audit(req,'encounter_saved','appointment',a.id);res.json({ok:true})}));
app.post('/api/encounters/:appointmentId/sign',auth,approved,allow('doctor','consultant'),wrap(async(req,res)=>{const a=await accessible(req,req.params.appointmentId);if(a.clinician_id!==getUser(req).id)throw bad(403,'Not assigned');const [r]=await query('UPDATE encounters SET signed_at=NOW() WHERE appointment_id=? AND clinician_id=? AND signed_at IS NULL',[a.id,getUser(req).id]);if(!r.affectedRows)throw bad(409,'Encounter missing or already signed');await audit(req,'encounter_signed','appointment',a.id);res.json({ok:true})}));
app.post('/api/vitals',auth,approved,allow('nurse','doctor','consultant'),wrap(async(req,res)=>{await accessible(req,req.body.appointment_id);const v=req.body;const [r]=await query('INSERT INTO vitals(appointment_id,nurse_id,temperature,systolic,diastolic,pulse,oxygen,weight,notes) VALUES(?,?,?,?,?,?,?,?,?)',[v.appointment_id,getUser(req).id,v.temperature||null,v.systolic||null,v.diastolic||null,v.pulse||null,v.oxygen||null,v.weight||null,text(v.notes)]);await audit(req,'vitals_created','vitals',r.insertId);res.status(201).json({id:r.insertId})}));
app.get('/api/labs',auth,approved,allow('admin','lab','doctor','consultant'),wrap(async(req,res)=>{const clause=['doctor','consultant'].includes(getUser(req).role)?'WHERE l.requested_by='+getUser(req).id:'';const [rows]=await query(`SELECT l.*,a.patient_id FROM lab_orders l JOIN appointments a ON a.id=l.appointment_id ${clause} ORDER BY l.created_at DESC LIMIT 200`);res.json(rows)}));
app.post('/api/labs',auth,approved,allow('doctor','consultant'),wrap(async(req,res)=>{const a=await accessible(req,req.body.appointment_id);if(a.clinician_id!==getUser(req).id||!text(req.body.test_name))throw bad(400,'Invalid laboratory order');const [r]=await query('INSERT INTO lab_orders(appointment_id,requested_by,test_name) VALUES(?,?,?)',[a.id,getUser(req).id,text(req.body.test_name)]);await audit(req,'lab_order','lab',r.insertId);res.status(201).json({id:r.insertId})}));
app.patch('/api/labs/:id',auth,approved,allow('lab'),wrap(async(req,res)=>{const status=req.body.status;if(!['collected','processing','released'].includes(status))throw bad(400,'Invalid status');if(status==='released'&&!text(req.body.result_text))throw bad(400,'Result required');await query('UPDATE lab_orders SET status=?,result_text=?,reviewed_by=?,released_at=IF(?="released",NOW(),NULL) WHERE id=?',[status,text(req.body.result_text)||null,getUser(req).id,status,req.params.id]);await audit(req,'lab_status','lab',req.params.id,{status});res.json({ok:true})}));
app.get('/api/prescriptions',auth,approved,allow('admin','pharmacy','doctor','consultant'),wrap(async(req,res)=>{const clause=['doctor','consultant'].includes(getUser(req).role)?'WHERE p.clinician_id='+getUser(req).id:'';const [rows]=await query(`SELECT p.* FROM prescriptions p ${clause} ORDER BY p.created_at DESC LIMIT 200`);res.json(rows)}));
app.post('/api/prescriptions',auth,approved,allow('doctor','consultant'),wrap(async(req,res)=>{const a=await accessible(req,req.body.appointment_id);const [verified]=await query('SELECT can_prescribe,license_verified FROM clinician_profiles WHERE user_id=?',[getUser(req).id]);if(a.clinician_id!==getUser(req).id||!verified[0]?.can_prescribe||!verified[0]?.license_verified)throw bad(403,'Prescribing requires verified authorization');if(!text(req.body.medication)||!text(req.body.dose))throw bad(400,'Medication and dose required');const [r]=await query('INSERT INTO prescriptions(appointment_id,clinician_id,medication,dose,route,frequency,duration,instructions) VALUES(?,?,?,?,?,?,?,?)',[a.id,getUser(req).id,...['medication','dose','route','frequency','duration','instructions'].map(k=>text(req.body[k]))]);await audit(req,'prescription_created','prescription',r.insertId);res.status(201).json({id:r.insertId})}));
app.patch('/api/prescriptions/:id/dispense',auth,approved,allow('pharmacy'),wrap(async(req,res)=>{const [r]=await query("UPDATE prescriptions SET status='dispensed',dispensed_by=? WHERE id=? AND status='ordered'",[getUser(req).id,req.params.id]);if(!r.affectedRows)throw bad(409,'Prescription not pending');await audit(req,'prescription_dispensed','prescription',req.params.id);res.json({ok:true})}));
app.get('/api/notifications',auth,approved,allow('admin','support'),wrap(async(req,res)=>{const [rows]=await query('SELECT id,channel,message,status,attempts,created_at FROM notifications ORDER BY created_at DESC LIMIT 200');res.json(rows)}));
app.get('/api/stats',auth,approved,allow('admin','support'),wrap(async(req,res)=>{const [u]=await query('SELECT role,status,COUNT(*) total FROM users GROUP BY role,status');const [a]=await query('SELECT mode,status,COUNT(*) total FROM appointments GROUP BY mode,status');res.json({users:u,appointments:a})}));
app.get('/api/images/:id',auth,approved,wrap(async(req,res)=>{const [rows]=await query('SELECT owner_user_id,mime,bytes FROM images WHERE id=?',[req.params.id]);const i=rows[0];if(!i)throw bad(404,'Image not found');if(i.owner_user_id!==getUser(req).id&&!['admin','support','it','reception','records','nurse','doctor','consultant','lab','pharmacy'].includes(getUser(req).role))throw bad(403,'Forbidden');res.type(i.mime).set('Cache-Control','private, max-age=3600').send(i.bytes)}));
const multer=require('multer');const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:3*1024*1024},fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))});
app.post('/api/images/profile',auth,approved,upload.single('image'),wrap(async(req,res)=>{if(!req.file)throw bad(400,'Valid image required');const bytes=await sharp(req.file.buffer,{limitInputPixels:16000000}).rotate().resize(256,256,{fit:'cover'}).webp({quality:72}).toBuffer();const [r]=await query('INSERT INTO images(owner_user_id,mime,bytes) VALUES(?,?,?)',[getUser(req).id,'image/webp',bytes]);await query('UPDATE users SET profile_image_id=? WHERE id=?',[r.insertId,getUser(req).id]);await audit(req,'profile_image','image',r.insertId);res.status(201).json({id:r.insertId})}));

// Hidden administrator recovery page: deliberately no link from login UI.
app.get('/admin/password',(req,res)=>res.sendFile(path.join(__dirname,'public','admin-password.html')));
const recoveryLimit=rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false});
// Public self-service recovery. Security questions alone are a weak recovery factor;
// production deployment should add verified email/one-time-code ownership proof.
app.get('/forgot-password',(req,res)=>res.sendFile(path.join(__dirname,'public','forgot-password.html')));
app.post('/api/auth/recovery/question',recoveryLimit,wrap(async(req,res)=>{
 const login=text(req.body.login);if(!login)throw bad(400,'Enter your email or registration number / SPN');
 const [rows]=await query('SELECT q.question FROM users u JOIN user_security_questions q ON q.user_id=u.id WHERE (u.email=? OR u.identifier=?) AND u.status=\'approved\' LIMIT 1',[login.toLowerCase(),login]);
 // Do not reveal whether an account exists.
 res.set('Cache-Control','no-store').json({question:rows[0]?.question||null});
}));
app.post('/api/auth/recovery/reset',recoveryLimit,wrap(async(req,res)=>{
 const login=text(req.body.login),answer=normalizeAnswer(req.body.answer),password=String(req.body.password||'');
 if(!login||!answer||!validPassword(password))throw bad(400,'Provide your login, security answer and new password (6+ characters)');
 const [rows]=await query('SELECT u.id,u.role,q.answer_hash FROM users u JOIN user_security_questions q ON q.user_id=u.id WHERE (u.email=? OR u.identifier=?) AND u.status=\'approved\' LIMIT 1',[login.toLowerCase(),login]);
 const user=rows[0];
 // Administrators use their stronger offline-code recovery route.
 if(user?.role==='admin')throw bad(403,'Administrator password recovery requires the offline recovery code. Open /admin/password');
 if(!user||!await bcrypt.compare(answer,user.answer_hash))throw bad(400,'Unable to verify recovery details');
 await query('UPDATE users SET password_hash=? WHERE id=?',[await bcrypt.hash(password,12),user.id]);
 await audit(req,'self_service_password_reset','user',user.id);res.json({message:'Password updated. Sign in with your new password.'});
}));
app.get('/api/admin/recovery/question',recoveryLimit,wrap(async(req,res)=>{
 const email=text(req.query.email).toLowerCase();
 const [rows]=await query("SELECT r.question FROM admin_recovery r JOIN users u ON u.id=r.user_id WHERE u.email=? AND u.role='admin' AND u.status='approved' LIMIT 1",[email]);
 // Generic response prevents revealing whether an account exists, except when question is returned.
 res.set('Cache-Control','no-store').json({question:rows[0]?.question||'Enter your security answer and offline recovery code.'});
}));
app.post('/api/admin/recovery/reset',recoveryLimit,wrap(async(req,res)=>{
 const email=text(req.body.email).toLowerCase(),answer=normalizeAnswer(req.body.answer),code=text(req.body.code),password=String(req.body.password||'');
 if(!email||!answer||!code||!validPassword(password))throw bad(400,'All recovery fields are required; password must be at least 6 characters.');
 const [rows]=await query("SELECT u.id,r.answer_hash,r.recovery_code_hash,r.failed_attempts,r.locked_until FROM users u JOIN admin_recovery r ON r.user_id=u.id WHERE u.email=? AND u.role='admin' AND u.status='approved' LIMIT 1",[email]);
 const record=rows[0],generic='Recovery failed. Check your credentials or contact the system administrator.';
 if(!record){await bcrypt.compare(answer,'$2b$12$C6UzMDM.H6dfI/f/IKcEeO2ynq3jE1Hy5oqTuwQqgEZwD/ScM8sHu');throw bad(400,generic)}
 if(record.locked_until&&new Date(record.locked_until)>new Date())throw bad(429,'Recovery temporarily locked. Try again later.');
 const validAnswer=await bcrypt.compare(answer,record.answer_hash),validCode=await bcrypt.compare(code,record.recovery_code_hash);
 if(!validAnswer||!validCode){
  await query("UPDATE admin_recovery SET failed_attempts=failed_attempts+1,locked_until=IF(failed_attempts+1>=5,DATE_ADD(NOW(),INTERVAL 30 MINUTE),locked_until) WHERE user_id=?",[record.id]);
  throw bad(400,generic);
 }
 const newHash=await bcrypt.hash(password,12),newCode=crypto.randomBytes(18).toString('hex'),newCodeHash=await bcrypt.hash(newCode,12);
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  await conn.execute('UPDATE users SET password_hash=? WHERE id=?',[newHash,record.id]);
  await conn.execute('UPDATE admin_recovery SET recovery_code_hash=?,failed_attempts=0,locked_until=NULL WHERE user_id=?',[newCodeHash,record.id]);
  await conn.execute("INSERT INTO audit_logs(actor_id,action,target_type,target_id) VALUES(?,'admin_password_recovered','user',?)",[record.id,String(record.id)]);
  await conn.commit();
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
 res.set('Cache-Control','no-store').json({message:'Password reset. Store the new offline recovery code securely: '+newCode});
}));

// Doctor shift coverage: separate online and physical presence, never assume a doctor is available.
app.get('/api/shifts',auth,approved,wrap(async(req,res)=>{const [rows]=await query("SELECT s.*,u.name clinician_name FROM doctor_shifts s JOIN users u ON u.id=s.clinician_id WHERE s.ends_at>=DATE_SUB(NOW(),INTERVAL 1 DAY) ORDER BY s.starts_at LIMIT 300");res.json(rows)}));
app.post('/api/shifts',auth,approved,allow('admin','support'),wrap(async(req,res)=>{const {clinician_id,starts_at,ends_at,coverage}=req.body;if(!positive(clinician_id)||!validDate(starts_at)||!validDate(ends_at)||ends_at<=starts_at||!['physical','online','both','on_call'].includes(coverage))throw bad(400,'Invalid shift');const [docs]=await query("SELECT id FROM users WHERE id=? AND role IN ('doctor','consultant') AND status='approved'",[clinician_id]);if(!docs.length)throw bad(400,'Clinician not eligible');const [overlap]=await query("SELECT id FROM doctor_shifts WHERE clinician_id=? AND status!='cancelled' AND starts_at<? AND ends_at>? LIMIT 1",[clinician_id,ends_at,starts_at]);if(overlap.length)throw bad(409,'Shift overlaps an existing shift');const [r]=await query('INSERT INTO doctor_shifts(clinician_id,starts_at,ends_at,coverage,created_by) VALUES(?,?,?,?,?)',[clinician_id,starts_at,ends_at,coverage,getUser(req).id]);await audit(req,'shift_created','shift',r.insertId);res.status(201).json({id:r.insertId})}));
app.patch('/api/shifts/:id/status',auth,approved,wrap(async(req,res)=>{const status=req.body.status;if(!['checked_in','completed','cancelled'].includes(status))throw bad(400,'Invalid shift status');const [r]=await query('UPDATE doctor_shifts SET status=? WHERE id=? AND (clinician_id=? OR ?=1)',[status,req.params.id,getUser(req).id,['admin','support'].includes(getUser(req).role)?1:0]);if(!r.affectedRows)throw bad(403,'Not authorized');await audit(req,'shift_status','shift',req.params.id,{status});res.json({ok:true})}));
app.get('/api/coverage',auth,approved,wrap(async(req,res)=>{const [rows]=await query("SELECT coverage,COUNT(*) doctors FROM doctor_shifts WHERE starts_at<=NOW() AND ends_at>NOW() AND status='checked_in' GROUP BY coverage");res.json({active:rows,physical:rows.some(x=>['physical','both'].includes(x.coverage)),online:rows.some(x=>['online','both'].includes(x.coverage))})}));
app.patch('/api/clinicians/:id/whatsapp',auth,approved,wrap(async(req,res)=>{const id=Number(req.params.id),u=getUser(req);if(u.id!==id&&u.role!=='admin')throw bad(403,'Not authorized');const phone=text(req.body.whatsapp_number).replace(/[^0-9]/g,'');if(phone&&!/^\d{10,15}$/.test(phone))throw bad(400,'Use an international WhatsApp number without plus sign');const [r]=await query('UPDATE clinician_profiles SET whatsapp_number=? WHERE user_id=?',[phone||null,id]);if(!r.affectedRows)throw bad(404,'Clinician profile missing');await audit(req,'clinician_whatsapp_updated','user',id);res.json({ok:true})}));
async function consultationAccess(req,id){const [rows]=await query('SELECT c.*,a.patient_id,a.clinician_id,a.status appointment_status FROM consultation_sessions c JOIN appointments a ON a.id=c.appointment_id WHERE c.id=?',[id]);const c=rows[0];if(!c)throw bad(404,'Consultation not found');if(![c.patient_id,c.clinician_id].includes(getUser(req).id))throw bad(403,'Not a consultation participant');return c}
app.post('/api/consultations',auth,approved,wrap(async(req,res)=>{const id=Number(req.body.appointment_id);const a=await accessible(req,id);if(![a.patient_id,a.clinician_id].includes(getUser(req).id))throw bad(403,'Not a consultation participant');if(a.mode!=='online'||!['confirmed','in_consultation'].includes(a.status))throw bad(409,'Confirmed online appointment required');const [r]=await query('INSERT INTO consultation_sessions(appointment_id) VALUES(?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',[id]);res.json({id:r.insertId})}));
app.get('/api/consultations/:id',auth,approved,wrap(async(req,res)=>{const c=await consultationAccess(req,req.params.id);const [messages]=await query('SELECT id,sender_id,body,created_at FROM consultation_messages WHERE consultation_id=? ORDER BY id DESC LIMIT 100',[c.id]);const [requests]=await query('SELECT * FROM consultation_method_requests WHERE consultation_id=? ORDER BY id DESC LIMIT 30',[c.id]);res.json({consultation:c,messages:messages.reverse(),requests})}));
app.post('/api/consultations/:id/messages',auth,approved,wrap(async(req,res)=>{const c=await consultationAccess(req,req.params.id),body=text(req.body.body);if(c.status==='completed'||!body||body.length>4000)throw bad(400,'Invalid message or closed consultation');const [r]=await query('INSERT INTO consultation_messages(consultation_id,sender_id,body) VALUES(?,?,?)',[c.id,getUser(req).id,body]);await query("UPDATE consultation_sessions SET status='active' WHERE id=? AND status='waiting'",[c.id]);res.status(201).json({id:r.insertId})}));
app.post('/api/consultations/:id/method',auth,approved,allow('doctor','consultant'),wrap(async(req,res)=>{const c=await consultationAccess(req,req.params.id),method=req.body.method;if(c.clinician_id!==getUser(req).id||c.status==='completed'||!['internal_text','whatsapp_text','whatsapp_audio','whatsapp_video','physical'].includes(method))throw bad(400,'Invalid method request');const [r]=await query('INSERT INTO consultation_method_requests(consultation_id,requested_by,method) VALUES(?,?,?)',[c.id,getUser(req).id,method]);await audit(req,'consultation_method_requested','consultation',c.id,{method});res.status(201).json({id:r.insertId,status:'approved'})}));
app.post('/api/consultations/method-requests/:id/respond',auth,approved,wrap(async(req,res)=>{const [rows]=await query('SELECT m.*,c.appointment_id,a.patient_id FROM consultation_method_requests m JOIN consultation_sessions c ON c.id=m.consultation_id JOIN appointments a ON a.id=c.appointment_id WHERE m.id=?',[req.params.id]);const m=rows[0];if(!m||m.patient_id!==getUser(req).id)throw bad(403,'Only the patient can respond');const status=req.body.accept===true?'accepted':'declined';const [r]=await query("UPDATE consultation_method_requests SET status=?,responded_at=NOW() WHERE id=? AND status='pending'",[status,m.id]);if(!r.affectedRows)throw bad(409,'Request already answered');if(status==='accepted')await query('UPDATE consultation_sessions SET current_method=? WHERE id=?',[m.method,m.consultation_id]);await audit(req,'consultation_method_response','consultation',m.consultation_id,{status,method:m.method});res.json({status})}));
app.get('/api/consultations/:id/whatsapp',auth,approved,wrap(async(req,res)=>{const c=await consultationAccess(req,req.params.id);const [rows]=await query('SELECT u.phone,cp.whatsapp_number FROM clinician_profiles cp JOIN users u ON u.id=cp.user_id WHERE cp.user_id=?',[c.clinician_id]);const phone=whatsappDigits(rows[0]?.phone||rows[0]?.whatsapp_number);if(!phone)throw bad(404,'Professional WhatsApp number not configured');res.json({url:'https://wa.me/'+phone,note:'Opens WhatsApp chat; voice and video calls must be started manually inside WhatsApp.'})}));
app.post('/api/consultations/:id/complete',auth,approved,allow('doctor','consultant'),wrap(async(req,res)=>{const c=await consultationAccess(req,req.params.id);if(c.clinician_id!==getUser(req).id)throw bad(403,'Not assigned');await query("UPDATE consultation_sessions SET status='completed' WHERE id=?",[c.id]);await audit(req,'consultation_completed','consultation',c.id);res.json({ok:true})}));
// Emergency recall: notification queued for external WhatsApp delivery, NOT represented as delivered.
app.post('/api/emergencies',auth,approved,allow('admin','support'),wrap(async(req,res)=>{const {clinician_id,priority,case_summary,location,required_by}=req.body;if(!positive(clinician_id)||!['critical','urgent','routine'].includes(priority)||!text(case_summary)||text(case_summary).length>800||!text(location)||!validDate(required_by))throw bad(400,'Complete emergency details required');const [docs]=await query("SELECT u.id FROM users u WHERE u.id=? AND u.role IN ('doctor','consultant') AND u.status='approved'",[clinician_id]);if(!docs.length)throw bad(400,'Doctor not available in directory');const conn=await pool.getConnection();try{await conn.beginTransaction();const [r]=await conn.execute('INSERT INTO emergency_requests(requested_by,clinician_id,priority,case_summary,location,required_by) VALUES(?,?,?,?,?,?)',[getUser(req).id,clinician_id,priority,text(case_summary),text(location),required_by]);await conn.execute("INSERT INTO notifications(user_id,channel,message,status) VALUES(?,'whatsapp',?,'queued')",[clinician_id,`EMERGENCY RECALL #${r.insertId} (${priority}). Location: ${text(location)}. Required by: ${required_by}. Log into Azman HealthConnect to review clinical case and accept or reject.`]);await conn.commit();await audit(req,'emergency_created','emergency',r.insertId,{priority});res.status(201).json({id:r.insertId,status:'pending',whatsapp:'queued_not_sent'})}catch(e){await conn.rollback();throw e}finally{conn.release()}}));
app.get('/api/emergencies',auth,approved,wrap(async(req,res)=>{const u=getUser(req);const where=['admin','support'].includes(u.role)?'1=1':'e.clinician_id='+Number(u.id);const [rows]=await query(`SELECT e.*,d.name doctor_name,r.name requested_by_name FROM emergency_requests e JOIN users d ON d.id=e.clinician_id JOIN users r ON r.id=e.requested_by WHERE ${where} ORDER BY e.created_at DESC LIMIT 150`);res.json(rows)}));
// Supervisor escalation creates a NEW request for a backup clinician and preserves the original audit trail.
app.post('/api/emergencies/:id/escalate',auth,approved,allow('admin','support'),wrap(async(req,res)=>{
 const backup=Number(req.body.backup_clinician_id);
 if(!positive(backup))throw bad(400,'Select a backup doctor');
 const [rows]=await query('SELECT * FROM emergency_requests WHERE id=?',[req.params.id]);
 const original=rows[0];if(!original)throw bad(404,'Emergency not found');
 if(['completed','cancelled'].includes(original.status))throw bad(409,'Cannot escalate closed emergency');
 if(backup===original.clinician_id)throw bad(400,'Choose a different doctor');
 const [doctors]=await query("SELECT id FROM users WHERE id=? AND role IN ('doctor','consultant') AND status='approved'",[backup]);
 if(!doctors.length)throw bad(400,'Backup clinician is not approved');
 const conn=await pool.getConnection();
 try{await conn.beginTransaction();
  const [created]=await conn.execute('INSERT INTO emergency_requests(requested_by,clinician_id,priority,case_summary,location,required_by) VALUES(?,?,?,?,?,?)',[getUser(req).id,backup,original.priority,original.case_summary,original.location,original.required_by]);
  await conn.execute("UPDATE emergency_requests SET status='escalated' WHERE id=?",[original.id]);
  await conn.execute("INSERT INTO notifications(user_id,channel,message,status) VALUES(?,'whatsapp',?,'queued')",[backup,`Emergency recall ${created.insertId}. Please sign into Azman HealthConnect to review and respond.`]);
  await conn.commit();await audit(req,'emergency_escalated','emergency',original.id,{backup_request_id:created.insertId});res.status(201).json({id:created.insertId,original_id:original.id,whatsapp:'queued'});
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
}));
app.post('/api/emergencies/:id/respond',auth,approved,allow('doctor','consultant'),wrap(async(req,res)=>{const accept=req.body.accept===true,reason=text(req.body.reason),eta=req.body.estimated_arrival;if(accept&&!validDate(eta))throw bad(400,'Expected arrival date and time required');if(!accept&&(!reason||reason.length>500))throw bad(400,'Reason for rejection required');const [r]=await query("UPDATE emergency_requests SET status=?,response_reason=?,estimated_arrival=?,responded_at=NOW() WHERE id=? AND clinician_id=? AND status='pending'",[accept?'accepted':'rejected',accept?null:reason,accept?eta:null,req.params.id,getUser(req).id]);if(!r.affectedRows)throw bad(409,'Emergency request not pending or not assigned');await audit(req,'emergency_responded','emergency',req.params.id,{accepted:accept,estimated_arrival:accept?eta:null});res.json({status:accept?'accepted':'rejected'})}));
app.patch('/api/emergencies/:id/status',auth,approved,wrap(async(req,res)=>{const status=req.body.status,u=getUser(req);if(!['en_route','arrived','completed','escalated','cancelled'].includes(status))throw bad(400,'Invalid status');const [rows]=await query('SELECT clinician_id,status FROM emergency_requests WHERE id=?',[req.params.id]);const e=rows[0];if(!e)throw bad(404,'Not found');if(!['admin','support'].includes(u.role)&&e.clinician_id!==u.id)throw bad(403,'Forbidden');if(!['accepted','en_route','arrived'].includes(e.status)&&!['escalated','cancelled'].includes(status))throw bad(409,'Emergency not accepted');await query('UPDATE emergency_requests SET status=?,arrived_at=IF(?="arrived",NOW(),arrived_at) WHERE id=?',[status,status,req.params.id]);await audit(req,'emergency_status','emergency',req.params.id,{status});res.json({ok:true})}));

// WhatsApp click-through uses the registered users.phone; it never sends messages through an API.
// Authorization limits lookup to the user, staff/administration, or assigned clinician for the user's appointment.
const whatsappDigits=value=>{let v=String(value||'').replace(/\D/g,'');if(v.startsWith('00'))v=v.slice(2);if(v.startsWith('0')&&v.length===11)v='234'+v.slice(1);return /^\d{10,15}$/.test(v)?v:null};
app.get('/api/whatsapp/contact/:id',auth,approved,wrap(async(req,res)=>{
 const target=Number(req.params.id),u=getUser(req);
 if(!positive(target))throw bad(400,'Invalid contact');
 const [rows]=await query('SELECT id,name,role,phone,status FROM users WHERE id=?',[target]);
 const person=rows[0];if(!person||person.status!=='approved')throw bad(404,'Contact not found');
 let allowed=target===u.id||['admin','support','reception'].includes(u.role);
 if(!allowed){
  const [links]=await query("SELECT id FROM appointments WHERE status IN ('confirmed','checked_in','triage','in_consultation','completed') AND ((patient_id=? AND clinician_id=?) OR (patient_id=? AND clinician_id=?)) LIMIT 1",[u.id,target,target,u.id]);
  allowed=links.length>0;
 }
 if(!allowed)throw bad(403,'Contact is not authorized');
 const phone=whatsappDigits(person.phone);if(!phone)throw bad(404,'No valid registered WhatsApp phone number');
 res.json({name:person.name,url:'https://wa.me/'+phone,note:'Opens WhatsApp chat. Audio/video calls start in WhatsApp.'});
}));


// Administrative levels: only super admins can grant admin privileges or delete administrators.
const adminOnly=(req,res,next)=>req.session.user?.role==='admin'?next():next(bad(403,'Administrator required'));
const superOnly=(req,res,next)=>req.session.user?.role==='admin'&&req.session.user?.admin_level==='super'?next():next(bad(403,'Super administrator required'));
const isSuper=u=>u.role==='admin'&&u.admin_level==='super';
app.get('/api/admin/dependants',auth,approved,allow('admin','support'),wrap(async(req,res)=>{
 const [rows]=await query(`SELECT d.*,u.name staff_name,u.identifier staff_spn FROM dependants d JOIN users u ON u.id=d.staff_id ORDER BY FIELD(d.status,'pending','approved','rejected','inactive'),d.created_at DESC LIMIT 500`);
 res.json(rows);
}));
app.post('/api/dependants/batch',(req,res)=>res.status(410).json({error:'Use POST /api/dependants with a dependants array.'}));
app.patch('/api/admin/dependants/:id/status',auth,approved,adminOnly,wrap(async(req,res)=>{
 if(!['approved','rejected','inactive','pending'].includes(req.body.status))throw bad(400,'Invalid status');
 const [r]=await query('UPDATE dependants SET status=? WHERE id=?',[req.body.status,req.params.id]);
 if(!r.affectedRows)throw bad(404,'Dependant not found');
 await audit(req,'dependant_status','dependant',req.params.id,{status:req.body.status});res.json({ok:true});
}));
app.patch('/api/admin/users/:id',auth,approved,adminOnly,wrap(async(req,res)=>{
 const [rows]=await query('SELECT id,role,admin_level FROM users WHERE id=?',[req.params.id]);
 const target=rows[0];if(!target)throw bad(404,'User not found');
 const actor=getUser(req);
 if(isSuper(target)&&actor.admin_level!=='super')throw bad(403,'Super admin is protected');
 if(target.role==='admin'&&req.body.role&&req.body.role!=='admin'&&actor.admin_level!=='super')throw bad(403,'Only super admin can change administrator roles');
 const role=req.body.role||target.role;
 if(!['student','staff','doctor','consultant','nurse','lab','pharmacy','support','reception','records','it','admin'].includes(role))throw bad(400,'Invalid role');
 if(role==='admin'&&actor.admin_level!=='super')throw bad(403,'Only super admin can assign administrator role');
 const name=text(req.body.name),email=text(req.body.email).toLowerCase(),identifier=text(req.body.identifier),phone=text(req.body.phone),department=text(req.body.department);
 if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw bad(400,'Name and email required');
 await query('UPDATE users SET name=?,email=?,identifier=?,phone=?,department=?,role=? WHERE id=?',[name,email,identifier||null,phone||null,department||null,role,target.id]);
 await audit(req,'user_edited','user',target.id);res.json({ok:true});
}));
app.delete('/api/admin/users/:id',auth,approved,superOnly,wrap(async(req,res)=>{
 const id=Number(req.params.id);if(id===getUser(req).id)throw bad(403,'Cannot delete yourself');
 const [rows]=await query('SELECT role,admin_level FROM users WHERE id=?',[id]);
 if(!rows.length)throw bad(404,'User not found');
 if(isSuper(rows[0]))throw bad(403,'Super administrator accounts cannot be deleted through this endpoint');
 // Soft-delete preserves audit and clinical record references.
 await query("UPDATE users SET status='suspended' WHERE id=?",[id]);
 await audit(req,'user_deactivated','user',id);res.json({ok:true,message:'User suspended; records retained'});
}));
app.post('/api/admin/users',auth,approved,allow('admin','it'),wrap(async(req,res)=>{
 const {name,email,identifier,phone,role,department,gender,rank,license_number,specialty}=req.body;
 const permitted=['student','staff','doctor','consultant','nurse','lab','pharmacy','support','reception','records','it','admin'];
 if(!permitted.includes(role))throw bad(400,'Select a valid account type');
 if(role==='admin'&&!(getUser(req).role==='admin'&&getUser(req).admin_level==='super'))throw bad(403,'Only the super administrator can create administrator accounts');
 if(!text(name)||!text(identifier)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(email))||!validGender(gender)||!validRank(rank))throw bad(400,'Name, email, identifier and gender are required');
 const defaultPassword=role==='student'?'stud123':'staff123';
 const conn=await pool.getConnection();try{await conn.beginTransaction();
  const [r]=await conn.execute("INSERT INTO users(name,email,identifier,phone,role,department,gender,professional_rank,password_hash,status,admin_level,must_change_password) VALUES(?,?,?,?,?,?,?,?,?,'approved',?,1)",[text(name),text(email).toLowerCase(),text(identifier).toUpperCase(),text(phone)||null,role,text(department)||null,gender,text(rank)||null,await bcrypt.hash(defaultPassword,12),role==='admin'?'assistant':null]);
  if(['doctor','consultant'].includes(role))await conn.execute('INSERT INTO clinician_profiles(user_id,license_number,specialty) VALUES(?,?,?)',[r.insertId,text(license_number)||null,text(specialty)||null]);
  await conn.commit();await audit(req,'account_provisioned','user',r.insertId,{role,created_by:getUser(req).id});res.status(201).json({id:r.insertId,role,temporary_password:defaultPassword,must_change_password:true});
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
}));
app.post('/api/admin/users/:id/profile-image',auth,approved,adminOnly,upload.single('image'),wrap(async(req,res)=>{
 if(!req.file)throw bad(400,'Image required');
 const bytes=await sharp(req.file.buffer,{limitInputPixels:16000000}).rotate().resize(256,256,{fit:'cover'}).webp({quality:75}).toBuffer();
 const [r]=await query('INSERT INTO images(owner_user_id,mime,bytes) VALUES(?,?,?)',[req.params.id,'image/webp',bytes]);
 await query('UPDATE users SET profile_image_id=? WHERE id=?',[r.insertId,req.params.id]);
 res.json({id:r.insertId});
}));
app.post('/api/dependants/:id/profile-image',auth,approved,upload.single('image'),wrap(async(req,res)=>{
 const [rows]=await query('SELECT staff_id FROM dependants WHERE id=?',[req.params.id]);
 if(!rows.length)throw bad(404,'Dependant not found');
 if(rows[0].staff_id!==getUser(req).id&&getUser(req).role!=='admin')throw bad(403,'Forbidden');
 if(!req.file)throw bad(400,'Image required');
 const bytes=await sharp(req.file.buffer,{limitInputPixels:16000000}).rotate().resize(256,256,{fit:'cover'}).webp({quality:75}).toBuffer();
 const [r]=await query('INSERT INTO images(owner_user_id,mime,bytes) VALUES(?,?,?)',[rows[0].staff_id,'image/webp',bytes]);
 await query('UPDATE dependants SET image_id=? WHERE id=?',[r.insertId,req.params.id]);res.json({id:r.insertId});
}));

// Staff cannot directly edit or delete dependants; requests require staff ownership and a reason.
app.post('/api/dependants/:id/change-requests',auth,approved,allow('staff','admin'),wrap(async(req,res)=>{
 const dependantId=Number(req.params.id),action=req.body.action,reason=text(req.body.reason),payload=req.body.proposed_changes||{};
 if(!positive(dependantId)||!['edit','delete'].includes(action)||reason.length<10||reason.length>1000)throw bad(400,'Choose edit/delete and provide a reason (10-1000 characters)');
 const [d]=await query("SELECT id FROM dependants WHERE id=? AND staff_id=? AND status='approved'",[dependantId,getUser(req).id]);
 if(!d.length)throw bad(404,'Eligible dependant not found');
 const [pending]=await query("SELECT id FROM dependant_change_requests WHERE dependant_id=? AND status='pending'",[dependantId]);
 if(pending.length)throw bad(409,'A request is already awaiting review for this dependant');
 let changes=null;
 if(action==='edit'){
  changes={};
  for(const field of ['name','relationship','birth_date','gender','phone'])if(Object.prototype.hasOwnProperty.call(payload,field))changes[field]=text(payload[field]);
  if(!Object.keys(changes).length)throw bad(400,'Provide the changes you are requesting');
  if(changes.relationship&&!['spouse','son','daughter','other'].includes(changes.relationship))throw bad(400,'Invalid relationship');
 }
 const [r]=await query('INSERT INTO dependant_change_requests(dependant_id,requested_by,action,reason,proposed_changes) VALUES(?,?,?,?,?)',[dependantId,getUser(req).id,action,reason,changes?JSON.stringify(changes):null]);
 await audit(req,'dependant_change_requested','dependant',dependantId,{request_id:r.insertId,action});res.status(201).json({id:r.insertId,status:'pending'});
}));
app.get('/api/dependants/change-requests/mine',auth,approved,allow('staff','admin'),wrap(async(req,res)=>{
 const [rows]=await query('SELECT r.*,d.name dependant_name FROM dependant_change_requests r JOIN dependants d ON d.id=r.dependant_id WHERE r.requested_by=? ORDER BY r.created_at DESC LIMIT 100',[getUser(req).id]);res.json(rows);
}));
app.get('/api/admin/dependant-change-requests',auth,approved,allow('admin','support'),wrap(async(req,res)=>{
 const [rows]=await query("SELECT r.*,d.name dependant_name,u.name staff_name,u.identifier staff_spn FROM dependant_change_requests r JOIN dependants d ON d.id=r.dependant_id JOIN users u ON u.id=r.requested_by ORDER BY FIELD(r.status,'pending','approved','rejected'),r.created_at DESC LIMIT 500");res.json(rows);
}));
app.patch('/api/admin/dependant-change-requests/:id',auth,approved,allow('admin','support'),wrap(async(req,res)=>{
 const decision=req.body.decision;if(!['approved','rejected'].includes(decision))throw bad(400,'Invalid decision');
 const conn=await pool.getConnection();try{await conn.beginTransaction();
 const [rows]=await conn.execute("SELECT * FROM dependant_change_requests WHERE id=? AND status='pending' FOR UPDATE",[req.params.id]);
 const r=rows[0];if(!r)throw bad(404,'Pending request not found');
 if(decision==='approved'){
  if(r.action==='delete')await conn.execute("UPDATE dependants SET status='inactive' WHERE id=?",[r.dependant_id]);
  else {const changes=typeof r.proposed_changes==='string'?JSON.parse(r.proposed_changes):r.proposed_changes||{};
   const keys=Object.keys(changes).filter(k=>['name','relationship','birth_date','gender','phone'].includes(k));
   if(keys.length)await conn.execute('UPDATE dependants SET '+keys.map(k=>'`'+k+'`=?').join(',')+' WHERE id=?',[...keys.map(k=>changes[k]||null),r.dependant_id]);
  }
 }
 await conn.execute('UPDATE dependant_change_requests SET status=?,reviewed_by=?,reviewed_at=NOW(),review_note=? WHERE id=?',[decision,getUser(req).id,text(req.body.note)||null,r.id]);
 await conn.commit();await audit(req,'dependant_change_reviewed','dependant',r.dependant_id,{decision,request_id:r.id});res.json({ok:true});
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
}));
app.use('/api',(req,res)=>res.status(404).json({error:'API route not found'}));
app.use((err,req,res,next)=>{if(err.code==='ER_DUP_ENTRY')return res.status(409).json({error:'This identifier or email already exists'});if(err.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:'Image too large'});console.error(err.code||err.message);res.status(err.status||500).json({error:err.status?err.message:'Unexpected server error'})});
if(require.main===module)app.listen(Number(process.env.PORT||3000),()=>console.log('Azman HealthConnect listening on '+(process.env.PORT||3000)));
module.exports=app;
