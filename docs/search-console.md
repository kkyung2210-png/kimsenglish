# Index Intelligence Dashboard

이 기능은 Google Search Console의 검색 성과와 색인 상태를 로컬 Dashboard에서 확인하기 위한 구조입니다.

현재 기본 설정은 `mock`입니다. Google 계정이나 API 권한이 없어도 실제 사이트 페이지 목록을 바탕으로 만든 예시 데이터가 표시됩니다.

## 실행 방법

1. 보고서만 새로 만들려면 터미널에서 다음 명령을 실행합니다.

   `npm run search-console:refresh`

2. Dashboard를 열려면 다음 명령을 실행합니다.

   `npm run dashboard`

3. 브라우저에서 `http://127.0.0.1:8081`을 엽니다.

Dashboard는 공개 홈페이지의 `dist` 폴더에 들어가지 않습니다. 로컬에서만 확인하는 관리 화면입니다.

## 생성되는 보고서

- `reports/search-console/summary.json`: 전체 클릭, 노출, CTR, 평균 순위와 색인 수
- `reports/search-console/pages.json`: 페이지별 성과 및 색인 상태
- `reports/search-console/coverage.json`: 색인 문제 종류와 예시
- `reports/search-console/queries.json`: 검색어별 성과

Mock과 실제 Google API는 위와 같은 JSON 형태를 사용합니다. 따라서 API 연결 뒤에도 Dashboard 코드를 바꿀 필요가 없습니다.

## Google API를 나중에 연결하는 방법

`config/search-console.config.json`의 `mode`를 `api`로 바꾼 뒤 환경변수에 OAuth 접근 토큰을 설정합니다.

- `GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN`: Search Console 읽기 권한이 있는 OAuth 접근 토큰
- `GOOGLE_SEARCH_CONSOLE_SITE_URL`: 설정 파일과 다른 속성을 조회할 때 사용

Google Search Console의 비공개 데이터 조회에는 일반 API Key만으로는 부족하며 OAuth 권한이 필요합니다. 토큰은 코드나 설정 파일에 적지 말고 환경변수에만 저장합니다.

API가 연결되지 않았거나 호출에 실패해도 `fallbackToMock`이 `true`이면 Mock 데이터로 Dashboard를 계속 사용할 수 있습니다. 이 기능은 홈페이지 빌드와 분리되어 있어 API 오류가 `npm run build`를 막지 않습니다.

현재 API 모드는 Search Analytics 데이터를 받을 수 있도록 준비되어 있습니다. 페이지별 색인 여부와 마지막 크롤링 시각은 향후 URL Inspection 권한을 연결할 때 같은 보고서 항목에 채워집니다.
