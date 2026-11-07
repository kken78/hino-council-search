// 目次PDFからの議案件名の取り出し（scripts/lib/speech.mjs の extractGianFromToc）の回帰テスト。
// 実行: npm test（node --test）。目次のテキストで実際に見られた行の形を小さな例にしている。
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripTocPageNo, extractGianFromToc } from "../lib/speech.mjs";

test("stripTocPageNo：件名の末尾のページ番号を除く", () => {
  assert.equal(stripTocPageNo("令和６年度日野町国民健康保険特別会計補正予算（第１号） 6"), "令和６年度日野町国民健康保険特別会計補正予算（第１号）");
  assert.equal(stripTocPageNo("日野町議会委員会条例の一部を改正する条例の制定について 15"), "日野町議会委員会条例の一部を改正する条例の制定について");
  assert.equal(stripTocPageNo("日野町都市公園条例の一部を改正する条例の制定について 1－ 8"), "日野町都市公園条例の一部を改正する条例の制定について");
  assert.equal(stripTocPageNo("日野町職員定数条例の一部を改正する条例の制定について 1－13"), "日野町職員定数条例の一部を改正する条例の制定について");
  // 全角の数字のページ番号
  assert.equal(stripTocPageNo("日野町介護保険条例の一部を改正する条例の制定について　１－８"), "日野町介護保険条例の一部を改正する条例の制定について");
  assert.equal(stripTocPageNo("専決処分の報告について ４ "), "専決処分の報告について");
});

test("stripTocPageNo：号の数字や空白の無い数字は残す", () => {
  assert.equal(stripTocPageNo("令和６年度日野町一般会計補正予算（第１号）"), "令和６年度日野町一般会計補正予算（第１号）");
  assert.equal(stripTocPageNo("令和6年度日野町一般会計補正予算（第2号）"), "令和6年度日野町一般会計補正予算（第2号）");
  assert.equal(stripTocPageNo("第２号"), "第２号");
  assert.equal(stripTocPageNo("令和８"), "令和８");
});

test("extractGianFromToc：点線の無い行でもページ番号を件名に残さない", () => {
  const toc =
    "１．議第４２号 令和６年度日野町一般会計補正予算（第２号） ……………… 5" +
    "１．議第４３号 令和６年度日野町国民健康保険特別会計補正予算（第１号） 6" +
    "１．報第 ２号 専決処分の報告について（損害賠償の額を定めることについて） ……………… 6" +
    "１．議第７８号 日野町都市公園条例の一部を改正する条例の制定について 1－ 8" +
    "１．議第３７号 日野町議会委員会条例の一部を改正する条例の制定について 15\n";
  assert.deepEqual(extractGianFromToc(toc), {
    "議第42号": "令和６年度日野町一般会計補正予算（第２号）",
    "議第43号": "令和６年度日野町国民健康保険特別会計補正予算（第１号）",
    "報第2号": "専決処分の報告について（損害賠償の額を定めることについて）",
    "議第78号": "日野町都市公園条例の一部を改正する条例の制定について",
    "議第37号": "日野町議会委員会条例の一部を改正する条例の制定について",
  });
});
