const path = require("path");
const { createRelatedIndex } = require("../generate-related-index");
const { change, hash, readJson, unique } = require("./safe-fixes");

function planRelatedFixes({ root, distPath, pages, limit = 8 }) {
  const file = path.join(distPath, "related-index.json");
  const current = readJson(file, {});
  const publicCurrent = readJson(path.join(root, "public", "related-index.json"), {});
  const expected = createRelatedIndex(pages);
  const pageSlugs = new Set(pages.map((page) => page.slug));
  const changes = [];
  for (const [slug, groups] of Object.entries(current || {})) {
    if (!pageSlugs.has(slug)) { changes.push(change("RELATED_INDEX_STALE_ENTRY", "links", "dist/related-index.json", "존재하지 않는 페이지의 관련 목록을 제거합니다.", { slug })); continue; }
    for (const [group, values] of Object.entries(groups || {})) {
      if (!Array.isArray(values)) continue;
      if (values.includes(slug)) changes.push(change("BROKEN_RELATED_SELF_LINK", "links", "dist/related-index.json", "자기 자신 추천을 제거합니다.", { slug, before: group }));
      if (unique(values).length !== values.length) changes.push(change("BROKEN_RELATED_DUPLICATE", "links", "dist/related-index.json", "중복 추천을 제거합니다.", { slug, before: group }));
      const missing = values.filter((value) => !pageSlugs.has(value));
      if (missing.length) changes.push(change("BROKEN_RELATED_LINK", "links", "dist/related-index.json", "존재하지 않는 추천 페이지를 제거합니다.", { slug, before: missing }));
      if (values.length > limit) changes.push(change("RELATED_INDEX_LIMIT", "links", "dist/related-index.json", "기존 관련도 순서대로 추천 개수를 제한합니다.", { slug, before: values.length, after: limit }));
    }
  }
  for (const page of pages) if (!Object.hasOwn(current || {}, page.slug)) changes.push(change("RELATED_INDEX_MISSING", "links", "dist/related-index.json", "기존 추천 알고리즘으로 누락 목록을 복구합니다.", { slug: page.slug }));
  const needsRegeneration = hash(current || {}) !== hash(expected) || hash(publicCurrent || {}) !== hash(expected);
  if (needsRegeneration) changes.push(change("RELATED_INDEX_REGENERATE", "links", "dist/related-index.json", "기존 관련 추천 알고리즘의 정상 결과와 public·dist가 일치하도록 재생성합니다.", { before: `${hash(current || {})}|${hash(publicCurrent || {})}`, after: hash(expected) }));
  return { changes, current, publicCurrent, expected, needsRegeneration };
}

module.exports = { planRelatedFixes };
