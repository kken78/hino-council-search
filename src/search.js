// クライアント側 正規化検索エンジン（AND / OR / NOT・表記ゆれ吸収・ハイライト）。
// 辞書はビルド時にバンドル（dict/*.json）。本文の正規化はロード時に行う。
import variants from "../dict/variants.json" with { type: "json" };
import synonymGroups from "../dict/synonyms.json" with { type: "json" };
import yomi from "../dict/yomi.json" with { type: "json" };
import { expandYear } from "../scripts/lib/eras.mjs";

const SKIP = /[\s　、，,・･\-－―ー~〜]/;
const normChar = (c) => (variants[c] ?? c).normalize("NFKC").toLowerCase();

export function buildNorm(str) {
  let norm = "";
  const map = [];
  for (let i = 0; i < str.length; i++) {
    if (SKIP.test(str[i])) continue;
    for (const cc of normChar(str[i])) {
      norm += cc;
      map.push(i);
    }
  }
  return { norm, map };
}
export function normTerm(t) {
  let r = "";
  for (const c of t) if (!SKIP.test(c)) r += normChar(c);
  return r;
}

// 発言者の区分（議員 / 当局 / 議長）を役職から判定
export function roleCat(e) {
  const r = e.role || "";
  if (/議長/.test(r)) return "議長";
  if (/^[0-9０-９]+番$/.test(r)) return "議員";
  if (r) return "当局";
  return "";
}

// 同義語インデックス（正規化キー → グループの全表現[正規化]）
const synIndex = new Map();
for (const grp of synonymGroups) {
  const normed = grp.map(normTerm);
  for (const k of normed) synIndex.set(k, normed);
}
// よみ → 漢字（正規化）
const yomiIndex = new Map();
for (const [k, v] of Object.entries(yomi)) yomiIndex.set(normTerm(k), normTerm(v));

// 1語をマッチ候補（正規化文字列の配列）へ展開
export function expandTerm(term) {
  const base = normTerm(term);
  const alts = new Set([base]);
  if (synIndex.has(base)) for (const a of synIndex.get(base)) alts.add(a);
  if (yomiIndex.has(base)) alts.add(yomiIndex.get(base));
  const y = expandYear(term);
  if (y) for (const t of y.terms) alts.add(normTerm(t));
  return [...alts].filter(Boolean);
}

// クエリ解析：OR で分割 → 各グループは AND（先頭 - / － は NOT）
export function parseQuery(q) {
  const orGroups = [];
  let cur = [];
  for (const tok of q.split(/\s+/).filter(Boolean)) {
    if (tok === "OR" || tok === "or" || tok === "｜" || tok === "|") {
      if (cur.length) orGroups.push(cur);
      cur = [];
      continue;
    }
    const neg = /^[-－]/.test(tok);
    const term = neg ? tok.slice(1) : tok;
    if (!term) continue;
    cur.push({ neg, term, alts: expandTerm(term) });
  }
  if (cur.length) orGroups.push(cur);
  return orGroups; // [[{neg,term,alts}...], ...]
}

const includesAny = (norm, alts) => alts.some((a) => a && norm.includes(a));

// 正規化情報をエントリにキャッシュ
function ensureNorm(e) {
  if (!e._n) e._n = buildNorm(e.text || "");
  return e._n;
}

// 1グループ(AND)に対するマッチ判定＋ヒット数
function matchGroup(norm, group) {
  let hits = 0;
  for (const t of group) {
    const found = includesAny(norm.norm, t.alts);
    if (t.neg) {
      if (found) return null; // 除外語に該当 → 不一致
    } else {
      if (!found) return null;
      // ヒット数（最初のaltの出現回数で近似）
      for (const a of t.alts) {
        if (!a) continue;
        let idx = norm.norm.indexOf(a), c = 0;
        while (idx !== -1) { c++; idx = norm.norm.indexOf(a, idx + a.length); }
        if (c) { hits += c; break; }
      }
    }
  }
  return hits;
}

// ハイライト用：マッチした原文の範囲を返す（マージ済み）
export function hitRanges(e, posAlts) {
  const { norm, map } = ensureNorm(e);
  const ranges = [];
  for (const a of posAlts) {
    if (!a) continue;
    let idx = norm.indexOf(a);
    while (idx !== -1) {
      const s = map[idx];
      const en = map[idx + a.length - 1] + 1;
      ranges.push([s, en]);
      idx = norm.indexOf(a, idx + a.length);
    }
  }
  ranges.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

// 検索本体。filters: {year, type, speaker, from, to}
export function search(index, query, filters = {}) {
  const groups = query.trim() ? parseQuery(query) : [];
  const posAlts = [...new Set(groups.flat().filter((t) => !t.neg).flatMap((t) => t.alts))];
  const results = [];
  const meetingSet = new Set();
  let totalHits = 0;

  for (const e of index) {
    if (filters.year && String(e.year) !== String(filters.year)) continue;
    if (filters.type && e.type !== filters.type) continue;
    if (filters.meeting && e.meetingId !== filters.meeting) continue;
    if (filters.role && roleCat(e) !== filters.role) continue;
    if (filters.speaker && !(e.name?.includes(filters.speaker) || e.role?.includes(filters.speaker))) continue;
    if (filters.from && (!e.date || e.date < filters.from)) continue;
    if (filters.to && (!e.date || e.date > filters.to)) continue;

    let score = 0;
    if (groups.length) {
      const norm = ensureNorm(e);
      let matched = false;
      for (const g of groups) {
        const h = matchGroup(norm, g);
        if (h !== null) { matched = true; score = Math.max(score, h); }
      }
      if (!matched) continue;
    }
    results.push({ ...e, _score: score });
    meetingSet.add(e.meetingId);
    totalHits += score;
  }
  return { results, meetingCount: meetingSet.size, hitCount: totalHits, posAlts };
}
