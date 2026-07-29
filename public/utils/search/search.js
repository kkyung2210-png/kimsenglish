const { normalizeBase, normalizeQuery } = require("./normalize");
const { tokenize, closestToken } = require("./tokenize");
const { canonicalTerms } = require("./synonyms");
const { prepareIndex, rankResults, closestResults } = require("./ranking");

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function createVocabulary(items) {
  const vocabulary = new Set(canonicalTerms());
  for (const item of items) {
    for (const field of ["province", "region", "subject", "target"]) {
      const value = normalizeBase(item[field]);
      if (value) {
        vocabulary.add(value);
        tokenize(value).forEach((token) => vocabulary.add(token));
      }
    }
  }
  return vocabulary;
}

function correctQuery(value, vocabulary) {
  const normalized = normalizeQuery(value);
  const originalTokens = tokenize(normalized.text);
  const tokens = originalTokens.map((token) => closestToken(token, vocabulary));
  return { ...normalized, text: tokens.join(" "), compact: tokens.join(""), tokens, corrected: tokens.join(" ") !== originalTokens.join(" ") };
}

function buildPopularKeywords(items, limit = 5) {
  const counts = new Map();
  for (const item of items) {
    const label = [item.region, item.subject].filter(Boolean).join(" ").trim();
    if (label) counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, limit)
    .map(([label]) => label);
}

function buildPopularRegions(items, limit = 12) {
  const counts = new Map();
  for (const item of items) {
    if (item.region) counts.set(item.region, (counts.get(item.region) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, limit)
    .map(([region]) => region);
}

function makeRecommendations(items, result, limit = 4) {
  if (!result) return [];
  const selected = [];
  const used = new Set([result.slug, result.title]);
  const candidates = items.filter((item) => item.region === result.region && item.slug !== result.slug);
  for (const candidate of candidates) {
    if (used.has(candidate.title)) continue;
    used.add(candidate.title);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

/** 나중에 AI나 외부 검색으로 바꿀 때 이 search() 인터페이스만 유지하면 됩니다. */
function createSearchEngine(items) {
  const source = Array.isArray(items) ? items : [];
  const prepared = prepareIndex(source);
  const closestSeen = new Set();
  const closestPrepared = prepared.filter((entry) => {
    const key = `${entry.item.province}|${entry.item.subject}`;
    if (closestSeen.has(key)) return false;
    closestSeen.add(key);
    return true;
  });
  const vocabulary = createVocabulary(source);
  const popular = buildPopularKeywords(source);
  const popularRegions = buildPopularRegions(source);
  return {
    items: source,
    popular,
    popularRegions,
    search(query, options = {}) {
      const startedAt = now();
      const limit = options.limit || 8;
      const normalized = correctQuery(query, vocabulary);
      let results = rankResults(prepared, normalized, limit);
      let usedClosest = false;
      if (!results.length && normalized.compact) {
        results = closestResults(closestPrepared, normalized, Math.min(5, limit));
        usedClosest = true;
      }
      return {
        query: String(query || "").trim(),
        normalizedQuery: normalized.text,
        correctedQuery: normalized.corrected ? normalized.text : "",
        results,
        recommendations: makeRecommendations(source, results[0]),
        usedClosest,
        elapsedMs: Number((now() - startedAt).toFixed(2)),
      };
    },
  };
}

module.exports = { createSearchEngine, correctQuery, buildPopularKeywords, buildPopularRegions, makeRecommendations };
