// semantic.js（任意）— ブラウザ内埋め込みによるセマンティック検索。
// public/data/vectors.json が無ければ無効。@xenova/transformers は動的 import。
let _fe = null;
async function load() {
  if (_fe) return _fe;
  const { pipeline, env } = await import("@xenova/transformers");
  env.allowLocalModels = false; // CDN からモデル取得
  _fe = await pipeline("feature-extraction", "Xenova/multilingual-e5-small");
  return _fe;
}

const dequant = (v) => v.map((x) => x / 127);
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0); // 正規化済みなら内積=コサイン

let _vectors = null;
export async function loadVectors(base = "") {
  if (_vectors !== null) return _vectors;
  try {
    const res = await fetch(`${base}data/vectors.json`);
    if (!res.ok) return (_vectors = false);
    _vectors = await res.json();
  } catch {
    _vectors = false;
  }
  return _vectors;
}

export async function semanticSearch(query, topK = 20, base = "") {
  const v = await loadVectors(base);
  if (!v) return [];
  const fe = await load();
  const q = Array.from((await fe(`query: ${query}`, { pooling: "mean", normalize: true })).data);
  return v.ids
    .map((id, i) => ({ id, score: cos(q, dequant(v.vecs[i])) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
