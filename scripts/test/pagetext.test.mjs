// PDF の文字の取り出し（scripts/lib/pagetext.mjs の pageText）と、発言の text の段落（scripts/lib/speech.mjs）の回帰テスト。
// 実行: npm test（node --test）。座標は令和7年3月定例会 第1日（0000008397_20250303.pdf）の5ページの値（ページ番号は1-1に替えた）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageText, PARA } from "../lib/pagetext.mjs";
import { splitSpeeches, stripPageHeads, stripPara, speechText } from "../lib/speech.mjs";

// pdfjs の item の形（str・transform・width・height・hasEOL）。1字の幅は 11。
const it = (str, x, y, eol, w = str.length * 11) => ({ str, transform: [11, 0, 0, 11, x, y], width: w, height: 11.04, hasEOL: eol });
const eol = (x, y) => ({ str: "", transform: [11, 0, 0, 11, x, y], width: 0, height: 0, hasEOL: true });
// 5ページの形：ページ番号、段落の続きの行（96.3）、段落の最初の行（107.4）、話し手の行（85.1）
const page = [
  it("1-1", 289.4, 66.9, false), eol(107.4, 729.3),
  it("昭和３０年３月１６日に１町６村が合併して以来、日野町とし", 107.4, 729.3, true, 402.4),
  it("ことができました。これまで町の発展にご尽力を頂いた方々のご努力", 96.3, 710.6, true, 413.8),
  it("節目を祝うため、議員の皆様方はじめ多くの方々にご参加を頂きたい", 96.3, 691.8, true, 413.9),
  it("と思います。", 96.3, 673.1, false), eol(107.4, 654.3),
  it("さて、本定例会には、令和６年度補正予算案、令和７年度当初予算", 107.4, 654.3, true, 402.4),
  it("ていただきます。", 96.3, 635.6, false), eol(85.1, 241.7),
  it("議長（杉浦和人君）", 85.1, 241.7, false), it(" ", 185.8, 241.7, false, 11.6),
  it("本日の議事日程は、お手元に印刷配付のとおりであります。", 197.5, 241.7, false), eol(107.4, 223),
  it("日程第１", 107.4, 223, false), it(" ", 151.9, 223, false, 11.4), it("会議録署名議員の指名を行います。", 163.3, 223, false),
];

test("pageText：字下げのある行の前にだけ印を入れる", () => {
  const t = pageText(page);
  assert.equal(t.split(PARA).length - 1, 3);
  const parts = t.split(PARA);
  assert.ok(parts[0].startsWith("1-1"), "ページ番号の行の前には入れない");
  assert.ok(parts[1].startsWith("昭和"));
  assert.ok(parts[2].startsWith("さて、"));
  assert.ok(parts[2].includes("議長（杉浦和人君）"), "話し手の行（左端より左）の前には入れない");
  assert.ok(parts[3].startsWith("日程第１"));
});

test("pageText：印を除くと items の str を空文字でつないだものと同じ", () => {
  assert.equal(stripPara(pageText(page)), page.map((i) => i.str).join(""));
});

test("pageText：段落の続きの行が無いページ（左端が決まらない）には印を入れない", () => {
  const p = [it("1-31", 287, 66.9, false), eol(85.1, 729), it("議長（杉浦和人君）", 85.1, 729, false), eol(387, 700), it("－散会－", 387, 700, false)];
  assert.equal(pageText(p).includes(PARA), false);
});

test("発言の text：印は改行になり、ページの境目の改行は除く", () => {
  const raw = stripPageHeads(pageText(page) + "\n" + "1-2" + "の続きです。" + PARA + "次の段落です。\n");
  const sp = splitSpeeches(raw).map((s) => ({ ...s, text: speechText(s.text) }));
  assert.equal(sp[0].name, "（会議録情報）");
  assert.equal(sp[0].text.split("\n").length, 2);
  assert.equal(sp[1].role, "議長");
  assert.equal(sp[1].name, "杉浦和人");
  assert.equal(sp[1].text, "本日の議事日程は、お手元に印刷配付のとおりであります。\n日程第１ 会議録署名議員の指名を行います。の続きです。\n次の段落です。");
});

test("speechText：先頭と末尾の改行を除き、続く改行は1つにする", () => {
  assert.equal(speechText(PARA + "あ" + PARA + PARA + "い\n" + PARA + "う" + PARA), "あ\nい\nう");
  assert.equal(speechText("あ\nい"), "あい");
});

test("話し手の印は段落の印をまたがない", () => {
  const sp = splitSpeeches("前の発言です。" + PARA + "町長（堀江和博君）それでは、" + PARA + "本案は、");
  assert.equal(sp[1].role, "町長");
  assert.equal(sp[0].text, "前の発言です。");
  assert.equal(splitSpeeches("町長（堀江" + PARA + "和博君）").length, 1, "氏名の中に印があれば話し手とみなさない");
});
