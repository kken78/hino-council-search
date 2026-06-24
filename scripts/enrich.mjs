// enrich.mjs（任意）— Claude で会議要約・トピック・議案区分を付与し index.json/gian.json を更新。
// ANTHROPIC_API_KEY が無い場合は何もせず終了（キーワード検索はAI無しで動作）。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../public/data");

if (!process.env.ANTHROPIC_API_KEY) {
  console.log("enrich: ANTHROPIC_API_KEY 未設定のためスキップ（任意機能）。");
  process.exit(0);
}

// 会議単位で発言をまとめ、要約・トピック・議案区分をJSONで生成。
export async function enrichMeeting(ac, speeches, gian) {
  const corpus = speeches.map((s) => `【${s.role} ${s.name}】${s.text}`).join("\n").slice(0, 60000);
  const msg = await ac.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: "あなたは自治体議会の会議録を整理する編集者です。出力は指定のJSONのみ。",
    messages: [
      {
        role: "user",
        content: `次の会議録から、(1)200字以内の要約 summary、(2)主要トピック topics(最大8語)、(3)各議案の区分分類 gian(配列: {no, kind})を作成。kindは[契約,条例,予算,決算,人事,路線,報告,その他]。JSONのみ出力。
議案番号一覧: ${gian.map((g) => g.no).join(", ")}
本文:
${corpus}`,
      },
    ],
  });
  const txt = msg.content.map((c) => c.text || "").join("");
  return JSON.parse(txt.replace(/^```json?|```$/g, "").trim());
}

async function run() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const ac = new Anthropic();
  const index = JSON.parse(readFileSync(join(DATA, "index.json"), "utf8"));
  const gianAll = JSON.parse(readFileSync(join(DATA, "gian.json"), "utf8"));

  // 会議ID→発言
  const byMeeting = {};
  for (const e of index) (byMeeting[e.meetingId] ??= []).push(e);

  const summaries = {};
  for (const [mid, speeches] of Object.entries(byMeeting)) {
    const g = gianAll[mid]?.agenda || [];
    try {
      const r = await enrichMeeting(ac, speeches, g);
      summaries[mid] = r;
      // 議案区分をマージ
      if (Array.isArray(r.gian)) {
        for (const item of r.gian) {
          const t = g.find((x) => x.no === item.no);
          if (t && item.kind) t.kind = item.kind;
        }
      }
      console.log(`  ✓ ${mid}: ${r.summary?.slice(0, 30)}…`);
    } catch (e) {
      console.warn(`  ✗ ${mid}: ${e.message}`);
    }
  }

  // 各会議の先頭発言に会議要約を付与（簡易）。
  for (const e of index) {
    const s = summaries[e.meetingId];
    if (s) {
      if (s.topics && !e.topics) e.topics = s.topics;
    }
  }
  writeFileSync(join(DATA, "index.json"), JSON.stringify(index));
  writeFileSync(join(DATA, "gian.json"), JSON.stringify(gianAll, null, 2));
  writeFileSync(join(DATA, "summaries.json"), JSON.stringify(summaries, null, 2));
  console.log("enrich 完了。");
}

run();
