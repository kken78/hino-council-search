// extract.mjs — meetings.json の各PDFを取得しテキスト化。data/text/<key>.txt にキャッシュ。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchBuffer } from "./lib/fetchx.mjs";
import { textKey } from "./lib/keys.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEET = join(__dirname, "../public/data/meetings.json");
const PDF_DIR = join(__dirname, "../data/pdf");
const TEXT_DIR = join(__dirname, "../data/text");
mkdirSync(PDF_DIR, { recursive: true });
mkdirSync(TEXT_DIR, { recursive: true });

// PDF（バイト列）→ テキスト（pdfjs）。
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
    out += c.items.map((i) => i.str).join("") + "\n";
  }
  await doc.cleanup();
  return out;
}

async function run() {
  const meetings = JSON.parse(readFileSync(MEET, "utf8"));
  let done = 0, cached = 0, failed = 0;
  for (const m of meetings) {
    for (const pdf of m.pdfs) {
      const key = textKey(m.id, pdf);
      const txtPath = join(TEXT_DIR, key + ".txt");
      if (existsSync(txtPath)) { cached++; continue; }
      try {
        const buf = await fetchBuffer(pdf.url);
        writeFileSync(join(PDF_DIR, key + ".pdf"), buf);
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
  console.log("\nextract 完了: 新規 " + done + " / キャッシュ " + cached + " / 失敗 " + failed);
}

run();
