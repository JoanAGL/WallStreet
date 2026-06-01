import { fetchNewsForTicker, type RawNewsArticle } from "@/lib/newsApiClient";
import { geminiChat } from "@/lib/geminiClient";
import { z } from "zod";

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

function sanitize(s: string): string {
  return s.replace(/["\\\n\r]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeArticle(raw: RawNewsArticle): NewsArticle {
  return {
    title: sanitize(raw.title),
    description: sanitize(raw.description ?? ""),
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

// ── Article fetching (no Gemini) ─────────────────────────────────────────────

/**
 * Fetches and normalizes articles for one ticker WITHOUT calling Gemini.
 * Never throws — returns empty articles + dataIssue on error.
 */
export async function fetchArticlesForTicker(
  ticker: string
): Promise<{ articles: NewsArticle[]; dataIssue?: DataIssue }> {
  try {
    const raw = await fetchNewsForTicker(ticker, 48);
    const articles = raw.slice(0, 8).map(normalizeArticle);
    if (articles.length === 0) {
      return {
        articles: [],
        dataIssue: { kind: "NO_DATA", source: "news", message: "Sin artículos en las últimas 48h" },
      };
    }
    return { articles };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      articles: [],
      dataIssue: { kind: "API_ERROR", source: "news", message },
    };
  }
}

/**
 * Fetches articles for all tickers in parallel using Promise.allSettled.
 * Returns one result per ticker in the same order. Never throws — individual
 * failures produce empty articles with a dataIssue entry.
 */
export async function fetchAllArticlesInParallel(
  tickers: string[]
): Promise<Array<{ articles: NewsArticle[]; dataIssue?: DataIssue }>> {
  const results = await Promise.allSettled(tickers.map((t) => fetchArticlesForTicker(t)));
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          articles: [],
          dataIssue: {
            kind: "API_ERROR" as const,
            source: "news" as const,
            message: r.reason instanceof Error ? r.reason.message : String(r.reason),
          },
        }
  );
}

// ── Zod schema for batch sentiment response ───────────────────────────────────

const BatchSentimentSchema = z.record(
  z.string(),
  z.object({
    summary:   z.string().catch("Resumen no disponible."),
    sentiment: z.enum(["Positivo", "Neutral", "Negativo"]).catch("Neutral"),
  })
);

/**
 * Analyzes news sentiment for multiple tickers in a SINGLE Gemini call.
 * Reduces N individual calls to 1, cutting latency and token cost proportionally.
 *
 * Falls back gracefully: if Gemini returns partial or invalid JSON, missing
 * tickers default to { summary: "No disponible", sentiment: "Neutral" }.
 */
export async function batchAnalyzeSentiment(
  inputs: Array<{ ticker: string; articles: NewsArticle[] }>
): Promise<Map<string, { summary: string; sentiment: Sentiment }>> {
  const active = inputs.filter((inp) => inp.articles.length > 0);
  const result = new Map<string, { summary: string; sentiment: Sentiment }>();
  const fallback = { summary: "No se encontraron noticias recientes.", sentiment: "Neutral" as Sentiment };

  // Tickers with no articles get the fallback immediately
  inputs.forEach(({ ticker, articles }) => {
    if (articles.length === 0) result.set(ticker, fallback);
  });

  if (active.length === 0) return result;

  const sections = active
    .map(({ ticker, articles }) => {
      const headlines = articles
        .slice(0, 5)
        .map((a, i) => `  ${i + 1}. [${a.source}] ${a.title}`)
        .join("\n");
      return `${ticker}:\n${headlines}`;
    })
    .join("\n\n");

  const tickerList = active.map((i) => `"${i.ticker}": { "summary": "...", "sentiment": "Positivo|Neutral|Negativo" }`).join(",\n  ");

  const prompt = `Eres un analista informativo de mercados. Analiza las noticias de cada ticker y responde en español con el siguiente JSON (sin markdown):

{
  ${tickerList}
}

REGLAS: No hagas recomendaciones. El sentimiento debe reflejar el tono general de cada sección.
Sin noticias claras → sentiment "Neutral".

Noticias (últimas 48h):
${sections}`;

  try {
    const raw = await geminiChat(prompt, 250 * active.length, 2, {
      systemInstruction:
        "Motor de análisis de noticias financieras. Responde únicamente con JSON válido.",
      jsonMode: true,
      temperature: 0.1,
    });

    const parsed = BatchSentimentSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      active.forEach(({ ticker }) => {
        const entry = parsed.data[ticker];
        result.set(ticker, entry ?? fallback);
      });
    } else {
      console.warn("[NewsAnalysis] Batch Zod validation failed, using fallback for all");
      active.forEach(({ ticker }) => result.set(ticker, fallback));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[NewsAnalysis] Batch Gemini failed (${message}), falling back to individual calls`);
    // Fallback: run individual calls for each ticker that didn't get a result
    await Promise.allSettled(
      active.map(async ({ ticker, articles }) => {
        if (result.has(ticker)) return;
        try {
          const prompt = buildPrompt(ticker, articles);
          const raw = await geminiChat(prompt, 400);
          const p = JSON.parse(raw) as { summary?: string; sentiment?: string };
          const s = p.sentiment;
          result.set(ticker, {
            summary: p.summary ?? fallback.summary,
            sentiment: s === "Positivo" || s === "Negativo" || s === "Neutral" ? s : "Neutral",
          });
        } catch {
          result.set(ticker, fallback);
        }
      })
    );
  }

  return result;
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
