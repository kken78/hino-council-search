// check-ui.mjs — 会議録 横断検索に固有の検査（hino-portal DESIGN.md 9.1。2026-11-11）
//   PLAYWRIGHT_MODULE=<playwright の index.mjs> node scripts/check-ui.mjs [--council <questions.json のパスか URL>]
// 確かめること：
//   1. 手元版（dist/<オフラインのファイル>）を開いて探しても、外のサイトへの通信が0件であること
//      （開いたとき、言葉で探したとき、発言のやりとりを開いたとき。PDF などへのリンクは押さないので数えない）
//   2. 決まった言葉で探すと、決まった発言が結果に出ること（scripts/test/search-fixtures.json）
//   3. 共有リンク #thread=<sid>&focus=<sid> で開くと、その発言にしるしが付いて開くこと
//   4. --council を付けたとき：議会だよりダッシュボードの questions.json の minutes_exchange が指す sid が、すべて索引にあること
// 終了コード：問題が無ければ 0、あれば 1。
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readIndex } from "./lib/data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));
const OFFLINE = resolve(root, "dist", (SITE.ui && SITE.ui.offline_file) || "会議録検索.html");
const FIX = JSON.parse(readFileSync(join(root, "scripts/test/search-fixtures.json"), "utf8"));
const args = process.argv.slice(2);
const bad = [];

// 4. 議会だよりダッシュボードからのリンク
const ci = args.indexOf("--council");
if (ci >= 0) {
  const src = args[ci + 1];
  const text = /^https?:/.test(src) ? await (await fetch(src)).text() : readFileSync(src, "utf8");
  const qs = JSON.parse(text).questions || [];
  const sids = new Set((await readIndex(join(root, "public/data"))).map(e => e.sid));
  let n = 0;
  const missing = [];
  for (const q of qs) {
    if (!q.minutes_exchange) continue;
    const h = new URLSearchParams(q.minutes_exchange.split("#")[1] || "");
    for (const k of ["thread", "focus", "sid"]) {
      const v = h.get(k);
      if (!v) continue;
      n++;
      if (!sids.has(v)) missing.push(`第${q.issue}号 ${q.member}：${k}=${v}`);
    }
  }
  if (missing.length) bad.push(`議会だよりダッシュボードのリンク ${n} 件のうち、索引に無い sid が ${missing.length} 件：` + missing.slice(0, 5).join("、"));
  else console.log(`議会だよりダッシュボードのリンク ${n} 件の sid は、すべて索引にある`);
}

// 1〜3. 手元版を実ブラウザで
if (!existsSync(OFFLINE)) { console.log(`手元版が無い：${OFFLINE}（先に node scripts/build.mjs）`); process.exit(1); }
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const b = await chromium.launch();
const p = await b.newPage();
const ext = [], errs = [];
p.on("request", r => { const u = r.url(); if (!/^(file|data|blob|about):/.test(u)) ext.push(u); });
p.on("pageerror", e => errs.push(e.message));
await p.route(/^https?:/, r => r.abort());
const url = "file://" + OFFLINE;
await p.goto(url);
await p.waitForSelector("#q", { timeout: 60000 });
for (const f of FIX.search) {
  await p.fill("#q", f.q);
  await p.press("#q", "Enter");
  await p.waitForTimeout(800);
  const html = await p.$eval("#results", el => el.innerHTML);
  if (!html.includes(f.sid)) bad.push(`「${f.q}」で探しても、発言 ${f.sid}（${f.note}）が結果に出ない`);
  else console.log(`「${f.q}」で発言 ${f.sid} が出る`);
}
for (const f of FIX.thread) {
  await p.goto("about:blank");
  await p.goto(`${url}#thread=${f.sid}&focus=${f.sid}`);
  await p.waitForTimeout(1500);
  const got = await p.evaluate(() => { const t = document.querySelector("#threadBody .turn.focus"); return t ? t.dataset.sid : null; });
  if (got !== f.sid) bad.push(`共有リンク #thread=${f.sid}&focus=${f.sid} で、その発言が開かない（しるしの付いた発言：${got}）`);
  else console.log(`共有リンクで発言 ${f.sid} が開く`);
}
await b.close();
if (ext.length) bad.push(`手元版から外のサイトへの通信が ${ext.length} 件：` + [...new Set(ext)].slice(0, 5).join("、"));
else console.log("手元版から外のサイトへの通信は0件");
if (errs.length) bad.push("ページの JavaScript のエラー：" + errs.slice(0, 3).join(" / "));
if (bad.length) { console.log(`問題 ${bad.length} 件`); bad.forEach(x => console.log("  - " + x)); process.exit(1); }
console.log("OK  check-ui.mjs");
