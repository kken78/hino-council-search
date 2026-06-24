// 取得ユーティリティ。本番はネイティブ fetch（GitHub Actions 等）。
// ネットワーク不可の環境では data/cache/ の事前取得データを読む（HINO_OFFLINE=1）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = "https://www.town.shiga-hino.lg.jp";
const CACHE_DIR = join(__dirname, "../../data/cache/pages");
const OFFLINE = process.env.HINO_OFFLINE === "1";

const sanitize = (url) => url.replace(/^https?:\/\//, "").replace(/[^\w.-]/g, "_");

mkdirSync(CACHE_DIR, { recursive: true });

// HTMLページを取得し、{ url, title, links:[{text,href(絶対)}] } を返す。
// 取得結果はキャッシュ(JSON)へ保存し、OFFLINE時はキャッシュのみ使用。
export async function getPage(url) {
  const cacheFile = join(CACHE_DIR, sanitize(url) + ".json");
  if (existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  }
  if (OFFLINE) {
    throw new Error(`[offline] キャッシュ無し: ${url}\n  data/cache/pages/ に事前取得データが必要です。`);
  }
  const cheerio = await import("cheerio"); // 本番のみ使用（offline時はキャッシュで完結）
  const html = await (await fetch(url, { headers: { "user-agent": "gikai-search/0.1" } })).text();
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || $("title").text().trim();
  const links = [];
  $("a").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!href) return;
    links.push({ text: $(a).text().replace(/\s+/g, " ").trim(), href: new URL(href, ROOT).href });
  });
  const page = { url, title, links };
  writeFileSync(cacheFile, JSON.stringify(page));
  return page;
}

// バイナリ（PDF）取得。OFFLINEでは未対応（extract側でテキストキャッシュを使う）。
export async function fetchBuffer(url) {
  if (OFFLINE) throw new Error(`[offline] PDF取得不可: ${url}`);
  const res = await fetch(url, { headers: { "user-agent": "gikai-search/0.1" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
