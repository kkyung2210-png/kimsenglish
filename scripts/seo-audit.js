const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { checkDocumentContent } = require("./seo-audit/content-checker");
const { checkDuplicates } = require("./seo-audit/duplicate-checker");
const { checkLinks } = require("./seo-audit/link-checker");
const { calculateScore, issue, loadConfig } = require("./seo-audit/rules");
const { checkSchema } = require("./seo-audit/schema-checker");
const { printSummary, writeReports } = require("./seo-audit/reporter");
const { checkIndexes, checkSitemapAndRobots, discoverHtmlFiles, parseDocument, validateUrlSlug } = require("./seo-audit/validators");

function parseOptions(args = process.argv.slice(2), environment = process.env) {
  const pageArgument = args.find((arg) => arg.startsWith("--page="));
  return {
    full: args.includes("--full") || environment.npm_config_full === "true",
    strict: args.includes("--strict") || environment.npm_config_strict === "true",
    page: pageArgument ? pageArgument.slice("--page=".length) : environment.npm_config_page || "",
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeAuditFingerprint(root, distPath, config) {
  const manifestPath = path.join(root, ".cache", "build-manifest.json");
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { pages: {} };
  const pageHashes = Object.entries(manifest.pages || {}).sort(([a], [b]) => a.localeCompare(b)).map(([slug, page]) => `${slug}:${page.hash}`).join("|");
  const files = ["search-index.json", "related-index.json", "hub-index.json", "sitemap.xml", "robots.txt"].map((name) => {
    const filePath = path.join(distPath, name);
    if (!fs.existsSync(filePath)) return `${name}:missing`;
    const stat = fs.statSync(filePath);
    return `${name}:${stat.size}:${stat.mtimeMs}`;
  }).join("|");
  return sha256(`${JSON.stringify(config)}|${manifest.fingerprints?.pageTemplate || ""}|${pageHashes}|${files}`);
}

function determineBaseUrl(documents) {
  const home = documents.find((document) => document.pageType === "home");
  const canonical = home?.canonicals[0];
  if (!canonical) throw new Error("메인페이지 canonical에서 사이트 도메인을 확인할 수 없습니다.");
  return new URL(canonical).origin;
}

function severityBuckets(issues) {
  return {
    errors: issues.filter((item) => item.severity === "ERROR"),
    warnings: issues.filter((item) => item.severity === "WARNING"),
    info: issues.filter((item) => item.severity === "INFO"),
  };
}

function duplicateIssuesForSlug(duplicates, slug) {
  const problems = [];
  for (const group of duplicates.exact.filter((item) => item.slugs.includes(slug))) {
    const severity = ["title", "description", "h1"].includes(group.type) ? "ERROR" : "WARNING";
    problems.push(issue(severity, group.type === "title" || group.type === "description" ? "metadata" : "contentQuality", `duplicate-${group.type}-exact`, `${group.type} 값이 다른 페이지와 완전히 같습니다.`, { duplicateGroupId: group.id, duplicateLevel: "EXACT" }));
  }
  for (const group of duplicates.similar.filter((item) => item.slugs.includes(slug))) {
    problems.push(issue(group.level === "HIGH" ? "WARNING" : "INFO", "contentQuality", `duplicate-description-${group.level.toLowerCase()}`, `description 유사도가 ${group.similarity}입니다.`, { duplicateGroupId: group.id, duplicateLevel: group.level }));
  }
  return problems;
}

function reusableStaticIssues(previous) {
  if (!previous) return [];
  return [...previous.errors, ...previous.warnings, ...previous.info].filter((item) =>
    item.category !== "internalLinks" && !item.code.startsWith("duplicate-") && item.code !== "orphan-page" && item.code !== "click-depth-high");
}

function strictFailed(summary, config) {
  return (config.strictMode.failOnError && summary.errors > config.strictMode.maximumErrors) || summary.averageScore < config.strictMode.minimumAverageScore;
}

async function runSeoAudit(options = {}) {
  const root = options.root || path.resolve(__dirname, "..");
  const distPath = options.distPath || path.join(root, "dist");
  const baseReportsPath = options.reportsPath || path.join(root, "reports");
  const reportsPath = options.page ? path.join(baseReportsPath, "pages", options.page.replace(/[^a-zA-Z0-9-]/g, "-")) : baseReportsPath;
  const config = options.config || loadConfig(root);
  const auditFingerprint = makeAuditFingerprint(root, distPath, config);
  const summaryPath = path.join(reportsPath, "seo-audit-summary.json");
  const fullReportPath = path.join(reportsPath, "seo-audit-report.json");
  const previousSummary = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, "utf8")) : null;
  const previousReport = fs.existsSync(fullReportPath) ? JSON.parse(fs.readFileSync(fullReportPath, "utf8")) : null;
  const changedSlugs = new Set(options.changedSlugs || []);
  const canReuseEverything = options.incremental && !options.full && !options.page && changedSlugs.size === 0 && previousSummary?.auditFingerprint === auditFingerprint;
  if (canReuseEverything) {
    printSummary(previousSummary, reportsPath);
    return { summary: previousSummary, strictFailed: strictFailed(previousSummary, config), cached: true };
  }

  if (!fs.existsSync(distPath)) throw new Error(`SEO Audit 대상 dist 폴더가 없습니다: ${distPath}`);
  let documents = discoverHtmlFiles(distPath).map((filePath) => parseDocument(filePath, distPath));
  const allDocuments = documents;
  const baseUrl = determineBaseUrl(allDocuments);
  if (options.page) {
    const requested = options.page.replace(/^\/+|\/+$/g, "");
    documents = allDocuments.filter((document) => document.slug === requested || (requested === "home" && document.pageType === "home"));
    if (!documents.length) throw new Error(`검사할 페이지를 찾을 수 없습니다: ${options.page}`);
  }

  const indexCheck = checkIndexes(distPath, allDocuments, config);
  const searchBySlug = indexCheck.searchBySlug;
  const linkCheck = checkLinks(allDocuments, baseUrl, config);
  const duplicates = checkDuplicates(allDocuments, config);
  const globalCheck = checkSitemapAndRobots(distPath, allDocuments, baseUrl);
  const globalIssues = [...globalCheck.issues, ...indexCheck.issues];
  const previousBySlug = new Map((previousReport?.pages || []).map((page) => [page.slug || "__home__", page]));
  const checkedAt = new Date().toISOString();
  const pageReports = [];
  const checkAllStatic = options.full || options.page || !previousReport || (options.incremental && changedSlugs.size === 0 && previousSummary?.auditFingerprint !== auditFingerprint);

  for (const document of documents) {
    const slugKey = document.slug || "__home__";
    const previous = previousBySlug.get(slugKey);
    const shouldCheckStatic = checkAllStatic || changedSlugs.has(document.slug) || !previous;
    let pageIssues = shouldCheckStatic
      ? [...validateUrlSlug(document, config), ...checkDocumentContent(document, { baseUrl, config, distPath, searchItem: searchBySlug.get(document.slug) })]
      : reusableStaticIssues(previous);
    let schemaTypes = previous?.schemaTypes || [];
    if (shouldCheckStatic) {
      const schema = checkSchema(document, `${baseUrl}${document.urlPath}`);
      pageIssues.push(...schema.issues);
      schemaTypes = schema.schemaTypes;
    }
    pageIssues.push(...(linkCheck.issuesBySlug.get(slugKey) || []));
    pageIssues.push(...duplicateIssuesForSlug(duplicates, slugKey));
    const stats = linkCheck.statsBySlug.get(slugKey) || { outgoingLinks: [], incomingLinks: [], depth: null };
    const buckets = severityBuckets(pageIssues);
    pageReports.push({
      slug: document.slug,
      url: `${baseUrl}${document.urlPath}`,
      pageType: document.pageType,
      score: calculateScore(pageIssues, config.scoreWeights),
      ...buckets,
      title: document.title,
      description: document.description,
      h1: document.h1[0] || "",
      h1Count: document.h1.length,
      textLength: document.textLength,
      internalLinkCount: stats.outgoingLinks.length,
      incomingLinkCount: stats.incomingLinks.length,
      clickDepth: stats.depth,
      outgoingLinks: stats.outgoingLinks,
      incomingLinks: stats.incomingLinks,
      schemaTypes,
      imageCount: document.images.length,
      missingAltCount: document.images.filter((image) => !image.alt && image.role !== "presentation").length,
      duplicateGroupId: duplicates.groupBySlug.get(slugKey) || null,
      checkedAt: shouldCheckStatic ? checkedAt : previous.checkedAt,
    });
  }

  const generatedAt = new Date().toISOString();
  const summary = writeReports({ reportsPath, pageReports, globalIssues, duplicates, brokenLinks: linkCheck.brokenLinks, orphanPages: linkCheck.orphanPages, config, generatedAt, auditFingerprint });
  printSummary(summary, reportsPath);
  return { summary, pageReports, globalIssues, duplicates, strictFailed: strictFailed(summary, config), cached: false };
}

async function main() {
  const options = parseOptions();
  const result = await runSeoAudit({ ...options, incremental: !options.full });
  if (options.strict && result.strictFailed) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { makeAuditFingerprint, parseOptions, runSeoAudit, strictFailed };
