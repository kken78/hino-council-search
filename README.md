# 日野町議会 議事録横断検索システム

会議録PDF（日ごと）に分散している日野町議会の議事録を、**発言単位で全文検索**できる静的Webアプリです。表記ゆれ・難読地名のよみ・元号⇄西暦を吸収し、議案一覧の閲覧、一般質問ダッシュボードとの連携、注目テーマの自動抽出、生成AIによる要約・分類・セマンティック検索までを含みます。サーバー不要で **GitHub Pages** で運用します。

> 出典データ：日野町ホームページ「会議録」 https://www.town.shiga-hino.lg.jp/category/32-3-6-0-0-0-0-0-0-0.html
> 本システムは検索・公開用に作成したテキストを用いており、原本と一部異なる場合があります。正確な内容は各PDFでご確認ください。

---

## 更新履歴

### 2026-07-01
- **全件取り込み**：デモ3会議から **全64会議・29,784発言・議案1,139件・一般質問者408名** のフル索引へ拡大。
- **初回検索フリーズの解消**：正規化を「実行時」から「**ビルド時の `norm` 事前計算**」へ移行。照合を `matchNorm` 化して検索経路での全件 `map` 生成を撤去し、ハイライトは表示中の20件だけ計算。打鍵検索を180msデバウンス。
  - リポジトリの `public/data/index.json` は **`norm` 無し（軽量）** で保持。`norm` は **配布物（`preview.html`／`dist/online`／オフラインHTML）にビルド時だけ注入**する（`build.mjs`／`build-preview.mjs`）。
- **注目テーマ**：「よく検索される語」（直書き8語）を廃止し、`public/data/highlights.json` を読む **「議会で議論になっているテーマ」1行表示（政策体系順・根拠つき）** に置換。生成は `scripts/highlights.mjs`（`ANTHROPIC_API_KEY` があればAI抽出、無ければ決定論フォールバック）。今回の初期版は会議録を分析して手作業で作成（数値は実データ集計）。
- **ローカルPDF閲覧**：`preview.html`（ローカル用）のPDFリンクを、手元フォルダ **`議事録本体/<会議ID>_<ファイル名>`** に向けるよう変更（会議をまたいでファイル名が重複するため会議IDを前置）。一括ダウンロードは `scripts/fetch-pdfs.mjs`。**本番はURLのまま**。
- **会議ページリンク**：会議録一覧の「会議ページ↗」の遷移先を、議事録ページから **「本会議のご案内」（category/32-3-5）** の各会議ページへ変更。**ローカル `preview.html` では非表示**。対応表 `public/data/meeting_pages.json`、再生成は `scripts/crawl-pages.mjs`。
- **preview.html の外部リンク除去**：完全ローカル用のため、フッターに直書きされた外部リンク（「議会だよりダッシュボードを開く」）を `build-preview.mjs` が preview.html から自動除去。PDF・会議ページのリンクは既にローカル化／非表示のため、これで preview.html から**インターネット向けURLのリンクは無くなる**（出典表記などの本文テキストは維持）。本番（online/offline）はダッシュボードリンクを維持。

---

## 実装状況（最新スナップショット）

このリポジトリは README の設計に沿って実装済みで、ローカルで end-to-end が動作します。

**できていること**
- ビルドパイプライン：`crawl`（巡回→`meetings.json`＋全会議カタログ`toc.json`）／`extract`（PDF→テキスト、`data/text/` にキャッシュ）／`index`（発言分割・正規化・議案抽出→`index.json`・`gian.json`）。
- 正規化検索：AND（スペース）・OR・NOT（先頭`-`）、NFKC＋異体字（髙＝高）＋空白除去、よみ→漢字（かいがけ→鎌掛）、同義語、元号⇔西暦（2025⇔令和7⇔R7）。前後文脈ハイライト。**正規化文字列は `index.mjs`/ビルド時に事前計算**して照合コストを最小化。
- フロント（**ノービルドの単一HTML／バニラJS**）：検索ファースト・自治体向けデザイン（紺マストヘッド＋日野菜アクセント＋役職バッジ）。3タブ＝**発言を検索／議案・一般質問／会議録一覧（目次）**。注目テーマ（議会で議論になっているテーマ）、会議・発言者・区分・種別の絞り込み、ページネーション、全文展開、アクセシビリティ対応。`npm run build` で「オフライン配布用の単一HTML」と「オンライン用 index.html」を生成。
- 注目テーマ：`highlights.json` を読み「議会で議論になっているテーマ」を政策体系順に1行表示。各チップはクリックでOR検索、ホバーで根拠（「N会議・M議員が取り上げ」）を表示。
- ローカルPDF：`preview.html` はPDFリンクを `議事録本体/` の手元PDFへ向ける（`fetch-pdfs.mjs` で一括取得）。本番はオンラインURL。
- 会議ページ導線：会議録一覧の「会議ページ↗」は「本会議のご案内」の各会議ページへ（本番のみ表示）。
- 単体プレビュー：`preview.html`（索引データ内蔵・サーバ不要で開ける挙動確認用。`scripts/build-preview.mjs` で再生成）。

**データ状況（本番・フル取り込み済み）**
- 目次カタログ：**64会議（2017〜2026）**。
- 全文索引：**全64会議・約29,784発言・議案約1,139件・一般質問者408名**。
- 追加取り込みは `npm run crawl && npm run extract && npm run index` を実行すれば自動拡大します（巡回は元の会議録一覧を辿ります）。

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
- **結果表示**：該当会議録数／該当発言数／ヒット箇所数を表示。本文中のヒット語を前後文脈つきでハイライトし、該当日のPDFへ遷移（ローカルは手元PDF、本番はオンラインURL）。
- **会議ページ導線**：会議録一覧から各会議の「本会議のご案内」ページへ遷移（本番のみ）。
- **並び順**：開催日の新しい順（既定）／関連度（ヒット数）。

### 1.2 表記ゆれ吸収（正規化）
照合の前に、本文とクエリの双方を同一の正規形へ変換する。本文側の正規形はビルド時に `norm` として事前計算し、実行時の正規化コストをゼロにする。
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

### 1.4 注目テーマ（highlights）
検索ボックス直下に **「議会で議論になっているテーマ」** を政策体系順（総務→民生→衛生→農林→商工→土木→消防→教育）で1行表示。各チップはクリックでOR検索を実行し、ホバーで根拠（例：「50会議・26議員が取り上げ」）を表示する。データは `public/data/highlights.json`（無ければ従来の頻出語にフォールバック）。生成は `scripts/highlights.mjs`：
- `ANTHROPIC_API_KEY` があればビルド時に Claude でテーマ候補を抽出。
- キーが無い／`HINO_HL_NOAI=1` のときは決定論フォールバック。
- テーマの会議数・議員数などの**定量シグナルは常に実データ集計**で付与するため、根拠は事実ベース。

### 1.5 生成AI機能（任意）
- 会議・議案ごとの**要約**、**区分の自動分類**、一般質問の**テーマ抽出**（ビルド時に Claude で付与）。
- **セマンティック検索**（意味で探す）：埋め込みベクトルによる類似発言検索。
- **質問応答（RAG）**：「○○について町はどう答弁した？」に出典つきで回答。

---

## 2. アーキテクチャ

重い処理（巡回・抽出・分割・AI付与・索引化）は**事前ビルド**に寄せ、公開ページは生成済みJSONを読むだけの**完全静的サイト**にする。正規化文字列（`norm`）や注目テーマ（`highlights`）もビルド時に用意し、実行時は読むだけにする。

```
            ┌──────────────── ビルド（ローカル）────────────────┐
            │                                                                              │
 日野町HP ─▶│ 1.crawl  会議一覧/各会議ページを巡回 → meetings.json（PDF URL一覧）          │
 (会議録)   │ 2.extract  PDF → テキスト（pdfjs）                                            │
            │ 3.split   発言分割（発言者＋発言）＋ 議案抽出（議事日程）                      │
            │ 4.enrich  ★Claude: 要約・分類・テーマ抽出（任意）                             │
            │ 5.embed   ★埋め込みベクトル生成（任意・セマンティック検索用）                 │
            │ 6.index   正規化＋辞書適用 → index.json / gian.json（norm はビルド物側で付与）  │
            │ 7.highlights / crawl-pages  注目テーマ・会議ページ対応表を生成（任意）        │
            │                                                                              │
            └───────────────────────────────┬──────────────────────────────────────────────┘
                                            ▼  public/data/*.json をリポジトリへコミット
        ┌──────────────── 公開（GitHub Actions → GitHub Pages・静的）────────────────┐
        │  Actions は build.mjs のみ実行：コミット済み索引から dist/online を生成し配信 │
        │  静的フロント（単一HTML/バニラ）：索引JSONを読み、正規化検索                  │
        └────────────────────────────────────────────────────────────────────────────┘
```

- データ規模の目安：日野町議会の会議録は全文でも数百万字程度。**索引が 200,000 トークン（約500ページ）未満**ならRAGなしで「全文をそのままLLMに渡す」運用も可能（プロンプトキャッシュ併用）。本件はこの範囲に収まる見込み。
- `norm` 事前計算の分離：リポジトリの `index.json` は `norm` 無しで軽量に保ち、`build.mjs`／`build-preview.mjs` が配布物（online/offline/preview）にだけ `norm` を注入する。これにより「履歴を軽く保ちつつ、初回検索は即応答」を両立する。
- セマンティック検索はGitHub Pages前提のため、**ブラウザ内埋め込み（transformers.js + 多言語E5）**を主構成とし、クエリもブラウザで埋め込む。より高品質を求める場合は **Voyage AI**（Anthropic推奨）をビルド時のドキュメント埋め込みに用い、クエリ埋め込みのみ軽量プロキシ（Cloudflare Workers 等）で行う構成にする。

---

## 3. ディレクトリ構成

```
gikai-search/
├─ README.md / DEV_NOTES.md                # 仕様 / 実装・運用メモ
├─ package.json / vite.config.js / index.html / LICENSE / .gitignore
├─ .github/workflows/build-deploy.yml      # push時ビルド＆Pagesデプロイ（build.mjs のみ）
├─ scripts/                                # ビルドパイプライン（Node ESM）
│  ├─ crawl.mjs          # 巡回 → meetings.json ＋ toc.json
│  ├─ crawl-pages.mjs    # 「本会議のご案内」(32-3-5)巡回 → meeting_pages.json
│  ├─ extract.mjs        # PDF → テキスト（pdfjs, data/text にキャッシュ）
│  ├─ index.mjs          # 発言分割・議案抽出 → index/gian、toc更新
│  ├─ enrich.mjs         # 任意（Claude：要約・分類）
│  ├─ embed.mjs          # 任意（埋め込み）
│  ├─ highlights.mjs     # 注目テーマ生成 → highlights.json（AI/フォールバック）
│  ├─ fetch-pdfs.mjs     # 会議録PDFを 議事録本体/ に一括DL（ローカル閲覧用）
│  ├─ build.mjs          # 本番ビルド（dist/online・オフラインHTML。norm/highlights/pages を注入）
│  ├─ build-preview.mjs  # 単体プレビュー preview.html を生成（ローカル向け書き換え込み）
│  ├─ preview.tpl.html   # 唯一のテンプレート（start(DATA) 関数化）
│  └─ lib/
│     ├─ normalize.mjs   # NFKC＋異体字＋空白除去（buildNorm / buildNormStr / normTerm）
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
├─ public/data/                            # 公開する索引（フロントが読む・コミット対象）
│  ├─ meetings.json      # 全文索引対象の会議
│  ├─ toc.json           # 年度別カタログ（全会議の目次）
│  ├─ index.json         # 発言単位の検索本体（リポジトリ版は norm 無しで軽量）
│  ├─ gian.json          # 議案メタ・一般質問者
│  ├─ highlights.json    # 注目テーマ（議会で議論になっているテーマ）
│  ├─ meeting_pages.json # 会議録ID → 「本会議のご案内」ページURL の対応表
│  └─ vectors.json       # 任意（量子化ベクトル）
├─ 議事録本体/                              # ローカル閲覧用DL先（.gitignore・コミットしない）
│  └─ <会議ID>_<ファイル名>.pdf
├─ preview.html                            # 単体プレビュー（自動生成・.gitignore）
├─ dist/                                    # ビルド成果物（build.mjs が生成・.gitignore）
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
    "norm": "…",     // 照合用の正規化文字列。ビルド物側で付与（リポジトリの index.json には無い）
    "summary": "御門橋の架け替えは県が詳細設計中。冬期に下部工を発注予定。",  // 任意
    "topics": ["道路", "御門橋", "歩道整備"]                                  // 任意
  }
]
```
> `norm` は `build.mjs`／`build-preview.mjs` が配布物へ書き出す際に `buildNormStr(text)` で付与する。リポジトリの `public/data/index.json` は `norm` 無しで軽量に保つ。フロントは `norm` があればそれを使い、無ければ起動時に一度だけ生成する。

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

### highlights.json（注目テーマ）
```json
{
  "generatedAt": "2026-07-01",
  "source": "curated(claude-analysis)",
  "label": "議会で議論になっているテーマ",
  "themes": [
    { "label": "子育て・保育", "query": "子育て OR 保育 OR こども園 OR 放課後児童", "reason": "50会議・26議員が取り上げ" }
  ]
}
```
> `label` を見出し、`themes` を政策体系順に1行表示。`query` はクリック時のOR検索式、`reason` はホバー表示の根拠（実データ集計）。

### meeting_pages.json（会議ページ対応表）
```json
{
  "0000008489": "https://www.town.shiga-hino.lg.jp/0000008290.html"
}
```
> 会議録ID → 「本会議のご案内」（category/32-3-5）の各会議ページURL。`crawl-pages.mjs` が「年＋種別＋月」で会議録側（toc.json）と突き合わせて生成。

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
NFKC＋異体字＋空白除去＋小文字化。ハイライト用の対応表つき `buildNorm`（norm＋map）、照合専用の軽量 `buildNormStr`（norm文字列のみ）、クエリ用 `normTerm` を提供。フロント側の正規化と**完全に同一のルール**であることが必須（ズレると検索がヒットしなくなる）。
```js
const SKIP = /[\s\u3000、，,・･\-－―ー~〜]/;
const normChar = (c) => (variants[c] ?? c).normalize("NFKC").toLowerCase();

// ハイライト用：正規化文字列と「正規化index→元index」対応表
export function buildNorm(str) {
  let norm = ""; const map = [];
  for (let i = 0; i < str.length; i++) {
    if (SKIP.test(str[i])) continue;
    for (const cc of normChar(str[i])) { norm += cc; map.push(i); }
  }
  return { norm, map };
}
// 照合専用：正規化“文字列だけ”（map不要・軽量）。ビルド時に index の norm を作るのに使う。
export function buildNormStr(str) {
  let norm = "";
  for (let i = 0; i < str.length; i++) {
    if (SKIP.test(str[i])) continue;
    for (const cc of normChar(str[i])) norm += cc;
  }
  return norm;
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
```

### 5.4 index.mjs（索引生成）
各会議の抽出テキストを発言分割し、メタ（会議・種別・年・元号・発言者・議案参照など）を付けて `index.json` を生成。議案は議事日程・目次から抽出して `gian.json` に、一般質問者も推定して格納。`toc.json` の `indexed` フラグも更新する。
> `norm` はここでは付けず（リポジトリの `index.json` を軽量に保つため）、配布物を作る `build.mjs`／`build-preview.mjs` 側で `buildNormStr` により注入する。全件を常時埋め込みたい場合は `index.mjs` で `rec.norm = buildNormStr(rec.text)` を付ける運用も可。

### 5.5 highlights.mjs（注目テーマ生成）
`index.json`・`gian.json` を読み、テーマ候補（AIまたはフォールバック）を会議録本文で採点し、`public/data/highlights.json` を出力する。
- `ANTHROPIC_API_KEY` があれば Claude で候補抽出（`HINO_HL_MODEL` でモデル指定可）。
- 無い／`HINO_HL_NOAI=1` のときは決定論フォールバック。
- 会議数・議員数などの定量シグナルは常に実データ集計で付与（根拠は事実ベース）。
- `HINO_HL_TOP` で表示件数を調整。

### 5.6 crawl-pages.mjs（会議ページ対応表）
「本会議のご案内」（category/32-3-5）を巡回し、`toc.json` の各会議と「年＋種別＋月」で突き合わせて `public/data/meeting_pages.json`（会議録ID→案内ページURL）を生成する。新しい会議が増えたら再実行。

### 5.7 fetch-pdfs.mjs（ローカルPDF一括取得）
`meetings.json`・`toc.json` の全PDFを `議事録本体/<会議ID>_<ファイル名>.pdf` にダウンロードする（会議をまたいでファイル名が重複するため会議IDを前置）。`build-preview.mjs` が張るローカルリンクと同じ命名なので、取得後 `preview.html` からそのまま開ける。既存分はスキップ（再実行で差分のみ取得）。

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

すべて**任意**。鍵は各自の環境変数（`ANTHROPIC_API_KEY` / `VOYAGE_API_KEY`）に置き、**ビルド時のみ**使用する（公開ページに鍵を出さない）。生成物（`highlights.json` 等）はコミットして配信するため、公開デプロイのCIに鍵を置く必要はない。

### 7.1 要約・分類・テーマ抽出（enrich.mjs / highlights.mjs / Claude）
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
> コスト最適化：同一会議の長文は**プロンプトキャッシュ**で再利用。発言ごとに呼ばず、会議単位でまとめて処理。注目テーマ（`highlights.mjs`）は全体をまとめて1回で抽出する。

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

**高品質オプション（Voyage AI）**：ドキュメント埋め込みはビルド時に `voyage-3.5`／`voyage-4`（正規化済み・1024次元）で生成。クエリ埋め込みのみ Cloudflare Workers 等の軽量プロキシで `input_type:"query"` を付けて実行（GitHub Pages 単体では鍵を出せないため）。

### 7.3 質問応答（RAG）
キーワード＋ベクトルで上位発言を取得 →（必要なら Cohere/Voyage reranker）→ Claude へ「該当発言＋出典(発言者・日付・PDF)」を渡し、出典つきで回答。索引が約50万字未満なら、RAGなしで関連会議の全文を直接 Claude に渡す簡易構成でも可（プロンプトキャッシュ併用）。

> 参考：Anthropic「Contextual Retrieval」。Embeddings＋BM25＋reranking の併用で検索失敗を最大67%削減。

---

## 8. フロントエンド

ノービルドのバニラJS（ビルド工程なし）。`scripts/preview.tpl.html` を唯一のテンプレートとし、`npm run build` で2種を生成：オフライン配布用の自己完結HTML（データ埋め込み・ダブルクリックで起動・閉域NW共有ドライブ向き）と、オンライン用 `index.html`（`public/data/*.json` を fetch・GitHub Pages 向き）。`build-preview.mjs` は開発確認用の `preview.html` を生成する。

テンプレートは `start(DATA)` にデータを渡して起動し、`DATA` は次を含む：`index / gian / toc / meetings / dict / topics / highlights / pages / local`。

- **注目テーマ**：`highlights`（無ければ従来の頻出語）を「議会で議論になっているテーマ」として1行表示。
- **PDFリンク**：`build-preview.mjs` はローカル用に `議事録本体/<会議ID>_<ファイル名>` へ書き換える（本番はURL維持。`HINO_PDF_ONLINE=1` で無効化可、`HINO_PDF_DIR` でフォルダ名変更可）。
- **会議ページ**：`local` が真（=preview.html）なら「会議ページ↗」を非表示。本番は `pages`（`meeting_pages.json`）の案内ページURL、無ければ従来の議事録ページURLにフォールバック。
- **外部リンク（ローカル）**：`build-preview.mjs` はフッター等に直書きされた外部URL（`http(s)://` の静的 `<a>`。現状は「議会だよりダッシュボード」リンク）を preview.html から除去する。完全ローカル用のため、preview.html はインターネット向けURLのリンクを持たない。本番の `build.mjs` はダッシュボードリンクを維持。
- **正規化**：`index[i].norm` があればそれで照合（実行時の正規化ゼロ）。無ければ起動時に一度だけ生成。打鍵検索は180msデバウンス。

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
git clone <repo> && cd hino-council-search
npm install

# 1) データ生成（巡回→抽出→分割→索引）
npm run crawl       # public/data/meetings.json
npm run extract     # data/text/*.txt（PDFキャッシュ）
npm run index       # public/data/index.json, gian.json

# 2) 任意：注目テーマ・AI付与・埋め込み・会議ページ対応表
node scripts/highlights.mjs        # public/data/highlights.json（要 ANTHROPIC_API_KEY／無ければフォールバック）
#   HINO_HL_NOAI=1 node scripts/highlights.mjs  … AIを使わず決定論のみ
node scripts/crawl-pages.mjs       # public/data/meeting_pages.json（会議ページ対応表・要ネット）
npm run enrich                     # 任意（要約・分類）
npm run embed                      # 任意（vectors.json）

# 3) ローカル閲覧用PDFの取得（任意・要ネット）
node scripts/fetch-pdfs.mjs        # 議事録本体/ に全PDFをDL（.gitignore 推奨）

# 4) フロント生成（ノービルド）
npm run preview     # preview.html（開発確認用・データ内蔵・ローカルPDF/会議ページ非表示）
npm run build       # dist/日野町議会-会議録検索.html（オフライン）＋ dist/online/（オンライン）
#   PDFリンクをオンラインURLのまま preview したい：  HINO_PDF_ONLINE=1 npm run preview
```

主な環境変数
- `HINO_PDF_ONLINE=1` … preview.html のPDFリンクをローカル化せずURLのままにする。
- `HINO_PDF_DIR=名前` … ローカルPDFフォルダ名（既定 `議事録本体`）。`fetch-pdfs.mjs` と揃える。
- `HINO_HL_NOAI=1` / `HINO_HL_MODEL` / `HINO_HL_TOP` … 注目テーマ生成の制御。
- `HINO_BUNDLE_PDF=1` … `npm run build` 時に原本PDFを dist に同梱（完全オフライン配布用）。

package.json（抜粋）
```json
{ "type": "module",
  "scripts": {
    "crawl": "node scripts/crawl.mjs",
    "extract": "node scripts/extract.mjs",
    "index": "node scripts/index.mjs",
    "enrich": "node scripts/enrich.mjs",
    "embed": "node scripts/embed.mjs",
    "highlights": "node scripts/highlights.mjs",
    "fetch-pdfs": "node scripts/fetch-pdfs.mjs",
    "crawl-pages": "node scripts/crawl-pages.mjs",
    "build": "node scripts/build.mjs",
    "preview": "node scripts/build-preview.mjs"
  } }
```

> `議事録本体/`・`preview.html`・`dist/` は `.gitignore` 対象（生成物・大容量PDFはコミットしない）。`public/data/*.json`（`index.json`・`highlights.json`・`meeting_pages.json` 等）はコミットして配信する。

---

## 11. GitHub Pages デプロイ

公開デプロイは **コミット済みの `public/data/*.json` から `build.mjs` で `dist/online` を生成して配信**する。巡回・抽出・索引・注目テーマ・会議ページ対応表の生成はローカルで行い、その結果（JSON）をコミットする運用。`.github/workflows/build-deploy.yml`：
```yaml
name: build-deploy
on:
  workflow_dispatch: {}
  push: { branches: [main] }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - name: フロント生成（コミット済み索引からビルド）
        run: node scripts/build.mjs
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist/online }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.dep.outputs.page_url }}" }
    steps:
      - id: dep
        uses: actions/deploy-pages@v4
```
> Settings → Pages を「GitHub Actions」に設定。配信対象は `dist/online`。fetch型なので相対パスで動作し、リポジトリ名に依存しません。オフライン配布は `dist/日野町議会-会議録検索.html` を共有ドライブへ。CIはコミット済みデータを読むだけなので、AI用の鍵をCIに置く必要はありません（`highlights.json` 等はローカルで生成してコミット）。

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
- [x] 全会議録の自動取り込み（全64会議・約29,784発言をフル索引化）
- [x] 初回検索フリーズの解消（正規化のビルド時 `norm` 事前計算＋map生成撤去＋デバウンス）
- [x] 注目テーマ「議会で議論になっているテーマ」（`highlights.json` / `highlights.mjs`）
- [x] ローカルPDF閲覧（`議事録本体/` ＋ `fetch-pdfs.mjs`）・会議ページ案内リンク（`meeting_pages.json` / `crawl-pages.mjs`）
- [ ] GitHub Pages 公開（役場関係者レビュー）
- [ ] 生成AI付与・セマンティック検索の本番有効化
- [ ] 注目テーマのAI再生成の本番運用（各自キーで `highlights.mjs`）
- [ ] 議案区分の分類精度向上、漢数字⇔算用数字の正規化、辞書の継続拡充
- [ ] reranker 併用のハイブリッド検索の精度評価
- [ ] アクセシビリティ（JIS X 8341-3）対応・読み上げ最適化

---

## 13. ライセンス・免責

- ソフトウェア：MIT License を想定（`LICENSE` を別途配置）。
- データ：日野町ホームページ「会議録」の公開PDFを出典とする。再配布・二次利用は出典元の利用条件に従う。
- 本システムの検索結果は機械処理によるもので、原本と差異が生じ得る。正確な内容は各PDF（原本）で確認すること。
- 生成AIによる要約・分類・回答は補助情報であり、正確性を保証しない。重要な判断は原文を確認すること。
