/** R16.11: exact finite-domain equivalence for the 3x3 binary assignment task.
 * Receives ONLY structural data parsed by R15's existing MathProg parser.
 * Exhausts the entire 2^9 feasible universe, with no solver, execution or LLM.
 * Unproven variable domains are UNSUPPORTED, never labelled wrong merely
 * because the exact finite-domain proof preconditions were not established.
 */
const UNASSESSABLE = code => ({status:'UNASSESSABLE',code,verifiedBy:'r1611_finite_binary_exhaustion'});
const WRONG = code => ({status:'ZERO_CREDIT',code,verifiedBy:'r1611_finite_binary_exhaustion'});
const MATCH = Object.freeze({status:'MATCH',code:null,verifiedBy:'r1611_finite_binary_exhaustion'});
const delta = 1e-8;
const names = Array.from({length:9},(_,i)=>`a${Math.floor(i/3)+1}${i%3+1}`);
const finite = n => typeof n==='number' && Number.isFinite(n) && Math.abs(n)<=1e7;

function hasBinaryDomains(vars){
  return names.every(n=>{
    const v=vars.get(n);
    return v && v.integer===true && v.lower===0 && v.upper===1;
  });
}
function checkConstraint(c, values){
  if(!c || !['=','<=','>='].includes(c.sense) || !finite(c.bound) || !(c.coeff instanceof Map))
    return null;
  let lhs=0;
  for(const [name,coeff] of c.coeff){
    if(!Object.hasOwn(values,name)||!finite(coeff))return null;
    lhs+=coeff*values[name];
  }
  if(!finite(lhs))return null;
  return c.sense==='='?Math.abs(lhs-c.bound)<=delta:
    c.sense==='<='?lhs<=c.bound+delta:lhs>=c.bound-delta;
}
function feasibility(constraints,values){
  for(const c of constraints){
    const result=checkConstraint(c,values);
    if(result===null)return null;
    if(!result)return false;
  }
  return true;
}
function objectiveValue(obj,values){
  if(!obj || !(obj.coeff instanceof Map) || !finite(obj.constant))return null;
  let value=obj.constant;
  for(const [name,coef] of obj.coeff){
    if(!Object.hasOwn(values,name)||!finite(coef))return null;
    value+=coef*values[name];
  }
  return finite(value)?value:null;
}
/**
 * The reference and candidate must have EXACT binary variable domains.
 * With this precondition, checking all 512 vectors proves identical feasible
 * sets and equal objectives on every feasible assignment; redundant rows,
 * scaled equalities and reordered constraints are all valid when equivalent.
 * Never call on other mixed-integer, continuous or indexed problems.
 */
export function proveAssignmentByEnumeration(model,expected){
  if(model?.ok!==true || !(model.vars instanceof Map) || !Array.isArray(model.constraints) ||
     !model.objective || !expected?.vars || !Array.isArray(expected.constraints) || !expected.objective)
    return UNASSESSABLE('invalid_assignment_model');
  if(model.vars.size!==9 || names.some(n=>!model.vars.has(n)) ||
     Object.keys(expected.vars).length!==9 || names.some(n=>!Object.hasOwn(expected.vars,n)))
    return WRONG('wrong_variables');
  if(!hasBinaryDomains(model.vars) || !names.every(n=>{
    const v=expected.vars[n];return v.integer===true && v.lower===0 && v.upper===1;
  }))return UNASSESSABLE('binary_domain_not_proven');
  if(model.objective.sense!==expected.objective.sense)return WRONG('wrong_objective');
  const reference={...expected.objective,coeff:new Map(Object.entries(expected.objective.coeff))};
  const refConstraints=expected.constraints.map(c=>({...c,coeff:new Map(Object.entries(c.coeff))}));
  let feasible=0;
  for(let bits=0;bits<512;bits++){
    const values=Object.fromEntries(names.map((n,i)=>[n,(bits>>i)&1]));
    const actual=feasibility(model.constraints,values);
    const wanted=feasibility(refConstraints,values);
    if(actual===null||wanted===null)return UNASSESSABLE('unsupported_numeric_form');
    if(actual!==wanted)return WRONG('wrong_constraint');
    if(wanted){
      feasible++;
      const x=objectiveValue(model.objective,values);
      const y=objectiveValue(reference,values);
      if(x===null||y===null)return UNASSESSABLE('unsupported_numeric_form');
      if(Math.abs(x-y)>delta)return WRONG('wrong_objective');
    }
  }
  if(feasible!==6)return UNASSESSABLE('unexpected_reference_feasible_set');
  return MATCH;
}
