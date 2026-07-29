const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { throw new Error(`${filePath} JSON을 읽을 수 없습니다: ${error.message}`); }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function hash(value) {
  const source = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
  return crypto.createHash("sha256").update(source).digest("hex");
}

function change(type, group, file, reason, details = {}) {
  return {
    type, group, slug: details.slug || null, file,
    before: details.before === undefined ? null : details.before,
    after: details.after === undefined ? null : details.after,
    confidence: details.confidence || "HIGH",
    reason,
  };
}

function unique(values) { return [...new Set(values)]; }

function selected(changeItem, options) {
  if (!options.type) return true;
  const aliases = { links: "links", indexes: "index", index: "index", metadata: "metadata", sitemap: "sitemap", images: "images", html: "html" };
  return changeItem.group === (aliases[options.type] || options.type);
}

module.exports = { change, hash, readJson, selected, unique, writeJsonAtomic };
