# 브랜드 이미지 관리 안내

사이트의 모든 실제 브랜드 이미지는 `public/assets` 폴더에서 관리합니다. 이미지 경로, 대체 문구와 기본 크기는 `config/brand-assets.js` 한 파일에서 설정합니다. HTML이나 페이지 생성 파일에 이미지 경로를 직접 추가하지 마세요.

## 폴더별 용도

- `logo/`: Header·Footer 로고, 로고 마크, favicon, Apple Touch Icon
- `hero/`: 메인 Hero 데스크톱·모바일 이미지
- `subjects/`: 영어회화, 토익, 오픽, 일본어 등 과목 이미지
- `targets/`: 성인, 직장인, 대학생 등 학습 대상 이미지
- `cta/`: 상담과 레벨 테스트 이미지
- `og/`: SNS 공유 시 사용하는 공통 Open Graph 이미지
- `icons/`: 검색, 위치, 과목, 상담 등에 사용하는 장식용 SVG 아이콘
- `fallback/`: 해당 과목이나 대상 이미지가 없을 때 사용하는 공통 이미지

## 권장 파일명과 크기

| 용도 | 파일명 예시 | 권장 크기 | 권장 비율 |
|---|---|---:|---:|
| Hero Desktop | `hero/hero-main.webp` | 1600×1000 | 8:5 |
| Hero Mobile | `hero/hero-mobile.webp` | 900×900 | 1:1 |
| Subject | `subjects/english.webp` | 800×600 | 4:3 |
| Target | `targets/adult.webp` | 800×600 | 4:3 |
| CTA | `cta/consultation.webp` | 1000×700 | 약 10:7 |
| Open Graph | `og/default-og.webp` | 1200×630 | 약 1.91:1 |
| Logo | `logo/logo.svg` | SVG 권장 | 로고에 맞춤 |
| Icon | `icons/search.svg` | SVG 권장 | 1:1 |

## 이미지 교체 방법

1. 권장 파일명으로 이미지를 준비합니다.
2. 알맞은 `public/assets` 하위 폴더에 넣습니다.
3. 터미널에서 `npm run build`를 실행합니다.
4. `reports/brand-assets-report.json`에서 누락, 파일 크기와 복사 결과를 확인합니다.

같은 파일명으로 교체할 때는 설정을 수정할 필요가 없습니다. 다른 파일명을 사용하려면 `config/brand-assets.js`의 해당 `src`만 바꾸세요.

## WebP 변환 안내

사진이나 복잡한 래스터 이미지는 WebP를 권장합니다. 원본 비율을 유지하고 화면에서 필요 이상으로 큰 해상도를 사용하지 마세요. 2MB가 넘는 파일과 500KB가 넘는 PNG·JPG는 빌드 보고서에 경고가 표시됩니다. 로고와 단순 아이콘은 SVG가 적합합니다.

## 새로운 과목 이미지 추가

1. `public/assets/subjects/새이름.webp`를 준비합니다.
2. `config/brand-assets.js`의 `subjects`에 `src`, `alt`, `width`, `height`를 추가합니다.
3. `scripts/utils/assets/normalize-asset-key.js`의 `SUBJECT_KEYS`에 스프레드시트 과목명과 새 key를 연결합니다.
4. 빌드 후 해당 과목 페이지만 새 이미지를 사용하는지 확인합니다.

## 새로운 대상 이미지 추가

1. `public/assets/targets/새이름.webp`를 준비합니다.
2. `config/brand-assets.js`의 `targets`에 설정을 추가합니다.
3. `scripts/utils/assets/normalize-asset-key.js`의 `TARGET_KEYS`에 대상명과 새 key를 연결합니다.
4. 빌드 후 해당 대상 페이지만 새 이미지를 사용하는지 확인합니다.

## Fallback 동작

이미지를 찾지 못하면 다음 순서로 처리합니다.

1. 같은 과목·대상 분류의 `fallback` 파일
2. `fallback/image-placeholder.svg`
3. 기존 Placeholder 또는 CSS 회색 영역

일부 기존 Placeholder SVG는 실제 브랜드 이미지가 준비되기 전 화면을 유지하기 위해 재사용됩니다. 파일이 없어도 빌드는 중단되지 않으며 누락 내용은 경고 보고서에만 기록됩니다.

## 접근성과 성능

- `alt`는 파일명이 아니라 이미지의 의미를 설명합니다.
- 장식용 아이콘은 `alt=""`, `aria-hidden="true"`, `role="presentation"`을 사용합니다.
- 모든 이미지에는 `width`, `height`, `decoding="async"`가 들어갑니다.
- Hero와 Logo는 즉시 로드하고, 본문·카드·CTA 이미지는 지연 로드합니다.
- Hero는 모바일에서 별도 이미지가 없으면 데스크톱 이미지를 사용합니다.
