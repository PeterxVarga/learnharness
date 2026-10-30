/** R14: bounded source-only equivalence proof and optional glpk.js JSON bridge.
 * No learner text is executed, no solver is imported or called.
 * A positive equivalence verdict is limited to explicitly proven normal forms.
 */
const near = (a,b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
const reject = code => ({status:'UNASSESSABLE',code});
const zero = code => ({status:'ZERO_CREDIT',code});
const assertModel = model => model?.ok === true && model.vars instanceof Map && Array.isArray(model.constraints) && model.objective?.coeff instanceof Map;
function halfSpaces(model,names){
  const planes=[];let contradiction=false;
  function add(coeff,sense,bound){
    if(!Number.isFinite(bound))throw Error('unsupported_numeric_form');
    if(sense==='='){add(coeff,'<=',bound);add(coeff,'>=',bound);return;}
    if(sense==='>='){add(coeff.map(x=>-x),'<=',-bound);return;}
    if(sense!=='<=')throw Error('unsupported_constraint');
    const max=Math.max(...coeff.map(Math.abs));
    if(!Number.isFinite(max))throw Error('unsupported_numeric_form');
    if(max===0){if(bound < -1e-7)contradiction=true;return;}
    const normal=coeff.map(x=>x/max),limit=bound/max;
    if(!Number.isFinite(limit)||Math.abs(limit)>1e12)throw Error('unsupported_numeric_form');
    const p=planes.find(p=>p.normal.every((x,i)=>near(x,normal[i])));
    if(p)p.limit=Math.min(p.limit,limit);
    else planes.push({normal,limit});
  }
  for(const [i,name] of names.entries()){
    const v=model.vars.get(name);
    if(!v)throw Error('unmapped_variable_names');
    const unit=names.map((_,j)=>Number(i===j));
    if(Number.isFinite(v.lower))add(unit,'>=',v.lower);
    if(Number.isFinite(v.upper))add(unit,'<=',v.upper);
  }
  for(const c of model.constraints)add(names.map(n=>c.coeff.get(n)??0),c.sense,c.bound);
  if(planes.length>130)throw Error('oversize_equivalence');
  return {planes,contradiction};
}
/** Proves equivalence under row scaling/order, split equalities, movement of
 * bounds between domain and scalar constraints, and weaker same-normal rows.
 * More general polytope implications and variable renaming remain unproven.
 */
export function proveEquivalentScalarModel(model,expected){
  if(!assertModel(model))return reject(model?.code??'invalid_source');
  if(!expected?.vars || !Array.isArray(expected.constraints)||!expected.objective)return reject('invalid_expected_model');
  const names=Object.keys(expected.vars);
  if(model.vars.size!==names.length || names.some(n=>!model.vars.has(n)))return reject('unmapped_variable_names');
  for(const n of names)if(model.vars.get(n).integer!==expected.vars[n].integer)return zero('wrong_variable_domain');
  const x=model.objective,y=expected.objective;
  if(x.sense!==y.sense||!near(x.constant,y.constant??0)||names.some(n=>!near(x.coeff.get(n)??0,y.coeff[n]??0)))return zero('wrong_objective');
  try{
    const a=halfSpaces(model,names);
    const reference={vars:new Map(Object.entries(expected.vars)),constraints:expected.constraints.map(c=>({...c,coeff:new Map(Object.entries(c.coeff))}))};
    const b=halfSpaces(reference,names);
    if(a.contradiction||b.contradiction)return reject('constant_contradiction');
    if(a.planes.length!==b.planes.length)return reject('equivalence_not_proven');
    for(const p of a.planes){
      const q=b.planes.find(q=>q.normal.every((v,i)=>near(v,p.normal[i])));
      if(!q)return reject('equivalence_not_proven');
      if(!near(p.limit,q.limit))return zero('wrong_constraint');
    }
    return {status:'MATCH',code:null,verifiedBy:'r14_halfspace_normal_form'};
  }catch(e){
    const code=e instanceof Error?e.message:'equivalence_not_proven';
    return reject(/^[a-z][a-z0-9_]{0,90}$/.test(code)?code:'equivalence_not_proven');
  }
}
function bounds(lo,hi,g){
  if(lo>hi)throw Error('invalid_bounds');
  if(!Number.isFinite(lo)&&!Number.isFinite(hi))return {type:g.GLP_FR,lb:0,ub:0};
  if(!Number.isFinite(hi))return {type:g.GLP_LO,lb:lo,ub:0};
  if(!Number.isFinite(lo))return {type:g.GLP_UP,lb:0,ub:hi};
  if(near(lo,hi))return {type:g.GLP_FX,lb:lo,ub:hi};
  return {type:g.GLP_DB,lb:lo,ub:hi};
}
/** Pure adapter for optional glpk.js JSON API (GPL-3.0), no solver invocation.
 * Return objective constant outside the JSON payload (glpk.js omits offsets).
 * A future solver runtime MUST be isolated and resource capped.
 */
export function toGlpkJsProblem(model,g){
  if(!assertModel(model))throw Error('invalid_source');
  for(const key of ['GLP_MIN','GLP_MAX','GLP_FR','GLP_LO','GLP_UP','GLP_FX','GLP_DB'])if(!Number.isInteger(g?.[key]))throw Error('invalid_glpk_interface');
  const names=[...model.vars.keys()];
  if(names.length>30||model.constraints.length>45)throw Error('oversize_model');
  const vector=coeff=>names.map(name=>({name,coef:coeff.get(name)??0})).filter(x=>x.coef!==0);
  const subjectTo=[];
  for(const [i,c] of model.constraints.entries()){
    if(!['<=','>=','='].includes(c.sense)||!Number.isFinite(c.bound))throw Error('unsupported_constraint');
    const vars=vector(c.coeff);
    if(!vars.length)throw Error('constant_only_constraint');
    const bnds=c.sense==='='?{type:g.GLP_FX,lb:c.bound,ub:c.bound}:c.sense==='>='?{type:g.GLP_LO,lb:c.bound,ub:0}:{type:g.GLP_UP,lb:0,ub:c.bound};
    subjectTo.push({name:`c${i+1}`,vars,bnds});
  }
  const domains=names.map(name=>{const v=model.vars.get(name);return {name,...bounds(v.lower,v.upper,g)};});
  const binaries=names.filter(name=>{const v=model.vars.get(name);return v.integer&&near(v.lower,0)&&near(v.upper,1);});
  const binary=new Set(binaries),generals=names.filter(name=>model.vars.get(name).integer&&!binary.has(name));
  const problem={name:'learnharness_r14_scalar',objective:{direction:model.objective.sense==='min'?g.GLP_MIN:g.GLP_MAX,name:'objective',vars:vector(model.objective.coeff)},subjectTo,bounds:domains,generals,binaries};
  return {problem,objectiveOffset:model.objective.constant};
}
