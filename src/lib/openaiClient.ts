const BASE_URL = "https://api.openai.com/v1/chat/completions";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no configurada");
  return key;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

export async function chatCompletion(
  messages: ChatMessage[],
  model = "gpt-4o-mini",
  maxTokens = 600
): Promise<string> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as ChatResponse;
  return data.choices[0]?.message?.content?.trim() ?? "";
}
