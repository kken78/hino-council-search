// build.mjs — 本番フロントを生成。
//   dist/日野町議会-会議録検索.html … データ埋め込みの自己完結HTML（オフライン配布・閉域NW用）
//   dist/online/index.html (+ data/*.json) … fetch型の軽量版（GitHub Pages 配信用）
// 環境変数 HINO_BUNDLE_PDF=1 で data/pdf を dist に同梱し、PDFリンクを相対パス化（完全オフライン用）。
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { textKey } from "./lib/keys.mjs";
import { buildNormStr } from "./lib/normalize.mjs";
import { readIndex, writeIndex } from "./lib/data.mjs";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const R = (p) => readFileSync(join(root, p), "utf8");
const J = (p) => JSON.parse(R(p));

const big = { meetings: J("public/data/meetings.json"), index: readIndex(join(root, "public/data")), gian: J("public/data/gian.json"), toc: J("public/data/toc.json") };
// 審議構造（任意）。無ければ UI は従来表示のまま動く。
const proceedings = existsSync(join(root, "public/data/proceedings.json")) ? J("public/data/proceedings.json") : null;
const small = { topics: J("dict/topics.json"), dict: { variants: J("dict/variants.json"), synonyms: J("dict/synonyms.json"), yomi: J("dict/yomi.json") }, highlights: existsSync(join(root, "public/data/highlights.json")) ? J("public/data/highlights.json") : null, pages: existsSync(join(root, "public/data/meeting_pages.json")) ? J("public/data/meeting_pages.json") : null };

mkdirSync(join(root, "dist"), { recursive: true });
mkdirSync(join(root, "dist/online/data"), { recursive: true });

// （任意）PDFを同梱し、絶対URL→相対パスへ書き換え（完全オフライン配布用）
if (process.env.HINO_BUNDLE_PDF) {
  const map = new Map();
  mkdirSync(join(root, "dist/pdf"), { recursive: true });
  mkdirSync(join(root, "dist/online/pdf"), { recursive: true });
  let n = 0;
  for (const m of big.meetings) for (const pdf of m.pdfs) {
    const src = join(root, "data/pdf", textKey(m.id, pdf) + ".pdf");
    if (!existsSync(src)) continue;
    const baseName = pdf.url.split("/").pop();
    copyFileSync(src, join(root, "dist/pdf", baseName));
    copyFileSync(src, join(root, "dist/online/pdf", baseName));
    map.set(pdf.url, "pdf/" + baseName); n++;
  }
  for (const e of big.index) if (map.has(e.pdf)) e.pdf = map.get(e.pdf);
  for (const m of big.meetings) for (const pdf of m.pdfs) if (map.has(pdf.url)) pdf.url = map.get(pdf.url);
  for (const t of big.toc) for (const pdf of (t.pdfs || [])) if (map.has(pdf.url)) pdf.url = map.get(pdf.url);
  console.log("PDF同梱: " + n + " 件を相対パス化");
}

// 配信・配布物にだけ norm を付与（リポジトリの発言索引は norm 無しで軽く保つ）。
// 実行時の正規化ゼロ＝初回検索を即応答に。フロントは e.norm があればそれを使う。
for (const e of big.index) if (e.norm == null) e.norm = buildNormStr(e.text || "");

let tpl = R("scripts/preview.tpl.html");
tpl = tpl.replace(/<div class="note">[\s\S]*?<\/div>\n/, "")
         .replace(/ <span style="font-size:12px;color:#9fb0c6">（プレビュー）<\/span>/, "")
         .replace("<title>日野町議会 会議録 横断検索（プレビュー）</title>", "<title>日野町議会 会議録 横断検索</title>");

// 1) オフライン配布用：全データ埋め込み
const allData = { ...big, ...small, proceedings };
writeFileSync(join(root, "dist/日野町議会-会議録検索.html"), tpl.replace("/*__BOOT__*/", "start(" + JSON.stringify(allData) + ");"));

// 2) オンライン用：dict/topics内蔵＋大きいJSONはfetch（発言索引は年別ファイルを並列取得）
const boot = "const DICT=" + JSON.stringify(small.dict) + ";const TOPICS=" + JSON.stringify(small.topics) + ";const HL=" + JSON.stringify(small.highlights) + ";const PAGES=" + JSON.stringify(small.pages) + ";"
  + "(async function(){try{const B=new URL('.',location.href).href;"
  + "const J=p=>fetch(B+p).then(r=>{if(!r.ok)throw new Error(p+' '+r.status);return r.json();});"
  + "const man=await J('data/index-manifest.json');"
  // 直近2年分を先に読み込んで画面を出し、残りの年は並列で取得して後から追加する（スマホでもすぐ検索できるように）
  + "const N=Math.min(2,man.shards.length),first=man.shards.slice(0,N),rest=man.shards.slice(N);"
  + "const [shards,gian,toc,meetings]=await Promise.all([Promise.all(first.map(s=>J('data/'+s.file))),J('data/gian.json'),J('data/toc.json'),J('data/meetings.json')]);"
  + "const index=shards.flat();"
  + "const loading=rest.length?{from:first[first.length-1].year,loaded:N,total:man.shards.length,done:false}:null;"
  + "const proceedings=await fetch(B+'data/proceedings.json').then(r=>r.ok?r.json():null).catch(()=>null);"
  + "const app=start({index,gian,toc,meetings,proceedings,dict:DICT,topics:TOPICS,highlights:HL,pages:PAGES,loading});"
  + "if(rest.length){const more=await Promise.all(rest.map(s=>J('data/'+s.file)));app.addIndex(more.flat(),{loaded:man.shards.length,done:true});}"
  + "}catch(e){document.getElementById('results').innerHTML='<div class=\"empty\">データの読み込みに失敗しました（'+e+'）。ローカルで開く場合は単一HTML版をご利用ください。</div>';}})();";
writeFileSync(join(root, "dist/online/index.html"), tpl.replace("/*__BOOT__*/", boot));
writeIndex(join(root, "dist/online/data"), big.index);
for (const f of ["gian.json", "toc.json", "meetings.json"]) writeFileSync(join(root, "dist/online/data", f), JSON.stringify(big[f.replace(".json", "")]));
if (proceedings) writeFileSync(join(root, "dist/online/data/proceedings.json"), JSON.stringify(proceedings));

console.log("生成: dist/日野町議会-会議録検索.html（オフライン）, dist/online/index.html（fetch型）");
