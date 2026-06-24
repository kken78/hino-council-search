// dict-candidates.mjs — 取り込み済みコーパスから「辞書・区分の調整候補」を抽出する補助ツール。
// 全文取り込み（crawl→extract→index）後に実行すると、根拠ベースで辞書を育てられる。
//   node scripts/dict-candidates.mjs            # コンソール表示
//   node scripts/dict-candidates.mjs --json     # data/dict-candidates.json も出力
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../public/data");
const DICT = join(__dirname, "../dict");
const J = (p) => JSON.parse(readFileSync(p, "utf8"));

const index = J(join(DATA, "index.json"));
const gian = existsSync(join(DATA, "gian.json")) ? J(join(DATA, "gian.json")) : {};
const variants = J(join(DICT, "variants.json"));
const topics = existsSync(join(DICT, "topics.json")) ? J(join(DICT, "topics.json")) : [];

// 1) 区分「その他」の議案（区分ルール調整の候補）
const others = [];
for (const [mid, g] of Object.entries(gian)) for (const a of g.agenda || []) if (a.kind === "その他") others.push(`${a.no}  ${a.title}`);

// 2) variants 未登録の異体字を含む語（本文に出現する旧字・異体字の検出）
const KNOWN_VARIANTS = "髙﨑𠮷德濵濱邊邉齋齊靑𥔎曽渕栁嶋舘槇彅晄兒緖賴圡𡈽塚祐";
const variantHits = new Map();
const reKanjiRun = /[一-龥々〆ヶ]{1,12}/g;
for (const e of index) {
  for (const w of (e.text || "").match(reKanjiRun) || []) {
    for (const c of w) if (KNOWN_VARIANTS.includes(c) && !(c in variants)) {
      variantHits.set(w, (variantHits.get(w) || 0) + 1);
    }
  }
}

// 3) 発言者マスタ（氏名・役職）— 表記ゆれ確認とマスタ整備の素材
const members = new Map(), officials = new Map();
for (const e of index) {
  const nm = e.name || ""; if (!nm || nm[0] === "（") continue;
  if (/^[0-9０-９]+番$/.test(e.role || "")) members.set(nm, e.role);
  else if (e.role) officials.set(e.role, nm);
}

// 4) 分野（topics）の効き具合 — ヒット0や過多の語は辞書見直しの手がかり
const norm = (s) => s.replace(/[\s　、，,・･\-－―ー~〜]/g, "").normalize("NFKC").toLowerCase();
const corpus = index.map((e) => norm(e.text || ""));
const topicHits = topics.map((t) => {
  const terms = t.q.split(/\s+OR\s+/i).map(norm);
  let n = 0;
  for (const c of corpus) if (terms.some((x) => x && c.includes(x))) n++;
  return { label: t.label, hits: n };
});

const out = {
  generatedAt: new Date().toISOString(),
  counts: { 発言: index.length, 議案: Object.values(gian).reduce((s, g) => s + (g.agenda?.length || 0), 0) },
  区分その他の議案: others,
  異体字候補_variants未登録: [...variantHits.entries()].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w} (${n})`),
  発言者_議員: [...members.entries()].map(([n, r]) => `${r} ${n}`),
  発言者_当局: [...officials.keys()],
  分野ヒット件数: topicHits,
};

console.log("=== 辞書・区分 調整候補 ===");
console.log(`発言 ${out.counts.発言} / 議案 ${out.counts.議案}\n`);
console.log(`■ 区分「その他」の議案（区分ルール調整候補）: ${others.length}件`);
others.slice(0, 30).forEach((x) => console.log("  - " + x));
console.log(`\n■ 異体字候補（variants.json 未登録の旧字を含む語）: ${out.異体字候補_variants未登録.length}件`);
out.異体字候補_variants未登録.slice(0, 30).forEach((x) => console.log("  - " + x));
console.log(`\n■ 分野ヒット件数（0件や過多は辞書見直しの手がかり）`);
topicHits.forEach((t) => console.log(`  - ${t.label}: ${t.hits}`));
console.log(`\n■ 発言者: 議員 ${members.size}名 / 当局 ${officials.size}役職`);

if (process.argv.includes("--json")) {
  writeFileSync(join(DATA, "dict-candidates.json"), JSON.stringify(out, null, 2));
  console.log("\n→ public/data/dict-candidates.json を書き出しました");
}
