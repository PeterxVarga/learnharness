import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {
 DEFAULT_MODEL,DEFAULT_DATA,MAX_MODEL_BYTES,MAX_DATA_BYTES,
 validateWorkbenchFile,makeWorkspaceDraft,readWorkspaceDraft,
 sameRunInputs,glpkDiagnosticLine,lineOffset
} from '../../src/features/gusek/workspace-files.mjs';

describe('R14 Workbench local-only file, GLPK diagnostic and draft contracts',()=>{
 it('has a standalone educational model, no solution secret',()=>{
  assert.match(DEFAULT_MODEL,/var x >= 0/);
  assert.match(DEFAULT_MODEL,/solve;/);
  assert.equal(DEFAULT_DATA,'');
  assert.doesNotMatch(DEFAULT_MODEL,/LH_GLPK_RUN_TOKEN/);
 });
 it('accepts supported .mod and .dat files within limits',()=>{
  assert.equal(validateWorkbenchFile('model.mod','var x;').ok,true);
  assert.equal(validateWorkbenchFile('data.dat','').ok,true);
  assert.equal(MAX_MODEL_BYTES,65536);
  assert.equal(MAX_DATA_BYTES,65536);
 });
 it('rejects foreign filename or wrong type',()=>{
  for(const value of [null,0,{},['var x']])assert.equal(validateWorkbenchFile('model.mod',value).ok,false);
  assert.equal(validateWorkbenchFile('../../etc/passwd','x').error,'unsupported_file');
 });
 it('rejects embedded NUL and over-large files',()=>{
  assert.equal(validateWorkbenchFile('model.mod','x\0z').ok,false);
  assert.equal(validateWorkbenchFile('data.dat','x'.repeat(65537)).error,'file_too_large');
 });
 it('measures UTF-8 bytes, not JS string units',()=>{
  assert.equal(validateWorkbenchFile('model.mod','ő'.repeat(32769)).error,'file_too_large');
 });
 it('creates bounded schema-identified drafts',()=>{
  const d=makeWorkspaceDraft({model:'var x;',data:'data;'},42);
  assert.deepEqual(d,{schema:'learnharness.gusek-workspace.r14',model:'var x;',data:'data;',modifiedAt:42});
 });
 it('never accepts malformed or untrusted saved drafts',()=>{
  for(const value of [null,{},'x',{schema:'wrong',model:'x',data:''},
   {schema:'learnharness.gusek-workspace.r14',model:'x'.repeat(70000),data:'',modifiedAt:2},
   {schema:'learnharness.gusek-workspace.r14',model:'x',data:'',modifiedAt:'y'}])
   assert.equal(readWorkspaceDraft(value),null);
 });
 it('round-trips valid local draft fields',()=>{
  const d=makeWorkspaceDraft({model:'var a;',data:'data;'},17000);
  assert.deepEqual(readWorkspaceDraft(d),d);
 });
 it('invalid timestamp is rejected',()=>{
  assert.throws(()=>makeWorkspaceDraft({model:'',data:''},-1),/invalid_workspace_time/);
 });
 it('a native run stays current only while both files match',()=>{
  const input={model:'var x;',data:''};
  assert.equal(sameRunInputs(input,'var x;',''),true);
  assert.equal(sameRunInputs(input,'var x; ','') ,false);
  assert.equal(sameRunInputs(input,'var x;','data;'),false);
  assert.equal(sameRunInputs(null,'var x;',''),false);
 });
 it('extracts GLPK model.mod diagnostics without arbitrary path navigation',()=>{
  assert.deepEqual(glpkDiagnosticLine('GLPK:\n/input/model.mod:12: syntax error\n'),{file:'model.mod',line:12});
  assert.deepEqual(glpkDiagnosticLine('data.dat:2: invalid value'),{file:'data.dat',line:2});
 });
 it('ignores foreign files and malformed diagnostic lines',()=>{
  assert.equal(glpkDiagnosticLine('/etc/passwd:1: syntax error'),null);
  assert.equal(glpkDiagnosticLine('other.mod:8: wrong'),null);
  assert.equal(glpkDiagnosticLine('model.mod:0: wrong'),null);
  assert.equal(glpkDiagnosticLine('model.mod:100001: wrong'),null);
 });
 it('maps GLPK line numbers to editor offsets',()=>{
  assert.equal(lineOffset('a\nb\nc',1),0);
  assert.equal(lineOffset('a\nb\nc',2),2);
  assert.equal(lineOffset('a\nb\nc',3),4);
  assert.equal(lineOffset('a\nb\nc',99),5);
 });
 it('treats invalid editor jumps as the first position',()=>{
  assert.equal(lineOffset('abc',0),0);
  assert.equal(lineOffset('abc',NaN),0);
  assert.equal(lineOffset(null,2),0);
 });
});
