import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {makeGusekProject,readGusekProject,projectStoreKey,summarizeProjects} from '../../src/features/gusek/project-contract-r14z.mjs';
const ID='01234567-89ab-4def-8012-3456789abcde';
const base={id:ID,name:'Szállítási gyakorlat',model:'var x;',data:'data; end;',createdAt:10};
describe('R14Z private named GUSEK projects',()=>{
 it('creates bounded model/data-only project snapshots',()=>{
  const project=makeGusekProject(base);
  assert.equal(project.name,base.name);
  assert.equal(project.schema,'learnharness.gusek-project.r14z');
  assert.deepEqual(Object.keys(project).sort(),['createdAt','data','id','model','name','schema'].sort());
 });
 it('roundtrips valid local snapshots',()=>{
  const original=makeGusekProject(base);
  assert.deepEqual(readGusekProject(original),original);
 });
 it('projects are keyed by strictly validated UUID not filesystem path',()=>{
  assert.equal(projectStoreKey(ID),'project-r14z:'+ID);
  for(const bad of ['../../etc/passwd','',null,'abcdef','admin'])assert.equal(projectStoreKey(bad),null);
 });
 it('rejects empty, control-character and overly long names',()=>{
  for(const name of ['', ' ','bad\nname','x'.repeat(81)])
   assert.throws(()=>makeGusekProject({...base,name}),/invalid_local_project/);
 });
 it('rejects oversized or nul-containing model/data',()=>{
  for(const payload of [
   {...base,model:'é'.repeat(32769)},{...base,data:'x'.repeat(65537)},
   {...base,model:'bad\0source'}
  ])assert.throws(()=>makeGusekProject(payload));
 });
 it('rejects forged or schema-free stored records',()=>{
  assert.equal(readGusekProject({...base,schema:'other'}),null);
  assert.equal(readGusekProject({...base,schema:'learnharness.gusek-project.r14z',createdAt:'abc'}),null);
  assert.equal(readGusekProject(null),null);
 });
 it('lists valid projects by date with duplicate-ID protection',()=>{
  const first=makeGusekProject(base);
  const other=makeGusekProject({...base,id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',name:'Korlát',createdAt:100});
  assert.deepEqual(summarizeProjects([first,other,first,null]).map(x=>x.name),['Korlát','Szállítási gyakorlat']);
 });
 it('does not include project data or MathProg source in a summary',()=>{
  const [item]=summarizeProjects([makeGusekProject(base)]);
  assert.deepEqual(Object.keys(item).sort(),['createdAt','id','name']);
  assert.equal('model' in item,false);
 });
});
