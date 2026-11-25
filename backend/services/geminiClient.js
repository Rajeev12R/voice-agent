import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const GEMINI_3_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.0-pro",
];

function isRetryableModelError(error) {
  const status = error?.status;
  const msg = String(error?.message || "");
  return (
    status === 429 ||
    status === 404 ||
    error?.name === "RateLimitQuotaExhaustedError" ||
    msg.includes("429") ||
    msg.includes("Quota exceeded")
  );
}

/**
 * Invoke Gemini 3+ models with automatic fallback on 429 quota/rate-limit errors.
 */
export async function invokeGeminiWithFallback(messages, { temperature = 0 } = {}) {
  let lastError;

  for (let i = 0; i < GEMINI_3_MODELS.length; i++) {
    const modelName = GEMINI_3_MODELS[i];
    const model = new ChatGoogleGenerativeAI({
      model: modelName,
      temperature,
      apiKey: process.env.GEMINI_API_KEY,
    });

    try {
      return await model.invoke(messages);
    } catch (error) {
      lastError = error;
      const hasNext = i < GEMINI_3_MODELS.length - 1;
      if (hasNext && isRetryableModelError(error)) {
        console.warn(
          `[Gemini] ${modelName} failed (${error.status || "error"}), falling back to ${GEMINI_3_MODELS[i + 1]}...`
        );
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

