const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY no está configurada en las variables de entorno");
  return key;
}

interface GeminiError {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

export interface GeminiChatOptions {
  systemInstruction?: string;
  jsonMode?: boolean;
  temperature?: number;
}

export async function geminiChat(
  prompt: string,
  maxTokens = 600,
  retries = 3,
  options: GeminiChatOptions = {}
): Promise<string> {
  const url = `${BASE_URL}?key=${getApiKey()}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use lower temperature for JSON mode to ensure strict formatting
      const temperature = options.temperature ?? (options.jsonMode ? 0.1 : 0.3);

      const body: Record<string, unknown> = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          ...(options.jsonMode && { response_mime_type: "application/json" }),
        },
      };

      if (options.systemInstruction) {
        body.system_instruction = {
          parts: [{ text: options.systemInstruction }],
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        return text ?? "";
      }

      const errorText = await res.text();
      let errorData: GeminiError | null = null;
      try {
        errorData = JSON.parse(errorText) as GeminiError;
      } catch {
        // Si no es JSON, usamos el texto crudo
      }

      const status = res.status;
      const errorMessage = errorData?.error?.message || errorText;

      if (status === 429) {
        // La cuota del tier gratuito está agotada. Reintentar en serverless
        // no es viable: los tiempos de espera (50-60s) superan el timeout
        // de la función. Fallamos inmediatamente para no bloquear el proceso.
        const retryMatch = errorMessage.match(/retry in (\d+(?:\.\d+)?)s/i);
        const retryInSecs = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null;
        const hint = retryInSecs ? ` Inténtalo en ~${retryInSecs}s.` : "";
        throw new Error(`Gemini: Cuota de solicitudes agotada.${hint}`);
      }

      if (status === 404) {
        throw new Error("Gemini: Modelo no encontrado. Verifica el nombre del modelo.");
      }

      if (status === 400) {
        throw new Error(`Gemini: Solicitud inválida - ${errorMessage}`);
      }

      if (status >= 500) {
        const waitTime = Math.pow(2, attempt) * 1000;
        if (attempt < retries) {
          console.warn(`[Gemini] Error del servidor (${status}). Reintentando en ${waitTime / 1000}s...`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }
      }

      throw new Error(`Gemini error ${status}: ${errorMessage}`);

    } catch (error) {
      if (error instanceof Error && error.message.includes("Gemini")) {
        throw error;
      }

      if (attempt < retries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.warn(`[Gemini] Error de conexión. Reintentando en ${waitTime / 1000}s... (intento ${attempt + 1})`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      throw new Error(`Error inesperado al llamar a Gemini: ${error}`);
    }
  }

  throw new Error("Error desconocido al llamar a Gemini");
}
