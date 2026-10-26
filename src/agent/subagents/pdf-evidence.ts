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
 * The PDF tool emits explicit headings for pages that actually reached the
 * agent's text context. A request spec can include nonexistent pages or 'all',
 * so never infer observed pages from the requested spec.
 *
 * On a truncated extraction, the final page may be only partially visible:
 * exclude it from citation authority. The agent can re-extract that page.
 */
export function observedExtractPages(output: string): number[] {
	const matches = [...output.matchAll(/^--- Page ([1-9]\d*) ---[ \t]*$/gm)];
	const pages = matches.map((m) => Number(m[1])).filter(Number.isSafeInteger);
	if (/\[Output truncated at \d+ chars\s*[—-]/.test(output)) pages.pop();
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
