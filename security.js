const questions=require('./security-questions');
const normalizeAnswer=value=>String(value??'').trim().toUpperCase();
const validQuestion=value=>questions.includes(value);
const validPassword=value=>typeof value==='string'&&value.length>=6;
module.exports={questions,normalizeAnswer,validQuestion,validPassword};
