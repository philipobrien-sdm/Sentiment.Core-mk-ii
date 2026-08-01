import React, { useState, useMemo, useEffect } from "react";
import { 
  FolderKanban, Sparkles, Filter, Search, Download, 
  CheckCircle2, ArrowUpDown, Tag, Building2, Smile, Frown, Meh,
  RefreshCw, Loader2, Info, ChevronRight, Layers, FileSpreadsheet, Check, HelpCircle, Layers2,
  FileText, ChevronDown, ChevronUp, Copy, X
} from "lucide-react";
import { CommentItem, LlmSettings, StakeholderMapping, WhatIfReport } from "../types";
import { OrganizationBadge } from "./OrganizationBadge";
import { calculateCosineSimilarity } from "./DuplicateReview";
import { fetchLocalEmbeddings, getDeterministicPseudoEmbedding, fetchLocalCompletion, generateLocalHeuristicCustomClusterSynthesis } from "../utils/localLlm";
import { getCommentEmbedding } from "../utils/embeddingsCache";
import { buildStakeholderListMarkdown, buildCsvTraceabilityRowsMarkdown } from "./CommentsList";
import { MarkdownViewer } from "./MarkdownViewer";
import { buildDocumentContextPromptBlock } from "../utils/documentContext";

interface CustomTopicClusterViewProps {
  comments: CommentItem[];
  llmSettings: LlmSettings;
  stakeholderMappings?: Record<string, StakeholderMapping>;
  onOpenStakeholderModal?: (orgName?: string) => void;
  onApplyTopicsToDataset: (updatedComments: CommentItem[]) => void;
  showToast: (message: string, type: 'info' | 'success' | 'error') => void;
  onSelectComment?: (commentId: string) => void;
  onSaveSynthesisToHistory?: (synthesis: { title: string; markdown: string; source: string }) => void;
  onUpdateComment?: (updatedComment: CommentItem) => void;
  onOpenWhatIfModal?: (contextType?: "cluster" | "executive" | "synthesis_meta" | "custom_cluster_batch", targetCluster?: string) => void;
  whatIfReports?: WhatIfReport[];
}

interface ClusteredCommentItem extends CommentItem {
  assignedTopic: string;
  similarityScore: number; // Confidence score for primary topic (0.0 to 1.0)
  isPreAssigned: boolean;  // True if preserved from existing file cluster entry, false if newly assigned
  secondaryTopics: { topic: string; confidence: number }[]; // Secondary topic matches above threshold
}

interface ClusterGroup {
  topicName: string;
  comments: ClusteredCommentItem[];
  avgSimilarity: number;
  preAssignedCount: number;
  autoMappedCount: number;
  secondaryMatchesCount: number;
  sentimentCounts: {
    positive: number;
    neutral: number;
    negative: number;
  };
  organizations: string[];
}

const DEFAULT_PRESET_TOPICS = [
  "Performance, Speed & Lag",
  "UI/UX, Navigation & Layout",
  "Pricing, Billing & Value",
  "Customer Support & Service",
  "Bugs, Crashes & System Failures",
  "Feature Requests & Enhancements"
];

export const CustomTopicClusterView: React.FC<CustomTopicClusterViewProps> = ({
  comments,
  llmSettings,
  stakeholderMappings = {},
  onOpenStakeholderModal,
  onApplyTopicsToDataset,
  showToast,
  onSelectComment,
  onSaveSynthesisToHistory,
  onUpdateComment,
  onOpenWhatIfModal,
  whatIfReports = []
}) => {
  // Extract unique existing cluster column entries from uploaded dataset
  const existingClusterEntries = useMemo(() => {
    const topicsSet = new Set<string>();
    comments.forEach(c => {
      const t = c.topic?.trim();
      if (
        t && 
        t !== "" && 
        t !== "Unassigned" && 
        t !== "Unassigned / General" && 
        t !== "Unassigned / Low Confidence" && 
        t !== "General Feedback"
      ) {
        topicsSet.add(t);
      }
    });
    return Array.from(topicsSet).sort();
  }, [comments]);

  // Topic input state (initialized with uploaded file clusters if present, or preset defaults)
  const [topicInputText, setTopicInputText] = useState<string>(
    existingClusterEntries.length > 0 
      ? existingClusterEntries.join("\n") 
      : DEFAULT_PRESET_TOPICS.join("\n")
  );

  // Sync uploaded file cluster list when new file/comments arrive
  useEffect(() => {
    if (existingClusterEntries.length > 0) {
      setTopicInputText(existingClusterEntries.join("\n"));
    }
  }, [existingClusterEntries]);
  
  // Cutoff similarity threshold for blank entries
  const [minThreshold, setMinThreshold] = useState<number>(0.0);

  // Secondary cluster threshold (retain any matches >= 50% default)
  const [secondaryThreshold, setSecondaryThreshold] = useState<number>(0.50);

  // Clustering execution state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [clusterGroups, setClusterGroups] = useState<ClusterGroup[]>([]);
  const [unassignedComments, setUnassignedComments] = useState<ClusteredCommentItem[]>([]);
  const [hasRunClustering, setHasRunClustering] = useState<boolean>(false);

  // Selected cluster topic from dropdown
  const [selectedTopic, setSelectedTopic] = useState<string>("");

  // Table filters & sorting within selected cluster
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'file' | 'auto' | 'has_secondary'>('all');
  const [sortField, setSortField] = useState<'score' | 'id' | 'org' | 'sentiment' | 'source' | 'secondary_count'>('score');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');

  // Count assigned vs blank comments in active dataset
  const activeDatasetStats = useMemo(() => {
    const active = comments.filter(c => !c.isArchived && c.id !== "user_query_node");
    const assignedCount = active.filter(c => {
      const t = c.topic?.trim();
      return (
        t && 
        t !== "" && 
        t !== "Unassigned" && 
        t !== "Unassigned / General" && 
        t !== "Unassigned / Low Confidence" && 
        t !== "General Feedback"
      );
    }).length;
    return {
      total: active.length,
      assignedCount,
      blankCount: active.length - assignedCount
    };
  }, [comments]);

  // Parse candidate topic strings
  const parsedTopics = useMemo(() => {
    return topicInputText
      .split(/[\n,]/)
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }, [topicInputText]);

  // Execute Embedding Evaluation: Primary Assignment + Secondary Assignments (>= 50%)
  const handleRunClustering = async () => {
    const topicsToCluster = parsedTopics;
    if (topicsToCluster.length === 0) {
      showToast("Please enter at least one cluster topic name.", "error");
      return;
    }

    if (comments.length === 0) {
      showToast("No active comments in dataset to cluster.", "error");
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Compute/Fetch Vector Embeddings for each defined target Topic
      let topicEmbeddings: number[][] = [];

      if (llmSettings.useCustomEmbedding) {
        showToast("Fetching topic embeddings from LLM endpoint...", "info");
        topicEmbeddings = await fetchLocalEmbeddings(topicsToCluster, llmSettings);
      } else {
        topicEmbeddings = topicsToCluster.map(t => getDeterministicPseudoEmbedding(t));
      }

      // Map topic -> vector
      const topicVectors = topicsToCluster.map((topicName, idx) => ({
        topicName,
        vector: topicEmbeddings[idx] || getDeterministicPseudoEmbedding(topicName)
      }));

      // 2. Process comments
      const activeComments = comments.filter(c => !c.isArchived && c.id !== "user_query_node");
      
      const groupsMap = new Map<string, ClusteredCommentItem[]>();
      topicsToCluster.forEach(t => groupsMap.set(t, []));

      const unassigned: ClusteredCommentItem[] = [];

      for (const comment of activeComments) {
        const commentVec = getCommentEmbedding(comment, llmSettings.useCustomEmbedding);
        const rawTopic = comment.topic?.trim() || "";

        const isPreAssigned =
          !!rawTopic &&
          rawTopic !== "" &&
          rawTopic !== "Unassigned" &&
          rawTopic !== "Unassigned / General" &&
          rawTopic !== "Unassigned / Low Confidence" &&
          rawTopic !== "General Feedback";

        // Evaluate similarity score across ALL topics for multi-assignment retention
        const allSimilarities = topicVectors.map(tv => {
          let sim = 0;
          if (commentVec && commentVec.length > 0 && tv.vector && tv.vector.length > 0) {
            sim = calculateCosineSimilarity(commentVec, tv.vector);
          }
          return {
            topic: tv.topicName,
            confidence: Math.min(1.0, Math.max(0.0, sim))
          };
        }).sort((a, b) => b.confidence - a.confidence);

        let primaryTopic = "";
        let primaryConfidence = 0;

        if (isPreAssigned) {
          // RULE: Primary assignment is initially set via cluster column text if present
          primaryTopic = rawTopic;
          const foundSim = allSimilarities.find(s => s.topic.toLowerCase() === primaryTopic.toLowerCase());
          primaryConfidence = foundSim ? foundSim.confidence : 0.88; // Default baseline if topic vector wasn't in input
        } else {
          // RULE: For blank entries, top vector similarity match becomes primary assignment
          const topMatch = allSimilarities[0];
          if (topMatch && topMatch.confidence >= minThreshold) {
            primaryTopic = topMatch.topic;
            primaryConfidence = topMatch.confidence;
          } else {
            primaryTopic = "Unassigned / Low Confidence";
            primaryConfidence = topMatch ? topMatch.confidence : 0;
          }
        }

        // RULE: Retain list of potential secondary assignments where similarity match >= secondaryThreshold (50%)
        const secondaryTopics = allSimilarities.filter(s => 
          s.topic.toLowerCase() !== primaryTopic.toLowerCase() && 
          s.confidence >= secondaryThreshold
        );

        const clusteredItem: ClusteredCommentItem = {
          ...comment,
          assignedTopic: primaryTopic,
          similarityScore: primaryConfidence,
          isPreAssigned,
          clusterConfidence: primaryConfidence,
          secondaryTopics
        };

        if (primaryTopic === "Unassigned / Low Confidence") {
          unassigned.push(clusteredItem);
        } else {
          if (!groupsMap.has(primaryTopic)) {
            groupsMap.set(primaryTopic, []);
          }
          groupsMap.get(primaryTopic)!.push(clusteredItem);
        }
      }

      // 3. Build cluster group metrics across all present topics
      const allGroupTopics = Array.from(new Set([...topicsToCluster, ...Array.from(groupsMap.keys())]));

      const constructedGroups: ClusterGroup[] = allGroupTopics.map(topicName => {
        const groupComments = groupsMap.get(topicName) || [];
        
        const totalSim = groupComments.reduce((acc, c) => acc + c.similarityScore, 0);
        const avgSimilarity = groupComments.length > 0 ? totalSim / groupComments.length : 0;

        const preAssignedCount = groupComments.filter(c => c.isPreAssigned).length;
        const autoMappedCount = groupComments.filter(c => !c.isPreAssigned).length;
        const secondaryMatchesCount = groupComments.filter(c => c.secondaryTopics.length > 0).length;

        const sentimentCounts = {
          positive: groupComments.filter(c => c.sentiment === "positive").length,
          neutral: groupComments.filter(c => c.sentiment === "neutral").length,
          negative: groupComments.filter(c => c.sentiment === "negative").length,
        };

        // Extract unique org names
        const orgsSet = new Set<string>();
        groupComments.forEach(c => {
          const org = c.organizationName || c.originalRowData?.["Organization"] || c.originalRowData?.["Org"] || c.originalRowData?.["Organization Name"];
          if (org && org.trim()) {
            orgsSet.add(org.trim());
          }
        });

        return {
          topicName,
          comments: groupComments,
          avgSimilarity,
          preAssignedCount,
          autoMappedCount,
          secondaryMatchesCount,
          sentimentCounts,
          organizations: Array.from(orgsSet).sort()
        };
      });

      setClusterGroups(constructedGroups);
      setUnassignedComments(unassigned);
      setHasRunClustering(true);

      // Default dropdown selection to first group with comments or first topic
      const nonZeroGroup = constructedGroups.find(g => g.comments.length > 0) || constructedGroups[0];
      if (nonZeroGroup) {
        setSelectedTopic(nonZeroGroup.topicName);
      } else if (unassigned.length > 0) {
        setSelectedTopic("Unassigned / Low Confidence");
      }

      showToast(
        `Multi-topic evaluation complete: Preserved primary file clusters & retained secondary matches ≥${(secondaryThreshold * 100).toFixed(0)}%!`, 
        "success"
      );
    } catch (error: any) {
      console.error("Clustering error:", error);
      showToast(`Clustering failed: ${error.message || "Unknown error"}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Run initial evaluation on mount if not run yet
  useEffect(() => {
    if (!hasRunClustering && comments.length > 0) {
      handleRunClustering();
    }
  }, [comments.length]);

  // Currently selected cluster group object
  const currentGroup = useMemo(() => {
    if (selectedTopic === "Unassigned / Low Confidence") {
      const sentimentCounts = {
        positive: unassignedComments.filter(c => c.sentiment === "positive").length,
        neutral: unassignedComments.filter(c => c.sentiment === "neutral").length,
        negative: unassignedComments.filter(c => c.sentiment === "negative").length,
      };
      const orgsSet = new Set<string>();
      unassignedComments.forEach(c => {
        const org = c.organizationName || c.originalRowData?.["Organization"] || c.originalRowData?.["Org"];
        if (org) orgsSet.add(org);
      });
      return {
        topicName: "Unassigned / Low Confidence",
        comments: unassignedComments,
        avgSimilarity: unassignedComments.length > 0 ? unassignedComments.reduce((acc, c) => acc + c.similarityScore, 0) / unassignedComments.length : 0,
        preAssignedCount: unassignedComments.filter(c => c.isPreAssigned).length,
        autoMappedCount: unassignedComments.filter(c => !c.isPreAssigned).length,
        secondaryMatchesCount: unassignedComments.filter(c => c.secondaryTopics.length > 0).length,
        sentimentCounts,
        organizations: Array.from(orgsSet)
      };
    }
    return clusterGroups.find(g => g.topicName === selectedTopic) || null;
  }, [selectedTopic, clusterGroups, unassignedComments]);

  // Synthesis execution & report state for custom clusters
  const [isSynthesizingCluster, setIsSynthesizingCluster] = useState<boolean>(false);
  const [activeClusterSynthesis, setActiveClusterSynthesis] = useState<{
    topicName: string;
    markdown: string;
    timestamp: string;
  } | null>(null);
  const [isSynthesisExpanded, setIsSynthesisExpanded] = useState<boolean>(true);
  const [includeProposedResponses, setIncludeProposedResponses] = useState<boolean>(true);

  // Batch Cluster Synthesis Modal & Runner State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [selectedBatchTopics, setSelectedBatchTopics] = useState<Set<string>>(new Set());
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; currentTopic: string }>({
    current: 0,
    total: 0,
    currentTopic: ""
  });
  const cancelBatchRef = React.useRef<boolean>(false);

  // Batch Answer Comments Engine State
  const [isBatchAnswerModalOpen, setIsBatchAnswerModalOpen] = useState<boolean>(false);
  const [batchAnswerRole, setBatchAnswerRole] = useState<string>("Policy Analyst");
  const [batchAnswerOverwrite, setBatchAnswerOverwrite] = useState<boolean>(false);
  const [isBatchAnsweringRunning, setIsBatchAnsweringRunning] = useState<boolean>(false);
  const [batchAnswerProgress, setBatchAnswerProgress] = useState<{
    current: number;
    total: number;
    currentCommentText: string;
    stage: 'synthesis' | 'answering';
  }>({
    current: 0,
    total: 0,
    currentCommentText: "",
    stage: 'synthesis'
  });
  const cancelBatchAnswerRef = React.useRef<boolean>(false);

  // Inline Proposed Response Editor State for Table Rows
  const [activeResponseCommentId, setActiveResponseCommentId] = useState<string | null>(null);
  const [inlineResponseText, setInlineResponseText] = useState<string>("");
  const [inlineResponseRole, setInlineResponseRole] = useState<string>("Policy Analyst");
  const [isDraftingInlineAI, setIsDraftingInlineAI] = useState<boolean>(false);

  // Reusable core synthesis builder for a single ClusterGroup
  const generateGroupSynthesisMarkdown = async (group: ClusterGroup, includeProposed: boolean = includeProposedResponses): Promise<string> => {
    const groupComments = group.comments;
    const docContextBlock = buildDocumentContextPromptBlock(groupComments);
    const prependedStakeholderList = buildStakeholderListMarkdown(groupComments, stakeholderMappings);
    const appendedCsvTraceabilityRows = buildCsvTraceabilityRowsMarkdown(groupComments);

    const commentsWithResponses = groupComments.filter(c => c.proposedResponse && c.proposedResponse.trim().length > 0);
    let proposedResponsesBlock = "";
    if (includeProposed && commentsWithResponses.length > 0) {
      proposedResponsesBlock = `\nDrafted Proposed Official Responses Currently On File (${commentsWithResponses.length}/${groupComments.length} comments):
${commentsWithResponses.map((c, i) => `[Comment ${i+1}] ID: ${c.originalId || c.id} (Org: "${c.organizationName || "N/A"}")
  - Original Feedback: "${c.text}"
  - Proposed Response (${c.proposedResponseBy || 'Policy Analyst'}): "${c.proposedResponse}"`).join("\n")}\n`;
    }

    const structuredPrompt = `You are a Senior Strategic Customer Experience Auditor & Product Director.
Analyze the following cluster of ${groupComments.length} stakeholder feedback comments grouped under the custom topic cluster "${group.topicName}".
Provide a critical, comprehensive qualitative synthesis of this cluster, summarizing stakeholder intent, key friction points, cross-organization patterns, and concrete product & engineering recommendations.
${docContextBlock}
Cluster Details:
- Target Topic Cluster Name: "${group.topicName}"
- Total Comments in Cluster: ${groupComments.length} (${group.preAssignedCount} file-assigned, ${group.autoMappedCount} vector auto-assigned)
- Sentiment Breakdown: ${group.sentimentCounts.positive} Positive, ${group.sentimentCounts.neutral} Neutral, ${group.sentimentCounts.negative} Negative
- Represented Organizations (${group.organizations.length}): ${group.organizations.slice(0, 8).join(", ") || "General Public"}
${proposedResponsesBlock}
Representative Feedback Comments in this Cluster:
${groupComments.slice(0, 30).map((c, i) => `[Comment ${i+1}] ID: ${c.originalId || c.id} (Org: "${c.organizationName || "N/A"}", Sentiment: "${c.sentiment.toUpperCase()}", Source: "${c.isPreAssigned ? "File Assigned" : "Auto Primary"}"${c.documentReference ? `, Ref: "${c.documentReference}"` : ""}): "${c.text}"${c.secondaryTopics && c.secondaryTopics.length > 0 ? ` (Secondary Tags: ${c.secondaryTopics.map(s => s.topic).join(", ")})` : ""}`).join("\n")}
${groupComments.length > 30 ? `...and ${groupComments.length - 30} more comments in this cluster.` : ""}

Format your output using clean, professional Markdown headers:
1. **Cluster Executive Summary**: High-level overview of what stakeholders in this cluster are collectively expressing regarding "${group.topicName}".
2. **Key Pain Points & Sentiment Split**: Detailed critique of positive satisfaction vs negative friction drivers.
3. **Cross-Organization & Stakeholder Nuances**: Key patterns or divergent priorities across affected organizations.
4. **Secondary Topic Cross-Cutting Analysis**: Insights into overlapping themes identified via secondary topic tags.
${includeProposed && commentsWithResponses.length > 0 ? `5. **Proposed Official Response Evaluation**: Critical review of existing drafted proposed responses, evaluating their adequacy, alignment with stakeholder intent, and unaddressed gaps.
6. **Strategic Product & Action Recommendations**: 3-4 actionable recommendations for product, CX, and engineering teams.` : `5. **Strategic Product & Action Recommendations**: 3-4 actionable recommendations for product, CX, and engineering teams.`}`;

    let coreMarkdown = "";
    try {
      coreMarkdown = await fetchLocalCompletion(structuredPrompt, llmSettings);
    } catch (err) {
      console.warn("LLM query failed or offline, using heuristic fallback:", err);
      coreMarkdown = generateLocalHeuristicCustomClusterSynthesis(group.topicName, groupComments, docContextBlock);
    }

    return `${prependedStakeholderList}\n\n---\n\n${coreMarkdown}\n\n---\n\n${appendedCsvTraceabilityRows}`;
  };

  // Run LLM qualitative synthesis for currently selected cluster
  const handleSynthesizeClusterComments = async () => {
    if (!currentGroup || currentGroup.comments.length === 0) {
      showToast("No comments in the selected cluster to synthesize.", "error");
      return;
    }

    setIsSynthesizingCluster(true);
    showToast(`Synthesizing ${currentGroup.comments.length} comments for cluster "${currentGroup.topicName}"...`, "info");

    try {
      const fullSynthesisMarkdown = await generateGroupSynthesisMarkdown(currentGroup, includeProposedResponses);
      const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString();

      const synthObj = {
        topicName: currentGroup.topicName,
        markdown: fullSynthesisMarkdown,
        timestamp: timestampStr
      };

      setActiveClusterSynthesis(synthObj);
      setIsSynthesisExpanded(true);

      if (onSaveSynthesisToHistory) {
        onSaveSynthesisToHistory({
          title: `Custom Cluster Synthesis: "${currentGroup.topicName}" (${currentGroup.comments.length} items)`,
          markdown: fullSynthesisMarkdown,
          source: "cluster"
        });
      }

      showToast(`Synthesis report generated for cluster "${currentGroup.topicName}"!`, "success");
    } catch (error: any) {
      console.error("Cluster synthesis failed:", error);
      showToast(`Synthesis failed: ${error.message || "Unknown error"}`, "error");
    } finally {
      setIsSynthesizingCluster(false);
    }
  };

  // Batch Cluster Comment Answering Execution Loop
  const handleRunBatchAnswerCluster = async () => {
    if (!currentGroup || currentGroup.comments.length === 0 || !onUpdateComment) return;

    setIsBatchAnsweringRunning(true);
    cancelBatchAnswerRef.current = false;

    try {
      // Step 1: Ensure Cluster Synthesis Report exists for context
      let synthesisMarkdown = (activeClusterSynthesis && activeClusterSynthesis.topicName === currentGroup.topicName)
        ? activeClusterSynthesis.markdown
        : "";

      if (!synthesisMarkdown) {
        setBatchAnswerProgress({
          current: 0,
          total: 1,
          currentCommentText: `Generating Cluster Synthesis Report for "${currentGroup.topicName}" context...`,
          stage: 'synthesis'
        });

        synthesisMarkdown = await generateGroupSynthesisMarkdown(currentGroup, includeProposedResponses);
        const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString();

        const synthObj = {
          topicName: currentGroup.topicName,
          markdown: synthesisMarkdown,
          timestamp: timestampStr
        };
        setActiveClusterSynthesis(synthObj);
        setIsSynthesisExpanded(true);

        if (onSaveSynthesisToHistory) {
          onSaveSynthesisToHistory({
            title: `Custom Cluster Synthesis: "${currentGroup.topicName}" (${currentGroup.comments.length} items)`,
            markdown: synthesisMarkdown,
            source: "cluster"
          });
        }
      }

      if (cancelBatchAnswerRef.current) {
        setIsBatchAnsweringRunning(false);
        showToast("Batch answering cancelled after synthesis step.", "info");
        return;
      }

      // Step 2: Determine target comments to answer
      const targetComments = currentGroup.comments.filter(c => {
        if (c.isArchived) return false;
        if (batchAnswerOverwrite) return true;
        return !c.proposedResponse || c.proposedResponse.trim().length === 0;
      });

      if (targetComments.length === 0) {
        showToast("No comments in cluster require responses (or all are already answered).", "info");
        setIsBatchAnsweringRunning(false);
        setIsBatchAnswerModalOpen(false);
        return;
      }

      setBatchAnswerProgress({
        current: 0,
        total: targetComments.length,
        currentCommentText: targetComments[0].text,
        stage: 'answering'
      });

      let answeredCount = 0;

      for (let i = 0; i < targetComments.length; i++) {
        if (cancelBatchAnswerRef.current) break;

        const comment = targetComments[i];
        setBatchAnswerProgress({
          current: i + 1,
          total: targetComments.length,
          currentCommentText: comment.text,
          stage: 'answering'
        });

        const structuredPrompt = `You are an official ${batchAnswerRole || 'Policy Analyst'} and customer relations lead.
Draft an official proposed response to an individual stakeholder feedback comment within the topic cluster "${currentGroup.topicName}".

OVERALL CLUSTER SYNTHESIS CONTEXT (Generated for this cluster):
---
${synthesisMarkdown}
---

STAKEHOLDER COMMENT DETAILS:
- Comment ID: ${comment.originalId || comment.id}
- Organization: "${comment.organizationName || 'General Public'}"
- Topic: "${comment.topic}"
- Sentiment: "${comment.sentiment}"
${comment.documentReference ? `- Document Reference: "${comment.documentReference}"` : ""}
- Comment Text: "${comment.text}"

TASK:
Write a professional, constructive, and empathetic 1-3 sentence official response to this specific stakeholder comment.
Directly address the user's feedback while maintaining strict alignment with the overall cluster strategic synthesis above. Output ONLY the response text.`;

        let responseText = "";
        try {
          responseText = await fetchLocalCompletion(structuredPrompt, llmSettings);
        } catch (err) {
          responseText = `Thank you to ${comment.organizationName || 'the stakeholder'} for feedback regarding ${currentGroup.topicName}${comment.documentReference ? ` (${comment.documentReference})` : ''}. We have recorded this perspective and aligned it with our cluster action plan to ensure it is addressed during policy updates.`;
        }

        const updated: CommentItem = {
          ...comment,
          proposedResponse: responseText.trim(),
          proposedResponseBy: batchAnswerRole.trim() || "Policy Analyst",
          proposedResponseAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString()
        };

        onUpdateComment(updated);
        answeredCount++;

        await new Promise(r => setTimeout(r, 120));
      }

      setIsBatchAnsweringRunning(false);
      setIsBatchAnswerModalOpen(false);

      if (!cancelBatchAnswerRef.current) {
        showToast(`Batch answered ${answeredCount} comments in cluster "${currentGroup.topicName}" using synthesis context!`, "success");
      } else {
        showToast(`Batch answering stopped. Answered ${answeredCount} comments before cancellation.`, "info");
      }

    } catch (err: any) {
      console.error("Batch answering error:", err);
      showToast(`Batch answering failed: ${err.message || "Unknown error"}`, "error");
      setIsBatchAnsweringRunning(false);
    }
  };

  // Batch Report Generation Execution Loop
  const handleRunBatchSynthesis = async () => {
    const topicsToRun = Array.from(selectedBatchTopics);
    if (topicsToRun.length === 0) {
      showToast("Please select at least one cluster to synthesize.", "error");
      return;
    }

    setIsBatchRunning(true);
    cancelBatchRef.current = false;
    setBatchProgress({ current: 0, total: topicsToRun.length, currentTopic: topicsToRun[0] });

    let completedCount = 0;

    for (let i = 0; i < topicsToRun.length; i++) {
      if (cancelBatchRef.current) break;

      const topicName = topicsToRun[i];
      setBatchProgress({ current: i + 1, total: topicsToRun.length, currentTopic: topicName });

      const group = clusterGroups.find(g => g.topicName === topicName);
      if (group && group.comments.length > 0) {
        try {
          const fullMarkdown = await generateGroupSynthesisMarkdown(group);
          if (onSaveSynthesisToHistory) {
            onSaveSynthesisToHistory({
              title: `Custom Cluster Synthesis: "${group.topicName}" (${group.comments.length} items)`,
              markdown: fullMarkdown,
              source: "cluster"
            });
          }
          completedCount++;
        } catch (err) {
          console.error(`Batch synthesis failed for cluster "${topicName}":`, err);
        }
      }

      // Small pause to allow state updates and user cancellation check
      await new Promise(r => setTimeout(r, 150));
    }

    setIsBatchRunning(false);

    if (!cancelBatchRef.current) {
      setIsBatchModalOpen(false);
      showToast(`Batch synthesis complete! Generated ${completedCount} cluster reports into Synthesis Hub.`, "success");
    } else {
      showToast(`Batch synthesis cancelled. Generated ${completedCount} reports before stopping.`, "info");
    }
  };

  // Handle inline proposed response saving
  const handleSaveInlineProposedResponse = (comment: CommentItem) => {
    if (!onUpdateComment) return;
    const updated: CommentItem = {
      ...comment,
      proposedResponse: inlineResponseText.trim(),
      proposedResponseBy: inlineResponseRole.trim() || "Policy Analyst",
      proposedResponseAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString()
    };
    onUpdateComment(updated);
    setActiveResponseCommentId(null);
    showToast("Proposed response saved & comment flagged!", "success");
  };

  // Filter & sort comments inside the selected cluster
  const filteredClusterComments = useMemo(() => {
    if (!currentGroup) return [];

    let list = [...currentGroup.comments];

    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter(c => {
        const idStr = (c.originalId || c.id || "").toLowerCase();
        const orgStr = (c.organizationName || c.originalRowData?.["Organization"] || "").toLowerCase();
        const textStr = (c.text || "").toLowerCase();
        const secondaries = (c.secondaryTopics || []).map(s => s.topic.toLowerCase()).join(" ");
        return idStr.includes(query) || orgStr.includes(query) || textStr.includes(query) || secondaries.includes(query);
      });
    }

    // Sentiment filter
    if (sentimentFilter !== "all") {
      list = list.filter(c => c.sentiment === sentimentFilter);
    }

    // Source filter (File Assigned vs Auto Mapped vs Has Secondary)
    if (sourceFilter === "file") {
      list = list.filter(c => c.isPreAssigned);
    } else if (sourceFilter === "auto") {
      list = list.filter(c => !c.isPreAssigned);
    } else if (sourceFilter === "has_secondary") {
      list = list.filter(c => c.secondaryTopics.length > 0);
    }

    // Sorting
    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "score") {
        comparison = b.similarityScore - a.similarityScore;
      } else if (sortField === "secondary_count") {
        comparison = b.secondaryTopics.length - a.secondaryTopics.length;
      } else if (sortField === "id") {
        const idA = a.originalId || a.id || "";
        const idB = b.originalId || b.id || "";
        comparison = idA.localeCompare(idB);
      } else if (sortField === "org") {
        const orgA = a.organizationName || a.originalRowData?.["Organization"] || "";
        const orgB = b.organizationName || b.originalRowData?.["Organization"] || "";
        comparison = orgA.localeCompare(orgB);
      } else if (sortField === "sentiment") {
        comparison = a.sentiment.localeCompare(b.sentiment);
      } else if (sortField === "source") {
        comparison = (a.isPreAssigned ? 1 : 0) - (b.isPreAssigned ? 1 : 0);
      }

      return sortDirection === "desc" ? comparison : -comparison;
    });

    return list;
  }, [currentGroup, searchQuery, sentimentFilter, sourceFilter, sortField, sortDirection]);

  // Apply custom cluster topic assignments and secondary topics back to main dataset
  const handleApplyToMainDataset = () => {
    if (!hasRunClustering || clusterGroups.length === 0) {
      showToast("Please evaluate clusters first before applying to the main dataset.", "error");
      return;
    }

    // Map each comment ID to its evaluated primary topic, confidence score, and secondary topics
    const topicMap = new Map<string, { topic: string; confidence: number; secondaryTopics: { topic: string; confidence: number }[] }>();
    clusterGroups.forEach(g => {
      g.comments.forEach(c => {
        topicMap.set(c.id, { 
          topic: g.topicName, 
          confidence: c.similarityScore,
          secondaryTopics: c.secondaryTopics || []
        });
      });
    });
    unassignedComments.forEach(c => {
      topicMap.set(c.id, { 
        topic: "Unassigned / General", 
        confidence: c.similarityScore,
        secondaryTopics: c.secondaryTopics || []
      });
    });

    const updated = comments.map(c => {
      if (topicMap.has(c.id)) {
        const info = topicMap.get(c.id)!;
        return { 
          ...c, 
          topic: info.topic,
          clusterConfidence: info.confidence,
          secondaryTopics: info.secondaryTopics
        };
      }
      return c;
    });

    onApplyTopicsToDataset(updated);
    showToast("Applied primary & secondary topic assignments to active dataset!", "success");
  };

  // Export selected cluster or all clusters to CSV with secondary topics
  const handleExportCSV = (exportAll: boolean = false) => {
    let rowsToExport: ClusteredCommentItem[] = [];

    if (exportAll) {
      clusterGroups.forEach(g => rowsToExport.push(...g.comments));
      rowsToExport.push(...unassignedComments);
    } else if (currentGroup) {
      rowsToExport = currentGroup.comments;
    }

    if (rowsToExport.length === 0) {
      showToast("No rows available to export.", "error");
      return;
    }

    const headers = [
      "Comment_ID", 
      "Organization_Name", 
      "Feedback_Text", 
      "Sentiment", 
      "Primary_Cluster_Topic", 
      "Assignment_Source", 
      "Primary_Confidence_Score",
      "Secondary_Cluster_Matches"
    ];
    
    const csvContent = [
      headers.join(","),
      ...rowsToExport.map(c => {
        const id = c.originalId || c.id;
        const org = c.organizationName || c.originalRowData?.["Organization"] || c.originalRowData?.["Org"] || "N/A";
        const text = `"${(c.text || "").replace(/"/g, '""')}"`;
        const sentiment = c.sentiment;
        const primaryTopic = `"${(c.assignedTopic || "").replace(/"/g, '""')}"`;
        const source = c.isPreAssigned ? "File Assigned" : "Auto Mapped";
        const confidence = (c.similarityScore * 100).toFixed(1) + "%";
        
        const secondariesStr = c.secondaryTopics && c.secondaryTopics.length > 0
          ? `"${c.secondaryTopics.map(s => `${s.topic} (${(s.confidence * 100).toFixed(0)}%)`).join("; ").replace(/"/g, '""')}"`
          : '""';

        return [id, `"${org.replace(/"/g, '""')}"`, text, sentiment, primaryTopic, source, confidence, secondariesStr].join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `custom_topic_cluster_${exportAll ? "all" : selectedTopic.toLowerCase().replace(/[^a-z0-9]/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported ${rowsToExport.length} rows with secondary topic matches to CSV!`, "success");
  };

  // Helper to add preset topic
  const handleAddPresetTopic = (preset: string) => {
    if (!parsedTopics.includes(preset)) {
      setTopicInputText(prev => prev ? `${prev.trim()}\n${preset}` : preset);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* 1. TOPIC DEFINITION & MULTI-ASSIGNMENT BANNER */}
      <div className="bg-white border border-[#E5E3DF] p-5 space-y-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E5E3DF] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-[#4A6741]" />
              <h3 className="font-serif italic text-lg font-bold text-[#1A1A1A]">
                Multi-Topic Cluster Evaluation
              </h3>
            </div>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              <strong>Multi-Topic Logic:</strong> Primary cluster is assigned via file text (or top match for blank rows). All other topic matches with similarity score ≥ 50% are retained as <strong>Secondary Cluster Matches</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRunClustering}
              disabled={isProcessing || parsedTopics.length === 0}
              className="px-4 py-2 bg-[#1A1A1A] hover:bg-[#333333] disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2 cursor-pointer transition-all rounded-none"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4A6741]" />
                  <span>Evaluating Clusters...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-[#4A6741]" />
                  <span>Evaluate Multi-Topic Clusters</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dataset Cluster Status Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="text-[10px] font-mono uppercase font-bold text-gray-500">
            Dataset Status:
          </span>
          <span className="px-2.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-900 text-[10px] font-mono font-bold flex items-center gap-1.5">
            <FileSpreadsheet className="w-3 h-3 text-blue-600" />
            <span>{activeDatasetStats.assignedCount} Primary File-Assigned</span>
          </span>
          <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-[10px] font-mono font-bold flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-emerald-600" />
            <span>{activeDatasetStats.blankCount} Blank Entries (Auto-Assigned)</span>
          </span>
          <span className="px-2.5 py-0.5 bg-purple-50 border border-purple-200 text-purple-900 text-[10px] font-mono font-bold flex items-center gap-1.5">
            <Layers2 className="w-3 h-3 text-purple-600" />
            <span>Secondary Match Threshold: ≥{(secondaryThreshold * 100).toFixed(0)}%</span>
          </span>
          {existingClusterEntries.length > 0 && (
            <span className="text-[10px] text-gray-500 font-mono ml-auto">
              ✓ Loaded {existingClusterEntries.length} topic cluster(s) directly from file
            </span>
          )}
        </div>

        {/* Input area & Presets */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
          {/* Textarea for topic list */}
          <div className="lg:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-600">
                Target Cluster Topics List
              </label>
              <span className="text-[10px] text-gray-400 font-mono">
                {parsedTopics.length} topic{parsedTopics.length === 1 ? "" : "s"} defined
              </span>
            </div>
            <textarea
              value={topicInputText}
              onChange={(e) => setTopicInputText(e.target.value)}
              placeholder="e.g. Zoning & Transit&#10;Public Safety&#10;Park Facilities"
              rows={4}
              className="w-full bg-[#F9F8F6] border border-[#E5E3DF] p-3 text-xs focus:outline-none focus:border-[#1A1A1A] font-sans leading-relaxed rounded-none resize-none"
            />
          </div>

          {/* Quick preset chips & Threshold Sliders */}
          <div className="space-y-3 bg-[#F9F8F6]/60 border border-[#E5E3DF] p-3.5">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Quick Add Presets
            </span>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_PRESET_TOPICS.map((preset) => {
                const isAdded = parsedTopics.includes(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAddPresetTopic(preset)}
                    className={`px-2 py-1 text-[10px] border transition-all cursor-pointer flex items-center gap-1 ${
                      isAdded 
                        ? "bg-[#4A6741]/10 border-[#4A6741] text-[#4A6741] font-medium" 
                        : "bg-white border-[#E5E3DF] text-gray-600 hover:border-[#1A1A1A]"
                    }`}
                  >
                    {isAdded ? <Check className="w-2.5 h-2.5" /> : <span>+</span>}
                    <span>{preset}</span>
                  </button>
                );
              })}
            </div>

            {/* Threshold Sliders */}
            <div className="pt-2 border-t border-[#E5E3DF] space-y-2">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-semibold text-gray-600">
                  <span>Secondary Match Cutoff:</span>
                  <span className="font-mono text-purple-700 font-bold">{(secondaryThreshold * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.30"
                  max="0.80"
                  step="0.05"
                  value={secondaryThreshold}
                  onChange={(e) => setSecondaryThreshold(parseFloat(e.target.value))}
                  className="w-full accent-purple-700 cursor-pointer"
                />
                <p className="text-[9px] text-gray-400 leading-tight">
                  Retains secondary topic assignments if match confidence is ≥ {(secondaryThreshold * 100).toFixed(0)}%.
                </p>
              </div>

              <div className="space-y-1 pt-1 border-t border-[#E5E3DF]/60">
                <div className="flex justify-between text-[10px] font-semibold text-gray-600">
                  <span>Blank Entry Min Cutoff:</span>
                  <span className="font-mono text-[#4A6741]">{(minThreshold * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.6"
                  step="0.05"
                  value={minThreshold}
                  onChange={(e) => setMinThreshold(parseFloat(e.target.value))}
                  className="w-full accent-[#4A6741] cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CLUSTER SELECTOR & METRICS SUMMARY BAR */}
      {hasRunClustering && (
        <div className="space-y-4">
          
          {/* Main Cluster Navigation & Action Toolbar */}
          <div className="bg-[#1A1A1A] text-white p-4 space-y-4 border-l-4 border-[#4A6741]">
            
            {/* Row 1: Cluster Selector Header with Stepper Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-amber-400 uppercase tracking-widest font-bold">
                    Primary Topic Cluster View
                  </span>
                  <span className="text-[10px] bg-white/10 text-gray-300 font-mono px-2 py-0.5 font-semibold">
                    {clusterGroups.length} Clusters Generated
                  </span>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {/* Prev Cluster Button */}
                  <button
                    onClick={() => {
                      const idx = clusterGroups.findIndex(g => g.topicName === selectedTopic);
                      if (idx > 0) {
                        setSelectedTopic(clusterGroups[idx - 1].topicName);
                      } else if (clusterGroups.length > 0) {
                        setSelectedTopic(clusterGroups[clusterGroups.length - 1].topicName);
                      }
                    }}
                    disabled={clusterGroups.length <= 1}
                    className="p-2 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white transition-colors cursor-pointer"
                    title="Previous Cluster"
                  >
                    <ChevronDown className="w-4 h-4 rotate-90" />
                  </button>

                  {/* Main Dropdown */}
                  <select
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="bg-white text-[#1A1A1A] border-none px-3.5 py-2 text-sm font-bold focus:outline-none rounded-none cursor-pointer flex-1 max-w-lg shadow-xs"
                  >
                    {clusterGroups.map((group) => (
                      <option key={group.topicName} value={group.topicName}>
                        {group.topicName} ({group.comments.length} primary item{group.comments.length === 1 ? "" : "s"})
                      </option>
                    ))}
                    {unassignedComments.length > 0 && (
                      <option value="Unassigned / Low Confidence">
                        Unassigned / Low Confidence ({unassignedComments.length} item{unassignedComments.length === 1 ? "" : "s"})
                      </option>
                    )}
                  </select>

                  {/* Next Cluster Button */}
                  <button
                    onClick={() => {
                      const idx = clusterGroups.findIndex(g => g.topicName === selectedTopic);
                      if (idx >= 0 && idx < clusterGroups.length - 1) {
                        setSelectedTopic(clusterGroups[idx + 1].topicName);
                      } else if (clusterGroups.length > 0) {
                        setSelectedTopic(clusterGroups[0].topicName);
                      }
                    }}
                    disabled={clusterGroups.length <= 1}
                    className="p-2 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white transition-colors cursor-pointer"
                    title="Next Cluster"
                  >
                    <ChevronDown className="w-4 h-4 -rotate-90" />
                  </button>
                </div>
              </div>

              {/* Active Cluster Stats Badge */}
              {currentGroup && (
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 text-xs font-mono shrink-0">
                  <div className="text-right">
                    <div className="font-bold text-amber-300">{currentGroup.comments.length} Primary Items</div>
                    <div className="text-[10px] text-gray-400">
                      {currentGroup.secondaryMatchesCount} with secondary tags
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Row 2: Action Toolbars Organized into Groups */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              
              {/* Group A: Cluster AI Synthesis & Scenario Intelligence */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wider font-bold w-full sm:w-auto mr-1">
                  AI Actions:
                </span>

                <button
                  onClick={handleSynthesizeClusterComments}
                  disabled={isSynthesizingCluster || !currentGroup || currentGroup.comments.length === 0}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-400 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                  title="Run AI synthesis and stakeholder report on comments in this cluster"
                >
                  {isSynthesizingCluster ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-200" />
                      <span>Synthesizing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                      <span>Synthesize Cluster</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    if (onOpenWhatIfModal) {
                      onOpenWhatIfModal("cluster", currentGroup?.topicName, clusterGroups);
                    }
                  }}
                  disabled={!currentGroup || currentGroup.comments.length === 0}
                  className="px-3.5 py-2 bg-amber-900 hover:bg-black border border-amber-500/60 text-amber-100 disabled:opacity-50 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                  title="Run a hypothetical 'What-If' scenario evaluation on this cluster"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>What-If Scenario</span>
                </button>

                <button
                  onClick={() => {
                    if (!currentGroup || currentGroup.comments.length === 0) {
                      showToast("No comments in selected cluster to answer.", "error");
                      return;
                    }
                    setIsBatchAnswerModalOpen(true);
                  }}
                  disabled={!currentGroup || currentGroup.comments.length === 0}
                  className="px-3.5 py-2 bg-amber-950 hover:bg-black border border-amber-600/40 text-amber-200 disabled:opacity-50 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                  title="Batch answer all comments in this cluster using the cluster synthesis report for context"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Batch Answer</span>
                </button>

                <button
                  onClick={() => {
                    const nonEmpties = clusterGroups.filter(g => g.comments.length > 0).map(g => g.topicName);
                    setSelectedBatchTopics(new Set(nonEmpties));
                    setIsBatchModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-amber-800 hover:bg-amber-900 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                  title="Synthesize reports in batches (one report at a time) for selected or all clusters"
                >
                  <Layers className="w-3.5 h-3.5 text-amber-300" />
                  <span>Batch Synthesize ({clusterGroups.filter(g => g.comments.length > 0).length})</span>
                </button>
              </div>

              {/* Group B: Dataset Sync & Export Controls */}
              <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/10">
                <label className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase text-amber-100 bg-white/10 hover:bg-white/20 border border-white/20 px-2.5 py-2 cursor-pointer transition-colors select-none shadow-xs" title="Include existing drafted proposed responses in cluster synthesis report">
                  <input
                    type="checkbox"
                    checked={includeProposedResponses}
                    onChange={(e) => setIncludeProposedResponses(e.target.checked)}
                    className="w-3.5 h-3.5 accent-amber-400 cursor-pointer"
                  />
                  <span>Responses ({currentGroup?.comments.filter(c => c.proposedResponse && c.proposedResponse.trim().length > 0).length || 0})</span>
                </label>

                <button
                  onClick={handleApplyToMainDataset}
                  className="px-3.5 py-2 bg-[#4A6741] hover:bg-[#3D5535] text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                  title="Apply primary & secondary cluster assignments across all tabs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Apply to Dataset</span>
                </button>

                <button
                  onClick={() => handleExportCSV(false)}
                  className="px-3 py-2 border border-white/20 hover:bg-white/10 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="Export this cluster with secondary topic matches to CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Cluster</span>
                </button>

                <button
                  onClick={() => handleExportCSV(true)}
                  className="px-3 py-2 border border-white/20 hover:bg-white/10 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="Export all custom clusters with secondary matches to CSV"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-green-400" />
                  <span>Export All</span>
                </button>
              </div>

            </div>
          </div>

          {/* Cluster Summary Metrics Dashboard */}
          {currentGroup && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Card 1: Total Volume & Source Breakdown */}
              <div className="bg-white border border-[#E5E3DF] p-3.5 space-y-1">
                <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-gray-400 block">
                  Primary Cluster Volume
                </span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-[#1A1A1A]">
                    {currentGroup.comments.length}
                  </span>
                  <span className="text-xs font-mono text-gray-500 font-semibold">
                    {comments.length > 0 ? ((currentGroup.comments.length / comments.length) * 100).toFixed(1) : 0}% of dataset
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 pt-1 border-t border-[#E5E3DF]">
                  <span className="text-blue-800 font-medium">📁 {currentGroup.preAssignedCount} File Assigned</span>
                  <span className="text-emerald-800 font-medium">✨ {currentGroup.autoMappedCount} Auto Mapped</span>
                </div>
              </div>

              {/* Card 2: Secondary Cross-Matches in this Cluster */}
              <div className="bg-white border border-[#E5E3DF] p-3.5 space-y-1">
                <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-purple-800 block flex items-center gap-1">
                  <Layers2 className="w-3 h-3 text-purple-600" />
                  Secondary Cluster Matches (≥{(secondaryThreshold * 100).toFixed(0)}%)
                </span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-purple-900">
                    {currentGroup.secondaryMatchesCount}
                  </span>
                  <span className="text-xs text-purple-700 font-mono font-medium">
                    {currentGroup.comments.length > 0 ? ((currentGroup.secondaryMatchesCount / currentGroup.comments.length) * 100).toFixed(0) : 0}% multi-topic
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 font-mono pt-1 border-t border-[#E5E3DF]">
                  Items matching additional topics above 50%
                </p>
              </div>

              {/* Card 3: Sentiment Breakdown */}
              <div className="bg-white border border-[#E5E3DF] p-3.5 space-y-1">
                <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-gray-400 block">
                  Cluster Sentiment Split
                </span>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="px-2 py-0.5 bg-green-50 text-green-800 border border-green-200 text-[10px] font-bold font-mono flex items-center gap-1">
                    <Smile className="w-3 h-3 text-green-600" />
                    <span>{currentGroup.sentimentCounts.positive}</span>
                  </span>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-700 border border-gray-200 text-[10px] font-bold font-mono flex items-center gap-1">
                    <Meh className="w-3 h-3 text-gray-500" />
                    <span>{currentGroup.sentimentCounts.neutral}</span>
                  </span>
                  <span className="px-2 py-0.5 bg-red-50 text-red-800 border border-red-200 text-red-800 text-[10px] font-bold font-mono flex items-center gap-1">
                    <Frown className="w-3 h-3 text-red-600" />
                    <span>{currentGroup.sentimentCounts.negative}</span>
                  </span>
                </div>
              </div>

              {/* Card 4: Organizations Represented */}
              <div className="bg-white border border-[#E5E3DF] p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-gray-400 block">
                    Organizations Represented
                  </span>
                  {onOpenStakeholderModal && (
                    <button
                      onClick={() => onOpenStakeholderModal()}
                      className="text-[9px] font-mono text-[#4A6741] hover:underline font-bold"
                    >
                      Stakeholder Grid →
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[#1A1A1A]">
                    <Building2 className="w-4 h-4 text-gray-500" />
                    <span className="text-lg font-bold">
                      {currentGroup.organizations.length}
                    </span>
                    <span className="text-xs text-gray-500">orgs</span>
                  </div>
                  {currentGroup.organizations.length > 0 && (
                    <div className="flex items-center gap-1 overflow-x-auto max-w-[160px]">
                      {currentGroup.organizations.slice(0, 2).map((org) => (
                        <OrganizationBadge
                          key={org}
                          organizationName={org}
                          mapping={stakeholderMappings[org]}
                          onClick={onOpenStakeholderModal}
                        />
                      ))}
                      {currentGroup.organizations.length > 2 && (
                        <span className="text-[9px] text-gray-400 font-mono">
                          +{currentGroup.organizations.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ACTIVE CLUSTER SYNTHESIS REPORT PANEL */}
          {activeClusterSynthesis && (
            <div className="bg-white border-2 border-amber-600 shadow-md transition-all space-y-0">
              {/* Header */}
              <div className="bg-[#2D1B0D] text-amber-50 p-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-amber-800">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <h4 className="font-serif italic font-bold text-sm text-white flex items-center gap-2">
                      <span>Cluster Synthesis Report:</span>
                      <span className="text-amber-300 font-mono not-italic">"{activeClusterSynthesis.topicName}"</span>
                    </h4>
                    <span className="text-[10px] font-mono text-amber-300/80">
                      Generated {activeClusterSynthesis.timestamp} • Prepended Stakeholders & Appended CSV Traceability Rows Included
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeClusterSynthesis.markdown);
                      showToast("Copied synthesis report markdown to clipboard!", "success");
                    }}
                    className="px-2.5 py-1 bg-amber-900/80 hover:bg-amber-800 border border-amber-700 text-amber-100 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                    title="Copy report markdown to clipboard"
                  >
                    <Copy className="w-3 h-3 text-amber-300" />
                    <span>Copy Markdown</span>
                  </button>

                  <button
                    onClick={handleSynthesizeClusterComments}
                    disabled={isSynthesizingCluster}
                    className="px-2.5 py-1 bg-amber-800 hover:bg-amber-700 text-amber-100 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Re-run synthesis"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSynthesizingCluster ? "animate-spin" : ""}`} />
                    <span>Re-run</span>
                  </button>

                  <button
                    onClick={() => setIsSynthesisExpanded(!isSynthesisExpanded)}
                    className="p-1 text-amber-300 hover:text-white cursor-pointer"
                    title={isSynthesisExpanded ? "Collapse panel" : "Expand panel"}
                  >
                    {isSynthesisExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => setActiveClusterSynthesis(null)}
                    className="p-1 text-amber-400 hover:text-white cursor-pointer"
                    title="Close synthesis panel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Report Body */}
              {isSynthesisExpanded && (
                <div className="p-5 max-h-[600px] overflow-y-auto bg-[#FFFDF9]">
                  <MarkdownViewer markdown={activeClusterSynthesis.markdown} />
                </div>
              )}
            </div>
          )}

          {/* 3. TABLE FILTER & SEARCH CONTROLS */}
          <div className="bg-white border border-[#E5E3DF] p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by ID, comment text, organization, secondary topics..."
                className="w-full bg-[#F9F8F6] border border-[#E5E3DF] pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#1A1A1A] rounded-none"
              />
            </div>

            {/* Source Filter, Sentiment Filter & Sort */}
            <div className="flex items-center gap-2 overflow-x-auto shrink-0">
              
              {/* Assignment Source & Secondary Filter */}
              <div className="flex border border-[#E5E3DF] bg-[#F9F8F6] p-0.5 text-[10px]">
                <button
                  onClick={() => setSourceFilter('all')}
                  className={`px-2 py-1 font-semibold uppercase tracking-wider cursor-pointer ${
                    sourceFilter === 'all' ? "bg-[#1A1A1A] text-white" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  All Rows
                </button>
                <button
                  onClick={() => setSourceFilter('file')}
                  className={`px-2 py-1 font-semibold uppercase tracking-wider cursor-pointer flex items-center gap-1 ${
                    sourceFilter === 'file' ? "bg-blue-800 text-white" : "text-blue-800 hover:bg-blue-50"
                  }`}
                >
                  <FileSpreadsheet className="w-2.5 h-2.5" />
                  <span>File Assigned</span>
                </button>
                <button
                  onClick={() => setSourceFilter('auto')}
                  className={`px-2 py-1 font-semibold uppercase tracking-wider cursor-pointer flex items-center gap-1 ${
                    sourceFilter === 'auto' ? "bg-emerald-800 text-white" : "text-emerald-800 hover:bg-emerald-50"
                  }`}
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Auto Mapped</span>
                </button>
                <button
                  onClick={() => setSourceFilter('has_secondary')}
                  className={`px-2 py-1 font-semibold uppercase tracking-wider cursor-pointer flex items-center gap-1 ${
                    sourceFilter === 'has_secondary' ? "bg-purple-800 text-white" : "text-purple-800 hover:bg-purple-50"
                  }`}
                >
                  <Layers2 className="w-2.5 h-2.5" />
                  <span>Has Secondary Topics</span>
                </button>
              </div>

              {/* Sentiment Filter Pills */}
              <div className="flex border border-[#E5E3DF] bg-[#F9F8F6] p-0.5 text-[10px]">
                {(['all', 'positive', 'neutral', 'negative'] as const).map((sent) => (
                  <button
                    key={sent}
                    onClick={() => setSentimentFilter(sent)}
                    className={`px-2.5 py-1 uppercase tracking-wider font-semibold cursor-pointer transition-colors ${
                      sentimentFilter === sent 
                        ? "bg-[#1A1A1A] text-white" 
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {sent}
                  </button>
                ))}
              </div>

              {/* Sort Selector */}
              <div className="flex items-center gap-1 border border-[#E5E3DF] px-2 py-1 bg-white text-xs">
                <ArrowUpDown className="w-3 h-3 text-gray-400" />
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as any)}
                  className="bg-transparent text-[11px] font-semibold text-gray-700 focus:outline-none cursor-pointer"
                >
                  <option value="score">Sort by Primary Confidence</option>
                  <option value="secondary_count">Sort by Secondary Topic Count</option>
                  <option value="source">Sort by Assignment Source</option>
                  <option value="id">Sort by Comment ID</option>
                  <option value="org">Sort by Organization</option>
                  <option value="sentiment">Sort by Sentiment</option>
                </select>
                <button
                  onClick={() => setSortDirection(prev => prev === "desc" ? "asc" : "desc")}
                  className="text-gray-500 hover:text-[#1A1A1A] font-mono font-bold px-1"
                  title="Toggle sort direction"
                >
                  {sortDirection === "desc" ? "↓" : "↑"}
                </button>
              </div>
            </div>
          </div>

          {/* 4. RELEVANT ROWS TABLE VIEW */}
          <div className="bg-white border border-[#E5E3DF] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F9F8F6] border-b border-[#E5E3DF] text-[9px] uppercase font-mono tracking-widest text-gray-500 font-bold">
                    <th className="py-3 px-4 w-28">Comment ID</th>
                    <th className="py-3 px-4 w-40">Organization</th>
                    <th className="py-3 px-4">Feedback Comment Text</th>
                    <th className="py-3 px-4 w-60">Primary & Secondary Clusters</th>
                    <th className="py-3 px-4 w-24">Sentiment</th>
                    <th className="py-3 px-4 w-32 text-right">Confidence Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E3DF]">
                  {filteredClusterComments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-400 space-y-2">
                        <Info className="w-6 h-6 mx-auto text-gray-300" />
                        <p className="text-xs font-serif italic">No comment rows found matching the filter criteria in this cluster topic.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredClusterComments.map((comment) => {
                      const commentIdDisplay = comment.originalId || comment.id;
                      const orgNameDisplay = comment.organizationName || comment.originalRowData?.["Organization"] || comment.originalRowData?.["Org"] || comment.originalRowData?.["Organization Name"] || "—";
                      
                      const confPercent = (comment.similarityScore * 100).toFixed(1);
                      const confVal = comment.similarityScore * 100;

                      return (
                        <tr 
                          key={comment.id}
                          className="hover:bg-[#F9F8F6]/80 transition-colors group"
                        >
                          {/* ID Column */}
                          <td className="py-3.5 px-4 font-mono text-[11px] font-bold text-[#1A1A1A] align-top whitespace-nowrap">
                            <span className="bg-gray-100 px-1.5 py-0.5 border border-gray-200">
                              {commentIdDisplay}
                            </span>
                          </td>

                          {/* Organization Name Column */}
                          <td className="py-3.5 px-4 font-medium text-gray-700 align-top">
                            <OrganizationBadge
                              organizationName={orgNameDisplay}
                              mapping={stakeholderMappings[orgNameDisplay]}
                              onClick={onOpenStakeholderModal}
                            />
                          </td>

                          {/* Comment Text Column */}
                          <td className="py-3.5 px-4 text-gray-800 leading-relaxed align-top">
                            <p className="font-sans text-xs">
                              {comment.text}
                            </p>
                            {comment.originalRowData && Object.keys(comment.originalRowData).length > 2 && (
                              <div className="mt-1 flex flex-wrap gap-2 text-[9px] font-mono text-gray-400">
                                {Object.entries(comment.originalRowData)
                                  .filter(([key]) => !["comment", "text", "id", "sentiment", "organization", "org"].includes(key.toLowerCase()))
                                  .slice(0, 3)
                                  .map(([k, v]) => (
                                    <span key={k} className="bg-gray-50 border border-gray-200 px-1">
                                      {k}: {String(v)}
                                    </span>
                                  ))}
                              </div>
                            )}

                            {/* Proposed Response Flag & Display */}
                            {comment.proposedResponse ? (
                              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-300 text-amber-950 space-y-1">
                                <div className="flex items-center justify-between text-[9px] font-mono font-bold uppercase tracking-wider text-amber-900 border-b border-amber-200 pb-1">
                                  <span className="flex items-center gap-1">
                                    💬 Proposed Response ({comment.proposedResponseBy || "Policy Analyst"})
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => {
                                        setActiveResponseCommentId(comment.id);
                                        setInlineResponseText(comment.proposedResponse || "");
                                        setInlineResponseRole(comment.proposedResponseBy || "Policy Analyst");
                                      }}
                                      className="text-amber-800 hover:underline cursor-pointer"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (!onUpdateComment) return;
                                        onUpdateComment({
                                          ...comment,
                                          proposedResponse: undefined,
                                          proposedResponseBy: undefined,
                                          proposedResponseAt: undefined
                                        });
                                        showToast("Proposed response cleared.", "info");
                                      }}
                                      className="text-red-700 hover:underline cursor-pointer"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                                <p className="text-xs font-sans italic text-amber-900 pt-0.5">
                                  "{comment.proposedResponse}"
                                </p>
                              </div>
                            ) : (
                              <div className="mt-1.5">
                                {activeResponseCommentId === comment.id ? (
                                  <div className="p-2.5 bg-amber-50 border border-amber-300 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-900">Propose Official Response</span>
                                      <button
                                        onClick={async () => {
                                          setIsDraftingInlineAI(true);
                                          try {
                                            const prompt = `You are a public policy analyst and customer experience officer. Draft a professional, concise proposed official response to the following stakeholder feedback comment: "${comment.text}". Respond directly in 1-2 constructive sentences.`;
                                            const aiText = await fetchLocalCompletion(prompt, llmSettings);
                                            setInlineResponseText(aiText);
                                          } catch (e) {
                                            setInlineResponseText(`Thank you for your feedback regarding "${comment.topic || 'this issue'}". We have noted your concerns and are reviewing potential policy and system adjustments.`);
                                          } finally {
                                            setIsDraftingInlineAI(false);
                                          }
                                        }}
                                        disabled={isDraftingInlineAI}
                                        className="text-[9px] font-mono uppercase bg-amber-900 text-amber-100 px-2 py-0.5 flex items-center gap-1 hover:bg-amber-950 cursor-pointer disabled:opacity-50"
                                      >
                                        <Sparkles className={`w-3 h-3 text-amber-300 ${isDraftingInlineAI ? "animate-spin" : ""}`} />
                                        <span>AI Draft</span>
                                      </button>
                                    </div>

                                    <textarea
                                      value={inlineResponseText}
                                      onChange={(e) => setInlineResponseText(e.target.value)}
                                      placeholder="Type proposed response..."
                                      className="w-full bg-white border border-amber-300 p-2 text-xs text-amber-950 font-sans focus:outline-none"
                                      rows={2}
                                    />

                                    <div className="flex items-center justify-between">
                                      <input
                                        type="text"
                                        value={inlineResponseRole}
                                        onChange={(e) => setInlineResponseRole(e.target.value)}
                                        placeholder="Role (e.g. Policy Analyst)"
                                        className="bg-white border border-amber-300 px-2 py-0.5 text-[10px] text-amber-950 font-mono"
                                      />
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => setActiveResponseCommentId(null)}
                                          className="px-2 py-0.5 text-[9px] font-mono text-gray-500 hover:underline cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => handleSaveInlineProposedResponse(comment)}
                                          className="px-2.5 py-0.5 bg-[#1A1A1A] text-white text-[9px] font-mono font-bold uppercase cursor-pointer"
                                        >
                                          Save
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setActiveResponseCommentId(comment.id);
                                      setInlineResponseText("");
                                      setInlineResponseRole("Policy Analyst");
                                    }}
                                    className="text-[9px] font-mono font-semibold uppercase text-amber-800 hover:text-amber-950 hover:underline flex items-center gap-1 cursor-pointer pt-0.5"
                                  >
                                    <span>💬 Propose Response</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Primary & Secondary Clusters Column */}
                          <td className="py-3.5 px-4 align-top space-y-1.5">
                            {/* Primary Cluster Badge */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-mono uppercase font-bold text-gray-400 shrink-0">Primary:</span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#1A1A1A] text-white text-[10px] font-bold font-sans">
                                <span>{comment.assignedTopic}</span>
                                {comment.isPreAssigned && (
                                  <span className="text-[8px] bg-blue-500 text-white px-1 font-mono uppercase">File</span>
                                )}
                              </span>
                            </div>

                            {/* Secondary Cluster Tags (>= 50%) */}
                            {comment.secondaryTopics && comment.secondaryTopics.length > 0 ? (
                              <div className="space-y-1 pt-0.5">
                                <span className="text-[9px] font-mono uppercase font-bold text-purple-700 block">
                                  Secondary Matches (≥{(secondaryThreshold * 100).toFixed(0)}%):
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {comment.secondaryTopics.map((sec) => (
                                    <span 
                                      key={sec.topic}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-50 text-purple-900 border border-purple-200 text-[9.5px] font-mono font-medium"
                                      title={`Similarity match: ${(sec.confidence * 100).toFixed(1)}%`}
                                    >
                                      <Tag className="w-2.5 h-2.5 text-purple-600" />
                                      <span>{sec.topic}</span>
                                      <span className="font-bold text-purple-700">({(sec.confidence * 100).toFixed(0)}%)</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[9px] text-gray-400 font-mono italic block pt-0.5">
                                No secondary topics ≥{(secondaryThreshold * 100).toFixed(0)}%
                              </span>
                            )}
                          </td>

                          {/* Sentiment Column */}
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            {comment.sentiment === "positive" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 text-green-800 text-[10px] font-bold uppercase tracking-wider">
                                <Smile className="w-3 h-3 text-green-600" />
                                <span>Positive</span>
                              </span>
                            )}
                            {comment.sentiment === "neutral" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-700 text-[10px] font-bold uppercase tracking-wider">
                                <Meh className="w-3 h-3 text-gray-500" />
                                <span>Neutral</span>
                              </span>
                            )}
                            {comment.sentiment === "negative" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 text-red-800 text-[10px] font-bold uppercase tracking-wider">
                                <Frown className="w-3 h-3 text-red-600" />
                                <span>Negative</span>
                              </span>
                            )}
                          </td>

                          {/* Primary Confidence Score Column */}
                          <td className="py-3.5 px-4 text-right align-top whitespace-nowrap">
                            <div className="inline-flex flex-col items-end">
                              <span className={`font-mono font-bold text-xs ${
                                confVal >= 80 ? "text-[#4A6741]" : confVal >= 60 ? "text-amber-700" : "text-gray-600"
                              }`}>
                                {confPercent}%
                              </span>
                              <div className="w-20 bg-gray-100 h-1.5 mt-1 overflow-hidden">
                                <div 
                                  className={`h-full ${
                                    confVal >= 80 ? "bg-[#4A6741]" : confVal >= 60 ? "bg-amber-500" : "bg-gray-400"
                                  }`} 
                                  style={{ width: `${Math.min(100, Math.max(0, confVal))}%` }}
                                />
                              </div>
                              <span className="text-[8px] text-gray-400 font-mono mt-0.5">
                                {comment.isPreAssigned ? "File Assigned" : "Auto Primary"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="p-3 bg-[#F9F8F6] border-t border-[#E5E3DF] flex justify-between items-center text-[10px] font-mono text-gray-500">
              <span>Showing {filteredClusterComments.length} of {currentGroup.comments.length} items in cluster ({currentGroup.preAssignedCount} file-assigned, {currentGroup.autoMappedCount} auto-mapped, {currentGroup.secondaryMatchesCount} with secondary tags)</span>
              <span>Vector Multi-Assignment Engine • {llmSettings.useCustomEmbedding ? llmSettings.embeddingModel : "Deterministic Embeddings"}</span>
            </div>
          </div>

        </div>
      )}

      {/* BATCH SYNTHESIS MODAL */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#1A1A1A] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl rounded-none">
            
            {/* Modal Header */}
            <div className="bg-[#1A1A1A] text-white p-4 flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-serif italic font-bold text-lg text-white">Batch Synthesize Cluster Reports</h3>
                  <p className="text-[10px] font-mono text-gray-400">Generate qualitative synthesis reports sequentially for all or selected clusters</p>
                </div>
              </div>
              {!isBatchRunning && (
                <button
                  onClick={() => setIsBatchModalOpen(false)}
                  className="text-gray-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              
              {/* Batch Running Progress Bar */}
              {isBatchRunning ? (
                <div className="bg-amber-50 border border-amber-300 p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-amber-950">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
                      <span>Synthesizing Cluster {batchProgress.current} of {batchProgress.total}</span>
                    </span>
                    <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                  </div>

                  <div className="w-full bg-amber-200 h-2.5 overflow-hidden">
                    <div
                      className="bg-amber-700 h-full transition-all duration-300"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    />
                  </div>

                  <div className="bg-white p-3 border border-amber-200 font-mono text-xs text-amber-900">
                    Currently processing: <strong>"{batchProgress.currentTopic}"</strong>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        cancelBatchRef.current = true;
                      }}
                      className="px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white text-xs font-mono uppercase font-bold cursor-pointer"
                    >
                      Cancel Batch
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Select Controls */}
                  <div className="flex items-center justify-between border-b border-[#E5E3DF] pb-3">
                    <span className="text-xs font-mono font-bold uppercase text-gray-600">
                      Select Clusters to Synthesize ({selectedBatchTopics.size} Selected)
                    </span>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <button
                        onClick={() => {
                          const allTopics = clusterGroups.map(g => g.topicName);
                          setSelectedBatchTopics(new Set(allTopics));
                        }}
                        className="text-amber-800 hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => {
                          const nonEmpties = clusterGroups.filter(g => g.comments.length > 0).map(g => g.topicName);
                          setSelectedBatchTopics(new Set(nonEmpties));
                        }}
                        className="text-amber-800 hover:underline cursor-pointer"
                      >
                        Select Non-Empty ({clusterGroups.filter(g => g.comments.length > 0).length})
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => setSelectedBatchTopics(new Set())}
                        className="text-gray-500 hover:underline cursor-pointer"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {/* Clusters List */}
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {clusterGroups.map((group) => {
                      const isSelected = selectedBatchTopics.has(group.topicName);
                      return (
                        <label
                          key={group.topicName}
                          className={`flex items-center justify-between p-3 border cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-amber-50/80 border-amber-300 text-amber-950"
                              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const next = new Set(selectedBatchTopics);
                                if (e.target.checked) next.add(group.topicName);
                                else next.delete(group.topicName);
                                setSelectedBatchTopics(next);
                              }}
                              className="w-4 h-4 accent-amber-800 cursor-pointer"
                            />
                            <div>
                              <span className="font-sans font-bold text-xs block text-[#1A1A1A]">
                                {group.topicName}
                              </span>
                              <span className="text-[10px] font-mono text-gray-500">
                                {group.comments.length} items • {group.preAssignedCount} file-assigned, {group.autoMappedCount} auto-mapped
                              </span>
                            </div>
                          </div>

                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border ${
                            group.comments.length > 0
                              ? "bg-white border-gray-300 text-gray-800"
                              : "bg-gray-100 border-gray-200 text-gray-400"
                          }`}>
                            {group.comments.length} Comments
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            {!isBatchRunning && (
              <div className="bg-[#F9F8F6] border-t border-[#E5E3DF] p-4 flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">
                  Each report will be added to the <strong>Synthesis Hub</strong>.
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsBatchModalOpen(false)}
                    className="px-4 py-2 border border-[#E5E3DF] text-xs font-mono uppercase font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRunBatchSynthesis}
                    disabled={selectedBatchTopics.size === 0}
                    className="px-5 py-2 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Generate {selectedBatchTopics.size} Reports</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* BATCH ANSWER CLUSTER COMMENTS MODAL */}
      {isBatchAnswerModalOpen && currentGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#1A1A1A] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl rounded-none">
            
            {/* Modal Header */}
            <div className="bg-[#1A1A1A] text-white p-4 flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-serif italic font-bold text-lg text-white">Batch Answer Cluster Comments</h3>
                  <p className="text-[10px] font-mono text-gray-400">Generate grounded official proposed responses for comments in cluster "{currentGroup.topicName}"</p>
                </div>
              </div>
              {!isBatchAnsweringRunning && (
                <button
                  onClick={() => setIsBatchAnswerModalOpen(false)}
                  className="text-gray-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              
              {/* Batch Running Progress Bar */}
              {isBatchAnsweringRunning ? (
                <div className="bg-amber-50 border border-amber-300 p-5 space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-amber-950">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
                      <span>
                        {batchAnswerProgress.stage === 'synthesis'
                          ? "Step 1 of 2: Generating Cluster Synthesis Context..."
                          : `Step 2 of 2: Answering Comment ${batchAnswerProgress.current} of ${batchAnswerProgress.total}`
                        }
                      </span>
                    </span>
                    {batchAnswerProgress.stage === 'answering' && (
                      <span>{Math.round((batchAnswerProgress.current / batchAnswerProgress.total) * 100)}%</span>
                    )}
                  </div>

                  <div className="w-full bg-amber-200 h-2.5 overflow-hidden">
                    <div
                      className="bg-amber-700 h-full transition-all duration-300"
                      style={{
                        width: batchAnswerProgress.stage === 'synthesis'
                          ? '15%'
                          : `${(batchAnswerProgress.current / batchAnswerProgress.total) * 100}%`
                      }}
                    />
                  </div>

                  <div className="bg-white p-3 border border-amber-200 font-mono text-xs text-amber-900 leading-relaxed max-h-24 overflow-y-auto">
                    <strong>Current Action:</strong> {batchAnswerProgress.currentCommentText}
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        cancelBatchAnswerRef.current = true;
                      }}
                      className="px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white text-xs font-mono uppercase font-bold cursor-pointer"
                    >
                      Cancel Batch Answering
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Synthesis Context Status Banner */}
                  {activeClusterSynthesis && activeClusterSynthesis.topicName === currentGroup.topicName ? (
                    <div className="bg-emerald-50 border border-emerald-300 p-3.5 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                      <div className="text-xs font-sans text-emerald-950">
                        <strong className="block font-bold">Cluster Synthesis Report Context Ready</strong>
                        <p className="text-[11px] text-emerald-800 mt-0.5">
                          Generated at <strong>{activeClusterSynthesis.timestamp}</strong>. Every proposed response will be contextualized using this report to ensure strategic alignment across all comments in this cluster.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-300 p-3.5 flex items-start gap-3">
                      <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs font-sans text-amber-950">
                        <strong className="block font-bold">Automatic Pre-Synthesis Step Required</strong>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          No synthesis report currently exists for cluster <strong>"{currentGroup.topicName}"</strong>. Clicking <em>"Start Batch Answering"</em> will run a cluster synthesis report <strong>FIRST at the beginning (once)</strong>, then use that report for context when formulating every comment response.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Settings & Configuration Controls */}
                  <div className="bg-[#F9F8F6] border border-[#E5E3DF] p-4 space-y-4">
                    <h4 className="text-xs font-mono font-bold uppercase text-gray-700 border-b border-[#E5E3DF] pb-2">
                      Response Options & Author Role
                    </h4>

                    {/* Author Role */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-mono font-bold uppercase text-gray-600">
                        Author / Organization Role Tag
                      </label>
                      <input
                        type="text"
                        value={batchAnswerRole}
                        onChange={(e) => setBatchAnswerRole(e.target.value)}
                        placeholder="e.g. Policy Analyst, CX Lead, Product Manager"
                        className="w-full bg-white border border-gray-300 px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-amber-800"
                      />
                    </div>

                    {/* Overwrite Option */}
                    <label className="flex items-center gap-2 text-xs font-mono text-gray-800 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={batchAnswerOverwrite}
                        onChange={(e) => setBatchAnswerOverwrite(e.target.checked)}
                        className="w-4 h-4 accent-amber-800 cursor-pointer"
                      />
                      <span>Overwrite existing responses (Re-answer comments that already have proposed responses)</span>
                    </label>

                    {/* Inclusion of Proposed Responses in initial synthesis if generated */}
                    <label className="flex items-center gap-2 text-xs font-mono text-gray-800 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeProposedResponses}
                        onChange={(e) => setIncludeProposedResponses(e.target.checked)}
                        className="w-4 h-4 accent-amber-800 cursor-pointer"
                      />
                      <span>Include existing proposed responses when running synthesis report</span>
                    </label>
                  </div>

                  {/* Target Comments Summary Box */}
                  <div className="border border-gray-200 p-4 bg-gray-50 flex items-center justify-between text-xs font-mono">
                    <div>
                      <span className="text-gray-500 block text-[10px] uppercase font-bold">Cluster Response Target</span>
                      <strong className="text-gray-900 text-sm">
                        {currentGroup.comments.filter(c => !c.isArchived && (batchAnswerOverwrite || !c.proposedResponse || c.proposedResponse.trim().length === 0)).length} Comments
                      </strong>
                      <span className="text-gray-500 text-[10px] block">
                        out of {currentGroup.comments.length} total comments in "{currentGroup.topicName}"
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-1 border border-emerald-300">
                        {currentGroup.comments.filter(c => c.proposedResponse && c.proposedResponse.trim().length > 0).length} Already Answered
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            {!isBatchAnsweringRunning && (
              <div className="bg-[#F9F8F6] border-t border-[#E5E3DF] p-4 flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">
                  Each response will be saved and flagged with <strong>💬 Proposed Response</strong>.
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsBatchAnswerModalOpen(false)}
                    className="px-4 py-2 border border-[#E5E3DF] text-xs font-mono uppercase font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRunBatchAnswerCluster}
                    disabled={currentGroup.comments.filter(c => !c.isArchived && (batchAnswerOverwrite || !c.proposedResponse || c.proposedResponse.trim().length === 0)).length === 0}
                    className="px-5 py-2 bg-amber-900 hover:bg-black disabled:opacity-50 text-white text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Start Batch Answering</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
