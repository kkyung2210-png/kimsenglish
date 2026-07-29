'use strict';

const fs = require('fs');
const path = require('path');
const { createClient, loadSearchIndex } = require('../services/search-console/client');
const { readCache, writeCache } = require('../services/search-console/cache');
const { mapSearchConsoleData } = require('../services/search-console/mapper');

function loadConfig(rootDir) {
  return JSON.parse(
    fs.readFileSync(
      path.join(rootDir, 'config', 'search-console.config.json'),
      'utf8'
    )
  );
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

async function syncSearchConsole(options) {
  const settings = options || {};
  const rootDir = settings.rootDir || path.resolve(__dirname, '..');
  const config = settings.config || loadConfig(rootDir);
  const cached = settings.forceRefresh
    ? null
    : readCache(rootDir, config.cache.ttlMinutes);
  const raw = cached || await createClient({
    rootDir: rootDir,
    config: config,
    env: settings.env || process.env,
    fetchImpl: settings.fetchImpl,
  }).fetchData();

  if (!cached) writeCache(rootDir, raw);

  const reports = mapSearchConsoleData(raw, loadSearchIndex(rootDir));
  const outputDir = path.join(rootDir, 'reports', 'search-console');
  ['summary', 'pages', 'coverage', 'queries'].forEach(function (name) {
    writeJson(path.join(outputDir, name + '.json'), reports[name]);
  });

  return {
    source: raw.source.mode,
    cached: Boolean(cached),
    outputDir: outputDir,
    summary: reports.summary,
  };
}

function parseOptions(args, environment) {
  const values = args || process.argv.slice(2);
  const env = environment || process.env;
  return {
    forceRefresh: values.includes('--refresh') || env.npm_config_refresh === 'true',
  };
}

if (require.main === module) {
  syncSearchConsole(parseOptions()).then(function (result) {
    console.log(
      'Search Console 보고서 생성 완료 (' +
      result.source +
      (result.cached ? ', cache' : '') +
      ')'
    );
    console.log(
      'Indexed ' + result.summary.indexedPages.toLocaleString('ko-KR') +
      ' / Not Indexed ' + result.summary.notIndexedPages.toLocaleString('ko-KR')
    );
    console.log('Report: ' + result.outputDir);
  }).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { loadConfig, parseOptions, syncSearchConsole, writeJson };
