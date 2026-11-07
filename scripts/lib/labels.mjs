// labels.mjs — 一般質問の台帳（proceedings.json の questions・chair）から、発言ごとの見出しを作る。
//   画面（scripts/preview.tpl.html）と MCP（mcp/hino-council-mcp.mjs）で同じ見出しを使う。
//   画面には build.mjs・build-preview.mjs が「__LABELS_BEGIN__」から「__LABELS_END__」までを埋め込む（export を外して）。
//   MCP は単一ファイルで動かすため、同じ範囲の写しを持つ。2つが同じことは scripts/test/labels.test.mjs で確かめる。
//   この範囲の中では import を使わない（ブラウザの中でもそのまま動くように）。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// __LABELS_BEGIN__
// 台帳の発言の種類 → 見出しの名前
export const TURN_NAME = { q: "質問", rq: "再質問", rrq: "再々質問", q4: "4回目の質問", req: "要望", x: "回に数えない発言" };
// 議長の注意の種類 → 印
export const CHAIR_LABEL = { rounds: "議長：回数の注意", notice: "議長：通告外の注意" };
// 題の出どころ → 注記（議会だよりは号を添える）
export const TITLE_SRC_LABEL = { bulletin: "議会だより", notice: "通告の件名", minutes: "会議録の発言による" };
export const STYLE_INFERRED_NOTE = "（発言の運びから推定）";

// from からの相対位置 → sid
export function sidAt(from, off) {
  return from.slice(0, -4) + String(parseInt(from.slice(-4), 10) + off).padStart(4, "0");
}

// 1つの問いの中の1つの発言の見出し
//   kind：台帳の種類、n：問番号、multi：問いが2つ以上か、items：一問一答の項目の番号（1から）、fromP：この発言の途中から問いが始まるときの段落
export function partLabel(kind, n, multi, items, fromP) {
  if (kind === "x") return "（" + TURN_NAME.x + "）";
  let name = TURN_NAME[kind] || kind;
  if (kind === "q" && items && items.length) name += "・項目" + items.join("・");
  const extra = [];
  if (kind === "q4") extra.push("答弁あり");
  if (multi) extra.push("第" + n + "問");
  if (fromP) extra.push("p" + fromP + "から");
  return name + (extra.length ? "（" + extra.join("。") + "）" : "");
}

// 区切り（台帳のあるもの）→ Map<from からの相対位置, { kind, parts:[{ n, kind }], n, label }>
//   議員の発言は台帳の turns から。1つの発言が2つの問いにまたがるときは両方を「／」でつなぐ。
//   答弁は機械の turns の "a" から取り、直前の議員の発言の問番号を付ける。
export function ledgerTurnLabels(sg) {
  const m = new Map();
  const qs = sg.questions || [];
  const multi = qs.length >= 2;
  for (const q of qs) {
    const itemNo = new Map();
    (q.items || []).forEach(([off], k) => (itemNo.get(off) || itemNo.set(off, []).get(off)).push(k + 1));
    for (const [off, kind] of q.turns) {
      const cur = m.get(off) || { parts: [] };
      const fromP = cur.parts.length && q.start && q.start[0] === off ? q.start[1] : null;
      cur.parts.push({ n: q.n, kind, label: partLabel(kind, q.n, multi, itemNo.get(off), fromP) });
      m.set(off, cur);
    }
  }
  for (const v of m.values()) {
    const last = v.parts[v.parts.length - 1];
    v.kind = last.kind;
    v.n = last.n;
    v.label = v.parts.map((p) => p.label).join("／");
  }
  let cur = null;
  for (const [off, t] of [...(sg.turns || [])].sort((a, b) => a[0] - b[0])) {
    if (m.has(off)) { cur = m.get(off).n; continue; }
    if (t === "a") m.set(off, { kind: "a", parts: [], n: cur, label: "答弁" + (multi && cur ? "（第" + cur + "問）" : "") });
  }
  return m;
}

// 区切り → Map<from からの相対位置, 議長の注意の印>
export function chairLabels(sg) {
  return new Map((sg.chair || []).map(([off, kind]) => [off, CHAIR_LABEL[kind] || kind]));
}

// 問いの題の出どころの注記（議会だよりは号を添える）
export function titleSrcLabel(src, issue) {
  if (src === "bulletin") return TITLE_SRC_LABEL.bulletin + (issue ? " 第" + issue + "号" : "");
  return TITLE_SRC_LABEL[src] || "";
}
// __LABELS_END__

// 「__LABELS_BEGIN__」から「__LABELS_END__」までの文字（export を外す）。画面への埋め込みとテストに使う
export function labelsSource() {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  return labelsBlock(src).replace(/^export /gm, "");
}
export function labelsBlock(src) {
  const a = src.indexOf("// __LABELS_BEGIN__"), b = src.indexOf("// __LABELS_END__");
  if (a < 0 || b < a) throw new Error("__LABELS_BEGIN__・__LABELS_END__ の印がありません");
  return src.slice(a, b + "// __LABELS_END__".length);
}
// 画面のひな形の「/*__LABELS__*/」に埋め込む
export function inlineLabels(tpl) {
  if (!tpl.includes("/*__LABELS__*/")) throw new Error("ひな形に /*__LABELS__*/ がありません");
  return tpl.replace("/*__LABELS__*/", () => labelsSource());
}
