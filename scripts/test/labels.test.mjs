// 一般質問の見出し（scripts/lib/labels.mjs）と、画面・MCP への写しのテスト。
// 実行: npm test（node --test）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { partLabel, ledgerTurnLabels, chairLabels, titleSrcLabel, sidAt, labelsSource, labelsBlock, inlineLabels } from "../lib/labels.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const D = "0000000001_20260101_";

test("partLabel：種類ごとの見出し", () => {
  assert.equal(partLabel("q", 1, false), "質問");
  assert.equal(partLabel("q", 2, true), "質問（第2問）");
  assert.equal(partLabel("q", 1, false, [3]), "質問・項目3");
  assert.equal(partLabel("rq", 1, false), "再質問");
  assert.equal(partLabel("rrq", 1, false), "再々質問");
  assert.equal(partLabel("q4", 1, false), "4回目の質問（答弁あり）");
  assert.equal(partLabel("req", 1, true), "要望（第1問）");
  assert.equal(partLabel("x", 1, true), "（回に数えない発言）");
  assert.equal(partLabel("q", 2, true, null, 3), "質問（第2問。p3から）");
});

test("ledgerTurnLabels：2つの問いにまたがる発言・答弁の問番号・一問一答の項目", () => {
  const sg = {
    from: D + "0010",
    turns: [[0, "q", 1], [2, "a", 1], [4, "rq", 1], [6, "a", 1], [8, "q", 2], [10, "a", 2], [12, "q", 2], [14, "a", 2]],
    questions: [
      { n: 1, start: [0, 2], style: "分割", turns: [[0, "q"], [4, "rq"], [8, "req"]], items: [] },
      { n: 2, start: [8, 3], style: "一問一答", turns: [[8, "q"], [12, "q"]], items: [[12, 1]] },
    ],
    chair: [[7, "rounds"]],
  };
  const m = ledgerTurnLabels(sg);
  assert.equal(m.get(0).label, "質問（第1問）");
  assert.equal(m.get(2).label, "答弁（第1問）");
  assert.equal(m.get(4).label, "再質問（第1問）");
  assert.equal(m.get(8).label, "要望（第1問）／質問（第2問。p3から）");
  assert.deepEqual(m.get(8).parts.map((p) => [p.n, p.kind]), [[1, "req"], [2, "q"]]);
  assert.equal(m.get(10).label, "答弁（第2問）");
  assert.equal(m.get(12).label, "質問・項目1（第2問）");
  assert.equal(chairLabels(sg).get(7), "議長：回数の注意");
  assert.equal(sidAt(sg.from, 8), D + "0018");
  // 問いが1つなら問番号を付けない
  const one = ledgerTurnLabels({ from: D + "0010", turns: [[0, "q", 1], [2, "a", 1]], questions: [{ n: 1, turns: [[0, "q"]], items: [] }] });
  assert.equal(one.get(0).label, "質問");
  assert.equal(one.get(2).label, "答弁");
  assert.equal(titleSrcLabel("bulletin", 35), "議会だより 第35号");
  assert.equal(titleSrcLabel("notice"), "通告の件名");
  assert.equal(titleSrcLabel("minutes"), "会議録の発言による");
});

test("MCP の見出しの写しが scripts/lib/labels.mjs と同じ", () => {
  const mcp = readFileSync(join(root, "mcp/hino-council-mcp.mjs"), "utf8");
  assert.equal(labelsBlock(mcp), labelsSource());
});

test("画面のひな形に見出しの関数を埋め込める", () => {
  const tpl = readFileSync(join(root, "scripts/preview.tpl.html"), "utf8");
  const out = inlineLabels(tpl);
  assert.ok(out.includes("function ledgerTurnLabels(sg)"));
  assert.ok(!/^export /m.test(labelsSource()));
  assert.ok(!labelsSource().includes("import "));
});
