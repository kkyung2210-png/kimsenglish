'use strict';

const fs = require('fs');
const path = require('path');

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(days) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, Number(days) - 1));
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

function loadSearchIndex(rootDir) {
  const candidates = [
    path.join(rootDir, 'dist', 'search-index.json'),
    path.join(rootDir, 'public', 'search-index.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  throw new Error('search-index.json을 찾을 수 없습니다. 먼저 npm run build를 실행해 주세요.');
}

function makeMockData(rootDir, config) {
  const index = loadSearchIndex(rootDir);
  const range = dateRange(config.dateRangeDays);
  const siteUrl = String(config.siteUrl).replace(/\/?$/, '/');
  const pageRows = [];
  const inspections = [];

  for (const item of index) {
    const number = stableHash(item.slug);
    const impressions = 20 + (number % 2400);
    const clicks = Math.min(
      impressions,
      number % Math.max(1, Math.round(impressions * 0.18))
    );
    const indexed = number % 100 < Number(config.mock.indexedPercent);
    const url = siteUrl + item.slug + '/';

    pageRows.push({
      keys: [url],
      clicks: clicks,
      impressions: impressions,
      ctr: impressions ? clicks / impressions : 0,
      position: 2 + ((number >>> 8) % 480) / 10,
    });
    inspections.push({
      url: url,
      indexed: indexed,
      coverageState: indexed
        ? 'Indexed'
        : [
            '발견됨 - 현재 색인이 생성되지 않음',
            '크롤링됨 - 현재 색인이 생성되지 않음',
            'Google이 선택한 표준 페이지와 다름',
          ][number % 3],
      lastCrawled: new Date(Date.now() - (number % 45) * 86400000).toISOString(),
    });
  }

  const queryMap = new Map();
  for (const item of index) {
    const candidates = [
      item.keyword,
      [item.region, item.subject].filter(Boolean).join(' '),
      item.subject,
      item.target ? [item.target, item.subject].filter(Boolean).join(' ') : '',
    ].filter(Boolean);

    for (const query of candidates) {
      if (queryMap.has(query)) continue;
      const number = stableHash(query);
      const impressions = 50 + (number % 12000);
      const clicks = Math.min(
        impressions,
        number % Math.max(1, Math.round(impressions * 0.14))
      );
      queryMap.set(query, {
        keys: [query],
        clicks: clicks,
        impressions: impressions,
        ctr: clicks / impressions,
        position: 1 + ((number >>> 7) % 390) / 10,
      });
      if (queryMap.size >= 500) break;
    }
    if (queryMap.size >= 500) break;
  }

  return {
    source: {
      mode: 'mock',
      notice: 'Google API 연결 전이라 실제 값이 아닌 Mock 데이터를 표시합니다.',
    },
    siteUrl: siteUrl,
    ...range,
    pageRows: pageRows,
    queryRows: Array.from(queryMap.values()),
    inspections: inspections,
  };
}

async function searchAnalytics(fetchImpl, token, siteUrl, range, dimensions, rowLimit) {
  const endpoint =
    'https://searchconsole.googleapis.com/webmasters/v3/sites/' +
    encodeURIComponent(siteUrl) +
    '/searchAnalytics/query';
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...range,
      dimensions: dimensions,
      rowLimit: Number(rowLimit),
    }),
  });

  if (!response.ok) {
    throw new Error(
      'Search Console API 오류 ' + response.status + ': ' + await response.text()
    );
  }
  const payload = await response.json();
  return payload.rows || [];
}

async function makeApiData(config, environment, fetchImpl) {
  const tokenName = config.environment.accessToken;
  const token = environment[tokenName];
  if (!token) throw new Error(tokenName + ' 환경변수가 없습니다.');

  const siteUrl =
    environment[config.environment.siteUrl] ||
    config.siteUrl;
  const range = dateRange(config.dateRangeDays);
  const results = await Promise.all([
    searchAnalytics(fetchImpl, token, siteUrl, range, ['page'], config.rowLimit),
    searchAnalytics(fetchImpl, token, siteUrl, range, ['query'], config.rowLimit),
  ]);

  return {
    source: {
      mode: 'api',
      notice: config.urlInspection.enabled
        ? '검색 성과 데이터를 Google API에서 가져왔습니다.'
        : '검색 성과는 Google API 값입니다. URL Inspection 연결 전이라 색인 상태는 미확인으로 표시됩니다.',
    },
    siteUrl: String(siteUrl).replace(/\/?$/, '/'),
    ...range,
    pageRows: results[0],
    queryRows: results[1],
    inspections: [],
  };
}

function createClient(options) {
  const rootDir = options.rootDir;
  const config = options.config;
  const environment = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  return {
    async fetchData() {
      if (config.mode !== 'api') return makeMockData(rootDir, config);

      try {
        return await makeApiData(config, environment, fetchImpl);
      } catch (error) {
        if (!config.fallbackToMock) throw error;
        const mock = makeMockData(rootDir, config);
        mock.source.notice =
          'Google API 연결에 실패해 Mock 데이터를 표시합니다. 원인: ' + error.message;
        return mock;
      }
    },
  };
}

module.exports = {
  createClient,
  dateRange,
  loadSearchIndex,
  makeApiData,
  makeMockData,
  stableHash,
};
