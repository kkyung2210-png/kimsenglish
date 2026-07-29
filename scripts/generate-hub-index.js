const fs = require("fs");
const path = require("path");

function key(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

const HUB_SLUGS = Object.freeze({
  province: Object.freeze({
    "서울특별시": "seoul", "경기도": "gyeonggi", "인천광역시": "incheon",
    "강원특별자치도": "gangwon", "충청북도": "chungbuk", "충청남도": "chungnam",
    "세종특별자치시": "sejong", "대전광역시": "daejeon", "전북특별자치도": "jeonbuk",
    "광주광역시": "gwangju", "전라남도": "jeonnam", "경상북도": "gyeongbuk",
    "대구광역시": "daegu", "경상남도": "gyeongnam", "부산광역시": "busan",
    "울산광역시": "ulsan", "제주특별자치도": "jeju",
  }),
  subject: Object.freeze({
    "영어회화": "english-conversation", "일본어": "japanese", "일본어회화": "japanese-conversation",
    "JLPT": "jlpt", "JPT": "jpt", "아이엘츠": "ielts", "텝스": "teps", "토플": "toefl",
    "비즈니스영어": "business-english", "생활영어": "daily-english", "여행영어": "travel-english",
    "오픽": "opic", "지텔프": "g-telp", "토익": "toeic", "토익스피킹": "toeic-speaking", "EJU": "eju",
  }),
  target: Object.freeze({
    "유아": "preschool", "초등학생": "elementary", "중학생": "middle-school", "고등학생": "high-school",
    "대학생": "college", "성인": "adult", "직장인": "worker", "시니어": "senior",
  }),
});

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function configuredSlug(type, value) {
  return HUB_SLUGS[type]?.[value] || `${type}-${stableHash(value)}`;
}

function commonRegionSlug(pages) {
  const tokenRows = pages.map((page) => page.slug.split("-"));
  const common = [];
  for (let index = 0; index < tokenRows[0].length; index += 1) {
    const token = tokenRows[0][index];
    if (!tokenRows.every((tokens) => tokens[index] === token)) break;
    common.push(token);
  }
  return common.join("-") || `region-${stableHash(pages[0].region)}`;
}

function makeGroups(pages, type, valueOf, extraOf = () => ({}), slugOf = (group) => configuredSlug(type, group.value)) {
  const groups = new Map();
  for (const page of pages) {
    const value = valueOf(page);
    const groupKey = key(value);
    if (!groupKey) continue;
    if (!groups.has(groupKey)) groups.set(groupKey, { value, count: 0, pages: [], ...extraOf(page) });
    const group = groups.get(groupKey);
    group.count += 1;
    group.pages.push(page);
  }
  return [...groups.values()]
    .map((group) => {
      const representative = [...group.pages].sort((a, b) => a.slug.length - b.slug.length || a.title.localeCompare(b.title, "ko"))[0];
      const hubSlug = slugOf(group, representative);
      const { pages: unused, ...summary } = group;
      return { ...summary, slug: representative.slug, title: representative.title, hubSlug, url: `/hub/${type}/${hubSlug}/` };
    })
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ko"));
}

/** 새 콘텐츠 유형도 같은 방식으로 Hub 묶음을 추가할 수 있는 공통 색인입니다. */
function createHubIndex(pages) {
  const hubIndex = {
    province: makeGroups(pages, "province", (page) => page.province),
    region: makeGroups(pages, "region", (page) => `${page.province}|${page.region}`, (page) => ({ province: page.province, region: page.region }), (group) => commonRegionSlug(group.pages)),
    subject: makeGroups(pages, "subject", (page) => page.subject),
    target: makeGroups(pages, "target", (page) => page.target),
    intent: makeGroups(pages, "intent", (page) => page.searchIntent),
    exam: makeGroups(pages.filter((page) => page.contentTemplate === "exam"), "subject", (page) => page.subject),
  };
  for (const type of ["province", "region", "subject", "target"]) {
    const used = new Set();
    for (const hub of hubIndex[type]) {
      if (used.has(hub.hubSlug)) throw new Error(`${type} Hub 주소가 중복됩니다: ${hub.hubSlug}`);
      used.add(hub.hubSlug);
    }
  }
  return hubIndex;
}

function writeHubIndex({ root, outputPath, hubIndex }) {
  const json = `${JSON.stringify(hubIndex)}\n`;
  for (const filePath of [path.join(root, "public", "hub-index.json"), path.join(outputPath, "hub-index.json")]) {
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, "utf8") !== json) fs.writeFileSync(filePath, json, "utf8");
  }
}

module.exports = { createHubIndex, writeHubIndex };
