/** R13: static, non-executing scalar GNU MathProg (GUSEK) subset.
 * Accepts classic university .mod forms. NEVER runs user text or reads files.
 * Unsupported grammar is UNASSESSABLE; semantic mistakes within this grammar are wrong.
 */
const fail = (code) => { throw new Error(code); };
const SYMBOL = /^[A-Za-z_][A-Za-z_0-9]*$/;
const near = (x,y) => Math.abs(x-y) <= 1e-7 * Math.max(1,Math.abs(x),Math.abs(y));
const validNumber = (n) => Number.isFinite(n) && Math.abs(n) <= 1_000_000_000;
const clone = (v) => ({c:v.c, a:new Map(v.a)});
const num = (n) => ({c:n,a:new Map()});
function add(a,b,mult=1){const r=clone(a);r.c+=mult*b.c;for(const [k,v] of b.a)r.a.set(k,(r.a.get(k)??0)+mult*v);return r;}
function scale(a,s){if(!validNumber(s))fail('unsupported_number');return {c:a.c*s,a:new Map([...a.a].map(([k,v])=>[k,v*s]))};}
function linear(text) {
  if(text.length>12000)fail('unsupported_expression');
  const tokens=[];const rx=/\s*([A-Za-z_][A-Za-z_0-9]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?|[()+\-*/])\s*/gy;
  let pos=0;
  while(pos<text.length){rx.lastIndex=pos;const m=rx.exec(text);if(!m)fail('unsupported_expression');tokens.push(m[1]);pos=rx.lastIndex;if(tokens.length>2500)fail('unsupported_expression');}
  let i=0;
  const factor=()=>{
    const tok=tokens[i++];
    if(tok==='+'||tok==='-')return scale(factor(),tok==='-'?-1:1);
    if(tok==='('){const v=sum();if(tokens[i++]!==')')fail('unsupported_expression');return v;}
    if(tok===undefined)fail('unsupported_expression');
    if(SYMBOL.test(tok))return {c:0,a:new Map([[tok,1]])};
    const n=Number(tok);if(!validNumber(n))fail('unsupported_number');return num(n);
  };
  const product=()=>{let x=factor();while(tokens[i]==='*'||tokens[i]==='/'){
    const op=tokens[i++], y=factor();
    if(op==='/'){if(y.a.size||near(y.c,0))fail('unsupported_nonlinear');x=scale(x,1/y.c);}
    else if(x.a.size && y.a.size)fail('unsupported_nonlinear');
    else x=x.a.size?scale(x,y.c):scale(y,x.c);
  }return x;};
  const sum=()=>{let x=product();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++];x=add(x,product(),op==='+'?1:-1);}return x;};
  const out=sum();if(i!==tokens.length)fail('unsupported_expression');
  if(!validNumber(out.c)||[...out.a.values()].some(n=>!validNumber(n)))fail('unsupported_number');
  for(const [k,v] of out.a)if(near(v,0))out.a.delete(k);
  return out;
}
function parseVariable(s){
  const m=/^var\s+([A-Za-z_][A-Za-z_0-9]*)(.*)$/i.exec(s);
  if(!m)return null;
  const name=m[1],rest=m[2].trim();let integer=false,binary=false,lower=-Infinity,upper=Infinity;
  if(rest){for(const part of rest.split(',').map(x=>x.trim())){
    if(/^integer$/i.test(part)){integer=true;continue;}
    if(/^binary$/i.test(part)){integer=true;binary=true;lower=0;upper=1;continue;}
    const m2=/^(>=|<=|=)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)$/.exec(part);
    if(!m2)fail('unsupported_variable_declaration');
    const v=Number(m2[2]);if(!validNumber(v))fail('unsupported_number');
    if(m2[1]==='>=')lower=v;else if(m2[1]==='<=')upper=v;else lower=upper=v;
  }}
  if(lower>upper)fail('invalid_bounds');
  return {name,integer,binary,lower,upper};
}
function parseConstraint(s){
  const match=/^(?:s\.t\.|subject\s+to)\s+([A-Za-z_][A-Za-z_0-9]*)\s*:\s*([\s\S]+)$/i.exec(s);
  if(!match)return null;
  const inside=/(<=|>=|=)/g;const comparators=[...match[2].matchAll(inside)];
  if(comparators.length!==1)fail('unsupported_constraint');
  const op=comparators[0][1],at=comparators[0].index;
  const lhs=linear(match[2].slice(0,at).trim());const rhs=linear(match[2].slice(at+op.length).trim());
  const result=add(lhs,rhs,-1);
  return {name:match[1],sense:op,coeff:result.a,bound:-result.c};
}
function parseObjective(s){
  const m=/^(minimize|maximize)\s+([A-Za-z_][A-Za-z_0-9]*)\s*:\s*([\s\S]+)$/i.exec(s);
  if(!m)return null;
  const expr=linear(m[3]);
  return {name:m[2],sense:m[1].toLowerCase()==='minimize'?'min':'max',coeff:expr.a,constant:expr.c};
}
export function parseGusekModel(text){
  if(typeof text!=='string'||text.length<3||text.length>32000)return {ok:false,code:'invalid_source'};
  try{
    // Comments may contain ISO-8859-2 decoded text; they never affect the model.
    const lines=text.replace(/\r\n?/g,'\n').split('\n').map(x=>x.replace(/#.*$/,''));
    const cleaned=lines.join('\n').trim();
    if(!cleaned)return {ok:false,code:'missing_model'};
    const raw=cleaned.split(';');
    if(raw.at(-1)?.trim())return {ok:false,code:'missing_semicolon'};
    const stmts=raw.slice(0,-1).map(s=>s.trim()).filter(Boolean);
    if(stmts.length<3||stmts.length>65)return {ok:false,code:'invalid_statement_count'};
    const vars=new Map(),constraints=[],constraintNames=new Set();let objective=null,solved=false,ended=false;
    for(const [i,s] of stmts.entries()){
      if(/^solve$/i.test(s)){if(solved||ended)fail('duplicate_solve');solved=true;continue;}
      if(/^end$/i.test(s)){if(ended||i!==stmts.length-1)fail('end_not_last');ended=true;continue;}
      if(solved||ended)fail('source_after_solve');
      const v=parseVariable(s);if(v){if(vars.has(v.name))fail('duplicate_variable');vars.set(v.name,v);continue;}
      const c=parseConstraint(s);if(c){if(constraintNames.has(c.name))fail('duplicate_constraint');constraints.push(c);constraintNames.add(c.name);continue;}
      const obj=parseObjective(s);if(obj){if(objective)fail('duplicate_objective');objective=obj;continue;}
      fail('unsupported_statement');
    }
    if(!objective||vars.size<1||constraints.length<1)return {ok:false,code:'incomplete_model'};
    if(vars.size>30||constraints.length>45)return {ok:false,code:'oversize_model'};
    if([...constraints,...(objective?[objective]:[])].some(e=>[...e.coeff.keys()].some(k=>!vars.has(k))))return {ok:false,code:'undeclared_variable'};
    return {ok:true,vars,constraints,objective};
  }catch(error){
    // Stack exhaustion or other runtime exceptions must not leak arbitrary strings
    // into persisted grade-error contracts (which only permit stable code tokens).
    const code=error instanceof Error?error.message:'invalid_source';
    return {ok:false,code:/^[a-z][a-z0-9_]{0,95}$/.test(code)?code:'unsupported_expression'};
  }
}
const vector=(c,names)=>names.map(n=>c.get(n)??0);
export function sameLinearConstraint(a,b,names){
  // Compare literal feasible half-spaces, allowing positive common scaling;
  // for equalities a negative scale is also valid.
  const v=vector(a.coeff,names),w=vector(b.coeff,names);let factor=null;
  for(let i=0;i<v.length;i++)if(!near(w[i],0)){factor=v[i]/w[i];break;}
  if(factor===null){if(w.every(x=>near(x,0)))return v.every(x=>near(x,0))&&near(a.bound,b.bound)&&a.sense===b.sense;return false;}
  if(!Number.isFinite(factor)||near(factor,0))return false;
  if(!v.every((x,i)=>near(x,factor*w[i]))||!near(a.bound,factor*b.bound))return false;
  if(factor>0)return a.sense===b.sense;
  return a.sense==='='&&b.sense==='=' || (a.sense==='<='&&b.sense==='>=') || (a.sense==='>='&&b.sense==='<=');
}
export function verifyGusekModel(model,expected){
  if(!model.ok)return {status:'UNASSESSABLE',code:model.code};
  const names=Object.keys(expected.vars);
  if(model.vars.size!==names.length||names.some(n=>!model.vars.has(n)))return {status:'ZERO_CREDIT',code:'wrong_variables'};
  for(const name of names){const a=model.vars.get(name),b=expected.vars[name];
    if(a.integer!==b.integer||!((a.lower===b.lower)||near(a.lower,b.lower))||!((a.upper===b.upper)||near(a.upper,b.upper)))return {status:'ZERO_CREDIT',code:'wrong_variable_domain'};
  }
  const obj=model.objective;
  if(obj.sense!==expected.objective.sense||!near(obj.constant??0,expected.objective.constant??0)||names.some(n=>!near(obj.coeff.get(n)??0,expected.objective.coeff[n]??0)))return {status:'ZERO_CREDIT',code:'wrong_objective'};
  const expectedConstraints=expected.constraints.map(c=>({...c,coeff:new Map(Object.entries(c.coeff))}));
  if(model.constraints.length!==expectedConstraints.length)return {status:'ZERO_CREDIT',code:'wrong_constraint_count'};
  const remaining=[...expectedConstraints];
  for(const c of model.constraints){const idx=remaining.findIndex(r=>sameLinearConstraint(c,r,names));if(idx===-1)return {status:'ZERO_CREDIT',code:'wrong_constraint'};remaining.splice(idx,1);}
  return {status:'MATCH',code:null};
}
