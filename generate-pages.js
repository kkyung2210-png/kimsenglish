// Node.js에 기본 포함된 기능만 사용하므로 별도 설치 항목이 없습니다.
const fs = require("fs");
const path = require("path");

// 원본, 템플릿, 디자인, 생성 결과의 위치를 한곳에서 관리합니다.
const root = __dirname;
const csvPath = path.join(root, "pages.csv");
const templatePath = path.join(root, "templates", "page.html");
const stylePath = path.join(root, "assets", "style.css");
const outputPath = path.join(root, "dist");
const temporaryOutputPath = path.join(root, ".dist-building");

// 쉼표와 큰따옴표가 포함된 셀도 읽을 수 있는 CSV 해석 함수입니다.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

// CSV 값을 안전하게 HTML에 넣어 예상치 못한 태그 실행을 막습니다.
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

// 주소에는 영문, 숫자, 하이픈만 허용해 잘못된 폴더 생성을 막습니다.
function normalizeSlug(value) {
  const slug = String(value || "").trim().replace(/^\/+|\/+$/g, "").replace(/^pages\//i, "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(slug)) {
    throw new Error(`사용할 수 없는 slug입니다: ${slug}`);
  }
  return slug;
}

// 하나의 공통 HTML 템플릿에서 표시 이름이 같은 자리를 모두 바꿉니다.
function renderTemplate(template, values) {
  return template.replace(/{{([A-Z0-9_]+)}}/g, (match, key) => {
    if (!(key in values)) throw new Error(`템플릿 값이 없습니다: ${key}`);
    return values[key];
  });
}

// 도메인 입력에 https가 빠져 있어도 올바른 주소로 바꿉니다.
function makeBaseUrl(domain) {
  const cleanDomain = String(domain || "https://kimsenglish-kr.netlify.app").trim().replace(/\/$/, "");
  return /^https?:\/\//i.test(cleanDomain) ? cleanDomain : `https://${cleanDomain}`;
}

// 필수 원본 파일이 빠졌다면 생성 전에 이해하기 쉬운 오류를 냅니다.
for (const requiredFile of [csvPath, templatePath, stylePath]) {
  if (!fs.existsSync(requiredFile)) throw new Error(`필요한 파일을 찾을 수 없습니다: ${requiredFile}`);
}

// CSV의 첫 줄을 열 이름으로 사용해 각 행을 이름표가 있는 데이터로 변환합니다.
const csvText = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
const [headerRow, ...dataRows] = parseCsv(csvText);
const headers = headerRow.map((header) => header.trim());
const requiredColumns = ["id", "domain", "slug", "status", "language", "region", "subject", "target", "keyword", "title", "description"];
const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
if (missingColumns.length) throw new Error(`pages.csv에 필요한 열이 없습니다: ${missingColumns.join(", ")}`);

// publish 행만 선택하며, 나중에 새 열을 추가해도 기존 코드는 그대로 작동합니다.
const pages = dataRows
  .map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()])))
  .filter((page) => page.status.toLowerCase() === "publish")
  .map((page) => ({ ...page, slug: normalizeSlug(page.slug) }));

// 5,000개 이상일 때도 서로 덮어쓰지 않도록 중복 ID와 주소를 미리 검사합니다.
const ids = new Set();
const slugs = new Set();
for (const page of pages) {
  if (ids.has(page.id)) throw new Error(`중복 id가 있습니다: ${page.id}`);
  if (slugs.has(page.slug.toLowerCase())) throw new Error(`중복 slug가 있습니다: ${page.slug}`);
  ids.add(page.id);
  slugs.add(page.slug.toLowerCase());
}

const template = fs.readFileSync(templatePath, "utf8");
const baseUrl = makeBaseUrl(pages.find((page) => page.domain)?.domain);

// 완성 전 결과가 배포되지 않도록 임시 폴더에 모두 만든 뒤 한 번에 교체합니다.
fs.rmSync(temporaryOutputPath, { recursive: true, force: true });
fs.mkdirSync(temporaryOutputPath, { recursive: true });
fs.copyFileSync(stylePath, path.join(temporaryOutputPath, "style.css"));

// 지역별 본문은 CSV의 선택 입력을 우선 사용하고, 비어 있으면 자연스러운 기본 문장을 사용합니다.
for (const [index, page] of pages.entries()) {
  const region = escapeHtml(page.region);
  const subject = escapeHtml(page.subject);
  const target = escapeHtml(page.target);
  const heading = escapeHtml(page.keyword || page.title);
  const description = escapeHtml(page.description);
  const contactUrl = escapeHtml(page.contact_url || "#consultation");
  const intro = escapeHtml(page.intro || `${page.region}에서 ${page.subject} 회화를 배우고 싶은 ${page.target} 학습자를 위한 일대일 맞춤 과외입니다. 현재 실력과 학습 목적을 먼저 확인해 편안한 속도로 진행합니다.`);
  const benefits = [
    page.benefit_1 || `${page.subject} 회화를 기초부터 차근차근 배우고 싶은 ${page.target} 학습자`,
    page.benefit_2 || "여행이나 일상에서 바로 쓸 수 있는 표현이 필요한 분",
    page.benefit_3 || "자신의 속도와 목표에 맞춘 수업을 원하는 분",
  ].map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join("");

  const main = `<section class="hero"><div class="container"><p class="eyebrow">${region} · ${target} · ${subject}</p><h1>${heading}</h1><p class="lead">${description}</p><a class="button" href="${contactUrl}">상담 신청하기</a></div></section>
  <section class="section"><div class="container content"><h2>${region}에서 시작하는 ${subject} 회화 수업</h2><p>${intro}</p><p>실제 상황에서 자연스럽게 말하는 연습에 집중합니다. 자주 쓰는 표현을 직접 말하고 부족한 부분을 천천히 반복합니다.</p><h2>이런 분께 잘 맞습니다</h2><ul class="check-list">${benefits}</ul><h2>수업 진행 방법</h2><p>첫 상담에서 현재 수준과 목표, 가능한 시간을 확인한 뒤 ${region} ${target} 학습자에게 맞는 ${subject} 회화 학습 방향을 정합니다.</p></div></section>
  <section class="section section-soft" id="consultation"><div class="container"><div class="cta"><h2>${escapeHtml(page.cta_title || `${page.region} ${page.subject} 과외가 궁금하신가요?`)}</h2><p>${escapeHtml(page.cta_text || "상담 신청은 버튼을 이용해 주세요.")}</p><a class="button" href="${contactUrl}">상담 신청하기</a></div></div></section>`;

  const html = renderTemplate(template, {
    LANG: escapeHtml(page.language || "ko"),
    TITLE: escapeHtml(page.title),
    DESCRIPTION: description,
    CANONICAL_URL: escapeHtml(`${baseUrl}/${page.slug}/`),
    NAV_LINK: "/#lessons",
    NAV_TEXT: "다른 지역 보기",
    MAIN: main,
    FOOTER_LINK: "/",
    FOOTER_TEXT: "메인으로 돌아가기",
  });

  const pageFolder = path.join(temporaryOutputPath, page.slug);
  fs.mkdirSync(pageFolder, { recursive: true });
  fs.writeFileSync(path.join(pageFolder, "index.html"), html, "utf8");
  if ((index + 1) % 500 === 0) console.log(`진행: ${index + 1}개 생성`);
}

// 메인페이지 링크 목록도 CSV의 모든 공개 행을 이용해 자동으로 만듭니다.
const cards = pages.map((page) => `<article class="card"><p class="card-meta">${escapeHtml(page.region)} · ${escapeHtml(page.subject)}</p><h2>${escapeHtml(page.title)}</h2><p>${escapeHtml(page.description)}</p><a class="text-link" href="/${page.slug}/">자세히 보기 →</a></article>`).join("\n");
const homeMain = `<section class="hero"><div class="container"><p class="eyebrow">나에게 맞는 일대일 회화 수업</p><h1>부담 없이 시작하는 맞춤 회화 과외</h1><p class="lead">현재 실력과 목표에 맞춰 실제로 쓸 수 있는 표현을 차근차근 연습합니다.</p><a class="button" href="#lessons">지역별 수업 보기</a></div></section>
<section class="section" id="lessons"><div class="container"><h2 class="section-title">지역별 수업 안내</h2><p class="section-intro">현재 공개된 ${pages.length.toLocaleString("ko-KR")}개 수업을 확인해 보세요.</p><div class="grid">${cards}</div></div></section>`;
const homeHtml = renderTemplate(template, {
  LANG: "ko",
  TITLE: "맞춤 회화 과외 | 지역별 일대일 수업",
  DESCRIPTION: "지역과 학습 목표에 맞춘 성인 영어·일본어 회화 과외를 안내합니다.",
  CANONICAL_URL: escapeHtml(`${baseUrl}/`),
  NAV_LINK: "#lessons",
  NAV_TEXT: "수업 지역 보기",
  MAIN: homeMain,
  FOOTER_LINK: "#lessons",
  FOOTER_TEXT: "상담 신청은 버튼을 이용해 주세요.",
});
fs.writeFileSync(path.join(temporaryOutputPath, "index.html"), homeHtml, "utf8");

// 사이트맵은 현재 공개된 모든 페이지 주소를 자동으로 포함합니다.
const sitemapEntries = [
  `  <url><loc>${escapeHtml(`${baseUrl}/`)}</loc></url>`,
  ...pages.map((page) => {
    const lastModified = page.updated_at ? `<lastmod>${escapeHtml(page.updated_at)}</lastmod>` : "";
    return `  <url><loc>${escapeHtml(`${baseUrl}/${page.slug}/`)}</loc>${lastModified}</url>`;
  }),
];
fs.writeFileSync(path.join(temporaryOutputPath, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.join("\n")}\n</urlset>\n`, "utf8");

// robots.txt는 검색엔진 방문을 허용하고 자동 생성된 사이트맵 위치를 알립니다.
fs.writeFileSync(path.join(temporaryOutputPath, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`, "utf8");

// 모든 파일이 완성된 경우에만 기존 배포 결과를 새 결과로 교체합니다.
fs.rmSync(outputPath, { recursive: true, force: true });
fs.renameSync(temporaryOutputPath, outputPath);

// 예전 최상위 생성 결과는 중복 주소와 GitHub 혼란을 막기 위해 정리합니다.
for (const page of pages) fs.rmSync(path.join(root, page.slug), { recursive: true, force: true });
for (const legacyFile of ["index.html", "style.css", "sitemap.xml", "robots.txt"]) {
  fs.rmSync(path.join(root, legacyFile), { force: true });
}
fs.rmSync(path.join(root, "pages"), { recursive: true, force: true });

console.log(`완료: 공개 페이지 ${pages.length}개를 dist 폴더에 생성했습니다.`);
