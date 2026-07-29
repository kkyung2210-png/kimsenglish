const crypto = require("crypto");
const { normalize } = require("./content-checker");

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function exactGroups(documents, valueOf, type) {
  const groups = new Map();
  for (const document of documents) {
    const value = normalize(valueOf(document));
    if (!value) continue;
    const signature = hash(value);
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(document.slug || "__home__");
  }
  return [...groups.entries()]
    .filter(([, slugs]) => slugs.length > 1)
    .map(([signature, slugs], index) => ({ id: `${type}-exact-${index + 1}`, type, level: "EXACT", signature, count: slugs.length, slugs }));
}

function tokens(value) {
  const words = normalize(value).split(" ").filter((word) => word.length >= 2);
  const result = new Set(words);
  for (let index = 0; index < words.length - 1; index += 1) result.add(`${words[index]} ${words[index + 1]}`);
  return result;
}

function integerHash(value, seed) {
  let result = (2166136261 ^ seed) >>> 0;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function minHashSignature(tokenSet) {
  return [11, 97, 193, 389].map((seed) => {
    let minimum = 0xffffffff;
    for (const token of tokenSet) minimum = Math.min(minimum, integerHash(token, seed));
    return minimum;
  });
}

function jaccard(left, right) {
  if (!left.size && !right.size) return 1;
  let intersection = 0;
  const smaller = left.size <= right.size ? left : right;
  const larger = smaller === left ? right : left;
  for (const token of smaller) if (larger.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

/** MinHash band로 후보를 좁힌 뒤에만 실제 유사도를 계산합니다. */
function similarDescriptions(documents, settings) {
  const prepared = documents.filter((document) => document.description).map((document) => {
    const tokenSet = tokens(document.description);
    return { slug: document.slug || "__home__", tokenSet, signature: minHashSignature(tokenSet) };
  });
  const buckets = new Map();
  const pairs = new Map();
  for (const item of prepared) {
    const bandKeys = [`${item.signature[0]}:${item.signature[1]}`, `${item.signature[2]}:${item.signature[3]}`];
    for (const bandKey of bandKeys) {
      const bucket = buckets.get(bandKey) || [];
      for (const candidate of bucket.slice(-settings.candidateLimit)) {
        const pairKey = [item.slug, candidate.slug].sort().join("|");
        if (pairs.has(pairKey)) continue;
        const similarity = jaccard(item.tokenSet, candidate.tokenSet);
        if (similarity < settings.medium) continue;
        pairs.set(pairKey, {
          id: `description-similar-${pairs.size + 1}`,
          type: "description",
          level: similarity >= settings.high ? "HIGH" : "MEDIUM",
          similarity: Number(similarity.toFixed(3)),
          slugs: [candidate.slug, item.slug],
        });
        if (pairs.size >= settings.maximumPairs) return [...pairs.values()];
      }
      bucket.push(item);
      buckets.set(bandKey, bucket);
    }
  }
  return [...pairs.values()];
}

function checkDuplicates(documents, config) {
  const exact = [
    ...exactGroups(documents, (document) => document.title, "title"),
    ...exactGroups(documents, (document) => document.description, "description"),
    ...exactGroups(documents, (document) => document.h1.join("|"), "h1"),
    ...exactGroups(documents, (document) => document.introduction, "introduction"),
    ...exactGroups(documents, (document) => document.faqQuestions.join("|"), "faq-combination"),
    ...exactGroups(documents, (document) => document.ctaText, "cta"),
    ...exactGroups(documents, (document) => hash(normalize(document.text)), "body-signature"),
  ];
  const similar = similarDescriptions(documents, config.duplicateSimilarity);
  const groupBySlug = new Map();
  for (const group of [...exact, ...similar.filter((item) => item.level === "HIGH")]) {
    for (const slug of group.slugs) if (!groupBySlug.has(slug)) groupBySlug.set(slug, group.id);
  }
  return {
    exact,
    similar,
    groupBySlug,
    duplicateTitles: exact.filter((group) => group.type === "title").reduce((sum, group) => sum + group.count - 1, 0),
    duplicateDescriptions: exact.filter((group) => group.type === "description").reduce((sum, group) => sum + group.count - 1, 0),
  };
}

module.exports = { checkDuplicates, exactGroups, jaccard, similarDescriptions };
