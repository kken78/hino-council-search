# mcp/ — 議会だより×会議録 統合MCPサーバー

Claude など MCP (Model Context Protocol) 対応クライアントから、日野町議会の
(1) 議会だより掲載の一般質問（編集版）と (2) 会議録（発言単位の全文）を
横断参照するためのローカルサーバー。単一ファイル・外部依存なしで動く。

質問・答弁の下書き支援を、過去の実データと出典に接地させて行うための基盤であり、
「AIが質問・答弁を作る」ためのものではない。

## 位置づけ・方針

サーバーがクライアント（AI側）に渡す指示（instructions）として、次を明示している。

- 下書き・分析の出力には、参照した出典（議会だより第◯号／会議名・日付・原本PDFのURL）を必ず添える
- 議会だより・会議録の文章の著作権は議会（日野町のデータでは日野町議会）にある（議会名は議会だよりの出典の表記から読み取る）
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

> **v0.4.2（2026-10）**：会議の情報（`list_meetings` の各会議と、ほかのツールが返す `meeting`）に、会議の日付
> `date` とその出どころ `dateFrom`（`"pdf"`：日付のある原本PDFのうち最も早い日、`"name"`：会議名の「（M月D日）」から
> 求めた日）を足しました。原本PDFに日付の無い臨時会でも日付が返ります。従来の `dates`（PDF の日付の一覧）は変えていません。
> `meetings.json` に `date` の無いデータ（古い版・フォーク先）では、`dates` の最も早い日を `date`、`dateFrom` を `"pdf"` とします。

> **v0.5.0（2026-11）**：一般質問の台帳（hino-council-search の `data/ippan.tsv`。人が確認したもの）を
> 通した `proceedings.json` を読み、一般質問の区切りに、問いごとの構造（`questions`）と議長の注意（`chair`）を返すようにしました。
> `get_exchange` の各発言の見出し（`turn`）も台帳の種類から付けます。台帳の無い区切りは従来の機械の値に `structure: "推定"` を付けて返します。
> 見出しの対応表は hino-council-search の `scripts/lib/labels.mjs` と同じものを、このファイルの中に写して持っています（単一ファイルのまま動かすため）。

> **v0.6.0（2026-11）**：質疑の台帳（hino-council-search の `data/shitsugi.tsv`。人が確認したもの）を通した
> `proceedings.json` を読み、議案質疑の区切りに、議案ごとの発言と答弁（`parts`）と議長の注意（`chair`）を返すようにしました。
> `get_exchange` の各発言の見出し（`turn`）も台帳の種類と議案から付け、`get_bill_deliberation` の議案質疑は台帳の bill で引いて、その議案の発言と答弁を返します。

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
| `list_meetings` | 収載済み会議の一覧（会議の日付 `date`・`dateFrom` を含む） |
| `search_speeches` | 会議録の発言全文を検索（発言者・役職・年・場面で絞り込み可。結果に場面を表示） |
| `get_speech` | 発言1件＋前後の文脈 |
| `get_exchange` | ある会議での議員の質疑応酬をまとめて取得（長文はページング）。各発言に質問／再質問／答弁などの見出し（一般質問と議案質疑は台帳による） |
| `get_meeting_agenda` | 会議の議案一覧（目次PDF由来）。採決結果・付託委員会も含む |
| `get_bill_deliberation` | 議案1件の審議の経過（提案説明・議案質疑・委員長報告・討論・採決）を出典付きで |

議会だより→会議録のひも付けは、ダッシュボード側 `minutes` URL の数値IDが
会議録側の `meetingId` と一致することを利用している。`minutes` が「本会議のご案内」ページの
IDになっている号（例：35号）は、`meeting_pages.json` を逆引きして会議録IDに直す。

## 一般質問の構造（台帳）の返し方

`find_minutes_for_bulletin` と `get_exchange` が返す一般質問のブロックには、`structure` が付く。

- `structure: "台帳"`：問いの区切り・発言の種類・方式・題は、人が確認した一般質問の台帳（hino-council-search `data/ippan.tsv`・`data/ippan-chair.tsv`）による。ブロックに次を足す。
  ```jsonc
  "questions": [
    { "n": 1, "title": "国民健康保険制度改正に伴う問題点", "title_src": "会議録の発言による",   // 題が無い問いは title・title_src とも null
      "theme": "…",                          // 議会だよりの分類（あるときだけ）
      "style": "分割", "style_src": "議員の宣言",  // style_src は「議員の宣言」「発言の運びから推定」、方式が「不明」なら null
      "start": { "sid": "…_0031", "paragraph": 2 },                   // 問いの最初の質問が始まる発言と段落
      "turns": { "質問": ["…_0031"], "再質問": ["…_0035"], "再々質問": ["…_0039"], "要望": ["…_0043", "…_0045"] },
      "items": [{ "sid": "…", "paragraph": 2 }],                       // 一問一答で項目の始まりが読めたもの（あるときだけ）
      "conf": "中" }                                                    // 台帳の確信（高・中・低）
  ],
  "chair": [{ "sid": "…_0044", "note": "回数の注意" }]                  // 議長の注意（回数の注意・通告外の注意。あるときだけ）
  ```
  `turns` の種類は、質問・再質問・再々質問・4回目の質問・要望・回に数えない発言。一問一答では回を付けないので、要望以外は質問になる。
  1つの発言が前の問いの要望（または再質問など）と次の問いの質問を兼ねるときは、両方の問いの `turns` に出る。

  `get_exchange` の `exchange` の各発言には、次を付ける。
  - 議員の発言：`turn`（見出し。例「再質問（第1問）」「要望（第1問）／質問（第2問。p2から）」）、`question_no`（問番号。2つの問いにまたがるときは配列）、`kind`（種類の配列）
  - 答弁：`turn`（「答弁」。問いが2つ以上なら「答弁（第n問）」）、`question_no`（直前の議員の発言の問番号）
  - 議長の発言：`turn: "議長（進行）"`。台帳に議長の注意があれば `chair_note`（「回数の注意」「通告外の注意」）
- `structure: "推定"`：台帳の無い区切り（新しい会議で台帳に足す前など）。従来どおり機械の値（`topics`、各発言の質問／再質問／答弁と `question_no`）を返す。

## 議案質疑の構造（台帳）の返し方

`get_exchange` が返す議案質疑のブロックには、`structure` が付く。委員長・提出者（議員）が答弁した区切りには `answerer`（その議員名）が付く。

- `structure: "台帳"`：議案ごとの発言・回・答弁は、人が確認した質疑の台帳（hino-council-search `data/shitsugi.tsv`・`data/shitsugi-chair.tsv`）による。`bills` は台帳の議案（`議題外`・`不明` を除く）。ブロックに次を足す。
  ```jsonc
  "parts": [
    { "bill": "議第2号", "title": "令和３年度日野町一般会計補正予算（第９号）",   // 件名は gian.json から（あるときだけ）
      "start": { "sid": "…_0010", "paragraph": 1 },                        // この議案への質疑が始まる発言と段落
      "turns": { "質疑": [{ "sid": "…_0010", "paragraph": 1 }], "意見・要望": [{ "sid": "…_0018", "paragraph": 1 }] },  // paragraph は台帳に段落があるときだけ
      "answers": ["…_0012"],                                               // この議案への答弁の sid
      "conf": "高" },
    { "bill": "議題外", "bill_note": "議題に無い事柄", … }                  // 「不明」は bill_note「議案を決められない質疑」
  ],
  "chair": [{ "sid": "…_0011", "note": "範囲の注意" }]                     // 議長の注意（回数の注意・範囲の注意。あるときだけ）
  ```
  `turns` の種類は、質疑・再質疑・再々質疑・4回目の質疑・意見・要望・回に数えない発言。1つの発言が複数の議案にまたがるときは、複数の議案の `turns` に出る。

  `get_exchange` の `exchange` の各発言には、次を付ける。
  - 議員の発言：`turn`（見出し。例「質疑（議第2号 p1／議題外 p6）」「再質疑（議第85号）」「意見・要望」）、`bills`（この発言が当たる議案）、`parts`（`[{ bill, paragraph, kind }]`。段落の順）
  - 答弁：`turn`（「答弁（議第85号）」。台帳で議案に結びつかない答弁は「答弁」）、`bills`
  - 議長の発言：`turn: "議長（進行）"`。台帳に議長の注意があれば `chair_note`（「回数の注意」「範囲の注意」）
- `structure: "推定"`：台帳の無い区切り。従来どおり機械の値（`bills`、各発言の質問／再質問／答弁と `question_no`）を返す。

`get_bill_deliberation` の `steps.議案質疑` は、台帳のある区切りでは、その議案の行の `turns`・`answers`・`conf`・`start` と、ほかに聞いた議案（`other_bills`）を返す（`structure: "台帳"`）。

## 既知の限界

- `get_exchange` のブロックは、`proceedings.json` があれば会議録の議長の進行から切り出した
  実際の範囲（`scene` に一般質問／議案質疑／討論…を表示）。無い場合は従来の機械推定
  （同一日のPDF内で、本人発言の間隔が12発言を超えたら分割）。
- 一般質問の問いの区切り・質問／再質問の区別・方式・題は、台帳のある区切り（`structure: "台帳"`）では人が確認したもの。
  議案質疑の議案ごとの発言・回・答弁は、台帳のある区切り（`structure: "台帳"`）では人が確認したもの。
  台帳の無い区切りの質問／再質問の区別・質問項目（答弁冒頭から推定）・議案質疑の対象議案と質問／再質問、討論の賛否・対象議案は機械抽出で、
  誤りがありうる。精度はリポジトリの `scripts/check-proceedings.mjs` で確認できる。
- 議案番号は年（会期）ごとに振り直されるため、`get_bill_deliberation` は会議IDと組で指定する。
- 台帳の無い一般質問で、議会だよりの全質問と会議録の発言の対応（`qalign`）が取れているものは、`get_exchange` の質問／再質問を議会だよりの番号（`bulletin_question`）で返す。対応は文字の重なりによる機械推定。
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
