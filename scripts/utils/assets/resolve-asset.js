const fs = require("fs");
const path = require("path");
const config = require(path.resolve(__dirname, "../../../config/brand-assets.js"));
const { normalizeSubjectKey, normalizeTargetKey } = require("./normalize-asset-key");

function publicFile(root, url) {
  if (!url || !String(url).startsWith("/")) return null;
  const file = path.resolve(root, "public", String(url).replace(/^\/+/, ""));
  const publicRoot = path.resolve(root, "public");
  return file.startsWith(publicRoot) ? file : null;
}

function exists(root, url) {
  const file = publicFile(root, url);
  return Boolean(file && fs.existsSync(file) && fs.statSync(file).isFile());
}

function svgSize(text) {
  const width = Number((text.match(/\bwidth=["']([\d.]+)/i) || [])[1]);
  const height = Number((text.match(/\bheight=["']([\d.]+)/i) || [])[1]);
  if (width && height) return { width, height };
  const box = (text.match(/\bviewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i) || []).slice(1).map(Number);
  return box[0] && box[1] ? { width: box[0], height: box[1] } : null;
}

function rasterSize(buffer, extension) {
  if (extension === ".png" && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (extension === ".webp" && buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF") {
    const type = buffer.toString("ascii", 12, 16);
    if (type === "VP8X") return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (type === "VP8 " && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    if (type === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  if ([".jpg", ".jpeg"].includes(extension)) {
    for (let offset = 2; offset + 9 < buffer.length;) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      offset += 2 + length;
    }
  }
  return null;
}

function imageSize(root, url, defaults = {}) {
  const file = publicFile(root, url);
  if (!file || !fs.existsSync(file)) return { width: defaults.width || 800, height: defaults.height || 600 };
  const extension = path.extname(file).toLowerCase();
  try {
    const size = extension === ".svg" ? svgSize(fs.readFileSync(file, "utf8")) : rasterSize(fs.readFileSync(file), extension);
    return size || { width: defaults.width || 800, height: defaults.height || 600 };
  } catch { return { width: defaults.width || 800, height: defaults.height || 600 }; }
}

function resolveEntry(root, entry, categoryFallback = null, options = {}) {
  const common = config.fallback.image;
  const candidates = [
    { entry, source: "primary" },
    { entry: categoryFallback, source: "category-fallback" },
    { entry: common, source: "common-fallback" },
  ].filter((item) => item.entry?.src);
  for (const candidate of candidates) {
    if (!exists(root, candidate.entry.src)) continue;
    const size = imageSize(root, candidate.entry.src, entry || candidate.entry);
    return { ...candidate.entry, alt: entry?.alt || candidate.entry.alt || "", ...size, source: candidate.source, exists: true, key: options.key || "" };
  }
  if (entry?.placeholder && exists(root, entry.placeholder)) {
    const size = imageSize(root, entry.placeholder, entry);
    return { ...entry, src: entry.placeholder, ...size, source: "placeholder", exists: false, key: options.key || "" };
  }
  return { ...(entry || common), src: null, alt: entry?.alt || common.alt, width: entry?.width || common.width, height: entry?.height || common.height, source: "css-fallback", exists: false, key: options.key || "" };
}

function resolveSubjectAsset(subject, root = path.resolve(__dirname, "../../..")) {
  const key = normalizeSubjectKey(subject);
  const familyFallbackKey = ({ "english-conversation": "english", toeic: "english", opic: "english", ielts: "english", toefl: "english" })[key];
  const familyFallback = familyFallbackKey ? config.subjects[familyFallbackKey] : config.subjects.fallback;
  return resolveEntry(root, config.subjects[key] || config.subjects.fallback, familyFallback, { key });
}

function resolveTargetAsset(target, root = path.resolve(__dirname, "../../..")) {
  const key = normalizeTargetKey(target);
  return resolveEntry(root, config.targets[key] || config.targets.fallback, config.targets.fallback, { key });
}

function resolveHeroAsset(root = path.resolve(__dirname, "../../..")) {
  const desktop = resolveEntry(root, config.hero.desktop, null, { key: "hero-desktop" });
  const mobile = resolveEntry(root, config.hero.mobile, null, { key: "hero-mobile" });
  if (!mobile.src && desktop.src) return { desktop, mobile: { ...desktop, key: "hero-mobile" } };
  return { desktop, mobile };
}

function resolveCtaAsset(type = "consultation", root = path.resolve(__dirname, "../../..")) {
  return resolveEntry(root, config.cta[type] || config.cta.fallback, config.cta.fallback, { key: type });
}

function resolveLogoAsset(type = "default", root = path.resolve(__dirname, "../../..")) {
  const familyFallback = type === "mark" ? config.logo.default : null;
  return resolveEntry(root, config.logo[type] || config.logo.default, familyFallback, { key: type });
}

function resolveOgAsset(page, root = path.resolve(__dirname, "../../..")) {
  return resolveEntry(root, config.og.default, null, { key: page?.slug || "default-og" });
}

function resolveFeatureAsset(type, root = path.resolve(__dirname, "../../..")) {
  return resolveEntry(root, config.features[type], null, { key: type });
}

function resolveProcessAsset(type, root = path.resolve(__dirname, "../../..")) {
  return resolveEntry(root, config.process[type], null, { key: type });
}

function resolvePageAsset(page, root = path.resolve(__dirname, "../../..")) {
  const subject = resolveSubjectAsset(page.subject, root);
  if (["primary", "category-fallback"].includes(subject.source)) return subject;
  const target = resolveTargetAsset(page.target, root);
  if (target.source === "primary") return target;
  return subject;
}

function resolveHubAsset(type, hub, root = path.resolve(__dirname, "../../..")) {
  if (type === "subject") return resolveSubjectAsset(hub.value, root);
  if (type === "target") return resolveTargetAsset(hub.value, root);
  return resolveHeroAsset(root).desktop;
}

module.exports = {
  config, exists, imageSize, publicFile, resolveCtaAsset, resolveEntry, resolveFeatureAsset,
  resolveHeroAsset, resolveHubAsset, resolveLogoAsset, resolveOgAsset, resolvePageAsset,
  resolveProcessAsset, resolveSubjectAsset, resolveTargetAsset,
};
