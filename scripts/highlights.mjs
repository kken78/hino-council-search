// highlights.mjs — 「よく検索される語」を置き換える注目テーマを生成し public/data/highlights.json に出力。
//   raised   … 複数の議員が一般質問で取り上げているテーマ
//   official … 町（議案・当局答弁）が重点として扱っているテーマ
// テーマ候補は Claude で抽出（ANTHROPIC_API_KEY があるとき）。無ければ決定論フォールバック。
// 会議数・議員数などの定量シグナルは常に決定論で付与するため、reason は事実ベース。
//
// 使い方:
//   node scripts/highlights.mjs            … AIあり（要 ANTHROPIC_API_KEY）／無ければ自動でフォールバック
//   HINO_HL_NOAI=1 node scripts/highlights.mjs … AIを使わず決定論のみ
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildNormStr, normTerm } from "./lib/normalize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const R = (p) => readFileSync(join(root, p), "utf8");
const J = (p) => JSON.parse(R(p));

const MODEL = process.env.HINO_HL_MODEL || "claude-sonnet-4-6";
const TOP = Number(process.env.HINO_HL_TOP || 8);      // 各グループの表示件数
const NOAI = process.env.HINO_HL_NOAI === "1" || !process.env.ANTHROPIC_API_KEY;

const index = J("public/data/index.json");
const gian  = existsSync(join(root, "public/data/gian.json")) ? J("public/data/gian.json") : {};

// 役職判定（フロントの roleCat と同じ）
const roleCat = (e) => { const r = e.role || ""; if (/議長/.test(r)) return "議長"; if (/^[0-9０-９]+番$/.test(r)) return "議員"; if (r) return "当局"; return ""; };

// 事前正規化（照合を軽く）
for (const e of index) e._n = e.norm || buildNormStr(e.text || "");
const giinSpeeches = index.filter((e) => roleCat(e) === "議員");
const officSpeeches = index.filter((e) => roleCat(e) === "当局" || roleCat(e) === "議長");
const agendaTitles = Object.values(gian).flatMap((g) => (g.agenda || []).map((a) => a.title)).filter(Boolean);

// テーマ（terms 配列）を全文に対して採点する。
function score(terms) {
  const alts = [...new Set(terms.map(normTerm).filter(Boolean))];
  if (!alts.length) return null;
  const hit = (n) => alts.some((a) => n.includes(a));
  const meetings = new Set(), members = new Set();
  let officialHits = 0, agendaHits = 0;
  for (const e of giinSpeeches) if (hit(e._n)) { meetings.add(e.meetingId); if (e.name && e.name[0] !== "（") members.add(e.name); }
  for (const e of officSpeeches) if (hit(e._n)) officialHits++;
  for (const t of agendaTitles) if (hit(buildNormStr(t))) agendaHits++;
  return { meetings: meetings.size, members: members.size, officialHits, agendaHits };
}

// クエリ用：terms を最大4つの OR 検索式に。
const toQuery = (terms) => [...new Set(terms.map((t) => t.trim()).filter(Boolean))].slice(0, 4).join(" OR ");

// ---- テーマ候補の抽出 ----
async function extractThemesAI() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const ac = new Anthropic();

  // 議員の質問は冒頭でテーマが述べられることが多い→先頭を抜いて重複を圧縮（会議×議員で1件）
  const seen = new Set(), qs = [];
  for (const e of giinSpeeches) {
    const key = e.meetingId + "/" + e.name;
    if (seen.has(key)) continue; seen.add(key);
    const head = (e.text || "").replace(/\s+/g, " ").slice(0, 90);
    if (head.length > 8) qs.push(head);
  }
  const sampleQ = qs.slice(0, 500).join("\n");
  const sampleA = [...new Set(agendaTitles)].slice(0, 800).join("\n");

  const sys = "あなたは自治体議会の会議録を整理する編集者です。出力は指定のJSONのみ。前置き・説明・コードフェンスは一切禁止。";
  const user =
`日野町議会の会議録から「注目テーマ」を2種類抽出してください。
- raised: 複数の議員が一般質問で繰り返し取り上げているテーマ
- official: 町（議案・当局の答弁）が重点として扱っているテーマ
各テーマに、表示用の簡潔な label と、会議録本文を検索するための keywords（2〜5語・表記ゆれを含む日本語・固有名詞歓迎）を付けてください。
評価や賛否は書かず、テーマ名のみ。重複や粒度の粗すぎるもの（例:「予算」「質問」単独）は避ける。
JSONのみ出力: {"raised":[{"label":"...","keywords":["...","..."]}],"official":[{"label":"...","keywords":["..."]}]}

【議員の一般質問（冒頭抜粋・サンプル）】
${sampleQ}

【議案件名（サンプル）】
${sampleA}`;

  const msg = await ac.messages.create({
    model: MODEL, max_tokens: 2000, system: sys,
    messages: [{ role: "user", content: user }],
  });
  const raw = msg.content.map((c) => c.text || "").join("").trim().replace(/^```(json)?|```$/g, "").trim();
  const obj = JSON.parse(raw);
  return { raised: obj.raised || [], official: obj.official || [] };
}

// AIなしフォールバック：現行8語＋議案由来の語を候補にして、定量スコアで振り分ける。
function extractThemesFallback() {
  const seeds = ["補正予算", "一般質問", "入札", "介護", "子育て", "給食", "道路", "通年議会",
    "公共交通", "防災", "学校", "農業", "移住", "ふるさと納税", "医療", "高齢者", "観光", "環境"];
  const raised = seeds.map((s) => ({ label: s, keywords: [s] }));
  const official = [...new Set(agendaTitles)]
    .map((t) => t.replace(/（.*?）|については|について|の件|条例|工事請負契約/g, "").trim())
    .filter((t) => t.length >= 2 && t.length <= 12)
    .slice(0, 30).map((s) => ({ label: s, keywords: [s] }));
  return { raised, official };
}

// 全候補を1つのプールに統合し、議員の広がり（議員数）で採点・重複排除して単一リストに。
function buildThemes(candidates) {
  const out = [], used = new Set();
  for (const t of candidates) {
    const terms = (t.keywords && t.keywords.length ? t.keywords : [t.label]).filter(Boolean);
    const s = score(terms);
    if (!s || s.members === 0) continue;              // 本文と噛み合わないテーマは捨てる
    const label = (t.label || terms[0]).trim();
    if (used.has(label)) continue; used.add(label);
    out.push({ label, query: toQuery(terms), ...s });
  }
  out.sort((a, b) => b.members - a.members || b.meetings - a.meetings);
  return out.slice(0, TOP).map((x) => ({ label: x.label, query: x.query, reason: `${x.meetings}会議・${x.members}議員が取り上げ` }));
}

async function run() {
  let themes, source;
  if (NOAI) { themes = extractThemesFallback(); source = "fallback(no-ai)"; }
  else {
    try { themes = await extractThemesAI(); source = "ai:" + MODEL; }
    catch (e) { console.warn("AI抽出に失敗→フォールバック:", e.message); themes = extractThemesFallback(); source = "fallback(ai-error)"; }
  }
  const list = buildThemes([...(themes.raised || []), ...(themes.official || [])]);
  const result = {
    generatedAt: new Date().toISOString().slice(0, 10), source,
    label: "議会で議論になっているテーマ", themes: list,
  };
  writeFileSync(join(root, "public/data/highlights.json"), JSON.stringify(result, null, 2));
  console.log(`highlights.json: ${list.length} テーマ（source=${source}）`);
}
run();
