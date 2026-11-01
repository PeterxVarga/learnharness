/** R16.9: strictly allowlisted learner-visible problem facts for a human-approved
 * teaching handoff. Never serializes model source, oracle output, grade details,
 * solver results, identifiers, prompts, user supplied notes or secrets. */
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safeInt=(x,min,max)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
const row=(x,size,min,max)=>Array.isArray(x)&&x.length===size&&x.every(n=>safeInt(n,min,max));
const grid=(x,size,min,max)=>Array.isArray(x)&&x.length===size&&x.every(v=>row(v,size,min,max));
const varNames=(x,n)=>Array.isArray(x)&&x.length===n&&new Set(x).size===n&&
 x.every(s=>typeof s==='string'&&/^[A-Za-z_][A-Za-z_0-9]{0,31}$/.test(s));
const vec=x=>x.join(', ');
const UINT32=4294967295;
/**
 * @param {unknown} task Server-delivered public task shape (not a score receipt)
 * @param {string} taskKind Known GUSEK task family
 * @param {string} gradeTaskId ID of the grade the learner explicitly copied
 * @returns {string|null} Always fail closed: invalid/changed task -> no facts
 */
export function publicTaskContext(task,taskKind,gradeTaskId){
 if(!isObj(task)||!['transport','froccs','tablet'].includes(taskKind)||
    typeof gradeTaskId!=='string'||task.id!==gradeTaskId||task.kind!==taskKind)return null;
 const match=/^gusek-(transport|froccs|tablet)-(0|[1-9]\d{0,9})$/.exec(gradeTaskId);
 if(!match||match[1]!==taskKind||Number(match[2])>UINT32||
    (task.seed!==undefined&&task.seed!==Number(match[2])))return null;
 if(taskKind==='transport'){
  if(task.objectiveSense!=='min'||!row(task.supply,3,1,60)||!row(task.demand,3,1,60)||
     !grid(task.costs,3,1,100000)||!grid(task.capacities,3,0,60)||
     !varNames(task.variableNames,9)||
     task.supply.reduce((a,b)=>a+b,0)!==task.demand.reduce((a,b)=>a+b,0)||
     task.supply.reduce((a,b)=>a+b,0)>60)return null;
  // All nine capacities are observable in the R15 task. No oracle values.
  return [
   'Tanuló által látható feladatadatok (nem beadott megoldás):',
   '3 raktár → 3 bolt; cél: összköltség minimuma. Változók: nemnegatív egészek.',
   `Raktárankénti kínálat: ${vec(task.supply)}.`,
   `Boltonkénti kereslet: ${vec(task.demand)}.`,
   ...task.costs.map((r,i)=>`Egységköltség, ${i+1}. raktár: ${vec(r)}.`),
   ...task.capacities.map((r,i)=>`Útvonalkapacitás, ${i+1}. raktár: ${vec(r)}.`),
   'Döntési változók: 3×3 szállítási mennyiség.'
  ].join('\n');
 }
 if(taskKind==='froccs'){
  if(task.objectiveSense!=='max'||!varNames(task.variableNames,10)||
     !row(task.wine,10,0,1000)||!row(task.soda,10,0,1000)||
     !row(task.prices,10,1,1000000)||
     !safeInt(task.availableWine,0,10000)||!safeInt(task.availableSoda,0,10000))return null;
  return [
   'Tanuló által látható feladatadatok (nem beadott megoldás):',
   'Tíztermékes egészértékű bevételmaximalizálás; változók: nemnegatív egészek.',
   `Bor legfeljebb ${task.availableWine}, szóda legfeljebb ${task.availableSoda} egység.`,
   ...task.variableNames.map((name,i)=>`${name}: bor ${task.wine[i]}, szóda ${task.soda[i]}, bevétel ${task.prices[i]}.`)
  ].join('\n');
 }
 if(task.objectiveSense!=='min'||!varNames(task.variableNames,2)||
    !row(task.knowledge,2,0,10000)||!row(task.prices,2,1,1000000)||
    !safeInt(task.target,0,100000)||!safeInt(task.maxTablets,0,10000))return null;
 return [
  'Tanuló által látható feladatadatok (nem beadott megoldás):',
  'Kéttermékes költségminimalizálás; változók: nemnegatív folytonos mennyiségek.',
  ...task.variableNames.map((name,i)=>`${name}: költség ${task.prices[i]}, tudásegység ${task.knowledge[i]}.`),
  `Legalább ${task.target} tudásegység, összesen legfeljebb ${task.maxTablets} tabletta.`,
  'A második termék mennyisége nem haladhatja meg az első termék mennyiségét.'
 ].join('\n');
}
