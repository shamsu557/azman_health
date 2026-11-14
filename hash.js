'use strict';
require('dotenv').config();
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./mysql');

const questions = [
  'What is the name of your first school?',
  'What is the name of your childhood best friend?',
  'What was the name of your first pet?',
  'In which town did your parents first meet?',
  'What is the middle name of your oldest sibling?',
  'What was the name of your primary school teacher?'
];
const rl = readline.createInterface({ input, output });
const ask = async (prompt) => (await rl.question(prompt)).trim();

async function main() {
  const name = await ask('Administrator full name: ');
  const spn = await ask('Administrator staff personnel number (SPN): ');
  const phone = await ask('Administrator WhatsApp phone number: ');
  const email = (await ask('Administrator email: ')).toLowerCase();
  const password = await rl.question('Administrator password (at least 6 characters): ');

  console.log('\nChoose a recovery security question:');
  questions.forEach((q, i) => console.log(`${i + 1}. ${q}`));
  const choice = await ask('Enter question number (1-6): ');
  const questionIndex = Number(choice) - 1;
  if (!/^[1-6]$/.test(choice) || !questions[questionIndex]) {
    throw new Error('Select a security question by entering a number from 1 to 6.');
  }
  const question = questions[questionIndex];
  const answer = (await ask('Recovery answer: ')).toUpperCase();

  if (!name || !spn || !phone || !/^\+?[0-9][0-9 ()-]{7,19}$/.test(phone) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6 || !answer) {
    throw new Error('Enter a name, SPN, valid phone/email, password of at least 6 characters and recovery answer.');
  }

  const recoveryCode = crypto.randomBytes(18).toString('hex');
  const [passHash, answerHash, codeHash] = await Promise.all([
    bcrypt.hash(password, 12),
    bcrypt.hash(answer, 12),
    bcrypt.hash(recoveryCode, 12)
  ]);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO users
       (name, identifier, phone, email, password_hash, role, status, admin_level)
       VALUES (?, ?, ?, ?, ?, 'admin', 'approved', 'super')`,
      [name, spn, phone, email, passHash]
    );
    await conn.execute(
      `INSERT INTO admin_recovery
       (user_id, question, answer_hash, recovery_code_hash)
       VALUES (?, ?, ?, ?)`,
      [result.insertId, question, answerHash, codeHash]
    );
    await conn.execute(
      `INSERT INTO user_security_questions (user_id, question, answer_hash)
       VALUES (?, ?, ?)`,
      [result.insertId, question, answerHash]
    );
    await conn.commit();
    console.log('\nSuper administrator created successfully.');
    console.log('Store this recovery code OFFLINE; it will not be shown again:\n' + recoveryCode);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

main()
  .catch(err => { console.error('Administrator creation failed:', err.message); process.exitCode = 1; })
  .finally(async () => { rl.close(); await pool.end(); });
