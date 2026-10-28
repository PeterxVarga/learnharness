/** Bounded parser of the documented glpsol --write plain solution header.
 * These are *solver-reported* diagnostic statuses, never exam grade proof.
 * The printable --output report is kept separately for human inspection.
 */
const number=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const states=Object.freeze({
 mip:{o:'OPTIMAL',f:'FEASIBLE_NOT_PROVEN_OPTIMAL',n:'INFEASIBLE',u:'UNDEFINED'},
 ipt:{o:'OPTIMAL',i:'INFEASIBLE',n:'INFEASIBLE',u:'UNDEFINED'}
});
export function readGlpkSolutionStatus(raw){
 const unknown=code=>({solverStatus:'UNKNOWN',objective:null,solutionKind:null,statusCode:code});
 if(typeof raw!=='string'||raw.length>65536)return unknown('invalid_solution_file');
 // Do not parse stdout or printable --output: both can contain MathProg printf.
 const lines=raw.split(/\r?\n/).filter(s=>s&&!s.startsWith('c '));
 if(!lines.length||!/^s (?:mip|ipt|bas) /.test(lines[0]))return unknown('missing_solution_header');
 const parts=lines[0].trim().split(/\s+/);
 const kind=parts[1];
 if(!['bas','mip','ipt'].includes(kind))return unknown('unsupported_solution_kind');
 const expected=kind==='bas'?7:6;
 if(parts.length!==expected)return unknown('invalid_solution_header');
 const rows=Number(parts[2]),cols=Number(parts[3]);
 if(!Number.isSafeInteger(rows)||!Number.isSafeInteger(cols)||rows<0||cols<0||rows>10000||cols>10000)
  return unknown('invalid_dimensions');
 const rawObj=parts.at(-1);
 if(!number.test(rawObj))return unknown('invalid_objective');
 const objective=Number(rawObj);
 if(!Number.isFinite(objective))return unknown('invalid_objective');
 let solverStatus='UNKNOWN';
 if(kind==='bas'){
  const primal=parts[4],dual=parts[5];
  if(!/^[fuin]$/.test(primal)||!/^[fuin]$/.test(dual))return unknown('invalid_solution_status');
  if(primal==='f'&&dual==='f')solverStatus='OPTIMAL';
  else if(primal==='n')solverStatus='INFEASIBLE';
  else if(primal==='f'&&dual==='n')solverStatus='UNBOUNDED';
  else if(primal==='f')solverStatus='FEASIBLE_NOT_PROVEN_OPTIMAL';
  else solverStatus='UNDEFINED';
 }else{
  solverStatus=states[kind][parts[4]]??'UNKNOWN';
  if(solverStatus==='UNKNOWN')return unknown('invalid_solution_status');
 }
 return {solverStatus,objective,solutionKind:kind,statusCode:'parsed_glpsol_solution_header'};
}
