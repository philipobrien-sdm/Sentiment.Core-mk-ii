import React, { useState, useMemo } from "react";
import { 
  Search, 
  Sparkle, 
  ArrowRight, 
  AlertCircle, 
  MapPin, 
  Loader2, 
  CheckCircle2, 
  TrendingUp, 
  CornerDownRight,
  Filter
} from "lucide-react";
import { CommentItem, LlmSettings } from "../types";
import { fetchLocalEmbeddings } from "../utils/localLlm";
import { calculateCosineSimilarity } from "./DuplicateReview";
import { getCommentEmbedding } from "../utils/embeddingsCache";

interface SemanticQueryProps {
  comments: CommentItem[];
  llmSettings: LlmSettings;
  selectedCommentId: string | null;
  onSelectComment: (id: string | null) => void;
  onNavigateToExplore: () => void;
  onReloadProjectionWithQuery?: (text: string, embedding: number[]) => void;
  onClearQueryNode?: () => void;
  onCriticallyReviewSearchResults: (queryText: string, results: CommentItem[]) => void;
  isAnalyzingSearchResults: boolean;
}

const SUGGESTED_QUERIES = [
  "Slow load times and laggy scrolling",
  "Great customer support and helpful team",
  "Pricing is too expensive for small businesses",
  "Feature request for dark mode or theme options",
  "App keeps crashing on startup or white screens"
];

export function SemanticQuery({
  comments,
  llmSettings,
  selectedCommentId,
  onSelectComment,
  onNavigateToExplore,
  onReloadProjectionWithQuery,
  onClearQueryNode,
  onCriticallyReviewSearchResults,
  isAnalyzingSearchResults,
}: SemanticQueryProps) {
  const [queryText, setQueryText] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryEmbedding, setQueryEmbedding] = useState<number[] | null>(null);
  const [minSimilarity, setMinSimilarity] = useState(0.4); // default 40%
  const [lastExecutedQuery, setLastExecutedQuery] = useState("");
  const [showConfirmWarning, setShowConfirmWarning] = useState(false);

  // Get active comments (exclude archived)
  const activeComments = useMemo(() => {
    return comments.filter(c => !c.isArchived);
  }, [comments]);

  // Count active comments with embeddings
  const commentsWithEmbeddingsCount = useMemo(() => {
    return activeComments.filter(c => getCommentEmbedding(c, llmSettings.useCustomEmbedding)).length;
  }, [activeComments, llmSettings.useCustomEmbedding]);

  const isQueryNodeActive = useMemo(() => {
    return comments.some(c => c.id === "user_query_node");
  }, [comments]);

  // Calculate similarity score for each comment based on the query embedding
  const scoredComments = useMemo(() => {
    if (!queryEmbedding) return [];

    return activeComments
      .map(comment => {
        let similarity = 0;
        const emb = getCommentEmbedding(comment, llmSettings.useCustomEmbedding);
        if (emb && emb.length > 0) {
          similarity = calculateCosineSimilarity(queryEmbedding, emb);
        }
        return {
          ...comment,
          similarityScore: similarity
        };
      })
      .filter(item => item.similarityScore >= minSimilarity)
      .sort((a, b) => b.similarityScore - a.similarityScore);
  }, [activeComments, queryEmbedding, minSimilarity, llmSettings.useCustomEmbedding]);

  // Perform the semantic query
  const handleSearch = async (textToSearch: string) => {
    const trimmed = textToSearch.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setError(null);
    try {
      // Fetch embedding of the single query string
      const embeddingResult = await fetchLocalEmbeddings([trimmed], llmSettings);
      
      if (embeddingResult && embeddingResult[0]) {
        setQueryEmbedding(embeddingResult[0]);
        setLastExecutedQuery(trimmed);
      } else {
        throw new Error("Unable to retrieve embedding vector for this text query.");
      }
    } catch (err: any) {
      console.error("Semantic search embedding generation failed:", err);
      setError(err.message || "Failed to generate semantic embedding vector. Please check your local LLM server settings.");
    } finally {
      setIsSearching(false);
    }
  };

  const selectSuggested = (query: string) => {
    setQueryText(query);
    handleSearch(query);
  };

  const handleLocateComment = (id: string) => {
    onSelectComment(id);
    onNavigateToExplore();
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "positive": return "text-[#4A6741] bg-[#4A6741]/5 border-[#4A6741]/20";
      case "negative": return "text-[#A13D2D] bg-[#A13D2D]/5 border-[#A13D2D]/20";
      default: return "text-gray-500 bg-gray-50 border-gray-200";
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300" id="semantic_query_panel">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E3DF] pb-5">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#1A1A1A] flex items-center gap-2">
            <Sparkle className="w-4 h-4 text-[#4A6741] animate-pulse" /> Semantic Query Engine
          </h2>
          <p className="text-[11px] text-gray-400 mt-1 uppercase tracking-wider">
            Vector search across your dataset using high-dimensional cosine similarity
          </p>
        </div>
        
        {/* Connection status indicator */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[#F9F8F6] border border-[#E5E3DF] text-[10px] font-mono text-gray-500 rounded-none shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${llmSettings.useCustomEmbedding ? "bg-green-500" : "bg-amber-500"}`} />
          <span>
            Mode: {llmSettings.useCustomEmbedding ? "Local Custom Embedding" : "Built-in Heuristic Mode"}
          </span>
          {llmSettings.useCustomEmbedding && (
            <span className="text-gray-400 border-l border-[#E5E3DF] pl-2">
              Model: {llmSettings.embeddingModel}
            </span>
          )}
        </div>
      </div>

      {/* WARNING IF NO EMBEDDINGS ARE INDEXED YET */}
      {commentsWithEmbeddingsCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800 flex items-start gap-3 rounded-none">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold uppercase tracking-wider text-[10px] mb-1">No Indexed Embeddings Found</p>
            <p className="text-amber-700/90 leading-relaxed">
              Your dataset doesn't have any semantic embeddings generated yet. Please navigate to the **Manage Datasets** tab and click **Start Vector Indexing** first. Semantic search will rely on client-side text heuristics until your actual dataset vector embeddings are completed.
            </p>
          </div>
        </div>
      )}

      {/* MAIN TWO-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: QUERY FORM */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-[#E5E3DF] p-6 space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
                Enter Query Statement
              </label>
              <div className="relative">
                <textarea
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="e.g. Find any user complaints regarding performance lag, loading delays, or high subscription prices..."
                  rows={4}
                  className="w-full bg-white border border-[#E5E3DF] p-4 text-xs focus:outline-none focus:border-[#1A1A1A] rounded-none resize-none font-serif leading-relaxed"
                />
                {queryText.trim().length > 0 && (
                  <div className="absolute right-2 bottom-3 text-[9px] font-mono text-gray-400 uppercase">
                    {queryText.trim().split(/\s+/).length} words
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => handleSearch(queryText)}
              disabled={isSearching || !queryText.trim()}
              className={`w-full py-3 text-[11px] uppercase tracking-wider font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all border ${
                !queryText.trim()
                  ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                  : isSearching
                  ? "bg-[#1A1A1A] text-white border-[#1A1A1A] opacity-80"
                  : "bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white border-[#1A1A1A]"
              }`}
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Computing Vector Embedding...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Execute Similarity Search</span>
                </>
              )}
            </button>

            {error && (
              <div className="bg-[#A13D2D]/5 border border-[#A13D2D]/10 p-3 text-xs text-[#A13D2D] flex items-start gap-2 rounded-none">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="font-medium leading-relaxed">{error}</span>
              </div>
            )}
          </div>

          {/* SUGGESTED PRESET SEARCH QUERIES */}
          <div className="bg-[#F9F8F6] border border-[#E5E3DF] p-6 space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Suggested Test Queries
            </h4>
            <div className="space-y-2">
              {SUGGESTED_QUERIES.map((query, idx) => (
                <button
                  key={idx}
                  onClick={() => selectSuggested(query)}
                  disabled={isSearching}
                  className="w-full text-left p-2.5 bg-white hover:bg-gray-50 border border-[#E5E3DF] hover:border-[#1A1A1A] text-[11px] text-gray-600 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate font-medium italic group-hover:text-[#1A1A1A]">
                    "{query}"
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SIMILARITY RESULTS */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* SEARCH CONTROLS & META STATISTICS */}
          <div className="bg-white border border-[#E5E3DF] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#4A6741]/5 border border-[#4A6741]/10 text-[#4A6741] flex items-center justify-center">
                <Filter className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                  Similarity Cutoff
                </span>
                <div className="text-xs font-bold text-[#1A1A1A]">
                  Match threshold &ge; {(minSimilarity * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="flex-1 max-w-xs">
              <input
                type="range"
                min="0.1"
                max="0.95"
                step="0.05"
                value={minSimilarity}
                onChange={(e) => setMinSimilarity(parseFloat(e.target.value))}
                className="w-full h-1 bg-[#E5E3DF] rounded-lg appearance-none cursor-pointer accent-[#1A1A1A]"
              />
              <div className="flex justify-between text-[9px] font-mono text-gray-400 mt-1 uppercase">
                <span>0.10 (Broad)</span>
                <span>0.95 (Strict)</span>
              </div>
            </div>
          </div>

          {/* ACTIVE QUERY DISPLAY & RESULTS GRID */}
          <div className="space-y-4">
            {queryEmbedding ? (
              <div className="space-y-4">
                {/* OLDSCHOOL PERSISTENT VECTOR QUERY INJECTION CONTROLLER */}
                <div className="bg-white border-2 border-dashed border-[#1A1A1A]/30 p-6 space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 bg-[#1A1A1A]/5 border border-[#1A1A1A]/10 text-[#1A1A1A] flex items-center justify-center shrink-0">
                      <Sparkle className="w-5 h-5 text-[#4A6741]" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A1A1A] flex items-center gap-2">
                        Oldschool Vector Projection Hub
                      </h3>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        Inject this search query as a custom high-dimensional coordinate node inside the 2D cluster! By calculating the query's actual vector and adding it as a node, you can visually locate where it sits inside the Similarity Map relative to adjacent user feedback.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-dashed border-[#E5E3DF] flex flex-wrap gap-3.5 justify-between items-center">
                    <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                      Status:{" "}
                      {isQueryNodeActive ? (
                        <span className="text-green-600 font-bold">🟢 Active in cluster</span>
                      ) : (
                        <span className="text-amber-500 font-bold">🟡 Pending injection</span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {isQueryNodeActive && onClearQueryNode && (
                        <button
                          onClick={onClearQueryNode}
                          className="px-3.5 py-2 bg-white hover:bg-gray-50 text-[#A13D2D] hover:text-[#A13D2D]/90 border border-gray-300 hover:border-gray-400 text-[10px] uppercase tracking-wider font-semibold transition-all cursor-pointer"
                        >
                          Clear Node from Map
                        </button>
                      )}

                      {onReloadProjectionWithQuery && (
                        <button
                          onClick={() => {
                            onReloadProjectionWithQuery(lastExecutedQuery, queryEmbedding);
                            onNavigateToExplore();
                          }}
                          className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <span>{isQueryNodeActive ? "Reload & Re-Cluster Map" : "Inject Node & Reload Map"}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-gray-400 uppercase tracking-wider font-mono gap-4 bg-white border border-[#E5E3DF] p-4">
                  <div className="space-y-1">
                    <div>Results for: <strong className="text-gray-700 font-bold">"{lastExecutedQuery}"</strong></div>
                    <div className="text-[10px]">{scoredComments.length} match{scoredComments.length === 1 ? "" : "es"} found</div>
                  </div>

                  <div>
                    {isAnalyzingSearchResults ? (
                      <button
                        disabled
                        className="px-4 py-2 bg-[#1A1A1A]/10 text-[#1A1A1A] text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5"
                      >
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1A1A1A]" />
                        <span>Analyzing Matches...</span>
                      </button>
                    ) : showConfirmWarning ? (
                      <div className="bg-[#A13D2D]/5 p-3 border border-[#A13D2D]/20 text-center space-y-2 animate-in fade-in duration-200">
                        <p className="text-[9px] text-[#A13D2D] font-mono uppercase font-bold leading-tight max-w-xs">
                          ⚠️ Warning: Over 30 matches ({scoredComments.length}) to synthesize. Proceed?
                        </p>
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => setShowConfirmWarning(false)}
                            className="px-2.5 py-1 bg-white border border-gray-300 hover:border-gray-400 text-gray-700 text-[9px] font-mono uppercase font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              setShowConfirmWarning(false);
                              onCriticallyReviewSearchResults(lastExecutedQuery, scoredComments);
                            }}
                            className="px-2.5 py-1 bg-[#A13D2D] hover:bg-[#A13D2D]/90 text-white text-[9px] font-mono uppercase font-bold cursor-pointer"
                          >
                            Proceed
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (scoredComments.length === 0) return;
                          if (scoredComments.length > 30) {
                            setShowConfirmWarning(true);
                          } else {
                            onCriticallyReviewSearchResults(lastExecutedQuery, scoredComments);
                          }
                        }}
                        className="px-4 py-2.5 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Sparkle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Critique Match Set ({scoredComments.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {scoredComments.length > 0 ? (
                  <div className="space-y-4 max-h-[580px] overflow-y-auto pr-1">
                    {scoredComments.map((comment) => {
                      const matchPct = Math.round((comment.similarityScore || 0) * 100);
                      const isSelectedOnMap = selectedCommentId === comment.id;

                      return (
                        <div 
                          key={comment.id}
                          className={`bg-white border p-5 transition-all space-y-3.5 relative ${
                            isSelectedOnMap 
                              ? "border-[#1A1A1A] ring-1 ring-[#1A1A1A]" 
                              : "border-[#E5E3DF] hover:border-gray-400"
                          }`}
                        >
                          {/* Similarity Badge & Metadata pills */}
                          <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2">
                              {/* Match Percentage Indicator */}
                              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#4A6741]/5 border border-[#4A6741]/20 rounded-none text-[#4A6741] font-mono text-[10px] font-bold">
                                <TrendingUp className="w-3 h-3" />
                                <span>{matchPct}% SIMILAR</span>
                              </div>

                              {/* Comment ID */}
                              <span className="text-[9px] font-mono text-gray-400 uppercase">
                                ID: {comment.id}
                              </span>
                            </div>

                            {/* Tags */}
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 border ${getSentimentColor(comment.sentiment)}`}>
                                {comment.sentiment}
                              </span>
                              <span className="text-[9px] uppercase font-bold text-gray-500 bg-gray-50 border border-gray-200 tracking-wider px-2 py-0.5">
                                {comment.topic}
                              </span>
                            </div>
                          </div>

                          {/* Raw comment text */}
                          <div className="text-xs text-gray-800 leading-relaxed font-serif italic border-l-2 border-gray-200 pl-3">
                            "{comment.text}"
                          </div>

                          {/* Detailed columns from CSV if available */}
                          {comment.originalRowData && Object.keys(comment.originalRowData).length > 0 && (
                            <div className="bg-[#F9F8F6] p-3 text-[10px] space-y-1.5 border border-[#E5E3DF] font-mono text-gray-500">
                              <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400 block mb-1">
                                Original CSV Row Metadata
                              </span>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {Object.entries(comment.originalRowData)
                                  .filter(([key, val]) => val && key.toLowerCase() !== "comment" && key.toLowerCase() !== "text")
                                  .slice(0, 6)
                                  .map(([key, val]) => (
                                    <div key={key} className="truncate" title={`${key}: ${val}`}>
                                      <strong className="text-gray-700">{key}:</strong> {val}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                          {/* Action panel */}
                          <div className="flex items-center justify-between pt-2.5 border-t border-[#F2F1ED] text-xs">
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                              <CornerDownRight className="w-3 h-3" />
                              Coordinate projection: ({comment.x.toFixed(2)}, {comment.y.toFixed(2)})
                            </span>

                            <button
                              onClick={() => handleLocateComment(comment.id)}
                              className="px-3 py-1 bg-white hover:bg-[#1A1A1A] text-[#1A1A1A] hover:text-white border border-[#E5E3DF] hover:border-[#1A1A1A] text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                              <span>Show on Plot</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white border border-[#E5E3DF] p-12 text-center rounded-none shadow-none flex flex-col items-center justify-center min-h-[250px]">
                    <AlertCircle className="w-6 h-6 text-gray-400 mb-2" />
                    <p className="text-xs font-bold uppercase text-[#1A1A1A]">No matches found</p>
                    <p className="text-[11px] text-gray-400 max-w-[280px] mt-1 leading-relaxed">
                      Try lowering your Similarity Cutoff threshold or search for alternative keywords to find related records.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-[#E5E3DF] p-16 text-center rounded-none shadow-none flex flex-col items-center justify-center min-h-[350px]">
                <div className="w-12 h-12 border border-[#E5E3DF] text-gray-300 flex items-center justify-center mb-4">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="text-xs font-bold uppercase text-[#1A1A1A] tracking-wider mb-1">
                  Ready to Search
                </h3>
                <p className="text-[11px] text-gray-400 max-w-sm leading-relaxed">
                  Enter your search criteria or select one of the suggested query templates to view relative semantic matches in real-time.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
