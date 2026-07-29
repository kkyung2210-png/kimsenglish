// 사이트 운영 주소를 한곳에서 관리합니다.
// 배포 환경에 SITE_URL이 있으면 그 값을 사용하고, 없으면 공식 도메인을 사용합니다.
const DEFAULT_SITE_URL = "https://kimsenglish.co.kr";
const SITE_URL = String(process.env.SITE_URL || DEFAULT_SITE_URL).trim().replace(/\/+$/, "");

if (!/^https:\/\/[a-z0-9.-]+$/i.test(SITE_URL)) {
  throw new Error(`SITE_URL 형식이 올바르지 않습니다: ${SITE_URL}`);
}

module.exports = Object.freeze({ DEFAULT_SITE_URL, SITE_URL });
