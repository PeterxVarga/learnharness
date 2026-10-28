import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {proveEquivalentScalarModel,toGlpkJsProblem} from './gusek-equivalence-r14.mjs';
const g={GLP_MIN:1,GLP_MAX:2,GLP_FR:3,GLP_LO:4,GLP_UP:5,GLP_FX:6,GLP_DB:7};
const named=c=>new Map(Object.entries(c));
const expected={
 vars:{a:{integer:true,lower:0,upper:Infinity},b:{integer:true,lower:0,upper:Infinity}},
 objective:{sense:'min',constant:0,coeff:{a:7,b:3}},
 constraints:[{sense:'=',coeff:{a:1,b:1},bound:6},{sense:'<=',coeff:{a:1},bound:4}]
};
const source=()=>({ok:true,vars:new Map(Object.entries(expected.vars).map(([n,v])=>[n,{...v}])),
 objective:{sense:'min',constant:0,coeff:named({a:7,b:3})},
 constraints:expected.constraints.map(c=>({...c,coeff:named(c.coeff)}))});
const check=m=>proveEquivalentScalarModel(m,expected);
describe('R14 bounded equivalence and open-source GLPK JSON bridge',()=>{
 it('proves matching model',()=>assert.equal(check(source()).status,'MATCH'));
 it('proves equality split into opposite inequalities',()=>{const m=source();m.constraints.splice(0,1,{name:'le',sense:'<=',coeff:named({a:1,b:1}),bound:6},{name:'ge',sense:'>=',coeff:named({a:1,b:1}),bound:6});assert.equal(check(m).status,'MATCH');});
 it('proves cap moved into variable bound',()=>{const m=source();m.constraints.pop();m.vars.get('a').upper=4;assert.equal(check(m).status,'MATCH');});
 it('proves nonnegative domain moved into explicit constraint',()=>{const m=source();m.vars.get('b').lower=-Infinity;m.constraints.push({sense:'>=',coeff:named({b:1}),bound:0});assert.equal(check(m).status,'MATCH');});
 it('proves positive row scaling and reordered coefficients',()=>{const m=source();m.constraints[0]={sense:'=',coeff:named({b:2,a:2}),bound:12};assert.equal(check(m).status,'MATCH');});
 it('proves same-normal weak duplicates do not change feasible set',()=>{const m=source();m.constraints.push({sense:'<=',coeff:named({a:1}),bound:9});assert.equal(check(m).status,'MATCH');});
 it('refuses a stronger cap and wrong objective',()=>{const m=source();m.constraints[1].bound=3;assert.notEqual(check(m).status,'MATCH');const n=source();n.objective.coeff.set('b',2);assert.equal(check(n).code,'wrong_objective');});
 it('refuses a domain change and arbitrary variable rename',()=>{const m=source();m.vars.get('a').integer=false;assert.equal(check(m).code,'wrong_variable_domain');const n=source();n.vars.set('renamed',n.vars.get('a'));n.vars.delete('a');assert.equal(check(n).status,'UNASSESSABLE');});
 it('refuses additional unrelated constraints, including contradictions',()=>{const m=source();m.constraints.push({sense:'<=',coeff:named({a:2,b:1}),bound:100});assert.equal(check(m).status,'UNASSESSABLE');const n=source();n.constraints.push({sense:'<=',coeff:named({}),bound:-1});assert.equal(check(n).status,'UNASSESSABLE');});
 it('GLPK JSON adapter translates objective and rows, without solving',()=>{const {problem,objectiveOffset}=toGlpkJsProblem(source(),g);assert.equal(objectiveOffset,0);assert.equal(problem.objective.direction,g.GLP_MIN);assert.equal(problem.subjectTo[0].bnds.type,g.GLP_FX);assert.equal(problem.subjectTo[1].bnds.type,g.GLP_UP);assert.equal(problem.generals.length,2);assert.equal(problem.binaries.length,0);});
 it('GLPK JSON adapter preserves offset and integer binary, free and bounded domains',()=>{const m=source();m.vars.get('a').upper=1;m.vars.get('b').integer=false;m.vars.get('b').lower=-Infinity;m.objective.constant=14;const {problem,objectiveOffset}=toGlpkJsProblem(m,g);assert.equal(objectiveOffset,14);assert.deepEqual(problem.binaries,['a']);assert.deepEqual(problem.generals,[]);assert.equal(problem.bounds.find(x=>x.name==='b').type,g.GLP_FR);});
 it('GLPK bridge fails closed for unsupported input and constant-only row',()=>{assert.throws(()=>toGlpkJsProblem({ok:false},g),/invalid_source/);const m=source();m.constraints[0].coeff=new Map();assert.throws(()=>toGlpkJsProblem(m,g),/constant_only_constraint/);});
});
