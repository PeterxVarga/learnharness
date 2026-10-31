/** R16.12: sound finite-lattice equivalence for TWO nonnegative integer
 * production variables, using the existing R15 parser's normalized model.
 * No additional parser, solver, LLM, filesystem, or learner source execution.
 * An unsupported/unbounded/oversize candidate is UNASSESSABLE, never 0 by
 * an unproved assumption that points outside our search box cannot exist.
 */
const NA = code => ({status:'UNASSESSABLE',code,verifiedBy:'r1612_exact_integer_lattice'});
const WRONG = code => ({status:'ZERO_CREDIT',code,verifiedBy:'r1612_exact_integer_lattice'});
const MATCH = Object.freeze({status:'MATCH',code:null,verifiedBy:'r1612_exact_integer_lattice'});
const NAMES=Object.freeze(['alap','premium']);
const MAX_ABS=1_000_000;
const MAX_POINTS=4096;
const integer=n=>typeof n==='number'&&Number.isSafeInteger(n)&&Math.abs(n)<=MAX_ABS;
function validVars(vars){
 return vars instanceof Map&&vars.size===2&&NAMES.every(n=>{
  const v=vars.get(n);
  return v&&v.integer===true&&integer(v.lower)&&v.lower>=0&&
   (v.upper===Infinity||(integer(v.upper)&&v.upper>=v.lower));
 });
}
function finiteModel(model){
 if(model?.ok!==true||!validVars(model.vars)||!Array.isArray(model.constraints)||
  model.constraints.length>45||!['max','min'].includes(model.objective?.sense)||
  !integer(model.objective.constant)||!(model.objective.coeff instanceof Map))return false;
 const rows=[...model.constraints,model.objective];
 return rows.every(c=>c.coeff instanceof Map && integer(c===model.objective?c.constant:c.bound) &&
  (c===model.objective||['<=','>=','='].includes(c.sense)) &&
  [...c.coeff].every(([n,v])=>NAMES.includes(n)&&integer(v)));
}
function expectedToModel(expected){
 if(!expected||!expected.vars||!Array.isArray(expected.constraints)||!expected.objective)return null;
 try{
  return {ok:true,
   vars:new Map(Object.entries(expected.vars)),
   constraints:expected.constraints.map(c=>({...c,coeff:new Map(Object.entries(c.coeff))})),
   objective:{...expected.objective,coeff:new Map(Object.entries(expected.objective.coeff))}};
 }catch{return null;}
}
// Derive certified x <= U from a constraint with nonnegative coefficients,
// because all other variables are known >=0. For >= reverse signs first.
// Equalities may be used in the <= direction. This does NOT infer bounds from
// arbitrary mixed-sign rows, where other variables could cancel each other.
function certifiedMax(model,name){
 let upper=model.vars.get(name).upper;
 for(const c of model.constraints){
  if(!['<=','>=','='].includes(c.sense))continue;
  const sign=c.sense==='>='?-1:1;
  const vec=NAMES.map(n=>(c.coeff.get(n)??0)*sign);
  const index=NAMES.indexOf(name);
  if(vec.every(v=>v>=0) && vec[index]>0){
   const candidate=Math.floor(c.bound*sign/vec[index]);
   upper=Math.min(upper,candidate);
  }
 }
 // Negative upper bound means the candidate is provably infeasible on
 // all nonnegative integer points; the reference includes (0,0).
 return upper;
}
function accepts(model,values){
 for(const name of NAMES){
  const v=model.vars.get(name),x=values[name];
  if(x<v.lower||x>v.upper)return false;
 }
 for(const row of model.constraints){
  const lhs=NAMES.reduce((s,n)=>s+(row.coeff.get(n)??0)*values[n],0);
  if(!Number.isSafeInteger(lhs))return null;
  if(row.sense==='='&&lhs!==row.bound || row.sense==='<='&&lhs>row.bound ||
    row.sense==='>='&&lhs<row.bound)return false;
 }
 return true;
}
function objective(model,values){
 const v=model.objective.constant+NAMES.reduce((s,n)=>s+(model.objective.coeff.get(n)??0)*values[n],0);
 return Number.isSafeInteger(v)?v:null;
}
/** The returned MATCH is a proof of identical *integer* feasible sets and
 * identical objective values on every feasible plan, not equality over R^2.
 * The finite rectangular search is sound only when BOTH models have certified
 * global nonnegative integer upper bounds and the combined rectangle fits.
 */
export function proveProductionByEnumeration(model,expected){
 const reference=expectedToModel(expected);
 if(!finiteModel(model)||!finiteModel(reference))return NA('production_lattice_proof_not_available');
 if(model.objective.sense!==reference.objective.sense)return WRONG('wrong_objective');
 const c=NAMES.map(n=>certifiedMax(model,n));
 const r=NAMES.map(n=>certifiedMax(reference,n));
 if(c.some(n=>!Number.isFinite(n))||r.some(n=>!Number.isFinite(n)))
  return NA('production_unbounded_proof_not_available');
 const upper=NAMES.map((_,i)=>Math.max(0,c[i],r[i]));
 if(upper.some(v=>!Number.isSafeInteger(v)||v>MAX_POINTS)||
   (upper[0]+1)*(upper[1]+1)>MAX_POINTS)
  return NA('production_proof_budget_exceeded');
 let feasible=0;
 for(let a=0;a<=upper[0];a++)for(let b=0;b<=upper[1];b++){
  const values={alap:a,premium:b};
  const actual=accepts(model,values),wanted=accepts(reference,values);
  if(actual===null||wanted===null)return NA('production_numeric_proof_not_available');
  if(actual!==wanted){
   if(actual&& !wanted){
    const material=reference.constraints[0],labor=reference.constraints[1];
    const violated=row=>{
     const lhs=NAMES.reduce((s,n)=>s+(row.coeff.get(n)??0)*values[n],0);
     return row.sense==='<='?lhs>row.bound:row.sense==='='?lhs!==row.bound:lhs<row.bound;
    };
    if(material&&violated(material))return WRONG('production_model_material');
    if(labor&&violated(labor))return WRONG('production_model_labor');
   }
   return WRONG('production_model_feasible_set');
  }
  if(wanted){
   feasible++;
   const x=objective(model,values),y=objective(reference,values);
   if(x===null||y===null)return NA('production_numeric_proof_not_available');
   if(x!==y)return WRONG('production_model_profit');
  }
 }
 if(feasible===0)return NA('production_reference_unexpectedly_infeasible');
 return MATCH;
}
