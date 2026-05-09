#!/usr/bin/env node

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PUBMED_SEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_FETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/efetch.fcgi";

const SEARCH_QUERIES = [
  `"prenatal depression"[tiab] OR "antenatal depression"[tiab] OR "antepartum depression"[tiab] OR "depression during pregnancy"[tiab] OR "depressive symptoms during pregnancy"[tiab]`,
  `"perinatal depression"[tiab] AND pregnan*[tiab]`,
  `"maternal depression"[tiab] AND (pregnan*[tiab] OR prenatal[tiab] OR antenatal[tiab])`,
  `("prenatal depression"[tiab] OR "antenatal depression"[tiab]) AND (screening[tiab] OR EPDS[tiab] OR PHQ-9[tiab])`,
  `("prenatal depression"[tiab] OR "antenatal depression"[tiab]) AND (treatment[tiab] OR CBT[tiab] OR SSRI[tiab] OR prevention[tiab])`,
  `("prenatal depression"[tiab] OR "antenatal depression"[tiab]) AND (cortisol[tiab] OR "HPA axis"[tiab] OR inflammation[tiab] OR cytokine*[tiab])`,
  `("prenatal depression"[tiab] OR "antenatal depression"[tiab]) AND ("vitamin D"[tiab] OR omega-3[tiab] OR nutrition[tiab] OR microbiome[tiab])`,
  `("prenatal depression"[tiab] OR "antenatal depression"[tiab]) AND ("intimate partner violence"[tiab] OR trauma[tiab] OR "social support"[tiab])`,
  `("prenatal depression"[tiab] OR "antenatal depression"[tiab]) AND (preterm[tiab] OR "birth weight"[tiab] OR "fetal"[tiab] OR "infant outcome*"[tiab])`,
  `("prenatal depression"[tiab] OR "antenatal depression"[tiab]) AND (sleep[tiab] OR insomnia[tiab] OR circadian[tiab])`,
  `("prenatal depression"[tiab] OR "antenatal depression"[tiab]) AND (epigenetic*[tiab] OR "DNA methylation"[tiab] OR placenta[tiab])`,
];

const HEADERS = { "User-Agent": "PrenatalDepressionBot/1.0 (research aggregator)" };

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { days: 7, maxPapers: 50, output: "papers.json" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days" && args[i + 1]) opts.days = parseInt(args[++i], 10);
    else if (args[i] === "--max-papers" && args[i + 1]) opts.maxPapers = parseInt(args[++i], 10);
    else if (args[i] === "--output" && args[i + 1]) opts.output = args[++i];
  }
  return opts;
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10).replace(/-/g, "/");
}

async function searchPapers(query, retmax) {
  const url = `${PUBMED_SEARCH}?db=pubmed&term=${encodeURIComponent(query)}&retmax=${retmax}&sort=date&retmode=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (resp.status === 429) {
        console.error(`[WARN] Rate limited on search, waiting ${(attempt + 1) * 3}s...`);
        await sleep((attempt + 1) * 3000);
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return data?.esearchresult?.idlist ?? [];
    } catch (e) {
      console.error(`[ERROR] PubMed search failed: ${e.message}`);
      if (attempt < 2) await sleep(2000);
    }
  }
  return [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDetails(pmids) {
  if (!pmids.length) return [];
  const batchSize = 20;
  const allPapers = [];
  for (let i = 0; i < pmids.length; i += batchSize) {
    const batch = pmids.slice(i, i + batchSize);
    const ids = batch.join(",");
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${encodeURIComponent(ids)}&retmode=xml`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
        if (resp.status === 429) {
          console.error(`[WARN] Rate limited on fetch, waiting ${(attempt + 1) * 5}s...`);
          await sleep((attempt + 1) * 5000);
          continue;
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const xml = await resp.text();
        allPapers.push(...parseXmlPapers(xml));
        break;
      } catch (e) {
        console.error(`[ERROR] PubMed fetch batch ${i / batchSize + 1} failed: ${e.message}`);
        if (attempt < 2) await sleep(3000);
      }
    }
    if (i + batchSize < pmids.length) await sleep(1500);
  }
  return allPapers;
}

function extractText(el, tag) {
  const m = el.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, "").trim();
}

function parseXmlPapers(xml) {
  const papers = [];
  const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let match;
  while ((match = articleRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractText(block, "ArticleTitle");
    const journal = extractText(block, "Title");
    const pmid = extractText(block, "PMID");

    const abstractParts = [];
    const absRegex = /<AbstractText[^>]*>([\s\\S]*?)<\/AbstractText>/g;
    let absMatch;
    while ((absMatch = absRegex.exec(block)) !== null) {
      const labelMatch = absMatch[0].match(/Label="([^"]*)"/);
      const label = labelMatch ? labelMatch[1] : "";
      const text = absMatch[1].replace(/<[^>]+>/g, "").trim();
      if (text) {
        abstractParts.push(label ? `${label}: ${text}` : text);
      }
    }
    const abstract = abstractParts.join(" ").slice(0, 2000);

    const year = extractText(block, "Year");
    const month = extractText(block, "Month");
    const day = extractText(block, "Day");
    const dateStr = [year, month, day].filter(Boolean).join(" ");

    const keywords = [];
    const kwRegex = /<Keyword>([\s\S]*?)<\/Keyword>/g;
    let kwMatch;
    while ((kwMatch = kwRegex.exec(block)) !== null) {
      const kw = kwMatch[1].trim();
      if (kw) keywords.push(kw);
    }

    const url = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "";

    papers.push({ pmid, title, journal, date: dateStr, abstract, url, keywords });
  }
  return papers;
}

function loadSummarizedPmids() {
  const path = resolve("data", "summarized_pmids.json");
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      return new Set(data.pmids || []);
    } catch {
      return new Set();
    }
  }
  return new Set();
}

async function main() {
  const opts = parseArgs();
  const dateAfter = getDateDaysAgo(opts.days);
  const dateFilter = `"${dateAfter}"[Date - Publication] : "3000"[Date - Publication]`;

  console.error(`[INFO] Searching PubMed for prenatal depression papers from last ${opts.days} days...`);

  const allPmids = new Set();
  const perQuery = Math.ceil(opts.maxPapers / SEARCH_QUERIES.length);

  for (let qi = 0; qi < SEARCH_QUERIES.length; qi++) {
    const baseQuery = SEARCH_QUERIES[qi];
    const fullQuery = `(${baseQuery}) AND ${dateFilter}`;
    const pmids = await searchPapers(fullQuery, perQuery);
    for (const id of pmids) allPmids.add(id);
    if (qi < SEARCH_QUERIES.length - 1) await sleep(1500);
  }

  const pmidList = [...allPmids].slice(0, opts.maxPapers);
  console.error(`[INFO] Found ${pmidList.length} unique papers`);

  if (!pmidList.length) {
    console.error("[WARN] No papers found");
    const output = {
      date: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }),
      count: 0,
      papers: [],
    };
    writeFileSync(opts.output, JSON.stringify(output, null, 2), "utf-8");
    return;
  }

  const papers = await fetchDetails(pmidList);

  const summarized = loadSummarizedPmids();
  const newPapers = papers.filter((p) => !summarized.has(p.pmid));

  console.error(`[INFO] Fetched ${papers.length} papers, ${newPapers.length} are new (not previously summarized)`);

  const output = {
    date: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }),
    count: newPapers.length,
    papers: newPapers,
  };

  writeFileSync(opts.output, JSON.stringify(output, null, 2), "utf-8");
  console.error(`[INFO] Saved to ${opts.output}`);
}

main().catch((e) => {
  console.error(`[FATAL] ${e.message}`);
  process.exit(1);
});
