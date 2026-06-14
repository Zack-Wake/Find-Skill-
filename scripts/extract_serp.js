// SERP extraction — runs in Claude in Chrome via javascript_tool.
// Extracts the modern Google SERP modules (PAS, Discussions, Related Products, Organic)
// after Google retired classic PAA boxes for most commercial queries in 2025-26.
//
// Usage: paste into javascript_tool action="javascript_exec" with the active SERP tab.
// Returns JSON.

const result = {
  organic: [],
  discussionsAndForums: [],
  paaQuestions: [],
  peopleAlsoSearchFor: [],
  relatedProductsAndServices: [],
  domainTypes: {}
};

// --- Organic results (top 10) ---
const seen = new Set();
document.querySelectorAll('div.g, div[data-snc]').forEach(b => {
  const link = b.querySelector('a[href^="http"]');
  const title = b.querySelector('h3');
  if (link && title && !seen.has(link.href)) {
    seen.add(link.href);
    result.organic.push({
      url: link.href,
      title: title.innerText.split('\n')[0]
    });
  }
});
result.organic = result.organic.slice(0, 10);

// --- Domain typing for top 10 ---
const typeFor = (url) => {
  const u = url.toLowerCase();
  if (u.includes('reddit.com')) return 'Forum';
  if (u.includes('quora.com')) return 'Forum';
  if (u.includes('facebook.com/groups')) return 'Forum';
  if (u.includes('youtube.com')) return 'Video';
  if (u.includes('wikipedia.org')) return 'Reference';
  // Big-brand SaaS (extend this list per niche)
  const bigBrands = ['wix.com', 'squarespace.com', 'shopify.com', 'webflow.com',
                     'canva.com', 'wordpress.com', 'godaddy.com', 'hostinger.com',
                     'framer.com', 'weebly.com'];
  if (bigBrands.some(b => u.includes(b))) return 'BigBrand';
  // Established review/affiliate sites
  const reviewSites = ['websitebuilderexpert', 'tooltester', 'g2.com', 'capterra',
                       'pcmag', 'techradar', 'zapier.com/blog', 'expertmarket',
                       'websiteplanet', 'experte.com'];
  if (reviewSites.some(b => u.includes(b))) return 'EstablishedReview';
  return 'Other';
};
result.organic.forEach(o => { o.domainType = typeFor(o.url); });
result.organic.forEach(o => {
  result.domainTypes[o.domainType] = (result.domainTypes[o.domainType] || 0) + 1;
});

// --- Questions ending in ? (catches classic PAA if present, plus Discussions module) ---
const qSet = new Set();
document.querySelectorAll('span, div, a').forEach(el => {
  if (el.children.length === 0) {
    const text = el.innerText?.trim();
    if (text && text.endsWith('?') && text.length > 10 && text.length < 200) {
      qSet.add(text);
    }
  }
});
result.paaQuestions = [...qSet];

// --- PAS + Related products (search refinement links) ---
const refinements = new Set();
document.querySelectorAll('a').forEach(a => {
  const href = a.href || '';
  if (href.includes('/search?') && a.innerText) {
    const text = a.innerText.trim();
    if (text.length > 5 && text.length < 100 && !text.endsWith('?')) {
      refinements.add(text);
    }
  }
});
result.peopleAlsoSearchFor = [...refinements].slice(0, 30);

// --- Competition profile (the key signal for the skill) ---
const dt = result.domainTypes;
const forumCount = (dt.Forum || 0);
const bigBrandCount = (dt.BigBrand || 0);
const reviewCount = (dt.EstablishedReview || 0);

let profile;
if (forumCount >= 2 && bigBrandCount + reviewCount <= 2) profile = 'GREEN';
else if (forumCount >= 1 && bigBrandCount + reviewCount <= 4) profile = 'YELLOW';
else if (reviewCount >= 4 || bigBrandCount >= 5) profile = 'RED';
else profile = 'ORANGE';
result.competitionProfile = profile;

JSON.stringify(result);
