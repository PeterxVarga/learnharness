/** Safe learner-visible GNU MathProg starts for each exam type.
 * Not a completed model and not a hidden answer key: never render the
 * oracle's coefficients, constraint RHS or optimum into the editor.
 * Students must author objectives and constraints themselves.
 */
const VAR=/^[A-Za-z_][A-Za-z_0-9]{0,63}$/;
const kinds=new Set(['transport','froccs','tablet']);
const generic='solve;\nend;';
export function makeGusekScalarStarter(task){
 if(!task||!kinds.has(task.kind)||!Array.isArray(task.variableNames)||
    task.variableNames.length<1||task.variableNames.length>30||
    new Set(task.variableNames).size!==task.variableNames.length||
    !task.variableNames.every(s=>typeof s==='string'&&VAR.test(s)))
  throw new Error('invalid_trusted_task_starter');
 if(task.kind==='transport'&&task.variableNames.length!==9||
    task.kind==='froccs'&&task.variableNames.length!==10||
    task.kind==='tablet'&&task.variableNames.length!==2)
  throw new Error('invalid_trusted_task_starter');
 const integer=task.kind!=='tablet';
 const declarations=task.variableNames.map(n=>'var '+n+' >= 0'+(integer?', integer':'')+';');
 const hints=task.kind==='transport'?[
  '# TODO: minimize szallitas: a kilenc utvonal koltsegeinek osszege;',
  '# TODO: s.t. supply_1/2/3: raktarankenti kinalati egyenletek;',
  '# TODO: s.t. demand_1/2/3: boltonkenti keresleti egyenletek;',
  '# TODO: s.t. route_cap: az elso raktar harmadik utvonalanak korlatja;'
 ]:task.kind==='froccs'?[
  '# TODO: maximize TotalIncome: a termekek arabol szamolt teljes bevetel;',
  '# TODO: s.t. wine: a felhasznalt bor maximuma;',
  '# TODO: s.t. soda: a felhasznalt szoda maximuma;'
 ]:[
  '# TODO: minimize koltseg: a tablettak osszkoltsege;',
  '# TODO: s.t. siker: az elvart tudasminimum;',
  '# TODO: s.t. osszetetel: legalabb annyi epres, mint spenotos;',
  '# TODO: s.t. adag: a teljes tablettaszam korlatja;'
 ];
 return [
  '# LearnHarness / GUSEK - '+task.kind+' gyakorlo modell',
  '# A feladat adatai a bal oldali panelen vannak. A # sorok nem kodok.',
  '# Csak a valtozodeklaraciok vannak kitoltve; a TODO sorokat irjad at.',
  ...declarations,'',...hints,'',generic,''
 ].join('\n');
}
