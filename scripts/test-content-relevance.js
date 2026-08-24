const { loadPages } = require("./generate-pages");
const { classifyTopic, stableHash } = require("./content-intelligence");

const EXAM_TERMS = {
  "toeic-speaking": ["opic", "오픽", "ielts", "아이엘츠", "toefl", "토플", "teps", "텝스", "jlpt", "jpt"],
  toeic: ["toeic speaking", "토익스피킹", "토익 스피킹", "opic", "오픽", "ielts", "아이엘츠", "toefl", "토플", "teps", "텝스", "jlpt", "jpt"],
  opic: ["toeic", "토익", "ielts", "아이엘츠", "toefl", "토플", "teps", "텝스", "jlpt", "jpt"],
  ielts: ["toeic", "토익", "opic", "오픽", "toefl", "토플", "teps", "텝스", "jlpt", "jpt"],
  toefl: ["toeic", "토익", "opic", "오픽", "ielts", "아이엘츠", "teps", "텝스", "jlpt", "jpt"],
  teps: ["toeic", "토익", "opic", "오픽", "ielts", "아이엘츠", "toefl", "토플", "jlpt", "jpt"],
  jlpt: ["toeic", "토익", "opic", "오픽", "ielts", "아이엘츠", "toefl", "토플", "teps", "텝스", "jpt"],
  jpt: ["toeic", "토익", "opic", "오픽", "ielts", "아이엘츠", "toefl", "토플", "teps", "텝스", "jlpt"],
};

function pageText(page) {
  return [
    page.description, page.content.intent, page.content.concern, page.content.focus,
    page.content.method, page.content.result, page.intelligence.intro,
    page.intelligence.lesson, page.intelligence.benefit, ...page.intelligence.examples,
    ...page.intelligence.faqs.flatMap((faq) => [faq.question, faq.answer]),
  ].join(" ").toLowerCase();
}

function forbiddenTerms(topic) {
  if (topic === "japanese") return ["영어", "english", "비즈니스", "business", "toeic", "토익", "opic", "오픽", "ielts", "toefl"];
  if (topic === "english") return ["일본어", "japanese", "jlpt", "jpt"];
  if (topic === "business") return ["일본어", "japanese", "jlpt", "jpt"];
  if (topic === "travel") return ["일본어", "japanese", "jlpt", "jpt"];
  return EXAM_TERMS[topic] || [];
}

const pages = loadPages().pages;
const sample = [...pages]
  .sort((a, b) => stableHash(`${a.slug}|relevance-sample`) - stableHash(`${b.slug}|relevance-sample`))
  .slice(0, 20);
const errors = [];

for (const page of sample) {
  const topic = classifyTopic(page);
  const text = pageText(page);
  const found = forbiddenTerms(topic).filter((term) => text.includes(term));
  if (found.length) errors.push(`${page.slug} (${topic}): ${[...new Set(found)].join(", ")}`);
}

if (errors.length) {
  console.error(`교차 콘텐츠 오류 ${errors.length}건\n${errors.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`교차 콘텐츠 검사 통과: ${sample.length}개`);
  sample.forEach((page) => console.log(`- ${page.slug} [${classifyTopic(page)}]`));
}
