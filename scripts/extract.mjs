// extract.mjs — meetings.json の各PDFを取得しテキスト化。data/text/<key>.txt にキャッシュ。
// テキストは1行＝1ページ。段落の最初の行の前に印 U+2029 を入れる（scripts/lib/pagetext.mjs）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fetchBuffer, sleep } from "./lib/fetchx.mjs";
import { textKey } from "./lib/keys.mjs";
import { pageText } from "./lib/pagetext.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEET = join(__dirname, "../public/data/meetings.json");
const PDF_DIR = join(__dirname, "../data/pdf");
const TEXT_DIR = join(__dirname, "../data/text");
mkdirSync(PDF_DIR, { recursive: true });
mkdirSync(TEXT_DIR, { recursive: true });

// PDF（バイト列）→ テキスト（pdfjs）。1行＝1ページ。
export async function pdfToText(buf) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const c = await page.getTextContent();
    out += pageText(c.items) + "\n";
  }
  await doc.cleanup();
  return out;
}

async function run() {
  const meetings = JSON.parse(readFileSync(MEET, "utf8"));
  // HINO_FORCE=key1,key2 … 指定キーだけキャッシュを無視して作り直す（欠落・破損テキストの再抽出用）
  const force = new Set((process.env.HINO_FORCE || "").split(",").map((s) => s.trim()).filter(Boolean));
  // HINO_REFRESH=1 … キャッシュがあっても全件を作り直す。data/pdf/<key>.pdf があれば取得せずそれを使い、無ければ取得する
  const refresh = process.env.HINO_REFRESH === "1";
  let done = 0, cached = 0, failed = 0, local = 0, fetched = 0;
  for (const m of meetings) {
    for (const pdf of m.pdfs) {
      const key = textKey(m.id, pdf);
      const txtPath = join(TEXT_DIR, key + ".txt");
      const pdfPath = join(PDF_DIR, key + ".pdf");
      if (existsSync(txtPath) && !force.has(key) && !refresh) { cached++; continue; }
      try {
        let buf;
        if (refresh && existsSync(pdfPath)) { buf = readFileSync(pdfPath); local++; }
        else {
          if (fetched++) await sleep(1000); // 町のサイトから取得するときは1件ごとに1秒あける
          buf = await fetchBuffer(pdf.url);
          writeFileSync(pdfPath, buf);
        }
        const text = await pdfToText(buf);
        writeFileSync(txtPath, text);
        console.log("  OK " + key + " (" + text.length + "字)");
        done++;
      } catch (e) {
        console.warn("  NG " + key + ": " + e.message.split("\n")[0]);
        failed++;
      }
    }
  }
  console.log("\nextract 完了: 新規 " + done + " / キャッシュ " + cached + " / 失敗 " + failed +
    (refresh ? "（作り直し：手元のPDF " + local + " / 取得 " + fetched + "）" : ""));
}

// 直接実行したときだけ動かす（pdfToText を読み込むだけのときに取得を始めない）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
