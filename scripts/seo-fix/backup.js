const fs = require("fs");
const path = require("path");
const { hash, writeJsonAtomic } = require("./safe-fixes");

function backupId(date = new Date()) {
  const two = (value) => String(value).padStart(2, "0");
  const three = (value) => String(value).padStart(3, "0");
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}-${three(date.getMilliseconds())}`;
}

function safeRelative(root, file) {
  const absolute = path.resolve(root, file);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`백업 범위를 벗어난 경로입니다: ${file}`);
  return relative.replace(/\\/g, "/");
}

function createBackup(root, files, options = {}) {
  const id = options.id || backupId();
  const base = path.join(root, ".backups", "seo-fix", id);
  const entries = [];
  for (const candidate of [...new Set(files)]) {
    const relative = safeRelative(root, candidate);
    const source = path.join(root, relative);
    const exists = fs.existsSync(source) && fs.statSync(source).isFile();
    const entry = { path: relative, existed: exists, hash: null, backupFile: null };
    if (exists) {
      const bytes = fs.readFileSync(source);
      const destination = path.join(base, "files", relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, bytes);
      entry.hash = hash(bytes);
      entry.backupFile = path.relative(base, destination).replace(/\\/g, "/");
    }
    entries.push(entry);
  }
  const manifest = { id, createdAt: new Date().toISOString(), kind: options.kind || "apply", reason: options.reason || "SEO 안전 수정 전 백업", files: entries };
  writeJsonAtomic(path.join(base, "backup-manifest.json"), manifest);
  return { id, path: base, manifest };
}

function listBackups(root, kind = null) {
  const base = path.join(root, ".backups", "seo-fix");
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifestPath = path.join(base, entry.name, "backup-manifest.json");
      if (!fs.existsSync(manifestPath)) return null;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      return { id: entry.name, path: path.dirname(manifestPath), manifest };
    })
    .filter((item) => item && (!kind || item.manifest.kind === kind))
    .sort((a, b) => b.manifest.createdAt.localeCompare(a.manifest.createdAt));
}

module.exports = { backupId, createBackup, listBackups, safeRelative };
