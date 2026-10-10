// site.mjs — 自治体ごとの設定（リポジトリ直下の site.config.json）を読む。
// 他の自治体で使うときは site.config.json を書き換える（FORK.md）。HINO_SITE_CONFIG で別ファイルも指定できる。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = process.env.HINO_SITE_CONFIG ? resolve(process.env.HINO_SITE_CONFIG) : join(__dirname, "../../site.config.json");
export const SITE = JSON.parse(readFileSync(path, "utf8"));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// テンプレート（scripts/preview.tpl.html）の {{…}} を設定値で置き換える
export function applySite(tpl) {
  const ui = SITE.ui || {};
  const links = (ui.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noreferrer" style="margin-left:8px">${esc(l.label)}</a>`).join("");
  return tpl
    .replaceAll("{{TITLE}}", esc(ui.title || "会議録 横断検索"))
    .replaceAll("{{EYEBROW}}", esc(ui.eyebrow || ""))
    .replaceAll("{{FOOTER_NOTE}}", esc(ui.footer_note || ""))
    .replaceAll("{{SOURCE}}", esc(SITE.site.source_label || ""))
    .replaceAll("{{FOOTER_LINKS}}", links);
}
