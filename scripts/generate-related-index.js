const fs = require("fs");
const path = require("path");

const POOL_LIMIT = 64;
const RESULT_LIMIT = 8;

function key(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

function add(map, value, page) {
  const normalized = key(value);
  if (!normalized) return;
  if (!map.has(normalized)) map.set(normalized, []);
  map.get(normalized).push(page);
}

/** 큰 묶음에서도 지역과 과목이 골고루 남도록 후보 수를 제한합니다. */
function makePools(map, diversityKey) {
  const pools = new Map();
  for (const [groupKey, pages] of map) {
    const sorted = [...pages].sort((a, b) => a.slug.localeCompare(b.slug));
    const selected = [];
    const used = new Set();
    for (const page of sorted) {
      const diversity = key(diversityKey(page));
      if (used.has(diversity)) continue;
      used.add(diversity);
      selected.push(page);
      if (selected.length >= POOL_LIMIT) break;
    }
    if (selected.length < POOL_LIMIT) {
      const selectedSlugs = new Set(selected.map((page) => page.slug));
      for (const page of sorted) {
        if (selectedSlugs.has(page.slug)) continue;
        selected.push(page);
        if (selected.length >= POOL_LIMIT) break;
      }
    }
    pools.set(groupKey, selected);
  }
  return pools;
}

function pick(candidates, current, limit, options = {}) {
  const result = [];
  const usedSlugs = new Set([current.slug]);
  const usedLabels = new Set();
  const accept = options.accept || (() => true);
  const distinct = options.distinct || ((page) => page.slug);

  for (const candidate of candidates || []) {
    const label = key(distinct(candidate));
    if (usedSlugs.has(candidate.slug) || usedLabels.has(label) || !accept(candidate)) continue;
    usedSlugs.add(candidate.slug);
    usedLabels.add(label);
    result.push(candidate.slug);
    if (result.length >= limit) break;
  }
  return result;
}

function makeMeta(page) {
  return {
    province: key(page.province), region: key(page.region), subject: key(page.subject),
    target: key(page.target), intent: key(page.searchIntent), keyword: key(page.keyword),
  };
}

function score(current, candidate) {
  let total = 0;
  if (current.region === candidate.region && current.province === candidate.province) total += 1000;
  if (current.subject === candidate.subject) total += 500;
  if (current.target && current.target === candidate.target) total += 300;
  if (current.province && current.province === candidate.province) total += 200;
  if (current.intent && current.intent === candidate.intent) total += 150;
  if (current.keyword === candidate.keyword) total += 100;
  return total;
}

/** Map 후보 묶음만 합쳐 관련도 점수를 계산하므로 전체 페이지 간 비교를 하지 않습니다. */
function createRelatedIndex(pages) {
  const metaBySlug = new Map(pages.map((page) => [page.slug, makeMeta(page)]));
  const maps = {
    region: new Map(), province: new Map(), subject: new Map(), target: new Map(),
    intent: new Map(), keyword: new Map(),
  };
  for (const page of pages) {
    add(maps.region, `${page.province}|${page.region}`, page);
    add(maps.province, page.province, page);
    add(maps.subject, page.subject, page);
    add(maps.target, page.target, page);
    add(maps.intent, page.searchIntent, page);
    add(maps.keyword, page.keyword, page);
  }

  const pools = {
    region: makePools(maps.region, (page) => `${page.subject}|${page.target}`),
    province: makePools(maps.province, (page) => page.region),
    subject: makePools(maps.subject, (page) => `${page.province}|${page.region}`),
    target: makePools(maps.target, (page) => `${page.subject}|${page.region}`),
    intent: makePools(maps.intent, (page) => `${page.region}|${page.target}`),
    keyword: makePools(maps.keyword, (page) => page.region),
  };

  const related = {};
  for (const page of pages) {
    const regionPool = pools.region.get(key(`${page.province}|${page.region}`)) || [];
    const provincePool = pools.province.get(key(page.province)) || [];
    const subjectPool = pools.subject.get(key(page.subject)) || [];
    const targetPool = pools.target.get(key(page.target)) || [];
    const intentPool = pools.intent.get(key(page.searchIntent)) || [];
    const keywordPool = pools.keyword.get(key(page.keyword)) || [];

    const candidateMap = new Map();
    for (const candidate of [...regionPool, ...provincePool, ...subjectPool, ...targetPool, ...intentPool, ...keywordPool]) {
      if (candidate.slug !== page.slug) candidateMap.set(candidate.slug, candidate);
    }
    const scoreGroups = new Map();
    const pageMeta = metaBySlug.get(page.slug);
    for (const candidate of candidateMap.values()) {
      const candidateScore = score(pageMeta, metaBySlug.get(candidate.slug));
      if (candidateScore <= 0) continue;
      if (!scoreGroups.has(candidateScore)) scoreGroups.set(candidateScore, []);
      scoreGroups.get(candidateScore).push(candidate);
    }
    const popularRelated = [];
    for (const candidateScore of [...scoreGroups.keys()].sort((a, b) => b - a)) {
      const group = scoreGroups.get(candidateScore).sort((a, b) => a.title.localeCompare(b.title, "ko"));
      for (const candidate of group) {
        popularRelated.push(candidate.slug);
        if (popularRelated.length >= RESULT_LIMIT) break;
      }
      if (popularRelated.length >= RESULT_LIMIT) break;
    }

    related[page.slug] = {
      sameRegion: pick(regionPool, page, 5, {
        accept: (candidate) => key(candidate.subject) !== key(page.subject),
        distinct: (candidate) => candidate.subject,
      }),
      sameProvince: pick(provincePool, page, 5, {
        accept: (candidate) => key(candidate.region) !== key(page.region),
        distinct: (candidate) => candidate.region,
      }),
      sameSubject: pick(subjectPool, page, 5, {
        accept: (candidate) => key(candidate.region) !== key(page.region),
        distinct: (candidate) => candidate.region,
      }),
      // 같은 과목을 찾는 다른 대상 페이지를 연결해 대상 간 탐색이 이어지게 합니다.
      sameTarget: pick([...regionPool, ...subjectPool], page, 5, {
        accept: (candidate) => key(candidate.subject) === key(page.subject) && key(candidate.target) !== key(page.target),
        distinct: (candidate) => candidate.target,
      }),
      sameIntent: pick(intentPool, page, 5, {
        distinct: (candidate) => `${candidate.region}|${candidate.subject}|${candidate.target}`,
      }),
      popularRelated,
    };
  }
  return related;
}

function writeRelatedIndex({ root, outputPath, relatedIndex }) {
  const json = `${JSON.stringify(relatedIndex)}\n`;
  for (const filePath of [path.join(root, "public", "related-index.json"), path.join(outputPath, "related-index.json")]) {
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, "utf8") !== json) fs.writeFileSync(filePath, json, "utf8");
  }
}

module.exports = { createRelatedIndex, writeRelatedIndex };
