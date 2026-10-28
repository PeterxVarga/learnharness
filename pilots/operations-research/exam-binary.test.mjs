import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TRANSPORT_REFERENCE, transportOracle, gradeTransportBinary } from './exam-binary.mjs';
const good = () => ({ model: { ...TRANSPORT_REFERENCE }, allocation: { ac:4, ad:3, bc:2, bd:3 }, reportedObjective:68, hintsUsed:false });
const hasNoPartial = result => { assert.ok(result.points === 0 || result.points === 1); assert.equal('partialCredit' in result, false); return result; };
describe('all-or-nothing transport exam qualification', () => {
 it('one point only for the complete independently correct answer', () => { assert.equal(hasNoPartial(gradeTransportBinary(good())).points,1); });
 it('missing model part receives zero', () => { const x=good(); delete x.model.nonnegative; assert.equal(hasNoPartial(gradeTransportBinary(x)).points,0); });
 it('wrong cost coefficient receives zero, even with correct plan', () => { const x=good(); x.model.costs={...x.model.costs,ac:5}; assert.equal(gradeTransportBinary(x).points,0); });
 it('a feasible but suboptimal solution receives zero', () => { const x=good(); x.allocation={ac:3,ad:4,bc:3,bd:2}; x.reportedObjective=78; assert.deepEqual(gradeTransportBinary(x).errors,['not_proven_optimal']); });
 it('an unbalanced allocation receives zero', () => { const x=good(); x.allocation.bd=4; x.reportedObjective=71; assert.equal(gradeTransportBinary(x).points,0); });
 it('a route capacity violation receives zero', () => { const x=good(); x.allocation={ac:5,ad:2,bc:1,bd:4}; x.reportedObjective=62; assert.ok(gradeTransportBinary(x).errors.includes('route_capacity_violation')); });
 it('wrong objective receives zero even with correct allocation', () => { const x=good(); x.reportedObjective=67; assert.equal(gradeTransportBinary(x).points,0); });
 it('hint-supported solution cannot certify an independent exam attempt', () => { const x=good(); x.hintsUsed=true; assert.equal(gradeTransportBinary(x).points,0); assert.equal(gradeTransportBinary(x,{independent:false}).points,1); });
 it('reorders model coefficient keys without changing meaning', () => { const x=good();x.model.costs={bd:3,bc:8,ad:9,ac:4}; assert.equal(gradeTransportBinary(x).points,1); });
 it('alternative optimum is accepted when the trusted task has ties', () => { const reference={...TRANSPORT_REFERENCE,costs:{ac:4,ad:4,bc:4,bd:4}};const x=good();x.model={...reference};x.reportedObjective=48;assert.equal(transportOracle(reference).optimalAllocations.length>1,true);assert.equal(gradeTransportBinary(x,{reference}).points,1);x.allocation={ac:3,ad:4,bc:3,bd:2};assert.equal(gradeTransportBinary(x,{reference}).points,1); });
 it('fake optimal status does not override the deterministic oracle', () => { const x=good();x.allocation={ac:3,ad:4,bc:3,bd:2};x.reportedObjective=78;x.status='optimal';assert.equal(gradeTransportBinary(x).points,0); });
 it('empty or malformed submissions always receive zero', () => { assert.equal(gradeTransportBinary(null).points,0);const x=good(); x.allocation.ac='4';assert.equal(gradeTransportBinary(x).points,0); });
});
