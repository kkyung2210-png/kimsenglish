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
const descriptionIndex = rows[0].indexOf("description");
const slugIndex = rows[0].indexOf("slug");
if (descriptionIndex === -1 || slugIndex === -1) throw new Error("pages.csv에 slug 또는 description 열이 없습니다.");

const descriptions = new Map(loadPages().pages.map((page) => [page.slug, page.description]));
let updated = 0;
for (const row of rows.slice(1)) {
  const description = descriptions.get(row[slugIndex]);
  if (!description || row[descriptionIndex] === description) continue;
  row[descriptionIndex] = description;
  updated += 1;
}

fs.writeFileSync(csvPath, `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
console.log(`${updated}개 지역 페이지의 Hero 설명을 갱신했습니다.`);
