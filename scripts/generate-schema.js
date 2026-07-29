/** JSON-LD 문자열을 안전하게 만들고 HTML 종료 태그 오해를 막습니다. */
function makeJsonLd(data) {
  return JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
}

/** 기존 지역 페이지 Schema 구조와 속성 순서를 그대로 유지합니다. */
function makePageSchema({ canonicalUrl, page, locationName, context, baseUrl, faqs, breadcrumbItems }) {
  return makeJsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": canonicalUrl, url: canonicalUrl, name: page.title, description: page.description, inLanguage: page.language, dateModified: page.updated_at || undefined },
      { "@type": "Service", name: page.title, description: page.description, serviceType: `${locationName} ${context.service}`, areaServed: { "@type": "AdministrativeArea", name: locationName }, audience: { "@type": "Audience", audienceType: page.target || "학습자" }, provider: { "@type": "Organization", name: "김선생 회화 과외", url: baseUrl } },
      { "@type": "FAQPage", mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) },
      { "@type": "BreadcrumbList", itemListElement: breadcrumbItems },
    ],
  });
}

function makeHubSchema({ canonicalUrl, title, description, faqs, breadcrumbItems, popularPages }) {
  return makeJsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": canonicalUrl, url: canonicalUrl, name: title, description, inLanguage: "ko" },
      { "@type": "ItemList", name: `${title} 추천 페이지`, itemListElement: popularPages.map((page, index) => ({ "@type": "ListItem", position: index + 1, name: page.title, url: page.url })) },
      { "@type": "FAQPage", mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) },
      { "@type": "BreadcrumbList", itemListElement: breadcrumbItems },
    ],
  });
}

module.exports = { makeHubSchema, makeJsonLd, makePageSchema };
