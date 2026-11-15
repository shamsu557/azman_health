require('dotenv').config();
const readline=require('node:readline/promises');
const {stdin:input,stdout:output}=require('node:process');
const bcrypt=require('bcryptjs');
const crypto=require('node:crypto');
const {pool}=require('./mysql');
const {validPassword}=require('./security');
const rl=readline.createInterface({input,output});
(async()=>{
 const name=(await rl.question('Administrator full name: ')).trim();
 const spn=(await rl.question('Administrator staff SPN: ')).trim().toUpperCase();
 const phone=(await rl.question('Administrator WhatsApp phone number: ')).trim();
 const email=(await rl.question('Administrator email: ')).trim().toLowerCase();
 const password=await rl.question('Administrator password (at least 6 characters): ');
 if(!name||!spn||!/^[+0-9 ()-]{10,22}$/.test(phone)||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)||!validPassword(password))throw Error('Invalid administrator details.');
 const conn=await pool.getConnection();
 try{await conn.beginTransaction();const [r]=await conn.execute("INSERT INTO users(name,email,identifier,phone,password_hash,role,status,admin_level,must_change_password) VALUES(?,?,?,?,?,'admin','approved','super',1)",[name,email,spn,phone,await bcrypt.hash(password,12)]);await conn.commit();console.log('Administrator account created. The administrator must change this password at first login and save the recovery token displayed afterwards.');}
 catch(e){await conn.rollback();throw e}finally{conn.release()}
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{rl.close();await pool.end()});
