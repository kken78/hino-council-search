// crawl.mjs — 会議一覧/各会議ページを巡回。
//   public/data/meetings.json … 全文索引の対象（PDF取得して処理する会議）
//   public/data/toc.json       … 年度別カタログ（一覧に載る全会議。元の議会HP相当）
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getPage, ROOT, sleep } from "./lib/fetchx.mjs";
import { eraToYear, kanjiNum } from "./lib/eras.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../public/data");
const INDEX = `${ROOT}/category/32-3-6-0-0-0-0-0-0-0.html`;

function eraOf(name) {
  const m = name.match(/(令和|平成|昭和)\s*([0-9０-９一二三四五六七八九十元]+)\s*年/);
  if (!m) return { era: null, year: null };
  const n = kanjiNum(m[2].replace(/[０-９]/g, (d) => "０１２３４５６７８９".indexOf(d)));
  const year = eraToYear(m[1], n);
  return { era: `${m[1]}${n === 1 ? "元" : n}年`, year };
}
function guessDate(href, label, fallbackYear) {
  const f = href.match(/\/(\d{8})[^/]*\.pdf$/i);
  if (f) { const s = f[1]; return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; }
  const md = label.match(/(\d{1,2})月(\d{1,2})日/);
  if (md && fallbackYear) return `${fallbackYear}-${String(md[1]).padStart(2,"0")}-${String(md[2]).padStart(2,"0")}`;
  return null;
}
const isMeetingHref = (h) => /\/0000\d{5,6}\.html$/.test(h);
const isCatHref = (h) => /category\/32-3-6-\d+/.test(h);
const idOf = (url) => (url.match(/0000\d{5,6}/) || [null])[0] || (url.match(/(\d{4,6})\.html/)||[null,null])[1];

async function run() {
  const only = (process.env.HINO_MEETINGS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const onlyIds = new Set(only.map((s) => s.replace(/^0+/, "")));
  const limit = process.env.HINO_LIMIT ? parseInt(process.env.HINO_LIMIT, 10) : 0;

  // 一覧（＋年カテゴリ）から会議URL・名称を収集
  const catalog = new Map(); // id -> {url, name}
  const collect = (links) => {
    for (const { href, text } of links) {
      if (!isMeetingHref(href)) continue;
      const url = new URL(href, ROOT).href;
      const id = idOf(url);
      if (id && !catalog.has(id)) catalog.set(id, { url, name: (text || "").replace(/・会議録$/, "").trim() });
    }
  };
  const idx = await getPage(INDEX);
  collect(idx.links);
  const catUrls = new Set(idx.links.map((l) => l.href).filter(isCatHref).map((h) => new URL(h, ROOT).href));
  for (const c of catUrls) {
    try { collect((await getPage(c)).links); await sleep(150); }
    catch (e) { /* offlineでは年カテゴリ未キャッシュ→一覧トップで充足 */ }
  }

  // toc（全会議カタログ）
  const toc = [...catalog.entries()].map(([id, { url, name }]) => {
    const { era, year } = eraOf(name);
    return { id, name, year, era, type: /臨時/.test(name) ? "臨時会" : "定例会", url, indexed: false, pdfs: [] };
  });

  // 処理対象（全文索引）を決定
  let targets = [...catalog.keys()];
  if (onlyIds.size) targets = targets.filter((id) => onlyIds.has(id.replace(/^0+/, "")));
  if (limit) targets = targets.slice(0, limit);
  console.log(`カタログ ${toc.length} 会議／索引対象 ${targets.length} 会議`);

  const meetings = [];
  for (const id of targets) {
    const { url, name } = catalog.get(id);
    try {
      const m = await getPage(url);
      const title = (m.title || name).replace(/・会議録$/, "").trim();
      const { era, year } = eraOf(title);
      const pdfs = [];
      const seen = new Set();
      for (const { href, text } of m.links) {
        if (!/\/cmsfiles\/.+\.pdf$/i.test(href)) continue;
        if (seen.has(href)) continue;
        seen.add(href);
        const label = text || href.split("/").pop();
        pdfs.push({ label, date: guessDate(href, label, year), url: new URL(href, ROOT).href });
      }
      if (!pdfs.length) continue;
      const rec = { id, name: title, type: /臨時/.test(title) ? "臨時会" : "定例会", era, year, url, pdfs };
      meetings.push(rec);
      const t = toc.find((x) => x.id === id);
      if (t) { t.indexed = true; t.pdfs = pdfs; t.name = title; }
      console.log(`  OK ${title} (${pdfs.length} PDF)`);
      await sleep(150);
    } catch (e) {
      console.warn(`  NG ${url}: ${e.message.split("\n")[0]}`);
    }
  }

  const byYearId = (a, b) => (b.year || 0) - (a.year || 0) || b.id.localeCompare(a.id);
  meetings.sort(byYearId);
  toc.sort(byYearId);

  mkdirSync(DATA, { recursive: true });
  writeFileSync(join(DATA, "meetings.json"), JSON.stringify(meetings, null, 2));
  writeFileSync(join(DATA, "toc.json"), JSON.stringify(toc, null, 2));
  console.log(`\nmeetings.json: ${meetings.length} 会議 / ${meetings.reduce((s,m)=>s+m.pdfs.length,0)} PDF`);
  console.log(`toc.json: ${toc.length} 会議（索引済 ${toc.filter(t=>t.indexed).length}）`);
}
run();
