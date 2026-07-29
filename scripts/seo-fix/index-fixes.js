const fs = require("fs");
const path = require("path");
const { createHubIndex } = require("../generate-hub-index");
const { change, hash, readJson } = require("./safe-fixes");

function planHubFixes({ root, distPath, pages }) {
  const file = path.join(distPath, "hub-index.json");
  const current = readJson(file, {});
  const publicCurrent = readJson(path.join(root, "public", "hub-index.json"), {});
  const expected = createHubIndex(pages);
  const changes = [];
  for (const type of ["province", "region", "subject", "target"]) {
    const actualGroups = Array.isArray(current?.[type]) ? current[type] : [];
    const expectedGroups = expected[type] || [];
    const actualUrls = new Set(actualGroups.map((item) => item.url));
    const expectedUrls = new Set(expectedGroups.map((item) => item.url));
    for (const item of actualGroups) if (!expectedUrls.has(item.url)) changes.push(change("HUB_INDEX_STALE", "index", "dist/hub-index.json", "기존 Hub 규칙에 없는 항목을 제거합니다.", { before: item.url }));
    for (const item of expectedGroups) if (!actualUrls.has(item.url)) changes.push(change("HUB_INDEX_MISSING", "index", "dist/hub-index.json", "기존 Hub 규칙에 따른 정상 항목을 추가합니다.", { after: item.url }));
  }
  const needsRegeneration = hash(current || {}) !== hash(expected) || hash(publicCurrent || {}) !== hash(expected);
  if (needsRegeneration) changes.push(change("HUB_INDEX_REGENERATE", "index", "dist/hub-index.json", "기존 Hub 생성 규칙의 정상 결과와 public·dist가 일치하도록 재생성합니다.", { before: `${hash(current || {})}|${hash(publicCurrent || {})}`, after: hash(expected) }));
  return { changes, current, publicCurrent, expected, needsRegeneration };
}

function sitemapUrls(file) {
  if (!fs.existsSync(file)) return [];
  return [...fs.readFileSync(file, "utf8").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => match[1].trim());
}

function planSitemapFixes({ distPath, pages, hubIndex, baseUrl }) {
  const file = path.join(distPath, "sitemap.xml");
  const current = sitemapUrls(file);
  const hubs = ["province", "region", "subject", "target"].flatMap((type) => hubIndex[type] || []);
  const expected = [`${baseUrl}/`, ...pages.map((page) => `${baseUrl}/${page.slug}/`), ...hubs.map((hub) => `${baseUrl}${hub.url}`)];
  const currentSet = new Set(current);
  const expectedSet = new Set(expected);
  const changes = [];
  for (const url of expectedSet) if (!currentSet.has(url)) changes.push(change("SITEMAP_URL_MISSING", "sitemap", "dist/sitemap.xml", "실제 공개 페이지 URL을 sitemap에 추가합니다.", { after: url }));
  for (const url of currentSet) if (!expectedSet.has(url)) changes.push(change("SITEMAP_URL_STALE", "sitemap", "dist/sitemap.xml", "실제 페이지가 없는 URL을 sitemap에서 제거합니다.", { before: url }));
  if (current.length !== currentSet.size) changes.push(change("SITEMAP_URL_DUPLICATE", "sitemap", "dist/sitemap.xml", "중복 sitemap URL을 제거합니다.", { before: current.length, after: currentSet.size }));
  const needsRegeneration = current.length !== expected.length || expected.some((url, index) => current[index] !== url);
  if (needsRegeneration) changes.push(change("SITEMAP_REGENERATE", "sitemap", "dist/sitemap.xml", "기존 sitemap 생성기를 실행해 canonical URL 형식으로 정상화합니다.", { before: hash(current), after: hash(expected) }));
  return { changes, current, expected, needsRegeneration };
}

module.exports = { planHubFixes, planSitemapFixes, sitemapUrls };
