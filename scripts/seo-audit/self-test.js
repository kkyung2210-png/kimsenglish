const fs = require("fs");
const path = require("path");
const { runSeoAudit } = require("../seo-audit");
const { discoverHtmlFiles, parseDocument } = require("./validators");

const root = path.resolve(__dirname, "..", "..");
const source = path.join(root, "dist");
const fixture = path.join(root, ".audit-test-fixture");
const slugs = ["anyang-english-conversation", "suwon-english-conversation", "busan-japanese-conversation", "gangneung-toeic", "dongducheon-english-conversation"];

function transform(slug, callback) {
  const filePath = path.join(fixture, slug, "index.html");
  fs.writeFileSync(filePath, callback(fs.readFileSync(filePath, "utf8")), "utf8");
}

async function runSelfTest() {
  fs.rmSync(fixture, { recursive: true, force: true });
  fs.mkdirSync(fixture, { recursive: true });
  try {
    fs.copyFileSync(path.join(source, "index.html"), path.join(fixture, "index.html"));
    for (const slug of slugs) fs.cpSync(path.join(source, slug), path.join(fixture, slug), { recursive: true });

    const anyangTitle = (fs.readFileSync(path.join(fixture, slugs[0], "index.html"), "utf8").match(/<title>(.*?)<\/title>/) || [])[1];
    transform(slugs[1], (html) => html.replace(/<title>[\s\S]*?<\/title>/, `<title>${anyangTitle}</title>`));
    transform(slugs[2], (html) => html.replace(/<meta name="description"[^>]*>\s*/i, ""));
    transform(slugs[3], (html) => html.replace("</main>", '<a href="/missing-audit-page/">잘못된 테스트 링크</a></main>'));
    transform(slugs[4], (html) => html.replace("</main>", '<img src="data:image/svg+xml,%3Csvg/%3E" alt="" width="10" height="10"><p>{{region}}</p></main>').replace(/<h1([^>]*)>([\s\S]*?)<\/h1>/, '<h1$1>$2</h1><h1>중복 H1 테스트</h1>'));
    transform(slugs[0], (html) => html.replace(/<link rel="canonical" href="[^"]+">/, '<link rel="canonical" href="https://kimsenglish.co.kr/wrong-canonical/">'));

    const orphan = "orphan-audit-test";
    fs.cpSync(path.join(source, slugs[0]), path.join(fixture, orphan), { recursive: true });
    transform(orphan, (html) => html.replaceAll(slugs[0], orphan).replace(/<title>[\s\S]*?<\/title>/, "<title>고아 페이지 테스트</title>"));

    const documents = discoverHtmlFiles(fixture).map((filePath) => parseDocument(filePath, fixture));
    const regular = documents.filter((document) => document.pageType === "regular");
    fs.writeFileSync(path.join(fixture, "search-index.json"), JSON.stringify(regular.map((document) => ({ slug: document.slug, title: document.title, keyword: document.title, province: "테스트도", region: "테스트", subject: "테스트", target: "" }))), "utf8");
    fs.writeFileSync(path.join(fixture, "related-index.json"), JSON.stringify(Object.fromEntries(regular.map((document) => [document.slug, { sameRegion: [], sameProvince: [], sameSubject: [], sameTarget: [], sameIntent: [], popularRelated: [] }]))), "utf8");
    fs.writeFileSync(path.join(fixture, "hub-index.json"), JSON.stringify({ province: [], region: [], subject: [], target: [], intent: [], exam: [] }), "utf8");
    const baseUrl = "https://kimsenglish.co.kr";
    fs.writeFileSync(path.join(fixture, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${documents.map((document) => `<url><loc>${baseUrl}${document.urlPath}</loc></url>`).join("")}</urlset>`, "utf8");
    fs.writeFileSync(path.join(fixture, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`, "utf8");

    const result = await runSeoAudit({ root, distPath: fixture, reportsPath: path.join(fixture, "reports"), full: true });
    const codes = new Set([
      ...result.globalIssues.map((item) => item.code),
      ...result.pageReports.flatMap((page) => [...page.errors, ...page.warnings, ...page.info].map((item) => item.code)),
    ]);
    const expected = ["duplicate-title-exact", "description-missing", "broken-internal-link", "image-alt-missing", "h1-multiple", "template-variable-left", "canonical-mismatch", "orphan-page"];
    const missing = expected.filter((code) => !codes.has(code));
    if (missing.length) throw new Error(`SEO Audit 자체 테스트에서 찾지 못한 오류: ${missing.join(", ")}`);
    console.log(`SEO Audit 자체 테스트 통과: ${expected.length}개 문제를 모두 찾았습니다.`);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

if (require.main === module) runSelfTest().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { runSelfTest };
