import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import ts from 'typescript';
const root=resolve('integrations/gusek-r16');
const ui='overlay-workbench/components/tredven-or-domain.tsx';
const doc='docs/R16.21-EXAM-ADAPTIVE-STUDY.md';
const me='tests/r1621-exam-adaptive-contract.mjs';
const localLauncher='run-study-local.sh';
const launcher=readFileSync(resolve(root,localLauncher),'utf8');
for(const token of ['LH_OWNER_APPROVED_LOCAL_PILOT','BLOCKED_OWNER_PILOT_APPROVAL',
 'BLOCKED_STUDY_SOURCE_MANIFEST_MISSING','BLOCKED_STUDY_SOURCE_MISMATCH',
 'BLOCKED_STUDY_R1622_MISSING','R1622_STUDY_SOURCE_PIN=PASS',
 '127.0.0.1','LH_GLPK_ENABLE_LOCAL=0']){
 assert.ok(launcher.includes(token),'Launcher safety boundary missing: '+token);
}
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
for(const fragment of [
 'const restartAttempt=(answer:number|null)=>{',
 'delete next[topic];return next;',
 'onChange={()=>restartAttempt(i)}',
 'onClick={()=>restartAttempt(null)}',
 "const allFormativeChecksPassed=examOrder.every(k=>results[k]==='independent_transfer')",
 'data-testid="or-exam-formative-complete"',
 'data-testid="or-exam-source-guide"',
 'data-testid="or-transport-task"',
 "type Kind='assignment'|'production'|'transport'",
 'Kötelező szállítási gyakorló megnyitása',
 'setKind(\'transport\')',

 'const examReadingRoute={',
 'Mogya_MINTA_VIZSGA.pdf',
 'LPfeladatok.pdf',
 'Komaromi_Eva_Linearis_programozas.pdf',
 'Ferenczi_Zoltan_Operaciokutatas.pdf',
 'A források a saját Fedora gépen',

])assert.ok(source.includes(fragment),'Attempt invalidation regression: '+fragment);
assert.ok(!source.includes('localStorage')&&!source.includes('sessionStorage'));
const manifest=new Map(readFileSync(resolve(root,'SHA256SUMS'),'utf8').trimEnd().split('\n').map(line=>{
 const i=line.indexOf('  ');assert.ok(i>0);return [line.slice(i+2),line.slice(0,i)];
}));
for(const path of [ui,doc,me,localLauncher]){
 const expected=manifest.get(path);assert.ok(expected,'Manifest missing '+path);
 assert.equal(createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex'),expected);
}
console.log('R16.21_EXAM_STAGED_SOURCE_CHECK=PASS');
