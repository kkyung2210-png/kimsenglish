const { expandToken } = require("./synonyms");

/** 대소문자, 전각문자, 여러 공백을 정리합니다. */
function normalizeBase(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, " ")
    .trim();
}

/** 띄어쓰기와 문장부호를 제거한 비교용 문자열을 만듭니다. */
function compactText(value) {
  return normalizeBase(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

/** 단어 단위 동의어를 적용합니다. */
function normalizeQuery(value) {
  const base = normalizeBase(value);
  const tokens = base.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(expandToken);
  return { raw: String(value || "").trim(), text: tokens.join(" "), compact: tokens.join("") };
}

module.exports = { normalizeBase, compactText, normalizeQuery };
