// data.mjs — 発言索引（index）の読み書き。年ごとの分割ファイル＋目録で保持する。
//   public/data/index-manifest.json … { schema, generated, total, shards:[{ year, file, count }] }（shards は新しい年から）
//   public/data/index/<year>.json   … その年の会議の発言（index.json と同じ12項目・同じ並び）
// 目録の順に連結すると、分割前の index.json と同じ配列（同じ並び）になる。
// 分割前の public/data/index.json しか無いデータ（古い版・フォーク先）も読める。
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export const MANIFEST = "index-manifest.json";
export const SHARD_DIR = "index";

export function readIndex(dataDir) {
  const mp = join(dataDir, MANIFEST);
  if (existsSync(mp)) {
    const m = JSON.parse(readFileSync(mp, "utf8"));
    return m.shards.flatMap((s) => JSON.parse(readFileSync(join(dataDir, s.file), "utf8")));
  }
  return JSON.parse(readFileSync(join(dataDir, "index.json"), "utf8"));
}

// 年ごとに分けて書き出す（並びは保つ）。古い index.json と、使わなくなった年の分割ファイルは消す。
export function writeIndex(dataDir, index) {
  const groups = new Map();
  for (const e of index) {
    const y = e.year ? String(e.year) : "unknown";
    (groups.get(y) || groups.set(y, []).get(y)).push(e);
  }
  const dir = join(dataDir, SHARD_DIR);
  mkdirSync(dir, { recursive: true });
  const shards = [];
  for (const [year, list] of groups) {
    const file = `${SHARD_DIR}/${year}.json`;
    writeFileSync(join(dataDir, file), JSON.stringify(list));
    shards.push({ year: year === "unknown" ? null : Number(year), file, count: list.length });
  }
  const keep = new Set(shards.map((s) => s.file.split("/")[1]));
  for (const f of readdirSync(dir)) if (f.endsWith(".json") && !keep.has(f)) unlinkSync(join(dir, f));
  const manifest = { schema: 1, generated: new Date().toISOString().slice(0, 10), total: index.length, shards };
  writeFileSync(join(dataDir, MANIFEST), JSON.stringify(manifest, null, 2));
  const old = join(dataDir, "index.json");
  if (existsSync(old)) unlinkSync(old);
  return manifest;
}
