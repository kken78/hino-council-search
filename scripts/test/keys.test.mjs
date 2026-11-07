import { test } from "node:test";
import assert from "node:assert/strict";
import { textKey, isTocPdf } from "../lib/keys.mjs";

test("textKey：本文の PDF は日付をキーにする", () => {
  assert.equal(textKey("0000009023", { label: "本文", date: "2026-07-27", url: "https://example/9023/20260727kaigiroku.pdf" }), "0000009023_20260727");
});

test("textKey：目次の PDF は、日付が付いていてもファイル名をキーにする（本文と重ならない）", () => {
  const toc = { label: "目次(PDFサイズ：45.64KB)", date: "2026-07-27", url: "https://example/9023/20260727mokuji.pdf" };
  assert.equal(isTocPdf(toc), true);
  assert.equal(textKey("0000009023", toc), "0000009023_20260727mokuji");
  assert.equal(textKey("0000008413", { label: "目次", date: null, url: "https://example/8413/7.5mokuji.pdf" }), "0000008413_7.5mokuji");
});
