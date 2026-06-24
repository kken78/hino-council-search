# ビルド・公開・配布ガイド（ノービルドの単一HTML構成）

GitHubでソースを管理し、ビルドで「オフライン配布用の単一HTML」と「オンライン用サイト」を生成します。
ネット接続のある環境（手元PC または GitHub Actions）で取り込み・ビルドを行い、成果物を配布します。Node.js 20+。

## 0. 準備
```bash
git clone <このリポジトリ> && cd gikai-search
npm install   # cheerio / pdfjs のみ（フロントにビルド工程はありません）
```

## 1. 全会議の本文を取り込む（全文索引のフル生成）
環境変数なしで実行すると、会議録一覧を辿って全会議を取得・索引化します。
```bash
npm run crawl     # 全会議を巡回 → public/data/meetings.json, toc.json
npm run extract   # 各PDFをDL & pdfjsでテキスト化 → data/text/（キャッシュ）
npm run index     # 発言分割・正規化・議案抽出 → public/data/index.json, gian.json
```
- 目安：全64会議・PDF約250本程度。`extract` は取得済みPDFをスキップするので再実行は速いです。
- サイト負荷に配慮し各取得間に小休止。失敗PDFは `NG` 表示、再実行で続きから取得できます。

## 2.（任意）生成AI付与・セマンティック検索
鍵やライブラリが無ければ自動スキップされ、キーワード検索はそのまま動きます。
```bash
export ANTHROPIC_API_KEY=...   # 要約・分類（enrich）
npm run enrich
npm install @xenova/transformers && npm run embed   # public/data/vectors.json（任意）
```

## 3. フロントを生成（ノービルド）
```bash
npm run preview   # preview.html（開発確認用・データ内蔵）
npm run build     # 本番2種を生成：
#   dist/日野町議会-会議録検索.html   … オフライン配布用（データ埋め込み・単一HTML）
#   dist/online/index.html (+ data/)  … オンライン用（fetch型・GitHub Pages配信）

# 完全オフラインで原本PDFも同梱したい場合（PDFを相対パス化して dist に同梱）
HINO_BUNDLE_PDF=1 npm run build
```

## 4-A. オンライン公開（GitHub Pages）
1. GitHub にリポジトリを作成して push。
2. Settings → Pages → Source を **GitHub Actions** に設定。
3. 同梱の `.github/workflows/build-deploy.yml` が
   `crawl → extract → index →（任意）enrich/embed → build → deploy(dist/online)` を実行。
   - 既定で毎週月曜に自動再ビルド（新しい会議録を自動反映）。手動実行は workflow_dispatch。
   - fetch型は相対パスで動くため、リポジトリ名に依存しません（base設定不要）。
4. 公開URL（例：`https://<org>.github.io/<repo>/`）を共有してレビュー依頼。

## 4-B. 閉域NW（庁内）配布 — 単一HTML
- `dist/日野町議会-会議録検索.html` を**共有ドライブに配置**するだけ。職員は各自のブラウザで開いて利用（サーバー不要・インターネット不要・同時利用可）。
- ファイルを開く方法：共有ドライブのファイルをダブルクリック（または `\\server\share\…\日野町議会-会議録検索.html`）。
- 留意点：
  - ブラウザやグループポリシーによっては、ネットワークパス上のHTMLで「外部コンテンツ」警告やスクリプト制限が出ることがあります（多くは一度許可で解決。心配なら庁内Webサーバでの配信も可）。
  - 「会議録PDFを開く」リンクは既定で町サイト（＝ネット必要）。閉域で原本PDFも開くには `HINO_BUNDLE_PDF=1 npm run build` でPDFを同梱し、`dist/pdf/` ごと共有ドライブへ配置。

## 5. バージョン管理・リリース運用
- ソース（pipeline・テンプレート・辞書・生成済み索引）は GitHub で管理。`public/data/*.json` はコミット可（`.gitignore` は `data/pdf/` と `dist/` を除外）。
- 版を固定する場合は **Git タグ／GitHub Release** を作成し、`dist/日野町議会-会議録検索.html` を**リリース資産として添付**。職員はリリースからダウンロード→共有ドライブへ。
- 更新フロー：辞書・UI・取り込みをローカルで調整 → コミット → `npm run build` → 共有ドライブのHTMLを差し替え（オンラインは push で自動反映）。

## 6. レビュー観点（関係者向け）
- 検索：キーワード／OR／除外（-）、よく検索される語、会議・発言者・区分・種別の絞り込み、会議録単位の検索。
- 表示：ヒットのハイライト、役職バッジ、全文展開、会議録PDF/会議ページへの遷移。
- 目次：年度別カタログと各会議のPDFリンク。議案・一般質問：議案番号・区分・件名、質問者。
- 原本との差異は該当PDFと併せてフィードバック（区分誤り・固有名詞のよみ漏れ等は辞書で調整可）。

## 7. 公開後の精緻化（継続）
- 全件取り込み後、`npm run candidates`（`scripts/dict-candidates.mjs`）の出力を見て `dict/` と区分ルールを根拠ベースで調整。
- 生成AI付与・セマンティック検索の有効化、議会だよりダッシュボードとの疎結合連携。
