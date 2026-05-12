import { fetchNewsForTicker, type RawNewsArticle } from "@/lib/newsApiClient";
import { geminiChat } from "@/lib/geminiClient";

export type Sentiment = "Positivo" | "Neutral" | "Negativo";

export type DataIssueKind = "NO_DATA" | "API_ERROR";

export interface DataIssue {
  kind: DataIssueKind;
  source: "news" | "market" | "ai";
  message: string;
}

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
  dataIssue?: DataIssue;
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

// Esta función nunca lanza: clasifica el error y devuelve un resultado degradado.
export async function analyzeNewsForTicker(
  ticker: string
): Promise<NewsAnalysis> {
  let rawArticles: RawNewsArticle[];

  try {
    rawArticles = await fetchNewsForTicker(ticker, 48);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[NewsAnalysis] API_ERROR for ${ticker}: ${message}`);
    return {
      ticker,
      articles: [],
      summary: "Error al obtener noticias del proveedor.",
      sentiment: "Neutral",
      analyzedAt: new Date().toISOString(),
      dataIssue: { kind: "API_ERROR", source: "news", message },
    };
  }

  const articles = rawArticles.slice(0, 8).map(normalizeArticle);

  if (articles.length === 0) {
    console.warn(`[NewsAnalysis] NO_DATA for ${ticker}: sin artículos en las últimas 48h`);
    return {
      ticker,
      articles: [],
      summary: "No se encontraron noticias recientes para este ticker.",
      sentiment: "Neutral",
      analyzedAt: new Date().toISOString(),
      dataIssue: { kind: "NO_DATA", source: "news", message: "Sin artículos en las últimas 48h" },
    };
  }

  const prompt = buildPrompt(ticker, articles);

  let summary = "No disponible";
  let sentiment: Sentiment = "Neutral";
  let dataIssue: DataIssue | undefined;

  try {
    const raw = await geminiChat(prompt, 400);
    const parsed = JSON.parse(raw) as { summary?: string; sentiment?: string };
    summary = parsed.summary ?? summary;
    const s = parsed.sentiment;
    if (s === "Positivo" || s === "Negativo" || s === "Neutral") {
      sentiment = s;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[NewsAnalysis] Gemini falló para ${ticker}, usando defaults: ${message}`);
    dataIssue = { kind: "API_ERROR", source: "news", message };
  }

  return {
    ticker,
    articles,
    summary,
    sentiment,
    analyzedAt: new Date().toISOString(),
    dataIssue,
  };
}
