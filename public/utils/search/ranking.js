const { normalizeQuery, compactText } = require("./normalize");
const { tokenize, levenshtein } = require("./tokenize");

const FIELDS = ["keyword", "title", "region", "province", "subject", "target"];

function prepareItem(item) {
  const normalized = Object.fromEntries(FIELDS.map((field) => [field, normalizeQuery(item[field]).text]));
  const combined = FIELDS.map((field) => normalized[field]).join(" ");
  return { item, normalized, combined, compact: compactText(combined), tokens: [...new Set(tokenize(combined))] };
}

function prepareIndex(items) {
  return items.map(prepareItem);
}

/** 지역 +50, 과목 +40, 대상 +30, 키워드 +20, 부분 일치 +10 규칙을 적용합니다. */
function rankItem(prepared, query) {
  const tokens = query.tokens;
  const values = prepared.normalized;
  const everyTokenMatches = tokens.every((token) => prepared.combined.includes(token));
  const compactMatches = query.compact.length >= 2 && prepared.compact.includes(query.compact);
  if (!everyTokenMatches && !compactMatches) return -1;

  let score = 0;
  if (tokens.some((token) => values.region === token || values.province === token)) score += 50;
  if (values.subject && tokens.some((token) => values.subject.includes(token) || token.includes(values.subject))) score += 40;
  if (values.target && tokens.some((token) => values.target.includes(token) || token.includes(values.target))) score += 30;
  if (tokens.every((token) => values.keyword.includes(token) || values.title.includes(token))) score += 20;
  if (compactMatches || tokens.some((token) => prepared.combined.includes(token))) score += 10;
  if (values.keyword === query.text || values.title === query.text) score += 60;
  return score;
}

function rankResults(preparedItems, query, limit = 8) {
  return preparedItems
    .map((prepared) => ({ prepared, score: rankItem(prepared, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.prepared.item.title.localeCompare(b.prepared.item.title, "ko"))
    .slice(0, limit)
    .map((entry) => ({ ...entry.prepared.item, score: entry.score }));
}

/** 결과가 없을 때 편집 거리가 가까운 페이지 다섯 개를 찾습니다. */
function closestResults(preparedItems, query, limit = 5) {
  const queryTokens = query.tokens.length ? query.tokens : [query.compact];
  return preparedItems
    .map((prepared) => {
      const distance = queryTokens.reduce((total, token) => {
        let best = Math.max(3, token.length);
        for (const candidate of prepared.tokens) best = Math.min(best, levenshtein(token, candidate, 3));
        return total + best;
      }, 0);
      return { prepared, distance };
    })
    .sort((a, b) => a.distance - b.distance || a.prepared.item.title.localeCompare(b.prepared.item.title, "ko"))
    .slice(0, limit)
    .map((entry) => ({ ...entry.prepared.item, score: Math.max(0, 20 - entry.distance), closest: true }));
}

module.exports = { FIELDS, prepareItem, prepareIndex, rankItem, rankResults, closestResults };
