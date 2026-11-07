// PDF の1ページの文字（pdfjs の getTextContent の items）を1行の文字列にする。段落の最初の行の前に印 PARA を入れる。
//
// 会議録の PDF（Word から作られたもの）では、段落の最初の行だけが1字（ときに2字）字下げされている。
// 続きの行と話し手の行（「議長（杉浦和人君）　…」）は字下げが無い（話し手の行は本文の左端より左に出る）。
// 規則：
//   1. items は内容の順のまま（並べ替えない）、hasEOL で行に分ける。行の中の文字は空文字でつなぐ（今までと同じ）。
//   2. 本文の左端は、前の行が右端まで埋まっている行（＝段落の続きの行）の、行の頭の x の最頻値とする。
//      右端は、そのページの行の終わりの x の最頻値（行の終わりは句読点や数字で数ポイント前後するため、最大値は使わない）。
//      行の終わりが右端より1字分以上手前でなければ「埋まっている」とみなす。続きの行が2行に満たないページでは左端を決めず、印を入れない。
//   3. 行の頭の x が左端より文字の大きさの半分以上右にある行を「段落の最初の行」とし、その行の前に PARA を入れる。
//   4. ページの最初の行（ページ番号の行）の前には入れない（stripPageHeads が行の頭のページ番号を前提にしているため）。
// PARA を除くと、今までの取り出し方（items の str を空文字でつないだもの）と同じ文字になる。
export const PARA = "\u2029"; // PARAGRAPH SEPARATOR

const fontSize = (it) => Math.hypot(it.transform[0], it.transform[1]) || it.height || 0;

// 最頻値。同数なら larger=true で大きいほう、false で小さいほう。空なら null。
function mode(vals, larger) {
  const h = new Map();
  for (const v of vals) h.set(v, (h.get(v) || 0) + 1);
  let best = null, bc = 0;
  for (const [v, c] of h) if (c > bc || (c === bc && (larger ? v > best : v < best))) { best = v; bc = c; }
  return best;
}

export function pageText(items) {
  const lines = [];
  let cur = [];
  for (const it of items) {
    cur.push(it);
    if (it.hasEOL) { lines.push(cur); cur = []; }
  }
  if (cur.length) lines.push(cur);

  const info = lines.map((l) => {
    const ne = l.filter((it) => it.str.trim());
    if (!ne.length) return null;
    const last = ne[ne.length - 1];
    return { x: ne[0].transform[4], end: last.transform[4] + last.width, size: fontSize(ne[0]) };
  });

  // ページの最初の行（ページ番号）は左端・右端の計算にも使わない
  const body = info.map((v, i) => (i >= 1 ? v : null));
  const right = mode(body.filter(Boolean).map((v) => Math.round(v.end)), true);
  const xs = [];
  for (let i = 2; i < body.length; i++) {
    const prev = body[i - 1], v = body[i];
    if (!prev || !v || right == null || prev.end < right - prev.size) continue;
    xs.push(Math.round(v.x));
  }
  const left = xs.length >= 2 ? mode(xs, false) : null;

  let out = "";
  lines.forEach((l, i) => {
    const v = body[i];
    if (left != null && v && v.x - left >= v.size * 0.5) out += PARA;
    out += l.map((it) => it.str).join("");
  });
  return out;
}
