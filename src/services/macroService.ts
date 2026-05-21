import { geminiChat } from "@/lib/geminiClient";

const NEWS_API_BASE = "https://newsapi.org/v2/everything";
const MACRO_QUERY =
  'inflation OR "interest rates" OR recession OR "Federal Reserve" OR ECB OR geopolitical OR tariffs OR GDP OR "central bank" OR "market crash"';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export type ImpactLevel = "HIGH" | "MEDIUM" | "LOW";

export interface MacroNewsItem {
  title: string;
  description: string;
  publishedAt: string;
  source: string;
  impactLevel: ImpactLevel;
  affectedSectors: string[];
}

export interface MacroGlobalContext {
  items: MacroNewsItem[];
  fetchedAt: string;
}

interface RawArticle {
  title: string;
  description: string | null;
  publishedAt: string;
  source: { name: string };
}

interface CacheEntry {
  data: MacroGlobalContext;
  expiresAt: number;
}

let _cache: CacheEntry | null = null;

const VALID_LEVELS: ImpactLevel[] = ["HIGH", "MEDIUM", "LOW"];

const SYSTEM_INSTRUCTION =
  "Eres un analista macroeconómico institucional. Evalúa el impacto sistémico de noticias globales sobre los mercados financieros. " +
  "Responde únicamente con JSON válido, sin texto adicional ni markdown.";

function getApiKey(): string {
  const key = process.env.NEWS_API_KEY;
  if (!key) throw new Error("NEWS_API_KEY no configurada");
  return key;
}

async function fetchMacroArticles(): Promise<RawArticle[]> {
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = new URL(NEWS_API_BASE);
  url.searchParams.set("q", MACRO_QUERY);
  url.searchParams.set("from", from);
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("language", "en");
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("apiKey", getApiKey());

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`NewsAPI HTTP ${res.status}`);

  const data = (await res.json()) as { status: string; articles: RawArticle[] };
  if (data.status !== "ok") throw new Error("NewsAPI respuesta inválida");

  return data.articles.filter((a) => a.title && a.title !== "[Removed]");
}

async function classifyWithGemini(articles: RawArticle[]): Promise<MacroNewsItem[]> {
  const top5 = articles.slice(0, 5);
  const headlinesList = top5
    .map((a, i) => `${i + 1}. [${a.source.name}] ${a.title}. ${a.description ?? ""}`)
    .join("\n");

  const prompt = `Analiza estas noticias macroeconómicas y selecciona las 3 más críticas para los mercados financieros globales.

Noticias (últimas 24h):
${headlinesList}

Responde con este JSON exacto (sin markdown):
{
  "items": [
    {
      "index": número_1_a_${top5.length},
      "impactLevel": "HIGH|MEDIUM|LOW",
      "affectedSectors": ["Sector1", "Sector2"]
    }
  ]
}

Criterios de impacto:
- HIGH: decisión de banco central, evento geopolítico sistémico, dato de inflación/PIB
- MEDIUM: dato económico significativo, política comercial, earnings sectoriales clave
- LOW: noticia informativa sin impacto inmediato

affectedSectors (máx. 3): Tecnología, Finanzas, Energía, Consumo, Industria, Salud, Inmobiliario, Materias Primas, Divisas, Bonos.`;

  const raw = await geminiChat(prompt, 400, 2, {
    systemInstruction: SYSTEM_INSTRUCTION,
    jsonMode: true,
  });

  const parsed = JSON.parse(raw) as {
    items: Array<{ index: number; impactLevel: string; affectedSectors: string[] }>;
  };

  return parsed.items
    .filter((item) => item.index >= 1 && item.index <= top5.length)
    .slice(0, 3)
    .map((item) => {
      const a = top5[item.index - 1];
      return {
        title: a.title,
        description: a.description ?? "",
        publishedAt: a.publishedAt,
        source: a.source.name,
        impactLevel: VALID_LEVELS.includes(item.impactLevel as ImpactLevel)
          ? (item.impactLevel as ImpactLevel)
          : "LOW",
        affectedSectors: Array.isArray(item.affectedSectors)
          ? item.affectedSectors
              .filter((s): s is string => typeof s === "string")
              .slice(0, 3)
          : [],
      };
    });
}

async function fetchAndClassify(): Promise<MacroGlobalContext> {
  let articles: RawArticle[] = [];
  try {
    articles = await fetchMacroArticles();
  } catch (err) {
    console.warn("[MacroService] NewsAPI falló:", err);
  }

  if (articles.length === 0) {
    return { items: [], fetchedAt: new Date().toISOString() };
  }

  let items: MacroNewsItem[] = [];
  try {
    items = await classifyWithGemini(articles);
  } catch (err) {
    console.warn("[MacroService] Gemini clasificación falló, usando fallback:", err);
    items = articles.slice(0, 3).map((a) => ({
      title: a.title,
      description: a.description ?? "",
      publishedAt: a.publishedAt,
      source: a.source.name,
      impactLevel: "LOW" as ImpactLevel,
      affectedSectors: [],
    }));
  }

  return { items, fetchedAt: new Date().toISOString() };
}

export async function getGlobalContext(): Promise<MacroGlobalContext> {
  const now = Date.now();
  if (_cache && now < _cache.expiresAt) {
    return _cache.data;
  }
  const data = await fetchAndClassify();
  _cache = { data, expiresAt: now + CACHE_TTL_MS };
  return data;
}
