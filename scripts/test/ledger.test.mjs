// 一般質問の台帳（scripts/lib/ledger.mjs）・検査（check-ledger.mjs）・下書き（ledger-draft.mjs）のテスト。
// 実行: npm test（node --test）。小さな台帳と区切りを作って確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLedger, applyLedger, segmentStyle, offsetOf, COLUMNS } from "../lib/ledger.mjs";
import { checkLedger } from "../check-ledger.mjs";
import { draftRows, draftTsv, DRAFT_NOTE } from "../ledger-draft.mjs";

const D = "0000000001_20260101_";
const sid = (i) => D + String(i).padStart(4, "0");
const tsv = (rows) => [COLUMNS.join("\t"), ...rows.map((r) => COLUMNS.map((c) => r[c] ?? "").join("\t"))].join("\n") + "\n";
const row = (o) => ({ from: sid(10), member: "杉浦和人", date: "2026-01-01", title_src: "", style: "分割", style_src: "declared", items: "", conf: "中", note: "", ...o });

// 2問の分割。0018 は第1問の要望と第2問の質問を兼ねる（第2問は p3 から）
const ROWS = [
  row({ n: "1", title: "道路の整備", title_src: "bulletin", start: sid(10) + ":2", turns: `${sid(10)}:q;${sid(14)}:rq;${sid(18)}:req` }),
  row({ n: "2", title: "", start: sid(18) + ":3", style: "一問一答", turns: `${sid(18)}:q;${sid(22)}:q;${sid(26)}:req`, items: `${sid(22)}:1` }),
];
const CHAIR = "sid\tkind\tabout\ttext\n" + `${sid(17)}\trounds\t${sid(10)}\t４回目ですので要望で。\n`;

test("parseLedger：from ごとにまとめ、turns・items・start を分ける", () => {
  const L = parseLedger(tsv(ROWS), CHAIR);
  assert.equal(L.rows.length, 2);
  const rows = L.byFrom.get(sid(10));
  assert.deepEqual(rows.map((r) => r.n), [1, 2]);
  assert.deepEqual(rows[0].turns, [[sid(10), "q"], [sid(14), "rq"], [sid(18), "req"]]);
  assert.deepEqual(rows[1].start, [sid(18), 3]);
  assert.deepEqual(rows[1].items, [[sid(22), 1]]);
  assert.equal(L.chairByFrom.get(sid(10))[0].kind, "rounds");
  assert.throws(() => parseLedger("from\tmember\n"), /見出し/);
  assert.throws(() => parseLedger(COLUMNS.join("\t") + "\na\tb\n"), /列の数/);
});

test("applyLedger：questions は from からの相対位置。2つの問いにまたがる発言は両方の turns に入る", () => {
  const L = parseLedger(tsv(ROWS), CHAIR);
  const seg = { kind: "ippan", from: sid(10), to: sid(27), member: "杉浦和人", style: "分割", turns: [[0, "q", 1], [2, "a", 1]], topics: [{ n: 1, title: "機械の題", src: "minutes" }] };
  assert.equal(applyLedger(seg, L), true);
  assert.equal(seg.ledger, true);
  assert.equal(seg.style, "問いごと");
  assert.deepEqual(seg.chair, [[7, "rounds"]]);
  assert.deepEqual(seg.turns, [[0, "q", 1], [2, "a", 1]]); // 機械の turns は残す
  assert.deepEqual(seg.topics, [{ n: 1, title: "道路の整備", src: "bulletin" }]); // 題の無い問いは入れない
  assert.deepEqual(seg.questions[0], { n: 1, title: "道路の整備", title_src: "bulletin", start: [0, 2], style: "分割", style_src: "declared", turns: [[0, "q"], [4, "rq"], [8, "req"]], items: [], conf: "中" });
  assert.deepEqual(seg.questions[1].start, [8, 3]);
  assert.deepEqual(seg.questions[1].turns, [[8, "q"], [12, "q"], [16, "req"]]);
  assert.deepEqual(seg.questions[1].items, [[12, 1]]);
  // 台帳の無い区切りは変えない
  const other = { kind: "ippan", from: sid(40), style: "一括" };
  assert.equal(applyLedger(other, L), false);
  assert.equal(other.style, "一括");
  assert.equal(segmentStyle([{ style: "分割" }, { style: "分割" }]), "分割");
  assert.throws(() => offsetOf(sid(10), "0000000001_20260102_0011"), /別の日/);
});

// 検査用の発言索引：0010〜0027 を 議員・議長・当局・議長 の順に並べる
const INDEX = [];
for (let i = 10; i <= 27; i++) {
  const k = (i - 10) % 4;
  INDEX.push({ sid: sid(i), role: k === 0 ? "3番" : k === 2 ? "町長" : "議長", name: "x", text: "…" });
}
const PROC = { "0000000001": { segments: [{ kind: "ippan", from: sid(10), to: sid(26), member: "杉浦和人", date: "2026-01-01" }, { kind: "ippan", from: sid(30), to: sid(30), member: "別の議員", date: "2026-01-01" }] } };

test("checkLedger：決まりどおりの台帳は問題なし。台帳の無い区切りは下書き待ち", () => {
  const { errors, waiting, stats } = checkLedger(PROC, INDEX, parseLedger(tsv(ROWS), CHAIR));
  assert.deepEqual(errors, []);
  assert.deepEqual(waiting.map((s) => s.from), [sid(30)]);
  assert.equal(stats.questions, 2);
});

test("checkLedger：発言の漏れ・値の決まり・一問一答の回・start・議長の注意を問題にする", () => {
  const bad = [
    row({ n: "1", title: "道路の整備", title_src: "bulletin", start: sid(14) + ":1", turns: `${sid(10)}:q;${sid(18)}:zz` }),
    row({ n: "2", title: "x", title_src: "", start: sid(18) + ":3", style: "一問一答", turns: `${sid(18)}:q;${sid(22)}:rq;${sid(26)}:req`, conf: "下書き" }),
  ];
  const chair = "sid\tkind\tabout\ttext\n" + `${sid(14)}\trounds\t${sid(99)}\t…\n`;
  const { errors } = checkLedger(PROC, INDEX, parseLedger(tsv(bad), chair));
  const kinds = new Set(errors.map((e) => e.kind));
  for (const k of ["発言の漏れ", "種類", "start", "題の出どころ", "確信", "一問一答の回", "議長の注意"]) assert.ok(kinds.has(k), k);
});

test("ledger-draft：機械の turns から台帳と同じ列の下書きを作る（回・要望・方式・題）", () => {
  const seg = {
    kind: "ippan", from: sid(10), to: sid(30), member: "杉浦和人", date: "2026-01-01", style: "分割",
    turns: [[0, "q", 1], [2, "a", 1], [4, "rq", 1], [6, "a", 1], [8, "rq", 1], [10, "a", 1], [12, "rq", 1], [14, "a", 1], [16, "q", 2], [18, "a", 2], [20, "rq", 2]],
    topics: [{ n: 1, title: "答弁からの題", src: "minutes" }, { n: 1, title: "議会だよりの題", src: "bulletin" }],
  };
  const rows = draftRows(seg);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].turns, `${sid(10)}:q;${sid(14)}:rq;${sid(18)}:rrq;${sid(22)}:q4`);
  assert.equal(rows[0].title, "議会だよりの題");
  assert.equal(rows[0].title_src, "bulletin");
  assert.equal(rows[0].start, sid(10) + ":1");
  assert.equal(rows[1].turns, `${sid(26)}:q;${sid(30)}:req`); // 最後の答弁の無い発言は要望
  assert.equal(rows[1].title, "");
  assert.equal(rows[1].style, "分割");
  assert.equal(rows[1].style_src, "declared");
  assert.equal(rows[1].conf, "下書き");
  assert.equal(rows[1].note, DRAFT_NOTE);
  // 方式の宣言が無ければ不明、一問一答なら回を付けない
  assert.equal(draftRows({ ...seg, style: null })[0].style, "不明");
  assert.equal(draftRows({ ...seg, style: null })[0].style_src, "");
  assert.equal(draftRows({ ...seg, style: "一問一答" })[0].turns, `${sid(10)}:q;${sid(14)}:q;${sid(18)}:q;${sid(22)}:q`);
  // 台帳にある区切りは下書きを作らない。TSV は見出し行つきで、読み戻せる
  const proc = { "0000000001": { segments: [seg, { ...seg, from: sid(40), turns: [[0, "q", 1], [2, "a", 1]] }] } };
  const { rows: all, text } = draftTsv(proc, parseLedger(tsv(ROWS)));
  assert.deepEqual([...new Set(all.map((r) => r.from))], [sid(40)]);
  assert.equal(parseLedger(text).rows.length, 1);
  assert.equal(draftTsv({}, parseLedger(tsv(ROWS))).rows.length, 0);
});
