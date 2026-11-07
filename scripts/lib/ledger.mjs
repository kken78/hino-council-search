// ledger.mjs — 一般質問の台帳（data/ippan.tsv・data/ippan-chair.tsv）と質疑の台帳（data/shitsugi.tsv・data/shitsugi-chair.tsv）を読み、区切り（from）ごとにまとめる。
//   台帳は人が確認したもので、一般質問の問いの境目・回・方式・題の正とする（README「一般質問の構造の決まり」）。
//   readLedger() は2つの TSV を読み、{ rows, chair, byFrom, chairByFrom } を返す。
//   applyLedger() は proceedings.json の一般質問の区切りに questions・chair・ledger を足す（index.mjs が使う）。
//   質疑の台帳は readShitsugiLedger()・applyShitsugiLedger()（ファイルの後半。README「質疑の構造の決まり」）。
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const LEDGER_DIR = join(__dirname, "../../data");
export const LEDGER_FILE = "ippan.tsv";
export const CHAIR_FILE = "ippan-chair.tsv";

// 列（この順で書く）
export const COLUMNS = ["from", "member", "date", "n", "title", "title_src", "start", "style", "style_src", "turns", "items", "conf", "note"];
export const CHAIR_COLUMNS = ["sid", "kind", "about", "text"];
// 発言の種類：質問・再質問・再々質問・4回目の質問（答弁あり）・要望・回に数えない発言
export const KINDS = ["q", "rq", "rrq", "q4", "req", "x"];
// 回を付ける種類（一問一答では使わない）
export const ROUND_KINDS = ["rq", "rrq", "q4"];
export const STYLES = ["一問一答", "分割", "一括", "不明"];
export const STYLE_SRC = ["declared", "inferred"];
export const TITLE_SRC = ["bulletin", "notice", "minutes"];
export const CONF = ["高", "中", "低"];
export const DRAFT_CONF = "下書き";
export const CHAIR_KINDS = ["rounds", "notice"];

// 見出し行つき TSV を読む。列の数が見出しと違う行はエラー（行番号つき）
export function parseTsv(text, columns, name = "TSV") {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l !== "");
  if (!lines.length) return [];
  const head = lines[0].split("\t");
  if (columns && head.join("\t") !== columns.join("\t")) throw new Error(`${name}：見出しが決まりと違います（${head.join(",")}）`);
  return lines.slice(1).map((l, k) => {
    const cells = l.split("\t");
    if (cells.length !== head.length) throw new Error(`${name} ${k + 2}行目：列の数が ${cells.length}（見出しは ${head.length}）`);
    const o = Object.fromEntries(head.map((h, i) => [h, cells[i]]));
    o._line = k + 2;
    return o;
  });
}

// 「sid:値;sid:値」→ [[sid, 値], …]
export function parsePairs(s) {
  if (!s) return [];
  return s.split(";").filter(Boolean).map((x) => { const i = x.lastIndexOf(":"); return [x.slice(0, i), x.slice(i + 1)]; });
}
// 「sid:段落」→ [sid, 段落の番号]（空なら null）
export function parseRef(s) {
  if (!s) return null;
  const i = s.lastIndexOf(":");
  return [s.slice(0, i), Number(s.slice(i + 1))];
}

// 行を読みやすい形にする（turns・items・start を分け、n を数にする）
function shapeRow(r) {
  return { ...r, n: Number(r.n), turns: parsePairs(r.turns), items: parsePairs(r.items).map(([sid, p]) => [sid, Number(p)]), start: parseRef(r.start) };
}

export function parseLedger(ippanText, chairText = "") {
  const rows = parseTsv(ippanText, COLUMNS, LEDGER_FILE).map(shapeRow);
  const chair = chairText ? parseTsv(chairText, CHAIR_COLUMNS, CHAIR_FILE) : [];
  const byFrom = new Map(), chairByFrom = new Map();
  for (const r of rows) (byFrom.get(r.from) || byFrom.set(r.from, []).get(r.from)).push(r);
  for (const list of byFrom.values()) list.sort((a, b) => a.n - b.n);
  for (const c of chair) (chairByFrom.get(c.about) || chairByFrom.set(c.about, []).get(c.about)).push(c);
  return { rows, chair, byFrom, chairByFrom };
}

// 台帳が無ければ空の台帳を返す（フォーク先など）
export function readLedger(dir = LEDGER_DIR) {
  const p = join(dir, LEDGER_FILE), c = join(dir, CHAIR_FILE);
  return parseLedger(existsSync(p) ? readFileSync(p, "utf8") : COLUMNS.join("\t") + "\n", existsSync(c) ? readFileSync(c, "utf8") : "");
}

// sid の、区切りの最初の発言（from）からの相対位置。日（sid の連番の前の部分）が違えばエラー
export function offsetOf(from, sid) {
  const pre = from.slice(0, -4);
  if (sid.slice(0, -4) !== pre) throw new Error(`${sid} は区切り ${from} と別の日の発言です`);
  return parseInt(sid.slice(-4), 10) - parseInt(from.slice(-4), 10);
}

// 区切りの方式：台帳の行の方式が1種類ならその値、2種類以上なら「問いごと」
export function segmentStyle(rows) {
  const s = [...new Set(rows.map((r) => r.style))];
  return s.length === 1 ? s[0] : "問いごと";
}

// 台帳の行（1つの区切りの分）→ proceedings.json の questions
export function toQuestions(from, rows) {
  return rows.map((r) => ({
    n: r.n,
    title: r.title,
    title_src: r.title_src,
    start: r.start ? [offsetOf(from, r.start[0]), r.start[1]] : null,
    style: r.style,
    style_src: r.style_src,
    turns: r.turns.map(([sid, k]) => [offsetOf(from, sid), k]),
    items: r.items.map(([sid, p]) => [offsetOf(from, sid), p]),
    conf: r.conf,
  }));
}

// 一般質問の区切りに台帳を通す。台帳の行が無ければ何もしない（false を返す）
//   questions・chair・ledger を足し、style と topics を台帳から作る。機械の turns はそのまま残す。
export function applyLedger(seg, ledger) {
  const rows = ledger.byFrom.get(seg.from);
  if (!rows || !rows.length) return false;
  seg.questions = toQuestions(seg.from, rows);
  const ch = (ledger.chairByFrom.get(seg.from) || []).map((c) => [offsetOf(seg.from, c.sid), c.kind]).sort((a, b) => a[0] - b[0]);
  if (ch.length) seg.chair = ch;
  seg.ledger = true;
  seg.style = segmentStyle(rows);
  seg.topics = rows.filter((r) => r.title).map((r) => ({ n: r.n, title: r.title, src: r.title_src }));
  return true;
}

// ---- 質疑の台帳（data/shitsugi.tsv・data/shitsugi-chair.tsv）----
//   人が確認したもので、質疑の議案ごとの発言・回・答弁の正とする（README「質疑の構造の決まり」）。
//   1行＝1人の議員の1つの議案への質疑。1つの発言が複数の議案にまたがるときは、その sid が複数の行の turns に出る。
//   readShitsugiLedger() は2つの TSV を読み、{ rows, chair, byFrom, chairByFrom } を返す。
//   applyShitsugiLedger() は proceedings.json の質疑の区切りに parts・chair・ledger を足し、bills を台帳にそろえる（index.mjs が使う）。
export const SHITSUGI_FILE = "shitsugi.tsv";
export const SHITSUGI_CHAIR_FILE = "shitsugi-chair.tsv";
// 列（この順で書く）
export const SHITSUGI_COLUMNS = ["from", "member", "date", "bill", "start", "turns", "answers", "conf", "note"];
// 発言の種類：質疑・再質疑・再々質疑・4回目・意見・要望（回に数えない）・回に数えない発言（確認・答弁漏れの指摘・言い直し）
export const SHITSUGI_KINDS = ["q", "rq", "rrq", "q4", "req", "x"];
// bill の特別な値：議題の議案に無いことを聞いた／1つの議案に決められない
export const BILL_OUTSIDE = "議題外";
export const BILL_UNKNOWN = "不明";
export const SPECIAL_BILLS = [BILL_OUTSIDE, BILL_UNKNOWN];
// 議長の注意の種類：回数の注意・範囲の注意
export const SHITSUGI_CHAIR_KINDS = ["rounds", "notice"];

// 「sid:段落:種類;…」→ [[sid, 段落の番号（空なら null）, 種類], …]
export function parseTriples(s) {
  if (!s) return [];
  return s.split(";").filter(Boolean).map((x) => {
    const k = x.lastIndexOf(":"), j = x.lastIndexOf(":", k - 1);
    const p = x.slice(j + 1, k);
    return [x.slice(0, j), p === "" ? null : Number(p), x.slice(k + 1)];
  });
}

function shapeShitsugiRow(r) {
  return { ...r, start: parseRef(r.start), turns: parseTriples(r.turns), answers: r.answers ? r.answers.split(";").filter(Boolean) : [] };
}

export function parseShitsugiLedger(text, chairText = "") {
  const rows = parseTsv(text, SHITSUGI_COLUMNS, SHITSUGI_FILE).map(shapeShitsugiRow);
  const chair = chairText ? parseTsv(chairText, CHAIR_COLUMNS, SHITSUGI_CHAIR_FILE) : [];
  const byFrom = new Map(), chairByFrom = new Map();
  // 区切りの中の行は台帳の順（人が並べた順）のまま
  for (const r of rows) (byFrom.get(r.from) || byFrom.set(r.from, []).get(r.from)).push(r);
  for (const c of chair) (chairByFrom.get(c.about) || chairByFrom.set(c.about, []).get(c.about)).push(c);
  return { rows, chair, byFrom, chairByFrom };
}

// 台帳が無ければ空の台帳を返す（フォーク先など）
export function readShitsugiLedger(dir = LEDGER_DIR) {
  const p = join(dir, SHITSUGI_FILE), c = join(dir, SHITSUGI_CHAIR_FILE);
  return parseShitsugiLedger(existsSync(p) ? readFileSync(p, "utf8") : SHITSUGI_COLUMNS.join("\t") + "\n", existsSync(c) ? readFileSync(c, "utf8") : "");
}

// 区切りの bills：台帳の bill のうち 議題外・不明 を除いたもの（台帳の順。重複は1つ）
export function ledgerBills(rows) {
  return [...new Set(rows.map((r) => r.bill).filter((b) => !SPECIAL_BILLS.includes(b)))];
}

// 台帳の行（1つの区切りの分）→ proceedings.json の parts
//   段落の番号が空のときは ""（台帳の書き方に合わせる）
export function toParts(from, rows) {
  return rows.map((r) => ({
    bill: r.bill,
    start: r.start ? [offsetOf(from, r.start[0]), r.start[1]] : null,
    turns: r.turns.map(([sid, p, k]) => [offsetOf(from, sid), p == null ? "" : p, k]),
    answers: r.answers.map((sid) => offsetOf(from, sid)),
    conf: r.conf,
  }));
}

// 質疑の区切りに台帳を通す。台帳の行が無ければ何もしない（false を返す）
//   parts・chair・ledger を足し、bills を台帳にそろえる。機械の turns はそのまま残す。
export function applyShitsugiLedger(seg, ledger) {
  const rows = ledger.byFrom.get(seg.from);
  if (!rows || !rows.length) return false;
  seg.parts = toParts(seg.from, rows);
  const ch = (ledger.chairByFrom.get(seg.from) || []).map((c) => [offsetOf(seg.from, c.sid), c.kind]).sort((a, b) => a[0] - b[0]);
  if (ch.length) seg.chair = ch;
  seg.ledger = true;
  seg.bills = ledgerBills(rows);
  return true;
}
