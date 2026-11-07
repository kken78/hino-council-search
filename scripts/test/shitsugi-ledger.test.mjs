// 質疑の台帳（scripts/lib/ledger.mjs の質疑の部分）・検査（check-ledger.mjs）・下書き（ledger-draft.mjs）・見出し（labels.mjs）のテスト。
// 実行: npm test（node --test）。小さな台帳と区切りを作って確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseShitsugiLedger, applyShitsugiLedger, parseTriples, ledgerBills, SHITSUGI_COLUMNS } from "../lib/ledger.mjs";
import { checkShitsugiLedger } from "../check-ledger.mjs";
import { draftShitsugiRows, draftShitsugiTsv, DRAFT_NOTE } from "../ledger-draft.mjs";
import { shitsugiTurnLabels, shitsugiPartLabel, chairLabels } from "../lib/labels.mjs";

const D = "0000000001_20260101_";
const sid = (i) => D + String(i).padStart(4, "0");
const tsv = (rows) => [SHITSUGI_COLUMNS.join("\t"), ...rows.map((r) => SHITSUGI_COLUMNS.map((c) => r[c] ?? "").join("\t"))].join("\n") + "\n";
const row = (o) => ({ from: sid(10), member: "杉浦和人", date: "2026-01-01", conf: "高", note: "", ...o });

// 0010 は p1 で議第83号、p3 で議第88号を聞く（1つの sid が2つの行に出る）。0014 は議第83号の再質疑、0018 は意見・要望（段落は空）
const ROWS = [
  row({ bill: "議第83号", start: sid(10) + ":1", turns: `${sid(10)}:1:q;${sid(14)}:1:rq;${sid(18)}::req`, answers: `${sid(12)};${sid(16)}` }),
  row({ bill: "議第88号", start: sid(10) + ":3", turns: `${sid(10)}:3:q`, answers: sid(12), conf: "中" }),
  row({ bill: "議題外", start: sid(14) + ":2", turns: `${sid(14)}:2:x`, answers: "" }),
];
const CHAIR = "sid\tkind\tabout\ttext\n" + `${sid(15)}\tnotice\t${sid(10)}\t議案の範囲で質疑を。\n`;

test("parseTriples：sid・段落・種類に分ける。段落が空なら null", () => {
  assert.deepEqual(parseTriples(`${sid(10)}:1:q;${sid(18)}::req`), [[sid(10), 1, "q"], [sid(18), null, "req"]]);
  assert.deepEqual(parseTriples(""), []);
});

test("parseShitsugiLedger：from ごとにまとめ、台帳の行の順を保つ", () => {
  const L = parseShitsugiLedger(tsv(ROWS), CHAIR);
  assert.equal(L.rows.length, 3);
  const rows = L.byFrom.get(sid(10));
  assert.deepEqual(rows.map((r) => r.bill), ["議第83号", "議第88号", "議題外"]);
  assert.deepEqual(rows[0].start, [sid(10), 1]);
  assert.deepEqual(rows[0].answers, [sid(12), sid(16)]);
  assert.deepEqual(rows[2].answers, []);
  assert.equal(L.chairByFrom.get(sid(10))[0].kind, "notice");
  assert.throws(() => parseShitsugiLedger("from\tmember\n"), /見出し/);
  assert.deepEqual(ledgerBills(rows), ["議第83号", "議第88号"]);
});

test("applyShitsugiLedger：parts は from からの相対位置。1つの sid が2つの行に出る。bills は台帳にそろえる", () => {
  const L = parseShitsugiLedger(tsv(ROWS), CHAIR);
  const seg = { kind: "shitsugi", from: sid(10), to: sid(18), member: "杉浦和人", turns: [[0, "q", 1], [2, "a", 1], [4, "rq", 1], [6, "a", 1], [8, "rq", 1]], bills: ["議第99号"] };
  assert.equal(applyShitsugiLedger(seg, L), true);
  assert.equal(seg.ledger, true);
  assert.deepEqual(seg.bills, ["議第83号", "議第88号"]); // 機械の値は使わない。議題外は入れない
  assert.deepEqual(seg.turns, [[0, "q", 1], [2, "a", 1], [4, "rq", 1], [6, "a", 1], [8, "rq", 1]]); // 機械の turns は残す
  assert.deepEqual(seg.chair, [[5, "notice"]]);
  assert.deepEqual(seg.parts[0], { bill: "議第83号", start: [0, 1], turns: [[0, 1, "q"], [4, 1, "rq"], [8, "", "req"]], answers: [2, 6], conf: "高" });
  assert.deepEqual(seg.parts[1], { bill: "議第88号", start: [0, 3], turns: [[0, 3, "q"]], answers: [2], conf: "中" });
  assert.deepEqual(seg.parts[2].turns, [[4, 2, "x"]]);
  const other = { kind: "shitsugi", from: sid(40), bills: ["議第1号"] };
  assert.equal(applyShitsugiLedger(other, L), false);
  assert.deepEqual(other.bills, ["議第1号"]);
});

test("shitsugiTurnLabels：議案と種類の見出し、複数の議案にまたがる発言、答弁の議案、議長の注意", () => {
  const L = parseShitsugiLedger(tsv(ROWS), CHAIR);
  const seg = { kind: "shitsugi", from: sid(10), to: sid(18), member: "杉浦和人", turns: [[0, "q", 1], [2, "a", 1], [4, "rq", 1], [6, "a", 1], [7, "a", 1], [8, "rq", 1]] };
  applyShitsugiLedger(seg, L);
  const m = shitsugiTurnLabels(seg);
  assert.equal(m.get(0).label, "質疑（議第83号 p1／議第88号 p3）");
  assert.deepEqual(m.get(0).bills, ["議第83号", "議第88号"]);
  assert.equal(m.get(2).label, "答弁（議第83号・議第88号）");
  assert.equal(m.get(4).label, "再質疑（議第83号 p1）／回に数えない発言（議題外 p2）");
  assert.equal(m.get(6).label, "答弁（議第83号）");
  assert.equal(m.get(7).label, "答弁"); // 台帳の answers に無い機械の答弁
  assert.equal(m.get(8).label, "意見・要望");
  assert.equal(chairLabels(seg).get(5), "議長：範囲の注意");
  assert.equal(shitsugiPartLabel([{ bill: "議第85号", p: 1, kind: "rq" }]), "再質疑（議第85号）");
  assert.equal(shitsugiPartLabel([{ bill: "不明", p: null, kind: "q" }]), "質疑（議案不明）");
  assert.equal(shitsugiPartLabel([{ bill: "議第85号", p: 1, kind: "x" }]), "（回に数えない発言）");
});

// 検査用の発言索引：0010〜0018 を 議員・議長・当局・議長 の順に並べる
const INDEX = [];
for (let i = 10; i <= 18; i++) {
  const k = (i - 10) % 4;
  INDEX.push({ sid: sid(i), role: k === 0 ? "3番" : k === 2 ? "町長" : "議長", name: k === 0 ? "杉浦和人" : "x", text: "…" });
}
const PROC = { "0000000001": { segments: [
  { kind: "shitsugi", from: sid(10), to: sid(18), member: "杉浦和人", date: "2026-01-01" },
  { kind: "shitsugi", from: sid(30), to: sid(30), member: "別の議員", date: "2026-01-01" },
] } };
const GIAN = { "0000000001": { agenda: [{ no: "議第83号" }] } };

test("checkShitsugiLedger：決まりどおりの台帳は問題なし。gian.json に無い議案は一覧にするがエラーにしない", () => {
  const { errors, waiting, notInGian, stats } = checkShitsugiLedger(PROC, INDEX, parseShitsugiLedger(tsv(ROWS), CHAIR), GIAN);
  assert.deepEqual(errors, []);
  assert.deepEqual(waiting.map((s) => s.from), [sid(30)]);
  assert.deepEqual(notInGian.map((x) => x.bill), ["議第88号"]);
  assert.equal(stats.rows, 3);
});

test("checkShitsugiLedger：委員長・提出者（answerer）の発言は turns に無くてよく、turns にあれば問題にする", () => {
  const idx = INDEX.map((e) => (e.sid === sid(12) ? { ...e, role: "5番", name: "委員長の議員" } : e));
  const proc = { "0000000001": { segments: [{ ...PROC["0000000001"].segments[0], answerer: "委員長の議員" }] } };
  assert.deepEqual(checkShitsugiLedger(proc, idx, parseShitsugiLedger(tsv(ROWS), CHAIR)).errors, []);
  const bad = [row({ bill: "議第83号", start: sid(10) + ":1", turns: `${sid(10)}:1:q;${sid(12)}:1:q;${sid(14)}:1:rq;${sid(18)}::req`, answers: "" })];
  const kinds = new Set(checkShitsugiLedger(proc, idx, parseShitsugiLedger(tsv(bad))).errors.map((e) => e.kind));
  assert.ok(kinds.has("答弁の発言"));
});

test("checkShitsugiLedger：発言の漏れ・区切りの外・種類・確信・start・議長の注意・区切りが無い を問題にする", () => {
  const bad = [
    row({ bill: "議第83号", start: sid(14) + ":1", turns: `${sid(10)}:1:zz;${sid(22)}:1:rq`, answers: sid(12), conf: "下書き" }),
    row({ from: sid(50), bill: "議第1号", start: sid(50) + ":1", turns: `${sid(50)}:1:q` }),
  ];
  const chair = "sid\tkind\tabout\ttext\n" + `${sid(14)}\tzz\t${sid(99)}\t…\n`;
  const { errors } = checkShitsugiLedger(PROC, INDEX, parseShitsugiLedger(tsv(bad), chair), GIAN);
  const kinds = new Set(errors.map((e) => e.kind));
  for (const k of ["発言の漏れ", "区切りの外", "種類", "確信", "start", "議長の注意", "区切りが無い"]) assert.ok(kinds.has(k), k);
});

test("ledger-draft（質疑）：機械の bills と turns から議案ごとの行を作る。bills が無ければ不明", () => {
  const seg = { kind: "shitsugi", from: sid(10), to: sid(18), member: "杉浦和人", date: "2026-01-01", bills: ["議第83号", "議第88号"], turns: [[0, "q", 1], [2, "a", 1], [4, "rq", 1], [6, "a", 1], [8, "rq", 1]] };
  const rows = draftShitsugiRows(seg);
  assert.deepEqual(rows.map((r) => r.bill), ["議第83号", "議第88号"]);
  assert.equal(rows[0].turns, `${sid(10)}::q;${sid(14)}::rq;${sid(18)}::req`); // 最後の答弁の無い発言は意見・要望
  assert.equal(rows[0].start, sid(10) + ":1");
  assert.equal(rows[0].answers, `${sid(12)};${sid(16)}`);
  assert.equal(rows[0].conf, "下書き");
  assert.ok(rows[0].note.startsWith(DRAFT_NOTE));
  assert.deepEqual(draftShitsugiRows({ ...seg, bills: [] }).map((r) => r.bill), ["不明"]);
  // 台帳にある区切りは下書きを作らない。TSV は見出し行つきで、読み戻せる
  const proc = { "0000000001": { segments: [seg, { ...seg, from: sid(40), bills: [] }] } };
  const { rows: all, text } = draftShitsugiTsv(proc, parseShitsugiLedger(tsv(ROWS)));
  assert.deepEqual([...new Set(all.map((r) => r.from))], [sid(40)]);
  assert.equal(parseShitsugiLedger(text).rows.length, 1);
});
