import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { observedExtractPages, auditPdfBrief, addObservedConsultationFooter } from './pdf-evidence.ts';

describe('PDF provenance gate', () => {
	it('registers only actual extracted pages, including pages=all', () => {
		assert.deepEqual(observedExtractPages('--- Page 1 ---\nfirst\n--- Page 2 ---\nsecond'), [1, 2]);
		assert.deepEqual(observedExtractPages('No pages selected — page spec matched nothing.'), []);
	});
	it('does not grant citation authority to truncated final page', () => {
		const output = '--- Page 1 ---\none\n--- Page 2 ---\npartial\n[Output truncated at 24000 chars — narrow the page spec and extract in smaller batches.]';
		assert.deepEqual(observedExtractPages(output), [1]);
		assert.deepEqual(observedExtractPages('--- Page 1 ---\npartial\n[Output truncated at 24000 chars — narrow the page spec and extract in smaller batches.]'), []);
	});
	it('accepts truly consulted citations, including multiple citations', () => {
		assert.deepEqual(auditPdfBrief('A (p. 1), B (p. 3).', [1, 3, 5]), { ok: true, issue: null, citedPages: [1, 3] });
		assert.equal(auditPdfBrief('A (p. 1, p. 3)', [1, 3]).ok, true);
	});
	it('rejects missing citations, invented pages and empty provenance', () => {
		assert.match(auditPdfBrief('Trust me.', [1]).issue ?? '', /missing/);
		assert.match(auditPdfBrief('Claim (p. 9).', [1, 2]).issue ?? '', /page 9/);
		assert.equal(auditPdfBrief('Claim (p. 1)', []).ok, false);
	});
	it('replaces a fabricated Pages consulted footer with observed pages', () => {
		assert.equal(addObservedConsultationFooter('Correct (p. 1).\nPages consulted: 1, 999', [1]), 'Correct (p. 1).\n\nPages consulted: 1');
	});
});
