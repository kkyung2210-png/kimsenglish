const { normalizeBase } = require("./normalize");

function tokenize(value) {
  return normalizeBase(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** 짧은 검색어에 적합한 Levenshtein 거리 계산입니다. */
function levenshtein(left, right, maximum = Infinity) {
  const a = normalizeBase(left);
  const b = normalizeBase(right);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > maximum) return maximum + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    let rowMinimum = row;
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      const value = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost);
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous = current;
  }
  return previous[b.length];
}

function closestToken(token, vocabulary) {
  if (!token || token.length < 2 || vocabulary.has(token)) return token;
  const limit = token.length <= 4 ? 1 : 2;
  let best = token;
  let bestDistance = limit + 1;
  for (const candidate of vocabulary) {
    if (Math.abs(candidate.length - token.length) > limit) continue;
    const distance = levenshtein(token, candidate, limit);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      if (distance === 1) break;
    }
  }
  return best;
}

module.exports = { tokenize, levenshtein, closestToken };
