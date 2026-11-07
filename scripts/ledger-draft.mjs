// ledger-draft.mjs — 台帳（data/ippan.tsv）に無い一般質問の区切りについて、台帳と同じ列の下書きを書く。
//   index.mjs・link-bulletin.mjs の後に実行する（npm run ledger:draft）。
//   中身は機械の推定：問いは機械の問番号、回は問いごとの議員の発言を順に q→rq→rrq→q4、
//   区切りの最後の答弁の無い発言は req、方式は議員の宣言から、題は議会だよりがあればそれ、無ければ答弁冒頭の推定。
//   conf は「下書き」。人が確かめて conf を 高／中／低 に直してから data/ippan.tsv に足す（README「一般質問の構造の決まり」）。
// 質疑（--kind shitsugi）は、台帳（data/shitsugi.tsv）に無い質疑の区切りについて、機械の bills と turns から下書きを書く。
//   議案ごとに1行（bills が空なら bill は「不明」の1行）。どの行にも区切りの議員の発言を全部入れる（議案の境目の段落は空）。
//   回は議員の発言を順に q→rq→rrq→q4、区切りの最後の答弁の無い発言は req。答弁は機械の答弁（a）の全部。conf は「下書き」。
//   人が確かめて、議案ごとに発言と段落を分け、conf を 高／中／低 に直してから data/shitsugi.tsv に足す（README「質疑の構造の決まり」）。
// 使い方: node scripts/ledger-draft.mjs [--kind ippan|shitsugi] [--out <ファイル>]（--kind の既定は ippan。--out が無ければ標準出力）
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readLedger, readShitsugiLedger, COLUMNS, SHITSUGI_COLUMNS, DRAFT_CONF, BILL_UNKNOWN } from "./lib/ledger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../public/data");
export const DRAFT_NOTE = "機械の下書き。人が確認して conf を付ける";
const ROUNDS = ["q", "rq", "rrq", "q4"];

// 区切り1つ → 台帳の行（オブジェクト）の配列
export function draftRows(seg) {
  const pre = seg.from.slice(0, -4), f0 = parseInt(seg.from.slice(-4), 10);
  const sidOf = (off) => pre + String(f0 + off).padStart(4, "0");
  const turns = seg.turns || [];
  const own = turns.filter(([, t]) => t === "q" || t === "rq");
  if (!own.length) return [];
  // 区切りの最後の議員の発言のあとに答弁が無ければ要望
  const lastOwn = own[own.length - 1][0];
  const reqOff = turns.some(([off, t]) => t === "a" && off > lastOwn) ? null : lastOwn;
  const style = seg.style && seg.style !== "問いごと" ? seg.style : null;
  const groups = new Map();
  for (const [off, , n] of own) (groups.get(n || 1) || groups.set(n || 1, []).get(n || 1)).push(off);
  const topics = seg.topics || [];
  const titleOf = (n) => topics.find((t) => t.n === n && t.src === "bulletin") || topics.find((t) => t.n === n);
  return [...groups].sort((a, b) => a[0] - b[0]).map(([, offs], k) => {
    const n = k + 1;
    const tp = titleOf(n);
    const kinds = offs.map((off, i) => (off === reqOff && i > 0 ? "req" : style === "一問一答" ? "q" : ROUNDS[Math.min(i, 3)]));
    return {
      from: seg.from, member: seg.member, date: seg.date || "", n: String(n),
      title: tp ? tp.title : "", title_src: tp ? (tp.src === "bulletin" ? "bulletin" : "minutes") : "",
      start: sidOf(offs[0]) + ":1",
      style: style || "不明", style_src: style ? "declared" : "",
      turns: offs.map((off, i) => sidOf(off) + ":" + kinds[i]).join(";"),
      items: "", conf: DRAFT_CONF, note: DRAFT_NOTE,
    };
  });
}

// proceedings.json → 台帳に無い区切りの下書き（TSV の文字列。見出し行つき）
export function draftTsv(proc, ledger) {
  const rows = [];
  for (const p of Object.values(proc)) for (const s of p.segments) if (s.kind === "ippan" && !ledger.byFrom.has(s.from)) rows.push(...draftRows(s));
  const clean = (v) => String(v ?? "").replace(/[\t\r\n]/g, " ");
  return { rows, text: [COLUMNS.join("\t"), ...rows.map((r) => COLUMNS.map((c) => clean(r[c])).join("\t"))].join("\n") + "\n" };
}

// 質疑の区切り1つ → 台帳の行（オブジェクト）の配列
export function draftShitsugiRows(seg) {
  const pre = seg.from.slice(0, -4), f0 = parseInt(seg.from.slice(-4), 10);
  const sidOf = (off) => pre + String(f0 + off).padStart(4, "0");
  const turns = [...(seg.turns || [])].sort((a, b) => a[0] - b[0]);
  const own = turns.filter(([, t]) => t === "q" || t === "rq").map(([off]) => off);
  if (!own.length) return [];
  const answers = turns.filter(([, t]) => t === "a").map(([off]) => off);
  const lastOwn = own[own.length - 1];
  const reqOff = answers.some((off) => off > lastOwn) ? null : lastOwn;
  const kinds = own.map((off, i) => (off === reqOff && i > 0 ? "req" : ROUNDS[Math.min(i, 3)]));
  const bills = seg.bills && seg.bills.length ? seg.bills : [BILL_UNKNOWN];
  return bills.map((bill) => ({
    from: seg.from, member: seg.member, date: seg.date || "", bill,
    start: sidOf(own[0]) + ":1",
    turns: own.map((off, i) => sidOf(off) + "::" + kinds[i]).join(";"),
    answers: answers.map(sidOf).join(";"),
    conf: DRAFT_CONF, note: DRAFT_NOTE + (seg.bills && seg.bills.length ? "（議案は機械の bills。議案ごとの発言と段落は未確認）" : "（機械の bills が空）"),
  }));
}

// proceedings.json → 台帳に無い質疑の区切りの下書き（TSV の文字列。見出し行つき）
export function draftShitsugiTsv(proc, ledger) {
  const rows = [];
  for (const p of Object.values(proc)) for (const s of p.segments) if (s.kind === "shitsugi" && !ledger.byFrom.has(s.from)) rows.push(...draftShitsugiRows(s));
  const clean = (v) => String(v ?? "").replace(/[\t\r\n]/g, " ");
  return { rows, text: [SHITSUGI_COLUMNS.join("\t"), ...rows.map((r) => SHITSUGI_COLUMNS.map((c) => clean(r[c])).join("\t"))].join("\n") + "\n" };
}

function run() {
  const i = process.argv.indexOf("--out");
  const out = i > 0 ? process.argv[i + 1] : null;
  const k = process.argv.indexOf("--kind");
  const kind = k > 0 ? process.argv[k + 1] : "ippan";
  if (!["ippan", "shitsugi"].includes(kind)) { console.error(`--kind は ippan か shitsugi（${kind}）`); process.exitCode = 2; return; }
  const proc = JSON.parse(readFileSync(join(DATA, "proceedings.json"), "utf8"));
  const { rows, text } = kind === "shitsugi" ? draftShitsugiTsv(proc, readShitsugiLedger()) : draftTsv(proc, readLedger());
  const segs = new Set(rows.map((r) => r.from)).size;
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
  console.error(`下書き（${kind === "shitsugi" ? "質疑" : "一般質問"}）：${segs} 区切り・${rows.length} 行${out ? `（${out}）` : ""}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run();
