import Parser from "rss-parser";

const DEFAULT_FEEDS = [
  "https://www.espn.com/espn/rss/news",
  "https://www.skysports.com/rss/12040"
];

export interface RssItem {
  title: string;
  link: string;
  isoDate: string;
  source: string;
}

const parser = new Parser();

export async function fetchRssItems(feeds: string[] = [], limitPerFeed = 10): Promise<RssItem[]> {
  const feedUrls = feeds.length > 0 ? feeds : (process.env.SPORTS_RSS_FEEDS?.split(",") ?? DEFAULT_FEEDS);
  const items: RssItem[] = [];

  await Promise.all(
    feedUrls.map(async (feedUrl) => {
      try {
        const feed = await parser.parseURL(feedUrl);
        for (const entry of feed.items.slice(0, limitPerFeed)) {
          if (!entry.title || !entry.link) continue;
          const published = entry.isoDate ?? entry.pubDate ?? new Date().toISOString();
          items.push({
            title: entry.title,
            link: entry.link,
            isoDate: new Date(published).toISOString(),
            source: feedUrl
          });
        }
      } catch (error) {
        items.push({
          title: `RSS_ERROR:${feedUrl}`,
          link: feedUrl,
          isoDate: new Date().toISOString(),
          source: `error:${String(error)}`
        });
      }
    })
  );

  return items;
}
