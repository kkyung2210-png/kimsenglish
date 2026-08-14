const fs = require("fs");
const path = require("path");
const { brandTemplateValues, escapeHtml, renderTemplate } = require("./generate-pages");
const { makeHubSchema } = require("./generate-schema");
const { resolveHubAsset } = require("./utils/assets/resolve-asset");
const { renderImageBox } = require("./utils/assets/image-html");

const HUB_TYPES = ["province", "region", "subject", "target"];

function key(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

function add(map, groupKey, page) {
  const normalized = key(groupKey);
  if (!normalized) return;
  if (!map.has(normalized)) map.set(normalized, []);
  map.get(normalized).push(page);
}

function buildClusterMaps(pages) {
  const maps = { province: new Map(), region: new Map(), subject: new Map(), target: new Map() };
  for (const page of pages) {
    add(maps.province, page.province, page);
    add(maps.region, `${page.province}|${page.region}`, page);
    add(maps.subject, page.subject, page);
    add(maps.target, page.target, page);
  }
  return maps;
}

function uniqueRepresentatives(pages, field, limit = 12) {
  const representatives = new Map();
  for (const page of pages) {
    const value = page[field];
    const groupKey = key(value);
    if (!groupKey) continue;
    const current = representatives.get(groupKey);
    if (!current || page.slug.length < current.slug.length) representatives.set(groupKey, page);
  }
  return [...representatives.values()]
    .sort((a, b) => String(a[field]).localeCompare(String(b[field]), "ko"))
    .slice(0, limit);
}

function selectPopular(clusterPages, representativeSlug, relatedIndex, limit = 12) {
  const clusterSlugs = new Set(clusterPages.map((page) => page.slug));
  const pageLookup = new Map(clusterPages.map((page) => [page.slug, page]));
  const preferred = [representativeSlug, ...(relatedIndex[representativeSlug]?.popularRelated || [])];
  const result = [];
  const used = new Set();
  const addSlug = (slug) => {
    if (used.has(slug) || !clusterSlugs.has(slug) || result.length >= limit) return;
    used.add(slug);
    result.push(pageLookup.get(slug));
  };
  preferred.forEach(addSlug);
  [...clusterPages]
    .sort((a, b) => Number(Boolean(a.target)) - Number(Boolean(b.target)) || a.title.localeCompare(b.title, "ko"))
    .forEach((page) => addSlug(page.slug));
  return result;
}

function selectRecent(clusterPages, limit = 8) {
  return [...clusterPages].sort((a, b) => {
    const dateOrder = String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    if (dateOrder) return dateOrder;
    return Number(b.id || 0) - Number(a.id || 0) || b.slug.localeCompare(a.slug);
  }).slice(0, limit);
}

function hubCopy(type, hub) {
  const label = hub.region || hub.value;
  const copies = {
    province: {
      title: `${label} 지역별 회화·시험 과외 안내 | Kim's English`,
      description: `${label}에서 찾을 수 있는 영어회화, 일본어, 시험 대비와 대상별 맞춤 수업을 지역과 과목 기준으로 정리했습니다.`,
      heading: `${label} 지역별 맞춤 수업`,
      intro: `${label} 안의 지역과 과목 및 학습 대상을 한곳에서 비교하고 필요한 수업 페이지로 이동할 수 있습니다.`,
    },
    region: {
      title: `${label} 회화·시험 과외 모음 | Kim's English`,
      description: `${hub.province} ${label}의 영어회화, 일본어, 시험 대비 수업을 과목과 수강 대상별로 살펴볼 수 있습니다.`,
      heading: `${label}에서 찾을 수 있는 맞춤 수업`,
      intro: `${hub.province} ${label}의 영어회화, 일본어와 시험 대비 수업을 과목과 대상별로 살펴볼 수 있습니다.`,
    },
    subject: {
      title: `${label} 지역별 맞춤 수업 안내 | Kim's English`,
      description: `${label} 수업을 지역과 수강 대상별로 비교하고 원하는 과목 페이지를 바로 찾을 수 있습니다.`,
      heading: `${label} 수업을 지역과 대상별로 찾아보세요`,
      intro: `${label} 학습 목적과 현재 수준에 맞는 페이지를 지역과 대상 기준으로 비교할 수 있습니다.`,
    },
    target: {
      title: `${label} 회화·시험 맞춤 수업 안내 | Kim's English`,
      description: `${label} 영어회화, 일본어와 시험 대비 수업을 지역과 과목별로 비교할 수 있습니다.`,
      heading: `${label} 맞춤 수업`,
      intro: `${label} 수업을 회화, 시험, 업무 등 배우는 목적에 따라 지역별로 찾아볼 수 있습니다.`,
    },
  };
  return { label, ...copies[type] };
}

function makeFaqs(type, copy) {
  const label = copy.label;
  return [
    { question: `${label} Hub에서는 무엇을 찾을 수 있나요?`, answer: `${label}와 관련된 지역, 과목 및 대상별 수업 페이지를 한곳에서 확인할 수 있습니다.` },
    { question: "어떤 페이지부터 확인하면 좋을까요?", answer: "현재 지역과 배우려는 과목 및 학습 대상을 먼저 선택하면 가까운 수업을 찾기 쉽습니다." },
    { question: "목록에 원하는 수업이 없으면 어떻게 하나요?", answer: "추천 탐색과 관련 Hub를 이용하면 가까운 지역이나 비슷한 목적의 수업을 계속 확인할 수 있습니다." },
  ];
}

function pageCards(pages) {
  return pages.map((page) => `<article class="hub-page-card"><p class="card-meta">${escapeHtml([page.province, page.region, page.target || "전체 대상"].filter(Boolean).join(" · "))}</p><h3><a href="/${page.slug}/">${escapeHtml(page.title)}</a></h3><p>${escapeHtml(page.description)}</p></article>`).join("");
}

function pageChips(pages, labelOf) {
  return pages.map((page) => `<li><a href="/${page.slug}/">${escapeHtml(labelOf(page))}</a></li>`).join("");
}

function hubChips(hubs, labelOf) {
  return hubs.slice(0, 10).map((hub) => `<li><a href="${escapeHtml(hub.url)}">${escapeHtml(labelOf(hub))}</a></li>`).join("");
}

function generateHubPages({ root, outputPath, data, hubIndex, relatedIndex }) {
  const template = data.template;
  const clusterMaps = buildClusterMaps(data.pages);
  const generated = [];

  for (const type of HUB_TYPES) {
    for (const hub of hubIndex[type]) {
      const cluster = clusterMaps[type].get(key(hub.value)) || [];
      if (!cluster.length) continue;
      const copy = hubCopy(type, hub);
      const canonicalUrl = `${data.baseUrl}${hub.url}`;
      const popular = selectPopular(cluster, hub.slug, relatedIndex);
      const regions = uniqueRepresentatives(cluster, "region");
      const subjects = uniqueRepresentatives(cluster, "subject");
      const targets = uniqueRepresentatives(cluster, "target");
      const recent = selectRecent(cluster);
      const faqs = makeFaqs(type, copy);
      const hubTypeLabel = ({ province: "시도", region: "지역", subject: "과목", target: "대상" })[type];
      const breadcrumbs = [
        { "@type": "ListItem", position: 1, name: "홈", item: `${data.baseUrl}/` },
        { "@type": "ListItem", position: 2, name: `${hubTypeLabel} Hub` },
        { "@type": "ListItem", position: 3, name: copy.label, item: canonicalUrl },
      ];
      const structuredData = makeHubSchema({
        canonicalUrl, title: copy.title, description: copy.description, faqs, breadcrumbItems: breadcrumbs,
        popularPages: popular.map((page) => ({ title: page.title, url: `${data.baseUrl}/${page.slug}/` })),
      });
      const otherHubs = HUB_TYPES.map((otherType) => ({
        type: otherType,
        label: ({ province: "시도별 Hub", region: "지역별 Hub", subject: "과목별 Hub", target: "대상별 Hub" })[otherType],
        items: hubIndex[otherType].filter((item) => item.url !== hub.url),
      }));
      const faqHtml = faqs.map((faq, index) => `<details class="faq-item"${index === 0 ? " open" : ""}><summary><h3>${escapeHtml(faq.question)}</h3></summary><div class="faq-answer"><p>${escapeHtml(faq.answer)}</p></div></details>`).join("");
      const recommendationHtml = otherHubs.map((group) => `<section class="hub-group"><h3>${escapeHtml(group.label)}</h3><ul class="hub-link-chips">${hubChips(group.items, (item) => item.region || item.value)}</ul></section>`).join("");
      const hubAsset = resolveHubAsset(type, hub, root);
      const hubMedia = renderImageBox(hubAsset, `hub-hero-media asset-${hubAsset.key}`, { alt: `${copy.label} 맞춤 수업 안내` });
      const main = `<section class="hero hub-hero"><div class="container"><nav class="breadcrumb" aria-label="현재 위치"><ol><li><a href="/">홈</a></li><li>${escapeHtml(hubTypeLabel)} Hub</li><li aria-current="page">${escapeHtml(copy.label)}</li></ol></nav><div class="hub-hero-layout"><div><p class="eyebrow">Topic Cluster · ${escapeHtml(hubTypeLabel)} Hub</p><h1>${escapeHtml(copy.heading)}</h1><p class="lead">${escapeHtml(copy.intro)}</p></div>${hubMedia}</div></div></section>
      <section class="section hub-introduction"><div class="container"><div class="answer-box"><p class="answer-label">주제 소개</p><h2>${escapeHtml(copy.label)} 수업 Hub에서 확인할 내용</h2><p>${escapeHtml(copy.description)}</p></div></div></section>
      <section class="section section-soft"><div class="container"><div class="section-heading"><p class="section-kicker">인기 페이지</p><h2>${escapeHtml(copy.label)}에서 많이 찾는 수업</h2></div><div class="hub-page-grid">${pageCards(popular)}</div></div></section>
      <section class="section"><div class="container"><div class="section-heading"><p class="section-kicker">주제 연결</p><h2>${escapeHtml(copy.label)} 관련 지역·과목·대상</h2></div><div class="hub-topic-grid"><section class="hub-group"><h3>관련 지역</h3><ul class="hub-link-chips">${pageChips(regions, (page) => page.region)}</ul></section><section class="hub-group"><h3>관련 과목</h3><ul class="hub-link-chips">${pageChips(subjects, (page) => page.subject)}</ul></section><section class="hub-group"><h3>관련 대상</h3><ul class="hub-link-chips">${pageChips(targets, (page) => page.target)}</ul></section></div></div></section>
      <section class="section section-soft"><div class="container"><div class="section-heading"><p class="section-kicker">최근 페이지</p><h2>${escapeHtml(copy.label)}에서 최근 추가된 수업</h2></div><ul class="internal-link-chips">${pageChips(recent, (page) => page.title)}</ul></div></section>
      <section class="section" id="faq"><div class="container"><div class="section-heading"><p class="section-kicker">추천 FAQ</p><h2>${escapeHtml(copy.label)} Hub 자주 묻는 질문</h2></div><div class="faq-list">${faqHtml}</div></div></section>
      <section class="section section-soft hub-recommendation"><div class="container"><div class="section-heading"><p class="section-kicker">추천 탐색</p><h2>${escapeHtml(copy.label)}에서 다른 주제로 이동하기</h2></div><div class="hub-navigation-grid">${recommendationHtml}</div></div></section>
      <section class="section" id="consultation"><div class="container"><div class="cta"><h2>${escapeHtml(copy.label)} 맞춤 수업을 찾고 있나요?</h2><p>지역과 과목 및 학습 목표를 알려주시면 필요한 수업 방향을 확인할 수 있습니다.</p><a class="button" href="/#consultation">상담 신청하기</a></div></div></section>`;
      const html = renderTemplate(template, {
        ...brandTemplateValues({ slug: `hub/${type}/${hub.hubSlug}` }, data.baseUrl), LANG: "ko", TITLE: escapeHtml(copy.title), DESCRIPTION: escapeHtml(copy.description),
        CANONICAL_URL: escapeHtml(canonicalUrl), STRUCTURED_DATA: structuredData, NAV_LINK: "/#lessons", NAV_TEXT: "지역별 수업 보기",
        MAIN: main, MOBILE_CONTACT_URL: "/#consultation", FOOTER_LINK: "/", FOOTER_TEXT: "메인으로 돌아가기",
      });
      const folder = path.join(outputPath, "hub", type, hub.hubSlug);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, "index.html"), html, "utf8");
      generated.push({ type, label: copy.label, url: hub.url, canonicalUrl });
    }
  }
  return generated;
}

module.exports = { generateHubPages };
