import React from "react";
import { CommentItem, FilterState } from "../types";
import { BarChart3, PieChart, ShieldAlert, Sparkles, FilterX, Building } from "lucide-react";

interface DashboardStatsProps {
  comments: CommentItem[];
  filters: FilterState;
  onChangeFilters: (filters: FilterState) => void;
  onClearFilters: () => void;
  isFallback: boolean;
  onReclusterTopics?: () => void;
  onRevertReclustering?: () => void;
  canRevertReclustering?: boolean;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  comments,
  filters,
  onChangeFilters,
  onClearFilters,
  isFallback,
  onReclusterTopics,
  onRevertReclustering,
  canRevertReclustering,
}) => {
  // Compute aggregations (excluding archived comments)
  const activeComments = comments.filter((c) => !c.isArchived);

  // Apply all active filters to get the currently visible subset of comments for general stats and sentiment breakdown
  const visibleComments = activeComments.filter((item) => {
    if (filters.showDuplicatesOnly && !item.isDuplicate) return false;
    if (filters.sentiments.length > 0 && !filters.sentiments.includes(item.sentiment)) return false;
    if (filters.topics.length > 0 && !filters.topics.includes(item.topic)) return false;
    if (filters.organizations && filters.organizations.length > 0) {
      const org = item.organizationName || "(No Organization)";
      if (!filters.organizations.includes(org)) return false;
    }
    if (filters.searchQuery.trim().length > 0) {
      const query = filters.searchQuery.toLowerCase();
      const matchesText = item.text.toLowerCase().includes(query);
      const matchesTopic = item.topic.toLowerCase().includes(query);
      const matchesId = item.id.toLowerCase().includes(query);
      if (!matchesText && !matchesTopic && !matchesId) return false;
    }
    return true;
  });

  const totalCount = visibleComments.length;

  const sentimentCounts = visibleComments.reduce(
    (acc, c) => {
      acc[c.sentiment]++;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0 }
  );

  // For topic list, filter by everything EXCEPT the topic filter itself to keep multi-select options visible
  const commentsForTopicStats = activeComments.filter((item) => {
    if (filters.showDuplicatesOnly && !item.isDuplicate) return false;
    if (filters.sentiments.length > 0 && !filters.sentiments.includes(item.sentiment)) return false;
    if (filters.organizations && filters.organizations.length > 0) {
      const org = item.organizationName || "(No Organization)";
      if (!filters.organizations.includes(org)) return false;
    }
    if (filters.searchQuery.trim().length > 0) {
      const query = filters.searchQuery.toLowerCase();
      const matchesText = item.text.toLowerCase().includes(query);
      const matchesTopic = item.topic.toLowerCase().includes(query);
      const matchesId = item.id.toLowerCase().includes(query);
      if (!matchesText && !matchesTopic && !matchesId) return false;
    }
    return true;
  });

  const topicCounts = commentsForTopicStats.reduce((acc, c) => {
    acc[c.topic] = (acc[c.topic] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topicStatsTotal = commentsForTopicStats.length;

  // For organization list, filter by everything EXCEPT the organization filter itself to keep multi-select options visible
  const commentsForOrgStats = activeComments.filter((item) => {
    if (filters.showDuplicatesOnly && !item.isDuplicate) return false;
    if (filters.sentiments.length > 0 && !filters.sentiments.includes(item.sentiment)) return false;
    if (filters.topics.length > 0 && !filters.topics.includes(item.topic)) return false;
    if (filters.searchQuery.trim().length > 0) {
      const query = filters.searchQuery.toLowerCase();
      const matchesText = item.text.toLowerCase().includes(query);
      const matchesTopic = item.topic.toLowerCase().includes(query);
      const matchesId = item.id.toLowerCase().includes(query);
      if (!matchesText && !matchesTopic && !matchesId) return false;
    }
    return true;
  });

  const orgCounts = commentsForOrgStats.reduce((acc, c) => {
    const org = c.organizationName || "(No Organization)";
    acc[org] = (acc[org] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const orgStatsTotal = commentsForOrgStats.length;

  // For duplicate summary, filter by everything EXCEPT the duplicate filter itself to show potential duplicates in active subset
  const commentsForDuplicateStats = activeComments.filter((item) => {
    if (filters.sentiments.length > 0 && !filters.sentiments.includes(item.sentiment)) return false;
    if (filters.topics.length > 0 && !filters.topics.includes(item.topic)) return false;
    if (filters.organizations && filters.organizations.length > 0) {
      const org = item.organizationName || "(No Organization)";
      if (!filters.organizations.includes(org)) return false;
    }
    if (filters.searchQuery.trim().length > 0) {
      const query = filters.searchQuery.toLowerCase();
      const matchesText = item.text.toLowerCase().includes(query);
      const matchesTopic = item.topic.toLowerCase().includes(query);
      const matchesId = item.id.toLowerCase().includes(query);
      if (!matchesText && !matchesTopic && !matchesId) return false;
    }
    return true;
  });

  const duplicateCount = commentsForDuplicateStats.filter((c) => c.isDuplicate).length;

  // Sentiment distribution calculations
  const posPct = totalCount ? Math.round((sentimentCounts.positive / totalCount) * 100) : 0;
  const neuPct = totalCount ? Math.round((sentimentCounts.neutral / totalCount) * 100) : 0;
  const negPct = totalCount ? Math.round((sentimentCounts.negative / totalCount) * 100) : 0;

  // Toggle sentiment filter
  const handleToggleSentiment = (sentiment: 'positive' | 'neutral' | 'negative') => {
    const active = [...filters.sentiments];
    const idx = active.indexOf(sentiment);
    if (idx > -1) {
      active.splice(idx, 1);
    } else {
      active.push(sentiment);
    }
    onChangeFilters({ ...filters, sentiments: active });
  };

  // Toggle topic filter
  const handleToggleTopic = (topic: string) => {
    const active = [...filters.topics];
    const idx = active.indexOf(topic);
    if (idx > -1) {
      active.splice(idx, 1);
    } else {
      active.push(topic);
    }
    onChangeFilters({ ...filters, topics: active });
  };

  // Toggle organization filter
  const handleToggleOrg = (org: string) => {
    const active = filters.organizations ? [...filters.organizations] : [];
    const idx = active.indexOf(org);
    if (idx > -1) {
      active.splice(idx, 1);
    } else {
      active.push(org);
    }
    onChangeFilters({ ...filters, organizations: active });
  };

  // Check if filters are active
  const hasActiveFilters = 
    filters.sentiments.length > 0 || 
    filters.topics.length > 0 || 
    (filters.organizations && filters.organizations.length > 0) ||
    filters.searchQuery.trim().length > 0 || 
    filters.showDuplicatesOnly;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {/* 1. Overview Card & Sentiment Donut */}
      <div className="bg-white p-6 border border-[#E5E3DF] flex flex-col justify-between rounded-none">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-[#1A1A1A]" />
            <h3 className="font-serif italic text-base text-[#1A1A1A]">Sentiment Breakdown</h3>
          </div>
          {isFallback && (
            <span className="text-[9px] font-mono border border-[#E5E3DF] text-[#1A1A1A] opacity-60 px-2 py-0.5 rounded-none font-medium bg-[#F9F8F6]">
              Lexical Heuristics
            </span>
          )}
        </div>

        <div className="flex items-center gap-6 my-auto">
          {/* SVG Donut Chart */}
          <div className="relative w-28 h-28 flex-shrink-0">
            {totalCount > 0 ? (
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#E5E3DF" strokeWidth="2.5" />
                
                {/* Positive segment */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="none"
                  stroke="#4A6741"
                  strokeWidth="3"
                  strokeDasharray={`${posPct} ${100 - posPct}`}
                  strokeDashoffset="0"
                />
                
                {/* Neutral segment */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="none"
                  stroke="#8C867E"
                  strokeWidth="3"
                  strokeDasharray={`${neuPct} ${100 - neuPct}`}
                  strokeDashoffset={`-${posPct}`}
                />

                {/* Negative segment */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="none"
                  stroke="#A13D2D"
                  strokeWidth="3"
                  strokeDasharray={`${negPct} ${100 - negPct}`}
                  strokeDashoffset={`-${posPct + neuPct}`}
                />
              </svg>
            ) : (
              <div className="w-full h-full border border-dashed border-[#E5E3DF]" />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-light tracking-tighter text-[#1A1A1A]">{totalCount}</span>
              <span className="text-[9px] text-[#1A1A1A] opacity-50 uppercase tracking-widest font-semibold">Total</span>
            </div>
          </div>

          {/* Legend / Interactive Selectors */}
          <div className="flex-1 space-y-1">
            {[
              { type: "positive" as const, label: "Positive", color: "bg-[#4A6741]", pct: posPct, count: sentimentCounts.positive },
              { type: "neutral" as const, label: "Neutral", color: "bg-[#8C867E]", pct: neuPct, count: sentimentCounts.neutral },
              { type: "negative" as const, label: "Negative", color: "bg-[#A13D2D]", pct: negPct, count: sentimentCounts.negative },
            ].map((s) => {
              const isFiltered = filters.sentiments.includes(s.type);
              return (
                <button
                  key={s.type}
                  onClick={() => handleToggleSentiment(s.type)}
                  className={`flex items-center justify-between w-full p-1.5 text-left transition-all rounded-none border ${
                    isFiltered 
                      ? "bg-[#F9F8F6] border-[#1A1A1A] font-medium" 
                      : "hover:bg-[#F9F8F6]/50 border-transparent text-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${s.color}`} />
                    <span className="text-xs font-medium">{s.label}</span>
                  </div>
                  <div className="text-[11px] opacity-80 font-mono">
                    <span className="font-semibold text-[#1A1A1A]">{s.count}</span> <span className="opacity-50">({s.pct}%)</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Topic Clusters List */}
      <div className="bg-white p-6 border border-[#E5E3DF] flex flex-col rounded-none">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#1A1A1A]" />
            <h3 className="font-serif italic text-base text-[#1A1A1A]">Topic Clusters</h3>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {onReclusterTopics && activeComments.length > 0 && (
              <button
                onClick={onReclusterTopics}
                className="text-[9px] uppercase tracking-wider text-gray-500 hover:text-[#1A1A1A] hover:bg-[#F9F8F6] font-bold flex items-center gap-1 border border-[#E5E3DF] hover:border-[#1A1A1A] px-2 py-0.5 transition-colors cursor-pointer"
                title="Automatically extract authentic themes directly from comment texts"
              >
                <Sparkles className="w-2.5 h-2.5 text-[#1A1A1A]" />
                <span>Smart Re-Cluster</span>
              </button>
            )}
            {canRevertReclustering && onRevertReclustering && (
              <button
                onClick={onRevertReclustering}
                className="text-[9px] uppercase tracking-wider text-[#A13D2D] hover:bg-[#A13D2D]/5 font-bold flex items-center gap-1 border border-[#A13D2D]/20 hover:border-[#A13D2D] px-2 py-0.5 transition-colors cursor-pointer animate-in fade-in duration-150"
                title="Undo smart re-clustering and restore prior topic state"
              >
                <span>Undo / Revert</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto max-h-[140px] pr-1 space-y-1.5">
          {Object.keys(topicCounts).length > 0 ? (
            Object.entries(topicCounts).map(([topic, count]) => {
              const countNum = count as number;
              const isFiltered = filters.topics.includes(topic);
              const percentage = topicStatsTotal ? Math.round((countNum / topicStatsTotal) * 100) : 0;
              return (
                <button
                  key={topic}
                  onClick={() => handleToggleTopic(topic)}
                  className={`flex flex-col w-full p-2 text-left transition-all border rounded-none ${
                    isFiltered 
                      ? "bg-[#F9F8F6] border-[#1A1A1A]" 
                      : "bg-[#F9F8F6]/30 hover:bg-[#F9F8F6]/80 border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-medium text-[#1A1A1A] truncate max-w-[80%]">{topic}</span>
                    <span className="text-xs font-semibold text-gray-500 font-mono opacity-80">{count}</span>
                  </div>
                  <div className="w-full bg-[#E5E3DF] h-1 rounded-none overflow-hidden">
                    <div 
                      className="bg-[#1A1A1A] h-full rounded-none transition-all duration-300" 
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-400 py-6">
              No topic clusters.
            </div>
          )}
        </div>
      </div>

      {/* 3. Organization Filters (New!) */}
      <div className="bg-white p-6 border border-[#E5E3DF] flex flex-col rounded-none">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-[#1A1A1A]" />
            <h3 className="font-serif italic text-base text-[#1A1A1A]">Organizations</h3>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto max-h-[140px] pr-1 space-y-1.5">
          {Object.keys(orgCounts).length > 0 ? (
            Object.entries(orgCounts).map(([org, count]) => {
              const countNum = count as number;
              const isFiltered = filters.organizations?.includes(org);
              const percentage = orgStatsTotal ? Math.round((countNum / orgStatsTotal) * 100) : 0;
              return (
                <button
                  key={org}
                  onClick={() => handleToggleOrg(org)}
                  className={`flex flex-col w-full p-2 text-left transition-all border rounded-none ${
                    isFiltered 
                      ? "bg-[#F9F8F6] border-[#1A1A1A]" 
                      : "bg-[#F9F8F6]/30 hover:bg-[#F9F8F6]/80 border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-medium text-[#1A1A1A] truncate max-w-[80%]">{org}</span>
                    <span className="text-xs font-semibold text-gray-500 font-mono opacity-80">{count}</span>
                  </div>
                  <div className="w-full bg-[#E5E3DF] h-1 rounded-none overflow-hidden">
                    <div 
                      className="bg-[#4A6741] h-full rounded-none transition-all duration-300" 
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-400 py-6">
              No organization data.
            </div>
          )}
        </div>
      </div>

      {/* 4. Duplicates Summary Card */}
      <div className="bg-white p-6 border border-[#E5E3DF] flex flex-col justify-between rounded-none">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#A13D2D]" />
              <h3 className="font-serif italic text-base text-[#1A1A1A]">Deduplication Status</h3>
            </div>
            {duplicateCount > 0 && (
              <span className="flex h-1.5 w-1.5 rounded-full bg-[#A13D2D]" />
            )}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed font-sans text-[11px]">
            Semantic calculations flag <strong className="text-[#1A1A1A] font-semibold">{duplicateCount} duplicate</strong> entries (cosine match above {filters.similarityThreshold * 100}%).
          </p>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => onChangeFilters({ ...filters, showDuplicatesOnly: !filters.showDuplicatesOnly })}
            className={`flex-1 text-center py-2 text-[10px] uppercase tracking-widest font-semibold border transition-all rounded-none ${
              filters.showDuplicatesOnly
                ? "bg-[#A13D2D] text-white border-[#A13D2D]"
                : "bg-white text-[#1A1A1A] border-[#1A1A1A] hover:bg-[#F9F8F6]"
            }`}
          >
            {filters.showDuplicatesOnly ? "Show All" : "Isolate Duplicates"}
          </button>

          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              title="Reset Filters"
              className="px-4 py-2 border border-[#E5E3DF] hover:border-[#1A1A1A] hover:bg-[#F9F8F6] text-[#1A1A1A] rounded-none transition-all flex items-center gap-1.5"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-widest font-semibold">Reset</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
