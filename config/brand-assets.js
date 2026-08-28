/**
 * 사이트 전체에서 사용하는 브랜드 이미지 설정입니다.
 * 실제 파일이 public/assets 아래에 있으면 사용하고, 없으면 placeholder를 사용합니다.
 */
module.exports = Object.freeze({
  name: "Kim's English",
  maximumBytes: 2 * 1024 * 1024,
  largeRasterWarningBytes: 500 * 1024,
  logo: Object.freeze({
    default: { src: "/assets/logo/logo.svg", placeholder: "/images/brand/logo-placeholder.svg", alt: "Kim's English", width: 176, height: 48 },
    dark: { src: "/assets/logo/logo-dark.svg", placeholder: "/images/brand/logo-placeholder.svg", alt: "Kim's English", width: 176, height: 48 },
    mark: { src: "/assets/logo/logo-mark.svg", placeholder: "/images/brand/logo-placeholder.svg", alt: "", width: 44, height: 44, decorative: true },
  }),
  hero: Object.freeze({
    desktop: { src: "/images/hero.webp", placeholder: "/images/hero/hero-placeholder.svg", alt: "전국 지역별 맞춤 수업 안내", width: 1983, height: 793 },
    mobile: { src: "/images/hero-mobile.webp", placeholder: "/images/hero/hero-placeholder.svg", alt: "전국 지역별 맞춤 수업 안내", width: 1983, height: 793 },
  }),
  subjects: Object.freeze({
    english: { src: "/assets/subjects/english.webp", placeholder: "/images/categories/english-placeholder.svg", alt: "영어 맞춤 수업", width: 1024, height: 1024 },
    "english-conversation": { src: "/assets/subjects/english-conversation.webp", placeholder: "/images/categories/english-placeholder.svg", alt: "영어회화 수업", width: 1024, height: 1024 },
    "business-english": { src: "/assets/subjects/business-english.webp", placeholder: "/images/categories/english-placeholder.svg", alt: "비즈니스 영어 수업", width: 1024, height: 1024 },
    "exam-prep": { src: "/assets/subjects/exam-prep.webp", placeholder: "/images/categories/exam-placeholder.svg", alt: "시험 대비 수업", width: 1024, height: 1024 },
    toeic: { src: "/assets/subjects/toeic.webp", placeholder: "/images/categories/exam-placeholder.svg", alt: "TOEIC 수업", width: 1024, height: 1024 },
    opic: { src: "/assets/subjects/opic.webp", placeholder: "/images/categories/exam-placeholder.svg", alt: "OPIC 수업", width: 1024, height: 1024 },
    ielts: { src: "/assets/subjects/ielts.webp", placeholder: "/images/categories/exam-placeholder.svg", alt: "IELTS 수업", width: 1024, height: 1024 },
    toefl: { src: "/assets/subjects/toefl.webp", placeholder: "/images/categories/exam-placeholder.svg", alt: "TOEFL 수업", width: 1024, height: 1024 },
    japanese: { src: "/assets/subjects/japanese.webp", placeholder: "/images/categories/japanese-placeholder.svg", alt: "일본어회화 수업", width: 1024, height: 1024 },
    hsk: { src: "/assets/subjects/hsk.webp", alt: "중국어 및 HSK 맞춤 수업", width: 1024, height: 1024 },
    fallback: { src: "/assets/subjects/fallback.webp", alt: "맞춤형 수업 안내", width: 1024, height: 1024 },
  }),
  targets: Object.freeze({
    adult: { src: "/assets/targets/adult.webp", alt: "성인 맞춤 수업", width: 800, height: 600 },
    worker: { src: "/assets/targets/worker.webp", alt: "직장인 맞춤 수업", width: 800, height: 600 },
    college: { src: "/assets/targets/college.webp", alt: "대학생 맞춤 수업", width: 800, height: 600 },
    "high-school": { src: "/assets/targets/high-school.webp", alt: "고등학생 맞춤 수업", width: 800, height: 600 },
    "middle-school": { src: "/assets/targets/middle-school.webp", alt: "중학생 맞춤 수업", width: 800, height: 600 },
    elementary: { src: "/assets/targets/elementary.webp", alt: "초등학생 맞춤 수업", width: 800, height: 600 },
    fallback: { src: "/assets/targets/fallback.webp", alt: "대상별 맞춤 수업", width: 800, height: 600 },
  }),
  cta: Object.freeze({
    consultation: { src: "/assets/cta/consultation.webp", placeholder: "/images/cta/consultation-placeholder.svg", alt: "맞춤 학습 상담", width: 1000, height: 700 },
    levelTest: { src: "/assets/cta/level-test.webp", placeholder: "/images/process/level-test-placeholder.svg", alt: "맞춤 레벨 테스트", width: 1000, height: 700 },
    fallback: { src: "/assets/cta/fallback.webp", alt: "수업 상담 안내", width: 1000, height: 700 },
  }),
  features: Object.freeze({
    personal: { src: "/assets/features/personal.webp", placeholder: "/images/features/personal-placeholder.svg", alt: "1:1 맞춤 수업", width: 1024, height: 1024 },
    nationwide: { src: "/assets/features/nationwide.webp", placeholder: "/images/features/management-placeholder.svg", alt: "전국 지역별 수업", width: 1024, height: 1024 },
    management: { src: "/assets/features/management.webp", placeholder: "/images/features/management-placeholder.svg", alt: "목표별 학습 관리", width: 1024, height: 1024 },
    levelTest: { src: "/assets/features/level-test.webp", placeholder: "/images/process/level-test-placeholder.svg", alt: "무료 테스트 수업", width: 1024, height: 1024 },
  }),
  process: Object.freeze({
    levelTest: { src: "/assets/process/consultation.webp", placeholder: "/images/process/level-test-placeholder.svg", alt: "수업 상담", width: 1024, height: 1024 },
    plan: { src: "/assets/process/level-check.webp", placeholder: "/images/process/study-plan-placeholder.svg", alt: "레벨 확인", width: 1024, height: 1024 },
    lesson: { src: "/assets/process/custom-plan.webp", placeholder: "/images/process/lesson-placeholder.svg", alt: "맞춤 학습 계획", width: 1024, height: 1024 },
    feedback: { src: "/assets/process/lesson-start.webp", placeholder: "/images/process/feedback-placeholder.svg", alt: "수업 시작", width: 1024, height: 1024 },
  }),
  icons: Object.freeze({
    search: { src: "/assets/icons/search.svg", alt: "", width: 24, height: 24, decorative: true },
    location: { src: "/assets/icons/location.svg", alt: "", width: 24, height: 24, decorative: true },
    book: { src: "/assets/icons/book.svg", alt: "", width: 24, height: 24, decorative: true },
    target: { src: "/assets/icons/target.svg", alt: "", width: 24, height: 24, decorative: true },
    phone: { src: "/assets/icons/phone.svg", alt: "", width: 24, height: 24, decorative: true },
    calendar: { src: "/assets/icons/calendar.svg", alt: "", width: 24, height: 24, decorative: true },
    check: { src: "/assets/icons/check.svg", alt: "", width: 24, height: 24, decorative: true },
    arrow: { src: "/assets/icons/arrow.svg", alt: "", width: 24, height: 24, decorative: true },
  }),
  og: Object.freeze({
    default: { src: "/assets/og/default-og.webp", placeholder: "/images/hero/hero-placeholder.svg", alt: "Kim's English 맞춤 수업 안내", width: 1200, height: 630 },
  }),
  favicon: Object.freeze({
    ico: { src: "/assets/logo/favicon.ico", placeholder: "/images/brand/favicon.ico" },
    svg: { src: "/assets/logo/logo-mark.svg", placeholder: "/images/brand/favicon.svg" },
    appleTouch: { src: "/assets/logo/apple-touch-icon.png", placeholder: "/images/brand/apple-touch-icon.svg" },
    manifest: "/images/brand/site.webmanifest",
  }),
  fallback: Object.freeze({
    image: { src: "/assets/fallback/image-placeholder.svg", alt: "이미지 준비 중", width: 800, height: 600 },
  }),
});
