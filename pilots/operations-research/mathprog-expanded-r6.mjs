/**
 * R6: bounded, never-executed MathProg SOURCE ASSESSMENT for the synthetic 3x3 task.
 * NOT a GLPSOL interpreter: only nine explicitly named scalar variables, linear
 * objective and six fully expanded balance equalities are in this dialect.
 * Everything else (sets, sums, params, includes, data, table, printf, scripts,
 * solve options, arbitrary function calls) is rejected, never evaluated.
 *
 * Model verification covers the SOURCE rather than accepting a student-supplied
 * 'correct model' JSON flag. Flow/optimality are independently checked by R3.
 */
import { gradeTransportExam, makeTransportTask } from './transport-exam-r3.mjs';

const VAR_NAMES = Array.from({length: 3}, (_,i) => Array.from({length:3}, (_,j) => `x${i}${j}`)).flat();
const OWN = (a,k)=>Object.prototype.hasOwnProperty.call(a,k);
const MAX_TEXT = 16_384;
const MAX_STATEMENTS = 32;
const eq = (a,b) => typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) < 1e-8;
const num = x => {const n=Number(x); if(!Number.isFinite(n)||Math.abs(n)>1_000_000)throw new Error('unbounded_number');return n;};
function fail(code) {throw new Error(code);}

/** Conservative tokenizer. No quoted text, string interpolation, code or paths. */
function tokenize(text) {
  const tokens=[];
  const pattern=/\s+|(?:\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(?:x[0-2][0-2])|[+*\-]/gy;
  let pos=0;
  while(pos<text.length){
    pattern.lastIndex=pos;
    const m=pattern.exec(text);
    if(!m)fail('unsupported_expression_syntax');
    if(!/^\s+$/.test(m[0]))tokens.push(m[0]);
    pos=pattern.lastIndex;
    if(tokens.length>70)fail('expression_too_long');
  }
  return tokens;
}
function isVariable(s) {return VAR_NAMES.includes(s);}
const numeric = s=>/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s);
function linear(text) {
  const tokens=tokenize(text);
  const coefficients=Object.fromEntries(VAR_NAMES.map(name=>[name,0]));
  if(!tokens.length)fail('empty_expression');
  let p=0,terms=0;
  while(p<tokens.length){
    let sign=1;
    if(tokens[p]==='+'||tokens[p]==='-')sign=tokens[p++]==='-'?-1:1;
    if(p>=tokens.length)fail('missing_term');
    let coefficient=1;
    if(numeric(tokens[p])){
      coefficient=num(tokens[p++]);
      if(tokens[p++]!=='*')fail('explicit_multiplication_required');
    }
    if(!isVariable(tokens[p]))fail('unknown_variable_or_term');
    coefficients[tokens[p++]]+=sign*coefficient;
    terms++;
    if(terms>18)fail('too_many_terms');
    if(p<tokens.length && tokens[p]!=='+' && tokens[p]!=='-')fail('invalid_operator');
  }
  if(!Object.values(coefficients).some(x=>x!==0))fail('zero_expression');
  return coefficients;
}
const allVars = () => Object.fromEntries(VAR_NAMES.map(v=>[v,0]));
/**
 * Proportionality of equality rows, including allowed negative multipliers.
 * This accepts algebraically identical equalities in either direction, but
 * refuses omission/duplication or unrelated rows. No ill-conditioned inputs.
 */
function proportional(candidate, rhs, expected, value) {
  const witness=VAR_NAMES.find(v=>expected[v]!==0);
  const factor=candidate[witness]/expected[witness];
  if(!Number.isFinite(factor)||Math.abs(factor)<1e-8||Math.abs(factor)>1e6)return false;
  return VAR_NAMES.every(v=>eq(candidate[v],factor*expected[v])) && eq(rhs,factor*value);
}
function modelExpected(task) {
  const rows=[];
  for(let i=0;i<3;i++){
    const c=allVars();for(let j=0;j<3;j++)c[`x${i}${j}`]=1;
    rows.push({coefficient:c,rhs:task.supply[i],type:`supply_${i}`});
  }
  for(let j=0;j<3;j++){
    const c=allVars();for(let i=0;i<3;i++)c[`x${i}${j}`]=1;
    rows.push({coefficient:c,rhs:task.demand[j],type:`demand_${j}`});
  }
  return rows;
}

export function assessExpandedMathProg(task, text) {
  if(typeof text!=='string'||text.length<20||text.length>MAX_TEXT)return {ok:false,code:'invalid_model_source'};
  // Deliberately support only #-style line comments. No block comments.
  const clean=text.replace(/#[^\n\r]*/g,'').trim();
  if(!clean.endsWith(';'))return {ok:false,code:'missing_terminating_semicolon'};
  const statements=clean.split(';').map(s=>s.trim()).filter(Boolean);
  if(statements.length>MAX_STATEMENTS)return {ok:false,code:'too_many_statements'};
  const seenVars=new Set(),seenConstraints=new Set();let foundObjective=false,foundSolve=false,foundEnd=false;
  const equalities=[];const objective=allVars();
  try {
    for(let i=0;i<statements.length;i++){
      const statement=statements[i];
      // The ending must be solve; end; and nothing beyond it.
      if(statement==='solve') { if(foundSolve||foundEnd||i!==statements.length-2)fail('invalid_solve_position');foundSolve=true;continue; }
      if(statement==='end') { if(foundEnd||!foundSolve||i!==statements.length-1)fail('invalid_end_position');foundEnd=true;continue; }
      if(foundSolve||foundEnd)fail('statements_after_solve');
      const variable=/^var\s+(x[0-2][0-2])\s*>=\s*(\d+(?:\.\d+)?)\s*,\s*<=\s*(\d+(?:\.\d+)?)$/i.exec(statement);
      if(variable){
        const name=variable[1].toLowerCase();
        if(seenVars.has(name))fail('duplicate_variable');
        const [row,col]=name.slice(1).split('').map(Number);
        if(!eq(num(variable[2]),0)||!eq(num(variable[3]),task.capacities[row][col]))fail('wrong_variable_bounds');
        seenVars.add(name);continue;
      }
      const obj=/^minimize\s+[a-z][a-z0-9_]*\s*:\s*([\s\S]+)$/i.exec(statement);
      if(obj){
        if(foundObjective)fail('duplicate_objective');
        Object.assign(objective,linear(obj[1]));foundObjective=true;continue;
      }
      const row=/^s\.t\.\s+[a-z][a-z0-9_]*\s*:\s*([\s\S]+?)\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/i.exec(statement);
      if(row){
        const label=/^s\.t\.\s+([a-z][a-z0-9_]*)\s*:/i.exec(statement)?.[1].toLowerCase();
        if(seenConstraints.has(label))fail('duplicate_constraint_name');
        seenConstraints.add(label);
        equalities.push({coefficient:linear(row[1]),rhs:num(row[2])});continue;
      }
      fail('unsupported_mathprog_statement');
    }
    if(seenVars.size!==9||!foundObjective||!foundSolve||!foundEnd||equalities.length!==6)fail('incomplete_model');
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(!eq(objective[`x${i}${j}`],task.costs[i][j]))fail('wrong_objective');
    const expected=modelExpected(task),taken=new Set();
    for(const candidate of equalities){
      const idx=expected.findIndex((reference,i)=>!taken.has(i)&&proportional(candidate.coefficient,candidate.rhs,reference.coefficient,reference.rhs));
      if(idx<0)fail('incorrect_or_duplicate_balance');
      taken.add(idx);
    }
    if(taken.size!==6)fail('missing_balance_constraint');
    return {ok:true,code:null,verifiedBy:'bounded_static_source_validation'};
  }catch(e){
    return {ok:false,code:e instanceof Error?e.message:'invalid_source'};
  }
}

/** Full solution / no partial marks. No implicit trust in model-provided score or solver status. */
export function gradeExpandedMathProg(seed, answer) {
  const task=makeTransportTask(seed);
  const text=answer&&typeof answer==='object'&&!Array.isArray(answer)?answer.mathprog:null;
  const model=assessExpandedMathProg(task,text);
  // Full GNU MathProg is larger than this deliberately restricted dialect.
  // A valid but unsupported construct must NEVER be recorded as a wrong solution.
  // It earns no point, but also no false failure/mastery claim.
  const unsupported = new Set(['unsupported_mathprog_statement','unsupported_expression_syntax',
    'explicit_multiplication_required','unknown_variable_or_term','invalid_operator']);
  if (!model.ok && unsupported.has(model.code)) {
    return {status:'UNASSESSABLE', points:null,maxPoints:1,correct:null,
      errors:[`source_${model.code}`],verifiedBy:'unsupported_source_dialect',dialect:'explicit_3x3_only'};
  }
  const complete=gradeTransportExam(task,{
    model:model.ok?{sense:task.sense,nonnegative:true,supply:task.supply,demand:task.demand,costs:task.costs,capacities:task.capacities}:null,
    allocation:answer?.allocation,
    reportedObjective:answer?.reportedObjective,
    hintsUsed:answer?.hintsUsed,
  });
  const errors=[...new Set([...(model.ok?[]:[`source_${model.code}`]), ...complete.errors])];
  return {status:errors.length===0?'FULL_CREDIT':'ZERO_CREDIT',
    points:errors.length===0?1:0,maxPoints:1,correct:errors.length===0,errors,
    verifiedBy:'static_source_and_bounded_integer_enumeration',dialect:'explicit_3x3_only'};
}

/** A self-contained sample fixture: do not display as the learner's own solution. */
export function trustedExpandedExample(task) {
  const statements=[];
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)statements.push(`var x${i}${j} >= 0, <= ${task.capacities[i][j]};`);
  statements.push('minimize total_cost: '+task.costs.flatMap((row,i)=>row.map((cost,j)=>`${cost} * x${i}${j}`)).join(' + ')+';');
  for(let i=0;i<3;i++)statements.push(`s.t. supply_${i}: ${[0,1,2].map(j=>`x${i}${j}`).join(' + ')} = ${task.supply[i]};`);
  for(let j=0;j<3;j++)statements.push(`s.t. demand_${j}: ${[0,1,2].map(i=>`x${i}${j}`).join(' + ')} = ${task.demand[j]};`);
  statements.push('solve;','end;');
  return statements.join('\n')+'\n';
}
