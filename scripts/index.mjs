// index.mjs — 抽出テキストを発言分割し index.json / gian.json を生成。
// toc.json の indexed フラグ（全文検索可能か）も更新する。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { splitSpeeches, extractGian, detectAgendaRef } from "./lib/speech.mjs";
import { textKey } from "./lib/keys.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../public/data");
const TEXT_DIR = join(__dirname, "../data/text");
const MEET = join(DATA, "meetings.json");

// 一般質問の質問者を議事日程から推定（best-effort）。
function detectIppan(raw) {
  const head = raw.split(/会議の概要/)[0] || "";
  const i = head.indexOf("一般質問");
  if (i < 0) return [];
  const block = head.slice(i);
  const out = [];
  const seen = new Set();
  const re = /[0-9０-９]{1,2}\s*番[\s　、,]*([一-龥々]{2,4})[\s　]*([一-龥々]{0,4})[\s　]*君/g;
  let m;
  while ((m = re.exec(block))) {
    const member = (m[1] + m[2]).replace(/[\s　]/g, "");
    if (member.length < 2 || seen.has(member)) continue;
    seen.add(member);
    out.push({ member, theme: "" });
  }
  return out;
}

function run() {
  const meetings = JSON.parse(readFileSync(MEET, "utf8"));
  const index = [];
  const gian = {};
  const indexedIds = new Set();

  for (const m of meetings) {
    const agendaMap = new Map();
    const ippanMap = new Map();

    for (const pdf of m.pdfs) {
      const key = textKey(m.id, pdf);
      const txtPath = join(TEXT_DIR, key + ".txt");
      if (!existsSync(txtPath)) continue;
      const raw = readFileSync(txtPath, "utf8");

      for (const g of extractGian(raw)) if (!agendaMap.has(g.no)) agendaMap.set(g.no, g);
      for (const ip of detectIppan(raw)) if (!ippanMap.has(ip.member)) ippanMap.set(ip.member, ip);

      const speeches = splitSpeeches(raw);
      const dateTag = pdf.date ? pdf.date.replace(/-/g, "") : key.split("_").slice(1).join("_");
      speeches.forEach((s, i) => {
        if (!s.text) return;
        indexedIds.add(m.id);
        index.push({
          sid: `${m.id}_${dateTag}_${String(i).padStart(4, "0")}`,
          meetingId: m.id, meeting: m.name, type: m.type, year: m.year, era: m.era,
          date: pdf.date, pdf: pdf.url, role: s.role, name: s.name,
          agendaRef: detectAgendaRef(s.text), text: s.text,
        });
      });
    }
    gian[m.id] = { agenda: [...agendaMap.values()], ippan: [...ippanMap.values()] };
  }

  mkdirSync(DATA, { recursive: true });
  writeFileSync(join(DATA, "index.json"), JSON.stringify(index));
  writeFileSync(join(DATA, "gian.json"), JSON.stringify(gian, null, 2));

  // toc.json の indexed フラグを更新
  const tocPath = join(DATA, "toc.json");
  if (existsSync(tocPath)) {
    const toc = JSON.parse(readFileSync(tocPath, "utf8"));
    for (const t of toc) t.indexed = indexedIds.has(t.id);
    writeFileSync(tocPath, JSON.stringify(toc, null, 2));
  }

  const speakers = new Set(index.map((e) => e.name));
  console.log(`index.json: ${index.length} 発言 / ${indexedIds.size} 会議 / 発言者 ${speakers.size} 名`);
  console.log(`gian.json : 議案 ${Object.values(gian).reduce((s,g)=>s+g.agenda.length,0)} 件 / 一般質問者 ${Object.values(gian).reduce((s,g)=>s+g.ippan.length,0)} 名`);
}
run();
