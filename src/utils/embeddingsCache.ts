import { CommentItem } from "../types";
import { getDeterministicPseudoEmbedding } from "./localLlm";

// Memory cache for high-dimensional vector embeddings to prevent React state bloating/lag,
// localStorage QuotaExceededError crashes, and out-of-memory errors on massive datasets.
const embeddingsCache = new Map<string, number[]>();

export function setCachedEmbedding(commentId: string, embedding: number[]) {
  if (commentId && Array.isArray(embedding)) {
    embeddingsCache.set(commentId, embedding);
  }
}

export function getCachedEmbedding(commentId: string): number[] | undefined {
  if (!commentId) return undefined;
  return embeddingsCache.get(commentId);
}

export function getCommentEmbedding(comment: CommentItem, useCustomEmbedding: boolean = false): number[] | undefined {
  if (!comment) return undefined;

  // 1. Check memory cache first
  const cached = embeddingsCache.get(comment.id);
  if (cached && cached.length > 0) {
    return cached;
  }

  // 2. Check comment object property
  if (comment.embedding && comment.embedding.length > 0) {
    embeddingsCache.set(comment.id, comment.embedding);
    return comment.embedding;
  }

  // 3. Fallback to deterministic pseudo-embedding on-the-fly if not using custom server embedding
  if (!useCustomEmbedding) {
    const pseudo = getDeterministicPseudoEmbedding(comment.text);
    embeddingsCache.set(comment.id, pseudo);
    return pseudo;
  }

  return undefined;
}

export function clearEmbeddingsCache() {
  embeddingsCache.clear();
}

export function loadEmbeddingsIntoCache(comments: { id: string; embedding?: number[] }[]) {
  for (const comment of comments) {
    if (comment.id && comment.embedding && Array.isArray(comment.embedding)) {
      setCachedEmbedding(comment.id, comment.embedding);
    }
  }
}
