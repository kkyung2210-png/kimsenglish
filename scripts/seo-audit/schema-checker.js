const crypto = require("crypto");
const { issue } = require("./rules");

function flattenSchemas(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(flattenSchemas);
  const items = [value];
  if (Array.isArray(value["@graph"])) items.push(...value["@graph"].flatMap(flattenSchemas));
  return items;
}

function schemaHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function checkSchema(document, canonicalUrl) {
  const problems = [];
  const roots = [];
  for (const text of document.jsonLdTexts) {
    try { roots.push(JSON.parse(text)); }
    catch (error) { problems.push(issue("ERROR", "schema", "schema-json-invalid", `JSON-LD 문법 오류: ${error.message}`)); }
  }
  if (!document.jsonLdTexts.length) problems.push(issue("ERROR", "schema", "schema-missing", "JSON-LD가 없습니다."));
  const schemas = roots.flatMap(flattenSchemas);
  if (roots.some((root) => !root["@context"])) problems.push(issue("ERROR", "schema", "schema-context-missing", "JSON-LD @context가 없습니다."));
  for (const schema of schemas) {
    if (!schema["@type"] && !schema["@context"] && !schema["@graph"]) problems.push(issue("ERROR", "schema", "schema-type-missing", "Schema @type이 없습니다."));
    if (Object.values(schema).some((value) => value === "" || value === null)) problems.push(issue("WARNING", "schema", "schema-empty-value", `빈 Schema 값이 있습니다: ${schema["@type"] || "unknown"}`));
    if (["WebPage", "Organization", "WebSite"].includes(schema["@type"]) && !schema.name) problems.push(issue("WARNING", "schema", "schema-name-missing", `${schema["@type"]} Schema name이 없습니다.`));
    if (schema.url && ["WebPage", "WebSite"].includes(schema["@type"]) && schema.url !== canonicalUrl && !(schema["@type"] === "WebSite" && new URL(schema.url).pathname === "/")) {
      problems.push(issue("ERROR", "schema", "schema-url-mismatch", `${schema["@type"]} URL이 현재 canonical과 다릅니다.`, { actual: schema.url, expected: canonicalUrl }));
    }
  }
  const breadcrumbs = schemas.filter((schema) => schema["@type"] === "BreadcrumbList");
  for (const breadcrumb of breadcrumbs) {
    if (!Array.isArray(breadcrumb.itemListElement) || !breadcrumb.itemListElement.length) problems.push(issue("ERROR", "schema", "breadcrumb-schema-invalid", "BreadcrumbList itemListElement가 없습니다."));
    else breadcrumb.itemListElement.forEach((item, index) => {
      if (item["@type"] !== "ListItem" || item.position !== index + 1 || !item.name) problems.push(issue("ERROR", "schema", "breadcrumb-schema-invalid", "BreadcrumbList의 순서 또는 필수값이 잘못되었습니다."));
    });
  }
  if (document.pageType !== "home" && !breadcrumbs.length) problems.push(issue("WARNING", "schema", "breadcrumb-schema-missing", "BreadcrumbList Schema가 없습니다."));
  const faqSchemas = schemas.filter((schema) => schema["@type"] === "FAQPage");
  if (document.faqQuestions.length && !faqSchemas.length) problems.push(issue("WARNING", "schema", "faq-schema-missing", "화면 FAQ에 대응하는 FAQPage Schema가 없습니다."));
  for (const faqSchema of faqSchemas) {
    const schemaQuestions = (faqSchema.mainEntity || []).map((entry) => entry.name).filter(Boolean);
    if (JSON.stringify(schemaQuestions) !== JSON.stringify(document.faqQuestions)) problems.push(issue("ERROR", "schema", "faq-schema-mismatch", "FAQPage 질문과 화면 FAQ 질문이 일치하지 않습니다."));
    if ((faqSchema.mainEntity || []).some((entry) => !entry.acceptedAnswer?.text)) problems.push(issue("ERROR", "schema", "faq-schema-answer-missing", "FAQPage 답변이 비어 있습니다."));
  }
  const seen = new Set();
  for (const schema of schemas.filter((item) => item["@type"])) {
    const key = schemaHash(schema);
    if (seen.has(key)) problems.push(issue("WARNING", "schema", "schema-duplicated", `동일한 ${schema["@type"]} Schema가 중복 출력됩니다.`));
    seen.add(key);
  }
  return { issues: problems, schemaTypes: [...new Set(schemas.map((schema) => schema["@type"]).filter(Boolean))] };
}

module.exports = { checkSchema, flattenSchemas };
