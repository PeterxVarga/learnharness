#!/usr/bin/env node
/** Offline 3×3 Hungarian exam practice: emit a task or grade a specific response file.
 * Does not contact AI providers, GitHub, remote desktop or execute .mod files.
 */
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeTransportTask, gradeTransportExam, publicTransportTask, practicePromptHu } from './transport-exam-r3.mjs';

export function parseArgs(args) {
  const [command,...rest] = args;
  if (!['new','grade'].includes(command)) throw new Error('Usage: new|grade --seed UINT32 [--answer answer.json] [--json]');
  const options = { command, json: false, seed: null, answer: null };
  for (let i=0;i<rest.length;i++) {
    const arg=rest[i];
    if (arg==='--json') { if (options.json) throw new Error('Duplicate --json'); options.json=true; continue; }
    if (arg==='--seed') {
      if (options.seed!==null || !/^(0|[1-9]\d*)$/.test(rest[i+1]??'')) throw new Error('Invalid --seed');
      options.seed=Number(rest[++i]);continue;
    }
    if (arg==='--answer') {
      if (options.answer || !rest[i+1] || rest[i+1].startsWith('--')) throw new Error('Invalid --answer');
      options.answer=rest[++i];continue;
    }
    throw new Error('Unexpected argument: '+arg);
  }
  if (options.seed===null) throw new Error('--seed required');
  makeTransportTask(options.seed); // validates range before any IO
  if (command==='new' && options.answer) throw new Error('new does not use answer file');
  if (command==='grade' && !options.answer) throw new Error('grade requires --answer');
  return options;
}
export function runCli(args) {
  const opts=parseArgs(args);
  const task=makeTransportTask(opts.seed);
  if (opts.command==='new') return opts.json ? JSON.stringify(publicTransportTask(opts.seed),null,2) : practicePromptHu(task);
  const inputPath=resolve(opts.answer);
  const stats=lstatSync(inputPath);
  if (!stats.isFile() || stats.size>64*1024 || stats.size===0) throw new Error('Answer must be a regular file, 1..65536 bytes');
  // Data-only JSON. No evaluation, shell, arbitrary MathProg, or external file read.
  const answer=JSON.parse(readFileSync(inputPath,'utf8'));
  const grade=gradeTransportExam(task,answer);
  return opts.json ? JSON.stringify({taskId:task.id,...grade},null,2)
    : `Vizsgaeredmény: ${grade.points}/${grade.maxPoints} – ${grade.correct?'TELJESEN HELYES':'NEM TELJESEN HELYES'}\n${grade.errors.length ? 'Tanulási visszajelzés (nem részpont): '+grade.errors.join(', '): 'A modell és a megoldás teljesen helyes.'}`;
}
if (process.argv[1] && import.meta.url===new URL('file://'+resolve(process.argv[1])).href) {
  try { console.log(runCli(process.argv.slice(2))); }
  catch (error) { console.error('BLOCKED:',error instanceof Error?error.message:String(error)); process.exitCode=2; }
}
