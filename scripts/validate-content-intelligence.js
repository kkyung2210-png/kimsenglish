const fs = require("fs");
const path = require("path");
const { loadPages } = require("./generate-pages");
const { loadContentConfig } = require("./content-intelligence");

const root = path.resolve(__dirname, "..");
const sampleSlugs = [
  "anyang-english-conversation",
  "suwon-english-conversation",
  "busan-japanese-conversation",
  "gangneung-toeic",
];

function extract(html, pattern, label) {
  const match = html.match(pattern);
  if (!match) throw new Error(`${label} 값을 HTML에서 찾을 수 없습니다.`);
  return match[1];
}

function duplicateReport(pages, getter) {
  const counts = new Map();
  for (const page of pages) {
    const value = getter(page);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const duplicates = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return { unique: counts.size, duplicates, rate: `${(duplicates / pages.length * 100).toFixed(2)}%` };
}

function validate() {
  const firstBuild = loadPages();
  const secondBuild = loadPages();
  const pageMap = new Map(firstBuild.pages.map((page) => [page.slug, page]));

  for (const slug of sampleSlugs) {
    const page = pageMap.get(slug);
    const repeated = secondBuild.pages.find((item) => item.slug === slug);
    if (!page || !repeated) throw new Error(`샘플 페이지를 찾을 수 없습니다: ${slug}`);
    const html = fs.readFileSync(path.join(root, "dist", slug, "index.html"), "utf8");
    const structuredData = JSON.parse(extract(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/, "JSON-LD"));
    const faqSchema = structuredData["@graph"].find((item) => item["@type"] === "FAQPage");
    const expectedValues = [
      page.intelligence.intro,
      page.intelligence.lesson,
      page.intelligence.benefit,
      page.intelligence.examples[0],
      page.intelligence.faqs[0].question,
      page.intelligence.cta.title,
      page.intelligence.cta.label,
    ];
    const checks = {
      html: expectedValues.every((value) => html.includes(value)),
      deterministic: JSON.stringify(page.intelligence) === JSON.stringify(repeated.intelligence),
      title: extract(html, /<title>(.*?)<\/title>/, "title") === page.title,
      description: extract(html, /<meta name="description" content="(.*?)">/, "description") === page.description,
      canonical: extract(html, /<link rel="canonical" href="(.*?)">/, "canonical") === `${firstBuild.baseUrl}/${slug}/`,
      faqSchema: faqSchema && faqSchema.mainEntity.length === page.intelligence.faqs.length,
      breadcrumb: html.includes('class="breadcrumb"'),
      tokensLeft: /\{\{[a-z_]+\}\}/.test(html),
    };
    if (Object.entries(checks).some(([name, value]) => name === "tokensLeft" ? value : !value)) {
      throw new Error(`${slug} 검증 실패: ${JSON.stringify(checks)}`);
    }
    console.log(`\n[${page.title}]`);
    console.log(`소개: ${page.intelligence.intro}`);
    console.log(`수업: ${page.intelligence.lesson}`);
    console.log(`예시: ${page.intelligence.examples[0]}`);
    console.log(`FAQ: ${page.intelligence.faqs.map((faq) => faq.question).join(" / ")}`);
    console.log(`CTA: ${page.intelligence.cta.label} | ${page.intelligence.cta.title}`);
  }

  const config = loadContentConfig();
  console.log("\n설정 개수:", Object.fromEntries(Object.entries(config).map(([name, templates]) => [name, templates.length])));
  console.log("콘텐츠 중복:", {
    intro: duplicateReport(firstBuild.pages, (page) => page.intelligence.intro),
    lesson: duplicateReport(firstBuild.pages, (page) => page.intelligence.lesson),
    benefit: duplicateReport(firstBuild.pages, (page) => page.intelligence.benefit),
    faqSet: duplicateReport(firstBuild.pages, (page) => page.intelligence.faqs.map((faq) => faq.question).join("|")),
    cta: duplicateReport(firstBuild.pages, (page) => Object.values(page.intelligence.cta).join("|")),
    examples: duplicateReport(firstBuild.pages, (page) => page.intelligence.examples.join("|")),
  });
  console.log("전체 deterministic 검사:", firstBuild.pages.every((page, index) =>
    JSON.stringify(page.intelligence) === JSON.stringify(secondBuild.pages[index].intelligence)) ? "통과" : "실패");
}

if (require.main === module) validate();

module.exports = { validate };
