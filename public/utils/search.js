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
  const WIZARD_STORAGE_KEY = "kimsenglish-wizard-state";
  const FIELDS = ["keyword", "title", "region", "province", "subject", "target"];
  const SYNONYMS = Object.freeze({
    "영회": "영어회화", "영어": "영어회화", "english": "영어회화",
    "일어": "일본어", "일본어회화": "일본어", "japanese": "일본어",
    "토스": "토익스피킹", "toeic speaking": "토익스피킹",
    "아이엘츠": "ielts", "아이엘스": "ielts", "오픽": "opic",
    "시험대비": "시험", "안냥": "안양",
  });
  // 단계 추가·삭제나 선택지 변경은 이 JSON 형태의 설정만 수정하면 됩니다.
  const WIZARD_CONFIG = Object.freeze([
    {
      id: "location", title: "지역 선택", description: "대표 지역을 선택하거나 직접 검색하세요.", searchable: true,
      options: [
        { label: "서울", value: "서울특별시", province: "서울특별시" }, { label: "경기", value: "경기도", province: "경기도" },
        { label: "부산", value: "부산광역시", province: "부산광역시" }, { label: "대구", value: "대구광역시", province: "대구광역시" },
        { label: "인천", value: "인천광역시", province: "인천광역시" }, { label: "대전", value: "대전광역시", province: "대전광역시" },
        { label: "광주", value: "광주광역시", province: "광주광역시" }, { label: "울산", value: "울산광역시", province: "울산광역시" },
        { label: "강원", value: "강원특별자치도", province: "강원특별자치도" }, { label: "제주", value: "제주특별자치도", province: "제주특별자치도" },
      ],
    },
    {
      id: "subject", title: "과목 선택", description: "배우고 싶은 수업을 선택하세요.",
      options: [
        { label: "영어회화", value: "영어회화" }, { label: "일본어회화", value: "일본어" },
        { label: "토익", value: "토익" }, { label: "토익스피킹", value: "토익스피킹" },
        { label: "오픽", value: "opic" }, { label: "아이엘츠", value: "ielts" },
        { label: "비즈니스 영어", value: "비즈니스영어" },
      ],
    },
    {
      id: "target", title: "대상 선택", description: "현재 학습 단계를 선택하세요.",
      options: [
        { label: "초등", value: "초등" }, { label: "중등", value: "중등" }, { label: "고등", value: "고등" },
        { label: "대학생", value: "대학생" }, { label: "성인", value: "성인" }, { label: "직장인", value: "직장인" },
      ],
    },
    {
      id: "goal", title: "목표 선택", description: "가장 중요한 학습 목표를 선택하세요.",
      options: [
        { label: "회화", value: "회화" }, { label: "시험", value: "시험" }, { label: "내신", value: "내신" },
        { label: "취업", value: "취업" }, { label: "유학", value: "유학" }, { label: "자격증", value: "자격증" },
      ],
    },
  ]);
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

  function prepareWizardIndex(items) {
    return (items || []).map((item) => ({
      item,
      province: compactText(normalizeQuery(item.province).text),
      region: compactText(normalizeQuery(item.region).text),
      subject: compactText(normalizeQuery(item.subject).text),
      target: compactText(normalizeQuery(item.target).text),
      searchable: compactText(normalizeQuery([item.keyword, item.title, item.subject].filter(Boolean).join(" ")).text),
    }));
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
    const wizardItems = prepareWizardIndex(source);
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
      wizardItems,
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

  const GOAL_TERMS = Object.freeze({
    "회화": ["회화", "일본어"],
    "시험": ["시험", "토익", "토익스피킹", "opic", "ielts"],
    "내신": ["내신", "초등", "중등", "고등"],
    "취업": ["취업", "면접", "비즈니스"],
    "유학": ["유학", "ielts", "토플"],
    "자격증": ["자격증", "토익", "토익스피킹", "opic", "ielts"],
  });
  const ADJACENT_PROVINCES = Object.freeze({
    "서울특별시": ["경기도", "인천광역시"],
    "경기도": ["서울특별시", "인천광역시", "강원특별자치도", "충청북도", "충청남도"],
    "인천광역시": ["서울특별시", "경기도"],
    "강원특별자치도": ["경기도", "충청북도", "경상북도"],
    "충청북도": ["경기도", "강원특별자치도", "충청남도", "세종특별자치시", "대전광역시", "경상북도"],
    "충청남도": ["경기도", "충청북도", "세종특별자치시", "대전광역시", "전북특별자치도"],
    "세종특별자치시": ["충청북도", "충청남도", "대전광역시"],
    "대전광역시": ["세종특별자치시", "충청북도", "충청남도"],
    "전북특별자치도": ["충청남도", "대전광역시", "광주광역시", "전라남도", "경상북도", "경상남도"],
    "광주광역시": ["전북특별자치도", "전라남도"],
    "전라남도": ["광주광역시", "전북특별자치도", "경상남도"],
    "경상북도": ["강원특별자치도", "충청북도", "전북특별자치도", "대구광역시", "경상남도", "울산광역시"],
    "대구광역시": ["경상북도", "경상남도"],
    "경상남도": ["전북특별자치도", "전라남도", "경상북도", "대구광역시", "울산광역시", "부산광역시"],
    "부산광역시": ["경상남도", "울산광역시"],
    "울산광역시": ["경상북도", "경상남도", "부산광역시"],
    "제주특별자치도": ["전라남도"],
  });

  function wizardMatch(value, candidate) {
    const left = String(value || "");
    const right = String(candidate || "");
    return Boolean(left && right && (left.includes(right) || right.includes(left)));
  }

  /** 지역 1000, 과목 300, 대상 200, 목표 100, 부분 일치 50점으로 계산합니다. */
  function recommendWizardPages(items, selections) {
    if (!items?.length) return { results: [], usedClosest: false, usedAdjacent: false, isPopular: true };
    const activeSelections = selections && typeof selections === "object" ? selections : {};
    const location = activeSelections.location || {};
    const locationProvince = compactText(normalizeQuery(location.province || location.value).text);
    const locationRegion = compactText(normalizeQuery(location.region).text);
    const hasLocation = Boolean(locationProvince || locationRegion);
    const subject = compactText(normalizeQuery(activeSelections.subject?.value).text);
    const target = compactText(normalizeQuery(activeSelections.target?.value).text);
    const goal = activeSelections.goal?.value || "";
    const goalTerms = goal ? (GOAL_TERMS[goal] || [goal]).map((term) => compactText(normalizeQuery(term).text)) : [];
    const hasFilters = Boolean(hasLocation || subject || target || goal);
    const adjacentProvinces = new Set(ADJACENT_PROVINCES[location.province || location.value] || []);
    const preparedItems = items[0]?.item ? items : prepareWizardIndex(items);
    const ranked = preparedItems.map((prepared) => {
      const sameProvince = locationProvince && wizardMatch(prepared.province, locationProvince);
      const locationMatch = !hasLocation ? false : locationRegion
        ? sameProvince && wizardMatch(prepared.region, locationRegion)
        : sameProvince;
      const adjacentMatch = hasLocation && !locationMatch && (locationRegion ? sameProvince : adjacentProvinces.has(prepared.item.province));
      const subjectMatch = Boolean(subject) && (wizardMatch(prepared.subject, subject) || wizardMatch(prepared.searchable, subject));
      const targetMatch = Boolean(target) && wizardMatch(prepared.target, target);
      const goalMatch = Boolean(goal) && goalTerms.some((term) => wizardMatch(prepared.searchable, term));
      const partialMatch = [subject, target, ...goalTerms].some((term) => term && prepared.searchable.includes(term));
      const locationScore = !hasLocation ? 0 : locationMatch ? 1000 : -1000;
      const score = locationScore + (subjectMatch ? 300 : 0) + (targetMatch ? 200 : 0) + (goalMatch ? 100 : 0) + (partialMatch ? 50 : 0);
      return { item: prepared.item, score, locationMatch, adjacentMatch };
    }).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "ko"));
    if (!hasFilters) {
      const popularSubjects = countPopular(preparedItems.map((entry) => entry.item), (item) => item.subject, 5);
      const selectedSubjects = new Set();
      const popular = [];
      for (const subjectName of popularSubjects) {
        const entry = ranked.find((candidate) => candidate.item.subject === subjectName && !selectedSubjects.has(subjectName));
        if (!entry) continue;
        selectedSubjects.add(subjectName);
        popular.push({ ...entry.item, wizardScore: 0 });
        if (popular.length === 3) break;
      }
      if (popular.length < 3) {
        popular.push(...ranked.slice(0, 3 - popular.length).map((entry) => ({ ...entry.item, wizardScore: 0 })));
      }
      return { results: popular, usedClosest: false, usedAdjacent: false, isPopular: true };
    }
    if (!hasLocation) {
      return {
        results: ranked.filter((entry) => entry.score > 0).slice(0, 3).map((entry) => ({ ...entry.item, wizardScore: entry.score })),
        usedClosest: false,
        usedAdjacent: false,
        isPopular: false,
      };
    }
    const sameLocation = ranked.filter((entry) => entry.locationMatch);
    const targetCount = sameLocation.length ? 3 : 5;
    const selected = sameLocation.slice(0, targetCount);
    if (selected.length < targetCount) {
      selected.push(...ranked.filter((entry) => entry.adjacentMatch).slice(0, targetCount - selected.length));
    }
    return {
      results: selected.sort((a, b) => b.score - a.score).map((entry) => ({ ...entry.item, wizardScore: entry.score })),
      usedClosest: sameLocation.length === 0,
      usedAdjacent: selected.some((entry) => entry.adjacentMatch),
      isPopular: false,
    };
  }

  function buildLocationChoices(items, query, limit = 18) {
    const normalized = compactText(query);
    if (!normalized) return [];
    const unique = new Map();
    for (const item of items || []) {
      const provinceKey = `province:${item.province}`;
      const provinceLabel = item.province;
      if (provinceLabel && !unique.has(provinceKey)) {
        unique.set(provinceKey, { label: provinceLabel, value: provinceLabel, province: provinceLabel, region: "" });
      }
      const regionKey = `region:${item.province}:${item.region}`;
      if (item.region && !unique.has(regionKey)) {
        unique.set(regionKey, {
          label: `${item.province} · ${item.region}`,
          value: item.region,
          province: item.province,
          region: item.region,
        });
      }
    }
    return [...unique.values()]
      .map((choice) => {
        const value = compactText(choice.value);
        const label = compactText(choice.label);
        const score = value === normalized ? 120 : label.includes(normalized) ? 100 : levenshtein(value, normalized, 1) <= 1 ? 10 : -1;
        return { choice, score };
      })
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.choice.label.localeCompare(b.choice.label, "ko"))
      .map((entry) => entry.choice)
      .slice(0, limit);
  }

  function readWizardState() {
    try {
      const saved = JSON.parse(localStorage.getItem(WIZARD_STORAGE_KEY) || "{}");
      return {
        selections: saved && typeof saved.selections === "object" ? saved.selections : {},
        currentStep: Number.isInteger(saved.currentStep) ? Math.max(0, Math.min(WIZARD_CONFIG.length - 1, saved.currentStep)) : 0,
      };
    } catch { return { selections: {}, currentStep: 0 }; }
  }

  function initializeWizard() {
    const hero = document.querySelector(".home-hero");
    const levelTest = document.querySelector(".level-test-section");
    if (!hero || !levelTest) return;
    const section = document.createElement("section");
    section.id = "lessons";
    section.className = "section wizard-section";
    section.setAttribute("aria-labelledby", "wizard-title");
    section.innerHTML = `
      <div class="container"><div class="wizard-card">
        <div class="wizard-header"><div><p class="section-kicker">맞춤 수업 찾기</p><h2 id="wizard-title">나에게 맞는 수업 찾기</h2><p>원하는 조건만 선택해도 바로 추천합니다. 선택이 많을수록 결과가 더 정확해집니다.</p></div><button class="wizard-reset" type="button">전체 초기화</button></div>
        <div class="wizard-progress" aria-label="선택 진행 상황"><span class="wizard-progress-bar"></span></div>
        <div class="wizard-selected" aria-live="polite"></div>
        <div class="wizard-steps"></div>
        <div class="wizard-region-directory-slot"></div>
        <div class="wizard-mobile-nav"><button class="wizard-back button-outline" type="button">이전</button><button class="wizard-next button-primary" type="button">다음 조건</button></div>
        <div class="wizard-results" aria-live="polite"></div>
      </div></div>`;
    levelTest.after(section);
    const regionDirectoryTemplate = document.querySelector("#wizard-region-directory-template");
    if (regionDirectoryTemplate) {
      section.querySelector(".wizard-region-directory-slot").append(regionDirectoryTemplate.content.cloneNode(true));
      regionDirectoryTemplate.remove();
    }

    const state = readWizardState();
    const stepsContainer = section.querySelector(".wizard-steps");
    const selectedContainer = section.querySelector(".wizard-selected");
    const resultsContainer = section.querySelector(".wizard-results");
    const progressBar = section.querySelector(".wizard-progress-bar");
    const backButton = section.querySelector(".wizard-back");
    const nextButton = section.querySelector(".wizard-next");
    let engine = null;

    function saveState() {
      writeStorage(WIZARD_STORAGE_KEY, state);
    }

    function selectChoice(stepIndex, choice) {
      const step = WIZARD_CONFIG[stepIndex];
      state.selections[step.id] = choice;
      if (stepIndex < WIZARD_CONFIG.length - 1) state.currentStep = stepIndex + 1;
      saveState();
      render();
    }

    function renderSelected() {
      selectedContainer.replaceChildren();
      WIZARD_CONFIG.forEach((step, index) => {
        const choice = state.selections[step.id];
        if (!choice) return;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "wizard-selected-chip";
        chip.innerHTML = `<span>${choice.label}</span><span class="wizard-chip-remove" aria-hidden="true">×</span>`;
        chip.setAttribute("aria-label", `${choice.label} 선택 삭제`);
        chip.addEventListener("click", () => {
          delete state.selections[step.id];
          state.currentStep = index;
          saveState();
          render();
        });
        selectedContainer.append(chip);
      });
      if (!selectedContainer.children.length) {
        const guide = document.createElement("span");
        guide.className = "wizard-selection-guide";
        guide.textContent = "조건을 선택하거나 인기 수업부터 살펴보세요.";
        selectedContainer.append(guide);
      }
    }

    function attachLocationSearch(article, stepIndex) {
      const input = article.querySelector(".wizard-location-input");
      const box = article.querySelector(".wizard-location-results");
      let choices = [];
      const showChoices = (query) => {
        choices = buildLocationChoices(engine?.items || [], query);
        box.replaceChildren(...choices.map((choice) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = choice.label;
          button.addEventListener("click", () => selectChoice(stepIndex, choice));
          return button;
        }));
        box.hidden = !choices.length;
      };
      input.addEventListener("input", debounce(() => showChoices(input.value), 120));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && choices.length) { event.preventDefault(); selectChoice(stepIndex, choices[0]); }
        else if (event.key === "Escape") { event.preventDefault(); box.hidden = true; }
      });
    }

    function renderSteps() {
      stepsContainer.replaceChildren();
      WIZARD_CONFIG.forEach((step, index) => {
        const article = document.createElement("article");
        article.className = `wizard-step${index === state.currentStep ? " is-active" : ""}${state.selections[step.id] ? " is-complete" : ""}`;
        article.dataset.step = String(index);
        article.setAttribute("aria-labelledby", `wizard-step-title-${index}`);
        article.innerHTML = `<div class="wizard-step-heading"><span>Step ${index + 1}</span><h3 id="wizard-step-title-${index}">${step.title}</h3><p>${step.description}</p></div><div class="wizard-options" role="group" aria-label="${step.title}"></div>`;
        const options = article.querySelector(".wizard-options");
        step.options.forEach((choice) => {
          const button = document.createElement("button");
          const selected = state.selections[step.id]?.value === choice.value;
          button.type = "button";
          button.className = `wizard-option${selected ? " is-selected" : ""}`;
          button.setAttribute("aria-pressed", String(selected));
          button.textContent = choice.label;
          button.addEventListener("click", () => selectChoice(index, choice));
          options.append(button);
        });
        if (step.searchable) {
          const search = document.createElement("div");
          search.className = "wizard-location-search";
          search.innerHTML = '<label class="sr-only" for="wizard-location-input">지역 검색</label><input class="wizard-location-input" id="wizard-location-input" type="search" autocomplete="off" placeholder="지역을 검색하세요 (예: 안양)"><div class="wizard-location-results" hidden></div>';
          article.append(search);
          attachLocationSearch(article, index);
        }
        stepsContainer.append(article);
      });
    }

    function renderResults() {
      resultsContainer.replaceChildren();
      if (!engine) {
        resultsContainer.innerHTML = '<p class="wizard-result-loading">맞춤 수업을 찾고 있습니다…</p>';
        return;
      }
      const response = recommendWizardPages(engine.wizardItems, state.selections);
      const heading = document.createElement("div");
      heading.className = "wizard-result-heading";
      const selectedCount = WIZARD_CONFIG.filter((step) => state.selections[step.id]).length;
      const resultTitle = response.isPopular ? "인기 수업" : response.usedClosest ? "선택 지역과 가까운 수업" : response.usedAdjacent ? "선택 지역과 인접 지역 수업" : "선택 조건에 맞는 수업";
      const resultGuide = response.isPopular
        ? "조건을 선택하면 내 상황에 더 가까운 수업으로 바로 갱신됩니다."
        : response.usedAdjacent
        ? "선택 지역 결과를 먼저 표시하고 부족한 결과만 인접 지역에서 보충했습니다."
        : response.usedClosest ? "선택 지역에 결과가 없어 인접 지역 페이지를 최대 5개 추천합니다." : `${selectedCount}개 조건을 반영해 점수가 높은 수업 페이지를 추천합니다.`;
      heading.innerHTML = `<p class="section-kicker">추천 결과</p><h3>${resultTitle}</h3><p>${resultGuide}</p>`;
      const grid = document.createElement("div");
      grid.className = "wizard-result-grid";
      response.results.forEach((item) => {
        const card = document.createElement("article");
        card.className = "wizard-result-card";
        const description = `${[item.province, item.region].filter(Boolean).join(" ")}에서 ${item.target || "학습자"} 대상 ${item.subject} 수업을 확인할 수 있습니다.`;
        card.innerHTML = '<div class="wizard-result-tags"></div><h4></h4><p></p><a class="button button-primary">바로가기</a>';
        const tags = card.querySelector(".wizard-result-tags");
        [item.region, item.subject, item.target].filter(Boolean).forEach((label) => {
          const tag = document.createElement("span"); tag.textContent = label; tags.append(tag);
        });
        card.querySelector("h4").textContent = item.title;
        card.querySelector("p").textContent = description;
        const link = card.querySelector("a");
        link.href = `/${item.slug}/`;
        link.setAttribute("aria-label", `${item.title} 페이지 바로가기`);
        grid.append(card);
      });
      resultsContainer.append(heading, grid);
      resultsContainer.classList.remove("is-updating");
      void resultsContainer.offsetWidth;
      resultsContainer.classList.add("is-updating");
    }

    function render() {
      renderSelected();
      renderSteps();
      const selectedCount = WIZARD_CONFIG.filter((step) => state.selections[step.id]).length;
      progressBar.style.transform = `scaleX(${selectedCount / WIZARD_CONFIG.length})`;
      backButton.disabled = state.currentStep === 0;
      nextButton.disabled = state.currentStep === WIZARD_CONFIG.length - 1;
      renderResults();
    }

    backButton.addEventListener("click", () => { if (state.currentStep > 0) { state.currentStep -= 1; saveState(); render(); } });
    nextButton.addEventListener("click", () => { if (state.currentStep < WIZARD_CONFIG.length - 1) { state.currentStep += 1; saveState(); render(); } });
    section.querySelector(".wizard-reset").addEventListener("click", () => {
      state.selections = {};
      state.currentStep = 0;
      saveState();
      render();
    });
    section.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.currentStep > 0 && !event.target.classList.contains("wizard-location-input")) {
        event.preventDefault();
        state.currentStep -= 1;
        saveState();
        render();
      }
    });

    render();
    loadSearchIndex().then((loadedEngine) => { engine = loadedEngine; render(); }).catch(() => {
      resultsContainer.innerHTML = '<p class="wizard-result-loading">추천 데이터를 불러오지 못했습니다.</p>';
    });
  }

  const api = {
    createSearchEngine,
    normalizeQuery,
    levenshtein,
    debounce,
    addRecentQuery: saveRecentQuery,
    getRecentQueries: () => readStorage(RECENT_QUERY_KEY, MAX_RECENT_QUERIES),
    WIZARD_CONFIG,
    recommendWizardPages,
    prepareWizardIndex,
    buildLocationChoices,
    saveWizardState: (state) => writeStorage(WIZARD_STORAGE_KEY, state),
    getWizardState: readWizardState,
    setEngineFactory(factory) { if (typeof factory === "function") engineFactory = factory; },
  };
  if (typeof window !== "undefined") window.KimsSearch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => { saveRecentPage(); initializeHomeSearch(); initializeWizard(); });
  }
})();
