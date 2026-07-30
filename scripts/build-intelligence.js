const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MANIFEST_VERSION = 1;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function listFiles(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const files = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    files.push(...listFiles(path.join(target, entry.name)));
  }
  return files.sort();
}

/** 페이지 HTML에 영향을 주는 공통 파일의 변경 여부를 하나의 hash로 만듭니다. */
function fingerprint(root, targets) {
  const files = targets.flatMap((target) => listFiles(path.join(root, target)));
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(root, file).replace(/\\/g, "/"));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** CSV에서 온 값과 생성에 사용하는 단순 문자열만 골라 페이지별 hash를 계산합니다. */
function pageHash(page) {
  const source = Object.fromEntries(Object.entries(page)
    .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
    .sort(([a], [b]) => a.localeCompare(b)));
  return sha256(JSON.stringify(source));
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${filePath} 파일을 읽을 수 없습니다: ${error.message}`);
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function loadManifest(root) {
  const manifestPath = path.join(root, ".cache", "build-manifest.json");
  const manifest = readJson(manifestPath, null);
  if (!manifest || manifest.version !== MANIFEST_VERSION || typeof manifest.pages !== "object") return null;
  return manifest;
}

/** public 루트의 Google 인증 HTML을 정적 파일 변경 검사에 포함합니다. */
function googleVerificationTargets(root) {
  const publicRoot = path.join(root, "public");
  if (!fs.existsSync(publicRoot)) return [];
  return fs.readdirSync(publicRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^google[a-z0-9_-]+\.html$/i.test(entry.name))
    .map((entry) => path.join("public", entry.name));
}

function makeFingerprints(root) {
  return {
    pageTemplate: fingerprint(root, [
      "templates/page.html", "scripts/generate-pages.js", "scripts/generate-schema.js",
      "scripts/content-intelligence.js", "scripts/generate-hub-pages.js", "scripts/utils/assets",
      "config/brand-assets.js", "config/content", "public/assets",
    ]),
    staticFiles: fingerprint(root, [
      "assets/style.css", "public/utils", "public/images", ...googleVerificationTargets(root),
    ]),
  };
}

function analyzeChanges({ pages, manifest, fingerprints, forceFull = false }) {
  const oldPages = new Map(Object.entries(manifest?.pages || {}));
  const currentSlugs = new Set(pages.map((page) => page.slug));
  const created = new Set();
  const updated = new Set();
  const skipped = new Set();
  const deleted = new Set([...oldPages.keys()].filter((slug) => !currentSlugs.has(slug)));
  const commonOutputChanged = !manifest || manifest.fingerprints?.pageTemplate !== fingerprints.pageTemplate;

  for (const page of pages) {
    const previous = oldPages.get(page.slug);
    const hash = pageHash(page);
    page.buildHash = hash;
    if (!previous) created.add(page.slug);
    else if (forceFull || commonOutputChanged || previous.hash !== hash) updated.add(page.slug);
    else skipped.add(page.slug);
  }
  return {
    created, updated, deleted, skipped,
    changed: new Set([...created, ...updated]),
    commonOutputChanged,
    staticChanged: !manifest || manifest.fingerprints?.staticFiles !== fingerprints.staticFiles,
  };
}

function validatePages(pages) {
  const errors = [];
  const required = ["domain", "slug", "status", "language", "province", "region", "subject", "keyword", "title", "description"];
  const usedSlugs = new Set();
  for (const page of pages) {
    for (const field of required) {
      const sourceValue = page._source && Object.hasOwn(page._source, field) ? page._source[field] : page[field];
      if (!String(sourceValue || "").trim()) errors.push({ slug: page.slug || null, type: "missing-field", field, message: `${field} 값이 비어 있습니다.` });
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(page.slug)) {
      errors.push({ slug: page.slug, type: "invalid-slug", message: "slug는 영문, 숫자와 하이픈만 사용할 수 있습니다." });
    }
    const slugKey = page.slug.toLowerCase();
    if (usedSlugs.has(slugKey)) errors.push({ slug: page.slug, type: "duplicate-slug", message: "중복 slug입니다." });
    usedSlugs.add(slugKey);
  }
  return errors;
}

function createManifest({ pages, previous, fingerprints, regeneratedSlugs, now = new Date().toISOString() }) {
  const oldPages = previous?.pages || {};
  const pageEntries = pages.map((page) => [page.slug, {
    slug: page.slug,
    hash: page.buildHash || pageHash(page),
    updated_at: page.updated_at || "",
    generated_at: regeneratedSlugs.has(page.slug) ? now : oldPages[page.slug]?.generated_at || now,
  }]);
  return { version: MANIFEST_VERSION, generated_at: now, fingerprints, pages: Object.fromEntries(pageEntries) };
}

function writeManifest(root, manifest) {
  writeJsonAtomic(path.join(root, ".cache", "build-manifest.json"), manifest);
}

function writeBuildOutputs(root, report, errors) {
  writeJsonAtomic(path.join(root, "build-report.json"), report);
  writeJsonAtomic(path.join(root, "build-errors.json"), {
    generated_at: new Date().toISOString(),
    errors,
  });
}

module.exports = {
  analyzeChanges,
  createManifest,
  loadManifest,
  makeFingerprints,
  readJson,
  validatePages,
  writeBuildOutputs,
  writeJsonAtomic,
  writeManifest,
};
