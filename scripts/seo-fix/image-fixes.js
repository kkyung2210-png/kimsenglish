const { change } = require("./safe-fixes");

/** 의미를 추정해야 하는 alt는 수정하지 않고 수동 검토 대상으로만 남깁니다. */
function planImageFixes(auditPages) {
  const changes = [];
  for (const page of auditPages || []) {
    for (const item of [...(page.errors || []), ...(page.warnings || [])]) {
      if (item.code === "image-alt-missing") {
        changes.push(change("IMAGE_ALT_REVIEW", "images", page.slug ? `dist/${page.slug}/index.html` : "dist/index.html", "의미 있는 이미지인지 판단이 필요하므로 alt를 자동 생성하지 않습니다.", { slug: page.slug, confidence: "LOW" }));
      }
      if (item.code === "image-size-attribute-missing") {
        changes.push(change("IMAGE_DIMENSION_REVIEW", "images", page.slug ? `dist/${page.slug}/index.html` : "dist/index.html", "생성 원본에서 실제 이미지 크기를 확인해야 합니다.", { slug: page.slug, confidence: "MEDIUM" }));
      }
    }
  }
  return changes;
}

module.exports = { planImageFixes };
