#!/usr/bin/env node
/**
 * hino-council-mcp.mjs — 日野町議会 議会だより×会議録 統合MCPサーバー
 *
 * 目的：
 *   過去の一般質問・答弁（議会だより 編集版）と、会議録（編集前・一問一答の全文）を
 *   横断参照できるツール群を MCP (Model Context Protocol) で提供する。
 *   質問・答弁の「下書き支援」を、必ず過去の実データと出典に接地させて行うための基盤。
 *
 * データソース（起動時に取得・ローカルにキャッシュ）：
 *   - council-dashboard  : docs/data/questions.json（議会だより #24〜 の問・答、出典URL付き）
 *   - hino-council-search: public/data/{meetings,gian}.json と発言索引
 *                          （index-manifest.json＋index/<年>.json。分割前のデータなら index.json）
 *                          public/data/{proceedings,meeting_pages}.json（審議構造・会議ページ対応。任意：無ければ従来の推定で動く）
 *
 * 使い方（Claude Desktop の claude_desktop_config.json）:
 *   {
 *     "mcpServers": {
 *       "hino-council": {
 *         "command": "node",
 *         "args": ["/絶対パス/hino-council-mcp.mjs"]
 *       }
 *     }
 *   }
 *   ※ args のパスはこのファイルの絶対パスに置き換える。
 *   Claude Code なら: claude mcp add hino-council -- node /絶対パス/hino-council-mcp.mjs
 *
 * 環境変数（すべて任意）:
 *   HINO_MCP_CACHE           キャッシュ置き場（既定: ~/.cache/hino-council-mcp）
 *   HINO_MCP_MAX_AGE_HOURS   キャッシュ有効時間（既定: 24）
 *   DASHBOARD_QUESTIONS_URL  questions.json のURL（既定: GitHub raw main）
 *   SEARCH_DATA_BASE         hino-council-search の public/data ベースURL（既定: GitHub raw main）
 *
 * フォーク運用（他自治体）:
 *   上記2つのURLを差し替えれば他自治体データでもそのまま動く（データ形式が同一であること）。
 *   提供中データの自治体・出典は起動時に実データから読み取り instructions で自己申告する。
 *   2つのURLの整合（同一自治体か）も起動時に検査し、不一致なら警告のうえ横断参照を無効化する。
 *
 * 要 Node.js 18+（fetch 内蔵）。外部依存なし。
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

// ---------------------------------------------------------------- 設定

const DASH_URL =
  process.env.DASHBOARD_QUESTIONS_URL ||
  "https://raw.githubusercontent.com/kken78/council-dashboard/main/docs/data/questions.json";
const SEARCH_BASE =
  process.env.SEARCH_DATA_BASE ||
  "https://raw.githubusercontent.com/kken78/hino-council-search/main/public/data";
const CACHE_DIR =
  process.env.HINO_MCP_CACHE || path.join(os.homedir(), ".cache", "hino-council-mcp");
const MAX_AGE_MS = Number(process.env.HINO_MCP_MAX_AGE_HOURS || 24) * 3600 * 1000;

const SERVER_INFO = { name: "hino-council-mcp", version: "0.4.2" };

// クライアント（Claude）への利用方針。冒頭のデータ自己申告は起動時に実データから生成する
// （council-dashboard はフォークで他自治体運用があるため、「日野町」をハードコードしない）。
let INSTRUCTIONS = "";
const POLICY_LINES = [
  "位置づけは「AIが質問・答弁を作る」ではなく「過去のやりとりに接地した下書き支援」です。次を必ず守ってください。",
  "・下書きや分析を出力するときは、参照した過去レコードの出典（議会だより第◯号／会議名・日付・原本PDFのURL）を必ず添える。",
  "・数値・固有名詞・制度の詳細は誤り（幻覚）や機械抽出ミスの可能性があるため、「事実関係は原本PDF・公式ページで要確認」と明示する。",
  "・議員を質問数などで序列化・採点する出力はしない（データ提供元の編集方針）。",
  "・議会だよりの記事は一問一答が要約で溶け込んでいる。やりとりの深さを見るときは find_minutes_for_bulletin → get_exchange で会議録の実際の応酬を参照する。",
  "・会議録コーパスは公開・取り込みが遅れるため、直近の会議が未収載のことがある（ツールが未収載と返したらその旨を正直に伝える）。",
  "・議案の審議の経過（提案説明・議案質疑・委員長報告・討論・採決結果）は get_bill_deliberation で取得できる。討論の賛否は討論した議員本人の表明であり、採決での各議員の賛否ではない（会議録に個々の賛否の記録は無い）。",
];

const log = (...a) => console.error("[hino-mcp]", ...a);

// ---------------------------------------------------------------- データ取得（キャッシュ付き）

async function loadJson(name, url) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, name);
  const fresh =
    fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < MAX_AGE_MS;
  if (fresh) {
    log(`cache hit: ${name}`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  try {
    log(`fetch: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const data = JSON.parse(text); // パースできてから書く
    fs.writeFileSync(file, text);
    return data;
  } catch (e) {
    if (fs.existsSync(file)) {
      log(`fetch失敗(${e.message})。古いキャッシュで続行: ${name}`);
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    throw new Error(`${name} を取得できません（${e.message}）。ネットワーク接続を確認してください。`);
  }
}

/**
 * 発言索引。年別分割（index-manifest.json＋index/<年>.json）を優先し、無ければ分割前の index.json。
 * 目録の順に連結すると、分割前と同じ並び（＝発言順）になる。
 */
async function loadIndex() {
  const man = await loadOptional("index-manifest.json", `${SEARCH_BASE}/index-manifest.json`, "分割前の index.json を読みます。");
  if (man && Array.isArray(man.shards)) {
    const parts = await Promise.all(
      man.shards.map((sh) => loadJson(`index__${sh.year ?? "unknown"}.json`, `${SEARCH_BASE}/${sh.file}`))
    );
    return parts.flat();
  }
  return loadJson("index.json", `${SEARCH_BASE}/index.json`);
}

/** 任意データ（無くても動く）。取得できずキャッシュも無ければ null */
async function loadOptional(name, url, fallbackNote = "従来の推定で動作します。") {
  try { return await loadJson(name, url); }
  catch (e) { log(`任意データ ${name} なし（${e.message}）。${fallbackNote}`); return null; }
}

// ---------------------------------------------------------------- 正規化（NFKC＋空白除去＋異体字）

const VARIANTS = {
  "髙": "高", "﨑": "崎", "濵": "浜", "濱": "浜",
  "邊": "辺", "邉": "辺", "齋": "斎", "齊": "斎", "眞": "真",
};

/** 正規化文字列と、正規化後の各文字→元文字列インデックスの対応表を返す */
function normMap(s) {
  const out = [];
  const map = [];
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) {
    const nf = str[i].normalize("NFKC");
    for (const ch of nf) {
      const lc = ch.toLowerCase();
      if (/\s/.test(lc)) continue;
      out.push(VARIANTS[lc] || lc);
      map.push(i);
    }
  }
  return { n: out.join(""), map };
}
const norm = (s) => normMap(s).n;

/** クエリ解析：空白区切りAND、先頭 - はNOT */
function parseQuery(q) {
  const and = [], not = [];
  for (const t of String(q || "").split(/\s+/).filter(Boolean)) {
    if (t.startsWith("-") && t.length > 1) not.push(norm(t.slice(1)));
    else and.push(norm(t));
  }
  return { and, not };
}
const hits = (nText, { and, not }) =>
  and.length > 0 && and.every((t) => nText.includes(t)) && !not.some((t) => nText.includes(t));

/** 正規化テキスト上のマッチ位置から、元テキストの抜粋を作る */
function snippet(raw, nm, terms, width = 90) {
  let pos = -1;
  for (const t of terms) {
    pos = nm.n.indexOf(t);
    if (pos >= 0) break;
  }
  if (pos < 0) return String(raw || "").slice(0, width * 2);
  const start = nm.map[Math.max(0, pos - width)] ?? 0;
  const end = nm.map[Math.min(nm.map.length - 1, pos + width)] ?? raw.length;
  return (start > 0 ? "…" : "") + raw.slice(start, end + 1) + (end + 1 < raw.length ? "…" : "");
}

// ---------------------------------------------------------------- データロードと前処理

let DASH;      // questions.json 全体
let Q = [];    // 質問レコード配列（前処理済み）
let MEETINGS;  // meetings.json
let IDX = [];  // index.json（発言。前処理済み）
let GIAN;      // gian.json
let PROC = null; // proceedings.json（審議構造・任意）
let PAGES = null; // meeting_pages.json（会議録ID→案内ページURL・任意）
let SEGS = new Map(); // 会議ID → 場面の配列（_a/_b は IDX の位置）
let META = {}; // 集計メタ

const SCENE = { ippan: "一般質問", shitsugi: "議案質疑", report: "委員長報告", debate: "討論", proposal: "提案説明", vote: "採決" };
const toHalf = (s) => String(s || "").replace(/[０-９]/g, (d) => "０１２３４５６７８９".indexOf(d));
/** 「議第105号」「議第１０５」「105」などを議案キー「議第105号」へ */
function normBill(b) {
  const t = toHalf(String(b || "").replace(/\s/g, ""));
  const m = t.match(/^(決議案|議案|請願|発議|陳情|議|報|選|諮)?第?(\d+)号?$/);
  return m ? `${m[1] || "議"}第${m[2]}号` : t;
}

async function boot() {
  const [dash, meetings, idx, gian, proc, pages] = await Promise.all([
    loadJson("questions.json", DASH_URL),
    loadJson("meetings.json", `${SEARCH_BASE}/meetings.json`),
    loadIndex(),
    loadJson("gian.json", `${SEARCH_BASE}/gian.json`),
    loadOptional("proceedings.json", `${SEARCH_BASE}/proceedings.json`),
    loadOptional("meeting_pages.json", `${SEARCH_BASE}/meeting_pages.json`),
  ]);
  DASH = dash;
  MEETINGS = meetings;
  GIAN = gian;
  PROC = proc;
  PAGES = pages;
  const meetingIds = new Set(MEETINGS.map((m) => m.id));
  // 議会だよりの minutes が「本会議のご案内」ページIDの場合（例: 35号）は meeting_pages.json を逆引き
  const byPage = new Map(Object.entries(PAGES || {}).map(([mid, url]) => [(String(url).match(/(\d{10})/) || [])[1], mid]));
  const resolveMeeting = (raw) => (raw && !meetingIds.has(raw) && byPage.has(raw) ? byPage.get(raw) : raw);

  Q = (dash.questions || []).map((r, i) => {
    const answersText = (r.answers || []).map((a) => `${a.label}:${a.text}`).join("／");
    const blob = [r.title, r.question_text, r.answer_title, answersText, (r.other || []).join("／")].join("\n");
    const mid = (r.minutes || "").match(/(\d{10})/);
    return {
      ...r,
      _i: i,
      id: `${r.issue}/${norm(r.member)}/${r.q_num}`,
      _nMember: norm(r.member),
      _nBlob: normMap(blob),
      _blob: blob,
      _meetingId: mid ? resolveMeeting(mid[1]) : null,
    };
  });

  IDX = idx.map((e, i) => ({ ...e, _i: i, _nName: norm(e.name), _nm: normMap(e.text) }));

  // 審議構造：場面の範囲を IDX の位置に変換し、議長以外の発言に場面（_scene）を付ける
  if (PROC) {
    const posOf = new Map(IDX.map((e, i) => [e.sid, i]));
    for (const [mid, { segments }] of Object.entries(PROC)) {
      const list = [];
      for (const sg of segments || []) {
        if (sg.kind === "vote") { const k = posOf.get(sg.sid); if (k != null) list.push({ ...sg, _a: k, _b: k }); continue; }
        const a = posOf.get(sg.from), b = posOf.get(sg.to);
        if (a == null || b == null) continue;
        const seg = { ...sg, _a: a, _b: b, _nMember: norm(sg.member) };
        list.push(seg);
        for (let k = a; k <= b; k++) if (!/議長$/.test(IDX[k].role || "")) IDX[k]._scene = sg.kind;
      }
      SEGS.set(mid, list);
    }
  }

  const themes = [];
  for (const r of Q) if (r.theme && !themes.includes(r.theme)) themes.push(r.theme);
  const members = [];
  for (const r of Q) if (!members.some((m) => m.n === r._nMember)) members.push({ name: r.member, n: r._nMember });
  META = { themes, members, meetingIds };

  // ---- データソースの自己申告と整合性チェック（フォーク混同対策） ----
  const domainOf = (u) => { try { return new URL(u).hostname; } catch { return null; } };
  const dashDomains = [...new Set(Q.map((r) => domainOf(r.minutes)).filter(Boolean))];
  const minDomains = [...new Set(MEETINGS.map((m) => domainOf(m.url)).filter(Boolean))];
  const withId = Q.filter((r) => r._meetingId).length;
  const linked = Q.filter((r) => r._meetingId && META.meetingIds.has(r._meetingId)).length;
  META.mismatch =
    (withId > 0 && linked === 0) ||
    (dashDomains.length > 0 && minDomains.length > 0 && !dashDomains.some((d) => minDomains.includes(d)));

  const srcLine =
    `このサーバーが現在提供しているデータ: (1) 議会だより一般質問 ${Q.length}件＝出典「${dash.source || "出典情報なし"}」 ` +
    `/ (2) 会議録コーパス ${MEETINGS.length}会議・${IDX.length}発言＝${minDomains.join(", ") || "取得元ドメイン不明"}。` +
    "類似ダッシュボードは他自治体でも運用されているため、回答時は上記の自治体・出典を前提とし、別自治体のデータと混同しないこと。";
  const warnLine = META.mismatch
    ? "【警告】議会だより側と会議録側で会議ID・ドメインが一致しません。両データソースが別自治体を指している可能性があります。この旨を利用者に必ず伝え、横断参照（find_minutes_for_bulletin など）の結果は使わないでください。"
    : null;
  INSTRUCTIONS = [srcLine, ...(warnLine ? [warnLine] : []), ...POLICY_LINES].join("\n");
  if (warnLine) log("警告: データソースの整合性チェックに失敗（別自治体の可能性）。dash=" + dashDomains + " minutes=" + minDomains);

  log(`loaded: 議会だより ${Q.length}件 / 会議 ${MEETINGS.length} / 発言 ${IDX.length} / だより→会議録リンク成立 ${linked}/${withId} / 審議構造 ${PROC ? SEGS.size + "会議" : "なし（推定で動作）"}`);
}

// ---------------------------------------------------------------- ヘルパー

// 会議の要約。dates は PDF に記された日付の一覧（日付の無い PDF しか無い臨時会などでは空）。
// date は会議の日付：meetings.json の date（v0.4.2〜。日付のある PDF のうち最も早い日、無ければ会議名の
// 「（M月D日）」から求めた日）を使い、dateFrom はその出どころ（"pdf"・"name"）。date の無いデータ（古い版・
// フォーク先）では dates の最も早い日を date とし dateFrom を "pdf" にする。dates も空ならどちらも null。
function meetingSummary(m) {
  const dates = [...new Set((m.pdfs || []).map((p) => p.date).filter(Boolean))].sort();
  let date = null, dateFrom = null;
  if (m.date) [date, dateFrom] = [m.date, m.dateFrom || null];
  else if (dates.length) [date, dateFrom] = [dates[0], "pdf"];
  return { meetingId: m.id, name: m.name, type: m.type, year: m.year, dates, date, dateFrom, url: m.url };
}

function findBulletin(id) {
  const nid = String(id || "").trim();
  let r = Q.find((x) => x.id === nid);
  if (!r) {
    // "24/野矢貴之/1" 形式のゆるい解釈（空白・異体字ゆれ許容）
    const m = nid.match(/^(\d+)\/(.+)\/(\d+)$/);
    if (m) r = Q.find((x) => x.issue === Number(m[1]) && x._nMember === norm(m[2]) && x.q_num === Number(m[3]));
  }
  return r;
}

function bulletinHit(r) {
  return {
    id: r.id,
    issue: r.issue,
    pub_date: r.pub_date,
    member: r.member,
    theme: r.theme,
    title: r.title,
    answer_title: r.answer_title,
    published: r.published,
  };
}

/**
 * ある会議での議員の発言を、日（PDF）ごと＋連続性でブロック化する。
 * 一般質問中は「議長→答弁→議長→本人」の周期で本人発言の間隔が小さい（実測でほぼ4）。
 * 間隔が GAP を超えたら別ブロック（別議題）とみなす。ヒューリスティックである旨は出力にも明記。
 */
const GAP = 12;
// 場面内の各発言のターン種別（質問・再質問・答弁）。turns は [from の sid 連番からの相対位置, 種別, 問番号]
function turnKinds(sg) {
  const m = new Map();
  if (!sg.turns || !sg.from) return m;
  const pre = sg.from.slice(0, -4), f0 = parseInt(sg.from.slice(-4), 10);
  const label = { q: "質問", rq: "再質問", a: "答弁", s: "発言" };
  const sid = (off) => pre + String(f0 + off).padStart(4, "0");
  // 議会だよりの全質問の位置（qalign）が分かっていれば、その番号で質問／再質問を付け直す（会議録だけの判定より正確）
  const nb = (sg.topics || []).filter((t) => t.src === "bulletin").length;
  if (sg.qalign && nb && sg.qalign.length === nb) {
    const at = new Map();
    for (const [n, off] of sg.qalign) (at.get(off) || at.set(off, []).get(off)).push(n);
    let cur = null;
    for (const [off, t] of sg.turns) {
      if (t === "a") { m.set(sid(off), { turn: "答弁", ...(cur ? { bulletin_question: cur } : {}) }); continue; }
      if (t !== "q" && t !== "rq") continue;
      if (at.has(off)) { cur = at.get(off); m.set(sid(off), { turn: "質問", bulletin_question: cur }); }
      else m.set(sid(off), { turn: "再質問", ...(cur ? { bulletin_question: cur } : {}) });
    }
    return m;
  }
  for (const [off, t, n] of sg.turns) m.set(sid(off), { turn: label[t] || t, ...(n ? { question_no: n } : {}) });
  return m;
}
function memberBlocks(meetingId, nMember) {
  // 審議構造があれば、会議録の議長の進行から切り出した実際の範囲を使う（推定ではない）
  const segs = (SEGS.get(meetingId) || []).filter((sg) => sg.kind !== "vote" && sg._nMember === nMember);
  if (segs.length) {
    return segs.map((sg, i) => {
      const entries = IDX.slice(sg._a, sg._b + 1);
      return {
        block: i,
        scene: SCENE[sg.kind],
        date: sg.date,
        pdf: entries[0].pdf,
        speeches: entries.length,
        member_speeches: entries.filter((e) => e._nName === nMember).length,
        first_sid: sg.from,
        ...(sg.style ? { style: sg.style } : {}),
        ...(sg.bills && sg.bills.length ? { bills: sg.bills } : {}),
        ...(sg.stance ? { stance: sg.stance } : {}),
        ...(sg.committee ? { committee: sg.committee } : {}),
        ...(sg.topics && sg.topics.length ? { topics: sg.topics.map(({ n, title, theme, src }) => ({ n, title, theme, src: src === "bulletin" ? "議会だより" : "会議録の答弁から推定" })) } : {}),
        preview: (entries.find((e) => e._nName === nMember)?.text || "").slice(0, 80),
        _entries: entries,
        _seg: sg,
      };
    });
  }
  const inMeeting = IDX.filter((e) => e.meetingId === meetingId);
  const byPdf = new Map();
  for (const e of inMeeting) {
    if (!byPdf.has(e.pdf)) byPdf.set(e.pdf, []);
    byPdf.get(e.pdf).push(e);
  }
  const blocks = [];
  for (const [pdf, list] of byPdf) {
    const mine = list.map((e, k) => ({ e, k })).filter((x) => x.e._nName === nMember);
    if (!mine.length) continue;
    let start = mine[0].k, prev = mine[0].k;
    const flush = (endK) => {
      // 末尾の答弁を拾うため、次の別議員（◯番）が現れる直前まで最大3発言延長
      let end = endK;
      for (let k = endK + 1; k <= Math.min(list.length - 1, endK + 3); k++) {
        const e = list[k];
        if (/^\d+番$/.test(e.role || "") && e._nName !== nMember) break;
        end = k;
      }
      blocks.push({ pdf, date: list[start].date, entries: list.slice(start, end + 1) });
    };
    for (let j = 1; j < mine.length; j++) {
      if (mine[j].k - prev > GAP) {
        flush(prev);
        start = mine[j].k;
      }
      prev = mine[j].k;
    }
    flush(prev);
  }
  blocks.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return blocks.map((b, i) => ({
    block: i,
    date: b.date,
    pdf: b.pdf,
    speeches: b.entries.length,
    member_speeches: b.entries.filter((e) => e._nName === nMember).length,
    first_sid: b.entries[0].sid,
    preview: (b.entries.find((e) => e._nName === nMember)?.text || "").slice(0, 80),
    _entries: b.entries,
  }));
}

const NOTE_VERIFY = "※検索・区切りは機械処理です。事実関係・正確な文言は必ず原本PDFで確認してください。";

// ---------------------------------------------------------------- ツール定義

const TOOLS = [
  {
    name: "list_themes",
    description: "議会だよりダッシュボードのテーマ分類一覧（件数付き）。順序はデータ定義順であり優劣ではない。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => ({
      themes: META.themes.map((t) => ({ theme: t, questions: Q.filter((r) => r.theme === t).length })),
      note: "件数はテーマの記録数であり、評価ではありません。",
    }),
  },
  {
    name: "list_members",
    description: "一般質問の記録がある議員の一覧（議会だより初出順）。編集方針により質問数による議員の序列付けは行わない。会議録には町長・各課長など答弁側の発言者も収録されており、search_speeches の speaker には誰でも指定できる。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => ({ members: META.members.map((m) => m.name) }),
  },
  {
    name: "search_bulletin",
    description: "議会だより掲載の一般質問（編集版）をキーワード検索する。空白区切りはAND、先頭 - はNOT。ヒットの全文は get_bulletin_question で取得。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索語（例: '防災 備蓄' '通学路 -スクールバス'）" },
        theme: { type: "string", description: "テーマで絞り込み（list_themes 参照）" },
        member: { type: "string", description: "議員名で絞り込み" },
        issue: { type: "integer", description: "議会だより号数で絞り込み" },
        limit: { type: "integer", description: "最大件数（既定10）" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: ({ query, theme, member, issue, limit = 10 }) => {
      const pq = parseQuery(query);
      const nMember = member ? norm(member) : null;
      const found = Q.filter(
        (r) =>
          (!theme || r.theme === theme) &&
          (!nMember || r._nMember === nMember) &&
          (!issue || r.issue === issue) &&
          hits(r._nBlob.n, pq)
      );
      return {
        total: found.length,
        results: found.slice(0, limit).map((r) => ({
          ...bulletinHit(r),
          snippet: snippet(r._blob, r._nBlob, pq.and),
        })),
        note: found.length ? undefined : "0件。語を短くする・同義語（例: 通学路/スクールゾーン）を試すと見つかることがあります。",
      };
    },
  },
  {
    name: "get_bulletin_question",
    description: "議会だよりの一般質問1件の全文（質問文・回答者ラベル付き答弁・出典URL）を取得する。id は search_bulletin の結果の id（形式: 号/議員名/質問番号）。",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "例: '24/野矢貴之/1'" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: ({ id }) => {
      const r = findBulletin(id);
      if (!r) return { error: `id '${id}' が見つかりません。search_bulletin の結果の id を使ってください。` };
      return {
        ...bulletinHit(r),
        question_text: r.question_text,
        answers: r.answers,
        other: r.other,
        sources: { bulletin_pdf: r.bulletin, minutes_page: r.minutes, video: r.video },
        note:
          (r.published ? "" : "この質問は議会だより誌面には掲載されていません（記録のみ）。") +
          "議会だよりは編集版です。一問一答の実際のやりとりは find_minutes_for_bulletin → get_exchange で会議録を参照してください。",
      };
    },
  },
  {
    name: "find_minutes_for_bulletin",
    description: "議会だよりの一般質問1件から、対応する会議録（編集前・一問一答の全文）の該当ブロックを探す。議会だよりでは要約で溶け込んでいる再質問・応酬の深さを見るための入口。",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "search_bulletin の結果の id" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: ({ id }) => {
      const r = findBulletin(id);
      if (!r) return { error: `id '${id}' が見つかりません。` };
      if (META.mismatch)
        return { error: "議会だより側と会議録側のデータソースが別自治体の可能性があるため（起動時チェック不一致）、横断参照は無効化しています。環境変数 DASHBOARD_QUESTIONS_URL と SEARCH_DATA_BASE が同じ自治体を指しているか確認してください。" };
      if (!r._meetingId) return { error: "このレコードには会議録ページのURLが登録されていません。" };
      if (!META.meetingIds.has(r._meetingId)) {
        return {
          meetingId: r._meetingId,
          minutes_page: r.minutes,
          status: "会議録コーパス未収載",
          note: "会議録の公開・取り込みは議会だよりより遅れるため、この会議はまだ検索コーパスに入っていません。町公式ページ（minutes_page）で原本を確認してください。",
        };
      }
      const m = MEETINGS.find((x) => x.id === r._meetingId);
      const blocks = memberBlocks(r._meetingId, r._nMember);
      return {
        bulletin: bulletinHit(r),
        meeting: meetingSummary(m),
        member_blocks: blocks.map(({ _entries, _seg, ...b }) => b),
        note:
          (blocks[0] && blocks[0].scene
            ? "block はこの会議での同議員の発言のまとまり（会議録の議長の進行から抽出。scene が一般質問のものが議会だよりに対応）。get_exchange(meetingId, member, block) で本文を取得してください。"
            : "block はこの会議での同議員の発言まとまり（日付・連続性による機械推定）。一般質問のほか議案質疑・討論の場合もあるため preview で見当をつけ、get_exchange(meetingId, member, block) で本文を取得してください。") +
          NOTE_VERIFY,
      };
    },
  },
  {
    name: "list_meetings",
    description: "会議録コーパスに収載済みの会議一覧（年・種別で絞り込み可）。各会議の date は会議の日付（日付のある原本PDFのうち最も早い日。PDFに日付が無い会議は会議名の「（M月D日）」から求めた日）、dateFrom はその出どころ（\"pdf\" または \"name\"）。dates は原本PDFに記された日付の一覧で、古い臨時会などでは空のことがある。他のツールが返す meeting も同じ形。",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer", description: "西暦年" },
        type: { type: "string", description: "'定例会' または '臨時会'" },
      },
      additionalProperties: false,
    },
    handler: ({ year, type } = {}) => ({
      total: MEETINGS.filter((m) => (!year || m.year === year) && (!type || m.type === type)).length,
      meetings: MEETINGS.filter((m) => (!year || m.year === year) && (!type || m.type === type)).map(meetingSummary),
    }),
  },
  {
    name: "search_speeches",
    description: "会議録の発言（{SPEECHES}件・編集前全文）をキーワード検索する。空白区切りAND、先頭 - はNOT。答弁例を探すときは speaker に '町長' 等の役職名を role に入れるか、氏名を speaker に指定する。scene で場面（一般質問・議案質疑・委員長報告・討論・提案説明）に絞り込める。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索語" },
        speaker: { type: "string", description: "発言者名で絞り込み（議員・町長・課長など誰でも）" },
        role: { type: "string", description: "肩書で絞り込み（例: 町長, 教育長, ◯番）" },
        meetingId: { type: "string", description: "会議IDで絞り込み" },
        year: { type: "integer", description: "西暦年で絞り込み" },
        scene: { type: "string", enum: ["一般質問", "議案質疑", "委員長報告", "討論", "提案説明"], description: "場面で絞り込み（審議構造データがある場合）" },
        limit: { type: "integer", description: "最大件数（既定10）" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: ({ query, speaker, role, meetingId, year, scene, limit = 10 }) => {
      if (scene && !PROC) return { error: "審議構造データ（proceedings.json）が無いため scene では絞り込めません。scene を外して検索してください。" };
      const sceneKey = scene ? Object.keys(SCENE).find((k) => SCENE[k] === scene) : null;
      const pq = parseQuery(query);
      const nSpeaker = speaker ? norm(speaker) : null;
      const nRole = role ? norm(role) : null;
      const found = [];
      for (const e of IDX) {
        if (meetingId && e.meetingId !== meetingId) continue;
        if (year && e.year !== year) continue;
        if (nSpeaker && e._nName !== nSpeaker) continue;
        if (nRole && norm(e.role) !== nRole) continue;
        if (sceneKey && e._scene !== sceneKey) continue;
        if (!hits(e._nm.n, pq)) continue;
        found.push(e);
      }
      found.sort((a, b) => String(b.date).localeCompare(String(a.date))); // 新しい順
      return {
        total: found.length,
        results: found.slice(0, limit).map((e) => ({
          sid: e.sid,
          meeting: e.meeting,
          date: e.date,
          role: e.role,
          name: e.name,
          agendaRef: e.agendaRef,
          ...(e._scene ? { scene: SCENE[e._scene] } : {}),
          snippet: snippet(e.text, e._nm, pq.and),
          pdf: e.pdf,
        })),
        note: NOTE_VERIFY,
      };
    },
  },
  {
    name: "get_speech",
    description: "発言1件の全文と、その前後の発言（一問一答の流れ）を取得する。sid は search_speeches の結果から。",
    inputSchema: {
      type: "object",
      properties: {
        sid: { type: "string" },
        before: { type: "integer", description: "前に何発言含めるか（既定2）" },
        after: { type: "integer", description: "後に何発言含めるか（既定2）" },
      },
      required: ["sid"],
      additionalProperties: false,
    },
    handler: ({ sid, before = 2, after = 2 }) => {
      const i = IDX.findIndex((e) => e.sid === sid);
      if (i < 0) return { error: `sid '${sid}' が見つかりません。` };
      const c = IDX[i];
      const ctx = [];
      for (let k = Math.max(0, i - before); k <= Math.min(IDX.length - 1, i + after); k++) {
        const e = IDX[k];
        if (e.pdf !== c.pdf) continue; // 同じ日のPDF内に限定
        ctx.push({
          sid: e.sid,
          role: e.role,
          name: e.name,
          text: k === i ? e.text : e.text.slice(0, 400) + (e.text.length > 400 ? "…" : ""),
          focus: k === i || undefined,
        });
      }
      return {
        meeting: c.meeting,
        date: c.date,
        pdf: c.pdf,
        context: ctx,
        note: NOTE_VERIFY,
      };
    },
  },
  {
    name: "get_exchange",
    description: "ある会議での議員の一般質問のやりとり（本人の質問・再質問と当局答弁の応酬）を、会議録からまとめて取得する。長い場合は offset で続きを取得。事前に find_minutes_for_bulletin か本ツールの block 一覧で対象ブロックを確認するとよい。",
    inputSchema: {
      type: "object",
      properties: {
        meetingId: { type: "string" },
        member: { type: "string", description: "議員名" },
        block: { type: "integer", description: "ブロック番号（省略時: ブロックが1つならその本文、複数なら一覧を返す）" },
        offset: { type: "integer", description: "発言オフセット（続きの取得用。既定0）" },
        max_chars: { type: "integer", description: "本文の最大文字数（既定12000）" },
      },
      required: ["meetingId", "member"],
      additionalProperties: false,
    },
    handler: ({ meetingId, member, block, offset = 0, max_chars = 12000 }) => {
      if (!META.meetingIds.has(meetingId)) return { error: `会議ID '${meetingId}' はコーパスに未収載です。list_meetings で確認してください。` };
      const blocks = memberBlocks(meetingId, norm(member));
      if (!blocks.length) return { error: `会議 ${meetingId} に ${member} の発言が見つかりません（氏名表記や list_members を確認）。` };
      if (block == null && blocks.length > 1) {
        return {
          meeting: meetingSummary(MEETINGS.find((m) => m.id === meetingId)),
          member,
          member_blocks: blocks.map(({ _entries, _seg, ...b }) => b),
          note: blocks[0].scene
            ? "ブロックが複数あります（一般質問・議案質疑・討論など場面ごと）。scene を見て block 番号を指定してください。"
            : "ブロックが複数あります。block 番号を指定して再取得してください（一般質問は通常、member_speeches が多いブロック）。",
        };
      }
      const b = blocks[block ?? 0];
      if (!b) return { error: `block ${block} は存在しません（0〜${blocks.length - 1}）。` };
      const out = [];
      let used = 0;
      let k = offset;
      const tk = b._seg ? turnKinds(b._seg) : new Map();
      for (; k < b._entries.length; k++) {
        const e = b._entries[k];
        if (used + e.text.length > max_chars && out.length > 0) break;
        const t = tk.get(e.sid) || (b._seg && /議長$/.test(e.role || "") ? { turn: "議長（進行）" } : {});
        out.push({ ...t, role: e.role, name: e.name, text: e.text });
        used += e.text.length;
      }
      return {
        meeting: b._entries[0].meeting,
        date: b.date,
        pdf: b.pdf,
        block: b.block,
        ...(b.scene ? { scene: b.scene } : {}),
        ...(b.style ? { style: b.style } : {}),
        ...(b.topics ? { topics: b.topics } : {}),
        total_speeches: b._entries.length,
        returned: { from: offset, to: k - 1 },
        truncated: k < b._entries.length ? { next_offset: k } : undefined,
        exchange: out,
        note: (b._seg ? "範囲とターン種別（質問・再質問・答弁）は会議録の議長の進行から機械抽出したものです。" : "ブロック区切りは機械推定のヒューリスティックです。") + NOTE_VERIFY,
      };
    },
  },
  {
    name: "get_meeting_agenda",
    description: "会議の議案一覧（議案番号・件名・区分）を取得する。件名は目次PDF由来。審議構造データがあれば採決結果（result）・採決方法（method）・付託委員会（committee）・別会議での採決（decidedIn）も含む。個々の議案の経過は get_bill_deliberation。",
    inputSchema: {
      type: "object",
      properties: { meetingId: { type: "string" } },
      required: ["meetingId"],
      additionalProperties: false,
    },
    handler: ({ meetingId }) => {
      const g = GIAN && GIAN[meetingId];
      const m = MEETINGS.find((x) => x.id === meetingId);
      if (!g && !m) return { error: `会議ID '${meetingId}' が見つかりません。` };
      const agenda = Array.isArray(g) ? g : g && g.agenda;
      return {
        meeting: m ? meetingSummary(m) : { meetingId },
        agenda: agenda || [],
        note: agenda && agenda.length ? NOTE_VERIFY : "この会議の議案データはありません。",
      };
    },
  },
  {
    name: "get_bill_deliberation",
    description: "議案1件の審議の経過（提案説明・議案質疑・委員長報告・討論・採決結果）を会議録から出典付きで取得する。議案番号は年（会期）ごとに振り直されるため meetingId と組で指定する（get_meeting_agenda で確認）。",
    inputSchema: {
      type: "object",
      properties: {
        meetingId: { type: "string" },
        bill: { type: "string", description: "議案番号（例: '議第105号'、'請願第8号'、'決議案第2号'）" },
        max_chars: { type: "integer", description: "各発言の抜粋の最大文字数（既定600）" },
      },
      required: ["meetingId", "bill"],
      additionalProperties: false,
    },
    handler: ({ meetingId, bill, max_chars = 600 }) => {
      if (!PROC) return { error: "審議構造データ（proceedings.json）が取得できないため利用できません。get_meeting_agenda と search_speeches を使ってください。" };
      if (!META.meetingIds.has(meetingId)) return { error: `会議ID '${meetingId}' はコーパスに未収載です。list_meetings で確認してください。` };
      const no = normBill(bill);
      const g = GIAN && GIAN[meetingId];
      const item = ((g && g.agenda) || []).find((a) => a.no === no);
      // 9月付託→12月採決の決算など、別会議で報告・採決されたものも含める
      const ids = [meetingId, ...(item && item.decidedIn && item.decidedIn !== meetingId ? [item.decidedIn] : [])];
      const excerpt = (e) => (e.text.length > max_chars ? e.text.slice(0, max_chars) + "…" : e.text);
      const steps = { 提案説明: [], 議案質疑: [], 委員長報告: [], 討論: [], 採決: [] };
      for (const id of ids) {
        const mName = (MEETINGS.find((m) => m.id === id) || {}).name;
        for (const sg of SEGS.get(id) || []) {
          if (!(sg.bills || []).includes(no) || !SCENE[sg.kind]) continue;
          if (id !== meetingId && !["report", "debate", "vote"].includes(sg.kind)) continue;
          const first = IDX[sg._a];
          const own = IDX.slice(sg._a, sg._b + 1).filter((e) => !/議長$/.test(e.role || ""));
          const base = { meeting: mName, date: sg.date, pdf: first.pdf, sid: sg.kind === "vote" ? sg.sid : sg.from };
          if (sg.kind === "vote") steps.採決.push({ ...base, result: sg.result, method: sg.method || undefined, basis: sg.basis || undefined, excerpt: excerpt(first), also_voted_together: sg.bills.length > 1 ? sg.bills.filter((b) => b !== no) : undefined });
          else if (sg.kind === "shitsugi") steps.議案質疑.push({ ...base, member: sg.member, seat: sg.seat || undefined, speeches: own.length, first_question: own[0] ? excerpt(own[0]) : undefined, note: "1回の質疑で複数議案に触れることが多い。全文は get_exchange(meetingId, member)。" });
          else steps[SCENE[sg.kind]].push({ ...base, member: sg.member, role: sg.role || sg.seat || undefined, committee: sg.committee || undefined, stance: sg.stance || undefined, excerpt: own[0] ? excerpt(own[0]) : undefined });
        }
      }
      const any = Object.values(steps).some((x) => x.length);
      return {
        meeting: meetingSummary(MEETINGS.find((m) => m.id === meetingId)),
        bill: item || { no },
        steps,
        note: (any ? "" : "この議案の審議の記録は会議録から抽出できませんでした（報告案件は採決を行いません）。") +
          "討論の stance は討論者本人の表明（反対／賛成）で、採決での各議員の賛否ではありません。" + NOTE_VERIFY,
      };
    },
  },
];

// ---------------------------------------------------------------- MCP プロトコル（stdio・改行区切りJSON-RPC 2.0）

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    reply(id, {
      protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
    });
    return;
  }
  if (method === "notifications/initialized" || method === "initialized") return;
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") {
    return reply(id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description: description.replace("{SPEECHES}", IDX.length.toLocaleString("en-US")), inputSchema })),
    });
  }
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return replyError(id, -32602, `unknown tool: ${params?.name}`);
    try {
      const result = tool.handler(params?.arguments || {});
      return reply(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 1) }],
        isError: result && result.error ? true : undefined,
      });
    } catch (e) {
      log(`tool error (${params?.name}):`, e.stack || e.message);
      return reply(id, {
        content: [{ type: "text", text: `ツール実行エラー: ${e.message}` }],
        isError: true,
      });
    }
  }
  if (id != null) replyError(id, -32601, `method not found: ${method}`);
}

// ---------------------------------------------------------------- 起動

boot()
  .then(() => {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on("line", (line) => {
      const s = line.trim();
      if (!s) return;
      let msg;
      try {
        msg = JSON.parse(s);
      } catch {
        return log("JSONではない入力を無視:", s.slice(0, 120));
      }
      try {
        handle(msg);
      } catch (e) {
        log("handle error:", e.stack || e.message);
        if (msg && msg.id != null) replyError(msg.id, -32603, e.message);
      }
    });
    rl.on("close", () => process.exit(0));
    log("ready (stdio)");
  })
  .catch((e) => {
    log("起動失敗:", e.message);
    process.exit(1);
  });
