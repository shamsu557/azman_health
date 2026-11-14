'use strict';
require('dotenv').config();
const {pool,query}=require('../mysql');
const phoneNumber=(v)=>{let n=String(v||'').replace(/\D/g,'');if(n.startsWith('0')&&n.length===11)n='234'+n.slice(1);return /^\d{10,15}$/.test(n)?n:null};
async function sendTemplate(to,kind,reference){
 const token=process.env.WHATSAPP_TOKEN,from=process.env.WHATSAPP_PHONE_NUMBER_ID;
 const template=process.env.WHATSAPP_TEMPLATE_NAME;
 if(!token||!from||!template)throw Error('WhatsApp Cloud API credentials or approved template missing');
 const destination=phoneNumber(to);if(!destination)throw Error('Invalid or missing recipient WhatsApp number');
 const response=await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION||'v22.0'}/${from}/messages`,{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',to:destination,type:'template',template:{name:template,language:{code:process.env.WHATSAPP_TEMPLATE_LANG||'en'},components:[{type:'body',parameters:[{type:'text',text:String(kind).slice(0,50)},{type:'text',text:String(reference).slice(0,80)}]}]}})
 });
 const payload=await response.json();if(!response.ok)throw Error(JSON.stringify(payload.error||payload).slice(0,350));return payload;
}
async function processBatch(){
 const [rows]=await query(`SELECT n.id,n.message,n.user_id,u.phone,cp.whatsapp_number FROM notifications n LEFT JOIN users u ON u.id=n.user_id LEFT JOIN clinician_profiles cp ON cp.user_id=n.user_id WHERE n.channel='whatsapp' AND n.status='queued' AND n.attempts<3 ORDER BY n.id LIMIT 25`);
 for(const n of rows){
  const [claim]=await query("UPDATE notifications SET attempts=attempts+1 WHERE id=? AND status='queued' AND attempts<3",[n.id]);if(!claim.affectedRows)continue;
  try{await sendTemplate(n.whatsapp_number||n.phone,'Azman HealthConnect',`Notification ${n.id}`);await query("UPDATE notifications SET status='sent',last_error=NULL WHERE id=?",[n.id]);}
  catch(e){await query("UPDATE notifications SET status=IF(attempts>=3,'failed','queued'),last_error=? WHERE id=?",[String(e.message).slice(0,490),n.id]);console.error(`Notification ${n.id}: ${e.message}`)}
 }
 return rows.length;
}
if(require.main===module)processBatch().then(n=>console.log(`Processed ${n} queued notifications`)).catch(e=>{console.error(e);process.exitCode=1}).finally(()=>pool.end());
module.exports={phoneNumber,sendTemplate,processBatch};
