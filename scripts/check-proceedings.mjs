// check-proceedings.mjs — 審議構造（proceedings.json）の精度レポート。index.mjs の後に実行する。
//   ・一般質問：目次PDFに載る質問者と、検出した一般質問の一致
//   ・採決：議案（報第＝報告は採決なしなので除く）のうち採決結果が取れた割合
//   ・未分類：議長・会議録情報以外の発言のうち、どの場面にも入らなかった割合
// 使い方: node scripts/check-proceedings.mjs [--verbose]
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { textKey } from "./lib/keys.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../public/data");
const TEXT_DIR = join(__dirname, "../data/text");
const J = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));
const verbose = process.argv.includes("--verbose");

const meetings = J("meetings.json"), gian = J("gian.json"), index = J("index.json"), proc = J("proceedings.json");
const sq = (s) => String(s || "").replace(/[\s　]/g, "").replace(/髙/g, "高").replace(/﨑/g, "崎");

// 目次の「一般質問 N番 姓 名君 …… D－P」から質問者を取る
function tocQuestioners(m) {
  const names = [];
  for (const pdf of m.pdfs) {
    if (!/mokuji|目次/i.test(pdf.url + (pdf.label || ""))) continue;
    const p = join(TEXT_DIR, textKey(m.id, pdf) + ".txt");
    if (!existsSync(p)) continue;
    const t = readFileSync(p, "utf8").replace(/\n/g, "");
    for (const part of t.split("一般質問").slice(1)) {
      const block = part.split(/第[0-9０-９]+号[（(]|１．/)[0], re = /番\s*([^\s…\d０-９]+)\s*([^\s…\d０-９]*?)君/g;
      let x;
      while ((x = re.exec(block))) names.push(sq(x[1] + x[2]));
    }
  }
  return [...new Set(names)];
}

const byPdf = new Map();
for (const e of index) { const k = e.sid.slice(0, e.sid.lastIndexOf("_")); (byPdf.get(k) || byPdf.set(k, []).get(k)).push(e); }

let tIp = 0, tIpOk = 0, tBills = 0, tVoted = 0, tSp = 0, tCovered = 0;
const problems = [];
for (const m of meetings) {
  const segs = (proc[m.id] || { segments: [] }).segments;
  // 一般質問
  const exp = tocQuestioners(m);
  const got = [...new Set(segs.filter((s) => s.kind === "ippan").map((s) => sq(s.member)))];
  const missing = exp.filter((n) => !got.includes(n)), extra = got.filter((n) => !exp.includes(n));
  tIp += exp.length; tIpOk += exp.length - missing.length;
  // 採決
  const agenda = (gian[m.id] || { agenda: [] }).agenda.filter((a) => !/^報第/.test(a.no));
  const unvoted = agenda.filter((a) => !a.result);
  tBills += agenda.length; tVoted += agenda.length - unvoted.length;
  // 未分類
  const ranges = segs.filter((s) => s.from).map((s) => [s.from, s.to]);
  let sp = 0, cov = 0;
  for (const [k, list] of byPdf) {
    if (!k.startsWith(m.id + "_")) continue;
    for (const e of list) {
      if (!e.role || /議長$/.test(e.role)) continue;
      sp++;
      if (ranges.some(([f, t]) => e.sid >= f && e.sid <= t)) cov++;
    }
  }
  tSp += sp; tCovered += cov;
  if (missing.length || extra.length || unvoted.length) problems.push({ m, missing, extra, unvoted, sp, cov });
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "-");
console.log(`一般質問：目次の質問者 ${tIp} 名中 ${tIpOk} 名を検出（${pct(tIpOk, tIp)}）`);
console.log(`採決結果：議案（報第を除く）${tBills} 件中 ${tVoted} 件で取得（${pct(tVoted, tBills)}）`);
console.log(`場面の分類：議長以外の発言 ${tSp} 件中 ${tCovered} 件をいずれかの場面に分類（${pct(tCovered, tSp)}）`);
console.log(`\n要確認の会議：${problems.length} 件`);
for (const p of problems) {
  const parts = [];
  if (p.missing.length) parts.push(`一般質問の未検出 ${p.missing.join("・")}`);
  if (p.extra.length) parts.push(`目次に無い一般質問 ${p.extra.join("・")}`);
  if (p.unvoted.length) parts.push(`採決結果なし ${p.unvoted.length}件` + (verbose ? `（${p.unvoted.map((a) => a.no).join("、")}）` : ""));
  console.log(`- ${p.m.id} ${p.m.name}：${parts.join(" ／ ")}`);
}
