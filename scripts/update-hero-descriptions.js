const fs = require("fs");
const path = require("path");
const { loadPages } = require("./generate-pages");

const root = path.resolve(__dirname, "..");
const csvPath = path.join(root, "pages.csv");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(value); value = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (value.length || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function csvCell(value) {
  const text = String(value || "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const rows = parseCsv(fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, ""));
const slugIndex = rows[0].indexOf("slug");
const contentColumns = ["description", "search_intent", "summary", "lesson_focus", "lesson_method", "lesson_result"];
const columnIndexes = Object.fromEntries(contentColumns.map((name) => [name, rows[0].indexOf(name)]));
if (slugIndex === -1 || Object.values(columnIndexes).some((index) => index === -1)) {
  throw new Error("pages.csv에 콘텐츠 갱신에 필요한 열이 없습니다.");
}

const generatedContent = new Map(loadPages().pages.map((page) => [page.slug, {
  description: page.description,
  search_intent: page.content.intent,
  summary: `핵심 고민: ${page.content.concern}`,
  lesson_focus: page.content.focus,
  lesson_method: page.content.method,
  lesson_result: page.content.result,
}]));
let updated = 0;
for (const row of rows.slice(1)) {
  const content = generatedContent.get(row[slugIndex]);
  if (!content) continue;
  let rowChanged = false;
  for (const [name, value] of Object.entries(content)) {
    const index = columnIndexes[name];
    if (row[index] === value) continue;
    row[index] = value;
    rowChanged = true;
  }
  if (rowChanged) updated += 1;
}

fs.writeFileSync(csvPath, `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
console.log(`${updated}개 지역 페이지의 공통 콘텐츠를 갱신했습니다.`);
