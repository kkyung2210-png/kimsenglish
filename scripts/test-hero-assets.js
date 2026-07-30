'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveHeroAsset } = require('./utils/assets/resolve-asset');
const { renderPicture } = require('./utils/assets/image-html');

const ROOT_DIR = path.resolve(__dirname, '..');

function runTest() {
  const assets = resolveHeroAsset(ROOT_DIR);
  const html = renderPicture({
    desktop: assets.desktop,
    mobile: assets.mobile,
    className: 'image-box-hero',
    alt: assets.desktop.alt,
  });

  assert.match(html, /<picture>/);
  assert.match(html, /<source media="\(max-width: 767px\)"/);
  assert.match(html, /<img /);
  assert.match(html, /loading="eager"/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /decoding="async"/);
  assert.match(html, /width="\d+"/);
  assert.match(html, /height="\d+"/);
  assert.ok(!html.includes('loading="lazy"'));

  const desktopExists = fs.existsSync(
    path.join(ROOT_DIR, 'public', 'assets', 'hero', 'hero-desktop.webp')
  );
  const mobileExists = fs.existsSync(
    path.join(ROOT_DIR, 'public', 'assets', 'hero', 'hero-mobile.webp')
  );

  if (!desktopExists) {
    assert.strictEqual(assets.desktop.source, 'placeholder');
    assert.match(assets.desktop.src, /hero-placeholder\.svg$/);
  }
  if (!mobileExists) {
    assert.strictEqual(assets.mobile.source, 'desktop-fallback');
    assert.strictEqual(assets.mobile.src, assets.desktop.src);
    assert.match(html, /srcset="\/assets\/hero\/hero-desktop\.webp"/);
  }

  // 실제 WebP 파일을 임시 폴더에 넣었을 때 두 경로가 자동 선택되는지도 확인합니다.
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kimsenglish-hero-'));
  try {
    const fixtureHeroDir = path.join(fixtureRoot, 'public', 'assets', 'hero');
    fs.mkdirSync(fixtureHeroDir, { recursive: true });
    const tinyWebp = Buffer.from(
      'UklGRkoAAABXRUJQVlA4ID4AAACwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA/v56QAAAAA==',
      'base64'
    );
    fs.writeFileSync(path.join(fixtureHeroDir, 'hero-desktop.webp'), tinyWebp);
    fs.writeFileSync(path.join(fixtureHeroDir, 'hero-mobile.webp'), tinyWebp);

    const webpAssets = resolveHeroAsset(fixtureRoot);
    const webpHtml = renderPicture({
      desktop: webpAssets.desktop,
      mobile: webpAssets.mobile,
      className: 'image-box-hero',
      alt: webpAssets.desktop.alt,
    });
    assert.strictEqual(webpAssets.desktop.source, 'primary');
    assert.strictEqual(webpAssets.mobile.source, 'primary');
    assert.match(webpHtml, /src="\/assets\/hero\/hero-desktop\.webp"/);
    assert.match(webpHtml, /srcset="\/assets\/hero\/hero-mobile\.webp"/);
    assert.match(webpHtml, /type="image\/webp"/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log('Hero 이미지 시스템 테스트 통과');
  console.log('- Desktop 이미지:', desktopExists ? 'WebP 사용' : 'fallback illustration 사용');
  console.log('- Mobile 이미지:', mobileExists ? 'WebP 사용' : 'Desktop WebP 자동 대체');
  console.log('- picture, eager, high priority, async decoding, 크기 속성 확인');
}

runTest();
