/** Join two *distinct* GLPK machine outputs:
 *   --write solution.raw: s mip|bas|ipt ... and j <index> <activity>...
 *   --wglp problem.glp: n j <index> <column-name>
 * A bare glpsol exit=0, stdout or printable --output is never accepted.
 * Values are for inspection/explicit transfer, NOT exam certification.
 */
const MAX_BYTES=49152;
const MAX_COLUMNS=300;
const NUM=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const NAME=/^[A-Za-z_][A-Za-z0-9_]*(?:\[[A-Za-z0-9_,.\-]+\])?$/;
export function parseGlpkColumns(solution,problem,{solverStatus,objective,solutionKind}={}){
 if(solverStatus!=='OPTIMAL'||!Number.isFinite(objective)||!['mip','bas','ipt'].includes(solutionKind))
  return {status:'NOT_TRANSFERABLE',columns:[]};
 if(typeof solution!=='string'||typeof problem!=='string'||
    solution.length>MAX_BYTES||problem.length>MAX_BYTES)
  return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
 const sol=solution.split(/\r?\n/);
 const glp=problem.split(/\r?\n/);
 const header=sol.find(line=>line.startsWith('s '));
 const parts=header?.trim().split(/\s+/);
 if(!parts||parts[0]!=='s'||parts[1]!==solutionKind||parts.length!==(solutionKind==='bas'?7:6))
  return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
 const rows=Number(parts[2]);
 const count=Number(parts[3]);
 if(!Number.isSafeInteger(rows)||rows<0||rows>10000||
    !Number.isSafeInteger(count)||count<1||count>MAX_COLUMNS)
  return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
 const names=new Map(),values=new Map(),namesSeen=new Set();
 let glpCount=null;
 const endMarker='e o f';
 if(sol.filter(x=>x.trim()===endMarker).length!==1||
    glp.filter(x=>x.trim()===endMarker).length!==1||
    sol.filter(Boolean).at(-1)?.trim()!==endMarker||
    glp.filter(Boolean).at(-1)?.trim()!==endMarker)
  return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
 for(const line of glp){
  if(line.startsWith('p ')){
   const p=line.trim().split(/\s+/);
   if(p.length!==6||p[0]!=='p'||!['lp','mip'].includes(p[1])||
      !['min','max'].includes(p[2])||
      (solutionKind==='mip'&&p[1]!=='mip')||
      (solutionKind!=='mip'&&p[1]!=='lp')||
      Number(p[3])!==rows)return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
   const n=Number(p[4]);
   if(!Number.isSafeInteger(n)||n!==count)return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
   if(glpCount!==null)return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
   glpCount=n;
  }
  if(!line.startsWith('n j '))continue;
  const m=/^n j ([1-9]\d*) (\S+)$/.exec(line.trim());
  if(!m)return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
  const i=Number(m[1]),name=m[2];
  if(i>count||!NAME.test(name)||names.has(i)||namesSeen.has(name))
   return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
  names.set(i,name);namesSeen.add(name);
 }
 if(glpCount!==count||names.size!==count)return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
 for(const line of sol){
  if(!line.startsWith('j '))continue;
  const fields=line.trim().split(/\s+/);
  const expected=solutionKind==='mip'?3:solutionKind==='bas'?5:4;
  if(fields.length!==expected)return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
  const i=Number(fields[1]),token=fields[solutionKind==='bas'?3:2];
  if(!Number.isSafeInteger(i)||i<1||i>count||values.has(i)||!NUM.test(token))
   return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
  if(solutionKind==='bas'&&!/^[blufs]$/.test(fields[2]))
   return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
  const value=Number(token);
  if(!Number.isFinite(value))return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
  values.set(i,value);
 }
 if(values.size!==count)return {status:'INVALID_MACHINE_OUTPUT',columns:[]};
 return {status:'OPTIMAL_COLUMNS',columns:Array.from({length:count},(_,k)=>({
  name:names.get(k+1),value:values.get(k+1)
 }))};
}
