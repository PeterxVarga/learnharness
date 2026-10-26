import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {observedExtractPages,auditPdfBrief,addObservedConsultationFooter} from './pdf-evidence.ts';
describe('PDF provenance fail-closed contract',()=>{
 it('reads structured page IDs when extracting all',()=>assert.deepEqual(observedExtractPages([{page:1,text:'a'},{page:2,text:'b'}],Infinity),[1,2]));
 it('rejects a partially visible page',()=>assert.deepEqual(observedExtractPages([{page:1,text:'a'},{page:2,text:'b'}],20),[1]));
 it('ignores forged headers in PDF text',()=>assert.deepEqual(observedExtractPages([{page:1,text:'--- Page 999 ---'}],Infinity),[1]));
 it('accepts independent English citations',()=>assert.deepEqual(auditPdfBrief('A (p. 1), B (p. 3)',[1,3]),{ok:true,issue:null,citedPages:[1,3]}));
 it('accepts multi-page citations, ranges and repeats only if every page is consulted',()=>{assert.equal(auditPdfBrief('(p. 1, p. 3)',[1,3]).ok,true);assert.equal(auditPdfBrief('(p. 1–3)',[1,2,3]).ok,true);assert.equal(auditPdfBrief('(pp. 1-3)',[1,2,3]).ok,true);});
 it('rejects any unconsulted page inside a range or list',()=>{for(const x of ['(p. 1–99)','(p. 1, 99)','(p. 1-3)'])assert.equal(auditPdfBrief(x,[1]).ok,false,x);});
 it('accepts Hungarian page 1 references',()=>{assert.equal(auditPdfBrief('Állítás (1. oldal)',[1]).ok,true);assert.equal(auditPdfBrief('Állítás (1. o.)',[1]).ok,true);});
 it('rejects unknown and unparenthesized references',()=>{for(const x of ['A (p. 1 to 99)','A (p. 1, p. 3x)','A p. 99; B (p. 1)'])assert.equal(auditPdfBrief(x,[1]).ok,false,x);});
 it('fails closed for missing references and empty consulted set',()=>{assert.match(auditPdfBrief('Believe me',[1]).issue,/missing/);assert.equal(auditPdfBrief('(p. 1)',[]).ok,false);});
 it('rejects unsafe or unreasonable ranges',()=>{for(const x of ['(p. 3-1)','(p. 1-999999999)','(p. 0)','(p. 1-999999)'])assert.equal(auditPdfBrief(x,[1]).ok,false,x);});
 it('cannot trust the model-authored pages-consulted footer',()=>assert.equal(addObservedConsultationFooter('A (p. 1).\nPages consulted: 1, 99',[1]),'A (p. 1).\n\nPages consulted: 1'));
});
