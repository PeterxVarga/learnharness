import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {LANGUAGE_TERMS,tokenizeGmplLine,lineNumberAt,nextSearchMatch,
 makeGmplEdit,indentGmplSelection,commentGmplSelection,completionForGmpl
} from '../../src/features/gusek/gmpl-editor-core.mjs';
describe('R14 reusable GMPL text-editor transformations, never a grader',()=>{
 it('recognizes GNU MathProg keywords without execution',()=>{
  assert.ok(LANGUAGE_TERMS.includes('minimize'));assert.ok(LANGUAGE_TERMS.includes('sum'));
  assert.ok(LANGUAGE_TERMS.includes('s.t.'));
 });
 it('lexes a MathProg objective into tokens that round-trip exactly',()=>{
  const src='minimize cost: sum{i in I} price[i] * x[i]; # objective';
  const tokens=tokenizeGmplLine(src);
  assert.equal(tokens.map(x=>x.text).join(''),src);
  assert.equal(tokens[0].kind,'keyword');
  assert.equal(tokens.at(-1).kind,'comment');
 });
 it('keeps MathProg quoted data strings intact',()=>{
  const src='printf "cost: %g", x;';const t=tokenizeGmplLine(src);
  assert.ok(t.some(x=>x.kind==='string'&&x.text==='"cost: %g"'));
  assert.equal(t.map(x=>x.text).join(''),src);
 });
 it('does not tokenize an excessively long line',()=>assert.deepEqual(tokenizeGmplLine('x'.repeat(4097)),[]));
 it('maps caret offsets to source line numbers',()=>{
  assert.equal(lineNumberAt('a\nb\nc',0),1);
  assert.equal(lineNumberAt('a\nb\nc',2),2);
  assert.equal(lineNumberAt('a\nb\nc',4),3);
 });
 it('finds case-insensitive literal strings with wraparound',()=>{
  assert.deepEqual(nextSearchMatch('Cost and cost','COST',5),{from:9,to:13,line:1});
  assert.deepEqual(nextSearchMatch('Cost and cost','COST',13),{from:0,to:4,line:1});
 });
 it('returns null for empty queries and missing matches',()=>{
  assert.equal(nextSearchMatch('data','',0),null);
  assert.equal(nextSearchMatch('data','ZZ',0),null);
 });
 it('bounded edits insert and replace without changing external state',()=>{
  assert.deepEqual(makeGmplEdit('var x;',4,5,'y'),{value:'var y;',cursor:5});
 });
 it('refuses out-of-range or excessive edits',()=>{
  assert.equal(makeGmplEdit('abc',3,2,'x'),null);
  assert.equal(makeGmplEdit('abc',0,0,'x'.repeat(70000)),null);
 });
 it('indents the line containing the caret',()=>{
  const e=indentGmplSelection('minimize x;',3,3);
  assert.equal(e.value,'  minimize x;');
 });
 it('indents a selected range of whole lines',()=>{
  const e=indentGmplSelection('a\nb\nc',0,3);
  assert.equal(e.value,'  a\n  b\nc');
 });
 it('outdents without destroying existing non-indent characters',()=>{
  const e=indentGmplSelection('  a\n  b',0,6,{outdent:true});
  assert.equal(e.value,'a\nb');
 });
 it('comments selected MathProg lines',()=>{
  assert.equal(commentGmplSelection('set I;\nvar x;',0,9).value,'# set I;\n# var x;');
 });
 it('uncomments a fully commented selection',()=>{
  assert.equal(commentGmplSelection('# set I;\n# var x;',0,16).value,'set I;\nvar x;');
 });
 it('does not remove an arbitrary inline comment when toggling',()=>{
  assert.equal(commentGmplSelection('x # inline;',0,2).value,'# x # inline;');
 });
 it('provides bounded keyword completion, not fabricated model answers',()=>{
  assert.ok(completionForGmpl('mini').includes('minimize'));
  assert.equal(completionForGmpl('i').length,0);
  assert.ok(completionForGmpl('sum').every(t=>t!=='sum'));
 });
});
