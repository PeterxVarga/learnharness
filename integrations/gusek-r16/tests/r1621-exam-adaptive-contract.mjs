import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import ts from 'typescript';
const root=resolve('integrations/gusek-r16');
const ui='overlay-workbench/components/tredven-or-domain.tsx';
const doc='docs/R16.21-EXAM-ADAPTIVE-STUDY.md';
const me='tests/r1621-exam-adaptive-contract.mjs';
const source=readFileSync(resolve(root,ui),'utf8');
const t=ts.transpileModule(source,{fileName:ui,reportDiagnostics:true,
 compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
assert.equal((t.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,
 (t.diagnostics??[]).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('; '));
for(const fragment of ['transport:{','indexed:{','simplex:{','graphical:{',
 'data-testid="or-exam-study"','data-testid="or-exam-transfer"',
 'data-testid="or-exam-feedback"','data-testid="or-exam-adaptive-next"',
 "type ExamOutcome='retry'|'supported_transfer'|'independent_transfer'",
 "results[k]==='retry'","method:'POST'",'Elmélet újratanulása a szerveres hibajelzés után'])
 assert.ok(source.includes(fragment),'Missing study contract: '+fragment);
assert.ok(!source.includes('localStorage')&&!source.includes('sessionStorage'));
const manifest=new Map(readFileSync(resolve(root,'SHA256SUMS'),'utf8').trimEnd().split('\n').map(line=>{
 const i=line.indexOf('  ');assert.ok(i>0);return [line.slice(i+2),line.slice(0,i)];
}));
for(const path of [ui,doc,me]){
 const expected=manifest.get(path);assert.ok(expected,'Manifest missing '+path);
 assert.equal(createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex'),expected);
}
console.log('R16.21_EXAM_STAGED_SOURCE_CHECK=PASS');
