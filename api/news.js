export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const https = require('https');
  const FEEDS = [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World' },
    { url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', name: 'BBC Middle East' },
    { url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', name: 'BBC Europe' },
    { url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml', name: 'BBC Asia' },
    { url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', name: 'BBC US' },
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC Business' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' },
    { url: 'https://rss.dw.com/rdf/rss-en-world', name: 'DW World' },
    { url: 'https://www.forexlive.com/feed/news', name: 'ForexLive' },
    { url: 'https://www.fxstreet.com/rss/news', name: 'FXStreet' },
    { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR News' },
    { url: 'https://thehill.com/feed/', name: 'The Hill' },
    { url: 'https://feeds.skynews.com/feeds/rss/world.xml', name: 'Sky News' },
  ];

  function fetchUrl(url, hops = 0) {
    if (hops > 3) return Promise.reject(new Error('Too many redirects'));
    return new Promise((resolve, reject) => {
      const req2 = https.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
        timeout: 8000,
      }, (r) => {
        if ([301,302,303].includes(r.statusCode) && r.headers.location)
          return fetchUrl(r.headers.location, hops+1).then(resolve).catch(reject);
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve(d));
      });
      req2.on('error', reject);
      req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
    });
  }

  function parseRSS(xml, source) {
    const items = [];
    const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const b = m[1];
      const g = r => (b.match(r)||[])[1]||'';
      const clean = s => s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
      const title = clean(g(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/));
      const link = clean(g(/<link[^>]*>([\s\S]*?)<\/link>/))||clean(g(/<link[^>]*href="([^"]*)"/));
      const desc = clean(g(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)).slice(0,400);
      const date = g(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/)||new Date().toISOString();
      if (title.length > 10) items.push({ title, desc, link: link.trim(), date: date.trim(), source });
    }
    return items.slice(0,25);
  }

  try {
    const results = await Promise.allSettled(FEEDS.map(f => fetchUrl(f.url).then(xml => parseRSS(xml, f.name))));
    let items = [];
    results.forEach(r => { if (r.status==='fulfilled') items = items.concat(r.value); });
    items.sort((a,b) => new Date(b.date)-new Date(a.date));
    const seen = new Set();
    items = items.filter(n => { const k=n.title.slice(0,50).toLowerCase(); if(seen.has(k))return false; seen.add(k); return true; });
    return res.status(200).json({ success: true, count: items.length, items, fetchedAt: new Date().toISOString() });
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
