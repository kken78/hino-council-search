// 元号 ⇔ 西暦変換、および検索クエリ中の年表現の相互展開。
// 令和=2018+n / 平成=1988+n / 昭和=1925+n（n年 = base + n）。

const ERAS = [
  { name: "令和", alpha: "r", base: 2018, start: 2019 },
  { name: "平成", alpha: "h", base: 1988, start: 1989 },
  { name: "昭和", alpha: "s", base: 1925, start: 1926 },
];

export const eraToYear = (name, n) => {
  const e = ERAS.find((x) => x.name === name || x.alpha === String(name).toLowerCase());
  return e ? e.base + n : null;
};

export const yearToEra = (y) => {
  const e = ERAS.find((x) => y >= x.start);
  if (!e) return String(y);
  const n = y - e.base;
  return `${e.name}${n === 1 ? "元" : n}年`;
};

// 漢数字（十進・元）→ 算用数字。簡易（～99 程度を想定）。
export function kanjiNum(s) {
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
  const d = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 元: 1 };
  if (s === "元") return 1;
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    const tens = a === "" ? 1 : d[a] ?? parseInt(a, 10) ?? 1;
    const ones = b === "" || b === undefined ? 0 : d[b] ?? parseInt(b, 10) ?? 0;
    return tens * 10 + ones;
  }
  // 連結漢数字（例: 三一）や単漢字
  let n = 0;
  for (const c of s) {
    if (d[c] === undefined) return null;
    n = n * 10 + d[c];
  }
  return s.length ? n : null;
}

const toHalfDigits = (s) =>
  s.replace(/[０-９]/g, (d) => "０１２３４５６７８９".indexOf(d).toString());

// "令和7" / "令和七" / "R7" / "2025" などを {year, era, terms[]} に展開。
// terms には検索で OR 展開すべき同義表現（西暦・元号・R表記など）を入れる。
export function expandYear(token) {
  const t = toHalfDigits(token.trim());

  // 西暦4桁
  const m4 = t.match(/^(\d{4})年?$/);
  if (m4) {
    const year = parseInt(m4[1], 10);
    return { year, era: yearToEra(year), terms: yearVariants(year) };
  }

  // 元号（漢字 or アルファベット）＋ 数字/漢数字/元
  const m = t.match(/^(令和|平成|昭和|r|h|s)\s*([0-9一二三四五六七八九十〇元]+)\s*年?$/i);
  if (m) {
    const name = m[1].length === 1 ? m[1].toLowerCase() : m[1];
    const n = kanjiNum(m[2]);
    if (n == null) return null;
    const year = eraToYear(name, n);
    if (year == null) return null;
    return { year, era: yearToEra(year), terms: yearVariants(year) };
  }
  return null;
}

// ある西暦年について、本文照合で当てたい表現群を返す。
export function yearVariants(year) {
  const e = ERAS.find((x) => year >= x.start);
  const out = [String(year)];
  if (e) {
    const n = year - e.base;
    const nn = n === 1 ? "元" : String(n);
    out.push(`${e.name}${nn}年`, `${e.name}${nn}`, `${e.alpha.toUpperCase()}${n}`);
  }
  return [...new Set(out)];
}

export { ERAS };
