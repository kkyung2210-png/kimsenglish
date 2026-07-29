function compact(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s_-]+/g, "").trim();
}

const SUBJECT_KEYS = new Map([
  ["영어", "english"],
  ["성인영어", "english"],
  ["생활영어", "english-conversation"],
  ["여행영어", "english-conversation"],
  ["영어회화", "english-conversation"],
  ["회화", "english-conversation"],
  ["비즈니스영어", "business-english"],
  ["비즈니스회화", "business-english"],
  ["토익", "toeic"],
  ["토익스피킹", "toeic"],
  ["토스", "toeic"],
  ["오픽", "opic"],
  ["아이엘츠", "ielts"],
  ["ielts", "ielts"],
  ["토플", "toefl"],
  ["toefl", "toefl"],
  ["시험", "exam-prep"],
  ["시험대비", "exam-prep"],
  ["자격증", "exam-prep"],
  ["내신", "exam-prep"],
  ["지텔프", "exam-prep"],
  ["텝스", "exam-prep"],
  ["일본어", "japanese"],
  ["일본어회화", "japanese"],
  ["jlpt", "japanese"],
  ["jpt", "japanese"],
  ["eju", "japanese"],
  ["중국어", "hsk"],
  ["hsk", "hsk"],
]);

const TARGET_KEYS = new Map([
  ["성인", "adult"],
  ["직장인", "worker"],
  ["대학생", "college"],
  ["고등학생", "high-school"],
  ["고등", "high-school"],
  ["중학생", "middle-school"],
  ["중등", "middle-school"],
  ["초등학생", "elementary"],
  ["초등", "elementary"],
]);

function normalizeSubjectKey(value) { return SUBJECT_KEYS.get(compact(value)) || "fallback"; }
function normalizeTargetKey(value) { return TARGET_KEYS.get(compact(value)) || "fallback"; }

module.exports = { compact, normalizeSubjectKey, normalizeTargetKey };
