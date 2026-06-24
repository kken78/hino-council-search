# 開発・運用メモ（実装補足）

README.md の仕様に沿って実装したリポジトリです。仕様本文は README.md を参照。
ここでは実装上の補足と、本デモ（2会議でのend-to-end）について記載します。

## 構成
- `scripts/lib/normalize.mjs` … NFKC＋異体字＋空白除去＋小文字化（buildNorm/normTerm）
- `scripts/lib/eras.mjs` … 元号⇔西暦、漢数字対応、年表現の相互展開（expandYear/yearVariants）
- `scripts/lib/speech.mjs` … 発言分割（splitSpeeches）・議案抽出（extractGian）・区分推定
- `scripts/lib/keys.mjs` … テキストキャッシュのキー生成（extract/index 共有）
- `scripts/lib/fetchx.mjs` … 取得層。本番はネイティブ fetch + cheerio、`HINO_OFFLINE=1` でキャッシュ専用
- `scripts/crawl.mjs / extract.mjs / index.mjs` … 巡回→抽出→索引
- `scripts/enrich.mjs / embed.mjs` … 任意（Claude要約・分類／埋め込み）。鍵やライブラリが無ければ自動スキップ
- `dict/` … variants/yomi/synonyms（日野町の初期データ入り）
- `src/` … Vite+React フロント（search.js が正規化検索の本体、semantic.js は任意）

## 本番（GitHub Actions / ネット接続あり）での実行
```bash
npm install
npm run crawl     # 日野町HPを巡回 → public/data/meetings.json（全会議）
npm run extract   # 各PDFをDL & pdfjsでテキスト化 → data/text/（キャッシュ）
npm run index     # 発言分割・正規化・議案抽出 → public/data/index.json, gian.json
npm run enrich    # 任意（ANTHROPIC_API_KEY）
npm run embed     # 任意（@xenova/transformers）
npm run dev       # フロント開発サーバ
```
全会議へ広げるには環境変数を付けずに `npm run crawl` を実行（フィルタ無し）。

## このデモ（サンドボックス）について
- サンドボックスは日野町ドメインへ直接アクセス不可（プロキシ制限）かつ npm registry も制限。
  そのため取得済みデータをキャッシュに格納し、`HINO_OFFLINE=1` で end-to-end を実走しました。
  - `data/cache/pages/*.json` … crawl 用に取得済みのページ（リンク一覧）
  - `data/text/*.txt` … extract 用に取得済みのPDFテキスト
- デモ対象 2 会議（環境変数で限定）:
  ```bash
  export HINO_OFFLINE=1 HINO_MEETINGS=0000008489,0000008499
  node scripts/crawl.mjs && node scripts/extract.mjs && node scripts/index.mjs
  ```
- 本デモでは各会議の一部PDF（6月定例会の第1日・第2日、7月臨時会の本文）をテキスト化済み。
  第3日・第4日・目次PDFは未取得のため index 未収録（本番 extract で自動取得されます）。
  ※第2日テキストは分量の都合で一部を要約整形しています（検索対象語は保持）。

## 生成結果（デモ）
- meetings.json: 2 会議 / 7 PDF
- index.json: 99 発言 / 発言者 18 名
- gian.json: 議案 8 件（契約/路線/予算/報告）/ 一般質問者 5 名

## 検索の確認済み挙動
AND（スペース）・OR・NOT（先頭 -）、元号⇔西暦（2025↔令和7↔R7）、
よみ→漢字（かいがけ→鎌掛）、同義語（公共交通⇔公共ライドシェア等）、
異体字（髙→高 等）、発言者/種別/年/期間フィルタ、前後文脈ハイライト。
