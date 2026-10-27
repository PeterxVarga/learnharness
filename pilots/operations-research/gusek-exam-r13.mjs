/** R13: GUSEK/GMPL syntax on bounded, synthetic university-style tasks.
 * All code is parsed as data. No learner text is sent to glpsol or executed.
 */
import {makeTransportTask,solveTransportTask} from './transport-exam-r3.mjs';
import {parseGusekModel,verifyGusekModel} from './gusek-model-r13.mjs';

const TRANSPORT_NAMES=[
 ['Raktar1_Bolt1','Raktar1_Bolt2','Raktar1_Bolt3'],
 ['Raktar2_Bolt1','Raktar2_Bolt2','Raktar2_Bolt3'],
 ['Raktar3_Bolt1','Raktar3_Bolt2','Raktar3_Bolt3'],
];
const DRINK_NAMES=['xKF','xNF','xHL','xHM','xVHM','xKR','xSF','xPF','xHU','xLF'];
const DRINK_WINE=[1,2,1,3,2,8,1,5,4,1];
const DRINK_SODA=[1,1,2,2,3,1,8,3,2,4];
const DRINK_PRICES=[210,340,220,475,410,1440,320,880,610,260];
const DRINK_LABELS=['Kisfröccs','Nagyfröccs','Hosszúlépés','Házmester','Viceházmester','Krúdy-fröccs','Sóher-fröccs','Puskás-fröccs','Háziúr','Lakófröccs'];
const validSeed = seed => Number.isSafeInteger(seed)&&seed>=0&&seed<=0xffffffff;
const validNum = x => typeof x==='number'&&Number.isFinite(x)&&x>=-1e-7&&x<1e8;
const approximately = (a,b)=>Math.abs(a-b) <= 1e-6 * Math.max(1,Math.abs(a),Math.abs(b));
const constraints = (lines) => lines.map(x=>`s.t. ${x};`);

export function makeGusekTask(kind='transport', seed=42){
  if(!validSeed(seed))throw new Error('invalid_seed');
  if(kind==='transport'){
    const t=makeTransportTask(seed);
    return {...t,kind,id:`gusek-transport-${seed}`,variableNames:TRANSPORT_NAMES.flat(),taskType:'3×3 szállítás (egész változók)',objectiveSense:'min'};
  }
  if(kind==='froccs')return {kind,seed,id:`gusek-froccs-${seed}`,taskType:'Fröccs – egészértékű bevételmaximalizálás',
    variableNames:DRINK_NAMES,labels:DRINK_LABELS,wine:DRINK_WINE,soda:DRINK_SODA,prices:DRINK_PRICES,
    availableWine:18+(seed%5),availableSoda:23+((seed>>>3)%5),objectiveSense:'max'};
  if(kind==='tablet')return {kind,seed,id:`gusek-tablet-${seed}`,taskType:'Tabletták – folytonos költségminimalizálás',
    variableNames:['epres','spenotos'],target:55+(seed%3),maxTablets:9,
    knowledge:[6,9],prices:[1400,2100],objectiveSense:'min'};
  throw new Error('unsupported_kind');
}

export function trustedGusekModel(task){
  if(task.kind==='transport'){
    const x=TRANSPORT_NAMES;
    return [
      ...x.flat().map(name=>`var ${name} >=0, integer;`),
      ...constraints(task.supply.map((n,i)=>`supply_${i+1}: ${x[i].join(' + ')} = ${n}`)),
      ...constraints(task.demand.map((n,j)=>`demand_${j+1}: ${x.map(row=>row[j]).join(' + ')} = ${n}`)),
      `s.t. route_cap: ${x[0][2]} <= ${task.capacities[0][2]};`,
      `minimize szallitas: ${task.costs.flatMap((row,i)=>row.map((c,j)=>`${c}*${x[i][j]}`)).join(' + ')};`,
    ].join('\n');
  }
  if(task.kind==='froccs')return [
    ...task.variableNames.map(name=>`var ${name} >=0, integer;`),
    `s.t. wine: ${task.wine.map((c,i)=>`${c}*${task.variableNames[i]}`).join(' + ')} <= ${task.availableWine};`,
    `s.t. soda: ${task.soda.map((c,i)=>`${c}*${task.variableNames[i]}`).join(' + ')} <= ${task.availableSoda};`,
    `maximize TotalIncome: ${task.prices.map((c,i)=>`${c}*${task.variableNames[i]}`).join(' + ')};`,
  ].join('\n');
  if(task.kind==='tablet')return [
    'var epres >=0;',
    'var spenotos >=0;',
    `s.t. siker: ${task.knowledge[1]}*spenotos + ${task.knowledge[0]}*epres >= ${task.target};`,
    's.t. osszetetel: spenotos <= epres;',
    `s.t. adag: epres + spenotos <= ${task.maxTablets};`,
    `minimize koltseg: ${task.prices[0]}*epres + ${task.prices[1]}*spenotos;`,
  ].join('\n');
  throw new Error('unsupported_kind');
}

/** Reference exact bounded integer dynamic program; independent of submitted model. */
export function solveFroccs(task){
  const W=task.availableWine,S=task.availableSoda, columns=S+1, size=(W+1)*columns;
  const best=new Float64Array(size).fill(-Infinity),prev=new Int32Array(size).fill(-1),via=new Int16Array(size).fill(-1);
  best[0]=0;
  for(let wine=0;wine<=W;wine++)for(let soda=0;soda<=S;soda++){
    const index=wine*columns+soda;if(!Number.isFinite(best[index]))continue;
    for(let i=0;i<task.variableNames.length;i++){
      const w=wine+task.wine[i],s=soda+task.soda[i];if(w>W||s>S)continue;
      const dest=w*columns+s,value=best[index]+task.prices[i];
      if(value>best[dest]){best[dest]=value;prev[dest]=index;via[dest]=i;}
    }
  }
  let winner=0;for(let i=0;i<size;i++)if(best[i]>best[winner])winner=i;
  const values=Object.fromEntries(task.variableNames.map(n=>[n,0]));
  for(let cur=winner;cur!==0;cur=prev[cur]){if(via[cur]<0)throw Error('froccs_oracle_corrupt');values[task.variableNames[via[cur]]]++;}
  return {status:'optimal',objective:best[winner],values};
}

/** 2-variable continuous LP: candidate vertices from boundary intersections. */
export function solveTablet(task){
  const c=[
    {a:task.knowledge[0],b:task.knowledge[1],v:task.target},
    {a:-1,b:1,v:0},
    {a:1,b:1,v:task.maxTablets},
    {a:1,b:0,v:0},
    {a:0,b:1,v:0}
  ];
  let optimum=Infinity,values=null;
  for(let i=0;i<c.length;i++)for(let j=i+1;j<c.length;j++){
    const p=c[i],q=c[j],denom=p.a*q.b-q.a*p.b;if(Math.abs(denom)<1e-12)continue;
    const e=(p.v*q.b-q.v*p.b)/denom,s=(p.a*q.v-q.a*p.v)/denom;
    if(e < -1e-7||s < -1e-7||task.knowledge[0]*e+task.knowledge[1]*s+1e-7<task.target||s>e+1e-7||e+s>task.maxTablets+1e-7)continue;
    const cost=task.prices[0]*e+task.prices[1]*s;if(cost<optimum){optimum=cost;values={epres:e,spenotos:s};}
  }
  return values?{status:'optimal',objective:optimum,values}:{status:'infeasible',objective:null,values:null};
}
export function solveGusekTask(task){
  if(task.kind==='froccs')return solveFroccs(task);
  if(task.kind==='tablet')return solveTablet(task);
  if(task.kind==='transport'){
    const s=solveTransportTask(task);if(s.status!=='optimal')return {status:s.status,objective:null,values:null};
    return {status:'optimal',objective:s.objective,values:Object.fromEntries(TRANSPORT_NAMES.flatMap((row,i)=>row.map((name,j)=>[name,s.exemplar[i][j]])))};
  }
  throw Error('unsupported_kind');
}
function expectedFromTrusted(task){
  const model=parseGusekModel(trustedGusekModel(task));if(!model.ok)throw Error('trusted_model_invalid:'+model.code);
  return {vars:Object.fromEntries([...model.vars]),objective:{sense:model.objective.sense,constant:model.objective.constant,coeff:Object.fromEntries(model.objective.coeff)},
    constraints:model.constraints.map(c=>({sense:c.sense,coeff:Object.fromEntries(c.coeff),bound:c.bound}))};
}
export function gradeGusekExam(kind,seed,answer){
  const task=makeGusekTask(kind,seed);
  const reject=(points,code)=>({status:points===null?'UNASSESSABLE':'ZERO_CREDIT',points,maxPoints:1,correct:points===null?null:false,errors:[code],verifiedBy:'r13_synthetic_reference_oracle'});
  if(!answer||typeof answer!=='object'||Array.isArray(answer))return reject(0,'invalid_answer');
  const parsed=parseGusekModel(answer.mathprog);
  const verified=verifyGusekModel(parsed,expectedFromTrusted(task));
  if(verified.status==='UNASSESSABLE')return reject(null,'source_'+verified.code);
  if(verified.status!=='MATCH')return reject(0,'source_'+verified.code);
  const values=answer.values;
  if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length!==task.variableNames.length || task.variableNames.some(n=>!Object.hasOwn(values,n)||!validNum(values[n])))return reject(0,'invalid_solution_values');
  const model=parsed, byName=n=>values[n];
  for(const [name,v] of model.vars){const x=byName(name);if(x<v.lower-1e-6||x>v.upper+1e-6||(v.integer&&!approximately(x,Math.round(x))))return reject(0,'solution_variable_domain');}
  for(const c of model.constraints){let lhs=0;for(const [name,k] of c.coeff)lhs+=k*byName(name);
    if(c.sense==='='&&!approximately(lhs,c.bound)||c.sense==='<='&&lhs>c.bound+1e-6||c.sense==='>='&&lhs<c.bound-1e-6)return reject(0,'solution_constraint_violation');
  }
  const reported=answer.reportedObjective;if(!validNum(reported))return reject(0,'invalid_reported_objective');
  let computed=model.objective.constant;for(const [name,k] of model.objective.coeff)computed+=k*byName(name);
  if(!approximately(computed,reported))return reject(0,'objective_mismatch');
  const oracle=solveGusekTask(task);
  if(oracle.status==='infeasible')return reject(null,'reference_problem_infeasible');
  if(!approximately(computed,oracle.objective))return reject(0,'not_optimal');
  if(answer.hintsUsed!==false)return reject(0,'independence_not_demonstrated');
  return {status:'FULL_CREDIT',points:1,maxPoints:1,correct:true,errors:[],verifiedBy:'r13_synthetic_reference_oracle'};
}
