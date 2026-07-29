'use strict';

const REPORT_FILES = Object.freeze({
  summary: '/data/summary.json',
  pages: '/data/pages.json',
  coverage: '/data/coverage.json',
  queries: '/data/queries.json',
});

const state = {
  reports: null,
  searchText: '',
  indexFilter: 'all',
  currentPage: 1,
  pageSize: 50,
};

const numberFormatter = new Intl.NumberFormat('ko-KR');
const percentFormatter = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

document.addEventListener('DOMContentLoaded', function () {
  bindControls();
  loadReports(false);
});

function bindControls() {
  document.getElementById('reload-button').addEventListener('click', function () {
    loadReports(true);
  });

  document.getElementById('page-search').addEventListener('input', function (event) {
    state.searchText = normalizeText(event.target.value);
    state.currentPage = 1;
    renderPageDetails();
  });

  document.getElementById('index-filter').addEventListener('change', function (event) {
    state.indexFilter = event.target.value;
    state.currentPage = 1;
    renderPageDetails();
  });

  document.getElementById('previous-page').addEventListener('click', function () {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      renderPageDetails();
    }
  });

  document.getElementById('next-page').addEventListener('click', function () {
    const totalPages = getTotalDetailPages();
    if (state.currentPage < totalPages) {
      state.currentPage += 1;
      renderPageDetails();
    }
  });
}

async function loadReports(forceReload) {
  setLoading(true);

  try {
    const cacheSuffix = forceReload ? '?time=' + Date.now() : '';
    const entries = await Promise.all(
      Object.entries(REPORT_FILES).map(async function ([name, url]) {
        const response = await fetch(url + cacheSuffix, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(name + ' 보고서를 읽지 못했습니다. HTTP ' + response.status);
        }
        return [name, await response.json()];
      })
    );

    state.reports = Object.fromEntries(entries);
    state.currentPage = 1;
    renderDashboard();
    announce('Search Console 보고서를 불러왔습니다.');
  } catch (error) {
    showError(error.message || String(error));
    announce('보고서를 불러오지 못했습니다.');
  } finally {
    setLoading(false);
  }
}

function renderDashboard() {
  const summary = state.reports.summary;

  renderSource(summary);
  renderMetrics(summary);
  renderTopPages(state.reports.pages.items || []);
  renderTopQueries(state.reports.queries.items || []);
  renderCoverage(state.reports.coverage);
  renderPageDetails();

  document.getElementById('report-period').textContent =
    (summary.period && summary.period.startDate ? summary.period.startDate : '-') +
    ' ~ ' +
    (summary.period && summary.period.endDate ? summary.period.endDate : '-');
  document.getElementById('generated-at').textContent =
    formatDateTime(summary.generatedAt);
}

function renderSource(summary) {
  const badge = document.getElementById('source-badge');
  const source = summary.source || {};
  const isMock = source.mode !== 'api';

  badge.textContent = isMock ? 'Mock 데이터' : 'Google API';
  badge.className = 'source-badge ' + (isMock ? 'source-badge--mock' : 'source-badge--api');

  const notice = document.getElementById('source-notice');
  notice.classList.remove('notice--error');
  notice.textContent = source.notice || (
    isMock
      ? '현재는 Google API 없이 예시 데이터를 표시합니다.'
      : 'Google Search Console에서 가져온 데이터를 표시합니다.'
  );
}

function renderMetrics(summary) {
  const metrics = [
    ['색인된 페이지', formatNumber(summary.indexedPages), '정상 확인된 페이지'],
    ['색인되지 않음', formatNumber(summary.notIndexedPages), '확인이 필요한 페이지'],
    ['전체 클릭', formatNumber(summary.totalClicks), '선택 기간 합계'],
    ['전체 노출', formatNumber(summary.totalImpressions), '선택 기간 합계'],
    ['평균 CTR', formatPercent(summary.averageCtr), '클릭률'],
    ['평균 게재순위', formatDecimal(summary.averagePosition), '낮을수록 상위'],
    ['색인 문제', formatNumber(summary.coverageIssues), 'Warning으로 표시'],
    ['색인 상태 미확인', formatNumber(summary.unknownIndexPages), 'API 권한에 따라 표시'],
  ];

  const container = document.getElementById('metric-grid');
  clearElement(container);
  metrics.forEach(function (metric) {
    const card = createElement('article', 'metric-card');
    card.appendChild(createElement('p', 'metric-card__label', metric[0]));
    card.appendChild(createElement('strong', 'metric-card__value', metric[1]));
    card.appendChild(createElement('span', 'metric-card__caption', metric[2]));
    container.appendChild(card);
  });
}

function renderTopPages(items) {
  const body = document.getElementById('top-pages-body');
  clearElement(body);

  items.slice(0, 20).forEach(function (item) {
    const row = document.createElement('tr');
    appendCell(row, item.title || item.keyword || item.slug);
    appendCell(row, formatNumber(item.clicks), 'numeric');
    appendCell(row, formatNumber(item.impressions), 'numeric');
    appendCell(row, formatPercent(item.ctr), 'numeric');
    appendCell(row, formatDecimal(item.averagePosition), 'numeric');
    body.appendChild(row);
  });

  renderEmptyRow(body, items.length, 5, '표시할 페이지 데이터가 없습니다.');
}

function renderTopQueries(items) {
  const body = document.getElementById('top-queries-body');
  clearElement(body);

  items.slice(0, 20).forEach(function (item) {
    const row = document.createElement('tr');
    appendCell(row, item.query);
    appendCell(row, formatNumber(item.clicks), 'numeric');
    appendCell(row, formatNumber(item.impressions), 'numeric');
    appendCell(row, formatPercent(item.ctr), 'numeric');
    appendCell(row, formatDecimal(item.averagePosition), 'numeric');
    body.appendChild(row);
  });

  renderEmptyRow(body, items.length, 5, '표시할 검색어 데이터가 없습니다.');
}

function renderCoverage(coverage) {
  const container = document.getElementById('coverage-list');
  clearElement(container);
  const issues = coverage.issues || [];

  if (!issues.length) {
    container.appendChild(
      createElement('p', 'empty-state', '현재 보고서에서 발견된 색인 문제가 없습니다.')
    );
    return;
  }

  issues.forEach(function (issue) {
    const card = createElement('article', 'coverage-item coverage-item--warning');
    const heading = createElement('div', 'coverage-item__heading');
    heading.appendChild(createElement('strong', '', issue.state || '색인 문제'));
    heading.appendChild(createElement('span', 'warning-count', formatNumber(issue.count) + '개'));
    card.appendChild(heading);

    const examples = createElement('ul', 'coverage-item__examples');
    (issue.examples || []).slice(0, 5).forEach(function (example) {
      examples.appendChild(createElement('li', '', example.title || example.url));
    });
    card.appendChild(examples);
    container.appendChild(card);
  });
}

function renderPageDetails() {
  if (!state.reports) return;

  const filtered = getFilteredPages();
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.currentPage = Math.min(state.currentPage, totalPages);

  const start = (state.currentPage - 1) * state.pageSize;
  const visibleItems = filtered.slice(start, start + state.pageSize);
  const body = document.getElementById('page-details-body');
  clearElement(body);

  visibleItems.forEach(function (item) {
    const row = document.createElement('tr');
    if (item.indexed === false) row.classList.add('row-warning');

    const pageCell = document.createElement('td');
    const link = createElement('a', 'page-link', item.title || item.keyword || item.slug);
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    pageCell.appendChild(link);
    pageCell.appendChild(createElement('small', 'page-path', '/' + item.slug + '/'));
    row.appendChild(pageCell);

    const statusCell = document.createElement('td');
    statusCell.appendChild(createIndexBadge(item.indexed));
    row.appendChild(statusCell);

    appendCell(row, formatNumber(item.clicks), 'numeric');
    appendCell(row, formatNumber(item.impressions), 'numeric');
    appendCell(row, formatPercent(item.ctr), 'numeric');
    appendCell(row, formatDecimal(item.averagePosition), 'numeric');
    appendCell(row, item.lastCrawled ? formatDateTime(item.lastCrawled) : '-', 'date-cell');
    body.appendChild(row);
  });

  renderEmptyRow(body, visibleItems.length, 7, '조건에 맞는 페이지가 없습니다.');

  document.getElementById('page-count').textContent =
    '총 ' + formatNumber(filtered.length) + '개';
  document.getElementById('page-position').textContent =
    state.currentPage + ' / ' + totalPages;
  document.getElementById('previous-page').disabled = state.currentPage <= 1;
  document.getElementById('next-page').disabled = state.currentPage >= totalPages;
}

function getFilteredPages() {
  const items = state.reports.pages.items || [];
  return items.filter(function (item) {
    const matchesStatus =
      state.indexFilter === 'all' ||
      (state.indexFilter === 'indexed' && item.indexed === true) ||
      (state.indexFilter === 'not-indexed' && item.indexed === false) ||
      (state.indexFilter === 'unknown' && item.indexed === null);

    if (!matchesStatus) return false;
    if (!state.searchText) return true;

    const searchable = normalizeText([
      item.title,
      item.keyword,
      item.slug,
      item.province,
      item.region,
      item.subject,
      item.target,
    ].filter(Boolean).join(' '));
    return searchable.includes(state.searchText);
  });
}

function getTotalDetailPages() {
  return Math.max(1, Math.ceil(getFilteredPages().length / state.pageSize));
}

function createIndexBadge(indexed) {
  if (indexed === true) return createElement('span', 'status status--success', '색인됨');
  if (indexed === false) return createElement('span', 'status status--warning', '확인 필요');
  return createElement('span', 'status status--neutral', '미확인');
}

function appendCell(row, value, className) {
  row.appendChild(createElement('td', className || '', value));
}

function renderEmptyRow(body, itemCount, columnCount, message) {
  if (itemCount) return;
  const row = document.createElement('tr');
  const cell = createElement('td', 'empty-table', message);
  cell.colSpan = columnCount;
  row.appendChild(cell);
  body.appendChild(row);
}

function setLoading(isLoading) {
  const button = document.getElementById('reload-button');
  button.disabled = isLoading;
  button.textContent = isLoading ? '불러오는 중…' : '데이터 다시 불러오기';
  document.body.classList.toggle('is-loading', isLoading);
}

function showError(message) {
  const notice = document.getElementById('source-notice');
  notice.textContent = message;
  notice.classList.add('notice--error');
}

function announce(message) {
  document.getElementById('live-region').textContent = message;
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase().replace(/\s+/g, '');
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

function formatPercent(value) {
  return percentFormatter.format(Number(value) || 0) + '%';
}

function formatDecimal(value) {
  return percentFormatter.format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
