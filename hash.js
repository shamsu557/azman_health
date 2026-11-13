require('dotenv').config();
const readline=require('node:readline/promises');
const {stdin:input,stdout:output}=require('node:process');
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const {pool}=require('./mysql');
const {questions,normalizeAnswer,validPassword}=require('./security');
const rl=readline.createInterface({input,output});
(async()=>{
 const name=(await rl.question('Administrator full name: ')).trim();
 const spn=(await rl.question('Administrator staff SPN: ')).trim().toUpperCase();
 const phone=(await rl.question('Administrator WhatsApp phone number: ')).trim();
 const email=(await rl.question('Administrator email: ')).trim().toLowerCase();
 const password=await rl.question('Administrator password (at least 6 characters): ');
 console.log('\\nChoose a security question:');
 questions.forEach((q,i)=>console.log(`${i+1}. ${q}`));
 const selection=Number((await rl.question('Question number: ')).trim());
 const question=questions[selection-1];
 const answer=normalizeAnswer(await rl.question('Recovery answer: '));
 if(!name||!spn||!/^[+0-9 ()-]{10,22}$/.test(phone)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!validPassword(password)||!question||!answer)throw Error('Invalid details. Use a password of at least 6 characters, select a listed question and enter an answer.');
 const code=crypto.randomBytes(18).toString('hex');
 const [passHash,answerHash,codeHash]=await Promise.all([bcrypt.hash(password,12),bcrypt.hash(answer,12),bcrypt.hash(code,12)]);
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const [r]=await conn.execute("INSERT INTO users(name,email,identifier,phone,password_hash,role,status,admin_level) VALUES(?,?,?,?,?,'admin','approved','super')",[name,email,spn,phone,passHash]);
  await conn.execute('INSERT INTO admin_recovery(user_id,question,answer_hash,recovery_code_hash) VALUES(?,?,?,?)',[r.insertId,question,answerHash,codeHash]);
  await conn.execute('INSERT INTO user_security_questions(user_id,question,answer_hash) VALUES(?,?,?)',[r.insertId,question,answerHash]);
  await conn.commit();
  console.log('\nAdministrator created. Store this recovery code OFFLINE; it will not be shown again:\n'+code);
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{rl.close();await pool.end()});
