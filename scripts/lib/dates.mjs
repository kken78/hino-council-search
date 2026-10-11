// 会議の日付（crawl.mjs と index.mjs で共有）。
// 日付の無い本文PDF（臨時会の「本文.pdf」）は会議名の「（1月23日）」と年から日付を補う
export function dateFromName(m) {
  const x = (m.name || "").match(/[（(]\s*([0-9０-９]{1,2})月([0-9０-９]{1,2})日\s*[）)]/);
  if (!x || !m.year) return null;
  const h = (s) => s.replace(/[０-９]/g, (d) => "０１２３４５６７８９".indexOf(d));
  return `${m.year}-${h(x[1]).padStart(2, "0")}-${h(x[2]).padStart(2, "0")}`;
}

// meetings.json の date／dateFrom。日付のあるPDFのうち最も早い日（"pdf"）、無ければ会議名から（"name"）。
// pdfs[].date は変えない（sid の真ん中に使われるため）。
export function meetingDate(m) {
  const d = (m.pdfs || []).map((p) => p.date).filter(Boolean).sort()[0];
  if (d) return { date: d, dateFrom: "pdf" };
  const n = dateFromName(m);
  return n ? { date: n, dateFrom: "name" } : { date: null, dateFrom: null };
}
