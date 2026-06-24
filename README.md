# 日野町議会 議事録横断検索システム

会議録PDF（日ごと）に分散している日野町議会の議事録を、**発言単位で全文検索**できる静的Webアプリです。表記ゆれ・難読地名のよみ・元号⇄西暦を吸収し、議案一覧の閲覧、一般質問ダッシュボードとの連携、生成AIによる要約・分類・セマンティック検索までを含みます。サーバー不要で **GitHub Pages** で運用します。

> 出典データ：日野町ホームページ「会議録」 https://www.town.shiga-hino.lg.jp/category/32-3-6-0-0-0-0-0-0-0.html
> 本システムは検索・公開用に作成したテキストを用いており、原本と一部異なる場合があります。正確な内容は各PDFでご確認ください。

---

## 実装状況（最新スナップショット）

このリポジトリは README の設計に沿って実装済みで、ローカルで end-to-end が動作します。

**できていること**
- ビルドパイプライン：`crawl`（巡回→`meetings.json`＋全会議カタログ`toc.json`）／`extract`（PDF→テキスト、`data/text/` にキャッシュ）／`index`（発言分割・正規化・議案抽出→`index.json`・`gian.json`）。
- 正規化検索：AND（スペース）・OR・NOT（先頭`-`）、NFKC＋異体字（髙＝高）＋空白除去、よみ→漢字（かいがけ→鎌掛）、同義語、元号⇔西暦（2025⇔令和7⇔R7）。前後文脈ハイライト。
- フロント（**ノービルドの単一HTML／バニラJS**）：検索ファースト・自治体向けデザイン（紺マストヘッド＋日野菜アクセント＋役職バッジ）。3タブ＝**発言を検索／議案・一般質問／会議録一覧（目次）**。よく検索される語、会議・発言者・区分・種別の絞り込み、ページネーション、全文展開、アクセシビリティ対応。`npm run build` で「オフライン配布用の単一HTML」と「オンライン用 index.html」を生成。
- 単体プレビュー：`preview.html`（索引データ内蔵・サーバ不要で開ける挙動確認用。`scripts/build-preview.mjs` で再生成）。

**データ状況（デモ）**
- 目次カタログ：**64会議（2017〜2026）**。
- 全文索引：**3会議**（令和7年6月定例会／7月臨時会／5月臨時会）・**約144発言**・**議案約25件**。
- 全件取り込みは本番環境（ネット接続あり）で `npm run crawl && npm run extract && npm run index` を実行すれば自動拡大します（巡回は元の会議録一覧を辿ります）。

> 補足：取得層 `scripts/lib/fetchx.mjs` は本番ではネイティブ fetch + cheerio。ネット制限環境では `HINO_OFFLINE=1` で `data/cache/` の事前取得データから動作します（詳細は `DEV_NOTES.md`）。

---

## 目次
1. [機能仕様](#1-機能仕様)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [ディレクトリ構成](#3-ディレクトリ構成)
4. [データスキーマ](#4-データスキーマ)
5. [ビルドパイプライン](#5-ビルドパイプライン)
6. [辞書（よみ・同義語・異体字・元号）](#6-辞書よみ同義語異体字元号)
7. [生成AI層（要約・分類・セマンティック検索・RAG）](#7-生成ai層要約分類セマンティック検索rag)
8. [フロントエンド](#8-フロントエンド)
9. [一般質問ダッシュボードとの連携](#9-一般質問ダッシュボードとの連携)
10. [セットアップとローカル実行](#10-セットアップとローカル実行)
11. [GitHub Pages デプロイ](#11-github-pages-デプロイ)
12. [ロードマップ](#12-ロードマップ)
13. [ライセンス・免責](#13-ライセンス免責)

---

## 1. 機能仕様

### 1.1 検索
- **発言単位インデックス**：本文を「発言者＋発言」に分割して索引化（国会会議録・DiscussNetPremium 等と同方式）。結果に発言者（議長／町長／○番議員／各課長）を表示。
- **検索構文**
  - スペース区切り＝ **AND**（例：`介護保険 チョイソコ`）
  - `OR` 区切り＝ **OR**（例：`入札 OR 契約`）
  - 先頭 `-`（または `－`）＝ **除外 / NOT**（例：`ワクチン -コロナ`）
- **絞り込み**：年（西暦／元号）・会議種別（定例会／臨時会）・発言者・期間（開会日 from–to）。
- **結果表示**：該当会議録数／該当発言数／ヒット箇所数を表示。本文中のヒット語を前後文脈つきでハイライトし、該当日のPDFと会議ページへ遷移。
- **並び順**：開催日の新しい順（既定）／関連度（ヒット数）。

### 1.2 表記ゆれ吸収（正規化）
照合の前に、本文とクエリの双方を同一の正規形へ変換する。
| 種類 | 例 | 対応 |
|---|---|---|
| 全角/半角・大文字小文字 | ＳＮＳ↔SNS、議第４８号↔議第48号 | Unicode **NFKC** ＋ 小文字化 |
| 異体字・旧字 | 髙橋・髙木・野﨑・齋藤 | 異体字対応表 `variants.json` |
| 空白・読点・中黒・カンマ | 「髙 橋」「中小企業・小規模企業」「6,490万」 | 比較時に除去 |
| 難読地名・固有名詞のよみ | かいがけ→鎌掛、ひのな→日野菜 | よみ辞書 `yomi.json` |
| 送り仮名・同義語 | 子ども/子供、受付/受け付け、ワクチン/予防接種 | 同義語辞書 `synonyms.json` |
| 元号⇔西暦 | 令和7↔2025、平成31↔2019 | 元号変換（`eras.js`） |

### 1.3 議案一覧
会議ごとに議案（議事日程）を **議案番号・区分（契約/条例/予算/決算/人事/路線/報告/一般質問）・件名** で一覧。一般質問の議員名から検索／ダッシュボードへ導線。

### 1.4 生成AI機能（任意）
- 会議・議案ごとの**要約**、**区分の自動分類**、一般質問の**テーマ抽出**（ビルド時に Claude で付与）。
- **セマンティック検索**（意味で探す）：埋め込みベクトルによる類似発言検索。
- **質問応答（RAG）**：「○○について町はどう答弁した？」に出典つきで回答。

---

## 2. アーキテクチャ

重い処理（巡回・抽出・分割・AI付与・索引化）は**事前ビルド**に寄せ、公開ページは生成済みJSONを読むだけの**完全静的サイト**にする。

```
            ┌──────────────── ビルド（ローカル / GitHub Actions・定期実行）────────────────┐
            │                                                                              │
 日野町HP ─▶│ 1.crawl  会議一覧/各会議ページを巡回 → meetings.json（PDF URL一覧）          │
 (会議録)   │ 2.extract  PDF → テキスト（pdfjs）                                            │
            │ 3.split   発言分割（発言者＋発言）＋ 議案抽出（議事日程）                      │
            │ 4.enrich  ★Claude: 要約・分類・テーマ抽出（任意）                             │
            │ 5.embed   ★埋め込みベクトル生成（任意・セマンティック検索用）                 │
            │ 6.index   正規化＋辞書適用 → index.json / vectors.bin / gian.json             │
            │                                                                              │
            └───────────────────────────────┬──────────────────────────────────────────────┘
                                            ▼  public/data/*.json をリポジトリへ
        ┌──────────────── 公開（GitHub Pages・静的）────────────────┐
        │  静的フロント（単一HTML/バニラ）：索引JSONを読み、         │
        │  正規化検索＋（任意）ブラウザ内埋め込みで意味検索          │
        └────────────────────────────────────────────────────────────┘
```

- データ規模の目安：日野町議会の会議録は全文でも数百万字程度。**索引が 200,000 トークン（約500ページ）未満**ならRAGなしで「全文をそのままLLMに渡す」運用も可能（プロンプトキャッシュ併用）。本件はこの範囲に収まる見込み。
- セマンティック検索はGitHub Pages前提のため、**ブラウザ内埋め込み（transformers.js + 多言語E5）**を主構成とし、クエリもブラウザで埋め込む。より高品質を求める場合は **Voyage AI**（Anthropic推奨）をビルド時のドキュメント埋め込みに用い、クエリ埋め込みのみ軽量プロキシ（Cloudflare Workers 等）で行う構成にする。

---

## 3. ディレクトリ構成

```
gikai-search/
├─ README.md / DEV_NOTES.md                # 仕様 / 実装・運用メモ
├─ package.json / vite.config.js / index.html / LICENSE / .gitignore
├─ .github/workflows/build-deploy.yml      # 定期ビルド＆Pagesデプロイ
├─ scripts/                                # ビルドパイプライン（Node ESM）
│  ├─ crawl.mjs          # 巡回 → meetings.json ＋ toc.json
│  ├─ extract.mjs        # PDF → テキスト（pdfjs, data/text にキャッシュ）
│  ├─ index.mjs          # 発言分割・正規化・議案抽出 → index/gian、toc更新
│  ├─ enrich.mjs         # 任意（Claude：要約・分類）
│  ├─ embed.mjs          # 任意（埋め込み）
│  ├─ build-preview.mjs  # 単体プレビュー preview.html を生成
│  ├─ preview.tpl.html   # プレビューのテンプレート
│  └─ lib/
│     ├─ normalize.mjs   # NFKC＋異体字＋空白除去
│     ├─ eras.mjs        # 元号⇔西暦・漢数字
│     ├─ speech.mjs      # 発言分割・議案抽出・区分推定
│     ├─ keys.mjs        # テキストキャッシュのキー生成
│     └─ fetchx.mjs      # 取得層（native fetch+cheerio / offlineキャッシュ）
├─ dict/                                   # 辞書（手で育てる）
│  ├─ yomi.json / synonyms.json / variants.json
│  └─ topics.json        # 分野クイック検索（頻出テーマ→OR検索）
├─ data/                                   # 中間生成物（gitignore対象は pdf/）
│  ├─ pdf/               # ダウンロードPDF（キャッシュ）
│  ├─ text/              # 抽出テキスト
│  └─ cache/pages/       # offline用ページキャッシュ
├─ public/data/                            # 公開する索引（フロントが読む）
│  ├─ meetings.json      # 全文索引対象の会議
│  ├─ toc.json           # 年度別カタログ（全会議の目次）
│  ├─ index.json         # 発言単位の検索本体
│  ├─ gian.json          # 議案メタ・一般質問者
│  └─ vectors.json       # 任意（量子化ベクトル）
├─ preview.html                            # 単体プレビュー（自動生成）
├─ scripts/build.mjs / build-preview.mjs    # 本番ビルド／開発プレビュー生成
├─ scripts/preview.tpl.html                 # 製品テンプレート（start(DATA)関数化）
├─ dist/                                    # ビルド成果物（build.mjs が生成）
│  ├─ 日野町議会-会議録検索.html            # オフライン配布用（データ埋め込み単一HTML）
│  └─ online/ (index.html + data/)          # GitHub Pages 配信用（fetch型）
└─ src/                                     # ［レガシー］旧React版（参考・製品では未使用）
```

---

## 4. データスキーマ

### meetings.json
```json
[
  {
    "id": "0000008489",
    "name": "令和7年6月定例会議",
    "type": "定例会",
    "era": "令和7年",
    "year": 2025,
    "url": "https://www.town.shiga-hino.lg.jp/0000008489.html",
    "pdfs": [
      { "label": "第2日(6月12日)", "date": "2025-06-12", "url": "https://www.town.shiga-hino.lg.jp/cmsfiles/contents/0000008/8489/20250612kaigiroku.pdf" }
    ]
  }
]
```

### index.json（発言単位／検索本体）
```json
[
  {
    "sid": "0000008489_20250612_0042",
    "meetingId": "0000008489",
    "meeting": "令和7年6月定例会議",
    "type": "定例会",
    "year": 2025, "era": "令和7年",
    "date": "2025-06-12",
    "pdf": "https://.../20250612kaigiroku.pdf",
    "role": "建設計画課長",
    "name": "杉本伸一",
    "agendaRef": "議第47号",
    "text": "福永議員より、議第47号 …（発言全文）…",
    "summary": "御門橋の架け替えは県が詳細設計中。冬期に下部工を発注予定。",  // 任意
    "topics": ["道路", "御門橋", "歩道整備"]                                  // 任意
  }
]
```

### gian.json（議案メタ）
```json
{
  "0000008489": {
    "agenda": [
      { "no": "議第46号", "kind": "契約", "title": "工事請負契約について（町道西大路鎌掛線道路改良工事（その12））" }
    ],
    "ippan": [ { "member": "谷口智哉", "theme": "高齢者福祉／チョイソコひの・i-Chan" } ]
  }
}
```

### toc.json（年度別カタログ／全会議の目次）
```json
[
  {
    "id": "0000008489",
    "name": "令和7年6月定例会議",
    "type": "定例会",
    "era": "令和7年",
    "year": 2025,
    "url": "https://www.town.shiga-hino.lg.jp/0000008489.html",
    "indexed": true,                                  // 全文検索可能か
    "pdfs": [ { "label": "第2日(6月12日)", "date": "2025-06-12", "url": "https://.../20250612kaigiroku.pdf" } ]
  }
]
```

### vectors.json（任意・セマンティック検索）
```json
{ "model": "multilingual-e5-small", "dim": 384, "dtype": "int8",
  "ids": ["0000008489_20250612_0042", "..."],
  "vecs": [[12,-4,...],[...]] }
```

---

## 5. ビルドパイプライン

> Node.js 20+ / ESM。`npm i pdfjs-dist cheerio @anthropic-ai/sdk @xenova/transformers`

### 5.1 lib/normalize.mjs（正規化）
```js
import variants from "../../dict/variants.json" assert { type: "json" };
const SKIP = /[\s\u3000、，,・]/;
const normChar = (c) => (variants[c] ?? c).normalize("NFKC").toLowerCase();

// 検索用：正規化文字列と「正規化index→元index」対応表
export function buildNorm(str) {
  let norm = ""; const map = [];
  for (let i = 0; i < str.length; i++) {
    if (SKIP.test(str[i])) continue;
    for (const cc of normChar(str[i])) { norm += cc; map.push(i); }
  }
  return { norm, map };
}
export function normTerm(t) {
  let r = ""; for (const c of t) if (!SKIP.test(c)) r += normChar(c); return r;
}
```

### 5.2 lib/eras.mjs（元号⇔西暦）
```js
const ERAS = [
  { name: "令和", base: 2018, start: 2019 },
  { name: "平成", base: 1988, start: 1989 },
  { name: "昭和", base: 1925, start: 1926 },
];
export const eraToYear = (name, n) => {
  const e = ERAS.find((x) => x.name === name); return e ? e.base + n : null;
};
export const yearToEra = (y) => {
  const e = ERAS.find((x) => y >= x.start); const n = y - e.base;
  return `${e.name}${n === 1 ? "元" : n}年`;
};
// "令和7"/"令和七"/"R7"/"2025" などを西暦へ正規化（検索の年展開に使用）
export function expandYear(token) {
  const m = token.match(/^(令和|平成|昭和|r|h|s)\s*([0-9０-９一二三四五六七八九十元]+)/i);
  if (m) { /* 漢数字・全角を算用へ変換して eraToYear */ }
  // … 実装は kanjiNum() を併用 …
}
```

### 5.3 lib/speech.mjs（発言分割・議案抽出）
```js
// 発言マーカー：役職/番号（氏名君）
const SPK = /([^\s\n、。「」（）]{1,16})（([^（）\n]{1,14})君）/g;
export function splitSpeeches(raw) {
  const marks = []; let m; SPK.lastIndex = 0;
  while ((m = SPK.exec(raw))) marks.push({ idx: m.index, after: SPK.lastIndex, role: clean(m[1]), name: clean(m[2]) });
  const out = [];
  if (!marks.length) return [{ role: "", name: "（本文）", text: raw }];
  if (marks[0].idx > 0) out.push({ role: "", name: "（会議録情報）", text: raw.slice(0, marks[0].idx) });
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].idx : raw.length;
    out.push({ role: mk.role, name: mk.name, text: raw.slice(mk.after, end).trim() });
  });
  return out;
}
const clean = (s) => s.replace(/[\s\u3000]/g, "");

// 議事日程から議案を抽出（議第/報第/議案第 … 区分はキーワードで推定）
export function extractGian(raw) {
  const head = raw.split(/会議の概要|開議|開会/)[0] || raw.slice(0, 4000);
  const items = [];
  const re = /(議第|報第|議案第|選第)\s*([0-9０-９]+)号[^\n。]{0,80}/g; let m;
  while ((m = re.exec(head))) {
    const title = m[0]; items.push({ no: `${m[1]}${toHalf(m[2])}号`, kind: guessKind(title), title: title.trim() });
  }
  return items;
}
const KIND = [["契約","工事請負|契約"],["予算","補正予算|予算"],["決算","決算"],
  ["人事","任命|推薦|選任|同意"],["条例","条例"],["路線","路線の認定|町道"],["報告","報告|比率|計算書"]];
const guessKind = (t) => (KIND.find(([,re]) => new RegExp(re).test(t)) || ["その他"])[0];
const toHalf = (s) => s.replace(/[０-９]/g, (d) => "0123456789"["０１２３４５６７８９".indexOf(d)]);
```

### 5.4 crawl.mjs（巡回 → meetings.json）
```js
import * as cheerio from "cheerio";
import { writeFileSync } from "node:fs";
const ROOT = "https://www.town.shiga-hino.lg.jp";
const INDEX = `${ROOT}/category/32-3-6-0-0-0-0-0-0-0.html`;

const get = async (u) => cheerio.load(await (await fetch(u)).text());

async function run() {
  const $ = await get(INDEX);
  // 会議ページ（/0000xxxxx.html）と年カテゴリページのリンクを収集
  const meetingUrls = new Set(), catUrls = new Set();
  $("a").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (/\/0000\d{5}\.html$/.test(href)) meetingUrls.add(new URL(href, ROOT).href);
    if (/category\/32-3-6-\d+/.test(href)) catUrls.add(new URL(href, ROOT).href);
  });
  for (const c of catUrls) {
    const $c = await get(c);
    $c("a").each((_, a) => { const h = $c(a).attr("href") || "";
      if (/\/0000\d{5}\.html$/.test(h)) meetingUrls.add(new URL(h, ROOT).href); });
  }
  const meetings = [];
  for (const url of meetingUrls) {
    const $m = await get(url);
    const name = $m("h1").first().text().trim();
    const pdfs = [];
    $m("a").each((_, a) => {
      const h = $m(a).attr("href") || "";
      if (/\/cmsfiles\/.+\.pdf$/i.test(h)) {
        const label = $m(a).text().replace(/\s+/g, " ").trim();
        pdfs.push({ label, date: guessDate(h, label), url: new URL(h, ROOT).href });
      }
    });
    if (pdfs.length) meetings.push({ id: url.match(/0000\d{5}/)[0], name, type: /臨時/.test(name) ? "臨時会" : "定例会", ...eraOf(name), url, pdfs });
  }
  writeFileSync("public/data/meetings.json", JSON.stringify(meetings, null, 2));
}
// guessDate: ファイル名 20250612kaigiroku.pdf 等から YYYY-MM-DD を推定。eraOf/era 等は lib を利用。
run();
```

### 5.5 extract.mjs（PDF → テキスト）
```js
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

export async function pdfToText(buf) {
  const doc = await getDocument({ data: new Uint8Array(buf) }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const c = await (await doc.getPage(p)).getTextContent();
    out += c.items.map((i) => i.str).join("") + "\n";
  }
  return out;
}
// meetings.json をもとに各PDFを取得→data/text/<sid>.txt へ保存（取得済みはキャッシュ）
```

### 5.6 index.mjs（索引生成）
```js
import { splitSpeeches } from "./lib/speech.mjs";
// 各会議の抽出テキストを発言分割し、メタを付けて index.json を生成
// （任意）enrich.mjs の summary/topics、embed.mjs の vectors をマージ
```

---

## 6. 辞書（よみ・同義語・異体字・元号）

辞書はコード本体から分離し、運用しながら育てる。日野町の地域特性を反映した初期値を同梱する。

### dict/variants.json（異体字 → 標準字）
```json
{ "髙":"高", "﨑":"崎", "𠮷":"吉", "德":"徳", "濵":"浜", "邊":"辺", "邉":"辺", "齋":"斎", "靑":"青", "𥔎":"崎" }
```

### dict/yomi.json（よみ → 漢字：難読地名・固有名詞）
```json
{
  "かいがけ":"鎌掛", "にしおおじ":"西大路", "ひさ":"必佐", "みなみひつさ":"南比都佐",
  "ひがしさくらだに":"東桜谷", "にしさくらだに":"西桜谷", "こいぐち":"小井口", "うちいけ":"内池",
  "まつお":"松尾", "かわら":"河原", "さいみょうじ":"西明寺", "とりいひら":"鳥居平",
  "がもう":"蒲生", "ひのな":"日野菜", "きたやまちゃ":"北山茶", "みかどばし":"御門橋",
  "しゃくなげがっこう":"しゃくなげ學校", "ひのきねんびょういん":"日野記念病院",
  "ほりえ":"堀江", "すぎうら":"杉浦", "たにぐち":"谷口", "ごとう":"後藤", "かわひがし":"川東",
  "ちょいそこ":"チョイソコ", "あいちゃん":"i-Chan"
}
```

### dict/synonyms.json（同義語・表記ゆれグループ）
```json
[
  ["子ども","子供","こども"], ["受付","受け付け"], ["取組","取り組み","取組み"],
  ["問合せ","問い合わせ"], ["ワクチン","予防接種"], ["コロナ","新型コロナウイルス","新型コロナ"],
  ["補正予算","補正"], ["ふるさと納税","ふるさと寄附"], ["公共交通","地域交通","オンデマンド交通"]
]
```

### 元号（lib/eras.mjs）
令和=2018+n／平成=1988+n／昭和=1925+n。検索時、`令和7`・`R7`・`2025` を相互展開。

---

## 7. 生成AI層（要約・分類・セマンティック検索・RAG）

すべて**任意**。鍵はGitHub Secrets（`ANTHROPIC_API_KEY` / `VOYAGE_API_KEY`）に置き、**ビルド時のみ**使用する（公開ページに鍵を出さない）。

### 7.1 要約・分類・テーマ抽出（enrich.mjs / Claude）
```js
import Anthropic from "@anthropic-ai/sdk";
const ac = new Anthropic();
export async function enrichMeeting(speeches, gian) {
  const corpus = speeches.map((s) => `【${s.role} ${s.name}】${s.text}`).join("\n").slice(0, 60000);
  const msg = await ac.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: "あなたは自治体議会の会議録を整理する編集者です。出力は指定のJSONのみ。",
    messages: [{ role: "user", content:
`次の会議録から、(1)200字以内の要約 summary、(2)主要トピック topics(最大8語)、(3)各議案の区分分類 gian(配列: {no, kind})を作成。kindは[契約,条例,予算,決算,人事,路線,報告,その他]。JSONのみ出力。
議案番号一覧: ${gian.map((g) => g.no).join(", ")}
本文:
${corpus}` }],
  });
  return JSON.parse(msg.content.map((c) => c.text || "").join(""));
}
```
> コスト最適化：同一会議の長文は**プロンプトキャッシュ**で再利用。発言ごとに呼ばず、会議単位でまとめて処理。

### 7.2 セマンティック検索（推奨：完全静的）
ビルド時に各発言を埋め込み、量子化して `vectors.json` に保存。クエリは**ブラウザ内で同じモデル**で埋め込み、コサイン類似度で上位を返す（鍵不要・サーバー不要）。

embed.mjs（ビルド時／@xenova/transformers）
```js
import { pipeline } from "@xenova/transformers";
const fe = await pipeline("feature-extraction", "Xenova/multilingual-e5-small");
export async function embed(texts, kind = "passage") {
  const out = [];
  for (const t of texts) {
    const r = await fe(`${kind}: ${t}`, { pooling: "mean", normalize: true });
    out.push(Array.from(r.data));   // 384次元・正規化済み
  }
  return out; // 量子化(int8)して保存推奨
}
```
src/semantic.js（ブラウザ／クエリ埋め込み＋コサイン）
```js
import { pipeline } from "@xenova/transformers"; // CDN/同梱
let fe; const load = async () => (fe ??= await pipeline("feature-extraction", "Xenova/multilingual-e5-small"));
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0); // 正規化済みなら内積=コサイン
export async function semanticSearch(query, vectors, ids, topK = 20) {
  await load();
  const q = Array.from((await fe(`query: ${query}`, { pooling: "mean", normalize: true })).data);
  return ids.map((id, i) => ({ id, score: cos(q, dequant(vectors[i])) }))
            .sort((a, b) => b.score - a.score).slice(0, topK);
}
```

**高品質オプション（Voyage AI）**：ドキュメント埋め込みはビルド時に `voyage-3.5`／`voyage-4`（正規化済み・1024次元）で生成。クエリ埋め込みのみ Cloudflare Workers 等の軽量プロキシで `input_type:"query"` を付けて実行（GitHub Pages 単体では鍵を出せないため）。

### 7.3 質問応答（RAG）
キーワード＋ベクトルで上位発言を取得 →（必要なら Cohere/Voyage reranker）→ Claude へ「該当発言＋出典(発言者・日付・PDF)」を渡し、出典つきで回答。索引が約50万字未満なら、RAGなしで関連会議の全文を直接 Claude に渡す簡易構成でも可（プロンプトキャッシュ併用）。

> 参考：Anthropic「Contextual Retrieval」。Embeddings＋BM25＋reranking の併用で検索失敗を最大67%削減。

---

## 8. フロントエンド

ノービルドのバニラJS（ビルド工程なし）。`scripts/preview.tpl.html` を唯一のテンプレートとし、`npm run build` で2種を生成：オフライン配布用の自己完結HTML（データ埋め込み・ダブルクリックで起動・閉域NW共有ドライブ向き）と、オンライン用 `index.html`（`public/data/*.json` を fetch・GitHub Pages 向き）。セマンティック検索ONのときはキーワード結果と意味結果を統合（オンライン時のみ）。

URLクエリで検索状態を共有（ダッシュボード連携に使用）：
```
/?q=御門橋&speaker=杉本伸一&year=2025&type=定例会
```

---

## 9. 一般質問ダッシュボードとの連携

2つは**用途が異なる**ため、疎結合で役割分担する。

| | 一般質問ダッシュボード | 本システム（議事録検索） |
|---|---|---|
| 由来 | 議会だより | 会議録（全文） |
| 役割 | 一般質問の**俯瞰・分析**（誰が何を、テーマ集計） | 質疑・答弁・議案・討論まで**全文を引く**出典確認 |
| 粒度 | 質問項目 | 発言（発言者単位） |

**連携方法**
- 共通の**議員マスタ・会議マスタ**（氏名・会議ID・日付）を1つのJSONで共有。
- ダッシュボードの各質問 → 「議員名＋日付」で本システムへ**ディープリンク**（`/?q=…&speaker=…&date=…`）。
- 本システムの議案一覧の議員名 → ダッシュボードを開く（`DASHBOARD_URL` を設定）。

---

## 10. セットアップとローカル実行

```bash
git clone <repo> && cd gikai-search
npm install

# 1) データ生成（巡回→抽出→分割→索引）
npm run crawl       # public/data/meetings.json
npm run extract     # data/text/*.txt（PDFキャッシュ）
npm run index       # public/data/index.json, gian.json

# 2) 任意：AI付与・埋め込み（要 ANTHROPIC_API_KEY / なくても可）
npm run enrich
npm run embed       # public/data/vectors.json

# 3) フロント生成（ノービルド）
npm run preview     # preview.html（開発確認用・データ内蔵）
npm run build       # dist/日野町議会-会議録検索.html（オフライン）＋ dist/online/（オンライン）
#   完全オフラインで原本PDFも同梱：  HINO_BUNDLE_PDF=1 npm run build
```

package.json（抜粋）
```json
{ "type": "module",
  "scripts": {
    "crawl": "node scripts/crawl.mjs",
    "extract": "node scripts/extract.mjs",
    "index": "node scripts/index.mjs",
    "enrich": "node scripts/enrich.mjs",
    "embed": "node scripts/embed.mjs",
    "build": "node scripts/build.mjs",
    "preview": "node scripts/build-preview.mjs"
  } }
```

---

## 11. GitHub Pages デプロイ

新しい会議録が出たら自動で再ビルド＆公開する。`.github/workflows/build-deploy.yml`：
```yaml
name: build-deploy
on:
  schedule: [{ cron: "0 0 * * 1" }]   # 毎週月曜（任意）
  workflow_dispatch: {}
  push: { branches: [main] }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run crawl && npm run extract && npm run index
      - run: npm run enrich && npm run embed
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          VOYAGE_API_KEY: ${{ secrets.VOYAGE_API_KEY }}
        continue-on-error: true        # AIは任意。失敗してもキーワード検索は動く
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.dep.outputs.page_url }}" }
    steps:
      - id: dep
        uses: actions/deploy-pages@v4
```
> Settings → Pages を「GitHub Actions」に設定。配信対象は `dist/online`（`upload-pages-artifact` の `path`）。fetch型なので相対パスで動作し、リポジトリ名に依存しません。オフライン配布は `dist/日野町議会-会議録検索.html` を共有ドライブへ。

---

## 12. ロードマップ

- [x] 発言単位の全文検索（AND/OR/NOT・ハイライト・PDFリンク）
- [x] 正規化（NFKC・異体字・空白）＋ よみ・同義語辞書
- [x] 元号⇔西暦変換
- [x] 議案一覧・区分分類（件名の複数行結合・ページ番号除去対応）
- [x] 会議録一覧（年度別カタログ `toc.json`）と会議録単位の絞り込み
- [x] 分野クイック検索（`dict/topics.json`）・発言者コンボボックス
- [x] UI：3タブ・初期ガイド・ページネーション・全文展開・条件クリア・先頭へ戻る
- [x] 単体プレビュー（`preview.html` 自動生成）
- [x] 一般質問ダッシュボード連携設計
- [x] 生成AI層（要約・分類・セマンティック検索・RAG）設計と実装コード
- [ ] 全会議録の自動取り込み（本番でのフル巡回〜索引：現状はデモ3会議＋全64会議カタログ）
- [ ] GitHub Pages 公開（役場関係者レビュー）
- [ ] 生成AI付与・セマンティック検索の本番有効化
- [ ] 議案区分の分類精度向上、漢数字⇔算用数字の正規化、辞書の継続拡充
- [ ] reranker 併用のハイブリッド検索の精度評価
- [ ] アクセシビリティ（JIS X 8341-3）対応・読み上げ最適化

---

## 13. ライセンス・免責

- ソフトウェア：MIT License を想定（`LICENSE` を別途配置）。
- データ：日野町ホームページ「会議録」の公開PDFを出典とする。再配布・二次利用は出典元の利用条件に従う。
- 本システムの検索結果は機械処理によるもので、原本と差異が生じ得る。正確な内容は各PDF（原本）で確認すること。
- 生成AIによる要約・分類・回答は補助情報であり、正確性を保証しない。重要な判断は原文を確認すること。
