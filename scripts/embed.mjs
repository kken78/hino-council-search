// embed.mjs（任意）— 各発言を埋め込み量子化して public/data/vectors.json を生成。
// @xenova/transformers が無い場合はスキップ（セマンティック検索は任意機能）。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../public/data");
const MODEL = "Xenova/multilingual-e5-small";

let _fe;
async function loadFE() {
  const { pipeline } = await import("@xenova/transformers");
  return (_fe ??= await pipeline("feature-extraction", MODEL));
}

// passage/query を埋め込み、384次元・正規化済みベクトルを返す。
export async function embed(texts, kind = "passage") {
  const fe = await loadFE();
  const out = [];
  for (const t of texts) {
    const r = await fe(`${kind}: ${t}`, { pooling: "mean", normalize: true });
    out.push(Array.from(r.data));
  }
  return out;
}

// int8 量子化（[-1,1] → [-127,127]）
const quantize = (v) => v.map((x) => Math.max(-127, Math.min(127, Math.round(x * 127))));

async function run() {
  try {
    await import("@xenova/transformers");
  } catch {
    console.log("embed: @xenova/transformers 未インストールのためスキップ（任意機能）。");
    return;
  }
  const index = JSON.parse(readFileSync(join(DATA, "index.json"), "utf8"));
  const ids = [], texts = [];
  for (const e of index) {
    ids.push(e.sid);
    texts.push((e.text || "").slice(0, 512));
  }
  console.log(`embed: ${ids.length} 発言を埋め込み中…`);
  const vecs = [];
  const B = 16;
  for (let i = 0; i < texts.length; i += B) {
    const batch = await embed(texts.slice(i, i + B), "passage");
    for (const v of batch) vecs.push(quantize(v));
    if (i % 160 === 0) console.log(`  ${i}/${texts.length}`);
  }
  writeFileSync(
    join(DATA, "vectors.json"),
    JSON.stringify({ model: "multilingual-e5-small", dim: 384, dtype: "int8", ids, vecs })
  );
  console.log(`vectors.json 生成: ${ids.length} 件`);
}

run();
