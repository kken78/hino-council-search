// build-preview.mjs — 開発確認用の単体プレビュー（索引データ内蔵）を preview.html に生成。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildNormStr } from "./lib/normalize.mjs";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const R = (p) => readFileSync(join(root, p), "utf8");
const J = (p) => JSON.parse(R(p));
const data = {
  meetings: J("public/data/meetings.json"), index: J("public/data/index.json"),
  gian: J("public/data/gian.json"), toc: J("public/data/toc.json"),
  topics: J("dict/topics.json"),
  dict: { variants: J("dict/variants.json"), synonyms: J("dict/synonyms.json"), yomi: J("dict/yomi.json") },
};
// ローカル preview.html にも norm を付与（初回検索を即応答に）。リポジトリの index.json は変更しない。
for (const e of data.index) if (e.norm == null) e.norm = buildNormStr(e.text || "");
const tpl = R("scripts/preview.tpl.html");
const out = tpl.replace("/*__BOOT__*/", "start(" + JSON.stringify(data) + ");");
writeFileSync(join(root, "preview.html"), out);
console.log("preview.html 生成: " + out.length + " bytes / 発言 " + data.index.length);
