// site.mjs — 自治体ごとの設定（リポジトリ直下の site.config.json）を読む。
// 他の自治体で使うときは site.config.json を書き換える（FORK.md）。HINO_SITE_CONFIG で別ファイルも指定できる。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = process.env.HINO_SITE_CONFIG ? resolve(process.env.HINO_SITE_CONFIG) : join(__dirname, "../../site.config.json");
export const SITE = JSON.parse(readFileSync(path, "utf8"));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// SNS で共有したときのタグ（OGP・Twitter Card）。値は ui.ogp（url, image, image_alt）。
// url があれば og:type・og:title（ui.title）・og:description（テンプレートの見出しの下の一文 .mast-sub）・og:url を、
// image があれば og:image（1200×630）・og:image:alt・twitter:card・twitter:image を出す。どちらも無ければ空。
function ogpTags(tpl) {
  const o = (SITE.ui && SITE.ui.ogp) || {};
  const tags = [];
  if (o.url) {
    const sub = tpl.match(/<p class="mast-sub">([\s\S]*?)<\/p>/);
    tags.push('<meta property="og:type" content="website" />', `<meta property="og:title" content="${esc(SITE.ui.title || "会議録 横断検索")}" />`);
    if (sub) tags.push(`<meta property="og:description" content="${esc(sub[1].replace(/<[^>]+>/g, ""))}" />`);
    tags.push(`<meta property="og:url" content="${esc(o.url)}" />`);
  }
  if (o.image) {
    tags.push(`<meta property="og:image" content="${esc(o.image)}" />`, '<meta property="og:image:width" content="1200" />', '<meta property="og:image:height" content="630" />');
    if (o.image_alt) tags.push(`<meta property="og:image:alt" content="${esc(o.image_alt)}" />`);
    tags.push('<meta name="twitter:card" content="summary_large_image" />', `<meta name="twitter:image" content="${esc(o.image)}" />`);
  }
  return tags.map((t) => "\n" + t).join("");
}

// テンプレート（scripts/preview.tpl.html）の {{…}} を設定値で置き換える
// ogp: true のときだけ {{OGP}} に OGP のタグを入れる（GitHub Pages のオンライン版だけ。オフライン版・preview.html は空）
export function applySite(tpl, { ogp = false } = {}) {
  const ui = SITE.ui || {};
  const links = (ui.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noreferrer" style="margin-left:8px">${esc(l.label)}</a>`).join("");
  // ライセンスの一文。リンクの文字は LICENSE-DATA.md（preview.html ではリンクを外して文字だけ残す：data-keep-text）
  const license = ui.license_note
    ? `<br>${esc(ui.license_note)}${ui.license_url ? ` <a href="${esc(ui.license_url)}" target="_blank" rel="noreferrer" data-keep-text>LICENSE-DATA.md</a>` : ""}。`
    : "";
  // システムの位置づけの一文（非公式の試作である等）。空なら上部・フッターとも何も出さない
  const pos = ui.position_note ? esc(ui.position_note) : "";
  // ページ上部の戻りリンク（ui.links のうち top: true のもの）。位置づけの一文と同じ行の先頭に置く
  // 表示名は top_label、無ければフッターと同じ label
  const back = (ui.links || []).filter((l) => l.top).map((l) => `<a href="${esc(l.url)}" style="font-weight:700;margin-right:1em;white-space:nowrap">← ${esc(l.top_label || l.label)}</a>`).join("");
  return tpl
    .replaceAll("{{OGP}}", ogp ? ogpTags(tpl) : "")
    .replaceAll("{{POSITION_TOP}}", pos || back ? `<p class="posnote" style="font-size:12px;line-height:1.6;color:var(--slate);margin:8px 0 0">${back}${pos}</p>` : "")
    .replaceAll("{{POSITION_NOTE}}", pos ? `${pos}<br>` : "")
    .replaceAll("{{TITLE}}", esc(ui.title || "会議録 横断検索"))
    .replaceAll("{{EYEBROW}}", esc(ui.eyebrow || ""))
    .replaceAll("{{FOOTER_NOTE}}", esc(ui.footer_note || ""))
    .replaceAll("{{SOURCE}}", esc(SITE.site.source_label || ""))
    .replaceAll("{{FOOTER_LINKS}}", links)
    .replaceAll("{{LICENSE_NOTE}}", license);
}
