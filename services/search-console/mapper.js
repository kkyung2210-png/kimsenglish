'use strict';

function cleanUrl(value) {
  return String(value || '').replace(/\?.*$/, '').replace(/#.*$/, '');
}

function slugFromUrl(value) {
  try {
    return new URL(cleanUrl(value)).pathname.replace(/^\/+|\/+$/g, '');
  } catch {
    return cleanUrl(value).replace(/^\/+|\/+$/g, '');
  }
}

function round(value, digits) {
  const precision = digits === undefined ? 2 : digits;
  const multiplier = 10 ** precision;
  return Math.round((Number(value) || 0) * multiplier) / multiplier;
}

function mapSearchConsoleData(raw, searchIndex) {
  const generatedAt = new Date().toISOString();
  const rowBySlug = new Map(
    (raw.pageRows || []).map(function (row) {
      return [slugFromUrl(row.keys && row.keys[0]), row];
    })
  );
  const inspectionBySlug = new Map(
    (raw.inspections || []).map(function (item) {
      return [slugFromUrl(item.url), item];
    })
  );
  const siteUrl = String(raw.siteUrl).replace(/\/?$/, '/');

  const pageItems = searchIndex.map(function (item) {
    const row = rowBySlug.get(item.slug) || {};
    const inspection = inspectionBySlug.get(item.slug);
    const clicks = Number(row.clicks || 0);
    const impressions = Number(row.impressions || 0);

    return {
      slug: item.slug,
      url: siteUrl + item.slug + '/',
      title: item.title,
      keyword: item.keyword,
      province: item.province,
      region: item.region,
      subject: item.subject,
      target: item.target,
      clicks: clicks,
      impressions: impressions,
      ctr: round(impressions ? clicks / impressions * 100 : Number(row.ctr || 0) * 100, 2),
      averagePosition: round(row.position || 0, 2),
      indexed: inspection ? Boolean(inspection.indexed) : null,
      coverageState: inspection ? inspection.coverageState : 'Unknown',
      lastCrawled: inspection ? inspection.lastCrawled : null,
    };
  }).sort(function (a, b) {
    return b.clicks - a.clicks ||
      b.impressions - a.impressions ||
      a.slug.localeCompare(b.slug);
  });

  const totalClicks = pageItems.reduce(function (sum, page) {
    return sum + page.clicks;
  }, 0);
  const totalImpressions = pageItems.reduce(function (sum, page) {
    return sum + page.impressions;
  }, 0);
  const weightedPosition = pageItems.reduce(function (sum, page) {
    return sum + page.averagePosition * page.impressions;
  }, 0);
  const indexedPages = pageItems.filter(function (page) {
    return page.indexed === true;
  }).length;
  const notIndexedPages = pageItems.filter(function (page) {
    return page.indexed === false;
  }).length;
  const unknownIndexPages = pageItems.filter(function (page) {
    return page.indexed === null;
  }).length;

  const issueMap = new Map();
  pageItems.filter(function (page) {
    return page.indexed === false;
  }).forEach(function (page) {
    if (!issueMap.has(page.coverageState)) issueMap.set(page.coverageState, []);
    issueMap.get(page.coverageState).push(page);
  });

  const issues = Array.from(issueMap.entries()).map(function ([state, pages]) {
    return {
      severity: 'WARNING',
      state: state,
      count: pages.length,
      examples: pages.slice(0, 20).map(function (page) {
        return { slug: page.slug, url: page.url, title: page.title };
      }),
    };
  }).sort(function (a, b) {
    return b.count - a.count;
  });

  const queryItems = (raw.queryRows || []).map(function (row) {
    const clicks = Number(row.clicks || 0);
    const impressions = Number(row.impressions || 0);
    return {
      query: row.keys && row.keys[0] || '',
      clicks: clicks,
      impressions: impressions,
      ctr: round(impressions ? clicks / impressions * 100 : Number(row.ctr || 0) * 100, 2),
      averagePosition: round(row.position || 0, 2),
    };
  }).filter(function (row) {
    return row.query;
  }).sort(function (a, b) {
    return b.clicks - a.clicks || b.impressions - a.impressions;
  }).slice(0, 500);

  const common = {
    schemaVersion: 1,
    generatedAt: generatedAt,
    source: raw.source,
    siteUrl: siteUrl,
    period: { startDate: raw.startDate, endDate: raw.endDate },
  };

  return {
    summary: {
      ...common,
      totalPages: pageItems.length,
      indexedPages: indexedPages,
      notIndexedPages: notIndexedPages,
      unknownIndexPages: unknownIndexPages,
      totalClicks: totalClicks,
      totalImpressions: totalImpressions,
      averageCtr: round(totalImpressions ? totalClicks / totalImpressions * 100 : 0, 2),
      averagePosition: round(
        totalImpressions ? weightedPosition / totalImpressions : 0,
        2
      ),
      coverageIssues: issues.reduce(function (sum, issue) {
        return sum + issue.count;
      }, 0),
    },
    pages: { ...common, count: pageItems.length, items: pageItems },
    coverage: {
      ...common,
      summary: {
        indexedPages: indexedPages,
        notIndexedPages: notIndexedPages,
        unknownIndexPages: unknownIndexPages,
        issueTypes: issues.length,
      },
      issues: issues,
    },
    queries: { ...common, count: queryItems.length, items: queryItems },
  };
}

module.exports = { cleanUrl, mapSearchConsoleData, round, slugFromUrl };
