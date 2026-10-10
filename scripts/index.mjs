// index.mjs — 抽出テキストを発言分割し index.json / gian.json を生成。
// toc.json の indexed フラグ（全文検索可能か）も更新する。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { splitSpeeches, extractGian, extractGianFromToc, detectAgendaRef, guessKind, stripPageHeads } from "./lib/speech.mjs";
import { textKey } from "./lib/keys.mjs";
import { parseDay } from "./lib/proceedings.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../public/data");
const TEXT_DIR = join(__dirname, "../data/text");
const MEET = join(DATA, "meetings.json");

// 一般質問の質問者を議事日程から推定（best-effort）。
// 会議冒頭「出席議員（N名）」名簿から 氏名→「N番」マップを作る。
function buildSeatMap(raw) {
  const map = {};
  const start = raw.search(/出席議員[（(]/);
  if (start < 0) return map;
  const rest = raw.slice(start);
  const endRel = rest.search(/欠席|遅刻|途中退席|[2２]．/);
  const block = rest.slice(0, endRel > 0 ? endRel : 400);
  const re = /([0-9０-９]+)\s*番\s*([^0-9０-９]+?)(?=[0-9０-９]+\s*番|$)/g;
  let x;
  while ((x = re.exec(block))) {
    const no = x[1].replace(/[０-９]/g, d => "０１２３４５６７８９".indexOf(d)) + "番";
    const name = x[2].replace(/[\s　・]/g, "").trim();
    if (name.length >= 2 && name.length <= 6) map[name] = no;
  }
  return map;
}

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

// 日付の無い本文PDF（臨時会の「本文.pdf」）は会議名の「（1月23日）」と年から日付を補う
function dateFromName(m) {
  const x = (m.name || "").match(/[（(]\s*([0-9０-９]{1,2})月([0-9０-９]{1,2})日\s*[）)]/);
  if (!x || !m.year) return null;
  const h = (s) => s.replace(/[０-９]/g, (d) => "０１２３４５６７８９".indexOf(d));
  return `${m.year}-${h(x[1]).padStart(2, "0")}-${h(x[2]).padStart(2, "0")}`;
}

function run() {
  const meetings = JSON.parse(readFileSync(MEET, "utf8"));
  const index = [];
  const gian = {};
  const proceedings = {};
  const indexedIds = new Set();
  const carried = []; // 自会議の議案に無い採決（9月付託→12月採決の決算など）。後で前の会議へ結びつける

  for (const [mi, m] of meetings.entries()) {
    const agendaMap = new Map();
    const ippanMap = new Map();
    const days = []; // 審議構造の解析用：日ごとの発言列

    // 目次PDFから正式な議案件名マップを作る（最も正確なソース）
    const tocTitles = {};
    for (const pdf of m.pdfs) {
      if (!/mokuji|目次/i.test(pdf.url + " " + (pdf.label || ""))) continue;
      const tkey = textKey(m.id, pdf);
      const tpath = join(TEXT_DIR, tkey + ".txt");
      if (!existsSync(tpath)) continue;
      Object.assign(tocTitles, extractGianFromToc(readFileSync(tpath, "utf8")));
    }

    for (const pdf of m.pdfs) {
      const key = textKey(m.id, pdf);
      const txtPath = join(TEXT_DIR, key + ".txt");
      if (!existsSync(txtPath)) continue;
      const raw = stripPageHeads(readFileSync(txtPath, "utf8"));
      const seatMap = buildSeatMap(raw); // 氏名→「N番」（その日の名簿）

      for (const g of extractGian(raw)) if (!agendaMap.has(g.no)) agendaMap.set(g.no, g);
      for (const ip of detectIppan(raw)) if (!ippanMap.has(ip.member)) ippanMap.set(ip.member, ip);

      const speeches = splitSpeeches(raw);
      const dateTag = pdf.date ? pdf.date.replace(/-/g, "") : key.split("_").slice(1).join("_");
      const day = [];
      const isToc = /mokuji|目次/i.test(pdf.url + " " + (pdf.label || ""));
      const date = pdf.date || (isToc ? null : dateFromName(m));
      if (!isToc) days.push({ date, day });
      speeches.forEach((s, i) => {
        if (!s.text) return;
        indexedIds.add(m.id);
        const e = {
          sid: `${m.id}_${dateTag}_${String(i).padStart(4, "0")}`,
          meetingId: m.id, meeting: m.name, type: m.type, year: m.year, era: m.era,
          date, pdf: pdf.url, role: (/(^[0-9０-９]*番$|^番$)/.test(s.role) ? (seatMap[s.name] || s.role) : s.role), name: s.name,
          agendaRef: detectAgendaRef(s.text), text: s.text.replace(/\n/g, ""),
        };
        index.push(e);
        day.push({ i, sid: e.sid, role: e.role, name: e.name, text: e.text });
      });
    }
    // 目次の件名で上書き（目次が正）＋目次にしかない議案を追加。区分も正しい件名で再判定。
    for (const no in tocTitles) {
      const title = tocTitles[no];
      agendaMap.set(no, { no, kind: guessKind(no + title), title });
    }
    // 決議の番号表記ゆれを統合：決議案第◯号があれば、同一件名の議第◯号/議案第◯号を除去
    const decTitles = new Set([...agendaMap.values()].filter(x=>/^決議案第/.test(x.no)).map(x=>x.title));
    for (const [no, x] of [...agendaMap]) {
      if (/^(議第|議案第)/.test(no) && decTitles.has(x.title)) agendaMap.delete(no);
    }
    const agenda = [...agendaMap.values()].sort((a, b) => {
      const n = x => parseInt(String(x.no).replace(/\D/g, ""), 10) || 0;
      return n(a) - n(b);
    });
    // 審議構造（一般質問・議案質疑・委員長報告・討論・提案説明・採決）。gian には任意項目として要約を足す（既存項目は不変）。
    const segments = days.flatMap(({ date, day }) => parseDay(day, { date, agenda }));
    if (segments.length) proceedings[m.id] = { segments };
    const byNo = new Map(agenda.map((a) => [a.no, a]));
    for (const s of segments) {
      if (s.kind === "vote") for (const b of s.bills) {
        const a = byNo.get(b);
        if (a) { a.result = s.result; if (s.method) a.method = s.method; }
        // 範囲上程の件名（「…ほか6件」）は個々の件名ではないので、番号だけで照合する
        carried.push({ mi, mid: m.id, b, s, title: a && !/ほか[0-9０-９]+件$/.test(a.title) ? a.title : null });
      }
      if (s.kind === "report" && s.committee) for (const b of s.bills) { const a = byNo.get(b); if (a && !a.committee) a.committee = s.committee; }
    }
    const sq = (x) => x.replace(/[\s　]/g, "");
    for (const s of segments.filter((x) => x.kind === "ippan")) {
      let ip = [...ippanMap.values()].find((x) => sq(x.member) === sq(s.member));
      if (!ip) { ip = { member: s.member, theme: "" }; ippanMap.set(s.member, ip); } // 議事日程から漏れた質問者を補う
      if (s.seat) ip.seat = s.seat;
      if (s.style) ip.style = s.style;
      if (s.topics && s.topics.length) ip.topics = s.topics.map(({ n, title, src }) => ({ n, title, src }));
    }
    gian[m.id] = { agenda, ippan: [...ippanMap.values()] };
  }

  // 前の会議（meetings は新しい順なので後ろ側）で付託され、この会議で採決された議案。直近3会議まで遡る。
  // 番号は年で振り直されるため、この会議の議案一覧にも載っている場合は件名の一致も条件にする。
  const sqT = (x) => (x || "").replace(/[\s　]/g, "").replace(/ほか[0-9０-９]+件$/, "");
  for (const { mi, mid, b, s, title } of carried) {
    for (let k = mi + 1; k <= mi + 3 && k < meetings.length; k++) {
      const a = (gian[meetings[k].id] || { agenda: [] }).agenda.find((x) => x.no === b);
      if (!a) continue;
      if (title && !(sqT(a.title).startsWith(sqT(title)) || sqT(title).startsWith(sqT(a.title)))) break;
      if (!a.result) { a.result = s.result; if (s.method) a.method = s.method; a.decidedIn = mid; }
      break;
    }
  }

  mkdirSync(DATA, { recursive: true });
  writeFileSync(join(DATA, "index.json"), JSON.stringify(index));
  writeFileSync(join(DATA, "gian.json"), JSON.stringify(gian, null, 2));
  writeFileSync(join(DATA, "proceedings.json"), JSON.stringify(proceedings));

  // toc.json の indexed フラグを更新
  const tocPath = join(DATA, "toc.json");
  if (existsSync(tocPath)) {
    const toc = JSON.parse(readFileSync(tocPath, "utf8"));
    for (const t of toc) t.indexed = indexedIds.has(t.id);
    writeFileSync(tocPath, JSON.stringify(toc, null, 2));
  }

  const speakers = new Set(index.map((e) => e.name));
  console.log(`index.json: ${index.length} 発言 / ${indexedIds.size} 会議 / 発言者 ${speakers.size} 名`);
  const segs = Object.values(proceedings).flatMap((p) => p.segments);
  const cnt = (k) => segs.filter((s) => s.kind === k).length;
  console.log(`proceedings.json: 一般質問 ${cnt("ippan")} / 議案質疑 ${cnt("shitsugi")} / 委員長報告 ${cnt("report")} / 討論 ${cnt("debate")} / 提案説明 ${cnt("proposal")} / 採決 ${cnt("vote")}`);
  console.log(`gian.json : 議案 ${Object.values(gian).reduce((s,g)=>s+g.agenda.length,0)} 件 / 一般質問者 ${Object.values(gian).reduce((s,g)=>s+g.ippan.length,0)} 名`);
}
run();
