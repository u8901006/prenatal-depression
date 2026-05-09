#!/usr/bin/env node

import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DOCS_DIR = resolve("docs");
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function main() {
  let files;
  try {
    files = readdirSync(DOCS_DIR)
      .filter((f) => f.startsWith("prenatal-") && f.endsWith(".html") && f !== "index.html")
      .sort()
      .reverse();
  } catch {
    files = [];
  }

  const links = files.slice(0, 60).map((name) => {
    const date = name.replace("prenatal-", "").replace(".html", "");
    let dateDisplay = date;
    let weekday = "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [y, m, d] = date.split("-");
      dateDisplay = `${y}年${parseInt(m)}月${parseInt(d)}日`;
      const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      weekday = `（週${WEEKDAYS[dt.getDay() === 0 ? 6 : dt.getDay() - 1]}）`;
    }
    return `<li><a href="${name}">📅 ${dateDisplay}${weekday}</a></li>`;
  }).join("\n");

  const total = files.length;

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>產前憂鬱症文獻日報 · Prenatal Depression Research</title>
<meta name="description" content="產前憂鬱症文獻日報 - 每日自動彙整 PubMed 最新研究"/>
<style>
  :root { --bg: #f6f1e8; --surface: #fffaf2; --line: #d8c5ab; --text: #2b2118; --muted: #766453; --accent: #8c4f2b; --accent-soft: #ead2bf; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: radial-gradient(circle at top, #fff6ea 0, var(--bg) 55%, #ead8c6 100%); color: var(--text); font-family: "Noto Sans TC", "PingFang TC", "Helvetica Neue", Arial, sans-serif; min-height: 100vh; }
  .container { position: relative; z-index: 1; max-width: 640px; margin: 0 auto; padding: 80px 24px; }
  .logo { font-size: 48px; text-align: center; margin-bottom: 16px; }
  h1 { text-align: center; font-size: 24px; color: var(--text); margin-bottom: 8px; }
  .subtitle { text-align: center; color: var(--accent); font-size: 14px; margin-bottom: 48px; }
  .count { text-align: center; color: var(--muted); font-size: 13px; margin-bottom: 32px; }
  ul { list-style: none; }
  li { margin-bottom: 8px; }
  a { color: var(--text); text-decoration: none; display: block; padding: 14px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; transition: all 0.2s; font-size: 15px; }
  a:hover { background: var(--accent-soft); border-color: var(--accent); transform: translateX(4px); }
  .links-section { margin-top: 48px; display: flex; flex-direction: column; gap: 10px; }
  .link-item { display: flex; align-items: center; gap: 12px; padding: 12px 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; text-decoration: none; color: var(--text); font-size: 14px; transition: all 0.2s; }
  .link-item:hover { background: var(--accent-soft); border-color: var(--accent); }
  footer { margin-top: 56px; text-align: center; font-size: 12px; color: var(--muted); }
  footer a { display: inline; padding: 0; background: none; border: none; color: var(--muted); }
  footer a:hover { color: var(--accent); }
</style>
</head>
<body>
<div class="container">
  <div class="logo">🤰</div>
  <h1>產前憂鬱症文獻日報</h1>
  <p class="subtitle">Prenatal Depression Research · 每日自動更新</p>
  <p class="count">共 ${total} 期日報</p>
  <ul>${links}</ul>
  <div class="links-section">
    <a href="https://www.leepsyclinic.com/" class="link-item" target="_blank" rel="noopener">🏥 李政洋身心診所首頁</a>
    <a href="https://blog.leepsyclinic.com/" class="link-item" target="_blank" rel="noopener">📬 訂閱電子報</a>
    <a href="https://buymeacoffee.com/CYlee" class="link-item" target="_blank" rel="noopener">☕ Buy Me a Coffee</a>
  </div>
  <footer>
    <p>Powered by PubMed + Zhipu AI · <a href="https://github.com/u8901006/prenatal-depression">GitHub</a></p>
  </footer>
</div>
</body>
</html>`;

  writeFileSync(resolve(DOCS_DIR, "index.html"), html, "utf-8");
  console.log("Index page generated");
}

main();
