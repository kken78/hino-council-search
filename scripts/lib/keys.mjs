// テキストキャッシュのキー生成（extract.mjs と index.mjs で共有）。
// PDF URL → meetingId_YYYYMMDD ／ 日付無しはファイル名語幹。
export function textKey(meetingId, pdf) {
  if (pdf.date) return `${meetingId}_${pdf.date.replace(/-/g, "")}`;
  const stem = pdf.url.split("/").pop().replace(/\.pdf$/i, "").replace(/[^\w.-]/g, "_");
  return `${meetingId}_${stem}`;
}
