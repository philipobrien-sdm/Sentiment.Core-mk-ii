import React, { useMemo, useState } from "react";
import { CommentItem, DuplicateGroup } from "../types";
import { getCommentEmbedding } from "../utils/embeddingsCache";
import { 
  Trash2, CheckCircle, AlertTriangle, ArrowRight, ShieldAlert, 
  FileSpreadsheet, Download, RefreshCw, FileText, ChevronRight, 
  Eye, Layers, HelpCircle, User, Activity, Clock, ShieldCheck, 
  Calendar, Check, ArrowDownToLine, Info, Search, X, Sparkles, Loader2
} from "lucide-react";
import Papa from "papaparse";

interface DuplicateReviewProps {
  comments: CommentItem[];
  similarityThreshold: number;
  onChangeThreshold: (val: number) => void;
  onArchiveDuplicate: (duplicateId: string) => void;
  onDismissDuplicate: (id: string) => void;
  useCustomEmbedding?: boolean;
  onCriticallyReviewCluster?: (group: DuplicateGroup, groupIndex: number) => void;
  isAnalyzingClusterId?: string | null;
}

// Cosine similarity helper for vectors
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || !Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecB.length === 0) {
    return 0;
  }
  // If lengths differ, compare up to the shorter one or pad, but let's compare up to the minimum length to prevent crash
  const len = Math.min(vecA.length, vecB.length);
  if (len === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const valA = vecA[i] || 0;
    const valB = vecB[i] || 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const DuplicateReview: React.FC<DuplicateReviewProps> = ({
  comments,
  similarityThreshold,
  onChangeThreshold,
  onArchiveDuplicate,
  onDismissDuplicate,
  useCustomEmbedding = false,
  onCriticallyReviewCluster,
  isAnalyzingClusterId = null,
}) => {
  // Sub-tab selection: "groups" vs "action-plan"
  const [subTab, setSubTab] = useState<"groups" | "action-plan">("groups");
  
  // Track manually overridden primary comment IDs for each duplicate group
  const [manuallySelectedPrimary, setManuallySelectedPrimary] = useState<Record<string, string>>({});
  
  // Track which comment ID is expanded for a full CSV metadata inspection
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);

  // Search keyword state to filter clusters
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Group duplicates using a stable leader-based clustering algorithm
  const duplicateGroups = useMemo(() => {
    const active = comments.filter((c) => !c.isArchived && c.id !== "user_query_node" && getCommentEmbedding(c, useCustomEmbedding));
    const groups: DuplicateGroup[] = [];
    const assignedIds = new Set<string>();

    // Performance safety safeguard:
    // If there are more than 1,500 active records with embeddings, we limit similarity checking 
    // to the first 1,500 comments to prevent the browser from freezing (O(N^2) complexity limit).
    const limit = Math.min(active.length, 1500);

    for (let i = 0; i < limit; i++) {
      const itemA = active[i];
      if (assignedIds.has(itemA.id)) continue;

      const groupDuplicates: { comment: CommentItem; similarity: number }[] = [];
      const embA = getCommentEmbedding(itemA, useCustomEmbedding);

      for (let j = i + 1; j < limit; j++) {
        const itemB = active[j];
        if (assignedIds.has(itemB.id)) continue;

        const embB = getCommentEmbedding(itemB, useCustomEmbedding);

        if (embA && embB) {
          const similarity = calculateCosineSimilarity(embA, embB);
          if (similarity >= similarityThreshold) {
            groupDuplicates.push({
              comment: itemB,
              similarity,
            });
          }
        }
      }

      if (groupDuplicates.length > 0) {
        assignedIds.add(itemA.id);
        groupDuplicates.forEach((g) => assignedIds.add(g.comment.id));

        groups.push({
          id: `group_${i + 1}`,
          originalComment: itemA,
          duplicates: groupDuplicates,
        });
      }
    }

    return groups;
  }, [comments, similarityThreshold, useCustomEmbedding]);

  // 2. Adjust groups based on manually selected primary overrides
  const processedGroups = useMemo(() => {
    return duplicateGroups.map((group) => {
      const chosenId = manuallySelectedPrimary[group.id];
      if (!chosenId || chosenId === group.originalComment.id) {
        return group;
      }

      const index = group.duplicates.findIndex((d) => d.comment.id === chosenId);
      if (index === -1) return group;

      const chosenDuplicate = group.duplicates[index];
      
      const oldPrimaryAsDuplicate = {
        comment: group.originalComment,
        similarity: chosenDuplicate.similarity,
      };

      const newDuplicates = [
        ...group.duplicates.slice(0, index),
        ...group.duplicates.slice(index + 1),
        oldPrimaryAsDuplicate,
      ];

      return {
        ...group,
        originalComment: chosenDuplicate.comment,
        duplicates: newDuplicates,
      };
    });
  }, [duplicateGroups, manuallySelectedPrimary]);

  // Filtered list of groups based on the search query text
  const filteredProcessedGroups = useMemo(() => {
    if (!searchQuery.trim()) return processedGroups;
    const query = searchQuery.toLowerCase().trim();
    return processedGroups.filter((group) => {
      const matchOriginal = 
        group.originalComment.text.toLowerCase().includes(query) ||
        (group.originalComment.topic && group.originalComment.topic.toLowerCase().includes(query)) ||
        (group.originalComment.sentiment && group.originalComment.sentiment.toLowerCase().includes(query)) ||
        (group.originalComment.csvRowIndex && String(group.originalComment.csvRowIndex).includes(query)) ||
        group.originalComment.id.toLowerCase().includes(query);
        
      const matchDuplicates = group.duplicates.some((dup) => 
        dup.comment.text.toLowerCase().includes(query) ||
        (dup.comment.topic && dup.comment.topic.toLowerCase().includes(query)) ||
        (dup.comment.sentiment && dup.comment.sentiment.toLowerCase().includes(query)) ||
        (dup.comment.csvRowIndex && String(dup.comment.csvRowIndex).includes(query)) ||
        dup.comment.id.toLowerCase().includes(query)
      );
      
      return matchOriginal || matchDuplicates;
    });
  }, [processedGroups, searchQuery]);

  // 3. Map comment IDs to their active deduplication roles
  const commentActionMap = useMemo(() => {
    const map: Record<string, { 
      action: "KEEP_PRIMARY" | "KEEP_UNIQUE" | "REMOVE_DUPLICATE"; 
      groupId?: string;
      primaryRowIndex?: number; 
      primaryId?: string; 
      similarity?: number;
    }> = {};

    const activeComments = comments.filter(c => !c.isArchived);

    // Default everything to unique
    activeComments.forEach((c) => {
      map[c.id] = { action: "KEEP_UNIQUE" };
    });

    // Overwrite based on active groups
    processedGroups.forEach((group) => {
      map[group.originalComment.id] = { action: "KEEP_PRIMARY", groupId: group.id };
      group.duplicates.forEach((dup) => {
        map[dup.comment.id] = {
          action: "REMOVE_DUPLICATE",
          groupId: group.id,
          primaryRowIndex: group.originalComment.csvRowIndex,
          primaryId: group.originalComment.id,
          similarity: dup.similarity,
        };
      });
    });

    return map;
  }, [comments, processedGroups]);

  // Total active duplicate items counts
  const totalDuplicateRecordsCount = useMemo(() => {
    return Object.values(commentActionMap).filter((v: any) => v && v.action === "REMOVE_DUPLICATE").length;
  }, [commentActionMap]);

  // 4. Group redundancy densities by Topic Cluster
  const redundancyByTopic = useMemo(() => {
    const distribution: Record<string, { total: number; duplicates: number }> = {};
    
    comments.filter(c => !c.isArchived).forEach((c) => {
      if (!distribution[c.topic]) {
        distribution[c.topic] = { total: 0, duplicates: 0 };
      }
      distribution[c.topic].total += 1;
      const status = commentActionMap[c.id];
      if (status && status.action === "REMOVE_DUPLICATE") {
        distribution[c.topic].duplicates += 1;
      }
    });

    return Object.entries(distribution).map(([topic, counts]) => ({
      topic,
      total: counts.total,
      duplicates: counts.duplicates,
      percentage: counts.total > 0 ? (counts.duplicates / counts.total) * 100 : 0,
    })).sort((a, b) => b.duplicates - a.duplicates);
  }, [comments, commentActionMap]);

  // Download safe helper function
  const triggerDownload = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export 1: Pristine clean deduplicated CSV
  const handleDownloadCleanCsv = () => {
    const keptComments = comments.filter((c) => {
      if (c.isArchived) return false;
      const status = commentActionMap[c.id];
      return status && (status.action === "KEEP_PRIMARY" || status.action === "KEEP_UNIQUE");
    });

    if (keptComments.length === 0) {
      alert("No unique comments found to export.");
      return;
    }

    const rowsToExport = keptComments.map((c) => {
      if (c.originalRowData) {
        return c.originalRowData;
      }
      return {
        "Comment ID": c.id,
        "Feedback text": c.text,
        "Sentiment Label": c.sentiment,
        "Topic Cluster": c.topic,
        "Date Received": c.timestamp || ""
      };
    });

    const csvContent = Papa.unparse(rowsToExport);
    triggerDownload(csvContent, `deduplicated_clean_feedback_${new Date().toISOString().split('T')[0]}.csv`, "text/csv;charset=utf-8;");
  };

  // Export 2: Annotated Audit Log with clean traceability columns
  const handleDownloadAnnotatedCsv = () => {
    const activeList = comments.filter(c => !c.isArchived);

    if (activeList.length === 0) {
      alert("No records to export.");
      return;
    }

    const rowsToExport = activeList.map((c) => {
      const status = commentActionMap[c.id];
      const baseData = c.originalRowData 
        ? { ...c.originalRowData } 
        : {
            "Comment ID": c.id,
            "Feedback text": c.text,
            "Sentiment Label": c.sentiment,
            "Topic Cluster": c.topic,
            "Date Received": c.timestamp || ""
          };

      let actionStr = "KEEP (Unique)";
      let refRow = "";
      let simScore = "";

      if (status) {
        if (status.action === "KEEP_PRIMARY") {
          actionStr = "KEEP (Primary copy)";
        } else if (status.action === "REMOVE_DUPLICATE") {
          actionStr = `REMOVE (Duplicate of Row #${status.primaryRowIndex})`;
          refRow = String(status.primaryRowIndex || "");
          simScore = status.similarity ? `${(status.similarity * 100).toFixed(1)}%` : "";
        }
      }

      return {
        ...baseData,
        "Deduplication_Action": actionStr,
        "Deduplication_Primary_Reference_Row": refRow,
        "Deduplication_Similarity_Score": simScore
      };
    });

    const csvContent = Papa.unparse(rowsToExport);
    triggerDownload(csvContent, `annotated_audit_feedback_${new Date().toISOString().split('T')[0]}.csv`, "text/csv;charset=utf-8;");
  };

  // Action: Bulk archive duplicates in a specific group
  const handleBulkArchiveGroup = (group: DuplicateGroup) => {
    group.duplicates.forEach((dup) => {
      onArchiveDuplicate(dup.comment.id);
    });
  };

  // Action: Dismiss entire group duplicates
  const handleBulkDismissGroup = (group: DuplicateGroup) => {
    onDismissDuplicate(group.originalComment.id);
    group.duplicates.forEach((dup) => {
      onDismissDuplicate(dup.comment.id);
    });
  };

  // Helper to extract a nice identifier for row display
  const getRowDescriptor = (item: CommentItem) => {
    if (item.csvRowIndex) {
      return `CSV Row #${item.csvRowIndex}`;
    }
    return `ID: ${item.id}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* 1. Header Configurations Card */}
      <div className="bg-white p-6 border border-[#E5E3DF] rounded-none shadow-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-dashed border-[#E5E3DF] pb-5 mb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#4A6741]" />
              <h2 className="font-serif italic text-lg text-[#1A1A1A]">Advanced Deduplication & File Alignment</h2>
            </div>
            <p className="text-xs text-gray-400">
              Isolate redundant stakeholder responses, choose primary source representatives, and trace modifications directly back to original CSV rows.
            </p>
          </div>

          {/* Sub-tab selection buttons */}
          <div className="flex border border-[#E5E3DF] p-1 bg-[#F9F8F6] shrink-0 self-start">
            <button
              onClick={() => setSubTab("groups")}
              className={`px-4 py-1.5 text-[10px] uppercase tracking-wider font-bold transition-all rounded-none cursor-pointer ${
                subTab === "groups"
                  ? "bg-[#1A1A1A] text-white"
                  : "text-gray-400 hover:text-[#1A1A1A]"
              }`}
            >
              Duplicate Clusters ({processedGroups.length})
            </button>
            <button
              onClick={() => setSubTab("action-plan")}
              className={`px-4 py-1.5 text-[10px] uppercase tracking-wider font-bold transition-all rounded-none cursor-pointer ${
                subTab === "action-plan"
                  ? "bg-[#1A1A1A] text-white"
                  : "text-gray-400 hover:text-[#1A1A1A]"
              }`}
            >
              CSV Action Plan & Export
            </button>
          </div>
        </div>

        {/* Configurations Parameters Slider */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="lg:col-span-2 space-y-1">
            <label className="text-xs font-semibold tracking-wide text-[#1A1A1A] flex items-center justify-between">
              <span>Minimum Semantic Matching Threshold:</span>
              <span className="font-mono text-[#A13D2D] font-bold bg-[#A13D2D]/5 border border-[#A13D2D]/20 px-2 py-0.5">
                {(similarityThreshold * 100).toFixed(0)}% Vector Similarity
              </span>
            </label>
            <input
              type="range"
              min="0.70"
              max="0.99"
              step="0.01"
              value={similarityThreshold}
              onChange={(e) => onChangeThreshold(parseFloat(e.target.value))}
              className="w-full h-1 bg-[#E5E3DF] appearance-none cursor-pointer accent-[#1A1A1A] focus:outline-none"
            />
            <div className="flex justify-between text-[9px] text-gray-400 font-mono">
              <span>70% (Loose Matching - catches fuzzy rephrasings)</span>
              <span>99% (Near Exact - catches identical transcripts)</span>
            </div>
          </div>

          <div className="bg-[#F9F8F6] p-4 border border-[#E5E3DF] flex items-center justify-between">
            <div>
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Potential Redundancies</span>
              <p className="text-2xl font-light tracking-tight text-[#1A1A1A] font-mono">
                {totalDuplicateRecordsCount} Rows
              </p>
            </div>
            {totalDuplicateRecordsCount > 0 ? (
              <span className="text-[9px] uppercase tracking-wider bg-[#A13D2D]/10 border border-[#A13D2D]/20 text-[#A13D2D] px-2.5 py-1.5 font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> High Redundancy
              </span>
            ) : (
              <span className="text-[9px] uppercase tracking-wider bg-[#4A6741]/10 border border-[#4A6741]/20 text-[#4A6741] px-2.5 py-1.5 font-bold flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" /> Clean Dataset
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Performance safety warning for massive datasets */}
      {comments.filter(c => !c.isArchived && getCommentEmbedding(c, useCustomEmbedding)).length > 1500 && (
        <div className="bg-[#A13D2D]/5 border border-[#A13D2D]/20 p-4 text-xs text-[#A13D2D] flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[#A13D2D]" />
          <div className="space-y-1">
            <span className="font-bold uppercase tracking-wider text-[10px]">Performance Safeguard Active</span>
            <p className="text-gray-500 leading-relaxed">
              To guarantee smooth browser execution and prevent CPU lockups, the semantic similarity deduplication loop is limited to the first **1,500 records** of your dataset. All other explorer, stats, and metadata views will continue displaying the full dataset correctly.
            </p>
          </div>
        </div>
      )}

      {/* 2. SUBTAB: GROUPS VIEW */}
      {subTab === "groups" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Main group list (3/4 layout) */}
          <div className="lg:col-span-3 space-y-4">
            
            {/* Search Input Filter for Clusters */}
            <div className="bg-white p-5 border border-[#E5E3DF] space-y-3.5 rounded-none shadow-none">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A]">
                  Filter Clusters by Keyword
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Type a keyword to filter duplicate clusters (e.g., 'speed', 'payment', 'bug')..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#F9F8F6] border border-[#E5E3DF] pl-10 pr-10 py-2.5 text-xs focus:outline-none focus:border-[#1A1A1A] transition-colors rounded-none placeholder-gray-400 font-medium"
                />
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <Search className="w-4 h-4" />
                </div>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1A1A1A] transition-colors p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {searchQuery && (
                <div className="flex justify-between items-center text-[10px] font-mono text-gray-400 uppercase">
                  <span>Filtered: <strong className="text-[#A13D2D] font-bold">"{searchQuery}"</strong></span>
                  <span>{filteredProcessedGroups.length} of {processedGroups.length} cluster{processedGroups.length === 1 ? "" : "s"} shown</span>
                </div>
              )}
            </div>

            {processedGroups.length > 0 ? (
              filteredProcessedGroups.length > 0 ? (
                filteredProcessedGroups.map((group, gIdx) => {
                  const totalMembersInGroup = 1 + group.duplicates.length;
                  return (
                    <div
                      key={group.id}
                      className="bg-white border border-[#E5E3DF] rounded-none overflow-hidden divide-y divide-[#E5E3DF] hover:border-[#1A1A1A] transition-colors"
                    >
                      {/* Header bar */}
                      <div className="bg-[#F9F8F6] px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] bg-white border border-[#E5E3DF] text-[#1A1A1A] font-bold px-2.5 py-1 rounded-none font-mono tracking-wider">
                            CLUSTER #{gIdx + 1}
                          </span>
                          <span className="text-[9px] text-gray-400 font-mono uppercase">
                            ({totalMembersInGroup} comments in group)
                          </span>
                        </div>
                        <span className="text-[10px] bg-[#A13D2D]/10 border border-[#A13D2D]/20 text-[#A13D2D] px-2 py-0.5 rounded-none font-mono font-semibold">
                          Max Sim: {(group.duplicates[0]?.similarity * 100).toFixed(1)}%
                        </span>
                      </div>

                      {/* Interactive Selector with comments listed */}
                      <div className="p-5 space-y-4">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                          CHOOSE REPRESENTATIVE COMMENT TO RETAIN (Other rows will be flagged for removal/archived):
                        </p>

                        <div className="space-y-3">
                          {/* 1. Primary Option */}
                          <div 
                            className={`p-4 border transition-colors cursor-pointer flex items-start gap-4 ${
                              manuallySelectedPrimary[group.id] === group.originalComment.id || !manuallySelectedPrimary[group.id]
                                ? "bg-[#4A6741]/5 border-[#4A6741]/35"
                                : "bg-white border-[#E5E3DF] hover:bg-gray-50"
                            }`}
                            onClick={() => setManuallySelectedPrimary({ ...manuallySelectedPrimary, [group.id]: group.originalComment.id })}
                          >
                            <div className="pt-0.5">
                              <input
                                type="radio"
                                name={`primary-selector-${group.id}`}
                                checked={manuallySelectedPrimary[group.id] === group.originalComment.id || !manuallySelectedPrimary[group.id]}
                                onChange={() => {}}
                                className="accent-[#4A6741] cursor-pointer"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#4A6741] flex items-center gap-1.5">
                                  <Check className="w-3.5 h-3.5" /> Retained Record (Primary Copy)
                                </span>
                                <span className="text-[10px] font-mono text-gray-400 font-medium bg-gray-100 border border-gray-200/50 px-1.5 py-0.5">
                                  {getRowDescriptor(group.originalComment)}
                                </span>
                              </div>
                              <p className="text-xs text-[#1A1A1A] font-serif italic leading-relaxed">
                                "{group.originalComment.text}"
                              </p>
                              
                              {/* Metadata Pill Indicators */}
                              <div className="flex flex-wrap gap-2 pt-1.5">
                                <span className="text-[9px] font-semibold bg-[#F9F8F6] border border-[#E5E3DF] text-gray-500 px-2 py-0.5">
                                  Topic: {group.originalComment.topic}
                                </span>
                                <span className="text-[9px] font-semibold bg-[#F9F8F6] border border-[#E5E3DF] text-gray-500 px-2 py-0.5 uppercase">
                                  Sentiment: {group.originalComment.sentiment}
                                </span>
                                {group.originalComment.originalRowData && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedCommentId(expandedCommentId === group.originalComment.id ? null : group.originalComment.id);
                                    }}
                                    className="text-[9px] text-[#4A6741] hover:underline flex items-center gap-1 font-semibold ml-auto"
                                  >
                                    <Eye className="w-3 h-3" /> Inspect original row cols
                                  </button>
                                )}
                              </div>

                              {/* CSV Inspector panel */}
                              {expandedCommentId === group.originalComment.id && group.originalComment.originalRowData && (
                                <div className="bg-[#F9F8F6] border border-[#E5E3DF] p-3 text-[11px] font-mono text-gray-600 mt-2 space-y-1">
                                  <p className="text-[9px] font-bold uppercase text-gray-400 mb-1 border-b border-gray-200 pb-0.5">Original File Columns</p>
                                  {Object.entries(group.originalComment.originalRowData).map(([k, v]) => (
                                    <div key={k} className="flex justify-between gap-4">
                                      <span className="text-gray-400 font-bold">{k}:</span>
                                      <span className="text-right text-gray-800 break-all">{v || "(empty)"}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 2. Duplicates options */}
                          {group.duplicates.map((dup) => {
                            const isSelectedPrimary = manuallySelectedPrimary[group.id] === dup.comment.id;
                            return (
                              <div 
                                key={dup.comment.id}
                                className={`p-4 border transition-colors cursor-pointer flex items-start gap-4 ${
                                  isSelectedPrimary
                                    ? "bg-[#4A6741]/5 border-[#4A6741]/35"
                                    : "bg-white border-[#E5E3DF] hover:bg-gray-50"
                                }`}
                                onClick={() => setManuallySelectedPrimary({ ...manuallySelectedPrimary, [group.id]: dup.comment.id })}
                              >
                                <div className="pt-0.5">
                                  <input
                                    type="radio"
                                    name={`primary-selector-${group.id}`}
                                    checked={isSelectedPrimary}
                                    onChange={() => {}}
                                    className="accent-[#4A6741] cursor-pointer"
                                  />
                                </div>
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelectedPrimary ? 'text-[#4A6741]' : 'text-[#A13D2D]'} flex items-center gap-1.5`}>
                                      {isSelectedPrimary ? (
                                        <>
                                          <Check className="w-3.5 h-3.5" /> Retained Record (Primary Copy)
                                        </>
                                      ) : (
                                        <>
                                          <AlertTriangle className="w-3.5 h-3.5" /> Redundant Duplicate (Match similarity: {(dup.similarity * 100).toFixed(1)}%)
                                        </>
                                      )}
                                    </span>
                                    <span className="text-[10px] font-mono text-gray-400 font-medium bg-gray-100 border border-gray-200/50 px-1.5 py-0.5">
                                      {getRowDescriptor(dup.comment)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#1A1A1A] font-serif italic leading-relaxed">
                                    "{dup.comment.text}"
                                  </p>
                                  
                                  {/* Metadata pills */}
                                  <div className="flex flex-wrap gap-2 pt-1.5">
                                    <span className="text-[9px] font-semibold bg-[#F9F8F6] border border-[#E5E3DF] text-gray-500 px-2 py-0.5">
                                      Topic: {dup.comment.topic}
                                    </span>
                                    <span className="text-[9px] font-semibold bg-[#F9F8F6] border border-[#E5E3DF] text-gray-500 px-2 py-0.5 uppercase">
                                      Sentiment: {dup.comment.sentiment}
                                    </span>
                                    {dup.comment.originalRowData && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedCommentId(expandedCommentId === dup.comment.id ? null : dup.comment.id);
                                        }}
                                        className="text-[9px] text-[#4A6741] hover:underline flex items-center gap-1 font-semibold ml-auto"
                                      >
                                        <Eye className="w-3 h-3" /> Inspect original row cols
                                      </button>
                                    )}
                                  </div>

                                  {/* CSV Inspector panel */}
                                  {expandedCommentId === dup.comment.id && dup.comment.originalRowData && (
                                    <div className="bg-[#F9F8F6] border border-[#E5E3DF] p-3 text-[11px] font-mono text-gray-600 mt-2 space-y-1">
                                      <p className="text-[9px] font-bold uppercase text-gray-400 mb-1 border-b border-gray-200 pb-0.5">Original File Columns</p>
                                      {Object.entries(dup.comment.originalRowData).map(([k, v]) => (
                                        <div key={k} className="flex justify-between gap-4">
                                          <span className="text-gray-400 font-bold">{k}:</span>
                                          <span className="text-right text-gray-800 break-all">{v || "(empty)"}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Control Bar for the group */}
                      <div className="px-5 py-3.5 bg-[#F9F8F6] flex flex-wrap items-center justify-between gap-4">
                        <span className="text-[10px] text-gray-500 italic font-serif">
                          Retains one verified primary item. Actioning will archive non-selected matching records.
                        </span>
                        <div className="flex items-center gap-2">
                          {onCriticallyReviewCluster && (
                            <button
                              onClick={() => onCriticallyReviewCluster(group, gIdx)}
                              disabled={isAnalyzingClusterId !== null}
                              className="px-3.5 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-white bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 disabled:opacity-50 rounded-none transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              {isAnalyzingClusterId === group.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5" /> Critically Review Cluster
                                </>
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleBulkDismissGroup(group)}
                            className="px-3.5 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-[#1A1A1A] border border-[#1A1A1A] hover:bg-white rounded-none transition-colors bg-white cursor-pointer"
                          >
                            Keep All In Group
                          </button>
                          <button
                            onClick={() => handleBulkArchiveGroup(group)}
                            className="px-3.5 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-white bg-[#A13D2D] hover:bg-[#A13D2D]/90 rounded-none transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" /> Archive Redundant Duplicates
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-white p-12 border border-[#E5E3DF] text-center flex flex-col items-center justify-center rounded-none">
                  <div className="w-12 h-12 border border-[#E5E3DF] text-gray-400 rounded-none flex items-center justify-center mb-4 bg-[#F9F8F6]">
                    <Search className="w-5 h-5 text-gray-400" />
                  </div>
                  <h3 className="font-serif italic text-lg text-[#1A1A1A] mb-1">No matching clusters found</h3>
                  <p className="text-xs text-gray-400 max-w-sm leading-relaxed mb-4">
                    No duplicate clusters contain the keyword <strong className="text-[#A13D2D]">"{searchQuery}"</strong> in their feedback content, labels, or row indexes.
                  </p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white font-mono text-[10px] uppercase tracking-wider rounded-none cursor-pointer transition-colors"
                  >
                    Clear Filter
                  </button>
                </div>
              )
            ) : (
              <div className="bg-white p-16 border border-[#E5E3DF] text-center flex flex-col items-center justify-center rounded-none">
                <div className="w-12 h-12 border border-[#E5E3DF] text-[#4A6741] rounded-none flex items-center justify-center mb-4 bg-[#F9F8F6]">
                  <CheckCircle className="w-5 h-5 text-[#4A6741]" />
                </div>
                <h3 className="font-serif italic text-lg text-[#1A1A1A] mb-1">No semantic duplicates found</h3>
                <p className="text-xs text-gray-400 max-w-sm leading-relaxed">
                  Excellent! With the current threshold ({(similarityThreshold * 100).toFixed(0)}%), your feedback dataset contains zero redundant duplicate groups.
                </p>
              </div>
            )}
          </div>

          {/* Side distribution widgets (1/4 layout) */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Guide Info block */}
            <div className="bg-white p-5 border border-[#E5E3DF] space-y-3 rounded-none">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A] flex items-center gap-2">
                <Info className="w-4 h-4 text-gray-400" /> Traceability Metrics
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                By grouping duplicates dynamically, you prevent user spam or identical automated reports from bloating your analysis.
              </p>
              <div className="border-t border-[#E5E3DF] pt-3 space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400 font-medium">Dataset Rows:</span>
                  <span className="font-mono text-gray-800 font-bold">{comments.filter(c => !c.isArchived).length}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400 font-medium">Identified Clusters:</span>
                  <span className="font-mono text-[#A13D2D] font-bold">{processedGroups.length}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400 font-medium">Redundancy Ratio:</span>
                  <span className="font-mono text-[#A13D2D] font-bold">
                    {comments.filter(c => !c.isArchived).length > 0 
                      ? `${((totalDuplicateRecordsCount / comments.filter(c => !c.isArchived).length) * 100).toFixed(1)}%` 
                      : "0%"
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Redundancy by Topic Cluster list */}
            <div className="bg-white p-5 border border-[#E5E3DF] space-y-4 rounded-none">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A] flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#A13D2D]" /> Spam Cluster Density
              </h3>
              
              <div className="space-y-3">
                {redundancyByTopic.map(({ topic, total, duplicates, percentage }) => (
                  <div key={topic} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-semibold text-gray-600 uppercase tracking-tight">
                      <span className="truncate max-w-[120px]">{topic}</span>
                      <span className="font-mono text-gray-500">{duplicates}/{total} ({percentage.toFixed(0)}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 h-1.5 rounded-none overflow-hidden">
                      <div 
                        className="bg-[#A13D2D] h-full" 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 3. SUBTAB: CSV ACTION PLAN VIEW */}
      {subTab === "action-plan" && (
        <div className="bg-white border border-[#E5E3DF] rounded-none shadow-none p-6 space-y-6">
          
          {/* Download and configuration panel */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#F9F8F6] p-4 border border-[#E5E3DF]">
            <div className="space-y-1">
              <span className="text-[9px] uppercase tracking-widest font-bold text-gray-400">CSV Action Export Center</span>
              <h3 className="text-sm font-serif italic text-gray-800">Prune your spreadsheet instantly with the computed vector actions</h3>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={handleDownloadCleanCsv}
                className="px-4 py-2.5 text-[10px] bg-[#4A6741] hover:bg-[#4A6741]/90 text-white font-bold uppercase tracking-wider rounded-none transition-all flex items-center gap-2 cursor-pointer"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                Download Deduplicated CSV
              </button>
              <button
                onClick={handleDownloadAnnotatedCsv}
                className="px-4 py-2.5 text-[10px] border border-[#1A1A1A] hover:bg-gray-100 text-[#1A1A1A] font-bold uppercase tracking-wider rounded-none bg-white transition-all flex items-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Download Annotated Audit CSV
              </button>
            </div>
          </div>

          {/* Plan stats block */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            <div className="border border-[#E5E3DF] p-4 bg-white rounded-none">
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest block mb-1">Total Input CSV Rows</span>
              <p className="text-2xl font-light text-[#1A1A1A] font-mono">{comments.filter(c => !c.isArchived).length} Rows</p>
            </div>
            <div className="border border-[#E5E3DF] p-4 bg-white rounded-none">
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest block mb-1">Row Action: KEEP (Unique)</span>
              <p className="text-2xl font-light text-[#4A6741] font-mono">
                {Object.values(commentActionMap).filter((v: any) => v && (v.action === "KEEP_UNIQUE" || v.action === "KEEP_PRIMARY")).length} Rows
              </p>
            </div>
            <div className="border border-[#E5E3DF] p-4 bg-white rounded-none">
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest block mb-1">Row Action: REMOVE (Duplicate)</span>
              <p className="text-2xl font-light text-[#A13D2D] font-mono">{totalDuplicateRecordsCount} Rows</p>
            </div>
            <div className="border border-[#E5E3DF] p-4 bg-white rounded-none">
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest block mb-1">Average Review Compression</span>
              <p className="text-2xl font-light text-[#1A1A1A] font-mono">
                {comments.filter(c => !c.isArchived).length > 0 
                  ? `${((totalDuplicateRecordsCount / comments.filter(c => !c.isArchived).length) * 100).toFixed(0)}%` 
                  : "0%"
                }
              </p>
            </div>
          </div>

          {/* Large Action Plan Table */}
          <div className="border border-[#E5E3DF] overflow-hidden rounded-none bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F9F8F6] border-b border-[#E5E3DF] text-[9px] uppercase tracking-wider text-gray-500 font-bold">
                    <th className="py-3 px-4 font-mono w-24">CSV ROW #</th>
                    <th className="py-3 px-4 w-32">RECORD ID</th>
                    <th className="py-3 px-4">STAKEHOLDER FEEDBACK TEXT</th>
                    <th className="py-3 px-4 w-44">RECOMMENDED FILE ACTION</th>
                    <th className="py-3 px-4 w-48">MAPPED TOPIC</th>
                    <th className="py-3 px-4 text-center w-28">ROW DATA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E3DF] text-xs">
                  {comments
                    .filter((c) => !c.isArchived)
                    .sort((a, b) => {
                      if (a.csvRowIndex && b.csvRowIndex) return a.csvRowIndex - b.csvRowIndex;
                      return a.id.localeCompare(b.id);
                    })
                    .map((c) => {
                      const status = commentActionMap[c.id];
                      const isKeep = status && (status.action === "KEEP_UNIQUE" || status.action === "KEEP_PRIMARY");
                      const isPrimary = status && status.action === "KEEP_PRIMARY";

                      return (
                        <React.Fragment key={c.id}>
                          <tr className={`hover:bg-gray-50/50 transition-colors ${!isKeep ? 'bg-[#A13D2D]/[0.02]' : isPrimary ? 'bg-[#4A6741]/[0.02]' : ''}`}>
                            <td className="py-3.5 px-4 font-mono text-gray-400 font-bold">
                              {c.csvRowIndex ? `Row #${c.csvRowIndex}` : "N/A"}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-gray-500">
                              {c.id}
                            </td>
                            <td className="py-3.5 px-4 max-w-sm">
                              <p className="text-gray-800 line-clamp-2 leading-relaxed" title={c.text}>
                                "{c.text}"
                              </p>
                            </td>
                            <td className="py-3.5 px-4">
                              {isKeep ? (
                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded-none border ${
                                  isPrimary 
                                    ? "bg-[#4A6741]/10 text-[#4A6741] border-[#4A6741]/20" 
                                    : "bg-gray-100 text-gray-600 border-gray-300"
                                }`}>
                                  <span className={`w-1 h-1 rounded-full ${isPrimary ? 'bg-[#4A6741]' : 'bg-gray-500'}`} />
                                  {isPrimary ? "KEEP (Primary copy)" : "KEEP (Unique)"}
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[9px] bg-[#A13D2D]/10 text-[#A13D2D] border border-[#A13D2D]/20 font-bold uppercase tracking-wider rounded-none">
                                    <span className="w-1 h-1 rounded-full bg-[#A13D2D]" />
                                    REMOVE DUPLICATE
                                  </span>
                                  {status?.primaryRowIndex && (
                                    <p className="text-[9px] text-gray-400 uppercase tracking-tight font-mono">
                                      Matches Row #{status.primaryRowIndex} ({(status.similarity! * 100).toFixed(0)}%)
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="text-[10px] font-semibold bg-[#F9F8F6] border border-[#E5E3DF] text-gray-600 px-2 py-0.5 rounded-none inline-block">
                                {c.topic}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {c.originalRowData ? (
                                <button
                                  onClick={() => setExpandedCommentId(expandedCommentId === c.id ? null : c.id)}
                                  className="p-1 text-[#4A6741] hover:bg-[#4A6741]/10 border border-[#E5E3DF] hover:border-[#4A6741] transition-all rounded-none inline-flex items-center justify-center cursor-pointer"
                                  title="Inspect CSV row columns"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-[9px] text-gray-400 font-mono">-</span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded Columns Details Row */}
                          {expandedCommentId === c.id && c.originalRowData && (
                            <tr key={`${c.id}-details`} className="bg-[#F9F8F6]/50">
                              <td colSpan={6} className="py-4 px-8 border-b border-[#E5E3DF]">
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-gray-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A]">
                                      Original Spreadsheet Traceback (Row #{c.csvRowIndex})
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {Object.entries(c.originalRowData).map(([key, val]) => (
                                      <div key={key} className="bg-white p-2.5 border border-[#E5E3DF] rounded-none">
                                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block mb-0.5">{key}</span>
                                        <p className="text-xs font-mono text-gray-800 break-words leading-relaxed">{val || <span className="text-gray-300 italic">empty</span>}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
