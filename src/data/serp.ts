import axios from "axios";
import type { ProviderEvidence } from "./sports-apis";

interface SearchSerpApiParams {
  query: string;
  engine?: "google" | "google_news";
  numResults?: number;
}

export async function searchSerpApi({
  query,
  engine = "google_news",
  numResults
}: SearchSerpApiParams): Promise<ProviderEvidence> {
  if (!query || query.trim().length === 0) {
    throw new Error("SerpAPI query must be a non-empty string");
  }

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error("SERPAPI_KEY is not configured");
  }

  const params: Record<string, string | number> = {
    api_key: apiKey,
    engine,
    q: query
  };

  if (typeof numResults === "number" && Number.isFinite(numResults) && numResults > 0) {
    params.num = numResults;
  }

  const url = "https://serpapi.com/search.json";
  const response = await axios.get(url, { params, timeout: 15_000 });

  const queryString = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)])
  ).toString();

  return {
    provider: "SERP_API",
    url: `${url}?${queryString}`,
    ts: new Date().toISOString(),
    payload: response.data
  };
}
