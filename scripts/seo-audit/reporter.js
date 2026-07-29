const fs = require("fs");
const path = require("path");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === json) return false;
  fs.writeFileSync(filePath, json, "utf8");
  return true;
}

function severityCount(issues, severity) {
  return issues.filter((item) => item.severity === severity).length;
}

function makeSummary({ pageReports, globalIssues, duplicates, brokenLinks, orphanPages, config, generatedAt, auditFingerprint }) {
  const allIssues = [...globalIssues, ...pageReports.flatMap((page) => [...page.errors, ...page.warnings, ...page.info])];
  const lowQualityPages = pageReports.filter((page) => page.score < config.lowQualityScore);
  return {
    generatedAt,
    auditFingerprint,
    totalPages: pageReports.length,
    auditedPages: pageReports.length,
    averageScore: pageReports.length ? Math.round(pageReports.reduce((sum, page) => sum + page.score, 0) / pageReports.length) : 0,
    errors: severityCount(allIssues, "ERROR"),
    warnings: severityCount(allIssues, "WARNING"),
    info: severityCount(allIssues, "INFO"),
    brokenLinks: brokenLinks.length,
    orphanPages: orphanPages.length,
    duplicateTitles: duplicates.duplicateTitles,
    duplicateDescriptions: duplicates.duplicateDescriptions,
    missingSchemas: pageReports.filter((page) => page.errors.some((item) => item.code === "schema-missing")).length,
    lowQualityPages: lowQualityPages.length,
  };
}

function writeReports({ reportsPath, pageReports, globalIssues, duplicates, brokenLinks, orphanPages, config, generatedAt, auditFingerprint }) {
  const summary = makeSummary({ pageReports, globalIssues, duplicates, brokenLinks, orphanPages, config, generatedAt, auditFingerprint });
  const lowQuality = pageReports.filter((page) => page.score < config.lowQualityScore);
  const schemaErrors = pageReports.flatMap((page) => [...page.errors, ...page.warnings]
    .filter((item) => item.category === "schema").map((item) => ({ slug: page.slug, url: page.url, ...item })));
  const indexConsistency = globalIssues.filter((item) => /(?:search-index|related-index|hub-index|page-not-in-hub)/.test(item.code));
  writeJson(path.join(reportsPath, "seo-audit-report.json"), { generatedAt, summary, globalIssues, pages: pageReports });
  writeJson(path.join(reportsPath, "seo-audit-summary.json"), summary);
  writeJson(path.join(reportsPath, "seo-duplicate-report.json"), { generatedAt, exact: duplicates.exact, similar: duplicates.similar });
  writeJson(path.join(reportsPath, "seo-broken-links.json"), { generatedAt, count: brokenLinks.length, links: brokenLinks });
  writeJson(path.join(reportsPath, "seo-orphan-pages.json"), { generatedAt, count: orphanPages.length, pages: orphanPages });
  writeJson(path.join(reportsPath, "seo-low-quality-pages.json"), { generatedAt, threshold: config.lowQualityScore, count: lowQuality.length, pages: lowQuality });
  writeJson(path.join(reportsPath, "seo-schema-errors.json"), { generatedAt, count: schemaErrors.length, errors: schemaErrors });
  writeJson(path.join(reportsPath, "seo-index-consistency.json"), { generatedAt, count: indexConsistency.length, issues: indexConsistency });
  return summary;
}

function printSummary(summary, reportsPath) {
  console.log("\nSEO Audit Complete");
  console.log(`Pages Audited: ${summary.auditedPages.toLocaleString("en-US")}`);
  console.log(`Average Score: ${summary.averageScore}/100`);
  console.log(`Errors: ${summary.errors.toLocaleString("en-US")}`);
  console.log(`Warnings: ${summary.warnings.toLocaleString("en-US")}`);
  console.log(`Broken Links: ${summary.brokenLinks.toLocaleString("en-US")}`);
  console.log(`Orphan Pages: ${summary.orphanPages.toLocaleString("en-US")}`);
  console.log(`Duplicate Titles: ${summary.duplicateTitles.toLocaleString("en-US")}`);
  console.log(`Duplicate Descriptions: ${summary.duplicateDescriptions.toLocaleString("en-US")}`);
  console.log(`Low Quality Pages: ${summary.lowQualityPages.toLocaleString("en-US")}`);
  console.log(`Report: ${path.join(reportsPath, "seo-audit-summary.json")}`);
}

module.exports = { makeSummary, printSummary, writeJson, writeReports };
