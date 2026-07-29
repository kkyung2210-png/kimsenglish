const { issue } = require("./rules");

function pageKey(document) {
  return document.slug || "__home__";
}

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") return "/";
  if (/\.[a-z0-9]+$/i.test(pathname)) return pathname;
  return `/${pathname.replace(/^\/+|\/+$/g, "")}/`;
}

function resolveInternalHref(href, currentPath, baseUrl) {
  const clean = String(href || "").trim();
  if (!clean || /^(?:mailto:|tel:|sms:)/i.test(clean)) return { type: "skip" };
  if (/^javascript:/i.test(clean)) return { type: "temporary", href: clean };
  if (clean === "#") return { type: "temporary", href: clean };
  if (clean.startsWith("#")) return { type: "anchor", path: currentPath, hash: clean };
  try {
    const absolute = new URL(clean, `${baseUrl}${currentPath}`);
    if (absolute.origin !== new URL(baseUrl).origin) return { type: "external" };
    return { type: "internal", path: normalizePathname(absolute.pathname), hash: absolute.hash };
  } catch {
    return { type: "invalid", href: clean };
  }
}

/** 모든 페이지의 outgoing/incoming Map을 한 번만 만들어 깨진 링크와 깊이를 계산합니다. */
function checkLinks(documents, baseUrl, config) {
  const byPath = new Map(documents.map((document) => [document.urlPath, document]));
  const outgoing = new Map(documents.map((document) => [document.urlPath, new Set()]));
  const incoming = new Map(documents.map((document) => [document.urlPath, new Set()]));
  const issuesBySlug = new Map(documents.map((document) => [pageKey(document), []]));
  const brokenLinks = [];

  for (const document of documents) {
    const pageIssues = issuesBySlug.get(pageKey(document));
    const repeated = new Map();
    for (const link of document.links) {
      if (!link.text) pageIssues.push(issue("WARNING", "accessibility", "anchor-text-empty", "Anchor text가 비어 있습니다.", { href: link.href }));
      const resolved = resolveInternalHref(link.href, document.urlPath, baseUrl);
      if (resolved.type === "temporary") pageIssues.push(issue("WARNING", "internalLinks", "temporary-link", "임시 링크가 남아 있습니다.", { href: link.href }));
      if (resolved.type === "invalid") pageIssues.push(issue("ERROR", "internalLinks", "link-invalid", "해석할 수 없는 링크입니다.", { href: link.href }));
      if (resolved.type !== "internal") continue;
      repeated.set(resolved.path, (repeated.get(resolved.path) || 0) + 1);
      if (resolved.path === document.urlPath && !resolved.hash) pageIssues.push(issue("INFO", "internalLinks", "self-link", "현재 페이지를 다시 가리키는 링크가 있습니다.", { href: link.href }));
      if (!byPath.has(resolved.path)) {
        const broken = { slug: pageKey(document), sourceUrl: document.urlPath, href: link.href, targetPath: resolved.path };
        brokenLinks.push(broken);
        pageIssues.push(issue("ERROR", "internalLinks", "broken-internal-link", "존재하지 않는 내부 페이지로 연결됩니다.", broken));
        continue;
      }
      outgoing.get(document.urlPath).add(resolved.path);
      if (resolved.path !== document.urlPath) incoming.get(resolved.path).add(document.urlPath);
    }
    const overRepeated = [...repeated.entries()].filter(([, count]) => count > config.linkRepeatLimit);
    if (overRepeated.length) pageIssues.push(issue("WARNING", "internalLinks", "link-over-repeated", "같은 내부링크가 한 페이지에서 과도하게 반복됩니다.", { links: overRepeated.slice(0, 10) }));
    if (outgoing.get(document.urlPath).size < (document.pageType === "regular" ? config.minimumInternalLinks.regular : document.pageType.startsWith("hub-") ? config.minimumInternalLinks.hub : config.minimumInternalLinks.home)) {
      pageIssues.push(issue("WARNING", "internalLinks", "internal-links-too-few", "내부링크 수가 설정 기준보다 적습니다.", { count: outgoing.get(document.urlPath).size }));
    }
  }

  const depths = new Map([["/", 0]]);
  const queue = ["/"];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const target of outgoing.get(current) || []) {
      if (depths.has(target)) continue;
      depths.set(target, depths.get(current) + 1);
      queue.push(target);
    }
  }

  const orphanPages = [];
  for (const document of documents) {
    if (document.urlPath === "/" || /\bnoindex\b/i.test(document.robots)) continue;
    const noIncoming = incoming.get(document.urlPath).size === 0;
    const unreachable = !depths.has(document.urlPath);
    if (noIncoming || unreachable) {
      const orphan = { slug: pageKey(document), urlPath: document.urlPath, noIncoming, unreachable };
      orphanPages.push(orphan);
      issuesBySlug.get(pageKey(document)).push(issue("WARNING", "internalLinks", "orphan-page", "메인페이지 내부링크 구조에서 도달할 수 없는 페이지입니다.", orphan));
    }
    const depth = depths.get(document.urlPath);
    if (depth !== undefined && depth > config.maximumClickDepth) issuesBySlug.get(pageKey(document)).push(issue("WARNING", "internalLinks", "click-depth-high", `클릭 깊이가 설정 기준 ${config.maximumClickDepth}을 초과합니다.`, { depth }));
    if (document.pageType === "regular") {
      const hubConnected = [...outgoing.get(document.urlPath)].some((target) => target.startsWith("/hub/")) || [...incoming.get(document.urlPath)].some((source) => source.startsWith("/hub/"));
      if (!hubConnected) issuesBySlug.get(pageKey(document)).push(issue("WARNING", "internalLinks", "hub-not-connected", "Hub 페이지와 연결되어 있지 않습니다."));
    }
  }

  const statsBySlug = new Map(documents.map((document) => [pageKey(document), {
    outgoingLinks: [...outgoing.get(document.urlPath)], incomingLinks: [...incoming.get(document.urlPath)],
    depth: depths.get(document.urlPath) ?? null,
  }]));
  return { brokenLinks, orphanPages, issuesBySlug, statsBySlug, outgoing, incoming, depths };
}

module.exports = { checkLinks, normalizePathname, resolveInternalHref };
