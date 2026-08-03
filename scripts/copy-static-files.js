const fs = require("fs");
const path = require("path");
const { escapeHtml } = require("./generate-pages");

function copyIfChanged(source, destination) {
  const sourceBytes = fs.readFileSync(source);
  if (fs.existsSync(destination) && sourceBytes.equals(fs.readFileSync(destination))) return false;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, sourceBytes);
  return true;
}

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === content) return false;
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

function makeSitemap({ pages, hubPages = [], baseUrl }) {
  const entries = [
    `  <url><loc>${escapeHtml(`${baseUrl}/`)}</loc></url>`,
    ...pages.map((page) => `  <url><loc>${escapeHtml(`${baseUrl}/${page.slug}/`)}</loc>${page.updated_at ? `<lastmod>${escapeHtml(page.updated_at)}</lastmod>` : ""}</url>`),
    ...hubPages.map((hub) => `  <url><loc>${escapeHtml(hub.canonicalUrl)}</loc></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

function writeSitemap({ outputPath, pages, hubPages = [], baseUrl }) {
  return writeIfChanged(path.join(outputPath, "sitemap.xml"), makeSitemap({ pages, hubPages, baseUrl }));
}

/** Google Search Console 소유권 확인용 HTML만 public 루트에서 dist 루트로 복사합니다. */
function copyGoogleVerificationFiles(publicRoot, outputPath) {
  if (!fs.existsSync(publicRoot)) return;
  const files = fs.readdirSync(publicRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^google[a-z0-9_-]+\.html$/i.test(entry.name));
  for (const file of files) {
    copyIfChanged(path.join(publicRoot, file.name), path.join(outputPath, file.name));
  }
}

/** CSS, 상담·후기 스크립트, 기존 이미지와 SEO 정적 파일을 dist에 준비합니다. */
function copyStaticFiles({ root, outputPath, pages, hubPages = [], baseUrl }) {
  const publicRoot = path.join(root, "public");
  const styleFile = path.join(root, "assets", "style.css");
  const consultationScript = path.join(publicRoot, "utils", "consultation-form.js");
  const reviewsScript = path.join(publicRoot, "utils", "reviews-carousel.js");
  const images = path.join(publicRoot, "images");

  for (const requiredFile of [styleFile, consultationScript, reviewsScript]) {
    if (!fs.existsSync(requiredFile)) throw new Error(`필요한 정적 파일을 찾을 수 없습니다: ${requiredFile}`);
  }

  copyIfChanged(styleFile, path.join(outputPath, "style.css"));
  fs.mkdirSync(path.join(outputPath, "utils"), { recursive: true });
  copyIfChanged(consultationScript, path.join(outputPath, "utils", "consultation-form.js"));
  copyIfChanged(reviewsScript, path.join(outputPath, "utils", "reviews-carousel.js"));

  if (fs.existsSync(images)) {
    fs.cpSync(images, path.join(outputPath, "images"), {
      recursive: true,
      filter: (file) => path.basename(file) !== ".gitkeep",
    });
  }
  copyGoogleVerificationFiles(publicRoot, outputPath);

  writeSitemap({ outputPath, pages, hubPages, baseUrl });
  writeIfChanged(path.join(outputPath, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
}

module.exports = { copyStaticFiles, makeSitemap, writeSitemap };
