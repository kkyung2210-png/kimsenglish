'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createClient, loadSearchIndex } = require('../services/search-console/client');
const { mapSearchConsoleData } = require('../services/search-console/mapper');
const { createCache } = require('../services/search-console/cache');

const ROOT_DIR = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(ROOT_DIR, '.search-console-test-fixture');

async function runTests() {
  resetFixture();

  try {
    const config = makeConfig();
    const mockClient = createClient({ rootDir: FIXTURE_DIR, config: config });
    const mockRaw = await mockClient.fetchData();
    const searchIndex = loadSearchIndex(FIXTURE_DIR);
    const mockReports = mapSearchConsoleData(mockRaw, searchIndex);

    assert.strictEqual(mockRaw.source.mode, 'mock');
    assert.strictEqual(mockReports.pages.items.length, 3);
    assert.ok(mockReports.summary.indexedPages > 0);
    assert.ok(mockReports.pages.items.every(hasRequiredPageFields));

    const cache = createCache(FIXTURE_DIR, 60);
    cache.write({ marker: 'saved' });
    assert.strictEqual(cache.read().marker, 'saved');
    cache.clear();
    assert.strictEqual(cache.read(), null);

    const fallbackConfig = makeConfig();
    fallbackConfig.mode = 'api';
    const fallbackClient = createClient({
      rootDir: FIXTURE_DIR,
      config: fallbackConfig,
      env: {},
      fetchImpl: async function () {
        throw new Error('호출되면 안 됩니다.');
      },
    });
    const fallbackRaw = await fallbackClient.fetchData();
    assert.strictEqual(fallbackRaw.source.mode, 'mock');

    const apiConfig = makeConfig();
    apiConfig.mode = 'api';
    apiConfig.fallbackToMock = false;
    const apiClient = createClient({
      rootDir: FIXTURE_DIR,
      config: apiConfig,
      env: { TEST_GSC_TOKEN: 'test-token' },
      fetchImpl: fakeGoogleFetch,
    });
    const apiRaw = await apiClient.fetchData();
    const apiReports = mapSearchConsoleData(apiRaw, searchIndex);
    assert.strictEqual(apiRaw.source.mode, 'api');
    assert.strictEqual(apiReports.pages.items.length, 3);
    assert.ok(apiReports.pages.items.every(function (item) {
      return item.indexed === null;
    }));
    assert.strictEqual(apiReports.queries.items[0].query, '안양 영어회화');

    console.log('Search Console 테스트 통과');
    console.log('- Mock 보고서 구조');
    console.log('- 페이지별 필수 항목');
    console.log('- 캐시 저장/읽기/삭제');
    console.log('- API 미연결 시 Mock 대체');
    console.log('- API 응답 공통 JSON 변환');
  } finally {
    fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
}

function resetFixture() {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
  const indexDir = path.join(FIXTURE_DIR, 'dist');
  fs.mkdirSync(indexDir, { recursive: true });
  fs.writeFileSync(
    path.join(indexDir, 'search-index.json'),
    JSON.stringify([
      makeIndexItem('anyang-english-conversation', '안양 영어회화', '경기도', '안양', '영어회화'),
      makeIndexItem('suwon-toeic', '수원 토익 과외', '경기도', '수원', '토익'),
      makeIndexItem('busan-japanese', '부산 일본어회화', '부산광역시', '부산', '일본어회화'),
    ]),
    'utf8'
  );
}

function makeIndexItem(slug, title, province, region, subject) {
  return {
    slug: slug,
    title: title,
    keyword: title,
    province: province,
    region: region,
    subject: subject,
    target: '성인',
  };
}

function makeConfig() {
  return {
    mode: 'mock',
    siteUrl: 'https://kimsenglish.co.kr/',
    dateRangeDays: 28,
    rowLimit: 100,
    fallbackToMock: true,
    cache: { ttlMinutes: 60 },
    mock: { indexedPercent: 67 },
    environment: {
      accessToken: 'TEST_GSC_TOKEN',
      siteUrl: 'TEST_GSC_SITE',
      apiKey: 'TEST_GSC_KEY',
    },
    urlInspection: { enabled: false },
  };
}

async function fakeGoogleFetch(url, options) {
  assert.ok(options.headers.Authorization.startsWith('Bearer '));
  const body = JSON.parse(options.body);
  const isPageRequest = body.dimensions[0] === 'page';
  const responseBody = isPageRequest
    ? {
        rows: [{
          keys: ['https://kimsenglish.co.kr/anyang-english-conversation/'],
          clicks: 12,
          impressions: 300,
          ctr: 0.04,
          position: 8.2,
        }],
      }
    : {
        rows: [{
          keys: ['안양 영어회화'],
          clicks: 8,
          impressions: 180,
          ctr: 0.0444,
          position: 6.5,
        }],
      };

  return {
    ok: true,
    json: async function () { return responseBody; },
    text: async function () { return ''; },
  };
}

function hasRequiredPageFields(item) {
  return [
    'clicks', 'impressions', 'ctr', 'averagePosition', 'indexed', 'lastCrawled',
  ].every(function (key) {
    return Object.prototype.hasOwnProperty.call(item, key);
  });
}

runTests().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
