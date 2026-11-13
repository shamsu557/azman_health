require('dotenv').config();
const readline=require('node:readline/promises');
const {stdin:input,stdout:output}=require('node:process');
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const {pool}=require('./mysql');
const rl=readline.createInterface({input,output});
(async()=>{
 const name=(await rl.question('Administrator full name: ')).trim();
 const email=(await rl.question('Administrator email: ')).trim().toLowerCase();
 const password=await rl.question('Administrator password (minimum 12 characters): ');
 const question=(await rl.question('Recovery security question (avoid publicly known facts): ')).trim();
 const answer=(await rl.question('Recovery answer: ')).trim().toLowerCase();
 if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||question.length<12||answer.length<6)throw Error('Invalid details. Use a 12+ character password, a 12+ character question and a 6+ character answer.');
 const code=crypto.randomBytes(18).toString('hex');
 const [passHash,answerHash,codeHash]=await Promise.all([bcrypt.hash(password,12),bcrypt.hash(answer,12),bcrypt.hash(code,12)]);
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const [r]=await conn.execute("INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,'admin','approved')",[name,email,passHash]);
  await conn.execute('INSERT INTO admin_recovery(user_id,question,answer_hash,recovery_code_hash) VALUES(?,?,?,?)',[r.insertId,question,answerHash,codeHash]);
  await conn.commit();
  console.log('\nAdministrator created. Store this recovery code OFFLINE; it will not be shown again:\n'+code);
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{rl.close();await pool.end()});
