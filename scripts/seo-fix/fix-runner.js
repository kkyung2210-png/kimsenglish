const fs = require("fs");
const path = require("path");
const { build } = require("../build");
const { loadPages } = require("../generate-pages");
const { generateSearchIndex } = require("../generate-search-index");
const { writeRelatedIndex } = require("../generate-related-index");
const { writeHubIndex } = require("../generate-hub-index");
const { writeSitemap } = require("../copy-static-files");
const { runSeoAudit } = require("../seo-audit");
const { createBackup } = require("./backup");
const { planImageFixes } = require("./image-fixes");
const { planHubFixes, planSitemapFixes } = require("./index-fixes");
const { planRelatedFixes } = require("./link-fixes");
const { planSearchFixes } = require("./metadata-fixes");
const { buildManualReview, readAudit, writePreview, writeResult } = require("./report-fixes");
const { restoreBackup } = require("./rollback");
const { hash, readJson, selected } = require("./safe-fixes");

function loadConfig(root) {
  return readJson(path.join(root, "config", "seo-fix.config.json"), null);
}

function existingPages(distPath, pages) {
  return pages.filter((page) => fs.existsSync(path.join(distPath, page.slug, "index.html")));
}

function scopeChanges(changes, page) {
  if (!page) return changes;
  const summaries = changes.filter((item) => item.type.endsWith("_REGENERATE"));
  const details = changes.filter((item) => !item.type.endsWith("_REGENERATE") && (
    item.slug === page || JSON.stringify([item.before, item.after]).includes(`/${page}/`)
  ));
  const groups = new Set(details.map((item) => item.group));
  return [...details, ...summaries.filter((item) => groups.has(item.group))];
}

function protectedFingerprint(root, distPath) {
  const files = [];
  function add(target) {
    if (!fs.existsSync(target)) return;
    if (fs.statSync(target).isFile()) { files.push(target); return; }
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) add(path.join(target, entry.name));
  }
  ["pages.csv", "templates/page.html", "scripts/generate-pages.js", "config/content"].forEach((name) => add(path.join(root, name)));
  add(distPath);
  const protectedFiles = files.filter((file) => !/[\\/](?:search-index|related-index|hub-index)\.json$/.test(file) && path.basename(file) !== "sitemap.xml" && path.extname(file) !== ".map");
  return hash(protectedFiles.sort().map((file) => `${path.relative(root, file)}:${hash(fs.readFileSync(file))}`).join("|"));
}

function backupFilesFor(actions) {
  const groups = new Set(actions.map((item) => item.group));
  const files = [".cache/build-manifest.json"];
  if (groups.has("metadata")) files.push("public/search-index.json", "dist/search-index.json");
  if (groups.has("links")) files.push("public/related-index.json", "dist/related-index.json");
  if (groups.has("index")) files.push("public/hub-index.json", "dist/hub-index.json");
  if (groups.has("sitemap")) files.push("dist/sitemap.xml");
  return files;
}

function makeHubPages(hubIndex, baseUrl) {
  return ["province", "region", "subject", "target"]
    .flatMap((type) => hubIndex[type] || [])
    .map((hub) => ({ canonicalUrl: `${baseUrl}${hub.url}` }));
}

async function applyActions({ root, distPath, data, validPages, actions, plans }) {
  const groups = new Set(actions.map((item) => item.group));
  if (groups.has("metadata")) generateSearchIndex({ root, outputPath: distPath, pages: validPages });
  if (groups.has("links")) writeRelatedIndex({ root, outputPath: distPath, relatedIndex: plans.related.expected });
  if (groups.has("index")) writeHubIndex({ root, outputPath: distPath, hubIndex: plans.hub.expected });
  const hubIndex = groups.has("index") ? plans.hub.expected : readJson(path.join(distPath, "hub-index.json"), plans.hub.expected);
  if (groups.has("sitemap")) writeSitemap({ outputPath: distPath, pages: validPages, hubPages: makeHubPages(hubIndex, data.baseUrl), baseUrl: data.baseUrl });
}

async function runFix(options = {}) {
  const root = options.root || path.resolve(__dirname, "../..");
  const distPath = options.distPath || path.join(root, "dist");
  const config = loadConfig(root);
  if (!config) throw new Error("config/seo-fix.config.json을 찾을 수 없습니다.");
  if (options.rollback !== undefined) {
    const rollback = restoreBackup(root, options.rollback || null);
    const result = { generatedAt: new Date().toISOString(), mode: "rollback", ...rollback };
    writeResult(root, result);
    return result;
  }

  const data = options.data || loadPages();
  const validPages = existingPages(distPath, data.pages);
  let audit = readAudit(root);
  if (!audit.pages?.length) {
    const result = await runSeoAudit({ root, distPath, full: true });
    audit = { summary: result.summary, pages: result.pageReports || [] };
  }
  const plans = {
    search: planSearchFixes({ root, distPath, pages: validPages }),
    related: planRelatedFixes({ root, distPath, pages: validPages, limit: config.relatedRecommendationLimit }),
    hub: planHubFixes({ root, distPath, pages: validPages }),
  };
  plans.sitemap = planSitemapFixes({ distPath, pages: validPages, hubIndex: plans.hub.expected, baseUrl: data.baseUrl });
  let changes = [...plans.search.changes, ...plans.related.changes, ...plans.hub.changes, ...plans.sitemap.changes, ...planImageFixes(audit.pages)];
  changes = scopeChanges(changes, options.page).filter((item) => selected(item, options));
  const manualReview = buildManualReview(audit, config, options.page || null);
  const validSlugs = new Set(validPages.map((page) => page.slug));
  for (const page of data.pages) if (!validSlugs.has(page.slug) && (!options.page || options.page === page.slug)) {
    manualReview.push({ type: "생성 페이지 누락", slug: page.slug, currentValue: "dist 페이지 없음", reason: "pages.csv에는 있지만 생성 결과가 없습니다.", recommendedAction: "전체 빌드 오류를 확인한 뒤 페이지를 다시 생성해 주세요.", auditRule: "page-output-missing" });
  }
  const allowed = new Set(config.allowlist);
  const actions = changes.filter((item) => allowed.has(item.type) && item.confidence === config.automaticConfidence);
  const preview = {
    generatedAt: new Date().toISOString(), mode: "dry-run", page: options.page || null, type: options.type || "all",
    totalIssues: changes.length + manualReview.length,
    autoFixable: actions.length,
    manualReview: manualReview.length + changes.filter((item) => item.confidence !== "HIGH").length,
    changes,
  };
  writePreview(root, preview, manualReview);
  if (!options.apply) return preview;

  const uncertain = changes.filter((item) => item.confidence !== "HIGH");
  if (options.strict && uncertain.length) throw new Error(`strict 모드: 확신도가 낮은 수정 후보 ${uncertain.length}개가 있어 적용하지 않았습니다.`);
  const beforeScore = audit.summary?.averageScore ?? null;
  if (!actions.length) {
    const result = { generatedAt: new Date().toISOString(), mode: "apply", applied: 0, skipped: changes.length, failed: 0, manualReview: manualReview.length, modifiedFiles: [], backupPath: null, durationMs: 0, auditBefore: beforeScore, auditAfter: beforeScore };
    writeResult(root, result);
    return result;
  }

  const started = Date.now();
  const protectedBefore = protectedFingerprint(root, distPath);
  const backup = createBackup(root, backupFilesFor(actions));
  try {
    await applyActions({ root, distPath, data, validPages, actions, plans });
    await (options.buildFunction || build)(["--changed"]);
    if (protectedBefore !== protectedFingerprint(root, distPath)) throw new Error("보호된 페이지 콘텐츠 또는 디자인 파일 변경을 감지했습니다.");
    const afterAudit = await runSeoAudit({ root, distPath, full: true, incremental: false });
    const modifiedFiles = backup.manifest.files.filter((entry) => {
      const file = path.join(root, entry.path);
      return fs.existsSync(file) && hash(fs.readFileSync(file)) !== entry.hash;
    }).map((entry) => entry.path);
    const result = { generatedAt: new Date().toISOString(), mode: "apply", applied: actions.length, skipped: changes.length - actions.length, failed: 0, manualReview: manualReview.length, modifiedFiles, backupPath: path.relative(root, backup.path).replace(/\\/g, "/"), durationMs: Date.now() - started, auditBefore: beforeScore, auditAfter: afterAudit.summary.averageScore };
    writeResult(root, result);
    return result;
  } catch (error) {
    restoreBackup(root, backup.id);
    const result = { generatedAt: new Date().toISOString(), mode: "apply", applied: 0, skipped: 0, failed: actions.length, manualReview: manualReview.length, modifiedFiles: [], backupPath: path.relative(root, backup.path).replace(/\\/g, "/"), durationMs: Date.now() - started, auditBefore: beforeScore, auditAfter: null, error: error.message };
    writeResult(root, result);
    throw error;
  }
}

module.exports = { applyActions, backupFilesFor, existingPages, loadConfig, protectedFingerprint, runFix, scopeChanges };
