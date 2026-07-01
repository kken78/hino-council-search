// build-preview.mjs — 開発確認用の単体プレビュー（索引データ内蔵）を preview.html に生成。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildNormStr } from "./lib/normalize.mjs";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const R = (p) => readFileSync(join(root, p), "utf8");
const J = (p) => JSON.parse(R(p));
const data = {
  meetings: J("public/data/meetings.json"), index: J("public/data/index.json"),
  gian: J("public/data/gian.json"), toc: J("public/data/toc.json"),
  topics: J("dict/topics.json"),
  dict: { variants: J("dict/variants.json"), synonyms: J("dict/synonyms.json"), yomi: J("dict/yomi.json") },
  highlights: existsSync(join(root, "public/data/highlights.json")) ? J("public/data/highlights.json") : null,
  pages: existsSync(join(root, "public/data/meeting_pages.json")) ? J("public/data/meeting_pages.json") : null,
  local: true,   // preview.html はローカル用：会議ページリンクを非表示にする
};
// ローカル preview.html にも norm を付与（初回検索を即応答に）。リポジトリの index.json は変更しない。
for (const e of data.index) if (e.norm == null) e.norm = buildNormStr(e.text || "");

// ローカル閲覧用：PDFリンクを手元フォルダ（議事録本体/<会議ID>_<ファイル名>）に向ける。
// これは preview.html の埋め込みデータだけを書き換える。本番(build.mjs)は元のURLのまま。
// オンラインURLのままにしたい場合は  HINO_PDF_ONLINE=1 npm run preview  で無効化できる。
if (!process.env.HINO_PDF_ONLINE) {
  const PDF_DIR = process.env.HINO_PDF_DIR || "議事録本体";
  const base = (u) => String(u).split("/").pop();
  const local = (id, u) => u ? PDF_DIR + "/" + id + "_" + base(u) : u;
  for (const e of data.index) if (e.pdf) e.pdf = local(e.meetingId, e.pdf);
  for (const t of data.toc) for (const p of (t.pdfs || [])) if (p.url) p.url = local(t.id, p.url);
  for (const m of data.meetings) for (const p of (m.pdfs || [])) if (p.url) p.url = local(m.id, p.url);
}

let tpl = R("scripts/preview.tpl.html");
// ローカル専用：フッター等に直書きされた外部リンク（議会だよりダッシュボード等）を除去。
// preview.html は完全ローカル用のため、インターネット向けURLのリンクを持たせない。
// （PDF/会議ページのリンクは上で既にローカル化／非表示にしている）
tpl = tpl.replace(/\s*<a\b[^>]*href="https?:\/\/[^"]*"[^>]*>[\s\S]*?<\/a>/g, "");
const out = tpl.replace("/*__BOOT__*/", "start(" + JSON.stringify(data) + ");");
writeFileSync(join(root, "preview.html"), out);
console.log("preview.html 生成: " + out.length + " bytes / 発言 " + data.index.length);
