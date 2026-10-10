// link-bulletin.mjs — 議会だより（council-dashboard）の一般質問の見出し・分類を、会議録の一般質問へ結びつける。
// index.mjs の後に実行する（proceedings.json / gian.json の一般質問に topics{src:"bulletin"} と theme を追記）。
//   結びつけ方：会議ID（議会だよりの minutes URL。案内ページIDなら meeting_pages.json を逆引き）＋ 正規化した議員名
//   取得元：BULLETIN_QUESTIONS_URL（既定は council-dashboard の GitHub raw）。ローカルファイルのパスも可。
//   取得に失敗しても会議録から推定した質問項目だけで続行する（エラー終了しない）。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildNormStr } from "./lib/normalize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../public/data");
const SRC = process.env.BULLETIN_QUESTIONS_URL || "https://raw.githubusercontent.com/kken78/council-dashboard/main/docs/data/questions.json";
const J = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

async function load() {
  if (!/^https?:/.test(SRC)) return JSON.parse(readFileSync(SRC, "utf8"));
  const r = await fetch(SRC);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function run() {
  let dash;
  try { dash = await load(); }
  catch (e) { console.warn(`議会だよりの取得に失敗したため結びつけを省略します（${SRC}: ${e.message}）`); return; }
  const questions = dash.questions || [];
  const proc = J("proceedings.json"), gian = J("gian.json"), meetings = J("meetings.json");
  const pages = existsSync(join(DATA, "meeting_pages.json")) ? J("meeting_pages.json") : {};
  const ids = new Set(meetings.map((m) => m.id));
  const byPage = new Map(Object.entries(pages).map(([mid, url]) => [(url.match(/(\d{10})/) || [])[1], mid]));
  const nm = (s) => buildNormStr(s || "");

  // 会議ID → 議員 → 質問（q_num 順）
  const groups = new Map();
  let unresolved = 0;
  for (const q of questions) {
    const raw = ((q.minutes || "").match(/(\d{10})/) || [])[1];
    const mid = ids.has(raw) ? raw : byPage.get(raw);
    if (!mid) { unresolved++; continue; }
    const key = mid + "|" + nm(q.member);
    (groups.get(key) || groups.set(key, []).get(key)).push(q);
  }

  let linked = 0;
  for (const [mid, { segments }] of Object.entries(proc)) {
    for (const s of segments) {
      if (s.kind !== "ippan") continue;
      s.topics = (s.topics || []).filter((t) => t.src !== "bulletin"); // 再実行しても重複しない
      const qs = (groups.get(mid + "|" + nm(s.member)) || []).sort((a, b) => a.q_num - b.q_num);
      if (!qs.length) continue;
      s.topics.push(...qs.map((q) => ({ n: q.q_num, title: q.title, theme: q.theme || null, src: "bulletin", issue: q.issue })));
      const ip = ((gian[mid] || {}).ippan || []).find((x) => nm(x.member) === nm(s.member));
      if (ip) {
        ip.topics = s.topics.map(({ n, title, theme, src }) => ({ n, title, ...(theme ? { theme } : {}), src }));
        if (!ip.theme && qs[0].theme) ip.theme = qs[0].theme;
      }
      linked++;
    }
  }
  writeFileSync(join(DATA, "proceedings.json"), JSON.stringify(proc));
  writeFileSync(join(DATA, "gian.json"), JSON.stringify(gian, null, 2));
  const unmatched = [...groups.keys()].filter((k) => {
    const [mid, n] = k.split("|");
    return !((proc[mid] || { segments: [] }).segments.some((s) => s.kind === "ippan" && nm(s.member) === n));
  });
  console.log(`議会だより：${questions.length} 問 → 一般質問 ${linked} 件に見出しを結びつけ（会議ID不明 ${unresolved} 問／会議録側に該当なし ${unmatched.length} 人）`);
  if (unmatched.length) console.log("  該当なし: " + unmatched.join(", "));
}
run();
