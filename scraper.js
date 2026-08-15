const fs = require("fs");
const Parser = require("rss-parser");
const parser = new Parser();

// Add companies here as you find their slug. To find a slug, check the
// company's careers page URL:
//   boards.greenhouse.io/{slug}   -> platform: "greenhouse"
//   jobs.lever.co/{slug}          -> platform: "lever"
//   jobs.ashbyhq.com/{slug}       -> platform: "ashby"
const COMPANIES = [
  { name: "Interbrand", platform: "greenhouse", slug: "interbrand" },
];

// Optional: broader keyword coverage without hand listing every company.
// A Google Alert set to a search like site:boards.greenhouse.io "consumer insight"
// gives you an RSS feed URL you can drop in here alongside any other job RSS feeds.
const RSS_FEEDS = [];

// Adzuna search terms, one query per role type you want covered. Requires
// ADZUNA_APP_ID and ADZUNA_APP_KEY set as GitHub Actions repo secrets.
const ADZUNA_QUERIES = ["brand strategy", "consumer insight", "innovation consulting"];
const ADZUNA_COUNTRY = "gb";

function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchGreenhouse(slug) {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs || []).map((j) => ({
    id: `greenhouse-${j.id}`,
    title: j.title,
    company: slug,
    location: j.location?.name || "",
    url: j.absolute_url,
    description: stripHtml(j.content),
    source: "greenhouse",
    postedAt: j.updated_at || "",
  }));
}

async function fetchLever(slug) {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data || []).map((j) => ({
    id: `lever-${j.id}`,
    title: j.text,
    company: slug,
    location: j.categories?.location || "",
    url: j.hostedUrl,
    description: stripHtml(j.descriptionPlain || j.description),
    source: "lever",
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : "",
  }));
}

async function fetchAshby(slug) {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=false`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs || []).map((j) => ({
    id: `ashby-${j.id}`,
    title: j.title,
    company: slug,
    location: j.location || "",
    url: j.jobUrl || j.applyUrl,
    description: stripHtml(j.descriptionPlain || j.description),
    source: "ashby",
    postedAt: j.publishedAt || "",
  }));
}

async function fetchRSS(url) {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || []).map((item) => ({
      id: `rss-${item.guid || item.link}`,
      title: item.title,
      company: feed.title || "",
      location: "",
      url: item.link,
      description: stripHtml(item.contentSnippet || item.content),
      source: "rss",
      postedAt: item.isoDate || item.pubDate || "",
    }));
  } catch (err) {
    console.warn(`RSS feed failed, skipping: ${url} (${err.message})`);
    return [];
  }
}

async function fetchAdzuna(query) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    console.warn("ADZUNA_APP_ID / ADZUNA_APP_KEY not set, skipping Adzuna");
    return [];
  }
  const url = `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/1?app_id=${appId}&app_key=${appKey}&what=${encodeURIComponent(query)}&results_per_page=50`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Adzuna query failed: "${query}" (${res.status})`);
    return [];
  }
  const data = await res.json();
  return (data.results || []).map((j) => ({
    id: `adzuna-${j.id}`,
    title: j.title,
    company: j.company?.display_name || "",
    location: j.location?.display_name || "",
    url: j.redirect_url,
    description: stripHtml(j.description),
    source: "adzuna",
    postedAt: j.created || "",
  }));
}

async function main() {
  const results = [];

  for (const c of COMPANIES) {
    try {
      let jobs = [];
      if (c.platform === "greenhouse") jobs = await fetchGreenhouse(c.slug);
      else if (c.platform === "lever") jobs = await fetchLever(c.slug);
      else if (c.platform === "ashby") jobs = await fetchAshby(c.slug);

      if (jobs.length === 0) {
        console.warn(`No jobs returned for ${c.name} (${c.platform}/${c.slug}), double check the slug`);
      }
      results.push(...jobs);
    } catch (err) {
      console.warn(`Failed to fetch ${c.name}: ${err.message}`);
    }
  }

  for (const feedUrl of RSS_FEEDS) {
    results.push(...(await fetchRSS(feedUrl)));
  }

  for (const query of ADZUNA_QUERIES) {
    results.push(...(await fetchAdzuna(query)));
  }

  const seen = new Set();
  const deduped = results.filter((j) => {
    if (!j.url || seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });

  fs.writeFileSync(
    "jobs.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), jobs: deduped }, null, 2)
  );
  console.log(`Wrote ${deduped.length} jobs to jobs.json`);
}

main();
