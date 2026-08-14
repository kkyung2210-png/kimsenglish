const fs = require("fs");
const path = require("path");
const { issue, pageRule, thresholdByPageType } = require("./rules");

function normalize(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function countOccurrences(text, phrase) {
  const normalizedText = normalize(text).replace(/\s/g, "");
  const normalizedPhrase = normalize(phrase).replace(/\s/g, "");
  if (!normalizedPhrase) return 0;
  return normalizedText.split(normalizedPhrase).length - 1;
}

function checkTitle(document, searchItem, config) {
  const problems = [];
  if (!document.title) return [issue("ERROR", "metadata", "title-missing", "title이 없습니다.")];
  if (document.title.length < config.titleLength.min) problems.push(issue("WARNING", "metadata", "title-too-short", `title이 ${config.titleLength.min}자보다 짧습니다.`));
  if (document.title.length > config.titleLength.max) problems.push(issue("WARNING", "metadata", "title-too-long", `title이 ${config.titleLength.max}자를 초과합니다.`));
  const coreTopic = searchItem?.subject || (document.h1[0] || "").split(/\s+/).slice(-1)[0];
  if (document.pageType !== "home" && coreTopic && !normalize(document.title).includes(normalize(coreTopic))) {
    problems.push(issue("WARNING", "metadata", "title-topic-missing", `title에 핵심 주제 “${coreTopic}”가 없습니다.`));
  }
  const wordCounts = new Map();
  for (const word of normalize(document.title).split(" ").filter(Boolean)) wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  const repeated = [...wordCounts.entries()].filter(([, count]) => count > 2).map(([word]) => word);
  if (repeated.length) problems.push(issue("WARNING", "metadata", "title-word-repeated", `title에서 같은 단어가 반복됩니다: ${repeated.join(", ")}`));
  return problems;
}

function checkDescription(document, searchItem, config) {
  const problems = [];
  if (!document.description) return [issue("ERROR", "metadata", "description-missing", "meta description이 없습니다.")];
  if (document.description.length < config.descriptionLength.min) problems.push(issue("WARNING", "metadata", "description-too-short", `description이 ${config.descriptionLength.min}자보다 짧습니다.`));
  if (document.description.length > config.descriptionLength.max) problems.push(issue("WARNING", "metadata", "description-too-long", `description이 ${config.descriptionLength.max}자를 초과합니다.`));
  const keyword = searchItem?.keyword || "";
  if (keyword && countOccurrences(document.description, keyword) > 2) problems.push(issue("WARNING", "metadata", "description-keyword-stuffing", "description에서 keyword가 부자연스럽게 반복됩니다."));
  return problems;
}

function checkHeadings(document, config) {
  const problems = [];
  if (!document.h1.length) problems.push(issue("ERROR", "technicalSeo", "h1-missing", "H1이 없습니다."));
  if (document.h1.length > 1) problems.push(issue("ERROR", "technicalSeo", "h1-multiple", `H1이 ${document.h1.length}개 있습니다.`));
  if (document.title && document.h1[0]) {
    const titleTokens = new Set(normalize(document.title).split(" "));
    const h1Tokens = normalize(document.h1[0]).split(" ");
    if (!h1Tokens.some((token) => titleTokens.has(token))) problems.push(issue("WARNING", "technicalSeo", "title-h1-unrelated", "title과 H1의 공통 주제가 없습니다."));
  }
  const firstH2 = document.headings.findIndex((heading) => heading.level === 2);
  const firstH3 = document.headings.findIndex((heading) => heading.level === 3);
  if (firstH3 !== -1 && (firstH2 === -1 || firstH3 < firstH2)) problems.push(issue("WARNING", "technicalSeo", "heading-order-invalid", "H2보다 H3가 먼저 나옵니다."));
  const counts = new Map();
  for (const heading of document.headings) counts.set(normalize(heading.text), (counts.get(normalize(heading.text)) || 0) + 1);
  const repeated = [...counts.entries()].filter(([text, count]) => text && count > config.headingRepeatLimit).map(([text]) => text);
  if (repeated.length) problems.push(issue("WARNING", "contentQuality", "heading-repeated", `같은 Heading이 과도하게 반복됩니다: ${repeated.slice(0, 3).join(", ")}`));
  return problems;
}

function checkImages(document, distPath, config) {
  const problems = [];
  for (const image of document.images) {
    const decorative = image.role === "presentation" || /aria-hidden=["']true/i.test(image.tag);
    if (!image.alt && !decorative) problems.push(issue("WARNING", "accessibility", "image-alt-missing", "이미지 alt가 비어 있고 장식용 표시도 없습니다.", { src: image.src }));
    if (!image.width || !image.height) problems.push(issue("WARNING", "accessibility", "image-size-attribute-missing", "이미지 width 또는 height가 없습니다.", { src: image.src }));
    if (image.src && !/^(?:https?:)?\/\//i.test(image.src) && !image.src.startsWith("data:")) {
      const imagePath = path.resolve(distPath, image.src.replace(/^\/+/, ""));
      if (!imagePath.startsWith(path.resolve(distPath)) || !fs.existsSync(imagePath)) problems.push(issue("ERROR", "technicalSeo", "image-broken", "존재하지 않는 이미지 경로입니다.", { src: image.src }));
      else if (fs.statSync(imagePath).size > config.imageMaximumBytes) problems.push(issue("WARNING", "accessibility", "image-too-large", "이미지 파일 크기가 설정 기준을 초과합니다.", { src: image.src, bytes: fs.statSync(imagePath).size }));
    }
  }
  if (/Image Placeholder/i.test(document.text)) problems.push(issue("WARNING", "contentQuality", "image-placeholder", "운영 페이지에 이미지 Placeholder 문구가 남아 있습니다."));
  return problems;
}

function checkContent(document, searchItem, config) {
  const problems = [];
  const rules = pageRule(config, document.pageType);
  const minimumText = thresholdByPageType(config.minimumTextLength, document.pageType);
  const minimumFaq = thresholdByPageType(config.minimumFaqCount, document.pageType);
  if (document.textLength < minimumText) problems.push(issue("WARNING", "contentQuality", "content-too-short", `본문이 ${minimumText}자보다 짧습니다.`, { textLength: document.textLength }));
  if (/\{\{[A-Za-z_][A-Za-z0-9_]*\}\}/.test(document.html)) problems.push(issue("ERROR", "contentQuality", "template-variable-left", "치환되지 않은 템플릿 변수가 남아 있습니다."));
  if (/\b(?:lorem ipsum|todo|tbd)\b/i.test(document.text)) problems.push(issue("WARNING", "contentQuality", "placeholder-text", "임시 콘텐츠 문구가 남아 있습니다."));
  const paragraphCounts = new Map();
  for (const paragraph of document.paragraphs) {
    const key = normalize(paragraph);
    if (key.length >= 30) paragraphCounts.set(key, (paragraphCounts.get(key) || 0) + 1);
  }
  if ([...paragraphCounts.values()].some((count) => count > 1)) problems.push(issue("WARNING", "contentQuality", "paragraph-repeated", "같은 문단이 한 페이지에서 반복됩니다."));
  const sentences = document.text.split(/[.!?。]+/).map(normalize).filter((text) => text.length >= 20);
  const sentenceCounts = new Map();
  for (const sentence of sentences) sentenceCounts.set(sentence, (sentenceCounts.get(sentence) || 0) + 1);
  if ([...sentenceCounts.values()].some((count) => count > 2)) problems.push(issue("WARNING", "contentQuality", "sentence-repeated", "같은 문장이 한 페이지에서 과도하게 반복됩니다."));
  if (searchItem?.keyword && countOccurrences(document.text, searchItem.keyword) > config.keywordRepeatLimit) problems.push(issue("WARNING", "contentQuality", "keyword-overused", "본문에서 keyword가 설정 기준보다 많이 반복됩니다."));
  if (searchItem?.region && countOccurrences(document.text, searchItem.region) > config.regionRepeatLimit) problems.push(issue("WARNING", "contentQuality", "region-overused", "본문에서 지역명이 설정 기준보다 많이 반복됩니다."));
  if (rules.cta && !document.hasCta) problems.push(issue("ERROR", "contentQuality", "cta-missing", "CTA 영역이 없습니다."));
  if (rules.faq && document.faqQuestions.length < minimumFaq) problems.push(issue("WARNING", "contentQuality", "faq-too-few", `FAQ가 ${minimumFaq}개보다 적습니다.`, { count: document.faqQuestions.length }));
  if (rules.lessonSummary && !document.hasLessonSummary) problems.push(issue("WARNING", "contentQuality", "lesson-summary-missing", "수업 상담 요약 영역이 없습니다."));
  if (rules.recommendedAudience && !document.hasRecommendedAudience) problems.push(issue("WARNING", "contentQuality", "recommended-audience-missing", "추천 대상 영역이 없습니다."));
  if (rules.relatedSection && !document.hasRelatedSection) problems.push(issue("WARNING", "internalLinks", "related-section-missing", "관련 페이지 영역이 없습니다."));
  return problems;
}

function checkRequiredSeo(document, baseUrl, config) {
  const problems = [];
  const rules = pageRule(config, document.pageType);
  if (!document.viewport) problems.push(issue("ERROR", "technicalSeo", "viewport-missing", "viewport meta가 없습니다."));
  if (!document.lang) problems.push(issue("ERROR", "accessibility", "lang-missing", "html lang 속성이 없습니다."));
  if (!document.robots) problems.push(issue("INFO", "technicalSeo", "robots-meta-missing", "robots meta가 없습니다. robots.txt 정책이 적용됩니다."));
  if (rules.breadcrumb && !document.hasBreadcrumb) problems.push(issue("WARNING", "technicalSeo", "breadcrumb-missing", "Breadcrumb가 없습니다."));
  if (!document.canonicals.length) problems.push(issue("ERROR", "technicalSeo", "canonical-missing", "canonical이 없습니다."));
  if (document.canonicals.length > 1) problems.push(issue("ERROR", "technicalSeo", "canonical-multiple", "canonical이 여러 개 있습니다."));
  if (document.canonicals[0]) {
    let parsed;
    try { parsed = new URL(document.canonicals[0]); } catch { problems.push(issue("ERROR", "technicalSeo", "canonical-relative", "canonical이 절대 URL이 아닙니다.")); }
    const expected = `${baseUrl}${document.urlPath}`;
    if (parsed && parsed.origin !== new URL(baseUrl).origin) problems.push(issue("ERROR", "technicalSeo", "canonical-domain-invalid", "canonical 도메인이 사이트 도메인과 다릅니다."));
    if (parsed && parsed.href !== expected) problems.push(issue("ERROR", "technicalSeo", "canonical-mismatch", `canonical이 현재 URL과 다릅니다.`, { expected, actual: parsed.href }));
  }
  return problems;
}

function checkDocumentContent(document, context) {
  const { baseUrl, config, distPath, searchItem } = context;
  return [
    ...checkTitle(document, searchItem, config), ...checkDescription(document, searchItem, config),
    ...checkHeadings(document, config), ...checkRequiredSeo(document, baseUrl, config),
    ...checkContent(document, searchItem, config), ...checkImages(document, distPath, config),
  ];
}

module.exports = { checkDocumentContent, countOccurrences, normalize };
