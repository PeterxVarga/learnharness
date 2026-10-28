#!/usr/bin/env node
/** Explicit CLI only; NOT exposed through the Next server or score ledger. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runNativeGmpl} from './glpk-native-sandbox-r14.mjs';
const args=process.argv.slice(2);
if(!['--model'].includes(args[0])||args.length<2||args.length>5){
  process.stderr.write('Usage: LH_GLPK_IMAGE_ID=sha256:... node run-glpk-r14.mjs --model /path/a.mod [--data /path/a.dat] [--check]\\n');
  process.exitCode=2;
}else{
  let data='',mode='solve';
  try{
    const p=args[1],rest=args.slice(2);
    if(rest.length&&rest[0]==='--data'){if(rest.length<2)throw Error('invalid_arguments');data=readFileSync(resolve(rest[1]),'utf8');rest.splice(0,2);}
    if(rest.length&&rest[0]==='--check'){mode='check';rest.shift();}
    if(rest.length)throw Error('invalid_arguments');
    const model=readFileSync(resolve(p),'utf8');
    const result=runNativeGmpl({model,data,mode,imageId:process.env.LH_GLPK_IMAGE_ID});
    process.stdout.write(JSON.stringify(result,null,2)+'\\n');
    if(result.status!=='GLPK_COMPLETED')process.exitCode=2;
  }catch(e){
    process.stderr.write('BLOCKED: invalid input paths or arguments\\n');
    process.exitCode=2;
  }
}
