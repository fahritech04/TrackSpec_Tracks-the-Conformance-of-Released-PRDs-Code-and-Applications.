import { GoogleGenAI } from "@google/genai";

type GenerateJsonOptions = {
  timeoutMs?: number;
  maxOutputTokens?: number;
  temperature?: number;
  retries?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const cleaned = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(cleaned);
}

function isRetryableGeminiError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes("429") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("rate") ||
    message.includes("timeout") ||
    message.includes("temporar")
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Gemini request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

class GeminiService {
  private client: GoogleGenAI | null = null;
  private readonly modelName: string;

  constructor() {
    this.modelName = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  }

  get model(): string {
    return this.modelName;
  }

  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      throw new Error(
        "Gemini API key is missing. Set GEMINI_API_KEY in your environment.",
      );
    }

    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey });
    }

    return this.client;
  }

  async generateJson(
    prompt: string,
    options: GenerateJsonOptions = {},
  ): Promise<unknown> {
    const retries = options.retries ?? 2;
    const timeoutMs = options.timeoutMs ?? 20000;
    const temperature = options.temperature ?? 0.2;
    const maxOutputTokens = options.maxOutputTokens ?? 1200;
    const client = this.getClient();

    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await withTimeout(
          client.models.generateContent({
            model: this.modelName,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature,
              maxOutputTokens,
            },
          }),
          timeoutMs,
        );

        const text = response.text?.trim();
        if (!text) {
          throw new Error("Gemini returned an empty response.");
        }

        return parseJsonText(text);
      } catch (error) {
        lastError = error;

        if (attempt >= retries || !isRetryableGeminiError(error)) {
          throw error;
        }

        const backoffMs = (attempt + 1) * 800;
        await sleep(backoffMs);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Gemini request failed unexpectedly.");
  }
}

export const geminiService = new GeminiService();
