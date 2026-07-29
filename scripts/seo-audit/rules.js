const fs = require("fs");
const path = require("path");

function loadConfig(root) {
  const configPath = path.join(root, "config", "seo-audit.config.json");
  if (!fs.existsSync(configPath)) throw new Error(`SEO Audit 설정 파일을 찾을 수 없습니다: ${configPath}`);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const required = ["titleLength", "descriptionLength", "minimumTextLength", "minimumInternalLinks", "maximumClickDepth", "minimumFaqCount", "scoreWeights", "strictMode", "pageRules"];
  for (const key of required) if (!(key in config)) throw new Error(`SEO Audit 설정에 ${key} 값이 없습니다.`);
  return config;
}

function pageRule(config, pageType) {
  return config.pageRules[pageType === "regular" ? "regular" : pageType.startsWith("hub-") ? "hub" : "home"];
}

function thresholdByPageType(values, pageType) {
  if (pageType === "regular") return values.regular;
  if (pageType.startsWith("hub-")) return values.hub;
  return values.home;
}

function issue(severity, category, code, message, details = {}) {
  return { severity, category, code, message, ...details };
}

function calculateScore(issues, weights) {
  const deductions = new Map();
  for (const item of issues) {
    const weight = weights[item.category] || 0;
    const rate = item.severity === "ERROR" ? 0.5 : item.severity === "WARNING" ? 0.15 : 0.04;
    deductions.set(item.category, Math.min(weight, (deductions.get(item.category) || 0) + Math.max(0.5, weight * rate)));
  }
  return Math.max(0, Math.round(100 - [...deductions.values()].reduce((sum, value) => sum + value, 0)));
}

module.exports = { calculateScore, issue, loadConfig, pageRule, thresholdByPageType };
