const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./safe-fixes");

const ADVICE = {
  "중복 title": "페이지 목적을 확인한 뒤 사람이 title을 구분해 주세요.",
  "유사 description": "검색의도와 수업 차이를 반영해 사람이 검토해 주세요.",
  "낮은 본문 품질": "원본 콘텐츠 재료와 템플릿을 검토해 주세요.",
  "부족한 FAQ": "실제 상담 질문을 바탕으로 FAQ를 보완해 주세요.",
  "의미 있는 이미지 alt 누락": "이미지 의미를 확인한 뒤 사람이 alt를 작성해 주세요.",
  "과도한 키워드 반복": "문장을 임의 변경하지 말고 콘텐츠 원본에서 반복 원인을 확인해 주세요.",
  "H1 품질 문제": "페이지 목적과 H1 관계를 사람이 확인해 주세요.",
  "Canonical 정책 문제": "URL 정책 담당자가 canonical 대상을 확인해 주세요.",
  "Schema 내용 문제": "Schema 종류는 유지하고 실제 값의 정확성을 확인해 주세요.",
  "내부링크 구조 검토": "임의 링크로 교체하지 말고 원본 생성기와 관련 인덱스를 확인해 주세요.",
  "생성 템플릿 검토": "정상 템플릿으로 재생성 가능한지 먼저 확인해 주세요.",
  "고아 페이지 구조 검토": "Hub 또는 관련 페이지에서 연결할 가치가 있는지 사람이 판단해 주세요.",
};

function buildManualReview(audit, config, pageFilter = null) {
  const rows = [];
  for (const page of audit?.pages || []) {
    if (pageFilter && page.slug !== pageFilter) continue;
    for (const item of [...(page.errors || []), ...(page.warnings || []), ...(page.info || [])]) {
      const category = config.manualReviewRules[item.code];
      if (!category) continue;
      rows.push({
        type: category,
        slug: page.slug || "__home__",
        currentValue: item.message,
        reason: item.message,
        recommendedAction: ADVICE[category],
        auditRule: item.code,
      });
    }
  }
  return rows;
}

function writePreview(root, preview, manualReview) {
  const reports = path.join(root, "reports");
  writeJsonAtomic(path.join(reports, "seo-fix-preview.json"), preview);
  writeJsonAtomic(path.join(reports, "manual-review-report.json"), {
    generatedAt: preview.generatedAt,
    total: manualReview.length,
    items: manualReview,
  });
}

function writeResult(root, result) {
  writeJsonAtomic(path.join(root, "reports", "seo-fix-result.json"), result);
}

function readAudit(root) {
  const file = path.join(root, "reports", "seo-audit-report.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { summary: {}, pages: [] };
}

module.exports = { buildManualReview, readAudit, writePreview, writeResult };
