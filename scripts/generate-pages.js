// 외부 패키지 없이 Node.js 기본 기능만 사용하는 정적 페이지 생성기입니다.
const fs = require("fs");
const path = require("path");
const { makeJsonLd, makePageSchema } = require("./generate-schema");
const { createPageContent } = require("./content-intelligence");
const brandAssets = require("../config/brand-assets");
const reviews = require("../config/reviews");
const { SITE_URL } = require("../config/site");
const {
  config: assetConfig, resolveCtaAsset, resolveEntry, resolveFeatureAsset, resolveHeroAsset,
  resolveLogoAsset, resolveOgAsset, resolvePageAsset, resolveProcessAsset, resolveSubjectAsset,
} = require("./utils/assets/resolve-asset");
const { renderImageBox, renderLogo, renderOgTags, renderPicture } = require("./utils/assets/image-html");

const root = path.resolve(__dirname, "..");
const csvPath = path.join(root, "pages.csv");
const templatePath = path.join(root, "templates", "page.html");
const productionUrl = SITE_URL;
// 모든 경로 선택은 config/brand-assets.js와 공통 resolver에서 처리합니다.
const heroAssets = resolveHeroAsset(root);
const englishImage = resolveSubjectAsset("영어회화", root);
const japaneseImage = resolveSubjectAsset("일본어", root);
const examImage = resolveSubjectAsset("토익", root);
const businessImage = resolveSubjectAsset("비즈니스영어", root);
const featurePersonal = resolveFeatureAsset("personal", root);
const featureNationwide = resolveFeatureAsset("nationwide", root);
const featureManagement = resolveFeatureAsset("management", root);
const featureLevelTest = resolveFeatureAsset("levelTest", root);
const processLevelTest = resolveProcessAsset("levelTest", root);
const processPlan = resolveProcessAsset("plan", root);
const processLesson = resolveProcessAsset("lesson", root);
const processFeedback = resolveProcessAsset("feedback", root);
const levelTestCtaImage = resolveCtaAsset("levelTest", root);

// 실제 학원 홈페이지에서 자연스럽게 쓰는 표현을 분류별로 섞어 페이지 간 중복을 줄입니다.
const HERO_SECOND_SENTENCES = {
  conversation: [
    "기초 표현을 익힌 뒤 바로 대화에 써 보며, 말문이 막히는 부분은 여러 상황으로 바꿔 다시 연습합니다.",
    "현재 실력에 맞춘 1:1 맞춤 수업으로 부족한 부분을 보완하고, 자주 쓰는 표현을 반복해서 연습합니다.",
    "어디에서 말이 막히는지 살펴보고, 지금 가장 자주 쓰게 될 표현부터 입에 익도록 수업합니다.",
    "처음 시작하는 분은 인사와 짧은 답변부터, 경험이 있는 분은 대화를 길게 이어 가는 연습부터 시작합니다.",
    "배운 문장을 외우는 데서 끝내지 않고 질문을 바꾸어도 자신의 말로 답할 수 있을 때까지 연습합니다.",
    "간단한 문장을 직접 만든 뒤 상황 대화로 이어 가며, 틀린 표현은 그 자리에서 자연스럽게 고쳐드립니다.",
    "듣기는 되는데 답이 바로 나오지 않는다면 짧은 응답부터 반복해 말하는 속도를 끌어올립니다.",
    "일상에서 실제로 쓰는 장면을 골라 말해 보고, 다음 수업에서는 같은 표현을 다른 상황에 다시 써봅니다.",
  ],
  exam: [
    "최근 점수와 풀이 과정을 함께 보고, 점수를 가장 많이 잃는 영역부터 공부 순서를 다시 잡습니다.",
    "목표 점수에 맞춘 1:1 맞춤 수업으로 핵심 개념부터 문제 풀이와 오답 정리까지 꼼꼼히 진행합니다.",
    "기초 개념을 확실히 정리한 뒤 출제 유형별 문제를 풀며, 실전 감각과 시간 관리 능력을 높입니다.",
    "틀린 문제의 정답만 외우지 않고 왜 그 선택지를 골랐는지까지 짚어 같은 실수가 반복되지 않게 합니다.",
    "시험일까지 남은 기간을 계산해 개념 정리와 실전 문제 풀이의 비중을 현실적으로 나눕니다.",
    "현재 실력에 알맞은 학습 순서를 정하고, 자주 틀리는 문제를 중심으로 오답 관리까지 함께합니다.",
    "기초가 약한 영역은 개념과 쉬운 문제를 함께 다루고, 익숙한 영역은 시간 안에 푸는 훈련에 집중합니다.",
    "학습 기간과 원하는 등급을 바탕으로 필요한 유형을 골라 연습하고 매주 점수 흐름을 살펴봅니다.",
  ],
  business: [
    "실제로 영어가 필요한 업무 장면을 듣고, 다음 회의나 이메일에서 바로 쓸 문장부터 다듬습니다.",
    "직무와 학습 목표에 맞춘 1:1 맞춤 수업으로 실무에 필요한 말하기와 문장 작성을 익힙니다.",
    "기본 비즈니스 표현을 실제 업무 대화에 넣어 보고, 상대와 상황에 맞는 어조까지 함께 손봅니다.",
    "자주 사용하는 업무 표현을 정리하고, 역할 연습과 문장 교정을 통해 정확한 전달력을 기릅니다.",
    "평소 쓰는 이메일이나 발표 문장을 가져오면 뜻은 살리면서 더 정확하고 자연스러운 표현으로 고쳐드립니다.",
    "이메일과 전화, 회의 등 필요한 분야를 우선해 배우고 실제 상황처럼 충분히 연습합니다.",
    "직무에서 자주 쓰는 어휘와 문장을 골라 익히고, 상대의 질문에 바로 답하는 연습까지 이어갑니다.",
    "실무에서 자주 마주치는 상황을 바탕으로 수업하며, 부족한 표현과 문장을 꼼꼼히 교정합니다.",
  ],
  travel: [
    "공항과 숙소, 식당 등 여행에서 자주 만나는 상황을 중심으로 꼭 필요한 표현부터 배웁니다.",
    "현재 실력에 맞춘 1:1 맞춤 수업으로 기본 문장부터 상황별 대화까지 차근차근 연습합니다.",
    "여행 일정에 맞춰 쓸 가능성이 높은 표현을 고르고, 직원과 실제로 대화하듯 여러 번 주고받습니다.",
    "처음 배우는 분은 인사와 질문부터 시작해 예약 확인과 요청까지 직접 말해 봅니다.",
    "출국 전에 꼭 필요한 문장을 입에 익히고, 현지에서 질문을 알아듣지 못했을 때 대처하는 말도 준비합니다.",
    "길 찾기나 예약 오류처럼 예상 밖의 상황도 역할 대화로 연습해 당황하지 않고 요청할 수 있게 합니다.",
    "여행 목적지와 일정에 맞게 장면을 고른 뒤 듣기와 말하기를 한 수업 안에서 함께 연습합니다.",
    "완벽한 문법을 기다리지 않고 짧아도 뜻이 분명한 문장부터 직접 말하며 자신감을 붙입니다.",
  ],
};

const HERO_OPENING_PATTERNS = [
  (c) => `${c.region}에서 ${c.lessonName} 수업을 찾고 계신다면 지금 실력에서 필요한 내용부터 시작할 수 있습니다.`,
  (c) => `${c.lessonName} 수업을 처음 시작한다면 ${c.region}에서도 기초부터 1:1로 배울 수 있습니다.`,
  (c) => `${c.region} ${c.lessonName} 수업은 정해진 진도보다 현재 실력과 배우는 이유를 먼저 봅니다.`,
  (c) => `${c.region}에서 ${c.lessonName} 실력을 늘리고 싶다면 자주 막히는 부분부터 수업에서 직접 다뤄봅니다.`,
  (c) => `${c.lessonName} 공부를 다시 시작하려는 분께 ${c.region} 1:1 수업이 맞는 출발점을 찾아드립니다.`,
  (c) => `${c.region} ${c.lessonName} 수업을 고민 중이라면 잘하는 부분과 보완할 부분을 나누어 시작합니다.`,
  (c) => `${c.region}에서 배우는 ${c.lessonName}, 교재보다 실제로 쓰려는 상황에 맞춰 수업 내용을 정합니다.`,
  (c) => `${c.lessonName} 때문에 고민이 있다면 ${c.region} 수업에서 지금 필요한 연습부터 함께 해볼 수 있습니다.`,
];

const CONTENT_TEMPLATE_TYPES = new Set(["conversation", "exam", "business", "travel"]);
const CONTENT_TONES = new Set(["친근형", "신뢰형", "전문형", "목표달성형", "차분형", "코칭형"]);

const PROCESS_STEPS = {
  conversation: [
    ["듣기", "현재 수준에서 들리는 표현과 어려운 부분을 확인합니다."],
    ["표현 학습", "목적에 맞는 핵심 표현과 문장 구조를 익힙니다."],
    ["상황별 말하기", "실제 상황을 가정해 배운 표현을 직접 사용합니다."],
    ["피드백", "말한 내용을 점검하고 필요한 표현을 다시 연습합니다."],
  ],
  exam: [
    ["진단", "현재 점수와 영역별 강점 및 보완점을 확인합니다."],
    ["영역별 학습", "목표에 필요한 개념과 문제 유형을 순서대로 학습합니다."],
    ["문제풀이", "정답 근거와 시간 배분을 함께 점검합니다."],
    ["오답관리", "반복되는 실수를 분류하고 다시 풀어 봅니다."],
  ],
  business: [
    ["업무 상황 확인", "실제로 영어가 필요한 업무 장면과 목적을 정리합니다."],
    ["필요한 표현 정리", "회의와 이메일 등 필요한 표현을 우선 학습합니다."],
    ["역할 연습", "업무 상황을 가정해 표현을 직접 사용합니다."],
    ["문장 교정", "전달력을 높이도록 문장과 표현을 점검합니다."],
  ],
  travel: [
    ["여행 상황 선정", "공항과 숙소 등 먼저 준비할 상황을 고릅니다."],
    ["필수 표현 학습", "상황별 질문과 답변에 필요한 표현을 익힙니다."],
    ["상황 대화", "여행 장면을 가정해 짧은 대화를 이어 갑니다."],
    ["반복 연습", "필요한 표현이 자연스럽게 나오도록 다시 연습합니다."],
  ],
};

// 과목별 문장 풀이 줄어들면 페이지를 만들기 전에 바로 알려줍니다.
for (const [name, patterns] of Object.entries(HERO_SECOND_SENTENCES)) {
  if (patterns.length < 8) throw new Error(`${name} description 패턴은 최소 8개가 필요합니다.`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(value); value = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (value.length || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

function normalizeSlug(value) {
  const slug = String(value || "").trim().replace(/^\/+|\/+$/g, "").replace(/^pages\//i, "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(slug)) throw new Error(`사용할 수 없는 slug입니다: ${slug}`);
  return slug;
}

function renderTemplate(template, values) {
  return template.replace(/{{([A-Z0-9_]+)}}/g, (match, key) => {
    if (!(key in values)) throw new Error(`템플릿 값이 없습니다: ${key}`);
    return values[key];
  });
}

/** 공통 템플릿에서 사용할 로고·아이콘·OG 태그를 한 설정에서 가져옵니다. */
function brandTemplateValues(page = null, baseUrl = productionUrl) {
  const faviconIco = resolveEntry(root, assetConfig.favicon.ico);
  const faviconSvg = resolveEntry(root, assetConfig.favicon.svg);
  const appleTouch = resolveEntry(root, assetConfig.favicon.appleTouch);
  const faviconTags = [
    faviconIco.src ? `<link rel="icon" href="${escapeHtml(faviconIco.src)}">` : "",
    faviconSvg.src ? `<link rel="alternate icon" href="${escapeHtml(faviconSvg.src)}" type="image/svg+xml">` : "",
    appleTouch.src ? `<link rel="apple-touch-icon" href="${escapeHtml(appleTouch.src)}">` : "",
    assetConfig.favicon.manifest ? `<link rel="manifest" href="${escapeHtml(assetConfig.favicon.manifest)}">` : "",
  ].filter(Boolean).join("\n  ");
  return {
    BRAND_NAME: brandAssets.name,
    BRAND_LOGO_MARK: renderLogo(resolveLogoAsset("mark", root)),
    BRAND_LOGO_FULL: renderLogo(resolveLogoAsset("default", root)),
    BRAND_FAVICON_TAGS: faviconTags,
    OG_IMAGE_TAGS: renderOgTags(resolveOgAsset(page, root), baseUrl),
  };
}

function makeBaseUrl(domain) {
  const cleanDomain = String(domain || productionUrl).trim().replace(/\/$/, "");
  return /^https?:\/\//i.test(cleanDomain) ? cleanDomain : `https://${cleanDomain}`;
}

function firstValue(object, ...keys) {
  for (const key of keys) {
    if (object[key] !== undefined && String(object[key]).trim() !== "") return String(object[key]).trim();
  }
  return "";
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function inferSuffix(raw, detailKeyword, keyword) {
  const explicit = firstValue(raw, "suffix", "접미어");
  if (explicit) return explicit;
  const candidates = ["과외", "수업", "레슨", "준비", "교육"];
  return candidates.find((candidate) => String(keyword).includes(`${detailKeyword} ${candidate}`) || String(keyword).includes(`${detailKeyword}${candidate}`)) || "";
}

function normalizeTone(value) {
  const tone = String(value || "").trim();
  return CONTENT_TONES.has(tone) ? tone : "차분형";
}

function normalizeContentTemplate(page) {
  // 새 final의 template 값을 최우선으로 사용합니다.
  const explicitTemplate = String(page.template || "").trim().toLowerCase();
  if (CONTENT_TEMPLATE_TYPES.has(explicitTemplate)) return explicitTemplate;
  // template 값이 비어 있는 기존 CSV만 검색의도와 수업 자료에서 종류를 보조 판단합니다.
  const value = `${page.template} ${page.category} ${page.detailKeyword} ${page.title} ${page.searchIntent} ${page.summary} ${page.lessonFocus}`.toLowerCase();
  if (/travel|여행/.test(value)) return "travel";
  if (/business|비즈니스|업무|직장/.test(value)) return "business";
  if (/exam|시험|자격|토익|toeic|토플|teps/.test(value)) return "exam";
  return "conversation";
}

function normalizePage(raw, index) {
  const province = firstValue(raw, "province", "시도");
  const region = firstValue(raw, "region", "지역");
  const target = firstValue(raw, "target", "대상");
  const detailKeyword = firstValue(raw, "detail_keyword", "세부키워드", "subject") || "회화";
  const keyword = firstValue(raw, "keyword", "최종키워드", "title") || `${region} ${target} ${detailKeyword}`.replace(/\s+/g, " ").trim();
  const title = firstValue(raw, "title") || keyword;
  return {
    ...raw,
    _source: raw,
    id: firstValue(raw, "id") || String(index + 1),
    domain: firstValue(raw, "domain") || productionUrl,
    slug: normalizeSlug(firstValue(raw, "slug")),
    status: firstValue(raw, "status") || "publish",
    language: firstValue(raw, "language") || "ko",
    province,
    region,
    target,
    subject: firstValue(raw, "subject") || detailKeyword,
    detailKeyword,
    suffix: inferSuffix(raw, detailKeyword, keyword),
    category: firstValue(raw, "category", "분류"),
    keyword,
    title,
    providedDescription: firstValue(raw, "description"),
    legacyDescription: firstValue(raw, "description"),
    searchIntent: firstValue(raw, "search_intent", "검색의도"),
    summary: firstValue(raw, "summary", "핵심고민"),
    lessonFocus: firstValue(raw, "lesson_focus", "수업초점"),
    lessonMethod: firstValue(raw, "lesson_method", "수업방식"),
    lessonResult: firstValue(raw, "lesson_result", "기대변화"),
    rawTone: firstValue(raw, "tone", "톤"),
    tone: normalizeTone(firstValue(raw, "tone", "톤")),
    template: firstValue(raw, "template", "본문템플릿"),
  };
}

function validateFinalContent(page) {
  // template 열이 있는 새 final만 엄격히 검사하고, 예전 CSV는 기본 문장으로 호환합니다.
  if (!page.template) return;
  const required = {
    search_intent: page.searchIntent, summary: page.summary, lesson_focus: page.lessonFocus,
    lesson_method: page.lessonMethod, lesson_result: page.lessonResult, tone: page.rawTone,
  };
  for (const [name, value] of Object.entries(required)) {
    if (!String(value || "").trim()) throw new Error(`${page.slug}: ${name} 값이 비어 있습니다.`);
  }
  const template = page.template.toLowerCase();
  if (!CONTENT_TEMPLATE_TYPES.has(template)) throw new Error(`${page.slug}: template 값이 올바르지 않습니다.`);
  if (CONTENT_TEMPLATE_TYPES.has(page.searchIntent.toLowerCase())) {
    throw new Error(`${page.slug}: search_intent에 template 이름이 들어 있습니다.`);
  }
}

function humanizeSourcePhrase(value) {
  return String(value || "")
    .replace(/차분하고 분명한 안내입니다[.]?/g, "")
    .replace(/체계적으로/g, "꼼꼼하게")
    .replace(/단계적으로/g, "하나씩")
    .replace(/효율적으로/g, "집중해서")
    .replace(/부담 없이/g, "자연스럽게")
    .replace(/쉽게 익힐 수 있습니다/g, "충분히 익힐 때까지 연습합니다")
    .replace(/수업 초점은/g, "수업에서는")
    .replace(/기대 변화는/g, "수업 후에는")
    .replace(/먼저 확인해 보세요/g, "함께 살펴봅니다")
    .replace(/안내합니다/g, "말씀드립니다")
    .replace(/\s+/g, " ")
    .trim();
}

function makeContentContext(page) {
  const service = `${page.detailKeyword}${page.suffix ? ` ${page.suffix}` : ""}`;
  const audience = page.target || "수강생";
  const location = [page.province, page.region].filter(Boolean).join(" ");
  const intent = humanizeSourcePhrase(page.searchIntent || `${location}에서 ${service} 수업을 찾는 분`);
  const summarizedConcern = String(page.summary || "").match(/핵심 고민(?:은 [“\"]|:\s*)([^”\"]+?)(?:[”\"]|$)/);
  const concern = humanizeSourcePhrase(summarizedConcern?.[1] || `${service}를 공부해도 필요한 순간에 바로 활용하기 어려움`);
  const focus = humanizeSourcePhrase(page.lessonFocus || `${service}의 기초와 실제 활용`);
  const method = humanizeSourcePhrase(page.lessonMethod || "현재 실력에 맞춰 설명하고 직접 연습한 뒤 다시 복습합니다.");
  const result = humanizeSourcePhrase(page.lessonResult || "배운 내용을 필요한 상황에서 자신의 말과 풀이로 활용합니다.");
  return {
    province: page.province,
    city: page.region,
    region: location,
    target: page.target,
    audience,
    service,
    intent,
    concern,
    focus,
    method,
    result,
    tone: page.tone,
  };
}

function makeDescription(page, context) {
  const templateType = normalizeContentTemplate(page);
  const patterns = HERO_SECOND_SENTENCES[templateType];
  const hash = stableHash(page.slug);
  const detailHash = stableHash(`${page.slug}|hero-detail`);
  const lessonName = [page.target, context.service].filter(Boolean).join(" ");
  const opening = HERO_OPENING_PATTERNS[hash % HERO_OPENING_PATTERNS.length]({ region: context.city, lessonName });
  return `${opening} ${patterns[detailHash % patterns.length]}`;
}

function makeQuestionHeading(page, context) {
  const type = normalizeContentTemplate(page);
  if (type === "exam") return `${context.service} 준비는 어떤 순서로 진행해야 할까요?`;
  if (type === "business") return `업무에 필요한 ${context.service} 수업은 어떻게 진행될까요?`;
  if (type === "travel") return `여행 전에 ${context.service}에서 무엇을 준비하면 좋을까요?`;
  return `${context.service} 수업에서는 무엇을 먼저 연습할까요?`;
}

function makeFaqs(page, context) {
  const generated = page.intelligence.faqs;
  return generated.map((faq, index) => ({
    question: firstValue(page, `faq_question_${index + 1}`) || faq.question,
    answer: firstValue(page, `faq_answer_${index + 1}`) || faq.answer,
  }));
}

function templateLabel(type) {
  return ({ conversation: "회화", exam: "시험 대비", business: "비즈니스", travel: "여행 회화" })[type] || "맞춤 수업";
}

function processHtml(type) {
  return (PROCESS_STEPS[type] || PROCESS_STEPS.conversation)
    .map(([title, description]) => `<article class="process-step"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></article>`)
    .join("");
}

function lessonSummaryHtml(page, context) {
  const audience = page.target || `${context.service} 수업을 찾는 분`;
  const points = [
    `<strong>이런 분께:</strong> ${escapeHtml(`${page.region}에서 ${audience} 수업을 알아보는 분`)}`,
    `<strong>수업 기준:</strong> ${escapeHtml(`${context.service}의 현재 실력과 실제 사용 목적`)}`,
    `<strong>자주 듣는 고민:</strong> ${escapeHtml(context.concern)}`,
    `<strong>함께 연습할 내용:</strong> ${escapeHtml(context.focus)}`,
    `<strong>수업 방법:</strong> ${escapeHtml(context.method)}`,
  ];
  return `<section class="section lesson-summary-section" aria-labelledby="lesson-summary-title"><div class="container"><div class="lesson-summary"><p class="section-kicker">수업 상담 요약</p><h2 id="lesson-summary-title">${escapeHtml(page.region)} ${escapeHtml(context.service)}, 내 상황에도 맞을까요?</h2><p>${escapeHtml(page.intelligence.intro)}</p><ul>${points.map((point) => `<li>${point}</li>`).join("")}</ul></div></div></section>`;
}

/** 페이지마다 선택된 예시를 실제 수업 장면으로 보여줍니다. */
function examplesHtml(page, context) {
  const examples = page.intelligence.examples
    .map((example, index) => `<article class="panel"><div class="panel-icon">${String(index + 1).padStart(2, "0")}</div><h3>${escapeHtml(context.service)} 활용 예시 ${index + 1}</h3><p>${escapeHtml(example)}</p></article>`)
    .join("");
  return `<section class="section content-examples" aria-labelledby="content-examples-title"><div class="container"><div class="section-heading"><p class="section-kicker">수업 활용 예시</p><h2 id="content-examples-title">${escapeHtml(page.region)} ${escapeHtml(context.service)} 수업에서는 무엇을 연습하나요?</h2><p class="section-intro">학습 목적과 주제에 맞춰 실제로 적용할 수 있는 장면을 선택합니다.</p></div><div class="management-grid">${examples}</div></div></section>`;
}

function pickRepresentative(pages, predicate) {
  return pages.find(predicate) || pages[0];
}

function pickFeaturedPages(pages) {
  const limits = { conversation: 6, exam: 6, business: 3, travel: 3 };
  const result = [];
  for (const [type, limit] of Object.entries(limits)) {
    const regions = new Set();
    for (const page of pages) {
      if (page.contentTemplate !== type || regions.has(page.region)) continue;
      regions.add(page.region);
      result.push(page);
      if (regions.size >= limit) break;
    }
  }
  return result;
}

function duplicateCount(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

/** pages.csv를 한 번 읽어 모든 빌드 단계가 함께 사용할 페이지 데이터로 만듭니다. */
function loadPages() {
  for (const requiredFile of [csvPath, templatePath]) {
    if (!fs.existsSync(requiredFile)) throw new Error(`필요한 파일을 찾을 수 없습니다: ${requiredFile}`);
  }

  const csvText = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const [headerRow, ...dataRows] = parseCsv(csvText);
  const headers = headerRow.map((header) => header.trim());
  if (!headers.includes("slug")) throw new Error("pages.csv에 slug 열이 없습니다.");

  const pages = dataRows
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()])))
    .map(normalizePage)
    .filter((page) => page.status.toLowerCase() === "publish")
    .map((page) => {
      validateFinalContent(page);
      const content = makeContentContext(page);
      const contentTemplate = normalizeContentTemplate(page);
      const generatedDescription = makeDescription(page, content);
      const preparedPage = {
        ...page,
        content,
        contentTemplate,
        description: generatedDescription,
        h1: page.keyword || page.title,
      };
      return { ...preparedPage, intelligence: createPageContent(preparedPage, content) };
    });

  const ids = new Set();
  const slugs = new Set();
  for (const page of pages) {
    if (ids.has(page.id)) throw new Error(`중복 id가 있습니다: ${page.id}`);
    if (slugs.has(page.slug.toLowerCase())) throw new Error(`중복 slug가 있습니다: ${page.slug}`);
    ids.add(page.id);
    slugs.add(page.slug.toLowerCase());
  }

  return {
    pages,
    template: fs.readFileSync(templatePath, "utf8"),
    // CSV의 과거 domain 값과 관계없이 현재 운영 주소를 사용합니다.
    baseUrl: makeBaseUrl(productionUrl),
    duplicateResults: {
      title: duplicateCount(pages.map((page) => page.title)),
      description: duplicateCount(pages.map((page) => page.description)),
      h1: duplicateCount(pages.map((page) => page.h1)),
    },
  };
}

/** 지역별 페이지와 메인페이지만 생성합니다. */
function generatePages({ outputPath, data = loadPages(), pageSlugs = null, generateHome = true }) {
  const { pages, template, baseUrl } = data;
  fs.mkdirSync(outputPath, { recursive: true });

const selectedPages = pageSlugs ? pages.filter((page) => pageSlugs.has(page.slug)) : pages;
for (const [index, page] of selectedPages.entries()) {
  const context = page.content;
  const faqs = makeFaqs(page, context);
  const faqHtml = faqs.map((faq, faqIndex) => `<details class="faq-item"${faqIndex === 0 ? " open" : ""}><summary><h3>${escapeHtml(faq.question)}</h3></summary><div class="faq-answer"><p>${escapeHtml(faq.answer)}</p></div></details>`).join("");
  const lessonSummary = lessonSummaryHtml(page, context);
  const lessonExamples = examplesHtml(page, context);
  const canonicalUrl = `${baseUrl}/${page.slug}/`;
  const directAnswer = page.intelligence.intro;
  const categoryName = templateLabel(page.contentTemplate);
  const locationName = [page.province, page.region].filter(Boolean).join(" ");
  const breadcrumbItems = [{ "@type": "ListItem", position: 1, name: "홈", item: `${baseUrl}/` }];
  if (page.province) breadcrumbItems.push({ "@type": "ListItem", position: 2, name: page.province });
  breadcrumbItems.push({ "@type": "ListItem", position: breadcrumbItems.length + 1, name: page.title, item: canonicalUrl });
  const breadcrumbMiddle = page.province ? `<li>${escapeHtml(page.province)}</li>` : "";
  const structuredData = makePageSchema({ canonicalUrl, page, locationName, context, baseUrl, faqs, breadcrumbItems });
  const contactUrl = "/#consultation";
  const eyebrow = [page.province, page.region, page.target || "전체 대상", categoryName].filter(Boolean).map(escapeHtml).join(" · ");
  const pageAsset = resolvePageAsset(page, root);
  const pageAssetAlt = `${page.region} ${page.subject} 맞춤 수업 안내`;
  const pageMedia = renderImageBox(pageAsset, `page-hero-media asset-${pageAsset.key}`, { alt: pageAssetAlt });
  const main = `<section class="hero"><div class="container"><nav class="breadcrumb" aria-label="현재 위치"><ol><li><a href="/">홈</a></li>${breadcrumbMiddle}<li aria-current="page">${escapeHtml(page.title)}</li></ol></nav><div class="hero-layout"><div><p class="eyebrow">${eyebrow}</p><h1>${escapeHtml(page.h1)}</h1><p class="lead">${escapeHtml(page.description)}</p><div class="hero-actions"><a class="button" href="${contactUrl}">${escapeHtml(page.intelligence.cta.label)}</a><a class="button button-secondary" href="#process">수업 진행 방법 보기</a></div></div><aside class="hero-panel" aria-label="수업 신뢰 정보">${pageMedia}<h2>${escapeHtml(page.region)} ${escapeHtml(context.service)} 수업 전 확인할 내용</h2><ul class="trust-list"><li>1:1 개별 맞춤</li><li>현재 수준에 맞춘 수업</li><li>회화·시험 목적별 관리</li><li>무료 테스트 수업</li></ul></aside></div></div></section>
  ${lessonSummary}
  <section class="info-strip" aria-label="핵심 수업 정보"><div class="container info-grid"><article class="info-card"><p class="number">01</p><h2>${escapeHtml(page.region)} 추천 대상</h2><p>${escapeHtml(context.intent)}</p></article><article class="info-card"><p class="number">02</p><h2>${escapeHtml(context.service)}에서 배우는 내용</h2><p>${escapeHtml(context.focus)}</p></article><article class="info-card"><p class="number">03</p><h2>${escapeHtml(context.service)} 수업 방법</h2><p>${escapeHtml(context.method)}</p></article><article class="info-card"><p class="number">04</p><h2>${escapeHtml(context.service)} 수업 후 활용</h2><p>${escapeHtml(context.result)}</p></article></div></section>
  <section class="section" id="overview"><div class="container"><div class="section-heading"><p class="section-kicker">수업이 필요한 이유</p><h2>${escapeHtml(makeQuestionHeading(page, context))}</h2></div><div class="answer-box reading" aria-label="수업에 대한 상담 답변"><p class="answer-label">상담에서 드리는 답변</p><p>${escapeHtml(directAnswer)}</p><p>${escapeHtml(context.intent)}</p></div></div></section>
  <section class="section section-soft" id="process"><div class="container"><div class="section-heading"><p class="section-kicker">4단계 수업 과정</p><h2>${escapeHtml(page.region)} ${escapeHtml(context.service)} 수업은 어떻게 진행되나요?</h2><p class="section-intro">${escapeHtml(page.intelligence.lesson)}</p></div><div class="process-grid">${processHtml(page.contentTemplate)}</div><div class="mid-cta"><div><h2>${escapeHtml(page.intelligence.cta.title)}</h2><p>${escapeHtml(page.intelligence.cta.text)}</p></div><a class="button" href="${contactUrl}">${escapeHtml(page.intelligence.cta.label)}</a></div></div></section>
  <section class="section" id="management"><div class="container"><div class="section-heading"><p class="section-kicker">${escapeHtml(categoryName)} 수업 관리</p><h2>${escapeHtml(page.region)} ${escapeHtml(context.service)}, 수업에서는 이렇게 살펴봅니다</h2><p class="section-intro">${escapeHtml(page.intelligence.benefit)}</p></div><div class="management-grid"><article class="panel"><div class="panel-icon">01</div><h3>요즘 가장 어려운 부분</h3><p>${escapeHtml(context.concern)}</p></article><article class="panel"><div class="panel-icon">02</div><h3>수업에서 함께 다룰 내용</h3><p>${escapeHtml(context.focus)}</p></article><article class="panel"><div class="panel-icon">03</div><h3>배우고 다시 써보는 방법</h3><p>${escapeHtml(context.method)} ${escapeHtml(context.result)}</p></article></div></div></section>
  ${lessonExamples}
  <section class="section section-soft" id="fit"><div class="container"><div class="section-heading"><p class="section-kicker">추천 대상</p><h2>${escapeHtml(page.region)} ${escapeHtml(context.service)}, 이런 분께 추천합니다</h2></div><ul class="fit-list"><li>${escapeHtml(context.intent)}</li><li>${escapeHtml(context.concern)}</li><li>${escapeHtml(context.focus)} 내용이 필요한 분</li><li>${escapeHtml(context.result)} 변화를 원하는 분</li></ul></div></section>
  <section class="section section-soft" id="faq"><div class="container"><div class="section-heading"><p class="section-kicker">자주 묻는 질문</p><h2>${escapeHtml(page.region)} ${escapeHtml(context.service)} 수업 전 자주 묻는 질문</h2></div><div class="faq-list">${faqHtml}</div>${page.updated_at ? `<p class="updated">마지막 내용 확인: ${escapeHtml(page.updated_at)}</p>` : ""}</div></section>
  <section class="section" id="consultation"><div class="container"><div class="cta"><h2>${escapeHtml(firstValue(page, "cta_title") || page.intelligence.cta.title)}</h2><p>${escapeHtml(firstValue(page, "cta_text") || page.intelligence.cta.text)}</p><a class="button" href="${contactUrl}">${escapeHtml(page.intelligence.cta.label)}</a></div></div></section>
  `;
  const html = renderTemplate(template, {
    ...brandTemplateValues(page, baseUrl),
    LANG: escapeHtml(page.language), TITLE: escapeHtml(page.title), DESCRIPTION: escapeHtml(page.description),
    CANONICAL_URL: escapeHtml(canonicalUrl), STRUCTURED_DATA: structuredData,
    NAV_LINK: "/#lessons", NAV_TEXT: "다른 지역 보기", MAIN: main,
    MOBILE_CONTACT_URL: contactUrl,
    FOOTER_LINK: "/", FOOTER_TEXT: "메인으로 돌아가기",
  });
  const pageFolder = path.join(outputPath, page.slug);
  fs.mkdirSync(pageFolder, { recursive: true });
  fs.writeFileSync(path.join(pageFolder, "index.html"), html, "utf8");
  if ((index + 1) % 500 === 0) console.log(`진행: ${index + 1}개 생성`);
}

if (!generateHome) return data;

const englishPage = pickRepresentative(pages, (page) => page.contentTemplate === "conversation" && /영어/.test(page.detailKeyword));
const japanesePage = pickRepresentative(pages, (page) => page.contentTemplate === "conversation" && /일본어/.test(page.detailKeyword));
const examPage = pickRepresentative(pages, (page) => page.contentTemplate === "exam");
const businessPage = pickRepresentative(pages, (page) => page.contentTemplate === "business");
const categoryCards = [["영어회화", "일상과 여행에서 필요한 영어 말하기를 현재 수준부터 연습합니다.", englishPage, englishImage], ["일본어회화", "글자와 기초 표현부터 상황별 일본어 대화를 연결합니다.", japanesePage, japaneseImage], ["시험 대비", "목표와 현재 수준을 확인하고 영역별 학습과 오답 관리를 진행합니다.", examPage, examImage], ["비즈니스", "회의와 이메일 등 실제 업무에 필요한 표현을 목적에 맞춰 연습합니다.", businessPage, businessImage]].map(([title, description, page, image]) => `<a class="category-card" href="/${page.slug}/">${renderImageBox(image, "image-box-square")}<div class="category-card-body"><p class="card-meta">대표 수업</p><h3>${title}</h3><p>${description}</p><span class="text-link">대표 수업 보기 →</span></div></a>`).join("");
const reviewCardsHtml = reviews.map((review, index) => `<article class="review-card" data-review-slide data-review-id="${escapeHtml(review.id)}" role="group" aria-roledescription="슬라이드" aria-label="${index + 1} / ${reviews.length}"><div class="review-rating" aria-label="5점 만점에 ${review.rating}점"><span aria-hidden="true">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span></div><div class="review-person"><strong>${escapeHtml(review.name)} · ${escapeHtml(review.role)}</strong><span>${escapeHtml(review.category)}</span></div><blockquote><p>${escapeHtml(review.review)}</p></blockquote></article>`).join("");
const reviewCarouselHtml = `<section class="section reviews-section" aria-labelledby="reviews-title" data-review-carousel><div class="container"><div class="review-carousel-heading"><div class="section-heading"><p class="section-kicker">수강 후기</p><h2 id="reviews-title">학습자가 전하는 수업 이야기</h2><p class="section-intro">각자의 목표에 맞춰 수업을 진행하며 느낀 점을 확인해 보세요.</p></div><div class="review-carousel-controls" role="group" aria-label="후기 이동"><button class="review-arrow" type="button" data-review-prev aria-label="이전 후기" aria-controls="review-carousel-viewport"><span aria-hidden="true">←</span></button><button class="review-arrow" type="button" data-review-next aria-label="다음 후기" aria-controls="review-carousel-viewport"><span aria-hidden="true">→</span></button></div></div><div class="review-carousel-viewport" id="review-carousel-viewport" role="region" aria-roledescription="캐러셀" aria-label="수강 후기 11개" tabindex="0"><div class="review-carousel-track" data-review-track>${reviewCardsHtml}</div></div><div class="review-carousel-dots" data-review-dots role="group" aria-label="후기 슬라이드 선택"></div><p class="sr-only" data-review-status aria-live="polite" aria-atomic="true"></p></div></section>`;
const homeFaqs = [{ question: "처음 배우는 사람도 수업을 시작할 수 있나요?", answer: "네. 알고 있는 내용부터 짧게 살펴보고 기초 표현이나 개념부터 수업을 시작합니다." }, { question: "회화와 시험 대비 수업은 어떻게 다른가요?", answer: "회화는 듣고 직접 말하는 시간을 충분히 가지며, 시험 대비는 영역별 개념과 문제 풀이 및 오답 습관을 함께 다룹니다." }, { question: "상담할 때 무엇을 알려주면 되나요?", answer: "배우려는 과목과 현재 실력, 원하는 사용 장면이나 시험일, 가능한 시간을 편하게 말씀해 주세요." }];
const homeFaqHtml = homeFaqs.map((faq, index) => `<details class="faq-item"${index === 0 ? " open" : ""}><summary><h3>${faq.question}</h3></summary><div class="faq-answer"><p>${faq.answer}</p></div></details>`).join("");
const homeContactUrl = "#consultation";
const consultationFormHtml = `<section class="section home-cta-section consultation-section" id="consultation" aria-labelledby="consultation-title"><div class="container consultation-shell"><div class="consultation-heading"><p class="cta-kicker">무료 상담 신청</p><h2 id="consultation-title">나에게 맞는 수업,<br>무료 상담으로 시작해보세요.</h2><p>희망하는 수업과 현재 고민을 남겨주시면<br>확인 후 순차적으로 연락드리겠습니다.</p></div><form class="consultation-form-card" method="POST" name="consultation" data-netlify="true" netlify-honeypot="bot-field" action="/" data-consultation-form novalidate><input type="hidden" name="form-name" value="consultation"><input type="hidden" name="bot-field"><input type="hidden" name="sourcePage" value="/"><input type="hidden" name="submittedAt" value=""><div class="form-field"><label for="consultation-phone">연락처 <span class="required-mark" aria-hidden="true">*</span></label><input id="consultation-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required pattern="01[016789]-?[0-9]{3,4}-?[0-9]{4}" placeholder="연락받을 번호를 입력해 주세요" aria-describedby="consultation-phone-error"><p class="form-error" id="consultation-phone-error" data-error-for="phone" aria-live="polite"></p></div><div class="form-field"><label for="consultation-lesson">희망 수업 <span class="required-mark" aria-hidden="true">*</span></label><select id="consultation-lesson" name="lesson" required aria-describedby="consultation-lesson-error"><option value="">희망 수업을 선택해 주세요</option><option value="영어회화">영어회화</option><option value="비즈니스 영어">비즈니스 영어</option><option value="초등 영어">초등 영어</option><option value="중등 영어">중등 영어</option><option value="고등 영어">고등 영어</option><option value="TOEIC">TOEIC</option><option value="TOEIC Speaking">TOEIC Speaking</option><option value="OPIC">OPIC</option><option value="IELTS">IELTS</option><option value="TOEFL">TOEFL</option><option value="일본어회화">일본어회화</option><option value="JLPT">JLPT</option><option value="JPT">JPT</option><option value="기타">기타</option></select><p class="form-error" id="consultation-lesson-error" data-error-for="lesson" aria-live="polite"></p></div><div class="form-field"><label for="consultation-message">문의 내용 <span class="required-mark" aria-hidden="true">*</span></label><textarea id="consultation-message" name="message" required placeholder="현재 고민, 학습 목표, 희망하는 수업 내용을 간단히 적어주세요." aria-describedby="consultation-message-error"></textarea><p class="form-error" id="consultation-message-error" data-error-for="message" aria-live="polite"></p></div><div class="form-field privacy-field"><label class="privacy-label" for="consultation-privacy"><input id="consultation-privacy" name="privacyConsent" type="checkbox" value="동의" required aria-describedby="consultation-privacy-error"><span>상담 진행을 위해 연락처, 희망 수업, 문의 내용을 수집합니다.<br>수집된 정보는 상담 목적으로만 사용되며 내부 정책에 따라 파기됩니다.</span></label><p class="form-error" id="consultation-privacy-error" data-error-for="privacyConsent" aria-live="polite"></p></div><button class="button button-primary consultation-submit" type="submit" data-submit-button>무료 상담 신청하기</button><div class="form-status" data-form-status role="status" aria-live="polite" tabindex="-1"></div></form></div></section>`;
const homeMain = `<section class="hero home-hero"><div class="container home-hero-layout"><div class="home-hero-copy"><p class="eyebrow">전국 지역별 1:1 맞춤 수업</p><h1 aria-label="기초회화부터 자격증 대비까지! 1:1 맞춤 전문 수업"><span class="hero-title-line">기초회화부터</span><span class="hero-title-line">자격증 대비까지!</span><span class="hero-title-line hero-title-emphasis">1:1 맞춤</span><span class="hero-title-line">전문 수업</span></h1><p class="lead">영어·일본어 기초회화부터 TOEIC, OPIC, IELTS, TOEFL, JLPT까지, 현재 실력과 학습 목표에 맞춰 1:1 맞춤 수업으로 진행합니다.</p><div class="hero-actions"><a class="button" href="#lessons">지역별 수업 찾기</a><a class="button button-secondary" href="${homeContactUrl}">상담 신청하기</a></div></div>${renderPicture({ desktop: heroAssets.desktop, mobile: heroAssets.mobile, className: "image-box-hero", alt: heroAssets.desktop.alt })}</div></section>
<section class="section home-categories" id="lessons" aria-labelledby="category-title"><div class="container"><div class="section-heading"><p class="section-kicker">수업 종류</p><h2 id="category-title">어떤 수업을 찾고 있나요?</h2><p class="section-intro">배우려는 목적에 가까운 수업부터 확인해 보세요.</p></div><div class="category-grid">${categoryCards}</div></div></section>
<section class="section home-features" aria-labelledby="feature-title"><div class="container"><div class="section-heading"><p class="section-kicker">수업 특징</p><h2 id="feature-title">사람마다 다른 출발점에서 시작합니다</h2><p class="section-intro">같은 과목이라도 배우는 이유와 어려운 부분은 다릅니다. 현재 실력에 맞게 수업 내용과 연습량을 정합니다.</p></div><div class="home-feature-grid"><article class="feature-card">${renderImageBox(featurePersonal, "image-box-feature")}<h3>1:1 맞춤 수업</h3><p>잘하는 부분은 빠르게 지나가고 막히는 부분에는 충분한 시간을 씁니다.</p></article><article class="feature-card">${renderImageBox(featurePersonal, "image-box-feature")}<h3>개인별 수업 구성</h3><p>회화, 시험, 업무 등 실제로 필요한 장면에 맞춰 배울 내용을 고릅니다.</p></article><article class="feature-card">${renderImageBox(featureNationwide, "image-box-feature")}<h3>20년 이상 전문 강사진</h3><p>오랜 수업 경험을 바탕으로 지금 고쳐야 할 부분을 구체적으로 짚어드립니다.</p></article><article class="feature-card">${renderImageBox(featureManagement, "image-box-feature")}<h3>수업과 복습 관리</h3><p>수업에서 어려웠던 부분을 기록하고 다음 시간에 다시 써보며 익힙니다.</p></article><article class="feature-card">${renderImageBox(featureLevelTest, "image-box-feature")}<h3>무료 레벨 테스트</h3><p>현재 할 수 있는 부분과 보완할 부분을 확인해 첫 수업 내용을 정합니다.</p></article></div></div></section>
<section class="section section-soft home-process-section" id="process"><div class="container"><div class="section-heading"><p class="section-kicker">수업 진행 과정</p><h2>수업은 네 단계로 진행됩니다</h2><p class="section-intro">상담부터 복습까지 필요한 과정을 차례대로 이어갑니다.</p></div><div class="process-grid"><article class="process-step"><span class="process-number">01</span>${renderImageBox(processLevelTest, "image-box-icon")}<h3>수준과 목표 확인</h3><p>배우려는 이유와 현재 어려움을 먼저 확인합니다.</p></article><article class="process-step"><span class="process-number">02</span>${renderImageBox(processPlan, "image-box-icon")}<h3>개인별 방향 설정</h3><p>목표에 필요한 학습 내용과 순서를 정합니다.</p></article><article class="process-step"><span class="process-number">03</span>${renderImageBox(processLesson, "image-box-icon")}<h3>설명과 실전 연습</h3><p>필요한 내용을 배우고 직접 사용해 봅니다.</p></article><article class="process-step"><span class="process-number">04</span>${renderImageBox(processFeedback, "image-box-icon")}<h3>피드백과 복습</h3><p>어려웠던 부분을 점검하고 다시 연습합니다.</p></article></div></div></section>
<section class="section section-soft level-test-section" aria-labelledby="level-test-title"><div class="container"><div class="cta cta-layout level-test-cta"><div class="cta-content"><p class="cta-kicker">무료 레벨 테스트</p><h2 id="level-test-title">내 실력에서 어떤 수업이 맞는지 궁금하신가요?</h2><p>배우려는 이유와 어려운 부분을 들은 뒤 첫 수업에서 무엇을 배울지 말씀드립니다.</p><a class="button button-light" href="${homeContactUrl}">무료 레벨 테스트 신청</a></div>${renderImageBox(levelTestCtaImage, "image-box-cta")}</div></div></section>
${reviewCarouselHtml}
<section class="section home-faq" id="faq"><div class="container faq-layout"><div class="section-heading"><p class="section-kicker">FAQ</p><h2>수업을 찾기 전에 확인해 보세요</h2><p class="section-intro">자주 궁금해하는 내용을 먼저 정리했습니다.</p></div><div class="faq-list">${homeFaqHtml}</div></div></section>
${consultationFormHtml}`;
const homeHtml = renderTemplate(template, {
  ...brandTemplateValues(null, baseUrl),
  LANG: "ko", TITLE: "맞춤 회화 과외 | 지역별 일대일 수업",
  DESCRIPTION: "현재 실력과 배우는 목적에 맞춘 영어·일본어 1:1 수업을 지역별로 찾아볼 수 있습니다.",
  CANONICAL_URL: escapeHtml(`${baseUrl}/`),
  STRUCTURED_DATA: makeJsonLd({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "김선생 회화 과외", url: `${baseUrl}/`, inLanguage: "ko" }, { "@type": "Organization", name: "김선생 회화 과외", url: `${baseUrl}/` }, { "@type": "FAQPage", mainEntity: homeFaqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) }] }),
  NAV_LINK: "#lessons", NAV_TEXT: "수업 지역 보기", MAIN: homeMain,
  MOBILE_CONTACT_URL: homeContactUrl,
  FOOTER_LINK: "#lessons", FOOTER_TEXT: "상담 신청은 버튼을 이용해 주세요.",
});
  fs.writeFileSync(path.join(outputPath, "index.html"), homeHtml, "utf8");
  return data;
}

module.exports = {
  brandTemplateValues,
  escapeHtml,
  generatePages,
  loadPages,
  renderTemplate,
};
