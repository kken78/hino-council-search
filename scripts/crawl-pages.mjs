// crawl-pages.mjs — 「本会議のご案内」(category/32-3-5) を巡回し、
//   会議録ID → 案内ページURL の対応表 public/data/meeting_pages.json を生成する。
//   会議録(toc.json)側と「年＋種別＋月」で突き合わせる。新しい会議が増えたら再実行。
// 使い方（リポジトリ直下）:  node scripts/crawl-pages.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const INDEX = "https://www.town.shiga-hino.lg.jp/category/32-3-5-0-0-0-0-0-0-0.html";
const ORIGIN = "https://www.town.shiga-hino.lg.jp";

// 名称から 西暦年 / 種別 / 月 を取り出す（会議録・案内で共通ロジック）
const eraYear = (name) => {
  if (/令和元年/.test(name)) return 2019;
  let m;
  if ((m = name.match(/令和(\d+)年/))) return 2018 + +m[1];
  if ((m = name.match(/平成(\d+)年/))) return 1988 + +m[1];
  return null;
};
const typeOf = (name) => (/臨時/.test(name) ? "臨時会" : "定例会");
const monthOf = (name) => { const m = name.match(/[（(](\d+)月/) || name.match(/(\d+)月[定臨]/); return m ? +m[1] : null; };
const key = (y, t, mo) => `${y}|${t}|${mo}`;

async function run() {
  const html = await (await fetch(INDEX)).text();
  // <a href=".../0000XXXXXX.html">名称</a> を収集（定例会・臨時会の案内のみ）
  const re = /href="([^"]*\/(\d{10})\.html)"[^>]*>([^<]*(?:定例|臨時)[^<]*)<\/a>/g;
  const amap = new Map(); let m;
  while ((m = re.exec(html))) {
    const url = m[1].startsWith("http") ? m[1] : ORIGIN + (m[1].startsWith("/") ? "" : "/") + m[1];
    const name = m[3].trim();
    const y = eraYear(name), t = typeOf(name), mo = monthOf(name);
    if (y && mo) amap.set(key(y, t, mo), url);
  }
  console.log(`案内ページ: ${amap.size} 件を取得`);

  const toc = JSON.parse(readFileSync(join(root, "public/data/toc.json"), "utf8"));
  const out = {}; const miss = [];
  for (const mt of toc) {
    const mo = monthOf(mt.name);
    const url = amap.get(key(mt.year, mt.type, mo));
    if (url) out[mt.id] = url; else miss.push(`${mt.id} ${mt.year} ${mt.type} ${mt.name}`);
  }
  writeFileSync(join(root, "public/data/meeting_pages.json"), JSON.stringify(out, null, 2));
  console.log(`meeting_pages.json: ${Object.keys(out).length} / ${toc.length} 会議を対応づけ`);
  if (miss.length) { console.log("未一致（案内ページが見つからない会議）:"); for (const x of miss) console.log("  " + x); }
}
run();
