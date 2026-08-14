const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const contentPath = path.join(root, "config", "content");
const FILES = ["intro", "lesson", "benefit", "faq", "cta", "examples"];
const TOPIC_PRIORITY = ["toeic", "opic", "ielts", "toefl", "japanese", "english", "business", "travel", "exam", "conversation"];
const TARGET_CTA_TITLES = [
  (v) => `${v.region} ${v.target} ${v.service} 수업, 내 상황에도 맞을까요?`,
  (v) => `${v.region} ${v.target} ${v.service}, 지금 시작해도 괜찮을까요?`,
  (v) => `${v.target} ${v.service} 수업을 ${v.region}에서 찾고 계신가요?`,
  (v) => `${v.region} ${v.service} 수업이 ${v.target}에게 어떻게 진행되는지 물어보세요`,
  (v) => `${v.region}에서 ${v.target} ${v.service}를 배우려면 어디서 시작해야 할까요?`,
  (v) => `${v.target}에게 맞는 ${v.region} ${v.service} 수업을 함께 찾아드립니다`,
  (v) => `${v.region} ${v.target} ${v.service} 상담, 궁금한 점부터 편하게 물어보세요`,
  (v) => `${v.target} ${v.service} 공부가 고민이라면 ${v.region}에서 상담받아 보세요`,
];
let cachedConfig = null;
const eligiblePoolCache = new Map();

/** 설정 파일은 빌드마다 한 번만 읽어 10만 페이지에서도 같은 파일을 반복해서 열지 않습니다. */
function loadContentConfig() {
  if (cachedConfig) return cachedConfig;
  cachedConfig = Object.fromEntries(FILES.map((name) => {
    const filePath = path.join(contentPath, `${name}.json`);
    if (!fs.existsSync(filePath)) throw new Error(`콘텐츠 설정 파일을 찾을 수 없습니다: ${filePath}`);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed.templates) || !parsed.templates.length) {
      throw new Error(`${name}.json의 templates 배열이 비어 있습니다.`);
    }
    return [name, parsed.templates];
  }));
  validateMinimums(cachedConfig);
  return cachedConfig;
}

function validateMinimums(config) {
  const minimums = { intro: 20, lesson: 20, benefit: 20, faq: 50, cta: 10, examples: 20 };
  for (const [name, minimum] of Object.entries(minimums)) {
    if (config[name].length < minimum) {
      throw new Error(`${name}.json에는 문장 템플릿이 최소 ${minimum}개 필요합니다.`);
    }
  }
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 과목 이름과 기존 template을 함께 보고 FAQ와 예문에 사용할 주제 태그를 만듭니다. */
function topicTags(page) {
  const source = `${page.subject} ${page.detailKeyword} ${page.keyword}`.toLowerCase();
  const tags = new Set(["all", page.contentTemplate || "conversation"]);
  if (/영어|english/.test(source)) tags.add("english");
  if (/일본어|japanese|jlpt|jpt|eju/.test(source)) tags.add("japanese");
  if (/토익|toeic/.test(source)) tags.add("toeic");
  if (/오픽|opic/.test(source)) tags.add("opic");
  if (/아이엘츠|ielts/.test(source)) tags.add("ielts");
  if (/토플|toefl/.test(source)) tags.add("toefl");
  if (/비즈니스|business|업무/.test(source)) tags.add("business");
  if (/여행|travel/.test(source)) tags.add("travel");
  return tags;
}

function eligibleTemplates(name, templates, tags) {
  const cacheKey = `${name}|${[...tags].sort().join(",")}`;
  if (eligiblePoolCache.has(cacheKey)) return eligiblePoolCache.get(cacheKey);
  const specific = templates.filter((item) => (item.topics || ["all"]).some((topic) => topic !== "all" && tags.has(topic)));
  const common = templates.filter((item) => (item.topics || ["all"]).includes("all"));
  const pool = specific.length ? [...specific, ...common] : common.length ? common : templates;
  eligiblePoolCache.set(cacheKey, pool);
  return pool;
}

/** 같은 페이지와 같은 종류는 항상 같은 순서로 선택하며, 여러 개를 고를 때 중복하지 않습니다. */
function selectTemplates(name, templates, tags, seed, count = 1) {
  const pool = eligibleTemplates(name, templates, tags);
  const ranked = pool.map((item, index) => ({ item, score: stableHash(`${seed}|${index}|${JSON.stringify(item)}`) }));
  ranked.sort((a, b) => a.score - b.score);
  return ranked.slice(0, Math.min(count, ranked.length)).map(({ item }) => item);
}

/** FAQ·예시·CTA는 가장 구체적인 과목 템플릿을 최소 하나 포함합니다. */
function selectTopicTemplates(name, templates, tags, seed, count = 1) {
  const primaryTopic = TOPIC_PRIORITY.find((topic) => tags.has(topic) && templates.some((item) => (item.topics || []).includes(topic)));
  if (!primaryTopic) return selectTemplates(name, templates, tags, seed, count);
  const primaryPool = templates.filter((item) => (item.topics || []).includes(primaryTopic));
  const selected = selectTemplates(`${name}:${primaryTopic}`, primaryPool, new Set([primaryTopic]), `${seed}|primary`, 1);
  const remainder = selectTemplates(name, templates, tags, `${seed}|remainder`, count + 2)
    .filter((item) => !selected.includes(item));
  return [...selected, ...remainder].slice(0, count);
}

function renderText(template, variables) {
  return String(template).replace(/{{([a-z_]+)}}/g, (match, name) => {
    if (!(name in variables)) throw new Error(`콘텐츠 템플릿에 알 수 없는 변수가 있습니다: ${match}`);
    return variables[name];
  }).replace(/\s+/g, " ").trim();
}

function makeVariables(page, context) {
  return {
    province: page.province || "전국",
    region: page.region || "지역",
    subject: page.subject || context.service,
    target: page.target || "수강생",
    audience: page.target || "수강생",
    keyword: page.keyword,
    service: context.service,
    intent: context.intent,
    concern: context.concern,
    focus: context.focus,
    method: context.method,
    result: context.result,
  };
}

/** 한 페이지에 필요한 본문·FAQ·CTA를 빌드 시점에 완성합니다. */
function createPageContent(page, context) {
  const config = loadContentConfig();
  const tags = topicTags(page);
  const seed = [page.slug, page.region, page.subject, page.target, page.searchIntent].join("|");
  const variables = makeVariables(page, context);
  const renderOne = (name) => renderText(selectTemplates(name, config[name], tags, `${seed}|${name}`)[0].text, variables);
  const contextualFaqPool = config.faq.filter((item) => item.question.includes("{{region}}") && item.question.includes("{{audience}}"));
  const contextualFaq = selectTemplates("faq:contextual", contextualFaqPool, new Set(["all"]), `${seed}|faq|contextual`)[0];
  const topicFaqs = selectTopicTemplates("faq", config.faq, tags, `${seed}|faq`, 5)
    .filter((item) => item !== contextualFaq)
    .slice(0, 3);
  const faqItems = [contextualFaq, ...topicFaqs].map((item) => ({
    question: renderText(item.question, variables),
    answer: renderText(item.answer, variables),
  }));
  const intro = renderOne("intro");
  const localLessonLead = `${page.region} ${page.target ? `${page.target} ` : ""}${context.service} 수업에서는`;
  const contextualSentence = (text) => `${localLessonLead} ${text}`;
  const lesson = contextualSentence(renderOne("lesson"));
  const benefit = contextualSentence(renderOne("benefit"));
  const exampleItems = selectTopicTemplates("examples", config.examples, tags, `${seed}|examples`, 2)
    .map((item) => contextualSentence(renderText(item.text, variables)));
  const ctaTemplate = selectTopicTemplates("cta", config.cta, tags, `${seed}|cta`)[0];
  let ctaTitle = renderText(ctaTemplate.title, variables);
  if (page.target) {
    const titlePattern = TARGET_CTA_TITLES[stableHash(`${seed}|cta-title`) % TARGET_CTA_TITLES.length];
    ctaTitle = titlePattern({ region: page.region, target: page.target, service: context.service });
  } else if (!ctaTitle.includes(page.region)) ctaTitle = `${page.region}에서 ${ctaTitle}`;
  return Object.freeze({
    intro,
    lesson,
    benefit,
    examples: Object.freeze(exampleItems),
    faqs: Object.freeze(faqItems),
    cta: Object.freeze({
      title: ctaTitle,
      text: renderText(ctaTemplate.text, variables),
      label: renderText(ctaTemplate.label, variables),
    }),
  });
}

module.exports = { createPageContent, loadContentConfig, stableHash };
