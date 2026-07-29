const fs = require("fs");
const path = require("path");

async function testBrandAssets() {
  const root = path.resolve(__dirname, "..");
  const testImage = path.join(root, "public", "assets", "subjects", "english.webp");
  const outputPath = path.join(root, ".brand-assets-test-dist");
  if (fs.existsSync(testImage)) throw new Error("english.webp가 이미 존재하므로 테스트 파일로 덮어쓰지 않았습니다.");
  fs.rmSync(outputPath, { recursive: true, force: true });
  try {
    // 공개 사이트에 사용할 이미지가 아니라 resolver 연결만 확인하는 1×1 임시 WebP입니다.
    fs.writeFileSync(testImage, Buffer.from("UklGRkoAAABXRUJQVlA4ID4AAACwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA/v56QAAAAA==", "base64"));
    const { generatePages, loadPages } = require("./generate-pages");
    const { createRelatedIndex } = require("./generate-related-index");
    const { createHubIndex } = require("./generate-hub-index");
    const { copyAssets } = require("./copy-assets");
    const data = loadPages();
    const english = data.pages.find((page) => page.subject === "영어회화");
    const japanese = data.pages.find((page) => /일본어/.test(page.subject));
    const relatedIndex = createRelatedIndex(data.pages);
    const hubIndex = createHubIndex(data.pages);
    generatePages({ outputPath, data, relatedIndex, hubIndex, pageSlugs: new Set([english.slug, japanese.slug]), generateHome: true });
    copyAssets({ root, outputPath });

    const home = fs.readFileSync(path.join(outputPath, "index.html"), "utf8");
    const englishHtml = fs.readFileSync(path.join(outputPath, english.slug, "index.html"), "utf8");
    const japaneseHtml = fs.readFileSync(path.join(outputPath, japanese.slug, "index.html"), "utf8");
    const url = "/assets/subjects/english.webp";
    if (!home.includes(url)) throw new Error("메인 영어 카드가 테스트 이미지를 사용하지 않습니다.");
    if (!englishHtml.includes(url)) throw new Error("영어 페이지가 테스트 이미지를 사용하지 않습니다.");
    if (japaneseHtml.includes(url)) throw new Error("일본어 페이지에 영어 이미지가 잘못 적용됐습니다.");
    if (!fs.existsSync(path.join(outputPath, "assets", "subjects", "english.webp"))) throw new Error("테스트 이미지가 dist/assets에 복사되지 않았습니다.");
    if (!englishHtml.includes('loading="lazy"') || !englishHtml.includes('decoding="async"')) throw new Error("이미지 성능 속성이 누락됐습니다.");
    console.log("브랜드 에셋 테스트 통과: 영어 이미지는 영어 카드·페이지에만 적용되고 dist에 복사됐습니다.");
  } finally {
    fs.rmSync(testImage, { force: true });
    fs.rmSync(outputPath, { recursive: true, force: true });
  }
}

if (require.main === module) testBrandAssets().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { testBrandAssets };
