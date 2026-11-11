# 日野町議会 議事録横断検索システム

会議録PDF（日ごと）に分散している日野町議会の議事録を、**発言単位で全文検索**できる静的Webアプリです。表記ゆれ・難読地名のよみ・元号⇄西暦を吸収し、議案一覧の閲覧、一般質問ダッシュボードとの連携、注目テーマの自動抽出、生成AIによる要約・分類・セマンティック検索までを含みます。サーバー不要で **GitHub Pages** で運用します。

> 出典データ：日野町ホームページ「会議録」 https://www.town.shiga-hino.lg.jp/category/32-3-6-0-0-0-0-0-0-0.html
> 本システムは検索・公開用に作成したテキストを用いており、原本と一部異なる場合があります。正確な内容は各PDFでご確認ください。

---

## 更新履歴

### 2026-11-07（質疑の台帳）
- 議案質疑の議案ごとの発言・回・答弁を、人が確認した台帳（`data/shitsugi.tsv` 1,103行・`data/shitsugi-chair.tsv` 8行。520区切りの全件確認による）から作るようにした。`proceedings.json` の質疑の区切りに `parts`・`chair`・`ledger` を足し、`bills` を台帳の議案にそろえた。やりとりの表示と MCP（v0.6.0）は台帳の種類と議案から見出しを付ける。台帳の検査は `npm run check:ledger`、台帳に無い区切りの下書きは `npm run ledger:draft -- --kind shitsugi`。決まりは「4. データスキーマ」の「質疑の構造の決まり」。

### 2026-11-07（一般質問の台帳）
- 一般質問の問いの境目・回・方式・題を、人が確認した台帳（`data/ippan.tsv` 964行・`data/ippan-chair.tsv` 18行。467区切りの全件確認による）から作るようにした。`proceedings.json` の一般質問の区切りに `questions`・`chair`・`ledger` を足し、やりとりの表示と MCP（v0.5.0）は台帳の種類から見出しを付ける。台帳の検査は `npm run check:ledger`、台帳に無い区切りの下書きは `npm run ledger:draft`。決まりは「4. データスキーマ」の「一般質問の構造の決まり」。

### 2026-10-10
- **データ更新**：令和8年3月定例会議・令和8年5月臨時会議を追加し、**全66会議・31,263発言・議案1,175件・一般質問者421名** に拡大。会議ページ対応表（`meeting_pages.json`）も更新。

### 2026-10-10（他自治体への展開）
- 自治体ごとの値（巡回先・ページ形式・PDFの形式・表題・出典・敬称・議会だよりの取得先）を `site.config.json` に切り出した。日野町の出力は変わらない（ビルド3種・データとも一致を確認）。他の自治体で使う手順は `FORK.md`。

### 2026-10-10（データ精度）
- 採決結果の取得率 96.3%→98.2%（「…について、原案のとおり同意」型・委員会の設置/定数変更・撤回などに対応）。目次の「〔質疑・討論・採決〕」が件名に残り、決議が「議案第1号」と重複していたのを解消。
- 一般質問の質問項目が取れない質問者を 68→33 名に（答弁の言い回しの揺れに対応し、取れないときは議員の質問文から取る）。
- 注目テーマを `dict/highlight-themes.json` で定義する方式にし、「自治会・公民館」「環境・ごみ」「歴史・文化財」を追加（17テーマ、件数は最新データで再集計）。

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
- 一般質問の台帳：467区切り・964問のすべてについて、問いの境目・発言の種類・方式・題を人が確認した台帳（`data/ippan.tsv`・`data/ippan-chair.tsv`）を持ち、画面と MCP はこれから作る。機械の推定は、台帳に無い区切りの下書き（`npm run ledger:draft`）にだけ使う。
- 質疑の台帳：520区切り・1,103行のすべてについて、議案ごとの発言・回・答弁を人が確認した台帳（`data/shitsugi.tsv`・`data/shitsugi-chair.tsv`）を持ち、画面と MCP はこれから作る。機械の推定は、台帳に無い区切りの下書き（`npm run ledger:draft -- --kind shitsugi`）にだけ使う。

**データ状況（本番・フル取り込み済み）**
- 目次カタログ：**66会議（2017〜2026）**。
- 全文索引：**全66会議・約31,263発言・議案約1,175件・一般質問者421名**。
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
- **並び順**：開催日の新しい順（既定）／開催日の古い順／関連度（ヒット数）。

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

### 1.3 議案一覧・審議の一覧
会議ごとに議案（議事日程）を **議案番号・区分（契約/条例/予算/決算/人事/路線/報告/請願/一般質問）・件名・審議結果** で一覧。「経過」で議案ごとの審議の経過（提案説明→議案質疑→委員長報告→討論→採決）を展開できる。一般質問は質問者ごとにやりとり（質問・再質問・答弁）を表示。

「**審議の一覧**」タブでは、会議をまたいで次を一覧できる（年・件名で絞り込み）。
- 請願・意見書・決議とその結果
- 討論があった議案（反対・賛成の討論者。本人が表明した立場であり、採決での各議員の賛否ではない）
- 否決・不採択・継続審査となった議案
- 賛否が分かれた議案（起立多数・起立少数）

### 1.2.1 オンライン版の読み込み
オンライン版（GitHub Pages）は、発言索引の年別ファイルのうち**直近2年分を先に読み込んで**すぐ検索できるようにし、それより前の年は裏で並列に読み込んで追加する（読み込み中は画面上部に表示）。追加後の検索結果は全件読み込みと同じ。古い年のやりとりへの共有リンクは、その年の読み込みが終わった時点で開く。オフライン版・preview はデータを埋め込んでいるため従来どおり。

### 1.3.1 共有リンク（URLで表示状態を再現）
画面の状態は URL の `#` 以降に保存され、そのURLを開くと同じ表示になる（「この検索のリンクをコピー」「リンクをコピー」ボタンあり）。他システムから直接開くこともできる。
| パラメータ | 意味 | 例 |
|---|---|---|
| `tab` | `search`（発言を検索）／`gian`（議案・一般質問）／`list`（審議の一覧）／`toc` | `#tab=list` |
| `q`・`meeting`・`speaker`・`role`・`type`・`scene`・`sort` | 発言検索の条件（`scene` は `ippan`／`shitsugi`／`report`／`debate`／`proposal`／`other`。`sort` は `oldest`（古い会議順）か `relevance`（関連度）で、無いときは新しい会議順） | `#tab=search&q=国民健康保険&scene=debate` |
| `view`・`year`・`cq` | 審議の一覧の種類（`petition`／`debated`／`rejected`／`split`）・年・件名の絞り込み | `#tab=list&view=rejected&year=2025` |
| `bill` | 議案の審議の経過を開く（`会議ID|議案番号`） | `#tab=gian&bill=0000008942|議第105号` |
| `thread`・`focus` | 一般質問・議案質疑のやりとりを開く（場面の最初の発言ID、強調する発言ID） | `#thread=0000008942_20260306_0003` |
| `sid`・`p` | 発言を1件開く（発言ID、段落の番号）。やりとりに入る発言は `thread`・`focus` と同じ表示になり、入らない発言は同じ会議・同じ日の前後2件ずつの発言とあわせて表示する。`p` は本文を改行で分けた段落を1から数え、その段落に印を付ける（段落が1つの本文では使わない。いまの公開データの本文は改行を含まないので、段落の定義を決めるまで `p` は効かない） | `#sid=0000008397_20250303_0008` |

### 1.4 注目テーマ（highlights）
検索ボックス直下に **「議会で議論になっているテーマ」** を政策体系順（総務→民生→衛生→農林→商工→土木→消防→教育）で1行表示。各チップはクリックでOR検索を実行し、ホバーで根拠（例：「50会議・26議員が取り上げ」）を表示する。データは `public/data/highlights.json`（無ければ従来の頻出語にフォールバック）。生成は `scripts/highlights.mjs`：
- テーマの定義（表示名・検索語・政策体系順）は `dict/highlight-themes.json` で手で育てる。あれば最優先で使い、件数だけを毎回集計する（`npm run build:data` に組み込み済み）。
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
├─ DESIGN.md                              # 画面の設計の決定の記録（ADR）
├─ package.json / LICENSE / LICENSE-DATA.md / .gitignore
├─ site.config.json                       # 自治体ごとの設定（巡回先・ページ形式・表題・出典など。他自治体は FORK.md）
├─ FORK.md                                # 他の自治体で使う手順
├─ .github/workflows/build-deploy.yml      # push時ビルド＆Pagesデプロイ（build.mjs のみ）
├─ scripts/                                # ビルドパイプライン（Node ESM）
│  ├─ crawl.mjs          # 巡回 → meetings.json ＋ toc.json
│  ├─ crawl-pages.mjs    # 「本会議のご案内」(32-3-5)巡回 → meeting_pages.json
│  ├─ extract.mjs        # PDF → テキスト（pdfjs, data/text にキャッシュ）
│  ├─ index.mjs          # 発言分割・議案抽出・審議構造 → index/gian/proceedings、toc更新
│  ├─ link-bulletin.mjs  # 議会だより(council-dashboard)の一般質問見出しを proceedings/gian へ結びつけ
│  ├─ check-proceedings.mjs # 審議構造の精度レポート（＋公開データのファイルサイズ）
│  ├─ check-ledger.mjs   # 一般質問と質疑の台帳の検査（npm run check:ledger）
│  ├─ ledger-draft.mjs   # 台帳に無い一般質問・質疑の区切りの下書き（npm run ledger:draft。質疑は -- --kind shitsugi）
│  ├─ test/              # 解析器の回帰テスト（npm test）
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
│     ├─ speech.mjs      # 発言分割・議案抽出・区分推定・ページ番号除去
│     ├─ proceedings.mjs # 審議構造（一般質問・質疑・委員長報告・討論・採決）の解析
│     ├─ ledger.mjs      # 一般質問と質疑の台帳の読み取りと、区切りへの通し方
│     ├─ labels.mjs      # 一般質問と質疑の発言の見出し（画面に埋め込み、MCP は写しを持つ）
│     ├─ data.mjs        # 発言索引の読み書き（年別ファイル＋目録。分割前の index.json も読める）
│     ├─ site.mjs        # site.config.json の読み込み・テンプレートへの差し込み
│     ├─ keys.mjs        # テキストキャッシュのキー生成
│     └─ fetchx.mjs      # 取得層（native fetch+cheerio / offlineキャッシュ）
├─ dict/                                   # 辞書（手で育てる）
│  ├─ yomi.json / synonyms.json / variants.json
│  └─ topics.json        # 分野クイック検索（頻出テーマ→OR検索）
├─ data/                                   # 中間生成物（.gitignore: pdf/ と cache/。text/ はコミット可）
│  ├─ ippan.tsv          # 一般質問の台帳（人が確認したもの。1行＝1つの問い）
│  ├─ ippan-chair.tsv    # 一般質問の議長の注意（回数・通告外）
│  ├─ shitsugi.tsv       # 質疑の台帳（人が確認したもの。1行＝1人の議員の1つの議案への質疑）
│  ├─ shitsugi-chair.tsv # 質疑の議長の注意（回数・範囲）
│  ├─ pdf/               # ダウンロードPDF（キャッシュ・.gitignore）
│  ├─ text/              # 抽出テキスト（コミット可）
│  └─ cache/             # offline用ページキャッシュ（.gitignore）
├─ assets/og.svg                           # OGP 画像の編集元
├─ public/og.png                           # OGP 画像（1200×630）。build.mjs が dist/online/og.png に置く（site.config.json の ui.ogp）
├─ public/data/                            # 公開する索引（フロントが読む・コミット対象）
│  ├─ meetings.json      # 全文索引対象の会議
│  ├─ toc.json           # 年度別カタログ（全会議の目次）
│  ├─ index-manifest.json # 発言索引の目録（年別ファイルの一覧・件数）
│  ├─ index/<年>.json    # 発言単位の検索本体を年ごとに分割（リポジトリ版は norm 無しで軽量）
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
    "date": "2025-06-12",
    "dateFrom": "pdf",
    "url": "https://www.town.shiga-hino.lg.jp/0000008489.html",
    "pdfs": [
      { "label": "第2日(6月12日)", "date": "2025-06-12", "url": "https://www.town.shiga-hino.lg.jp/cmsfiles/contents/0000008/8489/20250612kaigiroku.pdf" }
    ]
  }
]
```
- `date`：会議の日付。`pdfs[].date` のある PDF のうち最も早い日。どの PDF にも日付が無い会議（2017〜2023年の臨時会）は、会議名の「（M月D日）」と `year` から求めた日（発言索引の `date` と同じ求め方。`scripts/lib/dates.mjs`）。
- `dateFrom`：`date` をどこから求めたか。`"pdf"` か `"name"`（どちらでも求められなければ `date`・`dateFrom` とも `null`）。
- `pdfs[].date` は発言ID（sid）の真ん中に使うので、日付が無くても埋めない。

### index/<年>.json ＋ index-manifest.json（発言単位／検索本体）
> 2026-10 に1ファイル（index.json・約46MB）から年別ファイルへ分割した（GitHub の 50MB 警告を避け、更新時の差分を小さくするため）。
> 各年のファイルは下の要素の配列で、`index-manifest.json` の `shards` の順（新しい年から）に連結すると分割前の index.json と同じ並びになる。
> 読み書きは `scripts/lib/data.mjs` の `readIndex` / `writeIndex`（分割前の index.json しか無いデータも読める）。
```json
{ "schema": 1, "generated": "2026-10-10", "total": 31263,
  "shards": [ { "year": 2026, "file": "index/2026.json", "count": 1192 }, { "year": 2025, "file": "index/2025.json", "count": 3439 } ] }
```
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
> `text` の改行は段落の区切り（PDF の段落の最初の行の字下げによる。`scripts/lib/pagetext.mjs`）。改行を除くと、区切りを入れる前の `text` と同じになる。段落の区切りを入れる前に取り出したテキスト（`data/text/`）から作った発言には改行が無い。
> `norm` は `build.mjs`／`build-preview.mjs` が配布物へ書き出す際に `buildNormStr(text)` で付与する。リポジトリの `public/data/index.json` は `norm` 無しで軽量に保つ。フロントは `norm` があればそれを使い、無ければ起動時に一度だけ生成する。

### gian.json（議案メタ）
```json
{
  "0000008489": {
    "agenda": [
      { "no": "議第46号", "kind": "契約", "title": "工事請負契約について（町道西大路鎌掛線道路改良工事（その12））",
        "result": "原案可決", "method": "起立全員", "committee": "産業建設常任委員会" }   // ← 3項目は任意（proceedings から付与）
    ],
    "ippan": [ { "member": "谷口智哉", "theme": "交通・公共交通",
                 "seat": "3番", "style": "一問一答", "topics": [ { "n": 1, "title": "チョイソコひの", "src": "minutes" } ] } ]
  }
}
```
> `agenda[].{no,kind,title}` と `ippan[].{member,theme}` は従来どおり（MCP・旧UIが依存）。`result`（原案可決／同意／認定／採択／不採択／否決／承認／適任／選任／当選／継続審査／修正可決／撤回）・`method`（起立全員／起立多数／起立少数／異議なし）・`committee`（委員長報告から推定した付託委員会）・`decidedIn`（別の会議で採決された場合の会議ID。9月付託→12月認定の決算など）と、`ippan[]` の `seat`・`style`・`topics` は任意項目。`theme` は議会だよりの分類があれば1問目の分類。

### proceedings.json（審議構造）
```jsonc
{
  "0000008942": {
    "segments": [
      { "kind": "ippan", "date": "2026-03-06", "member": "谷口智哉", "seat": "3番", "style": "一問一答",
        "from": "0000008942_20260306_0003", "to": "0000008942_20260306_0103",
        "turns": [[0,"q",1],[2,"a",1],[4,"rq",1],[6,"a",1],[16,"q",2]],
        "topics": [ { "n": 1, "title": "チョイソコひの", "src": "minutes" },
                    { "n": 1, "title": "「チョイソコひの」を発展させていくためには…", "theme": "交通・公共交通", "src": "bulletin", "issue": 35 } ] },
      { "kind": "shitsugi", "member": "錦戸由佳", "seat": "1番", "bills": ["議第115号"], "from": "…", "to": "…", "turns": [[0,"q",1],[2,"a",1]] },
      { "kind": "report",   "member": "中西佳子", "seat": "12番", "committee": "総務常任委員会", "bills": ["議第100号"], "from": "…", "to": "…", "turns": [[0,"s"]] },
      { "kind": "debate",   "member": "加藤和幸", "seat": "10番", "stance": "反対", "bills": ["議第105号"], "from": "…", "to": "…", "turns": [[0,"s"]] },
      { "kind": "proposal", "member": "堀江和博", "role": "町長", "bills": ["議第122号"], "from": "…", "to": "…", "turns": [[0,"s"]] },
      { "kind": "vote", "sid": "…", "bills": ["議第105号"], "result": "原案可決", "method": "起立多数", "basis": "委員長報告のとおり" }
    ]
  }
}
```
> 会議録の議長の決まり文句から `scripts/lib/proceedings.mjs` が切り出す（index.mjs が生成）。本文は持たず、index.json の発言を `sid` で参照する。
> - `kind`：`ippan`（一般質問）／`shitsugi`（議案質疑。`target:"委員長報告"` は委員長報告に対する質疑。議長が委員長・提出者（議員）に答弁を求めたとき、その議員の発言は答弁 `a` として区切りの中に入り、`answerer` にその議員名が付く）／`report`（委員長報告・委員会の調査報告）／`debate`（討論）／`proposal`（提案理由の説明）／`vote`（採決結果）。
> - `from`〜`to`：場面の最初と最後の発言の sid（同じPDF内で連番）。間の議長の進行発言も含む範囲。
> - `turns`：`[from からの相対位置, 種別, 問番号]`。種別は `q`＝質問（新しい問）／`rq`＝再質問／`a`＝答弁／`s`＝報告・討論・説明。議長の進行発言は含めない。問番号は一般質問・議案質疑のみ。
> - `style`：一般質問の質問方式。台帳のある区切りでは、台帳の行の方式が1種類ならその値（一問一答／分割／一括／不明）、2種類以上なら `"問いごと"`。台帳の無い区切りでは議員が宣言した方式（一問一答／分割／一括、宣言が無ければ `null`）。
> - `questions`・`chair`・`ledger`：一般質問の台帳（`data/ippan.tsv`・`data/ippan-chair.tsv`）のある区切りにだけ付く（index.mjs が足す）。`turns`（機械）は台帳があっても残す（台帳の無い区切りの表示と下書きの材料）。
>   ```jsonc
>   "questions": [ { "n": 1, "title": "…", "title_src": "bulletin", "start": [0, 2], "style": "分割", "style_src": "declared",
>                    "turns": [[0, "q"], [4, "rq"], [8, "rrq"], [12, "req"]], "items": [], "conf": "中" }, … ],
>   "chair": [[11, "rounds"]],
>   "ledger": true
>   ```
>   位置は `turns` と同じく from からの相対位置。`start` と `items` は `[相対位置, 段落の番号]`。列の意味は下の「data/ippan.tsv」。`note` は入れない（台帳にある）。
> - `topics`（台帳のある区切り）：台帳の題 `{n, title, src: title_src}`（題の無い問いは入れない）。議会だよりと同じ題の問いには `theme`・`issue` を足す（`link-bulletin.mjs`。議会だよりの問いの順が発言の順と違う号があるので、問番号ではなく題で合わせる）。
> - `topics`（台帳の無い区切り）：`src:"minutes"` は答弁冒頭（「〇〇についてご質問を頂きました」）からの推定、`src:"bulletin"` は議会だより（council-dashboard）の見出しと11分類（`link-bulletin.mjs` が付与）。
> - `qalign`：議会だよりの各質問が始まる議員発言 `[[質問番号, from からの相対位置], …]`。台帳のある区切りでは、議会だよりの問いと同じ題の台帳の問いの `start` から作る（全問そろう）。台帳の無い区切りでは `link-bulletin.mjs` が題名・問の本文と発言の文字の重なりで推定する（確信度の低い質問は含めない）。全質問がそろう一般質問では、やりとり表示・MCP の「質問／再質問」の番号をこれに合わせる。議会だよりダッシュボードの「会議録のやりとりを見る」も、この位置を強調して開く。
> - `stance`：討論で本人が表明した立場（反対／賛成）。「委員長報告の不採択に反対」のような場合も表明どおり記録する。
> - `parts`・`chair`・`ledger`（議案質疑）：質疑の台帳（`data/shitsugi.tsv`・`data/shitsugi-chair.tsv`）のある区切りにだけ付く（index.mjs が足す）。台帳のある区切りの `bills` は、台帳の bill のうち `議題外`・`不明` を除いたもの（台帳の順。機械の値は使わない）。`turns`（機械）は台帳があっても残す。
>   ```jsonc
>   "parts": [ { "bill": "議第85号", "start": [0, 1], "turns": [[0, 1, "q"], [6, 3, "rq"], [12, "", "req"]], "answers": [2, 8], "conf": "高" }, … ],
>   "chair": [[1, "notice"]],
>   "ledger": true
>   ```
>   1つの要素が台帳の1行（1つの議案への質疑）。位置は from からの相対位置。`start` は `[相対位置, 段落の番号]`、`turns` は `[相対位置, 段落の番号（空なら ""）, 種類]`、`answers` は答弁の相対位置。1つの発言が複数の議案にまたがるときは、同じ相対位置が複数の要素の `turns` に出る。列の意味は下の「data/shitsugi.tsv」。`note` は入れない（台帳にある）。
> - 精度は `node scripts/check-proceedings.mjs` で確認（目次の一般質問者との一致、台帳のある区切りと問いの数、議案質疑の台帳のある区切りと行の数、採決結果の取得率、場面に分類できた発言の割合）。

### data/ippan.tsv（一般質問の台帳）

見出し行つきの TSV。1行が1つの問い。人が確認したもので、一般質問の問いの境目・回・方式・題はこれを正とする（道具で書き換えない）。

| 列 | 中身 |
|---|---|
| from | 区切りの最初の発言の sid（proceedings.json の一般質問の区切りの `from` と同じ） |
| member | 議員名 |
| date | 日付 |
| n | 問番号（1から） |
| title | 問いの題（空のことがある） |
| title_src | `bulletin`（議会だより）／`notice`（通告の件名）／`minutes`（会議録の発言から人が付けた）／空（題が無い） |
| start | 問いの最初の質問が始まる発言と段落 `sid:段落番号`（段落は1から） |
| style | `一問一答`／`分割`／`一括`／`不明` |
| style_src | `declared`（議員が宣言）／`inferred`（発言の運びから推定）／空（方式が不明） |
| turns | その問いの議員の発言を順に `sid:種類` を `;` でつないだもの。種類は `q`＝質問、`rq`＝再質問、`rrq`＝再々質問、`q4`＝4回目の質問（答弁あり）、`req`＝要望、`x`＝回に数えない発言（割り込み・確認）。一問一答では回を付けないので、要望以外は全部 `q` |
| items | 一問一答で、項目の始まりが読めたもの `sid:段落番号` を `;` でつないだもの（ほかの方式では空） |
| conf | 確信 `高`／`中`／`低`（下書きは `下書き`。台帳に足す前に直す） |
| note | 判定の根拠と迷い |

- 区切りの中の議員の発言は、すべてその区切りの行のどれかの turns に入る。区切りの外の sid は入らない。
- 答弁（当局の発言）と議長の発言は台帳に無い。proceedings.json の発言の並びから補う。
- 前の問いの最後の発言と次の問いの最初の発言が同じ sid のとき（前の問いの要望や再質問と次の問いの質問を同じ発言で言うとき）、その sid は両方の行に出て、次の行では `q`、次の行の `start` の段落が境目になる。前の行の種類は `req`・`rq`・`rrq` のどれでもよい。

### data/ippan-chair.tsv（一般質問の議長の注意）

見出し行つきの TSV。列は `sid`（議長の発言）、`kind`（`rounds`＝回数の注意、`notice`＝通告外の注意）、`about`（その区切りの from）、`text`（発言の頭80字）。

### 一般質問の構造の決まり

2026-11-07 に決めたもの。台帳（`data/ippan.tsv`・`data/ippan-chair.tsv`）はこの決まりで作る。

1. 問いの単位は通告の件名とする。2023年以降は議会だよりの問いの数で確かめる。2022年以前は通告表が会議録に無いので、冒頭の告知と発言の言い回しで決め、確信（conf）を付ける。
2. 回は発言の順で数える（質問→再質問→再々質問）。議員の言い回し（3回目の発言を「再質問」と言うなど）は使わない。議長が回を言った発言はそれに合わせる。答弁漏れの指摘・確認・議長への申し出・割り込みは回に数えない（`x`）。
3. 4回目の質問は、議長や議員が要望に切り替えたものは要望、答弁があったものは「4回目の質問（答弁あり）」（`q4`）とする。
4. 一問一答では回を付けない。発言は順に並べ、項目の始まりが読めたものを items に持つ。
5. 要望は、議員が「要望」と言った発言、議長が「要望で」と確かめた発言、区切りの最後で答弁の無い発言とする。
6. 方式は議員の宣言を正とする。宣言が無い問いは発言の運びから推定し、style_src を `inferred` にする（議員の質問の発言が5回以上あり答弁が間に入るなら一問一答、問いが2つ以上なら分割、1問で宣言が無ければ不明）。議案質疑には方式が無いので当てない。
7. 題は、議会だより、通告の件名、人が会議録の発言から付けたもの、の順で出どころ（title_src）を書く。題が付けられない問いは空にする。
8. 議長の注意は、回数の注意と通告外の注意だけを記録する。
9. 台帳は人が確認したものを正とし、道具は台帳に無い区切りの下書きを作るだけにする。新しい会議の手順は次のとおり。
   1. `npm run index`（会議録から区切りを作る。台帳に無い区切りは機械の値のまま）
   2. `npm run ledger:draft -- --out <ファイル>`（台帳に無い区切りの下書き。conf は `下書き`）
   3. 人が下書きを確かめて直し、conf を `高`／`中`／`低` にして、`data/ippan.tsv` に足す（議長の注意は `data/ippan-chair.tsv` に足す）
   4. `npm run check:ledger`（台帳の検査。問題があれば件数と該当を出して終了コード 1。台帳の無い区切りは「下書き待ち」として数える）
   5. `npm run index`（台帳を proceedings.json に通す）。続けて `npm run link-bulletin`・`npm run highlights`・`npm run check`

台帳の無い区切りは、画面に「構造は機械の推定です」と出し、MCP は `structure: "推定"` を付けて返す。

### data/shitsugi.tsv（質疑の台帳）

見出し行つきの TSV。1行が1人の議員の1つの議案への質疑。人が確認したもので、質疑の議案ごとの発言・回・答弁はこれを正とする（道具で書き換えない）。

| 列 | 中身 |
|---|---|
| from | 区切りの最初の発言の sid（proceedings.json の質疑の区切りの `from` と同じ） |
| member | 議員名 |
| date | 日付 |
| bill | 議案の番号（`議第85号`・`報第5号`・`決議案第5号` の形。gian.json の議案と同じ書き方）。`議題外`（議題の議案に無いことを聞いた）、`不明`（1つの議案に決められない）もある |
| start | この議案への質疑が始まる発言と段落 `sid:段落番号`（段落は1から） |
| turns | この議案への議員の発言を順に `sid:段落番号:種類` を `;` でつないだもの。段落番号はその発言の中でこの議案の部分が始まる段落（空のことがある）。種類は `q`＝質疑、`rq`＝再質疑、`rrq`＝再々質疑、`q4`＝4回目（いまは無い）、`req`＝意見・要望（回に数えない）、`x`＝回に数えない発言（確認・答弁漏れの指摘・言い直し） |
| answers | この議案への答弁の sid を `;` でつないだもの（当局の発言。委員長報告への質疑では委員長である議員の発言）。読み手が分からなかったものは空 |
| conf | 確信 `高`／`中`／`低`（下書きは `下書き`。台帳に足す前に直す） |
| note | 判定の根拠と迷い |

- 1つの発言が複数の議案にまたがるとき、その sid は複数の行の turns に出る（段落番号で境目を示す）。1つの発言の中で同じ議案の部分が2つに分かれるときは、同じ行の turns に同じ sid が段落を変えて2回出る。
- 区切りの中の議員の発言は、すべてその区切りの行のどれかの turns に入っているか、区切りの `answerer`（委員長・提出者としての答弁をした議員）の発言である。区切りの外の sid は入らない。
- 回は議案ごとに数える（同じ行の中で q → rq → rrq）。
- 議長の発言は台帳に無い。

### data/shitsugi-chair.tsv（質疑の議長の注意）

見出し行つきの TSV。列は `sid`（議長の発言）、`kind`（`rounds`＝回数の注意、`notice`＝範囲の注意）、`about`（その区切りの from）、`text`（発言の頭80字）。

### 質疑の構造の決まり

2026-11-07 に決めたもの。台帳（`data/shitsugi.tsv`・`data/shitsugi-chair.tsv`）はこの決まりで作る。

1. 質疑は議案ごと。1回の発言で複数の議案を聞くことがあり、議案ごとに行を分け、段落で境目を示す。
2. 回は議案ごとに発言の順で数える（質疑→再質疑→再々質疑）。議員の言い回しは使わない。確認・答弁漏れの指摘・言い直しは回に数えない（`x`）。
3. 問いの無い発言（要望・礼・「答弁は結構」、答弁の無い最後の発言）は意見・要望（`req`）で、回に数えない。
4. 議員が番号を言わないときは、議題の議案の名前と中身から決め、確信を「中」にする。議題の議案に無いことを聞いたものは「議題外」、1つの議案に決められないものは「不明」として持つ。
5. 議長の注意は範囲と回数だけを記録する。
6. 委員長・提出者（議員）への質疑では、その議員の発言は答弁（区切りの `answerer`）。
7. 台帳は人が確認したものを正とし、道具は台帳に無い区切りの下書きを作る。手順は一般質問と同じ。
   1. `npm run index`（会議録から区切りを作る。台帳に無い区切りは機械の値のまま）
   2. `npm run ledger:draft -- --kind shitsugi --out <ファイル>`（台帳に無い区切りの下書き。機械の bills ごとに1行、取れなければ `不明`。conf は `下書き`）
   3. 人が下書きを確かめ、議案ごとに発言と段落を分け、conf を `高`／`中`／`低` にして、`data/shitsugi.tsv` に足す（議長の注意は `data/shitsugi-chair.tsv` に足す）
   4. `npm run check:ledger`（台帳の検査。問題があれば件数と該当を出して終了コード 1。台帳の無い区切りは「下書き待ち」として数える。bill が gian.json のその会議の議案に無いものは件数と一覧を出す（前の会議の議案のことがあるので、エラーにはしない））
   5. `npm run index`（台帳を proceedings.json に通す）。続けて `npm run link-bulletin`・`npm run highlights`・`npm run check`

画面のやりとりの表示では、議員の発言の見出しを台帳の種類と議案で付ける（「質疑（議第85号）」「再質疑（議第85号）」「意見・要望」「（回に数えない発言）」。1つの発言が複数の議案にまたがるときは「質疑（議第83号 p1／議第88号 p3）」）。答弁には台帳で結びついた議案を添える（「答弁（議第85号）」）。「対象の議案」の箱には台帳の議案を並べ、`議題外`・`不明` の行は「議題に無い事柄」「議案を決められない質疑」と出す。台帳の無い区切りは、画面に「構造は機械の推定です」と出し、MCP は `structure: "推定"` を付けて返す。

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

> Node.js 22.13+（PDF抽出の pdfjs-dist 6 の要件。ビルド・テストは 18+ でも可）/ ESM。`npm ci` で pdfjs-dist・cheerio（＋任意の @anthropic-ai/sdk）が入る。セマンティック検索（embed.mjs）を試すときだけ `npm i --no-save @xenova/transformers`（既知の脆弱性を含む依存があるため既定では入れない）

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
抽出テキストは1行＝1ページで、段落の最初の行の前に印 U+2029 がある（`extract.mjs`）。議事日程・目次・名簿は印を除いてから読み、発言の `text` では印を改行に替える。
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
- ダッシュボードの各質問 → 本システムへ**ディープリンク**（共有リンク §1.3.1。例：`#tab=search&meeting=<会議ID>&speaker=<議員名>&scene=ippan`）。
- 本システムの議案一覧の議員名 → ダッシュボードを開く（`DASHBOARD_URL` を設定）。

---

## 10. セットアップとローカル実行

```bash
git clone <repo> && cd hino-council-search
npm install

# 1) データ生成（巡回→抽出→分割→索引）
npm run crawl       # public/data/meetings.json
npm run extract     # data/text/*.txt（PDFキャッシュ）
npm run index       # public/data/index/<年>.json＋index-manifest.json, gian.json, proceedings.json（一般質問の台帳 data/ippan.tsv を通す）
npm run link-bulletin  # 議会だよりの見出し・分類を一般質問へ結びつける（要ネット）
npm run check:ledger   # 一般質問と質疑の台帳の検査（台帳に無い区切りがあれば npm run ledger:draft で下書きを作る。「一般質問の構造の決まり」「質疑の構造の決まり」）

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
- `HINO_REFRESH=1` … `npm run extract` で、`data/text/` にあるものも含めて全件を作り直す。`data/pdf/<キー>.pdf` があればそれを使い、無いものだけ取得する（取得は1件ごとに1秒あける）。
  作り直したあとは `npm run index` を動かし、`node scripts/check-sid-stability.mjs HEAD` で発言ID が変わっていないことを確かめる。
  画面を作ったあとは、`PLAYWRIGHT_MODULE=<playwright の index.mjs> node scripts/check-ui.mjs` で、手元版が外のサイトへ通信しないこと、決まった言葉（`scripts/test/search-fixtures.json`）で決まった発言が出ること、共有リンクでその発言が開くことを確かめる（CI でも実行する）。
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

> `.gitignore` 対象：`node_modules/`・`dist/`・`preview.html`・`data/pdf/`・`data/cache/`・`議事録本体/`（生成物・キャッシュ・大容量PDFはコミットしない）。`data/text/`（抽出テキスト）と `public/data/*.json`（`index.json`・`highlights.json`・`meeting_pages.json` 等）は**コミットして配信**する。

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

対象ごとに扱いが異なります。詳しくは [LICENSE-DATA.md](LICENSE-DATA.md) を参照してください。

- プログラム（scripts/、mcp/、.github/、site.config.json、package.json）：MIT License（[LICENSE](LICENSE)）
- データの構造（public/data/ の発言の区切り、発言者の付け方、審議の場面、議案の一覧など。dict/ の辞書）：CC BY 4.0
- 会議録から転記した部分（発言の文章、議案名など）：このリポジトリのライセンスの対象外（著作権は日野町議会にあります）
- 議会だよりの文章（council-dashboard から取り込んでいる質問の題名・テーマと、MCP サーバーが返す問・答）：このリポジトリのライセンスの対象外（著作権は日野町議会にあります）

免責：

- 本システムの検索結果は機械処理によるもので、原本と差異が生じ得る。正確な内容は各PDF（原本）で確認すること。
- 生成AIによる要約・分類・回答は補助情報であり、正確性を保証しない。重要な判断は原文を確認すること。
