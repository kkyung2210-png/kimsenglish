'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { syncSearchConsole } = require('./sync-search-console');

const ROOT_DIR = path.resolve(__dirname, '..');
const DASHBOARD_DIR = path.join(ROOT_DIR, 'dashboard');
const REPORT_DIR = path.join(ROOT_DIR, 'reports', 'search-console');
const PORT = Number(process.env.DASHBOARD_PORT || 8081);

const ROUTES = Object.freeze({
  '/': { file: path.join(DASHBOARD_DIR, 'index.html'), type: 'text/html; charset=utf-8' },
  '/index.html': { file: path.join(DASHBOARD_DIR, 'index.html'), type: 'text/html; charset=utf-8' },
  '/dashboard.css': { file: path.join(DASHBOARD_DIR, 'dashboard.css'), type: 'text/css; charset=utf-8' },
  '/dashboard.js': { file: path.join(DASHBOARD_DIR, 'dashboard.js'), type: 'text/javascript; charset=utf-8' },
  '/data/summary.json': { file: path.join(REPORT_DIR, 'summary.json'), type: 'application/json; charset=utf-8' },
  '/data/pages.json': { file: path.join(REPORT_DIR, 'pages.json'), type: 'application/json; charset=utf-8' },
  '/data/coverage.json': { file: path.join(REPORT_DIR, 'coverage.json'), type: 'application/json; charset=utf-8' },
  '/data/queries.json': { file: path.join(REPORT_DIR, 'queries.json'), type: 'application/json; charset=utf-8' },
});

async function startDashboardServer() {
  // 보고서가 없거나 캐시가 만료되었으면 Mock/API 설정에 맞게 먼저 준비합니다.
  await syncSearchConsole({ forceRefresh: false });

  const server = http.createServer(function (request, response) {
    const url = new URL(request.url, 'http://localhost');
    const route = ROUTES[url.pathname];

    if (!route) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('페이지를 찾을 수 없습니다.');
      return;
    }

    fs.readFile(route.file, function (error, contents) {
      if (error) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('파일을 읽지 못했습니다.');
        return;
      }

      const isReport = url.pathname.startsWith('/data/');
      response.writeHead(200, {
        'Content-Type': route.type,
        'Cache-Control': isReport ? 'no-store' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(contents);
    });
  });

  server.listen(PORT, '127.0.0.1', function () {
    console.log('Index Intelligence Dashboard');
    console.log('http://127.0.0.1:' + PORT);
    console.log('종료하려면 Ctrl+C를 누르세요.');
  });

  return server;
}

if (require.main === module) {
  startDashboardServer().catch(function (error) {
    console.error('[Dashboard Error]', error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { startDashboardServer };
