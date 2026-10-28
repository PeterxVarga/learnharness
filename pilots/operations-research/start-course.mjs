#!/usr/bin/env node
/** Explicit activation prompt; prints only, no file/model/network IO. */
import {createCourseStarter} from "../../src/agent/courses/operations-research-hu.ts";
process.stdout.write(createCourseStarter()+"\n");
