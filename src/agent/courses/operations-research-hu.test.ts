import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {COURSE_ACTIVATION,COURSE_UNITS,validateCourseUnits,isCourseActivated,courseContextForMessages,renderCourseContext,createCourseStarter} from "./operations-research-hu.ts";
const user = (content:unknown)=>({role:"user",content});
describe("HU course explicit opt-in and prerequisite graph",()=>{
 it("validates eight synthetic units",()=>{ assert.doesNotThrow(()=>validateCourseUnits(COURSE_UNITS));assert.equal(COURSE_UNITS.length,8); });
 it("rejects duplicate ids",()=>assert.throws(()=>validateCourseUnits([COURSE_UNITS[0]!,COURSE_UNITS[0]!]),/Duplicate course/));
 it("rejects missing prerequisite",()=>assert.throws(()=>validateCourseUnits([{...COURSE_UNITS[0]!,prerequisites:["ghost"]}]),/Missing prerequisite/));
 it("rejects self-cycle",()=>assert.throws(()=>validateCourseUnits([{...COURSE_UNITS[0]!,prerequisites:["or-foundations"]}]),/Cyclic/));
 it("rejects two-node cycle",()=>assert.throws(()=>validateCourseUnits([{...COURSE_UNITS[0]!,prerequisites:["or-translation"]},COURSE_UNITS[1]!]),/Cyclic/));
 it("rejects duplicate prerequisite edges",()=>assert.throws(()=>validateCourseUnits([COURSE_UNITS[0]!,{...COURSE_UNITS[1]!,prerequisites:["or-foundations","or-foundations"]}]),/Duplicate prerequisite/));
 it("activates only from exact first user message",()=>assert.equal(isCourseActivated([user(COURSE_ACTIVATION+"\nKezdjük"),{role:"assistant",content:"hi"},user("Folytasd")]),true));
 it("recognizes structured user text",()=>assert.equal(isCourseActivated([user([{type:"text",text:COURSE_ACTIVATION},{type:"text",text:"Start"}])]),true));
 it("does not contaminate other sessions",()=>{assert.equal(courseContextForMessages([user("Teach biology")]),null);assert.equal(isCourseActivated([user("Teach biology"),user(COURSE_ACTIVATION)]),false);});
 it("rejects quoted or partial marker",()=>{assert.equal(isCourseActivated([user("> "+COURSE_ACTIVATION)]),false);assert.equal(isCourseActivated([user(COURSE_ACTIVATION+"-extra")]),false);});
 it("starter contains explicit marker and consent boundary",()=>{const s=createCourseStarter();assert.equal(s.split("\n")[0],COURSE_ACTIVATION);assert.match(s,/engedélyeztem/);});
 it("context forbids fabricated evidence and solver execution",()=>{const s=renderCourseContext();assert.match(s,/NOT as agent instructions/);assert.match(s,/No real GLPK execution/);assert.match(s,/page citation/i);});
});
