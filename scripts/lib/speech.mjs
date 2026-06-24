// 発言分割（発言者＋発言）と、議事日程からの議案抽出。

// 発言マーカー：「役職／番号（氏名君）」。全角括弧。役職に空白・記号は含めない。
const SPK = /([^\s　\n、。「」（）]{1,16})（([^（）\n]{1,14})君）/g;

const clean = (s) => s.replace(/[\s　]/g, "").trim();

// 本文を発言単位へ分割。各要素 {role, name, text}。
export function splitSpeeches(raw) {
  const marks = [];
  let m;
  SPK.lastIndex = 0;
  while ((m = SPK.exec(raw))) {
    marks.push({ idx: m.index, after: SPK.lastIndex, role: clean(m[1]), name: clean(m[2]) });
  }
  const out = [];
  if (!marks.length) return [{ role: "", name: "（本文）", text: raw.trim() }];
  if (marks[0].idx > 0) {
    out.push({ role: "", name: "（会議録情報）", text: raw.slice(0, marks[0].idx).trim() });
  }
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].idx : raw.length;
    const text = raw.slice(mk.after, end).trim();
    out.push({ role: mk.role, name: mk.name, text });
  });
  return out;
}

const toHalf = (s) =>
  s.replace(/[０-９]/g, (d) => "０１２３４５６７８９".indexOf(d).toString());

// 区分推定（並び順＝優先順位）。「予算決算特別委員会の設置」を決算と誤判定しないよう
// 委員会・選挙・規則を予算/決算より前に判定する。
const KIND = [
  ["契約", /工事請負|請負契約|契約の締結|契約について/],
  ["指定管理", /指定管理者の指定/],
  ["意見書", /意見書|決議について|要望書?決議/],
  ["財産", /財産の取得|財産の処分|財産の無償|不動産の取得/],
  ["債権放棄", /私債権の放棄|債権の放棄/],
  ["組合", /組合規約の変更|組合の解散|一部事務組合|組合を組織/],
  ["選挙", /選挙について|議長選挙|副議長選挙|選挙の方法/],
  ["委員会", /特別委員会の設置|委員会の設置|委員会の委員の定数|協議会の設置/],
  ["人事", /任命|推薦|選任|同意|委嘱|評価員|監査委員|固定資産|教育委員|人権擁護/],
  ["路線", /路線の認定|路線の廃止|路線の変更|町道.*(認定|変更)/],
  ["条例", /条例/],
  ["規則", /会議規則|規則の一部|規則の制定/],
  ["予算", /補正予算|当初予算|予算（第|会計予算|歳入歳出予算/],
  ["決算", /決算の認定|歳入歳出決算|決算/],
  ["報告", /報告|繰越.*計算書|健全化.*比率|計算書|専決処分.*報告/],
  ["一般質問", /一般質問/],
];
export const guessKind = (t) => (KIND.find(([, re]) => re.test(t)) || ["その他"])[0];

// 議事日程の見出しから議案を抽出。{no, kind, title}[]。
export function extractGian(raw) {
  // 改行を除去して件名が行で途切れないようにし、議事日程（「会議の概要」前）を対象にする。
  const flat = raw.replace(/[\r\n]+/g, "");
  const head = flat.split(/会議の概要/)[0] || flat.slice(0, 8000);
  const items = new Map();
  // 番号＋件名（次の 〃 / 日程第 / 別の議案番号 / 会議の概要 まで）
  const re = /(議第|報第|議案第|選第|諮第|発議第)\s*([0-9０-９]+)\s*号[\s　]*([^〃]*?)(?=〃|日程第|会議の概要|議第|報第|議案第|選第|諮第|発議第|$)/g;
  let m;
  while ((m = re.exec(head))) {
    const no = `${m[1]}${toHalf(m[2])}号`;
    let title = (m[3] || "").replace(/[\s　]+/g, "").replace(/^[、，]/, "")
      .replace(/[…・]{2,}.*$/s, "")        // リーダー線「……」以降（ページ番号・次項目ごと）を除去
      .replace(/\d+[－-]\d+[．.\d]*.*$/s, "") // 「1－26１．」などページ参照以降を除去
      .replace(/^から$/, "")              // 「議第68号 から」の範囲断片を空に
      .replace(/\d+[-－]\d+$/, "").replace(/[－‐-]\d+[－‐-]?$/, "").slice(0, 80);
    if (!title) continue;
    if (!items.has(no)) items.set(no, { no, kind: guessKind(no + title), title });
  }
  // 件名が取れなかった番号も最低限拾う
  const re2 = /(議第|報第|議案第|選第|諮第|発議第)\s*([0-9０-９]+)\s*号/g;
  while ((m = re2.exec(head))) {
    const no = `${m[1]}${toHalf(m[2])}号`;
    if (!items.has(no)) items.set(no, { no, kind: "その他", title: no });
  }
  return [...items.values()];
}

// 発言テキスト中で参照されている議案番号（最初の1件）。任意のメタ付け用。
export function detectAgendaRef(text) {
  const m = text.match(/(議第|報第|議案第|選第|諮第|発議第)\s*([0-9０-９]+)\s*号/);
  return m ? `${m[1]}${toHalf(m[2])}号` : null;
}

export { SPK, clean, toHalf };
