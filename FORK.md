# 他の自治体で使う（フォークの手順）

このリポジトリは日野町議会向けに作っていますが、自治体ごとの値は **`site.config.json`** にまとめてあります。
会議録を PDF で公開している自治体なら、設定の書き換えと、必要に応じた解析ルールの調整で使えます。

> 目安：会議録の発言が「役職（氏名＋敬称）」の形式で書かれ、会議ごとのページに日ごとの PDF が並んでいるサイトは、設定の変更だけで取り込めることが多いです。
> 書式が違う部分は、精度レポート（`npm run check`）で確かめながら解析ルールを調整します。

---

## 1. リポジトリを用意する
1. GitHub でこのリポジトリをフォーク（またはテンプレートとしてコピー）する。
2. Settings → Pages → Source を **GitHub Actions** にする。
3. Settings → Actions → General → Workflow permissions の「**Allow GitHub Actions to create and approve pull requests**」をオンにする（週1回の自動取り込みが PR を作るため）。
4. フォークでは定期実行が既定で止まっているので、Actions 画面で `update-data` と `keepalive` を有効にする。

## 2. `site.config.json` を書き換える
| 項目 | 意味 | 日野町の値 |
|---|---|---|
| `council.name` / `full_name` | 議会名（注目テーマの生成などに使う） | 日野町議会／滋賀県日野町議会 |
| `site.root` | 自治体サイトのトップ（相対リンクの基準） | https://www.town.shiga-hino.lg.jp |
| `site.minutes_index` | 会議録の一覧ページ | …/category/32-3-6-0-0-0-0-0-0-0.html |
| `site.minutes_category_pattern` | 一覧からたどる年別ページのURLの正規表現 | `category/32-3-6-\d+` |
| `site.meeting_page_pattern` | 会議ごとのページのURLの正規表現 | `^https?://[^/]+/0000\d{5,6}\.html$` |
| `site.deny_page_ids` | 会議ページの形式に当てはまるが会議ではないページ（全ページ共通の案内など） | 地図案内・多言語切替のID |
| `site.pdf_pattern` | 会議ページ内の会議録PDFのURLの正規表現 | `/cmsfiles/.+\.pdf$` |
| `site.meeting_guide_index` | （任意）「本会議のご案内」など会議ごとの案内ページの一覧。無ければ省略 | …/category/32-3-5-… |
| `site.source_label` | 画面の出典表記 | 日野町ホームページ「会議録」 |
| `speech.honorific` | 発言者の書き方「役職（氏名＋敬称）」の敬称 | 君 |
| `ui.title` / `ui.eyebrow` | 画面の表題・上の小見出し | 日野町議会 会議録 横断検索 など |
| `ui.offline_file` | オフライン版（単一HTML）のファイル名 | 日野町議会-会議録検索.html |
| `ui.footer_note` / `ui.links` | フッターの一文・リンク（議会だよりダッシュボードなど。無ければ空） | |
| `ui.license_note` / `ui.license_url` | フッターのライセンスの一文と、LICENSE-DATA.md へのリンク（無ければ表示しない） | プログラムは MIT License、…著作権は日野町議会にあります。詳しくは |
| `bulletin.questions_url` | （任意）議会だよりダッシュボード（council-dashboard）の `questions.json`。無ければ省略 | |

## 3. 日野町のデータを消す
- `public/data/`（`meetings.json`・`toc.json`・`index/`・`index-manifest.json`・`gian.json`・`proceedings.json`・`highlights.json`・`meeting_pages.json`）
- `data/text/`（抽出済みテキスト）
- 辞書のうち日野町固有のもの：`dict/yomi.json`（地名のよみ）・`dict/topics.json`・`dict/highlight-themes.json`（注目テーマの定義）。
  `dict/variants.json`（異体字）・`dict/synonyms.json`（同義語）は一般的なものなので、そのまま使ってよい。

## 4. 取り込んで確かめる
```
npm ci                          # Node 22.13 以上
node scripts/crawl.mjs          # 会議の一覧と PDF の URL → public/data/meetings.json
node scripts/extract.mjs        # PDF → data/text/
node scripts/index.mjs          # 発言の分割・議案・審議構造
node scripts/check-proceedings.mjs   # 精度レポート
node scripts/build-preview.mjs  # preview.html をブラウザで開いて確認
```
- `crawl.mjs` で会議が0件なら、`site` の各正規表現が自治体サイトの URL に合っていない。
- `index.mjs` で発言者が「（本文）」ばかりなら、`speech.honorific` か発言者の書式が合っていない（下の「調整箇所」）。

## 5. 精度レポートを見て調整する
`check-proceedings.mjs` は次を出します。日野町では 100%／98%／97% です。
- **一般質問**：目次 PDF に載る質問者と、検出した一般質問の一致
- **採決結果**：議案のうち採決結果が取れた割合
- **場面の分類**：議長以外の発言のうち、一般質問・議案質疑・委員長報告・討論・提案説明のどれかに分類できた割合

低いときの調整箇所：
| 症状 | 見る場所 |
|---|---|
| 発言者が取れない・ページ番号が混ざる | `scripts/lib/speech.mjs`（`SPK`＝発言者の形式、`stripPageHeads`＝各行先頭のページ番号「2-57」「－13－」の除去） |
| 場面（一般質問・質疑・討論など）が切れない | `scripts/lib/proceedings.mjs` の `PHRASES`（議長の決まり文句）・`CALL`（議員の指名） |
| 採決結果が取れない | `scripts/lib/proceedings.mjs` の `votesIn`（「よって、…と決しました」の言い回し） |
| 議案の件名・区分がおかしい | `scripts/lib/speech.mjs` の `extractGianFromToc`（目次の書式）・`KIND`（区分のルール） |
| 一般質問者の照合ができない | `scripts/check-proceedings.mjs` の `tocQuestioners`（目次の「一般質問」欄の書式） |
| 会議名から年・種別が取れない | `scripts/crawl.mjs` の `eraOf`・`guessDate` |

解析ルールを変えたら、`npm test`（回帰テスト）が日野町の書式で通ることも確かめてください。
テストの例は日野町の会議録の言い回しです。自分の自治体の例を足すと、以後の調整が安全になります。

## 6. 公開と運用
- main に push すると `build-deploy` が GitHub Pages に公開する（`dist/online`）。
- 週1回の `update-data` が新しい会議録を取り込み、PR を作る。`keepalive` が60日無活動での定期実行の停止を防ぐ。
- 注目テーマは `dict/highlight-themes.json` に自分の議会のテーマ（表示名・検索語・並び順）を書き、`node scripts/highlights.mjs` で件数を集計する。
- 統合MCPサーバー（`mcp/`）は、環境変数 `SEARCH_DATA_BASE`（このリポジトリの `public/data` の raw URL）と `DASHBOARD_QUESTIONS_URL` を自分のものに向ける（`mcp/README.md`）。
