// 이전 실행 방법과의 호환성을 위한 짧은 연결 파일입니다.
// 실제 빌드는 scripts/build.js가 순서대로 처리합니다.
const { build } = require("./scripts/build");

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
