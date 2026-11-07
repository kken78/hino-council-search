// check-ledger.mjs — 一般質問の台帳（data/ippan.tsv・data/ippan-chair.tsv）を、proceedings.json と発言索引に照らして検査する。
//   index.mjs の後に実行する（npm run check:ledger）。問題があれば件数と該当を出して終了コード 1。
//   台帳の無い一般質問の区切りは「下書き待ち」として件数を出す（エラーにはしない。npm run ledger:draft で下書きを作る）。
// 使い方: node scripts/check-ledger.mjs [--verbose]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readIndex } from "./lib/data.mjs";
import { readLedger, KINDS, ROUND_KINDS, STYLES, STYLE_SRC, TITLE_SRC, CONF, CHAIR_KINDS } from "./lib/ledger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../public/data");
const verbose = process.argv.includes("--verbose");

export function checkLedger(proc, index, ledger) {
  const errors = [];
  const err = (kind, msg) => errors.push({ kind, msg });
  const isSeat = (role) => /^[0-9０-９]+番$/.test(role || "");
  const isChair = (role) => /議長$/.test(role || "");
  // 会議録の氏名には互換漢字（U+F9DC の「隆」など）があるので、NFKC にそろえて比べる
  const sq = (s) => String(s || "").normalize("NFKC").replace(/[\s　]/g, "");
  const bySid = new Map(index.map((e) => [e.sid, e]));
  const dayOf = (sid) => sid.slice(0, -4);
  const seqOf = (sid) => parseInt(sid.slice(-4), 10);
  const inRange = (seg, sid) => dayOf(sid) === dayOf(seg.from) && seqOf(sid) >= seqOf(seg.from) && seqOf(sid) <= seqOf(seg.to);

  // 一般質問の区切り
  const segs = new Map();
  for (const p of Object.values(proc)) for (const s of p.segments) if (s.kind === "ippan") segs.set(s.from, s);
  const waiting = [...segs.values()].filter((s) => !ledger.byFrom.has(s.from));

  for (const [from, rows] of ledger.byFrom) {
    const seg = segs.get(from);
    if (!seg) { err("区切りが無い", `${from}（${rows[0].member}）：台帳の from が proceedings.json の一般質問の区切りにありません`); continue; }
    if (rows.some((r) => sq(r.member) !== sq(seg.member))) err("議員名", `${from}：台帳の議員名 ${rows[0].member} と区切りの議員名 ${seg.member} が違います`);
    if (rows.some((r) => r.date !== seg.date)) err("日付", `${from}：台帳の日付 ${rows[0].date} と区切りの日付 ${seg.date} が違います`);
    // 問番号は1から順に
    const ns = rows.map((r) => r.n);
    if (ns.some((n, i) => n !== i + 1)) err("問番号", `${from}：問番号が1から順になっていません（${ns.join(",")}）`);

    // 区切りの中の議員の発言と、turns の sid の集合
    const member = [];
    for (let q = seqOf(seg.from); q <= seqOf(seg.to); q++) {
      const sid = dayOf(seg.from) + String(q).padStart(4, "0");
      const e = bySid.get(sid);
      if (e && e.text && isSeat(e.role)) member.push(sid);
    }
    const inTurns = new Set(rows.flatMap((r) => r.turns.map(([sid]) => sid)));
    const missing = member.filter((sid) => !inTurns.has(sid));
    if (missing.length) err("発言の漏れ", `${from}：区切りの中の議員の発言 ${missing.length} 件が turns にありません（${missing.join("、")}）`);
    for (const sid of inTurns) {
      if (!inRange(seg, sid)) err("区切りの外", `${from}：${sid} は区切り（${seg.from}〜${seg.to}）の外です`);
      else if (!bySid.has(sid) || !isSeat(bySid.get(sid).role)) err("議員の発言でない", `${from}：${sid} は議員の発言ではありません`);
    }

    // 1つの sid が2つの行に出るときは、続いた2つの問いで、次の問いでは q、次の問いの start がその sid
    //   （前の問いの種類は req が多いが、rq・rrq のこともある。前の問いの再質問と次の問いの質問を同じ発言で言うとき）
    const rowsOf = new Map();
    for (const r of rows) for (const [sid, k] of r.turns) (rowsOf.get(sid) || rowsOf.set(sid, []).get(sid)).push([r, k]);
    for (const [sid, list] of rowsOf) {
      if (list.length === 1) continue;
      const ok = list.length === 2 && list[1][0].n === list[0][0].n + 1 && list[1][1] === "q" && list[1][0].start && list[1][0].start[0] === sid;
      if (!ok) err("2つの問いにまたがる発言", `${from}：${sid} が ${list.map(([r, k]) => `第${r.n}問 ${k}`).join("・")} に出ています（続いた2つの問いで、次の問いで q、次の問いの start がこの sid、の形でない）`);
    }

    for (const r of rows) {
      const at = `${from} 第${r.n}問（${r._line}行目）`;
      if (!STYLES.includes(r.style)) err("方式", `${at}：style「${r.style}」は決まりにありません`);
      if (r.style === "不明" ? r.style_src !== "" : !STYLE_SRC.includes(r.style_src)) err("方式の出どころ", `${at}：style「${r.style}」と style_src「${r.style_src}」の組が決まりにありません`);
      if (r.title ? !TITLE_SRC.includes(r.title_src) : r.title_src !== "") err("題の出どころ", `${at}：title「${r.title}」と title_src「${r.title_src}」の組が決まりにありません`);
      if (!CONF.includes(r.conf)) err("確信", `${at}：conf「${r.conf}」は決まりにありません`);
      if (!r.turns.length) err("turns", `${at}：turns が空です`);
      const sids = r.turns.map(([sid]) => sid);
      if (new Set(sids).size !== sids.length) err("turns", `${at}：turns に同じ sid が2回あります`);
      if (sids.some((sid, i) => i > 0 && sid <= sids[i - 1])) err("turns", `${at}：turns が発言の順になっていません`);
      for (const [sid, k] of r.turns) if (!KINDS.includes(k)) err("種類", `${at}：${sid} の種類「${k}」は決まりにありません`);
      if (r.start && !sids.includes(r.start[0])) err("start", `${at}：start ${r.start[0]} がこの行の turns にありません`);
      if (r.start && !(r.start[1] >= 1)) err("start", `${at}：start の段落の番号「${r.start[1]}」が1以上の数ではありません`);
      for (const [sid, p] of r.items) {
        if (!sids.includes(sid)) err("items", `${at}：items ${sid} がこの行の turns にありません`);
        if (!(p >= 1)) err("items", `${at}：items ${sid} の段落の番号「${p}」が1以上の数ではありません`);
      }
      if (r.style !== "一問一答" && r.items.length) err("items", `${at}：一問一答でないのに items があります`);
      if (r.style === "一問一答") { const bad = r.turns.filter(([, k]) => ROUND_KINDS.includes(k)); if (bad.length) err("一問一答の回", `${at}：一問一答なのに回の種類があります（${bad.map((x) => x.join(":")).join("、")}）`); }
    }
  }

  // 議長の注意
  for (const c of ledger.chair) {
    const at = `ippan-chair.tsv ${c._line}行目 ${c.sid}`;
    if (!CHAIR_KINDS.includes(c.kind)) err("議長の注意", `${at}：kind「${c.kind}」は決まりにありません`);
    const e = bySid.get(c.sid);
    if (!e || !isChair(e.role)) err("議長の注意", `${at}：議長の発言ではありません`);
    if (!ledger.byFrom.has(c.about)) err("議長の注意", `${at}：about ${c.about} が台帳の from にありません`);
    else if (dayOf(c.sid) !== dayOf(c.about)) err("議長の注意", `${at}：about ${c.about} と別の日の発言です`);
  }

  // 件数
  const rows = ledger.rows;
  const count = (f) => { const m = new Map(); for (const r of rows) m.set(f(r), (m.get(f(r)) || 0) + 1); return [...m]; };
  const stats = {
    segments: segs.size, ledgerSegments: ledger.byFrom.size, waiting: waiting.length, questions: rows.length,
    style: count((r) => r.style), titleSrc: count((r) => r.title_src || "（題なし）"), conf: count((r) => r.conf),
    chair: ledger.chair.length,
  };
  return { errors, waiting, stats };
}

function run() {
  const proc = JSON.parse(readFileSync(join(DATA, "proceedings.json"), "utf8"));
  const index = readIndex(DATA);
  const ledger = readLedger();
  const { errors, waiting, stats } = checkLedger(proc, index, ledger);
  const fmt = (list) => list.map(([k, n]) => `${k} ${n}`).join("・");
  console.log(`一般質問の区切り ${stats.segments}（台帳あり ${stats.ledgerSegments}・下書き待ち ${stats.waiting}）／問い ${stats.questions}`);
  console.log(`  方式：${fmt(stats.style)}`);
  console.log(`  題の出どころ：${fmt(stats.titleSrc)}`);
  console.log(`  確信：${fmt(stats.conf)}`);
  console.log(`  議長の注意：${stats.chair} 件`);
  if (waiting.length) {
    console.log(`下書き待ち：${waiting.length} 区切り（npm run ledger:draft で下書きを作る）`);
    if (verbose) for (const s of waiting) console.log(`  - ${s.from} ${s.member} ${s.date}`);
  }
  if (!errors.length) { console.log("検査：問題なし"); return; }
  const by = new Map();
  for (const e of errors) (by.get(e.kind) || by.set(e.kind, []).get(e.kind)).push(e.msg);
  console.log(`検査：問題 ${errors.length} 件（${[...by].map(([k, l]) => `${k} ${l.length}`).join("・")}）`);
  for (const [, list] of by) for (const m of list) console.log("  - " + m);
  process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run();
