// 会議の日付（scripts/lib/dates.mjs）の回帰テスト。
// 実行: npm test（node --test）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dateFromName, meetingDate } from "../lib/dates.mjs";

test("dateFromName：会議名の「（M月D日）」と年から求める（全角数字も）", () => {
  assert.equal(dateFromName({ name: "令和3年第1回（2月10日）臨時会会議録", year: 2021 }), "2021-02-10");
  assert.equal(dateFromName({ name: "令和5年第1回（１月２３日）臨時会会議録", year: 2023 }), "2023-01-23");
  assert.equal(dateFromName({ name: "令和8年5月臨時会議", year: 2026 }), null);
  assert.equal(dateFromName({ name: "（2月10日）", year: null }), null);
});

test("meetingDate：日付のあるPDFのうち最も早い日、無ければ会議名から", () => {
  const pdf = (date) => ({ label: "", date, url: "" });
  assert.deepEqual(meetingDate({ name: "令和7年6月定例会議", year: 2025, pdfs: [pdf(null), pdf("2025-06-12"), pdf("2025-06-05")] }),
    { date: "2025-06-05", dateFrom: "pdf" });
  // PDFに日付があれば、会議名の日付より優先する
  assert.deepEqual(meetingDate({ name: "令和3年第1回（2月10日）臨時会会議録", year: 2021, pdfs: [pdf("2021-02-11")] }),
    { date: "2021-02-11", dateFrom: "pdf" });
  assert.deepEqual(meetingDate({ name: "令和3年第1回（2月10日）臨時会会議録", year: 2021, pdfs: [pdf(null), pdf(null)] }),
    { date: "2021-02-10", dateFrom: "name" });
  assert.deepEqual(meetingDate({ name: "令和8年5月臨時会議", year: 2026, pdfs: [pdf(null)] }), { date: null, dateFrom: null });
});
