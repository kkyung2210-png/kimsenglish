const fs = require("fs");
const path = require("path");
const config = require("../config/brand-assets");
const { imageSize, publicFile } = require("./utils/assets/resolve-asset");

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(file));
    else if (entry.name !== ".gitkeep") files.push(file);
  }
  return files;
}

function configuredEntries() {
  const entries = [];
  function visit(value, keyPath) {
    if (!value || typeof value !== "object") return;
    if (typeof value.src === "string") { entries.push({ key: keyPath.join("."), ...value }); return; }
    for (const [key, child] of Object.entries(value)) visit(child, [...keyPath, key]);
  }
  for (const section of ["logo", "hero", "subjects", "targets", "cta", "features", "process", "icons", "og", "fallback"]) visit(config[section], [section]);
  return entries;
}

function issue(severity, code, message, details = {}) { return { severity, code, message, ...details }; }

function preflightBrandAssets(root) {
  const issues = [];
  for (const entry of configuredEntries()) {
    const file = publicFile(root, entry.src);
    if (!entry.alt && !entry.decorative && !entry.key.startsWith("logo.")) issues.push(issue("WARNING", "asset-alt-missing", "설정의 alt 값이 비어 있습니다.", { key: entry.key, src: entry.src }));
    if (!entry.width || !entry.height) issues.push(issue("WARNING", "asset-dimensions-missing", "설정의 width 또는 height가 비어 있습니다.", { key: entry.key, src: entry.src }));
    if (!file || !fs.existsSync(file)) issues.push(issue("WARNING", "asset-file-missing", "설정된 이미지가 없어 fallback을 사용합니다.", { key: entry.key, src: entry.src }));
  }
  for (const [category, fallback] of [["subjects", config.subjects.fallback], ["targets", config.targets.fallback], ["cta", config.cta.fallback]]) {
    const categoryExists = fallback?.src && fs.existsSync(publicFile(root, fallback.src) || "");
    const commonExists = config.fallback.image?.src && fs.existsSync(publicFile(root, config.fallback.image.src) || "");
    if (!categoryExists && !commonExists) issues.push(issue("WARNING", "asset-fallback-missing", `${category} 전용 파일과 공통 fallback 파일이 없어 CSS Placeholder를 사용합니다.`, { category }));
  }
  return issues;
}

function htmlAssetReferences(distPath) {
  const references = new Set();
  const missingAttributes = [];
  for (const file of walk(distPath).filter((item) => path.basename(item) === "index.html")) {
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(/(?:src|srcset|content)=["'](\/assets\/[^"'\s,]+)/gi)) references.add(match[1]);
    for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = match[0];
      if (!/\balt=["'][^"']*["']/i.test(tag)) missingAttributes.push(issue("WARNING", "html-image-alt-missing", "생성 HTML img에 alt가 없습니다.", { file: path.relative(distPath, file).replace(/\\/g, "/") }));
      if (!/\bwidth=["']\d+["']/i.test(tag) || !/\bheight=["']\d+["']/i.test(tag)) missingAttributes.push(issue("WARNING", "html-image-dimensions-missing", "생성 HTML img에 width 또는 height가 없습니다.", { file: path.relative(distPath, file).replace(/\\/g, "/") }));
    }
  }
  return { references, issues: missingAttributes };
}

function auditBrandAssets({ root, distPath }) {
  const issues = preflightBrandAssets(root);
  const publicRoot = path.join(root, "public", "assets");
  const distRoot = path.join(distPath, "assets");
  const actualFiles = walk(publicRoot);
  const html = htmlAssetReferences(distPath);
  issues.push(...html.issues);
  const configured = new Set(configuredEntries().map((entry) => entry.src));

  for (const file of actualFiles) {
    const relative = path.relative(publicRoot, file).replace(/\\/g, "/");
    const url = `/assets/${relative}`;
    const bytes = fs.statSync(file).size;
    const extension = path.extname(file).toLowerCase();
    if (!configured.has(url) && !html.references.has(url)) issues.push(issue("WARNING", "asset-unused", "설정과 생성 HTML에서 사용하지 않는 파일입니다.", { src: url }));
    if (bytes > config.maximumBytes) issues.push(issue("WARNING", "asset-too-large", "이미지 파일이 권장 최대 크기를 초과합니다.", { src: url, bytes }));
    if ([".png", ".jpg", ".jpeg"].includes(extension) && bytes > config.largeRasterWarningBytes) issues.push(issue("WARNING", "asset-large-non-webp", "큰 래스터 이미지가 WebP 형식이 아닙니다.", { src: url, bytes }));
    if (!fs.existsSync(path.join(distRoot, relative))) issues.push(issue("ERROR", "asset-not-copied", "public/assets 파일이 dist/assets에 복사되지 않았습니다.", { src: url }));
    imageSize(root, url, {});
  }
  for (const url of html.references) {
    const source = publicFile(root, url);
    const destination = path.join(distPath, url.replace(/^\/+/, ""));
    if (!source || !fs.existsSync(source)) issues.push(issue("ERROR", "html-asset-missing", "HTML에서 참조한 에셋이 public/assets에 없습니다.", { src: url }));
    else if (!fs.existsSync(destination)) issues.push(issue("ERROR", "html-asset-not-copied", "HTML에서 참조한 에셋이 dist에 없습니다.", { src: url }));
  }
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      configured: configuredEntries().length,
      filesPresent: actualFiles.length,
      htmlReferences: html.references.size,
      errors: issues.filter((item) => item.severity === "ERROR").length,
      warnings: issues.filter((item) => item.severity === "WARNING").length,
      fallbacksUsed: issues.filter((item) => item.code === "asset-file-missing").length,
    },
    issues,
  };
  const reportPath = path.join(root, "reports", "brand-assets-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

module.exports = { auditBrandAssets, configuredEntries, htmlAssetReferences, preflightBrandAssets, walk };

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const report = auditBrandAssets({ root, distPath: path.join(root, "dist") });
  console.log(`Brand Assets: errors ${report.summary.errors}, warnings ${report.summary.warnings}, fallback ${report.summary.fallbacksUsed}`);
  if (report.summary.errors) process.exitCode = 1;
}
