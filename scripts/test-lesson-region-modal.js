"use strict";

const assert = require("node:assert/strict");
const search = require("../public/utils/lesson-region-modal");

const pages = [
  { province: "경기도", region: "안양", subject: "영어회화", slug: "anyang-english-conversation" },
  { province: "경기도", region: "안양", subject: "토익", slug: "anyang-toeic" },
  { province: "경기도", region: "안양", subject: "오픽", slug: "anyang-opic" },
  { province: "대전광역시", region: "대전", subject: "일본어회화", slug: "daejeon-japanese-conversation" },
  { province: "대전광역시", region: "대전", subject: "비즈니스영어", slug: "daejeon-business-english" },
];

assert.deepEqual(search.availableRegions(pages, "english-conversation", "안").map(function (page) { return page.region; }), ["안양"]);
assert.deepEqual(search.availableRegions(pages, "japanese-conversation", "대").map(function (page) { return page.region; }), ["대전"]);
assert.equal(search.findPage(pages, "business-english", pages[3]).slug, "daejeon-business-english");
assert.deepEqual(search.examPages(pages, pages[0]), [
  { label: "TOEIC", slug: "anyang-toeic" },
  { label: "OPIC", slug: "anyang-opic" },
]);
assert.equal(search.findPage(pages, "english-conversation", pages[3]), undefined);

console.log("Lesson region modal tests passed.");
