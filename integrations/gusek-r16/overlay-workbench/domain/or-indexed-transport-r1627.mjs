/**
 * Narrow, non-executing verification for the second university exam task.
 * A different mathematically equivalent representation is UNASSESSABLE.
 * No eval, solver, GLPK, network, persistence or private exam material.
 */
const int=n=>Number.isSafeInteger(n)&&n>=0&&n<=1_000_000;
const nums=(s,count)=>{
 const a=s.trim().split(/\s+/).map(Number);
 return a.length===count&&a.every(int)?a:null;
};
const eq=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]);
const unsupported=()=>({status:'UNASSESSABLE',code:'indexed_canonical_proof_not_available'});
const wrong=()=>({status:'MISMATCH',code:'indexed_data_mismatch'});
export function indexedTransportStarter(task){
 if(task?.kind!=='transport_indexed')throw Error('indexed_transport_task_required');
 const line=(name,values)=>'param '+name+' := '+values.map((v,i)=>(i+1)+' '+v).join(' ')+';';
 return [
  '# Ugyanaz a 3x3-as szallitas, altalanos GMPL-ben. TODO-k kitoltendoek.',
  'set I;', 'set J;',
  'param supply{I};', 'param demand{J};', 'param cost{I,J};', 'param routeLimit;',
  'var x{i in I,j in J} >= 0, integer;',
  '# TODO: s.t. keszlet{i in I}: sum{j in J} x[i,j] = supply[i];',
  '# TODO: s.t. igeny{j in J}: sum{i in I} x[i,j] = demand[j];',
  '# TODO: s.t. utvonal: x[1,2] <= routeLimit;',
  '# TODO: minimize osszkoltseg: sum{i in I,j in J} cost[i,j]*x[i,j];',
  'data;',
  'set I := 1 2 3;', 'set J := 1 2 3;',
  line('supply',task.supply), line('demand',task.demand),
  'param cost : 1 2 3 :=',
  ...task.costs.map((row,i)=>'  '+(i+1)+' '+row.join(' ')),
  ';',
  'param routeLimit := '+task.routeLimit+';',
  'end;'
 ].join('\n');
}
/** Proof of a bounded canonical indexed schema, NOT arbitrary GMPL. */
export function verifyIndexedTransport(task,source){
 if(task?.kind!=='transport_indexed'||typeof source!=='string'||source.length<20||source.length>32000)
  return unsupported();
 if(/[\u0000-\u0008\u000b\u000e-\u001f]/.test(source))return unsupported();
 const cleaned=source.replace(/\r\n?/g,'\n').replace(/#[^\n]*/g,'');
 if(/["'\x60]/.test(cleaned))return unsupported();
 const parts=cleaned.split(';');
 if(parts.at(-1)?.trim()!=='')return unsupported();
 const stmts=parts.slice(0,-1).map(s=>s.trim()).filter(Boolean);
 if(stmts.length!==19)return unsupported();
 const c=stmts.map(s=>s.replace(/\s+/g,''));
 const [sI,sJ,pSupply,pDemand,pCost,pRoute,v,row,col,limit,obj,data,dI,dJ,ds,dd,dc,dr,end]=c;
 if(sI!=='setI'||sJ!=='setJ'||pSupply!=='paramsupply{I}'||pDemand!=='paramdemand{J}'||
    pCost!=='paramcost{I,J}'||pRoute!=='paramrouteLimit'||
    v!=='varx{iinI,jinJ}>=0,integer'||data!=='data'||end!=='end')
  return unsupported();
 if(!/^s\.t\.[a-z][a-z0-9_]*\{iinI\}:sum\{jinJ\}x\[i,j\]=supply\[i\]$/.test(row)||
    !/^s\.t\.[a-z][a-z0-9_]*\{jinJ\}:sum\{iinI\}x\[i,j\]=demand\[j\]$/.test(col)||
    !/^s\.t\.[a-z][a-z0-9_]*:x\[1,2\]<=routeLimit$/.test(limit)||
    !/^minimize[a-z][a-z0-9_]*:sum\{iinI,jinJ\}cost\[i,j\]\*x\[i,j\]$/.test(obj))
  return unsupported();
 if(dI!=='setI:=123'||dJ!=='setJ:=123')return unsupported();
 const key=(str,name,count)=>{
  const match=new RegExp('^param\\s+'+name+'\\s*:=\\s*([\\s\\S]+)$').exec(str);
  return match?nums(match[1],count):null;
 };
 const supply=key(stmts[14],'supply',6),demand=key(stmts[15],'demand',6);
 if(!supply||!demand||supply.some((v,i)=>i%2===0&&v!==i/2+1)||
    demand.some((v,i)=>i%2===0&&v!==i/2+1))return unsupported();
 const matrix=/^param\s+cost\s*:\s*1\s+2\s+3\s*:=\s*([\s\S]+)$/.exec(stmts[16]);
 const cost=matrix?nums(matrix[1],12):null;
 if(!cost||cost.some((v,i)=>i%4===0&&v!==i/4+1))return unsupported();
 const route=key(stmts[17],'routeLimit',1);
 if(!route)return unsupported();
 if(!eq([supply[1],supply[3],supply[5]],task.supply)||
    !eq([demand[1],demand[3],demand[5]],task.demand)||
    !eq([cost[1],cost[2],cost[3],cost[5],cost[6],cost[7],cost[9],cost[10],cost[11]],task.costs.flat())||
    route[0]!==task.routeLimit)return wrong();
 return {status:'MATCH',code:null};
}
