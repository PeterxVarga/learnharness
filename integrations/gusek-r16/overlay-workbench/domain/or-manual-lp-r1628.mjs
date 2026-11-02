/** R16.28: bounded manual LP exercises, with no learner-source execution.
 * Both exam subjects share a deterministic 2-variable continuous LP.
 * Exact construction, independent vertex oracle, and complete canonical pivot trace.
 * This grades ONLY the explicitly requested representation, not arbitrary simplex methods.
 */
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000;
const close=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
const invalid=(code,scope='solution',points=0)=>({
 points,maxPoints:1,correct:points===null?null:false,
 status:points===null?'UNASSESSABLE':'ZERO_CREDIT',errors:[code],
 verifiedBy:'r1628_exact_bounded_lp_manual',diagnosticScope:scope
});
const good=()=>({points:1,maxPoints:1,correct:true,status:'FULL_CREDIT',
 errors:[],verifiedBy:'r1628_exact_bounded_lp_manual',diagnosticScope:'exam'});
export function manualTask(kind,seed){
 if(!['simplex','graphical'].includes(kind)||!Number.isSafeInteger(seed)||seed<0||seed>4294967295)
  throw Error('invalid_manual_task');
 const p=seed%4,q=Math.floor(seed/4)%4;
 const rhs=[6+p+q,9+2*p+q],profit=[3,2];
 return {schema:'tredven.or.manual-lp.v1',kind,id:'or-'+kind+'-'+seed,seed,
  title:kind==='simplex'?'Kézi szimplex – két kötelező pivot':'Grafikus LP – megengedett tartomány és optimum',
  objectiveSense:'max',variableNames:['x','y'],coefficients:[[1,1],[2,1]],rhs,profit,
  initialTableau:[[-3,-2,0,0,0],[1,1,1,0,rhs[0]],[2,1,0,1,rhs[1]]],
  statement:'Szintetikus folytonos LP: max 3x+2y, x+y ≤ '+rhs[0]+', 2x+y ≤ '+rhs[1]+', x,y ≥ 0. '+(
   kind==='simplex'?'Kézzel végezd el a szimplex két pivotját; a belépő oszlop mindig a célfüggvénysor legnegatívabb együtthatója, a kilépő sor a legkisebb pozitív hányadosé. A mátrix oszlopai x,y,s1,s2,RHS, sorai célfüggvény,s1,s2 kezdetben.':
   'Rajzold fel a megengedett tartományt, sorold fel mind a négy csúcspontját tetszőleges sorrendben, és add meg az optimális pontot és értéket.'
  )+' Nem az eredeti egyetemi minta számai.'};
}
export function manualStarter(task){
 if(task.kind==='simplex')return JSON.stringify({steps:[
  {enter:'',leave:'',tableau:[[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null]]},
  {enter:'',leave:'',tableau:[[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null]]}
 ]},null,2);
 return JSON.stringify({vertices:[[null,null],[null,null],[null,null],[null,null]]},null,2);
}
const feasible=(t,[x,y])=>x>=-1e-9&&y>=-1e-9&&
 x+y<=t.rhs[0]+1e-9&&2*x+y<=t.rhs[1]+1e-9;
export function manualReference(task){
 const [b1,b2]=task.rhs;
 const vertices=[[0,0],[b2/2,0],[b2-b1,2*b1-b2],[0,b1]];
 if(vertices.some(v=>!feasible(task,v)))throw Error('invalid_trusted_vertices');
 const scored=vertices.map(([x,y])=>3*x+2*y);
 const optimum=Math.max(...scored),exemplar=vertices[scored.indexOf(optimum)];
 return {vertices,objective:optimum,exemplar};
}
const asMatrix=t=>t.initialTableau.map(row=>[...row]);
function pivot(tableau,row,col){
 const p=tableau[row][col];
 if(p<=1e-12)throw Error('invalid_trusted_pivot');
 const next=tableau.map(r=>[...r]);
 next[row]=next[row].map(n=>n/p);
 for(let i=0;i<next.length;i++)if(i!==row){
  const m=next[i][col];
  next[i]=next[i].map((n,j)=>n-m*next[row][j]);
 }
 return next;
}
function canonicalSteps(task){
 const first=pivot(asMatrix(task),2,0);
 const second=pivot(first,1,1);
 if(first[0][1]>=0||second[0].slice(0,4).some(n=>n<-1e-9))
  throw Error('trusted_pivot_not_optimal');
 return [{enter:'x',leave:'s2',tableau:first},
  {enter:'y',leave:'s1',tableau:second}];
}
const isMatrix=m=>Array.isArray(m)&&m.length===3&&m.every(row=>
 Array.isArray(row)&&row.length===5&&row.every(finite));
const valsOk=(t,values)=>{
 if(!values||typeof values!=='object'||Array.isArray(values)||
  Object.keys(values).sort().join(',')!=='x,y')return false;
 return finite(values.x)&&finite(values.y);
};
export function gradeManual(task,answer){
 if(!answer||typeof answer!=='object'||typeof answer.mathprog!=='string'||
  answer.mathprog.length>32000)return invalid('manual_trace_unassessable','grammar',null);
 let trace;
 try{trace=JSON.parse(answer.mathprog);}catch{return invalid('manual_trace_unassessable','grammar',null);}
 if(!trace||typeof trace!=='object'||Array.isArray(trace))return invalid('manual_trace_unassessable','grammar',null);
 if(task.kind==='simplex'){
  if(Object.keys(trace).join(',')!=='steps'||!Array.isArray(trace.steps)||trace.steps.length!==2)
   return invalid('manual_trace_unassessable','grammar',null);
  const expected=canonicalSteps(task);
  for(let i=0;i<2;i++){
   const step=trace.steps[i],want=expected[i];
   if(!step||typeof step!=='object'||Array.isArray(step)||
    Object.keys(step).sort().join(',')!=='enter,leave,tableau')
    return invalid('manual_trace_unassessable','grammar',null);
   if(step.enter!==want.enter)return invalid('simplex_entering_column');
   if(step.leave!==want.leave)return invalid('simplex_leaving_row');
   if(!isMatrix(step.tableau))return invalid('manual_trace_unassessable','grammar',null);
   if(!step.tableau.every((row,r)=>row.every((n,c)=>close(n,want.tableau[r][c]))))
    return invalid('simplex_pivot_arithmetic');
  }
 } else if(task.kind==='graphical'){
  if(Object.keys(trace).join(',')!=='vertices'||!Array.isArray(trace.vertices)||
   trace.vertices.length!==4||trace.vertices.some(v=>!Array.isArray(v)||v.length!==2||!v.every(finite)))
    return invalid('manual_trace_unassessable','grammar',null);
  const expected=manualReference(task).vertices;
  if(!expected.every(v=>trace.vertices.some(u=>close(u[0],v[0])&&close(u[1],v[1]))))
   return invalid('graphical_vertices_incorrect');
  if(trace.vertices.some((u,i)=>trace.vertices.some((v,j)=>j!==i&&close(u[0],v[0])&&close(u[1],v[1]))))
   return invalid('graphical_vertices_incorrect');
 } else return invalid('manual_trace_unassessable','grammar',null);
 if(!valsOk(task,answer.values))return invalid('solution_values_invalid');
 const [x,y]=[answer.values.x,answer.values.y];
 if(!feasible(task,[x,y]))return invalid('graphical_point_infeasible');
 if(!close(answer.reportedObjective,3*x+2*y))return invalid('objective_mismatch');
 if(!close(answer.reportedObjective,manualReference(task).objective))return invalid('not_optimal');
 if(answer.hintsUsed!==false)return invalid('independence_not_demonstrated','evidence');
 return good();
}
