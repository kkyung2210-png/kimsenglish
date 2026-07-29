'use strict';

const fs = require('fs');
const path = require('path');

function cachePath(rootDir) {
  return path.join(rootDir, '.cache', 'search-console.json');
}

function readCache(rootDir, ttlMinutes) {
  const file = cachePath(rootDir);
  if (!fs.existsSync(file)) return null;

  try {
    const cache = JSON.parse(fs.readFileSync(file, 'utf8'));
    const age = Date.now() - new Date(cache.savedAt).getTime();
    if (!Number.isFinite(age) || age > Number(ttlMinutes) * 60 * 1000) return null;
    return cache.data || null;
  } catch {
    return null;
  }
}

function writeCache(rootDir, data) {
  const file = cachePath(rootDir);
  const temporary = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    temporary,
    JSON.stringify({ savedAt: new Date().toISOString(), data: data }) + '\n',
    'utf8'
  );
  fs.renameSync(temporary, file);
  return file;
}

function clearCache(rootDir) {
  fs.rmSync(cachePath(rootDir), { force: true });
}

function createCache(rootDir, ttlMinutes) {
  return {
    read: function () { return readCache(rootDir, ttlMinutes); },
    write: function (data) { return writeCache(rootDir, data); },
    clear: function () { return clearCache(rootDir); },
  };
}

module.exports = { cachePath, clearCache, createCache, readCache, writeCache };
