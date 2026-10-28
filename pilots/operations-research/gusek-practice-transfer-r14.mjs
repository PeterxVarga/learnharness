/** Explicit GLPK-to-Practice answer transfer. Never awards points.
 * Only a complete, named, OPTIMAL result for the current exact model/data
 * and the current task's authorized variable names may populate the form.
 */
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const reject=code=>({ok:false,code});
export function preparePracticeTransfer({result,task,dialect,model,data,snapshot}={}){
 if(!task||!Array.isArray(task.variableNames)||!['scalar','indexed'].includes(dialect))
  return reject('invalid_task');
 if(!result||result.status!=='GLPK_COMPLETED'||result.mode!=='solve'||
    result.solverStatus!=='OPTIMAL'||result.columnStatus!=='OPTIMAL_COLUMNS'||
    result.points!==null||result.graded!==false||!finite(result.objective))
  return reject('nonoptimal_or_unverified_solution');
 if(!snapshot||snapshot.model!==model||snapshot.data!==data)
  return reject('stale_solver_result');
 const expected=task.kind==='transport'&&dialect==='indexed'?
  Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>'x['+(i+1)+','+(j+1)+']')).flat():
  task.variableNames;
 if(!Array.isArray(result.columns)||expected.length!==result.columns.length||
    expected.length===0||expected.length>30)return reject('wrong_column_count');
 const names=new Set(expected), seen=new Set(), values={};
 for(const column of result.columns){
  if(!column||typeof column.name!=='string'||!names.has(column.name)||
     seen.has(column.name)||!finite(column.value)||Math.abs(column.value)>1e8)
   return reject('invalid_solution_column');
  seen.add(column.name);
  const rounded=Math.round(column.value);
  const isInt=task.kind!=='tablet';
  values[column.name]=isInt&&Math.abs(rounded-column.value)<=1e-7?rounded:column.value;
 }
 if(seen.size!==names.size)return reject('missing_solution_column');
 return {ok:true,code:null,values,objective:result.objective};
}
