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

export async function geminiChat(
  prompt: string,
  maxTokens = 600,
  retries = 2
): Promise<string> {
  const url = `${BASE_URL}?key=${getApiKey()}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: maxTokens,
          },
        }),
      });

      // === ÉXITO ===
      if (res.ok) {
        const data = (await res.json()) as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        return text ?? "";
      }

      // === ERROR ===
      const errorText = await res.text();
      let errorData: GeminiError | null = null;

      try {
        errorData = JSON.parse(errorText) as GeminiError;
      } catch {
        // Si no es JSON, usamos el texto crudo
      }

      const status = res.status;
      const errorMessage = errorData?.error?.message || errorText;

      // Manejo específico de errores comunes
      if (status === 429) {
        const waitTime = (attempt + 1) * 2000; // 2s, 4s, 6s...
        
        if (attempt < retries) {
          console.warn(`[Gemini] Rate limit alcanzado. Reintentando en ${waitTime/1000}s... (intento ${attempt + 1}/${retries})`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        } else {
          throw new Error(`Gemini: Límite de uso gratuito excedido. Inténtalo más tarde. (${errorMessage})`);
        }
      }

      if (status === 404) {
        throw new Error("Gemini: Modelo no encontrado. Verifica que el nombre del modelo sea correcto.");
      }

      if (status === 400) {
        throw new Error(`Gemini: Solicitud inválida - ${errorMessage}`);
      }

      if (status >= 500) {
        if (attempt < retries) {
          console.warn(`[Gemini] Error del servidor (${status}). Reintentando...`);
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
      }

      // Error genérico
      throw new Error(`Gemini error ${status}: ${errorMessage}`);

    } catch (error) {
      if (error instanceof Error && error.message.includes("Gemini")) {
        throw error; // Re-lanzamos nuestros errores personalizados
      }

      if (attempt < retries) {
        console.warn(`[Gemini] Error de conexión. Reintentando... (intento ${attempt + 1})`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      throw new Error(`Error inesperado al llamar a Gemini: ${error}`);
    }
  }

  throw new Error("Error desconocido al llamar a Gemini");
}