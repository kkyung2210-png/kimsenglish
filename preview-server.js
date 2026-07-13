// 별도 프로그램 없이 Node.js의 기본 기능으로 dist 폴더를 미리 봅니다.
const http = require("http");
const fs = require("fs");
const path = require("path");

// 자동 생성 결과만 보여 주므로 실제 Netlify 배포 화면과 같습니다.
const root = path.join(__dirname, "dist");
const port = 8080;
const types = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".xml":"application/xml; charset=utf-8", ".txt":"text/plain; charset=utf-8" };

// 요청받은 주소와 같은 폴더의 index.html을 찾아 보여 줍니다.
const server = http.createServer((request, response) => {
  try {
    const urlPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    let filePath = path.resolve(root, urlPath.replace(/^\/+/, ""));
    if (!filePath.startsWith(root)) return response.writeHead(403).end("접근할 수 없습니다.");
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return response.writeHead(404, { "Content-Type":"text/plain; charset=utf-8" }).end("페이지를 찾을 수 없습니다.");
    response.writeHead(200, { "Content-Type":types[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(500, { "Content-Type":"text/plain; charset=utf-8" }).end("미리보기 서버에서 오류가 발생했습니다.");
  }
});

// 실행 주소와 종료 방법을 터미널에 표시합니다.
server.listen(port, "127.0.0.1", () => {
  console.log(`미리보기 실행 중: http://localhost:${port}/`);
  console.log("끝내려면 터미널에서 Ctrl+C를 누르세요.");
});
server.on("error", (error) => { console.error(error.code === "EADDRINUSE" ? `${port}번 주소가 이미 사용 중입니다.` : error.message); process.exit(1); });
