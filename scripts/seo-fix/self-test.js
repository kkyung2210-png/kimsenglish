const fs = require("fs");
const path = require("path");
const { loadPages } = require("../generate-pages");
const { generateSearchIndex } = require("../generate-search-index");
const { createRelatedIndex, writeRelatedIndex } = require("../generate-related-index");
const { createHubIndex, writeHubIndex } = require("../generate-hub-index");
const { writeSitemap } = require("../copy-static-files");
const { runFix } = require("./fix-runner");
const { hash } = require("./safe-fixes");

async function selfTest() {
  const projectRoot = path.resolve(__dirname, "../..");
  const root = path.join(projectRoot, ".seo-fix-test-fixture");
  const distPath = path.join(root, "dist");
  fs.rmSync(root, { recursive: true, force: true });
  try {
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.copyFileSync(path.join(projectRoot, "config", "seo-audit.config.json"), path.join(root, "config", "seo-audit.config.json"));
    fs.copyFileSync(path.join(projectRoot, "config", "seo-fix.config.json"), path.join(root, "config", "seo-fix.config.json"));
    const source = loadPages();
    const pages = source.pages.slice(0, 4);
    const data = { ...source, pages };
    fs.mkdirSync(distPath, { recursive: true });
    fs.copyFileSync(path.join(projectRoot, "dist", "index.html"), path.join(distPath, "index.html"));
    for (const page of pages) fs.cpSync(path.join(projectRoot, "dist", page.slug), path.join(distPath, page.slug), { recursive: true });

    generateSearchIndex({ root, outputPath: distPath, pages });
    const related = createRelatedIndex(pages);
    writeRelatedIndex({ root, outputPath: distPath, relatedIndex: related });
    const hubs = createHubIndex(pages);
    writeHubIndex({ root, outputPath: distPath, hubIndex: hubs });
    const hubPages = ["province", "region", "subject", "target"].flatMap((type) => hubs[type] || []).map((hub) => ({ canonicalUrl: `${data.baseUrl}${hub.url}` }));
    writeSitemap({ outputPath: distPath, pages, hubPages, baseUrl: data.baseUrl });
    fs.writeFileSync(path.join(distPath, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${data.baseUrl}/sitemap.xml\n`, "utf8");

    const searchFile = path.join(distPath, "search-index.json");
    const brokenSearch = JSON.parse(fs.readFileSync(searchFile, "utf8"));
    brokenSearch[0].title = "잘못된 제목";
    brokenSearch.push(brokenSearch[0]);
    fs.writeFileSync(searchFile, JSON.stringify(brokenSearch), "utf8");
    const relatedFile = path.join(distPath, "related-index.json");
    const brokenRelated = JSON.parse(fs.readFileSync(relatedFile, "utf8"));
    brokenRelated[pages[0].slug].sameRegion = [pages[0].slug, "missing-page", "missing-page"];
    fs.writeFileSync(relatedFile, JSON.stringify(brokenRelated), "utf8");
    const hubFile = path.join(distPath, "hub-index.json");
    const brokenHub = JSON.parse(fs.readFileSync(hubFile, "utf8"));
    brokenHub.province = [];
    fs.writeFileSync(hubFile, JSON.stringify(brokenHub), "utf8");
    fs.appendFileSync(path.join(distPath, "sitemap.xml"), `<url><loc>${data.baseUrl}/missing-page/</loc></url>`, "utf8");
    const brokenHash = hash(fs.readFileSync(searchFile));

    const noBuild = async () => ({ report: { errors: 0 } });
    const preview = await runFix({ root, distPath, data, buildFunction: noBuild });
    if (preview.mode !== "dry-run" || preview.autoFixable !== 4) throw new Error(`dry-run 자동 수정 작업 수가 예상과 다릅니다: ${preview.autoFixable}`);
    if (hash(fs.readFileSync(searchFile)) !== brokenHash) throw new Error("dry-run이 파일을 변경했습니다.");
    const linksOnly = await runFix({ root, distPath, data, type: "links", buildFunction: noBuild });
    if (!linksOnly.changes.length || linksOnly.changes.some((item) => item.group !== "links")) throw new Error("--type=links 필터가 올바르게 작동하지 않습니다.");
    const pageOnly = await runFix({ root, distPath, data, page: pages[0].slug, buildFunction: noBuild });
    if (!pageOnly.changes.some((item) => item.slug === pages[0].slug)) throw new Error("--page 필터가 대상 페이지 문제를 찾지 못했습니다.");

    const result = await runFix({ root, distPath, data, apply: true, buildFunction: noBuild });
    if (result.applied !== 4 || result.failed !== 0) throw new Error("HIGH 확신도 수정 적용에 실패했습니다.");
    const repairedSearch = JSON.parse(fs.readFileSync(searchFile, "utf8"));
    if (repairedSearch.length !== pages.length || repairedSearch[0].title !== pages[0].title) throw new Error("검색 인덱스가 정상화되지 않았습니다.");

    const rollback = await runFix({ root, distPath, rollback: "" });
    if (!rollback.restoredBackupId || hash(fs.readFileSync(searchFile)) !== brokenHash) throw new Error("Rollback이 수정 전 상태를 복원하지 못했습니다.");
    console.log("SEO Fix 자체 테스트 통과: dry-run, HIGH 적용, 백업, Rollback을 모두 확인했습니다.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (require.main === module) selfTest().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { selfTest };
