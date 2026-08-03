/**
 * Smart Search 브라우저 번들
 * 원본 엔진은 utils/search/의 normalize, tokenize, synonyms, ranking, search 모듈로 나뉩니다.
 * 브라우저에서는 외부 라이브러리 없이 이 파일 하나와 search-index.json만 사용합니다.
 */
(() => {
  "use strict";

  const INDEX_URL = "/search-index.json";
  const RECENT_PAGE_KEY = "kimsenglish-recent-pages";
  const RECENT_QUERY_KEY = "kimsenglish-recent-searches";
  const MAX_RESULTS = 8;
  const MAX_RECENT_PAGES = 5;
  const MAX_RECENT_QUERIES = 10;
  const FIELDS = ["keyword", "title", "region", "province", "subject", "target"];
  const SYNONYMS = Object.freeze({
    "영회": "영어회화", "영어": "영어회화", "english": "영어회화",
    "일어": "일본어", "일본어회화": "일본어", "japanese": "일본어",
    "토스": "토익스피킹", "toeic speaking": "토익스피킹",
    "아이엘츠": "ielts", "아이엘스": "ielts", "오픽": "opic",
    "시험대비": "시험", "안냥": "안양",
  });
  const runtime = typeof window !== "undefined" ? window : globalThis;
  let searchIndexPromise = null;
  let engineFactory = createSearchEngine;

  function normalizeBase(value) {
    return String(value || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
  }

  function tokenize(value) {
    return normalizeBase(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }

  function normalizeQuery(value) {
    const raw = String(value || "").trim();
    const tokens = tokenize(raw).map((token) => SYNONYMS[token] || token);
    return { raw, text: tokens.join(" "), compact: tokens.join("") };
  }

  function compactText(value) {
    return normalizeBase(value).replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function levenshtein(left, right, maximum = Infinity) {
    const a = normalizeBase(left);
    const b = normalizeBase(right);
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (Math.abs(a.length - b.length) > maximum) return maximum + 1;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row += 1) {
      const current = [row];
      let rowMinimum = row;
      for (let column = 1; column <= b.length; column += 1) {
        const cost = a[row - 1] === b[column - 1] ? 0 : 1;
        const value = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost);
        current.push(value);
        rowMinimum = Math.min(rowMinimum, value);
      }
      if (rowMinimum > maximum) return maximum + 1;
      previous = current;
    }
    return previous[b.length];
  }

  function closestToken(token, vocabulary) {
    if (!token || token.length < 2 || vocabulary.has(token)) return token;
    const limit = token.length <= 4 ? 1 : 2;
    let best = token;
    let bestDistance = limit + 1;
    for (const candidate of vocabulary) {
      if (Math.abs(candidate.length - token.length) > limit) continue;
      const distance = levenshtein(token, candidate, limit);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
        if (distance === 1) break;
      }
    }
    return best;
  }

  function prepareItem(item) {
    const normalized = Object.fromEntries(FIELDS.map((field) => [field, normalizeQuery(item[field]).text]));
    const combined = FIELDS.map((field) => normalized[field]).join(" ");
    return { item, normalized, combined, compact: compactText(combined), tokens: [...new Set(tokenize(combined))] };
  }

  function createVocabulary(items) {
    const vocabulary = new Set(Object.values(SYNONYMS));
    for (const item of items) {
      for (const field of ["province", "region", "subject", "target"]) {
        const value = normalizeQuery(item[field]).text;
        if (!value) continue;
        vocabulary.add(value);
        tokenize(value).forEach((token) => vocabulary.add(token));
      }
    }
    return vocabulary;
  }

  function correctQuery(value, vocabulary) {
    const normalized = normalizeQuery(value);
    const originalTokens = tokenize(normalized.text);
    const tokens = originalTokens.map((token) => closestToken(token, vocabulary));
    return { ...normalized, text: tokens.join(" "), compact: tokens.join(""), tokens, corrected: tokens.join(" ") !== originalTokens.join(" ") };
  }

  function rankItem(prepared, query) {
    const values = prepared.normalized;
    const everyTokenMatches = query.tokens.every((token) => prepared.combined.includes(token));
    const compactMatches = query.compact.length >= 2 && prepared.compact.includes(query.compact);
    if (!everyTokenMatches && !compactMatches) return -1;
    let score = 0;
    if (query.tokens.some((token) => values.region === token || values.province === token)) score += 50;
    if (values.subject && query.tokens.some((token) => values.subject.includes(token) || token.includes(values.subject))) score += 40;
    if (values.target && query.tokens.some((token) => values.target.includes(token) || token.includes(values.target))) score += 30;
    if (query.tokens.every((token) => values.keyword.includes(token) || values.title.includes(token))) score += 20;
    if (compactMatches || query.tokens.some((token) => prepared.combined.includes(token))) score += 10;
    if (values.keyword === query.text || values.title === query.text) score += 60;
    return score;
  }

  function rankResults(preparedItems, query, limit) {
    return preparedItems
      .map((prepared) => ({ prepared, score: rankItem(prepared, query) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.prepared.item.title.localeCompare(b.prepared.item.title, "ko"))
      .slice(0, limit)
      .map((entry) => ({ ...entry.prepared.item, score: entry.score }));
  }

  function closestResults(preparedItems, query, limit = 5) {
    const queryTokens = query.tokens.length ? query.tokens : [query.compact];
    return preparedItems
      .map((prepared) => {
        const distance = queryTokens.reduce((total, token) => {
          let best = Math.max(3, token.length);
          for (const candidate of prepared.tokens) best = Math.min(best, levenshtein(token, candidate, 3));
          return total + best;
        }, 0);
        return { prepared, distance };
      })
      .sort((a, b) => a.distance - b.distance || a.prepared.item.title.localeCompare(b.prepared.item.title, "ko"))
      .slice(0, limit)
      .map((entry) => ({ ...entry.prepared.item, score: Math.max(0, 20 - entry.distance), closest: true }));
  }

  function countPopular(items, field, limit) {
    const counts = new Map();
    for (const item of items) {
      const label = field(item);
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).slice(0, limit).map(([label]) => label);
  }

  function makeRecommendations(items, result, limit = 4) {
    if (!result) return [];
    const selected = [];
    const used = new Set([result.slug, result.title]);
    for (const candidate of items) {
      if (candidate.region !== result.region || candidate.slug === result.slug || used.has(candidate.title)) continue;
      used.add(candidate.title);
      selected.push(candidate);
      if (selected.length >= limit) break;
    }
    return selected;
  }

  /** 향후 AI 검색으로 교체할 때 이 객체의 search() 인터페이스만 유지하면 됩니다. */
  function createSearchEngine(items) {
    const source = Array.isArray(items) ? items : [];
    const prepared = source.map(prepareItem);
    const vocabulary = createVocabulary(source);
    const closestSeen = new Set();
    const closestPrepared = prepared.filter((entry) => {
      const key = `${entry.item.province}|${entry.item.subject}`;
      if (closestSeen.has(key)) return false;
      closestSeen.add(key);
      return true;
    });
    return {
      items: source,
      popular: countPopular(source, (item) => [item.region, item.subject].filter(Boolean).join(" "), 5),
      popularRegions: countPopular(source, (item) => item.region, 12),
      search(value, options = {}) {
        const startedAt = runtime.performance?.now ? runtime.performance.now() : Date.now();
        const normalized = correctQuery(value, vocabulary);
        const limit = options.limit || MAX_RESULTS;
        let results = rankResults(prepared, normalized, limit);
        let usedClosest = false;
        if (!results.length && normalized.compact) {
          results = closestResults(closestPrepared, normalized, Math.min(5, limit));
          usedClosest = true;
        }
        const endedAt = runtime.performance?.now ? runtime.performance.now() : Date.now();
        return {
          query: String(value || "").trim(),
          normalizedQuery: normalized.text,
          correctedQuery: normalized.corrected ? normalized.text : "",
          results,
          recommendations: makeRecommendations(source, results[0]),
          usedClosest,
          elapsedMs: Number((endedAt - startedAt).toFixed(2)),
        };
      },
    };
  }

  function debounce(callback, delay = 200) {
    let timer = null;
    return (...args) => {
      runtime.clearTimeout(timer);
      timer = runtime.setTimeout(() => callback(...args), delay);
    };
  }

  function loadSearchIndex() {
    if (!searchIndexPromise) {
      searchIndexPromise = fetch(INDEX_URL, { credentials: "same-origin" })
        .then((response) => {
          if (!response.ok) throw new Error(`검색 색인을 불러오지 못했습니다. (${response.status})`);
          return response.json();
        })
        .then((items) => engineFactory(Array.isArray(items) ? items : []));
    }
    return searchIndexPromise;
  }

  function readStorage(key, limit) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value.slice(0, limit) : [];
    } catch { return []; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장이 막혀도 검색은 계속됩니다. */ }
  }

  function saveRecentPage() {
    const path = runtime.location.pathname.replace(/index\.html$/, "");
    if (path === "/" || path === "") return;
    const slug = path.replace(/^\/+|\/+$/g, "");
    const entry = { slug, title: document.title, href: `/${slug}/` };
    writeStorage(RECENT_PAGE_KEY, [entry, ...readStorage(RECENT_PAGE_KEY, MAX_RECENT_PAGES).filter((item) => item.slug !== slug)].slice(0, MAX_RECENT_PAGES));
  }

  function saveRecentQuery(query) {
    const value = String(query || "").trim();
    if (!value) return;
    writeStorage(RECENT_QUERY_KEY, [value, ...readStorage(RECENT_QUERY_KEY, MAX_RECENT_QUERIES).filter((item) => item !== value)].slice(0, MAX_RECENT_QUERIES));
  }

  function createChip(label, onClick) {
    const button = document.createElement("button");
    button.className = "search-chip";
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => onClick(label));
    return button;
  }

  function initializeHomeSearch() {
    const lead = document.querySelector(".home-hero-copy .lead");
    if (!lead) return;
    const section = document.createElement("section");
    section.className = "hero-search smart-search";
    section.setAttribute("aria-labelledby", "hero-search-title");
    section.innerHTML = `
      <h2 class="sr-only" id="hero-search-title">지역 또는 수업 검색</h2>
      <form class="search-form" role="search" novalidate>
        <label class="sr-only" for="site-search-input">지역 또는 수업명을 검색하세요</label>
        <div class="search-control"><span class="search-icon" aria-hidden="true"></span>
          <input id="site-search-input" type="search" inputmode="search" autocomplete="off" placeholder="지역 또는 수업명을 검색하세요"
            role="combobox" aria-autocomplete="list" aria-controls="site-search-results" aria-expanded="false">
          <button class="search-submit" type="submit">검색</button>
        </div>
        <div class="search-results smart-results" id="site-search-results" role="listbox" aria-label="검색 결과" hidden></div>
        <p class="search-status sr-only" role="status" aria-live="polite"></p>
      </form>`;
    lead.after(section);

    const form = section.querySelector(".search-form");
    const input = section.querySelector("input");
    const resultsBox = section.querySelector(".search-results");
    const status = section.querySelector(".search-status");
    let activeIndex = -1;
    let currentResponse = null;

    function closeResults() {
      activeIndex = -1;
      resultsBox.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }

    function runShortcut(query) {
      input.value = query;
      input.focus();
      saveRecentQuery(query);
      renderRecentQueries();
      updateResults(query);
    }

    function renderChips(container, labels) {
      container.replaceChildren(...labels.map((label) => createChip(label, runShortcut)));
    }

    function renderRecentQueries() {
      const values = readStorage(RECENT_QUERY_KEY, MAX_RECENT_QUERIES);
      const row = section.querySelector(".recent-query-row");
      if (!row) return;
      row.hidden = !values.length;
      if (values.length) renderChips(section.querySelector(".recent-queries"), values);
    }

    function renderRecentPages() {
      const values = readStorage(RECENT_PAGE_KEY, MAX_RECENT_PAGES);
      const row = section.querySelector(".recent-page-row");
      if (!row) return;
      row.hidden = !values.length;
      if (!values.length) return;
      const container = section.querySelector(".recent-pages");
      container.replaceChildren(...values.map((item) => {
        const link = document.createElement("a");
        link.className = "search-chip";
        link.href = item.href;
        link.textContent = item.title;
        return link;
      }));
    }

    function makeResultCard(item, index) {
      const link = document.createElement("a");
      link.className = "smart-result-card";
      link.id = `search-result-${index}`;
      link.href = `/${item.slug}/`;
      link.setAttribute("role", "option");
      link.setAttribute("aria-selected", "false");
      link.innerHTML = '<span class="smart-result-copy"><strong></strong><span class="smart-result-location"></span><span class="smart-result-subject"></span></span><span class="smart-result-action">바로가기 →</span>';
      link.querySelector("strong").textContent = item.title || item.keyword;
      link.querySelector(".smart-result-location").textContent = [item.province, item.region].filter(Boolean).join(" ");
      link.querySelector(".smart-result-subject").textContent = [item.target, item.subject].filter(Boolean).join(" · ");
      link.addEventListener("click", () => saveRecentQuery(input.value));
      return link;
    }

    function renderResponse(response) {
      currentResponse = response;
      activeIndex = -1;
      resultsBox.replaceChildren();
      const heading = document.createElement("div");
      heading.className = "smart-result-heading";
      if (response.usedClosest) heading.textContent = "정확한 결과가 없어 가장 가까운 결과를 추천합니다.";
      else if (response.correctedQuery) heading.textContent = `“${response.correctedQuery}” 검색으로 교정했습니다.`;
      else heading.textContent = `검색 결과 ${response.results.length}개`;
      resultsBox.append(heading);
      response.results.forEach((item, index) => resultsBox.append(makeResultCard(item, index)));

      if (response.recommendations.length) {
        const recommendations = document.createElement("div");
        recommendations.className = "search-recommendations";
        const label = document.createElement("strong");
        label.textContent = "관련 검색 추천";
        const chips = document.createElement("div");
        chips.className = "search-chips";
        response.recommendations.forEach((item) => chips.append(createChip(item.title, runShortcut)));
        recommendations.append(label, chips);
        resultsBox.append(recommendations);
      }
      const speed = document.createElement("small");
      speed.className = "search-speed";
      speed.textContent = `검색 처리 ${response.elapsedMs.toFixed(1)}ms`;
      resultsBox.append(speed);
      resultsBox.hidden = false;
      input.setAttribute("aria-expanded", "true");
      status.textContent = response.usedClosest ? "가장 가까운 결과 5개를 표시했습니다." : `검색 결과 ${response.results.length}개를 표시했습니다.`;
    }

    async function updateResults(query) {
      if (!String(query || "").trim()) { closeResults(); return; }
      try {
        const engine = await loadSearchIndex();
        renderResponse(engine.search(query, { limit: MAX_RESULTS }));
      } catch {
        resultsBox.hidden = false;
        resultsBox.textContent = "검색 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
        input.setAttribute("aria-expanded", "true");
      }
    }

    function activateResult(nextIndex) {
      const options = [...resultsBox.querySelectorAll('.smart-result-card[role="option"]')];
      if (!options.length) return;
      activeIndex = (nextIndex + options.length) % options.length;
      options.forEach((option, index) => {
        const selected = index === activeIndex;
        option.classList.toggle("is-active", selected);
        option.setAttribute("aria-selected", String(selected));
      });
      input.setAttribute("aria-activedescendant", options[activeIndex].id);
      options[activeIndex].scrollIntoView({ block: "nearest" });
    }

    const debouncedSearch = debounce((value) => updateResults(value), 200);
    input.addEventListener("input", () => debouncedSearch(input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); activateResult(activeIndex + 1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); activateResult(activeIndex - 1); }
      else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        const item = currentResponse?.results[activeIndex];
        if (item) { saveRecentQuery(input.value); runtime.location.assign(`/${item.slug}/`); }
      } else if (event.key === "Escape") { event.preventDefault(); closeResults(); }
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveRecentQuery(input.value);
      renderRecentQueries();
      if (currentResponse?.results.length) runtime.location.assign(`/${currentResponse.results[Math.max(0, activeIndex)].slug}/`);
      else updateResults(input.value);
    });
    document.addEventListener("click", (event) => { if (!section.contains(event.target)) closeResults(); });

    renderRecentQueries();
    renderRecentPages();
    // 검색 인덱스와 최근 데이터 로직은 유지하되 Hero에는 보조 목록을 표시하지 않습니다.
    loadSearchIndex().catch(() => {});
  }

  const api = {
    createSearchEngine,
    normalizeQuery,
    levenshtein,
    debounce,
    addRecentQuery: saveRecentQuery,
    getRecentQueries: () => readStorage(RECENT_QUERY_KEY, MAX_RECENT_QUERIES),
    setEngineFactory(factory) { if (typeof factory === "function") engineFactory = factory; },
  };
  if (typeof window !== "undefined") window.KimsSearch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => { saveRecentPage(); initializeHomeSearch(); });
  }
})();
