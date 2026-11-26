import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

const kbPath = path.join(process.cwd(), "data", "shopKnowledgeBase.md");
const cachePath = path.join(process.cwd(), "data", "kb_embeddings.json");

const EMBEDDING_MODELS = ["gemini-embedding-001", "text-embedding-004"];

let indexedChunksCache = null;
let cachedHash = null;

function chunkKnowledgeBase(markdown) {
  const sections = markdown.split(/^##\s+/m).slice(1);
  return sections
    .map((section, index) => {
      const lines = section.trim().split("\n");
      const title = lines[0].trim();
      const content = lines.slice(1).join(" ").replace(/\s+/g, " ").trim();
      return {
        id: `kb-${index + 1}`,
        title,
        content,
        fullText: `${title}: ${content}`,
      };
    })
    .filter((chunk) => chunk.content.length > 0);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function lexicalScore(query, text) {
  const stopWords = new Set([
    "the", "is", "are", "a", "an", "and", "or", "for", "to", "in", "on", "of",
    "do", "you", "your", "can", "i", "we", "what", "how", "when", "where", "tell",
    "me", "about", "with", "have", "any",
  ]);
  const qTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stopWords.has(t));

  if (qTokens.length === 0) return 0;
  const hay = text.toLowerCase();
  const hits = qTokens.filter((t) => hay.includes(t)).length;
  return hits / qTokens.length;
}

async function createEmbeddingsWithFallback(texts) {
  let lastError;
  for (const modelName of EMBEDDING_MODELS) {
    try {
      const embedder = new GoogleGenerativeAIEmbeddings({
        model: modelName,
        apiKey: process.env.GEMINI_API_KEY,
      });
      const vectors = await embedder.embedDocuments(texts);
      if (Array.isArray(vectors) && vectors.length === texts.length && vectors[0]?.length > 0) {
        return { modelName, vectors };
      }
    } catch (error) {
      lastError = error;
      console.warn(`[RAG] Embedding model ${modelName} failed:`, error.message);
    }
  }
  throw lastError || new Error("All embedding models failed.");
}

async function embedQueryWithFallback(query, preferredModel) {
  const ordered = preferredModel
    ? [preferredModel, ...EMBEDDING_MODELS.filter((m) => m !== preferredModel)]
    : EMBEDDING_MODELS;

  let lastError;
  for (const modelName of ordered) {
    try {
      const embedder = new GoogleGenerativeAIEmbeddings({
        model: modelName,
        apiKey: process.env.GEMINI_API_KEY,
      });
      const vector = await embedder.embedQuery(query);
      if (Array.isArray(vector) && vector.length > 0) {
        return vector;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Query embedding failed.");
}

async function getIndexedKnowledgeBase() {
  const markdown = await fs.readFile(kbPath, "utf-8");
  const hash = crypto.createHash("sha256").update(markdown).digest("hex");

  if (indexedChunksCache && cachedHash === hash) {
    return indexedChunksCache;
  }

  // Try loading precomputed embeddings from disk if KB hasn't changed
  try {
    const rawCache = await fs.readFile(cachePath, "utf-8");
    const parsed = JSON.parse(rawCache);
    if (parsed.hash === hash && Array.isArray(parsed.chunks) && parsed.chunks.length > 0) {
      indexedChunksCache = { modelName: parsed.modelName, chunks: parsed.chunks };
      cachedHash = hash;
      console.log(`[RAG] Loaded ${parsed.chunks.length} cached KB embeddings (${parsed.modelName}).`);
      return indexedChunksCache;
    }
  } catch {
    // Cache doesn't exist yet or is invalid
  }

  const chunks = chunkKnowledgeBase(markdown);

  try {
    const { modelName, vectors } = await createEmbeddingsWithFallback(
      chunks.map((c) => c.fullText)
    );
    const enriched = chunks.map((chunk, i) => ({
      ...chunk,
      embedding: vectors[i],
    }));

    indexedChunksCache = { modelName, chunks: enriched };
    cachedHash = hash;

    await fs.writeFile(
      cachePath,
      JSON.stringify({ hash, modelName, chunks: enriched }, null, 2)
    );
    console.log(`[RAG] Generated & cached ${enriched.length} KB embeddings (${modelName}).`);
    return indexedChunksCache;
  } catch (error) {
    console.warn("[RAG] Using unembedded chunks (lexical fallback):", error.message);
    indexedChunksCache = { modelName: null, chunks };
    cachedHash = hash;
    return indexedChunksCache;
  }
}

export async function retrieveKnowledge(query, topK = 3) {
  if (!query || typeof query !== "string") return [];

  const { modelName, chunks } = await getIndexedKnowledgeBase();
  const hasEmbeddings = chunks.every((c) => Array.isArray(c.embedding) && c.embedding.length > 0);

  if (hasEmbeddings) {
    try {
      const queryVector = await embedQueryWithFallback(query, modelName);
      const ranked = chunks
        .map((chunk) => ({
          id: chunk.id,
          title: chunk.title,
          content: chunk.content,
          score: Number(cosineSimilarity(queryVector, chunk.embedding).toFixed(4)),
          method: "vector",
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      return ranked;
    } catch (error) {
      console.warn("[RAG] Query embedding failed, falling back to lexical search:", error.message);
    }
  }

  return chunks
    .map((chunk) => ({
      id: chunk.id,
      title: chunk.title,
      content: chunk.content,
      score: Number(lexicalScore(query, chunk.fullText).toFixed(4)),
      method: "lexical",
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

