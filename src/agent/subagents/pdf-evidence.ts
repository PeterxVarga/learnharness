/** Page-level provenance is NOT semantic verification of PDF claims. */
export interface PdfBriefAudit { ok:boolean; issue:string|null; citedPages:number[] }
export function observedExtractPages(sections: readonly {page:number;text:string}[], visibleChars:number): number[] {
  if ((!Number.isFinite(visibleChars) && visibleChars !== Infinity) || visibleChars < 0) return [];
  const pages:number[]=[];
  let offset=0;
  for (const section of sections) {
    if (!Number.isSafeInteger(section.page) || section.page < 1) return [];
    const chunk=`--- Page ${section.page} ---\n${section.text}`;
    const next=offset+(pages.length?1:0)+chunk.length;
    if (next>visibleChars) break;
    pages.push(section.page);
    offset=next;
  }
  return [...new Set(pages)].sort((a,b)=>a-b);
}

/** Conservative page reference parser. Unknown reference syntax fails closed. */
export function auditPdfBrief(brief: string, pagesConsulted: readonly number[]): PdfBriefAudit {
  const consulted = new Set(pagesConsulted);
  const cited = new Set<number>();
  const reject = (issue:string):PdfBriefAudit=>({ok:false,issue,citedPages:[...cited].sort((a,b)=>a-b)});
  if (typeof brief !== 'string' || brief.length>200_000) return reject('invalid PDF brief');
  const groups=[...brief.matchAll(/\(([^()\r\n]{1,240})\)/g)];
  for (const m of groups) {
    const inner=(m[1] ?? '').trim();
    const eng=/^pp?\.\s*(.*)$/i.exec(inner);
    const hu=/^([1-9]\d*)\.\s*(?:oldal|o\.)$/i.exec(inner);
    if (hu) { cited.add(Number(hu[1])); continue; }
    if (eng) {
      const parts=(eng[1] ?? '').split(/\s*[,;]\s*/);
      if (!parts.length) return reject('invalid page reference');
      for (const part of parts) {
        const token=part.trim().replace(/^pp?\.\s*/i,'');
        const range=/^([1-9]\d*)(?:\s*[-–—]\s*([1-9]\d*))?$/.exec(token);
        if (!range) return reject('invalid page reference: '+inner);
        const first=Number(range[1]), last=range[2] ? Number(range[2]) : first;
        if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last<first || last-first>2000) return reject('invalid page range');
        for(let n=first;n<=last;n++) cited.add(n);
      }
      continue;
    }
    if (/\bpp?\.\s*\d|\b\d+\.\s*(?:oldal|o\.)/i.test(inner)) return reject('unrecognized page reference: '+inner);
  }
  // A bare, unparenthesized page reference may otherwise bypass validation.
  const outside=brief.replace(/\([^()\r\n]{1,240}\)/g,'');
  if (/\bpp?\.\s*\d|\b\d+\.\s*(?:oldal|o\.)/i.test(outside)) return reject('unparenthesized page reference');
  if(cited.size===0) return reject('missing page citation (p. N)');
  const citedPages=[...cited].sort((a,b)=>a-b);
  for(const page of citedPages) {
    if(!Number.isSafeInteger(page) || !consulted.has(page)) return {ok:false,issue:`page ${page} was not consulted`,citedPages};
  }
  return {ok:true,issue:null,citedPages};
}
export function addObservedConsultationFooter(brief:string,pagesConsulted: readonly number[]):string {
  const withoutClaim=brief.replace(/^\s*Pages consulted:[^\n]*$/gim,'').trim();
  return `${withoutClaim}\n\nPages consulted: ${[...new Set(pagesConsulted)].sort((a,b)=>a-b).join(', ')}`;
}
