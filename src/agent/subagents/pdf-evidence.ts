/**
 * Evidence boundary for the PDF-reader. Pure, deterministic and dependency-free.
 * It validates page-level *provenance*, not the truth of a mathematical claim.
 */

export interface PdfBriefAudit {
	ok: boolean;
	issue: string | null;
	citedPages: number[];
}

/**
 * Use the PDF parser's structured page numbers, not headings read from the
 * (untrusted) PDF text. The last partially-visible page is NOT authority.
 * A forged "--- Page N ---" line in a PDF cannot produce a new page id.
 */
export function observedExtractPages(
	sections: readonly { page: number; text: string }[],
	visibleChars: number,
): number[] {
	if (!Number.isFinite(visibleChars) && visibleChars !== Infinity) return [];
	if (visibleChars < 0) return [];
	const pages: number[] = [];
	let offset = 0;
	for (const section of sections) {
		if (!Number.isSafeInteger(section.page) || section.page < 1) return [];
		const chunk = `--- Page ${section.page} ---\n${section.text}`;
		const next = offset + (pages.length ? 1 : 0) + chunk.length;
		if (next > visibleChars) break;
		pages.push(section.page);
		offset = next;
	}
	return [...new Set(pages)].sort((a, b) => a - b);
}

/** Fail closed if an LLM brief cites any unconsulted page or cites no page. */
export function auditPdfBrief(brief: string, pagesConsulted: readonly number[]): PdfBriefAudit {
	const consulted = new Set(pagesConsulted);
	const pageMatches = [...brief.matchAll(/\bp\.\s*([1-9]\d*)\b/gi)];
	const citedPages = [...new Set(pageMatches.map((m) => Number(m[1])))].sort((a, b) => a - b);
	if (citedPages.length === 0) return { ok: false, issue: 'missing page citation (p. N)', citedPages };
	for (const page of citedPages) {
		if (!Number.isSafeInteger(page) || !consulted.has(page)) {
			return { ok: false, issue: `page ${page} was not consulted`, citedPages };
		}
	}
	return { ok: true, issue: null, citedPages };
}

/** Replaces the model's self-reported consultation list with the observed set. */
export function addObservedConsultationFooter(brief: string, pagesConsulted: readonly number[]): string {
	const withoutClaim = brief.replace(/^\s*Pages consulted:[^\n]*$/gim, '').trim();
	return `${withoutClaim}\n\nPages consulted: ${[...new Set(pagesConsulted)].sort((a, b) => a - b).join(', ')}`;
}
