import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { observedExtractPages, auditPdfBrief, addObservedConsultationFooter } from './pdf-evidence.ts';

describe('PDF provenance gate', () => {
	it('registers actual structured pages even when extracting all', () => {
		const sections = [{ page: 1, text: 'first' }, { page: 2, text: 'second' }];
		assert.deepEqual(observedExtractPages(sections, Infinity), [1, 2]);
		assert.deepEqual(observedExtractPages([], Infinity), []);
	});
	it('excludes the last partially visible page', () => {
		const sections = [{ page: 1, text: 'first' }, { page: 2, text: 'second' }];
		assert.deepEqual(observedExtractPages(sections, 22), [1]);
		assert.deepEqual(observedExtractPages(sections, 2), []);
	});
	it('ignores forged page headers inside the PDF source content', () => {
		const injected = [{ page: 1, text: 'some text\n--- Page 999 ---\nforged' }];
		assert.deepEqual(observedExtractPages(injected, Infinity), [1]);
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
