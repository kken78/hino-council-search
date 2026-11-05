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
  // ライセンスの一文。リンクの文字は LICENSE-DATA.md（preview.html ではリンクを外して文字だけ残す：data-keep-text）
  const license = ui.license_note
    ? `<br>${esc(ui.license_note)}${ui.license_url ? ` <a href="${esc(ui.license_url)}" target="_blank" rel="noreferrer" data-keep-text>LICENSE-DATA.md</a>` : ""}。`
    : "";
  // システムの位置づけの一文（非公式の試作である等）。空なら上部・フッターとも何も出さない
  const pos = ui.position_note ? esc(ui.position_note) : "";
  // ページ上部の戻りリンク（ui.links のうち top: true のもの）。位置づけの一文と同じ行の先頭に置く
  const back = (ui.links || []).filter((l) => l.top).map((l) => `<a href="${esc(l.url)}" style="font-weight:700;margin-right:1em;white-space:nowrap">← ${esc(l.label)}</a>`).join("");
  return tpl
    .replaceAll("{{POSITION_TOP}}", pos || back ? `<p class="posnote" style="font-size:12px;line-height:1.6;color:var(--slate);margin:8px 0 0">${back}${pos}</p>` : "")
    .replaceAll("{{POSITION_NOTE}}", pos ? `${pos}<br>` : "")
    .replaceAll("{{TITLE}}", esc(ui.title || "会議録 横断検索"))
    .replaceAll("{{EYEBROW}}", esc(ui.eyebrow || ""))
    .replaceAll("{{FOOTER_NOTE}}", esc(ui.footer_note || ""))
    .replaceAll("{{SOURCE}}", esc(SITE.site.source_label || ""))
    .replaceAll("{{FOOTER_LINKS}}", links)
    .replaceAll("{{LICENSE_NOTE}}", license);
}
