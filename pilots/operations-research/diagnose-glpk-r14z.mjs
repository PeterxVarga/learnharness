#!/usr/bin/env node
/** One small, trusted synthetic scalar native test; no grading or private input.
 * Reads only the explicitly pinned local rootless GLPK image.
 */
import {runNativeGmplAsync} from './glpk-native-async-r14.mjs';
const imageId=process.env.LH_GLPK_IMAGE_ID;
if(!/^sha256:[a-f0-9]{64}$/.test(imageId??'')){
 console.error('BLOCKED_PINNED_LOCAL_IMAGE_REQUIRED');process.exitCode=2;
}else{
 const r=await runNativeGmplAsync({
  imageId,mode:'solve',
  model:'var x >= 0; maximize obj: x; s.t. upper: x <= 3; solve; end;'
 });
 console.log(JSON.stringify({
  schema:'learnharness.r14z.machine-diagnostic.v1',
  status:r.status,code:r.code,statusCode:r.statusCode,
  solverStatus:r.solverStatus,solutionKind:r.solutionKind,
  columnStatus:r.columnStatus,objective:r.objective,
  machineEvidence:r.machineEvidence,
  columnsRecognized:r.columns?.length??0,gradeAuthority:false
 },null,2));
 const success=r.status==='GLPK_COMPLETED'&&r.solverStatus==='OPTIMAL'&&
  r.objective===3&&r.columnStatus==='OPTIMAL_COLUMNS'&&
  r.columns?.find(c=>c.name==='x')?.value===3;
 console.log('R14Z_MACHINE_DIAGNOSTIC='+ (success?'PASS':'BLOCKED'));
 if(!success)process.exitCode=2;
}
