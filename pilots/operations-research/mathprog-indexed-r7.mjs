/**
 * R7 static verifier: an explicit, bounded indexed MathProg transport DIALECT.
 * Source is NEVER evaluated or sent to glpsol. It is checked against the
 * trusted task and an independent enumerated optimum. This is not full GMPL.
 * Indexed parameters intentionally receive their task data from a trusted
 * out-of-band fixture; learner-authored data blocks are NOT supported.
 */
import { gradeTransportExam, makeTransportTask } from './transport-exam-r3.mjs';

const MAX = 16_384;
const bad = (code, adjudicable = true) => ({ok:false,code,adjudicable});
const norm = s => s.replace(/\s+/g,' ').trim();
function cleanStatements(source) {
  if(typeof source!=='string' || source.length<15 || source.length>MAX) return null;
  // No block comments, quoted strings, macro substitution or preprocessor.
  if (/\/\*|\*\/|["'`\\]/.test(source)) return null;
  const cleaned = source.replace(/#[^\r\n]*/g,'').trim();
  if(!cleaned.endsWith(';')) return null;
  const statements=cleaned.split(';').map(norm).filter(Boolean);
  return statements.length>0 && statements.length<=25 ? statements : null;
}
function balancedComparators(supply, demand) {
  // Total supply equals total demand in trusted task. Combining
  // supply <= and demand >= forces both sides to equality, as does
  // the opposite combination. An equality on either family suffices.
  const all = (items,sign)=>items.every(x=>x===sign || x==='=');
  return (all(supply,'<=') && all(demand,'>=')) ||
    (all(supply,'>=') && all(demand,'<=')) ||
    (supply.every(x=>x==='=') && demand.every(x=>['=','<=','>='].includes(x))) ||
    (demand.every(x=>x==='=') && supply.every(x=>['=','<=','>='].includes(x)));
}
export function assessIndexedMathProg(task, source) {
  const statements=cleanStatements(source);
  if(!statements) return bad('invalid_or_unsupported_source', false);
  // Disallow in-band model data, file IO, and arbitrary solver commands.
  if(statements.some(s=>/^(data|include|table|read|write|printf|display|check|for|let)\b/i.test(s)))
    return bad('unsupported_statement', false);
  if(statements.at(-2)!=='solve'||statements.at(-1)!=='end') return bad('missing_solve_or_end',true);
  const decls=statements.slice(0,-2);
  const expected=['set_i','set_j','param_supply','param_demand','param_cost','param_cap','var_x','objective','supply_balance','demand_balance'];
  const found=new Map(), names=new Set();
  let capConstraints=0;
  for(const line of decls) {
    let tag=null,info=null;
    if(/^set I$/.test(line))tag='set_i';
    else if(/^set J$/.test(line))tag='set_j';
    else if(/^param supply\s*\{\s*i in I\s*\}$/.test(line))tag='param_supply';
    else if(/^param demand\s*\{\s*j in J\s*\}$/.test(line))tag='param_demand';
    else if(/^param cost\s*\{\s*i in I\s*,\s*j in J\s*\}$/.test(line))tag='param_cost';
    else if(/^param cap\s*\{\s*i in I\s*,\s*j in J\s*\}$/.test(line))tag='param_cap';
    else {
      const variable=/^var x\s*\{\s*i in I\s*,\s*j in J\s*\}\s*>=\s*0\s*(?:,\s*<=\s*cap\s*\[\s*i\s*,\s*j\s*\])?$/.exec(line);
      if(variable){tag='var_x';info={capInVar:/,\s*<=\s*cap/.test(line)};}
      else {
        const obj=/^minimize\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
        if(obj){
          tag='objective';
          info=/^sum\s*\{\s*i in I\s*,\s*j in J\s*\}\s*(?:cost\s*\[\s*i\s*,\s*j\s*\]\s*\*\s*x\s*\[\s*i\s*,\s*j\s*\]|x\s*\[\s*i\s*,\s*j\s*\]\s*\*\s*cost\s*\[\s*i\s*,\s*j\s*\])$/.test(obj[2]);
          if(!info) return bad('incorrect_objective',false); // could be a valid equivalent formulation
          if(names.has(obj[1]))return bad('duplicate_symbol');names.add(obj[1]);
        } else {
          const constraint=/^(?:s\.t\.|subject to)\s+([A-Za-z][A-Za-z0-9_]*)\s*(\{[^}]+\})\s*:\s*(.+)$/.exec(line);
          if(constraint){
            if(names.has(constraint[1]))return bad('duplicate_constraint_name');names.add(constraint[1]);
            const domain=norm(constraint[2]);const rhs=constraint[3];
            const row=/^sum\s*\{\s*j in J\s*\}\s*x\s*\[\s*i\s*,\s*j\s*\]\s*(<=|>=|=)\s*supply\s*\[\s*i\s*\]$/.exec(rhs);
            const col=/^sum\s*\{\s*i in I\s*\}\s*x\s*\[\s*i\s*,\s*j\s*\]\s*(<=|>=|=)\s*demand\s*\[\s*j\s*\]$/.exec(rhs);
            const cap=/^x\s*\[\s*i\s*,\s*j\s*\]\s*<=\s*cap\s*\[\s*i\s*,\s*j\s*\]$/.exec(rhs);
            if(domain==='{i in I}'&&row){tag='supply_balance';info=row[1];}
            else if(domain==='{j in J}'&&col){tag='demand_balance';info=col[1];}
            else if(domain==='{i in I, j in J}'&&cap){tag='route_cap';info=true;capConstraints++;}
            else return bad('unknown_constraint_form',false);
          }
        }
      }
    }
    if(!tag) return bad('unsupported_statement',false);
    if(found.has(tag))return bad('duplicate_'+tag);
    found.set(tag,info ?? true);
  }
  for(const name of expected)if(!found.has(name))return bad('missing_'+name);
  // One correct cap implementation is enough; both also equivalent.
  if(!found.get('var_x').capInVar && capConstraints===0)return bad('missing_route_capacity');
  const rowSigns=[found.get('supply_balance')],colSigns=[found.get('demand_balance')];
  if(!balancedComparators(rowSigns,colSigns))return bad('non_equivalent_balances',false);
  if(task.supply.reduce((a,b)=>a+b,0)!==task.demand.reduce((a,b)=>a+b,0))
    return bad('trusted_task_not_balanced');
  return {ok:true,code:null,adjudicable:true,verifiedBy:'bounded_indexed_source_structure'};
}
export function gradeIndexedMathProg(seed, answer) {
  const task=makeTransportTask(seed);
  const verdict=assessIndexedMathProg(task,answer?.mathprog);
  if(!verdict.ok&&!verdict.adjudicable) return {status:'UNASSESSABLE',points:null,maxPoints:1,
    correct:null,errors:['source_'+verdict.code],dialect:'indexed_r7_model_only',verifiedBy:'unsupported_source_dialect'};
  const grade=gradeTransportExam(task,{
    model:verdict.ok?{sense:task.sense,nonnegative:true,supply:task.supply,demand:task.demand,costs:task.costs,capacities:task.capacities}:null,
    allocation:answer?.allocation,reportedObjective:answer?.reportedObjective,hintsUsed:answer?.hintsUsed,
  });
  const errors=[...new Set([...(verdict.ok?[]:['source_'+verdict.code]),...grade.errors])];
  const correct=errors.length===0;
  return {status:correct?'FULL_CREDIT':'ZERO_CREDIT',points:correct?1:0,maxPoints:1,correct,errors,
    dialect:'indexed_r7_model_only',verifiedBy:'bounded_indexed_source_and_integer_enumeration'};
}
/** Documentation/test example only: never include in an unattempted student problem response. */
export const EXAMPLE_INDEXED_MODEL=`set I;
set J;
param supply{i in I};
param demand{j in J};
param cost{i in I,j in J};
param cap{i in I,j in J};
var x{i in I,j in J} >= 0, <= cap[i,j];
minimize total: sum{i in I,j in J} cost[i,j] * x[i,j];
s.t. supply_balance{i in I}: sum{j in J} x[i,j] = supply[i];
s.t. demand_balance{j in J}: sum{i in I} x[i,j] = demand[j];
solve;
end;`;
/** Reference data is generated only by server for a fixed seed; not by submitted source. */
export function trustedIndexedData(seed) {
  const task=makeTransportTask(seed);
  const row = (v)=>v.map((n,i)=>`${i+1} ${n}`).join(' ');
  const matrix = a=>a.map((v,i)=>`${i+1} ${v.join(' ')}`).join('\n');
  return `data;\nset I := 1 2 3;\nset J := 1 2 3;\nparam supply := ${row(task.supply)};\nparam demand := ${row(task.demand)};\nparam cost: 1 2 3 :=\n${matrix(task.costs)};\nparam cap: 1 2 3 :=\n${matrix(task.capacities)};\nend;\n`;
}
