const fs = require("fs");
const path = require("path");

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === content) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

function makeSearchItem(page) {
  return {
    slug: page.slug,
    title: page.title,
    keyword: page.keyword,
    province: page.province,
    region: page.region,
    subject: page.subject,
    target: page.target,
  };
}

/** 검색과 Wizard가 함께 사용하는 최소 데이터 파일만 생성합니다. */
function generateSearchIndex({ root, outputPath, pages }) {
  const searchIndex = pages.map(makeSearchItem);
  const json = `${JSON.stringify(searchIndex)}\n`;
  const publicFile = path.join(root, "public", "search-index.json");

  fs.mkdirSync(path.dirname(publicFile), { recursive: true });
  fs.writeFileSync(publicFile, json, "utf8");
  fs.writeFileSync(path.join(outputPath, "search-index.json"), json, "utf8");
  return searchIndex.length;
}

/** 기존 검색 목록의 변경·추가·삭제 항목만 Map에서 교체한 뒤 현재 CSV 순서로 저장합니다. */
function updateSearchIndex({ root, outputPath, pages, changedSlugs, deletedSlugs }) {
  const existingFile = path.join(outputPath, "search-index.json");
  const existing = fs.existsSync(existingFile) ? JSON.parse(fs.readFileSync(existingFile, "utf8")) : [];
  const bySlug = new Map(existing.map((item) => [item.slug, item]));
  for (const slug of deletedSlugs) bySlug.delete(slug);
  for (const page of pages) {
    if (changedSlugs.has(page.slug) || !bySlug.has(page.slug)) bySlug.set(page.slug, makeSearchItem(page));
  }
  const searchIndex = pages.map((page) => bySlug.get(page.slug) || makeSearchItem(page));
  const json = `${JSON.stringify(searchIndex)}\n`;
  const publicFile = path.join(root, "public", "search-index.json");
  const publicChanged = writeIfChanged(publicFile, json);
  const outputChanged = writeIfChanged(existingFile, json);
  return { count: searchIndex.length, changed: publicChanged || outputChanged };
}

module.exports = { generateSearchIndex, makeSearchItem, updateSearchIndex };
