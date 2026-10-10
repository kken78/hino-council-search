// link-bulletin.mjs — 議会だより（council-dashboard）の一般質問の見出し・分類を、会議録の一般質問へ結びつける。
// index.mjs の後に実行する（proceedings.json / gian.json の一般質問に topics{src:"bulletin"} と theme を追記）。
//   結びつけ方：会議ID（議会だよりの minutes URL。案内ページIDなら meeting_pages.json を逆引き）＋ 正規化した議員名
//   取得元：BULLETIN_QUESTIONS_URL（既定は council-dashboard の GitHub raw）。ローカルファイルのパスも可。
//   取得に失敗しても会議録から推定した質問項目だけで続行する（エラー終了しない）。
// あわせて、議会だよりの各質問（題名＋問の本文）が会議録のどの議員発言に当たるかを推定し、
// 一般質問の場面に qalign: [[質問番号, from からの相対位置], …] として付ける（確信度が低い質問は付けない）。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildNormStr } from "./lib/normalize.mjs";
import { readIndex } from "./lib/data.mjs";
import { SITE } from "./lib/site.mjs";

// ── 議会だよりの質問 → 会議録の議員発言の位置合わせ ──
// 文字の2-gramで「質問の題名＋問の本文の冒頭」が発言の冒頭600字にどれだけ現れるか（被覆率）を測り、
// 質問の順序を保ったまま（同じ発言に複数の質問が当たってもよい＝分割方式）合計が最大になる割り当てを動的計画法で求める。
// 会議録で検出した「問」の数が質問数と一致する場合は、その位置と比べて被覆率の高い方を採る。
const HEAD = 600, TH = 0.3;
const bigrams = (s) => { const t = buildNormStr(s || "").replace(/[「」『』（）()？?！!…。]/g, ""), out = new Set(); for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2)); return out; };
const cover = (a, b) => { if (!a.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / a.size; };
function alignQuestions(seg, qs, textOf) {
  const pre = seg.from.slice(0, -4), f0 = parseInt(seg.from.slice(-4), 10);
  const turns = (seg.turns || []).filter((t) => t[1] === "q" || t[1] === "rq").map((t) => ({ off: t[0], kind: t[1], b: bigrams((textOf(pre + String(f0 + t[0]).padStart(4, "0")) || "").slice(0, HEAD)) }));
  if (!turns.length) return [];
  const qb = qs.map((q) => bigrams(q.title + (q.question_text || "").slice(0, 80)));
  const n = qs.length, m = turns.length, NEG = -1e9;
  const dp = Array.from({ length: n }, () => Array(m).fill(NEG)), bk = Array.from({ length: n }, () => Array(m).fill(-1));
  dp[0][0] = cover(qb[0], turns[0].b);   // 最初の質問は一般質問の最初の発言
  for (let i = 1; i < n; i++) for (let j = 0; j < m; j++) {
    let best = NEG, arg = -1;
    for (let k = 0; k <= j; k++) if (dp[i - 1][k] > best) { best = dp[i - 1][k]; arg = k; }
    dp[i][j] = best + cover(qb[i], turns[j].b) - (arg === j ? 0.05 : 0);   // 同じ発言への重複は少しだけ不利に
    bk[i][j] = arg;
  }
  let j = dp[n - 1].indexOf(Math.max(...dp[n - 1]));
  const pick = Array(n);
  for (let i = n - 1; i >= 0; i--) { pick[i] = j; j = bk[i][j]; }
  const qturns = turns.map((t, k) => (t.kind === "q" ? k : -1)).filter((k) => k >= 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    let k = pick[i], sc = cover(qb[i], turns[k].b);
    if (qturns.length === n) { const k2 = qturns[i], sc2 = cover(qb[i], turns[k2].b); if (sc2 > sc) { k = k2; sc = sc2; } }
    if (i === 0 || sc >= TH) out.push([qs[i].q_num, turns[k].off]);
  }
  return out;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../public/data");
const SRC = process.env.BULLETIN_QUESTIONS_URL || (SITE.bulletin && SITE.bulletin.questions_url) || null;
const J = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

async function load() {
  if (!/^https?:/.test(SRC)) return JSON.parse(readFileSync(SRC, "utf8"));
  const r = await fetch(SRC);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function run() {
  if (!SRC) { console.log("site.config.json に bulletin.questions_url が無いため、議会だよりとの結びつけは行いません。"); return; }
  let dash;
  try { dash = await load(); }
  catch (e) { console.warn(`議会だよりの取得に失敗したため結びつけを省略します（${SRC}: ${e.message}）`); return; }
  const questions = dash.questions || [];
  const proc = J("proceedings.json"), gian = J("gian.json"), meetings = J("meetings.json");
  const pages = existsSync(join(DATA, "meeting_pages.json")) ? J("meeting_pages.json") : {};
  const ids = new Set(meetings.map((m) => m.id));
  const byPage = new Map(Object.entries(pages).map(([mid, url]) => [(url.match(/(\d{10})/) || [])[1], mid]));
  const nm = (s) => buildNormStr(s || "");
  const textBySid = new Map(readIndex(DATA).map((e) => [e.sid, e.text]));

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

  let linked = 0, aligned = 0;
  for (const [mid, { segments }] of Object.entries(proc)) {
    for (const s of segments) {
      if (s.kind !== "ippan") continue;
      s.topics = (s.topics || []).filter((t) => t.src !== "bulletin"); // 再実行しても重複しない
      delete s.qalign;
      const qs = (groups.get(mid + "|" + nm(s.member)) || []).sort((a, b) => a.q_num - b.q_num);
      if (!qs.length) continue;
      s.topics.push(...qs.map((q) => ({ n: q.q_num, title: q.title, theme: q.theme || null, src: "bulletin", issue: q.issue })));
      const qa = alignQuestions(s, qs, (sid) => textBySid.get(sid));
      if (qa.length) { s.qalign = qa; aligned += qa.length; }
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
  console.log(`  質問ごとの位置合わせ：${aligned} 問（確信度の低い質問は付けない）`);
  if (unmatched.length) console.log("  該当なし: " + unmatched.join(", "));
}
run();
