# mcp/ — 議会だより×会議録 統合MCPサーバー

Claude など MCP (Model Context Protocol) 対応クライアントから、日野町議会の
(1) 議会だより掲載の一般質問（編集版）と (2) 会議録（発言単位の全文）を
横断参照するためのローカルサーバー。単一ファイル・外部依存なしで動く。

質問・答弁の下書き支援を、過去の実データと出典に接地させて行うための基盤であり、
「AIが質問・答弁を作る」ためのものではない。

## 位置づけ・方針

サーバーがクライアント（AI側）に渡す指示（instructions）として、次を明示している。

- 下書き・分析の出力には、参照した出典（議会だより第◯号／会議名・日付・原本PDFのURL）を必ず添える
- 数値・固有名詞は機械抽出の誤りがありうるため「原本PDF・公式ページで要確認」と明示する
- 質問数などで議員を序列化する出力はしない（council-dashboard の `docs/EDITORIAL_POLICY.md` と同方針）
- 会議録コーパスは公開・取り込みが遅れるため、直近会議が未収載のことがある（未収載はその旨を正直に返す）
- 討論の賛否は討論した議員本人の表明であり、採決での各議員の賛否ではない（会議録に個々の賛否の記録は無い）

## 必要環境

- Node.js 18 以上（fetch 内蔵のため）
- 外部パッケージ不要（`npm install` 不要）

## 導入

Claude Code の場合：

```bash
claude mcp add hino-council -- node /絶対パス/hino-council-search/mcp/hino-council-mcp.mjs
```

Claude Desktop の場合は `claude_desktop_config.json` に追加：

```json
{
  "mcpServers": {
    "hino-council": {
      "command": "node",
      "args": ["/絶対パス/hino-council-search/mcp/hino-council-mcp.mjs"]
    }
  }
}
```

初回起動時はデータ取得（発言索引 約46MB を含む）のため十数秒かかる。

> **v0.4.0 以降が必要です（2026-10〜）**：会議録データの発言索引を、1ファイル（`index.json`）から年別ファイル
> （`index-manifest.json`＋`index/<年>.json`）に分割しました。v0.3.0 以前のサーバーは新しいデータを取得できず、
> 手元のキャッシュ（最後に取得した時点のデータ）で動き続けます。このリポジトリの最新の `mcp/hino-council-mcp.mjs` に
> 置き換えてください。v0.4.0 は分割前の `index.json` しか無いデータ（フォーク先など）も読めます。
以後はキャッシュにより数秒で起動する。

## データソースと更新

起動時に GitHub の raw から取得し、`~/.cache/hino-council-mcp` に24時間キャッシュする。

| データ | 取得元 |
|---|---|
| 一般質問（議会だより #24〜） | council-dashboard `docs/data/questions.json` |
| 会議一覧・議案 | hino-council-search `public/data/{meetings,gian}.json` |
| 発言索引 | hino-council-search `public/data/index-manifest.json`＋`index/<年>.json`（無ければ `index.json`） |
| 審議構造・会議ページ対応（任意） | hino-council-search `public/data/{proceedings,meeting_pages}.json` |

`proceedings.json` は会議録の議長の進行から切り出した場面（一般質問・議案質疑・委員長報告・討論・提案説明・採決結果）。
取得できない場合（古いデータ・フォーク先など）は警告だけ出し、従来どおりの推定で動く。

各リポジトリのデータが更新されれば、サーバー自体を更新しなくても
（キャッシュ期限後の再起動で）自動的に追従する。

## ツール一覧

| ツール | 役割 |
|---|---|
| `list_themes` / `list_members` | テーマ・議員の一覧（序列化はしない） |
| `search_bulletin` | 議会だよりの一般質問を検索（空白=AND、先頭`-`=NOT） |
| `get_bulletin_question` | 一般質問1件の全文と出典URL |
| `find_minutes_for_bulletin` | 議会だよりの記事 → 対応する会議録ブロックへの入口 |
| `list_meetings` | 収載済み会議の一覧 |
| `search_speeches` | 会議録の発言全文を検索（発言者・役職・年・場面で絞り込み可。結果に場面を表示） |
| `get_speech` | 発言1件＋前後の文脈 |
| `get_exchange` | ある会議での議員の質疑応酬をまとめて取得（長文はページング）。各発言に質問／再質問／答弁の種別 |
| `get_meeting_agenda` | 会議の議案一覧（目次PDF由来）。採決結果・付託委員会も含む |
| `get_bill_deliberation` | 議案1件の審議の経過（提案説明・議案質疑・委員長報告・討論・採決）を出典付きで |

議会だより→会議録のひも付けは、ダッシュボード側 `minutes` URL の数値IDが
会議録側の `meetingId` と一致することを利用している。`minutes` が「本会議のご案内」ページの
IDになっている号（例：35号）は、`meeting_pages.json` を逆引きして会議録IDに直す。

## 既知の限界

- `get_exchange` のブロックは、`proceedings.json` があれば会議録の議長の進行から切り出した
  実際の範囲（`scene` に一般質問／議案質疑／討論…を表示）。無い場合は従来の機械推定
  （同一日のPDF内で、本人発言の間隔が12発言を超えたら分割）。
- 質問／再質問の区別、質問項目（答弁冒頭から推定）、討論の賛否・対象議案は機械抽出で、
  誤りがありうる。精度はリポジトリの `scripts/check-proceedings.mjs` で確認できる。
- 議案番号は年（会期）ごとに振り直されるため、`get_bill_deliberation` は会議IDと組で指定する。
- 議会だよりの全質問と会議録の発言の対応（`qalign`）が取れている一般質問では、`get_exchange` の質問／再質問を議会だよりの番号（`bulletin_question`）で返す。対応は文字の重なりによる機械推定。
- 検索・区切りはすべて機械処理。正確な内容は必ず原本PDFで確認すること。

## 環境変数（すべて任意）

| 変数 | 既定値 | 用途 |
|---|---|---|
| `HINO_MCP_CACHE` | `~/.cache/hino-council-mcp` | キャッシュ置き場 |
| `HINO_MCP_MAX_AGE_HOURS` | `24` | キャッシュ有効時間 |
| `DASHBOARD_QUESTIONS_URL` | GitHub raw (main) | questions.json のURL |
| `SEARCH_DATA_BASE` | GitHub raw (main) | public/data のベースURL |

フォーク先（他自治体）では、この2つのURLを差し替えれば同じサーバーがそのまま使える
（データ形式が同一であることが前提）。混同防止のため、提供中データの自治体・出典は
起動時に実データから読み取り、AI側への指示（instructions）で自己申告する。
また、2つのURLが別自治体を指している場合（会議ID・ドメインの不一致）は起動時に警告し、
横断参照（`find_minutes_for_bulletin`）を無効化する。片方だけ差し替えたまま
気づかず使い続ける事故を防ぐためのもの。
