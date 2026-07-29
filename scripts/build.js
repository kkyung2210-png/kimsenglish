const fs = require("fs");
const path = require("path");
const { generatePages, loadPages } = require("./generate-pages");
const { generateSearchIndex, updateSearchIndex } = require("./generate-search-index");
const { createRelatedIndex, writeRelatedIndex } = require("./generate-related-index");
const { createHubIndex, writeHubIndex } = require("./generate-hub-index");
const { generateHubPages } = require("./generate-hub-pages");
const { copyAssets } = require("./copy-assets");
const { copyStaticFiles } = require("./copy-static-files");
const { runSeoAudit } = require("./seo-audit");
const { auditBrandAssets, preflightBrandAssets } = require("./asset-audit");
const {
  analyzeChanges, createManifest, loadManifest, makeFingerprints,
  readJson, validatePages, writeBuildOutputs, writeManifest,
} = require("./build-intelligence");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "dist");
const temporaryOutputPath = path.join(root, ".dist-building");

function parseMode(args) {
  if (args.includes("--full") || process.env.npm_config_full === "true") return "full";
  if (args.includes("--changed") || process.env.npm_config_changed === "true") return "changed";
  return "auto";
}

function readOutputJson(fileName, fallback) {
  return readJson(path.join(outputPath, fileName), fallback);
}

function changedRelatedPages(previous, current, pages) {
  const affected = new Set();
  for (const page of pages) {
    if (JSON.stringify(previous[page.slug]) !== JSON.stringify(current[page.slug])) affected.add(page.slug);
  }
  return affected;
}

function removePageFolders(slugs) {
  for (const slug of slugs) fs.rmSync(path.join(outputPath, slug), { recursive: true, force: true });
}

function allHubUrls(hubIndex) {
  return ["province", "region", "subject", "target"]
    .flatMap((type) => hubIndex[type] || [])
    .map((hub) => hub.url);
}

function removeDeletedHubFolders(previous, current) {
  const currentUrls = new Set(allHubUrls(current));
  for (const url of allHubUrls(previous)) {
    if (currentUrls.has(url)) continue;
    const relative = url.replace(/^\/+|\/+$/g, "");
    fs.rmSync(path.join(outputPath, relative), { recursive: true, force: true });
  }
}

function hubPagesForSitemap(hubIndex, baseUrl) {
  return allHubUrls(hubIndex).map((url) => ({ canonicalUrl: `${baseUrl}${url}` }));
}

function cleanupLegacyFiles(pages) {
  for (const page of pages) fs.rmSync(path.join(root, page.slug), { recursive: true, force: true });
  for (const file of ["index.html", "style.css", "sitemap.xml", "robots.txt"]) fs.rmSync(path.join(root, file), { force: true });
  fs.rmSync(path.join(root, "pages"), { recursive: true, force: true });
}

/** 최초 또는 강제 빌드는 임시 폴더에서 완성한 뒤 dist를 한 번에 교체합니다. */
function runFullBuild(data) {
  const relatedIndex = createRelatedIndex(data.pages);
  const hubIndex = createHubIndex(data.pages);
  fs.rmSync(temporaryOutputPath, { recursive: true, force: true });
  fs.mkdirSync(temporaryOutputPath, { recursive: true });
  try {
    generatePages({ outputPath: temporaryOutputPath, data, relatedIndex, hubIndex });
    generateSearchIndex({ root, outputPath: temporaryOutputPath, pages: data.pages });
    writeRelatedIndex({ root, outputPath: temporaryOutputPath, relatedIndex });
    writeHubIndex({ root, outputPath: temporaryOutputPath, hubIndex });
    const hubPages = generateHubPages({ root, outputPath: temporaryOutputPath, data, hubIndex, relatedIndex });
    copyAssets({ root, outputPath: temporaryOutputPath });
    copyStaticFiles({ root, outputPath: temporaryOutputPath, pages: data.pages, hubPages, baseUrl: data.baseUrl });
    fs.rmSync(outputPath, { recursive: true, force: true });
    fs.renameSync(temporaryOutputPath, outputPath);
    cleanupLegacyFiles(data.pages);
    return { regenerated: new Set(data.pages.map((page) => page.slug)), hubPages, relatedIndex, hubIndex };
  } catch (error) {
    fs.rmSync(temporaryOutputPath, { recursive: true, force: true });
    throw error;
  }
}

/** 데이터 변경 시 관련 링크가 실제로 달라진 페이지만 함께 다시 생성합니다. */
function runIncrementalBuild(data, analysis) {
  const previousRelated = readOutputJson("related-index.json", {});
  const previousHub = readOutputJson("hub-index.json", {});
  const relatedIndex = createRelatedIndex(data.pages);
  const hubIndex = createHubIndex(data.pages);
  const linkAffected = changedRelatedPages(previousRelated, relatedIndex, data.pages);
  const regenerated = new Set([...analysis.changed, ...linkAffected]);

  removePageFolders(analysis.deleted);
  removeDeletedHubFolders(previousHub, hubIndex);
  generatePages({ outputPath, data, relatedIndex, hubIndex, pageSlugs: regenerated, generateHome: true });
  updateSearchIndex({ root, outputPath, pages: data.pages, changedSlugs: analysis.changed, deletedSlugs: analysis.deleted });
  writeRelatedIndex({ root, outputPath, relatedIndex });
  writeHubIndex({ root, outputPath, hubIndex });
  const hubPages = generateHubPages({ root, outputPath, data, hubIndex, relatedIndex });
  copyStaticFiles({ root, outputPath, pages: data.pages, hubPages, baseUrl: data.baseUrl });
  return { regenerated, hubPages, relatedIndex, hubIndex };
}

function printReport(report) {
  console.log("\nBuild Complete");
  console.log(`Pages: ${report.totalPages.toLocaleString("en-US")}`);
  console.log(`Created: ${report.created.toLocaleString("en-US")}`);
  console.log(`Updated: ${report.updated.toLocaleString("en-US")}`);
  console.log(`Deleted: ${report.deleted.toLocaleString("en-US")}`);
  console.log(`Skipped: ${report.skipped.toLocaleString("en-US")}`);
  console.log(`Regenerated: ${report.regenerated.toLocaleString("en-US")}`);
  console.log(`Time: ${(report.buildTimeMs / 1000).toFixed(2)}s`);
  console.log(`Errors: ${report.errors}`);
  console.log(`Warnings: ${report.warnings}`);
}

async function build(args = process.argv.slice(2)) {
  const startedAt = Date.now();
  const mode = parseMode(args);
  let pageCount = 0;
  let warnings = [];
  try {
    const data = loadPages();
    pageCount = data.pages.length;
    const inputErrors = validatePages(data.pages);
    if (inputErrors.length) {
      const error = new Error(`입력 데이터 검사에서 ${inputErrors.length}개 오류를 찾았습니다.`);
      error.details = inputErrors;
      throw error;
    }

    // 이미지가 없어도 빌드는 계속하며, 누락 정보는 Build Report에 WARNING으로 남깁니다.
    warnings = preflightBrandAssets(root);
    const previousManifest = loadManifest(root);
    const fingerprints = makeFingerprints(root);
    const analysis = analyzeChanges({ pages: data.pages, manifest: previousManifest, fingerprints, forceFull: mode === "full" });
    const needsFullBuild = mode === "full" || !previousManifest || !fs.existsSync(outputPath) || analysis.commonOutputChanged;
    const hasDataChanges = analysis.changed.size > 0 || analysis.deleted.size > 0;
    let result = { regenerated: new Set(), hubIndex: readOutputJson("hub-index.json", {}) };

    if (needsFullBuild) {
      console.log(`전체 빌드 실행 (${mode})`);
      result = runFullBuild(data);
    } else if (hasDataChanges) {
      console.log(`변경 빌드 실행: 직접 변경 ${analysis.changed.size}개, 삭제 ${analysis.deleted.size}개`);
      result = runIncrementalBuild(data, analysis);
    } else if (analysis.staticChanged) {
      console.log("정적 파일 변경분만 반영합니다.");
      const hubPages = hubPagesForSitemap(result.hubIndex, data.baseUrl);
      copyStaticFiles({ root, outputPath, pages: data.pages, hubPages, baseUrl: data.baseUrl });
    } else {
      console.log("변경된 페이지가 없어 페이지 생성을 건너뜁니다.");
    }

    const now = new Date().toISOString();
    const manifest = createManifest({ pages: data.pages, previous: previousManifest, fingerprints, regeneratedSlugs: result.regenerated, now });
    writeManifest(root, manifest);
    console.log("브랜드 에셋 경로와 복사 결과를 검사합니다.");
    const brandAssetReport = auditBrandAssets({ root, distPath: outputPath });
    warnings = brandAssetReport.issues;
    console.log("SEO 품질 검사를 실행합니다.");
    const auditResult = await runSeoAudit({
      root,
      distPath: outputPath,
      changedSlugs: result.regenerated,
      incremental: !needsFullBuild,
      full: needsFullBuild,
    });
    const report = {
      mode,
      generatedAt: now,
      totalPages: data.pages.length,
      created: analysis.created.size,
      updated: analysis.updated.size,
      deleted: analysis.deleted.size,
      skipped: analysis.skipped.size,
      regenerated: result.regenerated.size,
      buildTimeMs: Date.now() - startedAt,
      errors: 0,
      warnings: warnings.length,
      warningDetails: warnings,
      brandAssets: brandAssetReport.summary,
      seoAudit: auditResult.summary,
    };
    writeBuildOutputs(root, report, []);
    printReport(report);
    return { data, report };
  } catch (error) {
    const errors = error.details || [{ slug: null, type: "build-error", message: error.message, stack: error.stack }];
    const report = {
      mode,
      generatedAt: new Date().toISOString(),
      totalPages: pageCount,
      created: 0, updated: 0, deleted: 0, skipped: 0, regenerated: 0,
      buildTimeMs: Date.now() - startedAt,
      errors: errors.length,
      warnings: warnings.length,
      warningDetails: warnings,
    };
    writeBuildOutputs(root, report, errors);
    printReport(report);
    throw error;
  }
}

if (require.main === module) {
  build().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { build, parseMode };
