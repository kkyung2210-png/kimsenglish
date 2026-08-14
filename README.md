# 김선생 회화 과외 홈페이지

이 홈페이지는 `pages.csv`의 한 줄을 지역 페이지 하나로 바꿉니다. 지역이 10개든 5,000개든 HTML을 복사할 필요 없이 CSV만 관리하면 됩니다.

## 폴더를 쉽게 이해하기

```text
kimsenglish/
├─ pages.csv              지역별 원본 데이터
├─ templates/page.html    모든 페이지가 함께 쓰는 HTML 틀 1개
├─ assets/style.css       모든 페이지가 함께 쓰는 디자인
├─ config/brand.ts        로고와 메인 이미지 경로 설정
├─ config/content/        본문·FAQ·CTA·예시 문장 설정
├─ public/assets/         교체할 실제 브랜드 이미지
├─ scripts/               역할별 빌드 파일
│  ├─ build.js            전체 작업을 순서대로 실행
│  ├─ generate-pages.js   메인·지역 페이지 생성
│  ├─ generate-search-index.js  검색 목록 생성
│  ├─ generate-related-index.js 페이지별 관련 링크 생성
│  ├─ generate-hub-index.js     지역·과목·대상 Hub 생성
│  ├─ generate-hub-pages.js     Topic Cluster Hub 페이지 생성
│  ├─ content-intelligence.js   페이지별 콘텐츠 고정 선택
│  ├─ validate-content-intelligence.js 콘텐츠 중복·고정 생성 검사
│  ├─ generate-schema.js        기존 JSON-LD 구조 관리
│  ├─ copy-assets.js      브랜드 에셋 복사
│  └─ copy-static-files.js      CSS·robots·sitemap 등 준비
├─ generate-pages.js      예전 실행 방법을 위한 연결 파일
├─ preview-server.js      내 컴퓨터에서 미리 보는 파일
├─ package.json           npm run build 명령 설정
├─ netlify.toml           Netlify 배포 설정
└─ dist/                  자동 생성된 실제 홈페이지
```

`dist`는 결과물입니다. 직접 고치면 다음 생성 때 사라지므로 수정하지 마세요. 내용은 `pages.csv`, 공통 구조는 `templates/page.html`, 디자인은 `assets/style.css`에서 바꿉니다.

## 빌드 명령

- `npm run build`: 모든 행의 변경 여부를 검사하고 필요한 페이지만 생성합니다.
- `npm run build --changed` 또는 `npm run build:changed`: 변경된 페이지와 그 영향 페이지만 생성합니다.
- `npm run build --full` 또는 `npm run build:full`: 캐시와 관계없이 모든 페이지를 다시 생성합니다.
- `npm run build -- --changed`, `npm run build -- --full`: 위 명령과 같은 표준 옵션 방식입니다.

빌드 결과는 `build-report.json`, 오류는 `build-errors.json`, 페이지별 hash는 `.cache/build-manifest.json`에 저장됩니다.

## pages.csv 열 설명

### 꼭 입력하는 열

- `id`: 행마다 겹치지 않는 번호
- `domain`: 실제 홈페이지 주소
- `slug`: `/slug/` 주소에 사용할 영문 이름
- `status`: `publish`인 행만 공개
- `language`: 한국어 페이지는 `ko`
- `province`: 시도명(예: `강원도`). Breadcrumb과 같은 시도 내부 연결에 사용하며 URL에는 넣지 않습니다.
- `region`: 지역명
- `subject`: 과목
- `target`: 수업 대상
- `keyword`: 페이지의 가장 큰 제목
- `title`: 브라우저 탭과 검색 결과 제목
- `description`: 예전 방식의 검색 결과 설명이며, 새 콘텐츠 값이 없을 때만 보조 자료로 사용

### 필요할 때 입력하는 확장 열

- `intro`: 지역별 첫 안내 문장
- `benefit_1`, `benefit_2`, `benefit_3`: 추천 대상 세 가지
- `cta_title`: 상담 영역 제목
- `cta_text`: 상담 영역 설명
- `contact_url`: 상담 버튼 주소
- `updated_at`: 수정 날짜 (`2026-07-13` 형식)
- `search_intent`: 이 페이지를 찾는 사람의 구체적인 목적
- `summary`: 검색 사용자와 AI가 빠르게 이해할 핵심 답변
- `lesson_focus`: 수업에서 중점적으로 다룰 내용
- `lesson_method`: 실제 수업 진행 방식
- `lesson_result`: 학습자가 목표로 하는 변화
- `tone`: `친근형`, `신뢰형`, `전문형`, `목표달성형`, `차분형`, `코칭형` 중 문장 분위기
- `template`: `conversation`, `exam`, `business`, `travel` 중 콘텐츠 종류
- `faq_question_1`~`3`: 키워드별 자주 묻는 질문
- `faq_answer_1`~`3`: 화면과 구조화 정보에 함께 표시할 답변

Google Sheets의 `final`에서 내려받은 `지역`, `대상`, `세부키워드`, `최종키워드` 같은 한글 열 이름도 읽을 수 있습니다. 확장 열을 비워 두면 생성기가 자연스러운 기본 문장을 넣습니다. 나중에 새 열을 오른쪽에 추가해도 기존 생성에는 영향을 주지 않습니다.

검색 결과 설명은 `slug`를 기준으로 고정된 패턴을 선택합니다. 8가지 도입 문장과 과목군별 8가지 수업 문장을 서로 다른 해시로 조합하므로 같은 페이지는 다시 만들어도 문구가 유지되고, 지역명만 바뀐 설명이 반복되지 않습니다.

각 지역 페이지는 키워드를 억지로 반복하지 않습니다. 대신 지역과 과목 및 대상을 명확하게 설명하고 FAQ 및 관련 수업 링크를 제공해 사람과 검색엔진이 내용을 쉽게 이해하도록 구성합니다.

## 메인페이지 이미지 넣기

실제 이미지는 `public/assets`에 넣고 경로는 `config/brand.ts` 한 곳에서 관리합니다. 이미지를 넣은 뒤 `npm run build`를 실행하면 placeholder가 실제 이미지로 자동 변경됩니다. WebP를 먼저 확인하며 PNG, SVG, AVIF, JPG도 사용할 수 있습니다.

- `hero/hero`: 메인 Hero
- `categories/english`, `japanese`, `exam`, `business`: 수업 종류
- `features/personal`, `management`, `feedback`: 수업 특징
- `icons/level-test`, `study-plan`, `lesson`, `feedback`: 수업 과정
- `cta/consultation`: 상담 영역
- `logos/logo`: Header, Footer와 아이콘에서 사용할 로고

예를 들어 `public/assets/categories/english.webp`를 넣으면 영어회화 카드에 자동으로 표시됩니다. 파일 이름을 다르게 사용하려면 `config/brand.ts`의 `english.base`만 바꾸면 됩니다. 이미지가 없으면 현재 Placeholder가 계속 표시됩니다.

## 페이지 생성 방법

1. 스프레드시트에서 `pages.csv`를 엽니다.
2. 지역을 한 줄 추가하고 공개할 행의 `status`에 `publish`를 적습니다.
3. **CSV UTF-8 형식**으로 저장합니다.
4. VSCode 터미널에서 다음 명령을 실행합니다.

```text
npm run build
```

Windows PowerShell의 실행 제한 안내가 나오면 `npm.cmd run build`를 사용하면 됩니다.

5. `dist`에 메인페이지, 지역별 페이지, `sitemap.xml`, `robots.txt`가 만들어집니다.

빌드할 때 `search-index.json`, `related-index.json`, `hub-index.json`도 함께 만들어집니다. 관련 페이지 계산은 방문자의 브라우저가 아니라 빌드 과정에서 미리 끝나므로 페이지를 열 때 추가 계산이 필요하지 않습니다.

지역 페이지에는 수업 상담 요약, 추천 대상과 다음 추천 페이지가 일반 본문으로 함께 생성됩니다. 이 내용은 방문자가 수업 대상, 진행 내용과 활용 방법을 빠르게 이해할 수 있도록 `pages.csv`의 콘텐츠 값을 자연스러운 문장으로 정리합니다.

`pages.csv`를 수정하지 않아도 빌드 과정에서 `/hub/province/`, `/hub/region/`, `/hub/subject/`, `/hub/target/` 아래에 Topic Hub가 자동 생성됩니다. 각 Hub에는 인기 수업, 관련 지역·과목·대상, FAQ, 최근 페이지와 다른 Hub로 이동하는 추천 링크가 포함됩니다.

생성기는 중복된 `id`나 `slug`를 발견하면 실수로 페이지를 덮어쓰지 않고 오류를 알려 줍니다. 완성 도중 오류가 나면 기존 `dist`는 유지됩니다.

## 로컬 미리보기

먼저 페이지를 생성한 뒤 다음 명령을 실행합니다.

```text
node preview-server.js
```

브라우저에서 `http://localhost:8080/`을 엽니다. 끝낼 때는 터미널에서 `Ctrl+C`를 누릅니다.

## GitHub와 Netlify 배포

1. 이 프로젝트를 GitHub에 올립니다.
2. Netlify에서 GitHub 저장소를 연결합니다.
3. Netlify는 자동으로 `npm run build`를 실행합니다.
4. 생성된 `dist` 폴더만 홈페이지로 공개합니다.

현재 운영 주소는 `https://kimsenglish.co.kr`입니다. 실제 상담 채널이 정해지면 `pages.csv`의 `contact_url`을 상담 주소로 바꾸세요.

## 왜 이렇게 바꿨나요?

- HTML 한 개를 공통 틀로 사용하므로 5,000개 파일을 직접 고칠 필요가 없습니다.
- 원본과 생성 결과를 분리해 실수로 자동 생성 파일을 편집하는 일을 줄입니다.
- 메인페이지 링크와 사이트맵이 CSV에서 자동으로 만들어져 새 지역을 빠뜨리지 않습니다.
- Netlify가 매번 같은 방법으로 새 결과를 만들기 때문에 내 컴퓨터와 배포 결과가 일치합니다.

## SEO 품질 검사

빌드가 끝나면 SEO 품질 검사가 자동으로 실행됩니다. 검사 결과는 사이트 파일을 고치지 않고 `reports` 폴더에 보고서로만 저장합니다.

- `npm run audit`: 변경이 없으면 이전 검사 결과를 빠르게 재사용합니다.
- `npm run audit:full`: 모든 페이지를 다시 검사합니다.
- `npm run audit:strict`: 오류나 설정된 품질 기준 미달이 있으면 실패로 처리합니다.
- `npm run audit -- --page=anyang-english-conversation`: 특정 페이지를 자세히 검사합니다.
- `npm run audit:test`: 고의로 만든 오류 8가지를 검사기가 찾아내는지 확인합니다. 실제 사이트 파일은 바꾸지 않습니다.

검사 대상에는 메인페이지, 일반 수업 페이지, 시도·지역·과목·대상 Hub 페이지가 모두 포함됩니다. 제목, 설명, 제목 구조, 본문 품질, 중복, 내부 링크, 고립 페이지, JSON-LD, canonical, sitemap, robots, 이미지, 검색 인덱스 연결 상태를 확인합니다.

주요 설정은 `config/seo-audit.config.json`에서 바꿀 수 있습니다. 검사 기능은 `scripts/seo-audit` 폴더에 나누어 두었으며, 전체 실행 시작점은 `scripts/seo-audit.js`입니다.

보고서 파일은 다음과 같습니다.

- `seo-audit-report.json`: 페이지별 전체 검사 결과와 점수
- `seo-audit-summary.json`: 전체 요약
- `seo-duplicate-report.json`: 중복 콘텐츠 결과
- `seo-broken-links.json`: 깨진 링크 결과
- `seo-orphan-pages.json`: 다른 페이지에서 연결되지 않은 페이지 후보
- `seo-low-quality-pages.json`: 품질 점수가 낮은 페이지
- `seo-schema-errors.json`: JSON-LD 검사 결과
- `seo-index-consistency.json`: search·related·hub 인덱스 연결 상태

경고는 자동 수정되지 않습니다. 보고서를 확인한 뒤 원본 데이터나 템플릿을 직접 검토해야 하며, 생성된 URL·SEO 내용·인덱스 형식은 검사 과정에서 변경되지 않습니다.

## 안전한 SEO 수정

SEO 수정 도구는 기본적으로 미리보기만 합니다. `npm run fix`를 실행해도 원본과 `dist`는 바뀌지 않고 `reports/seo-fix-preview.json`만 생성됩니다.

- `npm run fix`: 수정 예정 항목만 확인하는 dry-run
- `npm run fix -- --type=links`: 링크 관련 항목만 확인
- `npm run fix -- --page=anyang-english-conversation`: 한 페이지만 확인
- `npm run fix:apply`: 확신도가 HIGH인 허용 항목만 실제 적용
- `npm run fix:strict`: 확신도가 낮은 후보가 하나라도 있으면 적용 중단
- `npm run fix -- --rollback`: 가장 최근 적용 전 상태로 복원
- `npm run fix -- --rollback=백업번호`: 선택한 백업으로 복원
- `npm run fix:test`: 복사본에서 dry-run·적용·복원을 시험

자동 적용되는 범위는 검색 인덱스, 관련 페이지 인덱스, Hub 인덱스, sitemap의 정합성뿐입니다. 기존 생성기를 다시 실행하는 방식이며 title, description, H1, 본문, FAQ, CTA, slug, URL은 자동으로 고치지 않습니다.

실제 적용 전 파일은 `.backups/seo-fix/날짜-시간/`에 저장됩니다. 적용 결과는 `reports/seo-fix-result.json`, 사람이 판단해야 할 내용은 `reports/manual-review-report.json`에서 확인할 수 있습니다.

## 브랜드 이미지 넣기

실제 이미지는 `public/assets` 아래에 넣고, 모든 경로와 alt는 `config/brand-assets.js`에서 관리합니다. 이미지가 없으면 기존 Placeholder가 표시되므로 빌드가 중단되지 않습니다.

- `npm run build`: 이미지 존재 여부 검사, 페이지 생성, 에셋 복사, Asset Audit과 SEO Audit 실행
- `npm run audit:assets`: 브랜드 이미지 설정과 복사 결과만 다시 검사
- `npm run test:assets`: 임시 WebP로 영어 카드·영어 페이지 연결을 시험한 뒤 자동 삭제

이미지 권장 크기, 파일명과 새로운 과목·대상 추가 방법은 `docs/brand-assets.md`를 확인하세요. 검사 결과는 `reports/brand-assets-report.json`에 저장됩니다.
