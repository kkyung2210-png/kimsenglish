/** 검색어에서 자주 사용하는 줄임말과 다른 표기를 한 가지 표현으로 맞춥니다. */
const SYNONYMS = Object.freeze({
  "영회": "영어회화",
  "영어": "영어회화",
  "english": "영어회화",
  "일어": "일본어",
  "일본어회화": "일본어",
  "japanese": "일본어",
  "토스": "토익스피킹",
  "toeic speaking": "토익스피킹",
  "아이엘츠": "ielts",
  "아이엘스": "ielts",
  "오픽": "opic",
  "시험대비": "시험",
  "안냥": "안양",
});

function expandToken(token) {
  return SYNONYMS[token] || token;
}

function canonicalTerms() {
  return [...new Set(Object.values(SYNONYMS))];
}

module.exports = { SYNONYMS, expandToken, canonicalTerms };
