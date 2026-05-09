import { fetchNewsForTicker, type RawNewsArticle } from "@/lib/newsApiClient";
import { geminiChat } from "@/lib/geminiClient";

export type Sentiment = "Positivo" | "Neutral" | "Negativo";

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: string;
}

export interface NewsAnalysis {
  ticker: string;
  articles: NewsArticle[];
  summary: string;
  sentiment: Sentiment;
  analyzedAt: string;
}

function normalizeArticle(raw: RawNewsArticle): NewsArticle {
  return {
    title: raw.title,
    description: raw.description ?? "",
    url: raw.url,
    publishedAt: raw.publishedAt,
    source: raw.source.name,
  };
}

function buildPrompt(ticker: string, articles: NewsArticle[]): string {
  const headlines = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}`)
    .join("\n");

  return `Eres un analista informativo de mercados. Analiza las siguientes noticias recientes sobre ${ticker} y responde en español con el siguiente JSON (sin markdown):

{
  "summary": "Resumen objetivo de 2-3 oraciones de las noticias más relevantes",
  "sentiment": "Positivo|Neutral|Negativo"
}

REGLAS OBLIGATORIAS:
- No hagas recomendaciones de compra, venta ni inversión.
- El resumen debe ser informativo y objetivo.
- El sentimiento debe reflejar el tono general de las noticias.
- Si no hay noticias claras, devuelve sentimiento "Neutral".

Noticias:
${headlines}`;
}

export async function analyzeNewsForTicker(
  ticker: string
): Promise<NewsAnalysis> {
  const rawArticles = await fetchNewsForTicker(ticker, 48);
  const articles = rawArticles.slice(0, 8).map(normalizeArticle);

  if (articles.length === 0) {
    return {
      ticker,
      articles: [],
      summary: "No se encontraron noticias recientes para este ticker.",
      sentiment: "Neutral",
      analyzedAt: new Date().toISOString(),
    };
  }

  const prompt = buildPrompt(ticker, articles);
  const raw = await geminiChat(prompt, 400);

  let summary = "No disponible";
  let sentiment: Sentiment = "Neutral";

  try {
    const parsed = JSON.parse(raw) as { summary?: string; sentiment?: string };
    summary = parsed.summary ?? summary;
    const s = parsed.sentiment;
    if (s === "Positivo" || s === "Negativo" || s === "Neutral") {
      sentiment = s;
    }
  } catch {
    // Si el LLM no devuelve JSON válido, usamos los valores por defecto
  }

  return {
    ticker,
    articles,
    summary,
    sentiment,
    analyzedAt: new Date().toISOString(),
  };
}
