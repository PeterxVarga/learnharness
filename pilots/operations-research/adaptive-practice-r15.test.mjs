import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {r15SessionOutcome,r15HistoryOutcome,r15RepairAdvice,r15RecommendPractice} from './adaptive-practice-r15.mjs';

const good=(kind='transport',seed=42)=>({taskId:'gusek-'+kind+'-'+seed,points:1,correct:true,maxPoints:1,errors:[]});
const wrong=(kind='transport',seed=42,error='objective_mismatch')=>({taskId:'gusek-'+kind+'-'+seed,points:0,correct:false,maxPoints:1,errors:[error]});
const unsupported=(kind='transport',seed=42)=>({taskId:'gusek-'+kind+'-'+seed,points:null,correct:null,maxPoints:1,errors:['source_unsupported_expression']});
const at=(g,seed=42,hintsUsed=false,time=1000,kind='transport')=>r15SessionOutcome(g,{kind,seed,hintsUsed,at:time});
const recommend=(session=[],kind='transport',seed=42,history=[])=>r15RecommendPractice({session,currentKind:kind,currentSeed:seed,history});
const receipt=(g,kind='transport',seed=42,id='123e4567-e89b-42d3-a456-426614174000')=>
 ({...g,id,seed,status:g.points===1?'FULL_CREDIT':g.points===0?'ZERO_CREDIT':'UNASSESSABLE',
  submittedAt:'2026-10-30T09:00:00.000Z',taskId:'gusek-'+kind+'-'+seed});
describe('R15 pure practice recommendation without grading authority',()=>{
 it('new learner receives a distinct seed',()=>{const p=recommend();assert.equal(p.mode,'start');assert.equal(p.kind,'transport');assert.equal(p.seed,43);});
 it('wrong answer recommends the same domain',()=>{const p=recommend([at(wrong())]);assert.equal(p.kind,'transport');assert.equal(p.mode,'repair');assert.equal(p.seed,43);});
 it('specific error yields bounded Hungarian repair',()=>assert.equal(r15RepairAdvice(at(wrong())).topic,'Célfüggvény számítása'));
 it('no raw source, optimum or grades in the recommendation',()=>{const p=recommend([at(wrong())]);assert.equal(p.scoreAuthority,false);assert.equal(p.autoStart,false);assert.equal('points' in p,false);assert.doesNotMatch(JSON.stringify(p),/var x|model\.mod|EXAMPLE_INDEXED_MODEL/);});
 it('unassessable does not mean incorrect',()=>{const p=recommend([at(unsupported())]);assert.equal(p.mode,'unsupported');assert.match(p.reason,/nem hibás/);});
 it('unsupported repair never guesses a correct answer',()=>assert.doesNotMatch(JSON.stringify(r15RepairAdvice(at(unsupported()))),/x\[1,1\]|1400/));
 it('assisted success requires further independent practice',()=>{const p=recommend([at(good(),42,true)]);assert.equal(p.kind,'transport');assert.equal(p.mode,'repeat_independently');});
 it('independent self-reported success rotates to another domain',()=>{const p=recommend([at(good())]);assert.equal(p.kind,'froccs');assert.equal(p.mode,'interleave');});
 it('new seed for next domain avoids recent same-kind variants',()=>{const h=at(good('froccs',43),43,false,500,'froccs');const last=at(good(),42,false,600);const p=recommend([h,last]);assert.equal(p.kind,'tablet');assert.equal(p.seed,43);});
 it('weak topic is not skipped after failure',()=>{const p=recommend([at(good(),42,false,100),at(wrong('tablet',43),43,false,200,'tablet')],'tablet',43);assert.equal(p.kind,'tablet');assert.equal(p.seed,44);});
 it('seed wraps on uint32',()=>assert.equal(recommend([], 'tablet',4294967295).seed,0));
 it('stale duplicate seed is skipped',()=>{const xs=[at(wrong('transport',43),43,false,100),at(wrong('transport',44),44,false,200)];assert.equal(recommend(xs,'transport',42).seed,45);});
 it('bad current seed is rejected',()=>assert.equal(r15RecommendPractice({currentSeed:-1}),null));
 it('bad current kind is rejected',()=>assert.equal(r15RecommendPractice({currentKind:'__proto__'}),null));
 it('forged 5 points is not accepted as an outcome',()=>assert.equal(at({...good(),points:5,correct:true}),null));
 it('mismatched task id is not accepted',()=>assert.equal(at(good('froccs')),null));
 it('correct grade carrying errors is invalid',()=>assert.equal(at({...good(),errors:['not_optimal']}),null));
 it('wrong contradictory correct flag is rejected',()=>assert.equal(at({...wrong(),correct:true}),null));
 it('unknown status is not invented for history',()=>assert.equal(r15HistoryOutcome({...receipt(good()),status:'MAYBE'}),null));
 it('history never assumes that hints were not used',()=>assert.equal(r15HistoryOutcome(receipt(good())).assistance,'unknown'));
 it('historical full credit prompts independent repeat',()=>{const p=recommend([], 'transport',42,[receipt(good())]);assert.equal(p.mode,'repeat_independently');});
 it('historical records with bad seed are rejected',()=>assert.equal(r15HistoryOutcome({...receipt(good()),seed:43}),null));
 it('non-GUSEK receipt is ignored',()=>assert.equal(r15HistoryOutcome({...receipt(good()),taskId:'synthetic-transport-r3-42'}),null));
 it('garbled timestamps are ignored',()=>assert.equal(r15HistoryOutcome({...receipt(good()),submittedAt:'tomorrow'}),null));
 it('duplicate chat and session attempt is counted once',()=>{
  const id='123e4567-e89b-42d3-a456-426614174000';
  const r=receipt(good(), 'transport',42,id);
  const s={...at(good(),42,false,Date.parse(r.submittedAt)),id};
  assert.equal(recommend([s],'transport',42,[r]).observed,1);
 });
 it('chat history does not override known immediate assistance',()=>{
  const r=receipt(good());
  const s={...at(good(),42,true,Date.parse(r.submittedAt)),id:r.id};
  assert.equal(recommend([s],'transport',42,[r]).mode,'repeat_independently');
 });
 it('unknown errors cannot inject into advice',()=>{const p=recommend([at(wrong('transport',42,'unknown_safe_error'))]);assert.doesNotMatch(JSON.stringify(p),/unknown_safe_error/);});
 it('error strings with markup are rejected',()=>assert.equal(at(wrong('transport',42,'<script>')),null));
 it('attempt history is bounded to 48 records',()=>{
  const many=Array.from({length:80},(_,i)=>at(wrong('tablet',i),i,false,i*100,'tablet'));
  assert.equal(recommend(many,'tablet',80).observed,48);
 });
 it('history with no items never signals mastery',()=>assert.equal(recommend().evidence.transport.selfReportedUnassistedFull,0));
 it('null outcomes do not affect recommendations',()=>assert.equal(recommend([null,undefined]).observed,0));
});
