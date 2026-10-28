// Ensure the pure PDF provenance suite also runs in upstream `npm test`.
// The dependency-free offline verifier executes the same suite separately.
import "../src/agent/subagents/pdf-evidence.test.ts";
