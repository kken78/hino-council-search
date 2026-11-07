// テキストキャッシュのキー生成（extract.mjs と index.mjs で共有）。
// PDF URL → meetingId_YYYYMMDD ／ 日付無しはファイル名語幹。
// 目次の PDF は、ファイル名に日付が付いていても（例 20260727mokuji.pdf）日付をキーにしない。
// 同じ日の本文の PDF とキーが重なり、本文が索引に入らなくなるため（2026-11-07、令和8年7月臨時会議）。
export const isTocPdf = (pdf) => /mokuji|目次/i.test(pdf.url + " " + (pdf.label || ""));

export function textKey(meetingId, pdf) {
  if (pdf.date && !isTocPdf(pdf)) return `${meetingId}_${pdf.date.replace(/-/g, "")}`;
  const stem = pdf.url.split("/").pop().replace(/\.pdf$/i, "").replace(/[^\w.-]/g, "_");
  return `${meetingId}_${stem}`;
}
