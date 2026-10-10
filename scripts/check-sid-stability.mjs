// check-sid-stability.mjs — データ更新の前後で、発言ID（sid）が消えたり別の発言を指したりしていないかを確かめる。
// sid は議会だよりダッシュボード（council-dashboard）の data/minutes_links.json と questions.json の
// minutes_exchange にも保存されている。番号がずれると、他リポジトリのリンクが知らないうちに別の発言を指す。
//
// 使い方: node scripts/check-sid-stability.mjs [比較元のコミット（省略時 HEAD）] [--summary <ファイル>]
//   比較元：指定コミットの public/data（git show で読む。index-manifest.json＋index/<年>.json、無ければ index.json）
//   比較先：作業ツリーの public/data
// 出力：(a) 比較元にあって比較先にない sid  (b) 同じ sid で name が変わったもの  (c) 同じ sid で text が変わった件数
//       （(c) は正規化＝NFKC → 改行に続くページ番号「数字-数字」の除去 → 「-数字-」の除去 → 空白の除去 の後で、
//        一致／不一致に分けて数える）
//   標準出力には (a)(b) の全件を出す。--summary を付けると、件数と (a)(b) の先頭50件だけの要約（Markdown）を書き出す
//   （週1回の自動取り込みの PR 本文用）。
// 終了コード：(a) または (b) が1件以上なら 1。(c) は件数の表示のみ。比較元のコミットが無い・読めないときは 2。
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readIndex } from "./lib/data.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const args = process.argv.slice(2);
const si = args.indexOf("--summary");
const summaryFile = si >= 0 ? args[si + 1] : null;
const rev = args.filter((a, i) => a !== "--summary" && (si < 0 || i !== si + 1))[0] || "HEAD";
const LIMIT = 50;

// 比較元のコミットが無ければ、理由を表示して終了コード 2 で止める（(a)(b) の NG＝1 と区別する）
try {
  execFileSync("git", ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });
} catch {
  console.error(`比較元のコミット「${rev}」が見つかりません（コミット名・ブランチ名を確かめてください）。`);
  process.exit(2);
}

// 比較元：git show で指定コミットのファイルを読む（index.json は約45MBあるので出力上限を広げる）。
// quiet=true のときだけ git の標準エラーを捨てる（index-manifest.json の有無を確かめる読み込み専用。
// 年別分割前のコミットでは無いのが正常なので、エラー表示をログに混ぜない）。それ以外の読み込みではエラーをそのまま出す。
const show = (path, quiet = false) =>
  execFileSync("git", ["show", `${rev}:${path}`], { cwd: root, maxBuffer: 1 << 30, stdio: ["ignore", "pipe", quiet ? "ignore" : "inherit"] }).toString("utf8");
function readBase() {
  let manifest = null;
  try { manifest = JSON.parse(show("public/data/index-manifest.json", true)); } catch { /* 年別分割前のコミット */ }
  if (manifest) return { from: "index-manifest.json＋index/<年>.json", index: manifest.shards.flatMap((s) => JSON.parse(show(`public/data/${s.file}`))) };
  return { from: "index.json", index: JSON.parse(show("public/data/index.json")) };
}

// text の正規化（LINK_SCHEMA と同じ規則）：NFKC → 改行に続くページ番号「数字-数字」を除去 → 「-数字-」（臨時会の「－13－」）を除去 → 空白をすべて除去
const normText = (t) => String(t || "").normalize("NFKC").replace(/\n\d+-\d+/g, "").replace(/-\d+-/g, "").replace(/\s/g, "");

const base = readBase();
const head = new Map(readIndex(join(root, "public/data")).map((e) => [e.sid, e]));

const missing = [], renamed = [];
let textChanged = 0, textSameAfterNorm = 0, textDiffAfterNorm = 0;
for (const b of base.index) {
  const h = head.get(b.sid);
  if (!h) { missing.push(b); continue; }
  if ((b.name || "") !== (h.name || "")) renamed.push({ sid: b.sid, before: b.name, after: h.name });
  if ((b.text || "") !== (h.text || "")) {
    textChanged++;
    if (normText(b.text) === normText(h.text)) textSameAfterNorm++; else textDiffAfterNorm++;
  }
}

const ng = missing.length > 0 || renamed.length > 0;
const missLine = (m) => `${m.sid}  ${m.name || ""}`;
const renLine = (r) => `${r.sid}  ${r.before} → ${r.after}`;
const lines = {
  title: `発言IDの安定性：比較元 ${rev}（${base.from}・${base.index.length} 発言）→ 作業ツリー（${head.size} 発言）`,
  a: `(a) 比較元にあって比較先にない sid：${missing.length} 件`,
  b: `(b) 同じ sid で name が変わった：${renamed.length} 件`,
  c: `(c) 同じ sid で text が変わった：${textChanged} 件（正規化後に一致 ${textSameAfterNorm} 件／一致しない ${textDiffAfterNorm} 件）`,
  verdict: ng ? "NG：sid が消えたか、別の発言者を指すようになりました。council-dashboard のリンクが別の発言を指す恐れがあります。" : "OK：sid は保たれています。",
};

// 標準出力（ジョブのログ）：全件
console.log(lines.title);
console.log(lines.a);
for (const m of missing) console.log("  - " + missLine(m));
console.log(lines.b);
for (const r of renamed) console.log("  - " + renLine(r));
console.log(lines.c);
console.log(lines.verdict);

// 要約（PR 本文用）：件数と (a)(b) の先頭50件
if (summaryFile) {
  const list = (items, fmt) => {
    const out = items.slice(0, LIMIT).map((x) => "  - `" + fmt(x) + "`");
    if (items.length > LIMIT) out.push(`  - ほか ${items.length - LIMIT} 件はジョブのログ参照`);
    return out;
  };
  const md = [lines.title, "", "- " + lines.a, ...list(missing, missLine), "- " + lines.b, ...list(renamed, renLine), "- " + lines.c, "", "**" + lines.verdict + "**", ""].join("\n");
  writeFileSync(summaryFile, md);
}

process.exit(ng ? 1 : 0);
