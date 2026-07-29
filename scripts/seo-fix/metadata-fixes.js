const path = require("path");
const { makeSearchItem } = require("../generate-search-index");
const { change, hash, readJson } = require("./safe-fixes");

const FIELDS = ["title", "keyword", "province", "region", "subject", "target"];

function planSearchFixes({ root, distPath, pages }) {
  const file = path.join(distPath, "search-index.json");
  const current = readJson(file, []);
  const publicCurrent = readJson(path.join(root, "public", "search-index.json"), []);
  const expected = pages.map(makeSearchItem);
  const changes = [];
  const currentBySlug = new Map();
  const duplicateSlugs = new Set();

  for (const item of Array.isArray(current) ? current : []) {
    if (currentBySlug.has(item.slug)) duplicateSlugs.add(item.slug);
    else currentBySlug.set(item.slug, item);
  }
  const expectedBySlug = new Map(expected.map((item) => [item.slug, item]));
  for (const slug of duplicateSlugs) changes.push(change("SEARCH_INDEX_DUPLICATE", "metadata", "dist/search-index.json", "중복 slug 항목을 제거합니다.", { slug }));
  for (const [slug, item] of currentBySlug) {
    if (!expectedBySlug.has(slug)) changes.push(change("SEARCH_INDEX_STALE", "metadata", "dist/search-index.json", "실제 공개 페이지가 없는 항목을 제거합니다.", { slug, before: item }));
  }
  for (const [slug, expectedItem] of expectedBySlug) {
    const actual = currentBySlug.get(slug);
    if (!actual) changes.push(change("SEARCH_INDEX_MISSING", "metadata", "dist/search-index.json", "실제 공개 페이지를 검색 인덱스에 추가합니다.", { slug, after: expectedItem }));
    else for (const field of FIELDS) {
      if (String(actual[field] || "") !== String(expectedItem[field] || "")) {
        changes.push(change("SEARCH_INDEX_FIELD_MISMATCH", "metadata", "dist/search-index.json", `pages.csv 기준으로 ${field} 값을 동기화합니다.`, { slug, before: actual[field] || "", after: expectedItem[field] || "" }));
      }
    }
  }
  const needsRegeneration = hash(current) !== hash(expected) || hash(publicCurrent) !== hash(expected);
  if (needsRegeneration) changes.push(change("SEARCH_INDEX_REGENERATE", "metadata", "dist/search-index.json", "pages.csv와 실제 공개 페이지를 기준으로 public과 dist 검색 인덱스를 재생성합니다.", { before: `${hash(current)}|${hash(publicCurrent)}`, after: hash(expected) }));
  return { changes, current, publicCurrent, expected, needsRegeneration };
}

module.exports = { planSearchFixes };
