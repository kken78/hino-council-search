// 正規化：NFKC ＋ 異体字対応 ＋ 空白/記号除去 ＋ 小文字化
// 本文とクエリの双方を同一の正規形へ変換して照合する。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 異体字 → 標準字（dict/variants.json）。Node のバージョン差を避けるため fs で読む。
const variants = JSON.parse(
  readFileSync(join(__dirname, "../../dict/variants.json"), "utf8")
);

// 比較時に無視する文字（空白・全角空白・読点・カンマ・中黒・ハイフン類）
const SKIP = /[\s　、，,・･\-－―ー~〜]/;

const normChar = (c) => (variants[c] ?? c).normalize("NFKC").toLowerCase();

// 検索用：正規化文字列と「正規化index → 元index」対応表を返す。
// map[j] = 正規化後 j 文字目が、元文字列の何文字目に由来するか（ハイライト復元に使う）。
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

// クエリ語の正規化（map不要）
export function normTerm(t) {
  let r = "";
  for (const c of t) if (!SKIP.test(c)) r += normChar(c);
  return r;
}

// 検索照合用：正規化“文字列だけ”（map不要・軽量）。
// index.mjs でビルド時に各発言へ rec.norm = buildNormStr(rec.text) として格納する。
// フロント側 buildNormStr と同一ルール（SKIP＋variants＋NFKC＋小文字化）である必要がある。
export function buildNormStr(str) {
  let norm = "";
  for (let i = 0; i < str.length; i++) {
    if (SKIP.test(str[i])) continue;
    for (const cc of normChar(str[i])) norm += cc;
  }
  return norm;
}

export { variants, SKIP };
