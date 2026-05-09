const BASE_URL = "https://newsapi.org/v2/everything";

function getApiKey(): string {
  const key = process.env.NEWS_API_KEY;
  if (!key) throw new Error("NEWS_API_KEY no configurada");
  return key;
}

export interface RawNewsArticle {
  title: string;
  description: string | null;
  url: string;
  publishedAt: string;
  source: { name: string };
}

export interface RawNewsResponse {
  status: string;
  totalResults: number;
  articles: RawNewsArticle[];
}

/**
 * Obtiene noticias de las últimas `hoursBack` horas para un ticker dado.
 */
export async function fetchNewsForTicker(
  ticker: string,
  hoursBack = 48
): Promise<RawNewsArticle[]> {
  const from = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const url = new URL(BASE_URL);
  url.searchParams.set("q", ticker);
  url.searchParams.set("from", from);
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("language", "en");
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("apiKey", getApiKey());

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });

  if (!res.ok) {
    throw new Error(`NewsAPI HTTP error: ${res.status}`);
  }

  const data = (await res.json()) as RawNewsResponse;

  if (data.status !== "ok") {
    throw new Error("NewsAPI respuesta inválida");
  }

  // Filtra artículos sin título o marcados como "[Removed]"
  return data.articles.filter(
    (a) => a.title && a.title !== "[Removed]"
  );
}
