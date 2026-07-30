const fs = require("fs");
const path = require("path");
const { issue } = require("./rules");

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#039;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value = "") {
  return decodeHtml(String(value).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function attribute(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(match ? match[1] ?? match[2] ?? match[3] ?? "" : "");
}

function metaContent(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find((item) => attribute(item, "name").toLowerCase() === name.toLowerCase());
  return tag ? attribute(tag, "content") : "";
}

function pageTypeFromRelative(relativePath) {
  const clean = relativePath.replace(/\\/g, "/");
  if (clean === "index.html") return "home";
  const hub = clean.match(/^hub\/(province|region|subject|target)\//);
  return hub ? `hub-${hub[1]}` : "regular";
}

function urlPathFromRelative(relativePath) {
  const clean = relativePath.replace(/\\/g, "/").replace(/index\.html$/, "");
  return clean ? `/${clean}` : "/";
}

function discoverHtmlFiles(distPath) {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.toLowerCase() === "index.html") files.push(fullPath);
    }
  };
  walk(distPath);
  return files.sort();
}

function parseDocument(filePath, distPath) {
  const html = fs.readFileSync(filePath, "utf8");
  const relativePath = path.relative(distPath, filePath);
  const pageType = pageTypeFromRelative(relativePath);
  const urlPath = urlPathFromRelative(relativePath);
  const title = stripTags((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const descriptions = (html.match(/<meta\b[^>]*>/gi) || [])
    .filter((tag) => attribute(tag, "name").toLowerCase() === "description")
    .map((tag) => attribute(tag, "content"));
  const canonicals = (html.match(/<link\b[^>]*>/gi) || [])
    .filter((tag) => attribute(tag, "rel").toLowerCase().split(/\s+/).includes("canonical"))
    .map((tag) => attribute(tag, "href"));
  const headings = [...html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => ({ level: Number(match[1].slice(1)), text: stripTags(match[2]) }));
  const links = (html.match(/<a\b[^>]*>/gi) || []).map((tag) => ({ href: attribute(tag, "href"), text: "", tag }));
  const fullLinks = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ href: attribute(`<a ${match[1]}>`, "href"), text: stripTags(match[2]), tag: match[0] }));
  const images = (html.match(/<img\b[^>]*>/gi) || []).map((tag) => ({
    src: attribute(tag, "src"), alt: attribute(tag, "alt"), width: attribute(tag, "width"),
    height: attribute(tag, "height"), role: attribute(tag, "role"), tag,
  }));
  const faqSections = [...html.matchAll(/<details\b[^>]*class="[^"]*faq-item[^"]*"[^>]*>([\s\S]*?)<\/details>/gi)];
  const faqQuestions = faqSections.map((match) => stripTags((match[1].match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i) || [])[1] || ""));
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => stripTags(match[1])).filter(Boolean);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const jsonLdTexts = scripts.filter((match) => attribute(`<script ${match[1]}>`, "type").toLowerCase() === "application/ld+json").map((match) => match[2].trim());
  const text = stripTags(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<svg\b[\s\S]*?<\/svg>/gi, " "));
  const aiSummaryBlock = (html.match(/class="[^"]*ai-summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "";
  const consultationBlock = (html.match(/id="consultation"[^>]*>([\s\S]*?)<\/section>/i) || [])[1] || "";
  const robots = metaContent(html, "robots");
  const lang = attribute((html.match(/<html\b[^>]*>/i) || [""])[0], "lang");
  return {
    filePath, relativePath: relativePath.replace(/\\/g, "/"), slug: urlPath === "/" ? "" : urlPath.replace(/^\/+|\/+$/g, ""),
    urlPath, pageType, html, title, description: descriptions[0] || "", descriptions, canonicals,
    h1: headings.filter((item) => item.level === 1).map((item) => item.text), headings,
    links: fullLinks.length ? fullLinks : links, images, paragraphs, faqQuestions, jsonLdTexts,
    text, textLength: text.replace(/\s/g, "").length, lang, robots,
    viewport: metaContent(html, "viewport"), hasBreadcrumb: /class="[^"]*breadcrumb[^"]*"/i.test(html),
    hasCta: /class="[^"]*(?:cta|mid-cta)[^"]*"/i.test(html) || /id="consultation"/i.test(html),
    hasFaq: faqQuestions.length > 0, hasAiSummary: /ai-summary-section|AI Summary/i.test(html),
    hasKeyTakeaways: /key-takeaways-section|Key Takeaways/i.test(html),
    hasRecommendedAudience: /id="fit"|이런 분께 추천/i.test(html),
    hasRelatedSection: /id="related"|internal-links-section/i.test(html),
    introduction: stripTags(aiSummaryBlock).slice(0, 500),
    ctaText: stripTags(consultationBlock).slice(0, 500),
  };
}

function validateUrlSlug(document, config) {
  const problems = [];
  const parts = document.slug.split("/");
  for (const slug of parts) {
    if (!slug) continue;
    if (/[A-Z]/.test(slug)) problems.push(issue("WARNING", "technicalSeo", "slug-uppercase", "URL에 대문자가 포함되어 있습니다."));
    if (/\s/.test(slug)) problems.push(issue("ERROR", "technicalSeo", "slug-space", "URL에 공백이 포함되어 있습니다."));
    if (/--/.test(slug)) problems.push(issue("WARNING", "technicalSeo", "slug-double-hyphen", "URL에 연속 하이픈이 포함되어 있습니다."));
    if (/^-|-$/.test(slug) || /[^a-zA-Z0-9-]/.test(slug)) problems.push(issue("ERROR", "technicalSeo", "slug-invalid-character", "URL에 허용되지 않는 문자가 있습니다."));
  }
  if (document.urlPath.length > config.urlMaximumLength) problems.push(issue("WARNING", "technicalSeo", "url-too-long", `URL 길이가 ${config.urlMaximumLength}자를 초과합니다.`));
  return problems;
}

function safeJson(filePath, issues, label) {
  if (!fs.existsSync(filePath)) {
    issues.push(issue("ERROR", "technicalSeo", `${label}-missing`, `${path.basename(filePath)} 파일이 없습니다.`));
    return null;
  }
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) {
    issues.push(issue("ERROR", "technicalSeo", `${label}-invalid`, `${path.basename(filePath)} JSON 문법 오류: ${error.message}`));
    return null;
  }
}

function checkSitemapAndRobots(distPath, documents, baseUrl) {
  const issues = [];
  const sitemapPath = path.join(distPath, "sitemap.xml");
  const robotsPath = path.join(distPath, "robots.txt");
  const documentByUrl = new Map(documents.map((document) => [`${baseUrl}${document.urlPath}`, document]));
  const sitemapUrls = [];
  if (!fs.existsSync(sitemapPath)) issues.push(issue("ERROR", "technicalSeo", "sitemap-missing", "sitemap.xml이 없습니다."));
  else {
    const sitemapBytes = fs.readFileSync(sitemapPath);
    const hasBom = sitemapBytes.length >= 3 && sitemapBytes[0] === 0xef && sitemapBytes[1] === 0xbb && sitemapBytes[2] === 0xbf;
    const xml = sitemapBytes.toString("utf8");
    if (hasBom) issues.push(issue("ERROR", "technicalSeo", "sitemap-utf8-bom", "sitemap.xml은 UTF-8 BOM 없이 저장해야 합니다."));
    if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>\r?\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(xml)) {
      issues.push(issue("ERROR", "technicalSeo", "sitemap-namespace-invalid", "sitemap.xml의 urlset namespace가 Google Sitemap 규격과 다릅니다."));
    }
    if (/\sxmlns:(?:xhtml|image|news|video)=/i.test(xml)) {
      issues.push(issue("ERROR", "technicalSeo", "sitemap-namespace-unused", "사용하지 않는 sitemap namespace가 포함되어 있습니다."));
    }
    if (!/<urlset\b[^>]*>[\s\S]*<\/urlset>/i.test(xml)) issues.push(issue("ERROR", "technicalSeo", "sitemap-xml-invalid", "sitemap.xml 기본 XML 구조가 잘못되었습니다."));
    sitemapUrls.push(...[...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeHtml(match[1].trim())));
    const counts = new Map();
    for (const url of sitemapUrls) {
      counts.set(url, (counts.get(url) || 0) + 1);
      try { if (new URL(url).origin !== new URL(baseUrl).origin) issues.push(issue("ERROR", "technicalSeo", "sitemap-url-invalid", "sitemap에 다른 도메인 URL이 있습니다.", { url })); }
      catch { issues.push(issue("ERROR", "technicalSeo", "sitemap-url-invalid", "sitemap에 잘못된 URL이 있습니다.", { url })); }
      if (!documentByUrl.has(url)) issues.push(issue("ERROR", "technicalSeo", "sitemap-page-missing", "sitemap URL에 해당하는 dist 페이지가 없습니다.", { url }));
    }
    for (const [url, count] of counts) if (count > 1) issues.push(issue("ERROR", "technicalSeo", "sitemap-url-duplicated", "sitemap URL이 중복됩니다.", { url, count }));
    const sitemapSet = new Set(sitemapUrls);
    for (const [url, document] of documentByUrl) {
      if (!sitemapSet.has(url)) issues.push(issue("ERROR", "technicalSeo", "page-not-in-sitemap", "생성 페이지가 sitemap에 없습니다.", { slug: document.slug || "__home__", url }));
      if (document.canonicals[0] && !sitemapSet.has(document.canonicals[0])) issues.push(issue("ERROR", "technicalSeo", "canonical-not-in-sitemap", "canonical URL이 sitemap에 없습니다.", { slug: document.slug || "__home__", canonical: document.canonicals[0] }));
    }
  }
  if (!fs.existsSync(robotsPath)) issues.push(issue("ERROR", "technicalSeo", "robots-missing", "robots.txt가 없습니다."));
  else {
    const robots = fs.readFileSync(robotsPath, "utf8");
    if (!/^\s*Sitemap:\s*\S+/im.test(robots)) issues.push(issue("ERROR", "technicalSeo", "robots-sitemap-missing", "robots.txt에 Sitemap 경로가 없습니다."));
    if (/^\s*Disallow:\s*\/?\s*$/im.test(robots)) issues.push(issue("ERROR", "technicalSeo", "robots-blocks-site", "robots.txt가 중요한 전체 경로를 차단합니다."));
    if (/^\s*Disallow:\s*\/(?:assets|style\.css)/im.test(robots)) issues.push(issue("ERROR", "technicalSeo", "robots-blocks-assets", "robots.txt가 CSS 또는 assets를 차단합니다."));
    if (documents.some((document) => /\bnoindex\b/i.test(document.robots) && sitemapUrls.includes(`${baseUrl}${document.urlPath}`))) issues.push(issue("WARNING", "technicalSeo", "robots-meta-conflict", "noindex 페이지가 sitemap에 포함되어 있습니다."));
  }
  return { issues, sitemapUrls };
}

function checkIndexes(distPath, documents, config) {
  const issues = [];
  const regular = documents.filter((document) => document.pageType === "regular");
  const regularBySlug = new Map(regular.map((document) => [document.slug, document]));
  const search = safeJson(path.join(distPath, "search-index.json"), issues, "search-index");
  const related = safeJson(path.join(distPath, "related-index.json"), issues, "related-index");
  const hubs = safeJson(path.join(distPath, "hub-index.json"), issues, "hub-index");
  const searchBySlug = new Map();
  if (Array.isArray(search)) {
    for (const item of search) {
      if (searchBySlug.has(item.slug)) issues.push(issue("ERROR", "technicalSeo", "search-index-duplicate", "search-index slug가 중복됩니다.", { slug: item.slug }));
      searchBySlug.set(item.slug, item);
      const page = regularBySlug.get(item.slug);
      if (!page) issues.push(issue("ERROR", "technicalSeo", "search-index-page-missing", "search-index 항목에 해당하는 페이지가 없습니다.", { slug: item.slug }));
      else if (item.title !== page.title) issues.push(issue("ERROR", "metadata", "search-index-title-mismatch", "search-index title과 페이지 title이 다릅니다.", { slug: item.slug }));
      for (const field of ["keyword", "province", "region", "subject"]) if (!String(item[field] || "").trim()) issues.push(issue("WARNING", "metadata", "search-index-field-missing", `search-index ${field} 값이 비어 있습니다.`, { slug: item.slug, field }));
    }
    for (const document of regular) if (!searchBySlug.has(document.slug)) issues.push(issue("ERROR", "technicalSeo", "page-not-in-search-index", "페이지가 search-index에 없습니다.", { slug: document.slug }));
  }
  if (related && typeof related === "object") {
    for (const document of regular) {
      const entry = related[document.slug];
      if (!entry) { issues.push(issue("ERROR", "internalLinks", "related-index-entry-missing", "related-index에 현재 slug가 없습니다.", { slug: document.slug })); continue; }
      const all = [];
      for (const [group, slugs] of Object.entries(entry)) {
        if (!Array.isArray(slugs)) continue;
        if (slugs.length > config.relatedRecommendationLimit) issues.push(issue("WARNING", "internalLinks", "related-index-limit", "관련 추천 개수가 설정 기준을 초과합니다.", { slug: document.slug, group, count: slugs.length }));
        if (new Set(slugs).size !== slugs.length) issues.push(issue("WARNING", "internalLinks", "related-index-duplicate", "같은 관련 추천이 한 그룹에서 중복됩니다.", { slug: document.slug, group }));
        for (const linkedSlug of slugs) {
          all.push(linkedSlug);
          if (linkedSlug === document.slug) issues.push(issue("ERROR", "internalLinks", "related-index-self", "related-index가 자기 자신을 추천합니다.", { slug: document.slug, group }));
          if (!regularBySlug.has(linkedSlug)) issues.push(issue("ERROR", "internalLinks", "related-index-target-missing", "related-index가 존재하지 않는 페이지를 추천합니다.", { slug: document.slug, linkedSlug }));
        }
      }
      if (!all.length) issues.push(issue("WARNING", "internalLinks", "related-index-empty", "관련 추천이 모두 비어 있습니다.", { slug: document.slug }));
      const repeated = new Map(); for (const linkedSlug of all) repeated.set(linkedSlug, (repeated.get(linkedSlug) || 0) + 1);
      if ([...repeated.values()].some((count) => count > 3)) issues.push(issue("INFO", "internalLinks", "related-index-cross-group-repeat", "같은 추천이 여러 그룹에서 반복됩니다.", { slug: document.slug }));
    }
  }
  if (hubs && typeof hubs === "object") {
    const hubDocuments = new Set(documents.filter((document) => document.pageType.startsWith("hub-")).map((document) => document.urlPath));
    for (const type of ["province", "region", "subject", "target"]) {
      const groups = hubs[type];
      if (!Array.isArray(groups)) { issues.push(issue("ERROR", "technicalSeo", "hub-index-group-missing", `hub-index ${type} 그룹이 없습니다.`)); continue; }
      for (const group of groups) {
        if (!group.count) issues.push(issue("WARNING", "internalLinks", "hub-index-empty", "페이지가 없는 Hub 항목입니다.", { type, value: group.value }));
        if (!hubDocuments.has(group.url)) issues.push(issue("ERROR", "internalLinks", "hub-index-page-missing", "hub-index URL에 해당하는 Hub 페이지가 없습니다.", { type, url: group.url }));
      }
    }
    for (const document of regular) {
      const searchItem = searchBySlug.get(document.slug);
      if (!searchItem) continue;
      const checks = [
        ["province", (group) => group.value === searchItem.province],
        ["region", (group) => group.province === searchItem.province && group.region === searchItem.region],
        ["subject", (group) => group.value === searchItem.subject],
      ];
      if (searchItem.target) checks.push(["target", (group) => group.value === searchItem.target]);
      for (const [type, predicate] of checks) if (!(hubs[type] || []).some(predicate)) issues.push(issue("WARNING", "internalLinks", "page-not-in-hub", `페이지가 ${type} Hub에 포함되지 않습니다.`, { slug: document.slug, type }));
    }
  }
  return { issues, search: search || [], related: related || {}, hubs: hubs || {}, searchBySlug };
}

module.exports = { attribute, checkIndexes, checkSitemapAndRobots, decodeHtml, discoverHtmlFiles, metaContent, parseDocument, stripTags, validateUrlSlug };
