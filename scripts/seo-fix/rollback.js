const fs = require("fs");
const path = require("path");
const { createBackup, listBackups } = require("./backup");

function restoreBackup(root, requestedId = null) {
  const backups = listBackups(root, "apply");
  const target = requestedId ? backups.find((item) => item.id === requestedId) : backups[0];
  if (!target) throw new Error(requestedId ? `백업을 찾을 수 없습니다: ${requestedId}` : "복원할 SEO Fix 백업이 없습니다.");

  const currentSnapshot = createBackup(root, target.manifest.files.map((item) => item.path), {
    kind: "rollback-snapshot",
    reason: `${target.id} 복원 직전 현재 상태`,
  });
  for (const entry of target.manifest.files) {
    const destination = path.join(root, entry.path);
    if (!entry.existed) { fs.rmSync(destination, { force: true }); continue; }
    const source = path.join(target.path, entry.backupFile);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return { restoredBackupId: target.id, safetyBackupId: currentSnapshot.id, restoredFiles: target.manifest.files.map((item) => item.path) };
}

module.exports = { restoreBackup };
