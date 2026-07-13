# 김선생 회화 과외 홈페이지

이 홈페이지는 `pages.csv`의 한 줄을 지역 페이지 하나로 바꿉니다. 지역이 10개든 5,000개든 HTML을 복사할 필요 없이 CSV만 관리하면 됩니다.

## 폴더를 쉽게 이해하기

```text
kimsenglish/
├─ pages.csv              지역별 원본 데이터
├─ templates/page.html    모든 페이지가 함께 쓰는 HTML 틀 1개
├─ assets/style.css       모든 페이지가 함께 쓰는 디자인
├─ generate-pages.js      페이지를 자동으로 만드는 파일
├─ preview-server.js      내 컴퓨터에서 미리 보는 파일
├─ netlify.toml           Netlify 배포 설정
└─ dist/                  자동 생성된 실제 홈페이지
```

`dist`는 결과물입니다. 직접 고치면 다음 생성 때 사라지므로 수정하지 마세요. 내용은 `pages.csv`, 공통 구조는 `templates/page.html`, 디자인은 `assets/style.css`에서 바꿉니다.

## pages.csv 열 설명

### 꼭 입력하는 열

- `id`: 행마다 겹치지 않는 번호
- `domain`: 실제 홈페이지 주소
- `slug`: `/slug/` 주소에 사용할 영문 이름
- `status`: `publish`인 행만 공개
- `language`: 한국어 페이지는 `ko`
- `region`: 지역명
- `subject`: 과목
- `target`: 수업 대상
- `keyword`: 페이지의 가장 큰 제목
- `title`: 브라우저 탭과 검색 결과 제목
- `description`: 검색 결과 설명

### 필요할 때 입력하는 확장 열

- `intro`: 지역별 첫 안내 문장
- `benefit_1`, `benefit_2`, `benefit_3`: 추천 대상 세 가지
- `cta_title`: 상담 영역 제목
- `cta_text`: 상담 영역 설명
- `contact_url`: 상담 버튼 주소
- `updated_at`: 수정 날짜 (`2026-07-13` 형식)

확장 열을 비워 두면 생성기가 자연스러운 기본 문장을 넣습니다. 나중에 새 열을 오른쪽에 추가해도 기존 생성에는 영향을 주지 않습니다.

## 페이지 생성 방법

1. 스프레드시트에서 `pages.csv`를 엽니다.
2. 지역을 한 줄 추가하고 공개할 행의 `status`에 `publish`를 적습니다.
3. **CSV UTF-8 형식**으로 저장합니다.
4. VSCode 터미널에서 다음 명령을 실행합니다.

```text
node generate-pages.js
```

5. `dist`에 메인페이지, 지역별 페이지, `sitemap.xml`, `robots.txt`가 만들어집니다.

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
3. Netlify는 자동으로 `node generate-pages.js`를 실행합니다.
4. 생성된 `dist` 폴더만 홈페이지로 공개합니다.

실제 배포 전에 `pages.csv`의 `example.com`과 `hello@example.com`을 실제 도메인과 상담 주소로 바꾸세요.

## 왜 이렇게 바꿨나요?

- HTML 한 개를 공통 틀로 사용하므로 5,000개 파일을 직접 고칠 필요가 없습니다.
- 원본과 생성 결과를 분리해 실수로 자동 생성 파일을 편집하는 일을 줄입니다.
- 메인페이지 링크와 사이트맵이 CSV에서 자동으로 만들어져 새 지역을 빠뜨리지 않습니다.
- Netlify가 매번 같은 방법으로 새 결과를 만들기 때문에 내 컴퓨터와 배포 결과가 일치합니다.
