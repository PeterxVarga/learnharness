import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {expectedGridNames,readGridAnswer,editGridAnswer,pasteGridAnswer} from './gusek-values-grid-r14z.mjs';
const scalar=Array.from({length:9},(_,k)=>'Raktar'+(Math.floor(k/3)+1)+'_Bolt'+(k%3+1));
const indexed=expectedGridNames('transport',scalar,'indexed');
const seed=names=>JSON.stringify(Object.fromEntries(names.map(n=>[n,0])));
describe('R14Z Practice visible numerical grid over unchanged JSON answer',()=>{
 it('returns exact nine canonical indexed transport keys in row-major order',()=>{
  assert.deepEqual(indexed,['x[1,1]','x[1,2]','x[1,3]','x[2,1]','x[2,2]','x[2,3]','x[3,1]','x[3,2]','x[3,3]']);
 });
 it('supports scalar transportation, ten froccs and two tablet values',()=>{
  assert.deepEqual(expectedGridNames('transport',scalar,'scalar'),scalar);
  assert.equal(expectedGridNames('froccs',Array.from({length:10},(_,i)=>'x'+i),'scalar').length,10);
  assert.deepEqual(expectedGridNames('tablet',['epres','spenotos'],'scalar'),['epres','spenotos']);
 });
 it('does not accept incorrect length, duplicate or unsafe variable names',()=>{
  assert.equal(expectedGridNames('tablet',['epres'],'scalar'),null);
  assert.equal(expectedGridNames('tablet',['x','x'],'scalar'),null);
  assert.equal(expectedGridNames('tablet',['__proto__','y'],'scalar'),null);
  assert.equal(expectedGridNames('froccs',['x','y'],'indexed'),null);
 });
 it('renders all original JSON values without changing order',()=>{
  const x=readGridAnswer(seed(indexed),indexed);
  assert.equal(x.ok,true);assert.equal(x.code,null);
  assert.equal(x.cells.length,9);assert.ok(x.cells.every(c=>c.text==='0'&&c.valid));
 });
 it('updates one cell preserving all other values and exact names',()=>{
  const x=editGridAnswer(seed(indexed),indexed,'x[2,3]','13');
  assert.equal(x.ok,true);
  const o=JSON.parse(x.json);
  assert.equal(o['x[2,3]'],13);assert.equal(o['x[1,1]'],0);
  assert.deepEqual(Object.keys(o),indexed);
 });
 it('can type a negative or fractional candidate without applying score rules',()=>{
  const y=editGridAnswer(seed(['epres','spenotos']),['epres','spenotos'],'epres','-1.25');
  assert.equal(JSON.parse(y.json).epres,-1.25);
 });
 it('retains incomplete numerical input without silently turning it into zero',()=>{
  const x=editGridAnswer(seed(indexed),indexed,'x[1,1]','-');
  assert.equal(JSON.parse(x.json)['x[1,1]'],'-');
  assert.equal(readGridAnswer(x.json,indexed).code,'invalid_numeric_value');
 });
 it('prevents unsafe numeric overflow, NaN and Infinity from becoming valid numeric values',()=>{
  for(const t of ['NaN','Infinity','1e999','1000000001']){
   const x=editGridAnswer(seed(indexed),indexed,'x[1,1]',t);
   assert.equal(x.ok,true);assert.equal(readGridAnswer(x.json,indexed).code,'invalid_numeric_value');
  }
 });
 it('rejects malformed existing JSON without destroying it',()=>{
  const bad='{"x[1,1]":';
  assert.equal(readGridAnswer(bad,indexed).code,'invalid_json');
  assert.equal(editGridAnswer(bad,indexed,'x[1,1]','3').ok,false);
 });
 it('rejects mismatched keys instead of silently dropping unknown values',()=>{
  const x=JSON.stringify({...Object.fromEntries(indexed.map(n=>[n,0])),extra:5});
  assert.equal(readGridAnswer(x,indexed).code,'different_variable_set');
  assert.equal(editGridAnswer(x,indexed,'x[1,1]','3').ok,false);
 });
 it('rejects wrong entry target rather than changing the wrong variable',()=>{
  assert.equal(editGridAnswer(seed(indexed),indexed,'x[4,1]','3').ok,false);
 });
 it('accepts a complete 3x3 clipboard matrix using tabs and lines',()=>{
  const x=pasteGridAnswer(seed(indexed),indexed,'x[1,1]','1\t2\t3\n4\t5\t6\n7\t8\t9');
  assert.equal(x.ok,true);assert.equal(x.imported,9);
  assert.deepEqual(Object.values(JSON.parse(x.json)),[1,2,3,4,5,6,7,8,9]);
 });
 it('rejects clipboard overflow and malicious values',()=>{
  assert.equal(pasteGridAnswer(seed(indexed),indexed,'x[3,3]','2\t3').ok,false);
  assert.equal(pasteGridAnswer(seed(indexed),indexed,'x[1,1]','2\tInfinity').ok,false);
  assert.equal(pasteGridAnswer(seed(indexed),indexed,'x[1,1]','2\ta').ok,false);
 });
 it('preserves an authoritative-looking GLPK answer without granting grade or score',()=>{
  const values=Object.fromEntries(indexed.map((n,i)=>[n,i===0?1:0]));
  const read=readGridAnswer(JSON.stringify(values),indexed);
  assert.equal(read.ok,true);assert.equal('points' in read,false);
  assert.equal('graded' in read,false);
 });
 it('bounds invalid JSON and never runs arbitrary source while parsing',()=>{
  assert.equal(readGridAnswer('{',indexed).ok,false);
  assert.equal(readGridAnswer('x'.repeat(8193),indexed).ok,false);
  const unsafe='{"__proto__":{"polluted":true}}';
  assert.equal(readGridAnswer(unsafe,indexed).ok,false);
  assert.equal({}.polluted,undefined);
 });
});
