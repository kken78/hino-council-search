// fetch-pdfs.mjs — 会議録PDFを「議事録本体/<会議ID>_<ファイル名>」へまとめてダウンロード（ローカル閲覧用）。
//   build-preview.mjs が張るリンクと同じ命名なので、ダウンロード後 preview.html からそのまま開ける。
//   保存先フォルダ名は build-preview と揃える必要がある（既定 議事録本体）。
// 使い方（リポジトリ直下）:  node scripts/fetch-pdfs.mjs
//   HINO_PDF_DIR=別名 で保存先変更 ／ 既にあるファイルはスキップ（再実行で差分だけ取得）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const OUT = join(root, process.env.HINO_PDF_DIR || "議事録本体");
const J = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const base = (u) => String(u).split("/").pop();

// meetings.json と toc.json から全PDFを収集（<会議ID>_<ファイル名> をキーに重複排除）
const items = new Map();
const add = (id, url) => { if (url) items.set(id + "_" + base(url), url); };
for (const m of J("public/data/meetings.json")) for (const p of (m.pdfs || [])) add(m.id, p.url);
try { for (const t of J("public/data/toc.json")) for (const p of (t.pdfs || [])) add(t.id, p.url); } catch {}

mkdirSync(OUT, { recursive: true });
console.log(`対象 ${items.size} 件 → ${OUT}`);

let ok = 0, skip = 0, fail = 0;
for (const [name, url] of items) {
  const dest = join(OUT, name);
  if (existsSync(dest)) { skip++; continue; }
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    ok++; process.stdout.write(`\r取得 ${ok} / スキップ ${skip} / 失敗 ${fail}   `);
  } catch (e) { fail++; console.warn(`\n× ${name} (${e.message})`); }
}
console.log(`\n完了: 取得 ${ok} / 既存スキップ ${skip} / 失敗 ${fail}`);
if (fail) console.log("※ 失敗分は時間をおいて再実行すると差分だけ取り直します。");
