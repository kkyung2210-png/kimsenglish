const fs = require("fs");
const path = require("path");

/**
 * 브랜드 이미지와 향후 fonts, illustrations, lottie 같은 리소스를 복사합니다.
 * 새 에셋 종류가 생기면 public/assets 아래에 폴더만 추가하면 함께 복사됩니다.
 */
function copyAssets({ root, outputPath }) {
  const source = path.join(root, "public", "assets");
  const destination = path.join(outputPath, "assets");
  if (!fs.existsSync(source)) return;

  fs.cpSync(source, destination, {
    recursive: true,
    filter: (file) => path.basename(file) !== ".gitkeep",
  });
}

module.exports = { copyAssets };
