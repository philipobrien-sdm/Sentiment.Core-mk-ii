import React, { useMemo, useState } from "react";
import { CommentItem, LlmSettings, StakeholderMapping, getQuadrantInfo } from "../types";
import { OrganizationBadge } from "./OrganizationBadge";
import { getCommentEmbedding } from "../utils/embeddingsCache";
import { calculateCosineSimilarity } from "./DuplicateReview";
import { fetchLocalCompletion } from "../utils/localLlm";
import { 
  Search, MessageSquare, AlertTriangle, ArrowRight, User, 
  Activity, Clock, Check, Info, Sparkles, Loader2, Filter,
  Building, ThumbsUp, ThumbsDown, HelpCircle, ListFilter,
  Eye, CheckCircle2, ChevronRight, RefreshCw, X, FileText
} from "lucide-react";
import { MarkdownViewer } from "./MarkdownViewer";

interface CommentsListProps {
  comments: CommentItem[];
  llmSettings: LlmSettings;
  stakeholderMappings?: Record<string, StakeholderMapping>;
  onOpenStakeholderModal?: (orgName?: string) => void;
  onSelectCommentGlobal?: (id: string | null) => void;
  selectedCommentIdGlobal?: string | null;
  onSaveSynthesisToHistory?: (synthesis: { title: string; markdown: string; source: string }) => void;
  onUpdateComment?: (updatedComment: CommentItem) => void;
}

export function generateLocalHeuristicPerspectiveSynthesis(
  primary: CommentItem,
  similar: CommentItem[]
): string {
  const positives = similar.filter(c => c.sentiment === "positive");
  const neutrals = similar.filter(c => c.sentiment === "neutral");
  const negatives = similar.filter(c => c.sentiment === "negative");
  
  return `# Comparative Perspective Critique
*Synthesizing stakeholder viewpoints for the topic **"${primary.topic}"** based on the primary selected comment and ${similar.length} related perspective nodes.*

## 1. Primary Perspective Core
- **Selected Comment**: "${primary.text}"
- **Author Organization**: ${primary.organizationName || "*(No Organization)*"}
- **Focal Sentiment**: **${primary.sentiment.toUpperCase()}**

## 2. Juxtaposition of Stakeholder Views
The active workspace contains **${positives.length} positive**, **${neutrals.length} neutral**, and **${negatives.length} negative** viewpoints on this same topic area:

### 🟢 Positive Perspectives
${positives.slice(0, 3).map(p => `- *"Row ${p.csvRowIndex || "?"} (${p.organizationName || "Unknown Org"})"*: "${p.text}"`).join("\n") || "- *No contrasting positive perspectives recorded.*"}

### 🟡 Neutral Perspectives
${neutrals.slice(0, 3).map(n => `- *"Row ${n.csvRowIndex || "?"} (${n.organizationName || "Unknown Org"})"*: "${n.text}"`).join("\n") || "- *No contrasting neutral perspectives recorded.*"}

### 🔴 Negative Perspectives
${negatives.slice(0, 3).map(n => `- *"Row ${n.csvRowIndex || "?"} (${n.organizationName || "Unknown Org"})"*: "${n.text}"`).join("\n") || "- *No contrasting negative perspectives recorded.*"}

## 3. Core Alignment & Tension Points
- **Areas of Consensus**: Across both positive and negative comments, stakeholders focus on the same core functional domain (**${primary.topic}**). They agree on the importance of this feature, although they experience different operational outcomes.
- **Tension & Friction**: The primary friction stems from varying user setups and operational requirements. While positive users commend the implementation, negative users report usability or technical barriers.

## 4. Reconciling Action Plan
1. **Unify Configuration Options**: Build standard options to bridge the gap between positive and negative user scenarios.
2. **Deploy Targeted Optimization**: Direct developer review toward resolving the specific friction raised in the feedback list.
3. **Configure Settings**: To replace this heuristic report with real-time generative analysis, start a local LLM endpoint (Ollama/LM Studio) and connect it in the Settings drawer.`;
}

export function buildStakeholderListMarkdown(
  nodes: CommentItem[],
  stakeholderMappings: Record<string, StakeholderMapping> = {}
): string {
  if (!nodes || nodes.length === 0) return "";

  const orgMap = new Map<string, { total: number; positive: number; neutral: number; negative: number }>();

  nodes.forEach((c) => {
    const org = c.organizationName?.trim() || c.originalRowData?.["Organization"] || c.originalRowData?.["Org"] || c.originalRowData?.["Organization Name"] || "Unspecified Organization";
    if (!orgMap.has(org)) {
      orgMap.set(org, { total: 0, positive: 0, neutral: 0, negative: 0 });
    }
    const entry = orgMap.get(org)!;
    entry.total += 1;
    if (c.sentiment === "positive") entry.positive += 1;
    else if (c.sentiment === "negative") entry.negative += 1;
    else entry.neutral += 1;
  });

  const lines: string[] = [];
  orgMap.forEach((stats, org) => {
    const mapping = stakeholderMappings[org];
    let classificationBadge = "";
    let contextSubLines = "";
    if (mapping) {
      const qInfo = getQuadrantInfo(mapping.influence, mapping.interest);
      classificationBadge = ` *(${qInfo.shortLabel} • ${qInfo.priorityWeight}x Priority)*`;
      
      const details: string[] = [];
      if (mapping.bio && mapping.bio.trim()) {
        details.push(`  - 📝 **Stakeholder Bio/Context**: "${mapping.bio.trim()}"`);
      }
      if (mapping.redLines && mapping.redLines.trim()) {
        details.push(`  - ⚠️ **RED LINES & NON-NEGOTIABLES**: "${mapping.redLines.trim()}"`);
      }
      if (mapping.expectations && mapping.expectations.trim()) {
        details.push(`  - 🎯 **Key Expectations**: "${mapping.expectations.trim()}"`);
      }
      if (mapping.notes && mapping.notes.trim()) {
        details.push(`  - 📌 **Strategic Notes**: "${mapping.notes.trim()}"`);
      }
      if (details.length > 0) {
        contextSubLines = "\n" + details.join("\n");
      }
    }

    const sentimentBreakdown = [];
    if (stats.positive > 0) sentimentBreakdown.push(`${stats.positive} Positive`);
    if (stats.neutral > 0) sentimentBreakdown.push(`${stats.neutral} Neutral`);
    if (stats.negative > 0) sentimentBreakdown.push(`${stats.negative} Negative`);

    lines.push(`- **${org}**${classificationBadge} — **${stats.total} comment${stats.total > 1 ? "s" : ""}** (${sentimentBreakdown.join(", ")})${contextSubLines}`);
  });

  const topic = nodes[0]?.topic || "General";

  return `### 👥 Participating Stakeholder Organizations
*Synthesized feedback across **${orgMap.size} stakeholder organization(s)** representing **${nodes.length} dataset item(s)** on topic **"${topic}"**:*

${lines.join("\n")}`;
}

export function buildCsvTraceabilityRowsMarkdown(nodes: CommentItem[]): string {
  if (!nodes || nodes.length === 0) return "";

  // Sort nodes by csvRowIndex ascending if available
  const sorted = [...nodes].sort((a, b) => (a.csvRowIndex || 999999) - (b.csvRowIndex || 999999));

  let table = `### 📋 Traceability Register: Referenced CSV Rows\n`;
  table += `*Audit trail of all **${sorted.length} CSV dataset rows** incorporated directly into this report:*\n\n`;
  table += `| CSV Row # | Comment ID | Organization | Sentiment | Feedback Comment Text |\n`;
  table += `| :--- | :--- | :--- | :--- | :--- |\n`;

  sorted.forEach((c) => {
    const rowNum = c.csvRowIndex ? `Row #${c.csvRowIndex}` : "N/A";
    const id = `\`${c.id}\``;
    const org = c.organizationName || "Unspecified Org";
    const sentiment = c.sentiment.toUpperCase();
    const textSnippet = c.text.length > 200 ? `${c.text.substring(0, 200)}...` : c.text;
    const cleanText = textSnippet.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");

    table += `| ${rowNum} | ${id} | ${org} | ${sentiment} | ${cleanText} |\n`;
  });

  return table;
}

export const CommentsList: React.FC<CommentsListProps> = ({
  comments,
  llmSettings,
  stakeholderMappings = {},
  onOpenStakeholderModal,
  onSelectCommentGlobal,
  selectedCommentIdGlobal,
  onSaveSynthesisToHistory,
  onUpdateComment,
}) => {
  // Local list search & filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSentiment, setSelectedSentiment] = useState<string>("");
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [responseFilter, setResponseFilter] = useState<"all" | "flagged" | "unflagged">("all");

  // Selected comment local state
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);

  // Sync with global selection if provided
  const activeSelectedId = selectedCommentIdGlobal !== undefined ? selectedCommentIdGlobal : localSelectedId;
  const setActiveSelectedId = (id: string | null) => {
    if (onSelectCommentGlobal) {
      onSelectCommentGlobal(id);
    }
    setLocalSelectedId(id);
  };

  const selectedComment = useMemo(() => {
    if (!activeSelectedId) return null;
    return comments.find(c => c.id === activeSelectedId) || null;
  }, [activeSelectedId, comments]);

  // Proposed response states for selected comment
  const [proposedResponseText, setProposedResponseText] = useState<string>("");
  const [proposedResponseRole, setProposedResponseRole] = useState<string>("Policy Analyst");
  const [isEditingProposedResponse, setIsEditingProposedResponse] = useState<boolean>(false);
  const [isDraftingAIResponse, setIsDraftingAIResponse] = useState<boolean>(false);

  // Sync proposed response form whenever selected comment changes
  React.useEffect(() => {
    if (selectedComment) {
      setProposedResponseText(selectedComment.proposedResponse || "");
      setProposedResponseRole(selectedComment.proposedResponseBy || "Policy Analyst");
      setIsEditingProposedResponse(!selectedComment.proposedResponse);
    }
  }, [selectedComment?.id]);

  // Synthesis and analysis states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasMappedPerspectives, setHasMappedPerspectives] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<string | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  // Reset analysis results when selection changes
  React.useEffect(() => {
    setHasMappedPerspectives(false);
    setSynthesisResult(null);
  }, [activeSelectedId]);

  // AI Response Drafter handler
  const handleDraftAIResponse = async () => {
    if (!selectedComment) return;
    setIsDraftingAIResponse(true);

    const prompt = `You are a Senior Public Policy Analyst & Stakeholder Relations Lead.
Draft an official, empathetic, professional response to the following stakeholder feedback comment:

Comment Details:
- Text: "${selectedComment.text}"
- Organization: "${selectedComment.organizationName || 'General Public'}"
- Sentiment: "${selectedComment.sentiment.toUpperCase()}"
${selectedComment.documentReference ? `- Document Reference: "${selectedComment.documentReference}"` : ""}

Task: Write a concise 2-3 sentence official proposed response addressing the feedback, explaining how the team acknowledges their input and plans to consider or integrate it into future policy/product revisions.`;

    try {
      let draftedText = "";
      try {
        draftedText = await fetchLocalCompletion(prompt, llmSettings);
      } catch (e) {
        // Fallback heuristic response draft
        draftedText = `Thank you to ${selectedComment.organizationName || 'the reviewer'} for providing feedback regarding ${selectedComment.topic || 'this topic'}${selectedComment.documentReference ? ` (${selectedComment.documentReference})` : ''}. The project team acknowledges this perspective and will take these considerations into account during our upcoming design review session.`;
      }
      setProposedResponseText(draftedText.trim());
    } catch (err) {
      console.error("AI response drafting failed:", err);
    } finally {
      setIsDraftingAIResponse(false);
    }
  };

  // Save Proposed Response
  const handleSaveProposedResponse = () => {
    if (!selectedComment || !onUpdateComment) return;
    const updated: CommentItem = {
      ...selectedComment,
      proposedResponse: proposedResponseText.trim(),
      proposedResponseBy: proposedResponseRole.trim() || "Policy Analyst",
      proposedResponseAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString()
    };
    onUpdateComment(updated);
    setIsEditingProposedResponse(false);
  };

  // Delete Proposed Response
  const handleRemoveProposedResponse = () => {
    if (!selectedComment || !onUpdateComment) return;
    const updated: CommentItem = {
      ...selectedComment,
      proposedResponse: undefined,
      proposedResponseBy: undefined,
      proposedResponseAt: undefined
    };
    onUpdateComment(updated);
    setProposedResponseText("");
    setIsEditingProposedResponse(true);
  };

  // Extract unique values for filter dropdowns
  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    comments.forEach(c => {
      if (c.topic && !c.isArchived) set.add(c.topic);
    });
    return Array.from(set).sort();
  }, [comments]);

  const availableOrgs = useMemo(() => {
    const set = new Set<string>();
    comments.forEach(c => {
      const org = c.organizationName || "(No Organization)";
      if (!c.isArchived) set.add(org);
    });
    return Array.from(set).sort();
  }, [comments]);

  // Filtered comments for the master list
  const filteredCommentsList = useMemo(() => {
    return comments.filter(c => {
      if (c.isArchived) return false;
      if (c.id === "user_query_node") return false;

      // Text search
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase();
        const matchesText = c.text.toLowerCase().includes(query);
        const matchesId = c.id.toLowerCase().includes(query);
        const matchesTopic = (c.topic || "").toLowerCase().includes(query);
        if (!matchesText && !matchesId && !matchesTopic) return false;
      }

      // Sentiment filter
      if (selectedSentiment && c.sentiment !== selectedSentiment) return false;

      // Topic filter
      if (selectedTopic && c.topic !== selectedTopic) return false;

      // Org filter
      if (selectedOrg) {
        const org = c.organizationName || "(No Organization)";
        if (org !== selectedOrg) return false;
      }

      // Response flag filter
      if (responseFilter === "flagged" && (!c.proposedResponse || c.proposedResponse.trim().length === 0)) return false;
      if (responseFilter === "unflagged" && c.proposedResponse && c.proposedResponse.trim().length > 0) return false;

      return true;
    });
  }, [comments, searchQuery, selectedSentiment, selectedTopic, selectedOrg, responseFilter]);

  // Similar topic comments calculation
  // "not saying the same thing but speaking to the same topic"
  const similarTopicComments = useMemo(() => {
    if (!selectedComment) return [];

    const currentEmb = getCommentEmbedding(selectedComment, llmSettings.useCustomEmbedding);

    return comments
      .filter((c) => c.id !== selectedComment.id && !c.isArchived && c.id !== "user_query_node")
      .map((c) => {
        let similarity = 0;
        if (currentEmb) {
          const cEmb = getCommentEmbedding(c, llmSettings.useCustomEmbedding);
          if (cEmb) {
            similarity = calculateCosineSimilarity(currentEmb, cEmb);
          }
        }
        return { comment: c, similarity };
      })
      .filter(({ comment, similarity }) => {
        // Match standard: belongs to same topic AND is not a near-identical duplicate (similarity < 0.82)
        // If no embeddings are present, fallback to matching by exact topic name.
        const isSameTopic = comment.topic === selectedComment.topic;
        const isNotDuplicate = similarity < 0.85;

        return isSameTopic && isNotDuplicate;
      })
      .sort((a, b) => b.similarity - a.similarity);
  }, [selectedComment, comments, llmSettings.useCustomEmbedding]);

  // Split similar comments by Sentiment Perspectives
  const perspectives = useMemo(() => {
    const list = similarTopicComments.map(s => s.comment);
    return {
      positive: list.filter(c => c.sentiment === "positive"),
      neutral: list.filter(c => c.sentiment === "neutral"),
      negative: list.filter(c => c.sentiment === "negative"),
    };
  }, [similarTopicComments]);

  // Handle Mapping Action
  const handleMapPerspectives = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      setHasMappedPerspectives(true);
    }, 600);
  };

  // Generate perspective synthesis report via LLM
  const handleSynthesizePerspectives = async () => {
    if (!selectedComment) return;
    setIsSynthesizing(true);

    const relatedList = similarTopicComments.map(s => s.comment);

    // Build unique set of nodes involved in this perspective synthesis
    const allNodesMap = new Map<string, CommentItem>();
    if (selectedComment) {
      allNodesMap.set(selectedComment.id, selectedComment);
    }
    relatedList.forEach(c => {
      allNodesMap.set(c.id, c);
    });
    const allSynthesisNodes = Array.from(allNodesMap.values());

    // Prepend stakeholder list and append CSV traceability rows via the application logic
    const prependedStakeholderList = buildStakeholderListMarkdown(allSynthesisNodes, stakeholderMappings);
    const appendedCsvTraceabilityRows = buildCsvTraceabilityRowsMarkdown(allSynthesisNodes);

    const structuredPrompt = `You are a Principal Strategic Product & Customer Experience Analyst.
Analyze the following primary stakeholder feedback comment and contrast it with other comments addressing the exact same topic area ("${selectedComment.topic}").
The goal is to compare and synthesize the different viewpoints and opinions, showing how they conflict, align, or highlight different aspects of this same topic so that differing views on a single item can be easily seen and reconciled together.

Primary Selected Comment of Interest:
- Text: "${selectedComment.text}"
- Sentiment: ${selectedComment.sentiment.toUpperCase()}
- Organization/Group: ${selectedComment.organizationName || "N/A"}

Other Perspectives speaking to the same topic ("${selectedComment.topic}") but saying different things:
${relatedList.slice(0, 15).map((c, i) => `[Perspective ${i+1}] Sentiment: ${c.sentiment.toUpperCase()} | Group: ${c.organizationName || "N/A"}\nText: "${c.text}"`).join("\n---\n")}

Please write a gorgeous, highly precise, professional viewpoint synthesis in clean Markdown format:
1. **Core Topic Arena**: Identify the central system, feature, or policy being debated.
2. **Juxtaposition of Views**: Outline how positive, neutral, and negative stakeholders view this topic differently. Highlight specific conflicts, use-cases, or environments.
3. **Areas of Convergence & Divergence**: Highlight where there is agreement, and identify the main pain points driving the tension.
4. **Actionable Recommendations**: Provide 2-3 concrete strategic recommendations for product or engineering teams to reconcile these differing views.`;

    try {
      let coreText = "";
      if (llmSettings.baseUrl && llmSettings.useCustomEmbedding) {
        coreText = await fetchLocalCompletion(structuredPrompt, llmSettings);
      } else {
        // Fallback to beautiful local heuristic
        await new Promise(resolve => setTimeout(resolve, 1000));
        coreText = generateLocalHeuristicPerspectiveSynthesis(selectedComment, relatedList);
      }

      const fullReportMarkdown = `${prependedStakeholderList}\n\n---\n\n${coreText}\n\n---\n\n${appendedCsvTraceabilityRows}`;

      setSynthesisResult(fullReportMarkdown);

      // Save to global history if callback provided
      if (onSaveSynthesisToHistory) {
        onSaveSynthesisToHistory({
          title: `Comparative Perspective: "${selectedComment.topic}"`,
          markdown: fullReportMarkdown,
          source: "perspective"
        });
      }
    } catch (e) {
      console.error(e);
      // Fallback
      const fallbackCore = generateLocalHeuristicPerspectiveSynthesis(selectedComment, relatedList);
      const fallbackReport = `${prependedStakeholderList}\n\n---\n\n${fallbackCore}\n\n---\n\n${appendedCsvTraceabilityRows}`;
      setSynthesisResult(fallbackReport);
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start h-full" id="comments_list_tab">
      
      {/* LEFT COLUMN: Master List (lg:col-span-5) */}
      <div className="lg:col-span-5 bg-white border border-[#E5E3DF] p-6 flex flex-col h-full min-h-[600px] lg:max-h-[850px] rounded-none">
        <div className="flex items-center gap-2 mb-4">
          <ListFilter className="w-4 h-4 text-[#1A1A1A]" />
          <h3 className="font-serif italic text-lg text-[#1A1A1A]">Stakeholder Comments List</h3>
        </div>

        {/* Filters Panel */}
        <div className="space-y-3 mb-5 pb-5 border-b border-[#E5E3DF]">
          {/* Search text query */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search comments by text, ID, or topic..."
              className="w-full pl-8 pr-3 py-2 bg-[#F9F8F6] border border-[#E5E3DF] rounded-none text-xs focus:outline-none focus:border-[#1A1A1A] placeholder-gray-400"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-[#1A1A1A]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {/* Sentiment dropdown */}
            <div>
              <select
                value={selectedSentiment}
                onChange={(e) => setSelectedSentiment(e.target.value)}
                className="w-full bg-white border border-[#E5E3DF] rounded-none px-1.5 py-1.5 focus:outline-none focus:border-[#1A1A1A] text-[9px] uppercase tracking-wider font-semibold text-gray-600 truncate"
              >
                <option value="">Sentiment</option>
                <option value="positive">Positive</option>
                <option value="neutral">Neutral</option>
                <option value="negative">Negative</option>
              </select>
            </div>

            {/* Topic dropdown */}
            <div>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="w-full bg-white border border-[#E5E3DF] rounded-none px-1.5 py-1.5 focus:outline-none focus:border-[#1A1A1A] text-[9px] uppercase tracking-wider font-semibold text-gray-600 truncate"
              >
                <option value="">Topic</option>
                {availableTopics.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Org dropdown */}
            <div>
              <select
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
                className="w-full bg-white border border-[#E5E3DF] rounded-none px-1.5 py-1.5 focus:outline-none focus:border-[#1A1A1A] text-[9px] uppercase tracking-wider font-semibold text-gray-600 truncate"
              >
                <option value="">Organization</option>
                {availableOrgs.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {/* Proposed Response Status dropdown */}
            <div>
              <select
                value={responseFilter}
                onChange={(e) => setResponseFilter(e.target.value as any)}
                className="w-full bg-white border border-[#E5E3DF] rounded-none px-1.5 py-1.5 focus:outline-none focus:border-[#1A1A1A] text-[9px] uppercase tracking-wider font-semibold text-amber-900 font-mono truncate"
              >
                <option value="all">Response: All</option>
                <option value="flagged">💬 Proposed Only</option>
                <option value="unflagged">No Response Yet</option>
              </select>
            </div>
          </div>
        </div>

        {/* Comments Scrollable Container */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 max-h-[480px]">
          {filteredCommentsList.length > 0 ? (
            filteredCommentsList.map((c) => {
              const isSelected = activeSelectedId === c.id;
              const hasResponse = c.proposedResponse && c.proposedResponse.trim().length > 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveSelectedId(c.id)}
                  className={`w-full p-3 text-left border transition-all duration-150 flex flex-col rounded-none ${
                    isSelected 
                      ? "bg-[#1A1A1A] border-[#1A1A1A] text-white" 
                      : "bg-[#F9F8F6]/40 hover:bg-[#F9F8F6]/90 border-[#E5E3DF]"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1.5 gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[9px] uppercase font-mono tracking-widest font-semibold px-1.5 py-0.5 ${
                        isSelected ? "bg-white/10 text-white" : "bg-gray-100 text-gray-500"
                      }`}>
                        Row {c.csvRowIndex || "N/A"}
                      </span>
                      {hasResponse && (
                        <span className={`text-[8px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 border flex items-center gap-1 ${
                          isSelected
                            ? "bg-amber-400 text-black border-amber-300"
                            : "bg-amber-100 text-amber-900 border-amber-300"
                        }`}>
                          💬 Proposed Response
                        </span>
                      )}
                    </div>

                    <span className={`text-[9px] uppercase font-bold tracking-wider rounded-none px-2 py-0.5 ${
                      c.sentiment === "positive" 
                        ? (isSelected ? "bg-[#4A6741]/40 text-green-300" : "bg-[#4A6741]/10 text-[#4A6741]") 
                        : c.sentiment === "negative"
                        ? (isSelected ? "bg-[#A13D2D]/40 text-red-300" : "bg-[#A13D2D]/10 text-[#A13D2D]")
                        : (isSelected ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600")
                    }`}>
                      {c.sentiment}
                    </span>
                  </div>

                  <p className={`text-xs leading-relaxed font-sans line-clamp-3 mb-2 ${
                    isSelected ? "text-gray-200" : "text-gray-700"
                  }`}>
                    {c.text}
                  </p>

                  <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] pt-1.5 border-t ${
                    isSelected ? "border-white/10 text-gray-400" : "border-[#E5E3DF] text-gray-500"
                  }`}>
                    <span className="flex items-center gap-1 font-semibold">
                      <MessageSquare className="w-3 h-3 opacity-70" />
                      {c.topic || "General"}
                    </span>
                    {c.documentReference && (
                      <span className={`flex items-center gap-1 font-mono text-[9px] ${isSelected ? "text-amber-300" : "text-amber-800 bg-amber-50 px-1 py-0.5 border border-amber-200"}`}>
                        <FileText className="w-3 h-3" />
                        {c.documentReference}
                      </span>
                    )}
                    {c.organizationName && (
                      <OrganizationBadge
                        organizationName={c.organizationName}
                        mapping={stakeholderMappings[c.organizationName]}
                        onClick={onOpenStakeholderModal}
                      />
                    )}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center py-12 text-center border border-dashed border-[#E5E3DF] p-6">
              <AlertTriangle className="w-6 h-6 text-gray-300 mb-2" />
              <p className="text-xs font-semibold text-gray-500">No active comments match the filters.</p>
              <button 
                onClick={() => {
                  setSearchQuery("");
                  setSelectedSentiment("");
                  setSelectedTopic("");
                  setSelectedOrg("");
                }}
                className="mt-3 text-[10px] uppercase tracking-wider text-gray-600 underline font-bold cursor-pointer hover:text-[#1A1A1A]"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Footer Stats summary */}
        <div className="mt-4 pt-4 border-t border-[#E5E3DF] flex items-center justify-between text-[10px] font-mono text-gray-400">
          <span>SHOWING {filteredCommentsList.length} OF {comments.filter(c => !c.isArchived && c.id !== "user_query_node").length} ACTIVE FEEDBACK NODES</span>
        </div>
      </div>

      {/* RIGHT COLUMN: Comparative Perspective Center (lg:col-span-7) */}
      <div className="lg:col-span-7 space-y-6">
        
        {/* Selected Comment card details */}
        {selectedComment ? (
          <div className="bg-white border border-[#E5E3DF] p-6 rounded-none space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E3DF] pb-3">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-gray-400 block mb-0.5">Primary Node of Interest</span>
                <h4 className="font-serif italic text-base text-[#1A1A1A]">Comment Detail Info</h4>
              </div>
              <button 
                onClick={() => setActiveSelectedId(null)}
                className="text-gray-400 hover:text-[#1A1A1A] p-1 cursor-pointer"
                title="Deselect comment"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#F9F8F6] p-4 border-l-4 border-[#1A1A1A] space-y-2">
              <p className="text-sm text-[#1A1A1A] font-sans leading-relaxed italic">
                "{selectedComment.text}"
              </p>
              
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] pt-2 text-gray-500 font-sans">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <strong>ID:</strong> <code className="bg-[#E5E3DF] px-1 text-[10px]">{selectedComment.id}</code>
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                  <strong>Topic Cluster:</strong> {selectedComment.topic || "General"}
                </span>
                <div className="flex items-center gap-1.5">
                  <strong className="text-gray-700">Organization:</strong>
                  {selectedComment.organizationName ? (
                    <OrganizationBadge
                      organizationName={selectedComment.organizationName}
                      mapping={stakeholderMappings[selectedComment.organizationName]}
                      onClick={onOpenStakeholderModal}
                    />
                  ) : (
                    <span className="text-gray-400 italic">*(No Organization Data)*</span>
                  )}
                </div>
                <span className="flex items-center gap-1">
                  <ThumbsUp className="w-3.5 h-3.5 text-gray-400" />
                  <strong>Focal Sentiment:</strong> 
                  <span className={`capitalize ml-1 font-semibold ${
                    selectedComment.sentiment === "positive" ? "text-[#4A6741]" : selectedComment.sentiment === "negative" ? "text-[#A13D2D]" : "text-gray-600"
                  }`}>{selectedComment.sentiment}</span>
                </span>
              </div>
            </div>

            {/* Proposed Official Response Section */}
            <div className="border border-amber-200 bg-amber-50/50 p-4 space-y-3 rounded-none">
              <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-900 font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-1.5">
                    💬 Proposed Response
                  </span>
                  {selectedComment.proposedResponse && (
                    <span className="bg-amber-200/80 text-amber-900 text-[9px] font-mono font-bold px-1.5 py-0.5">
                      Flagged
                    </span>
                  )}
                </div>

                {!isEditingProposedResponse && selectedComment.proposedResponse && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedComment.proposedResponse || "");
                        alert("Proposed response copied!");
                      }}
                      className="px-2 py-1 bg-white border border-amber-300 hover:border-amber-500 text-amber-900 text-[9px] font-mono uppercase font-bold cursor-pointer"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => setIsEditingProposedResponse(true)}
                      className="px-2 py-1 bg-white border border-amber-300 hover:border-amber-500 text-amber-900 text-[9px] font-mono uppercase font-bold cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleRemoveProposedResponse}
                      className="px-2 py-1 bg-white border border-red-200 text-red-700 hover:bg-red-50 text-[9px] font-mono uppercase font-bold cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {isEditingProposedResponse ? (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-900">Author Role:</label>
                      <input
                        type="text"
                        value={proposedResponseRole}
                        onChange={(e) => setProposedResponseRole(e.target.value)}
                        placeholder="e.g. Policy Analyst, CX Team"
                        className="bg-white border border-amber-300 px-2 py-1 text-xs text-amber-950 font-mono focus:outline-none focus:border-amber-600"
                      />
                    </div>

                    <button
                      onClick={handleDraftAIResponse}
                      disabled={isDraftingAIResponse}
                      className="px-3 py-1 bg-amber-900 hover:bg-amber-950 text-amber-100 text-[9px] font-mono uppercase font-bold tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${isDraftingAIResponse ? "animate-spin" : ""}`} />
                      <span>{isDraftingAIResponse ? "Drafting Response..." : "✨ AI Draft Response"}</span>
                    </button>
                  </div>

                  <textarea
                    value={proposedResponseText}
                    onChange={(e) => setProposedResponseText(e.target.value)}
                    placeholder="Type or auto-generate a proposed official response to this feedback comment..."
                    className="w-full bg-white border border-amber-300 p-3 text-xs text-amber-950 font-sans focus:outline-none focus:border-amber-600 min-h-[90px] leading-relaxed resize-y"
                  />

                  <div className="flex justify-end gap-2">
                    {selectedComment.proposedResponse && (
                      <button
                        onClick={() => {
                          setProposedResponseText(selectedComment.proposedResponse || "");
                          setIsEditingProposedResponse(false);
                        }}
                        className="px-3 py-1.5 text-[10px] font-mono uppercase text-gray-600 hover:underline cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={handleSaveProposedResponse}
                      className="px-4 py-1.5 bg-[#1A1A1A] hover:bg-black text-white text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer shadow-xs"
                    >
                      Save Proposed Response
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs text-amber-950 font-sans leading-relaxed italic bg-white p-3 border border-amber-200">
                    "{selectedComment.proposedResponse}"
                  </p>
                  <div className="flex items-center justify-between text-[9px] font-mono text-amber-800 px-1">
                    <span>Drafted by: <strong>{selectedComment.proposedResponseBy || "Policy Analyst"}</strong></span>
                    {selectedComment.proposedResponseAt && <span>Updated: {selectedComment.proposedResponseAt}</span>}
                  </div>
                </div>
              )}
            </div>

            {!hasMappedPerspectives && (
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleMapPerspectives}
                  disabled={isAnalyzing}
                  className="w-full sm:w-auto bg-[#1A1A1A] hover:bg-[#333333] text-white px-5 py-2.5 rounded-none text-xs uppercase tracking-widest font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Mapping Topic Neighbors...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      <span>Map Topic Perspectives ({similarTopicComments.length} Neighbors)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-[#E5E3DF] p-12 rounded-none text-center h-[200px] flex flex-col items-center justify-center">
            <MessageSquare className="w-8 h-8 text-gray-300 mb-3" />
            <h4 className="font-serif italic text-base text-[#1A1A1A] mb-1">Perspective Arena Offline</h4>
            <p className="text-xs text-gray-400 max-w-sm">
              Select any stakeholder feedback comment from the list on the left to map other perspectives speaking to the same topic.
            </p>
          </div>
        )}

        {/* PERSPECTIVES JUXTAPOSITION BOARD */}
        {selectedComment && hasMappedPerspectives && (
          <div className="space-y-6">
            
            {/* Perspective board summary block */}
            <div className="bg-white border border-[#E5E3DF] p-6 rounded-none space-y-4 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#E5E3DF] pb-4 gap-3">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-gray-400 block mb-0.5">Topic Perspectives Arena</span>
                  <h3 className="font-serif italic text-lg text-[#1A1A1A]">
                    Stakeholder Contrast Board: "{selectedComment.topic}"
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Found **{similarTopicComments.length} other comments** speaking to the exact same topic but offering diverse perspectives.
                  </p>
                </div>

                <button
                  onClick={handleSynthesizePerspectives}
                  disabled={isSynthesizing}
                  className="bg-[#4A6741] hover:bg-[#3D5535] text-white px-4 py-2.5 rounded-none text-[10px] uppercase tracking-widest font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isSynthesizing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Synthesizing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                      <span>Synthesize Perspectives</span>
                    </>
                  )}
                </button>
              </div>

              {/* THREE COLUMN GRID OF SENTIMENTS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* COLUMN 1: POSITIVE VIEWPOINTS */}
                <div className="border border-[#E5E3DF] p-4 bg-[#F9F8F6]/10 flex flex-col h-[320px]">
                  <div className="flex items-center gap-1.5 border-b border-[#E5E3DF] pb-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-[#4A6741]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">Positive views ({perspectives.positive.length})</h4>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                    {perspectives.positive.length > 0 ? (
                      perspectives.positive.map((p, idx) => (
                        <div key={p.id} className="p-2.5 bg-white border border-[#E5E3DF] text-gray-600 text-[11px] leading-relaxed relative hover:border-[#1A1A1A] transition-colors">
                          <p className="italic">"{p.text}"</p>
                          <div className="mt-1.5 text-[9px] text-gray-400 flex items-center justify-between font-mono">
                            <span>Row {p.csvRowIndex || "?"}</span>
                            <span>{p.organizationName || "Unknown Org"}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 italic text-center py-8">No opposing positive views on this topic.</p>
                    )}
                  </div>
                </div>

                {/* COLUMN 2: NEUTRAL VIEWPOINTS */}
                <div className="border border-[#E5E3DF] p-4 bg-[#F9F8F6]/10 flex flex-col h-[320px]">
                  <div className="flex items-center gap-1.5 border-b border-[#E5E3DF] pb-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">Neutral views ({perspectives.neutral.length})</h4>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                    {perspectives.neutral.length > 0 ? (
                      perspectives.neutral.map((n, idx) => (
                        <div key={n.id} className="p-2.5 bg-white border border-[#E5E3DF] text-gray-600 text-[11px] leading-relaxed relative hover:border-[#1A1A1A] transition-colors">
                          <p className="italic">"{n.text}"</p>
                          <div className="mt-1.5 text-[9px] text-gray-400 flex items-center justify-between font-mono">
                            <span>Row {n.csvRowIndex || "?"}</span>
                            <span>{n.organizationName || "Unknown Org"}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 italic text-center py-8">No opposing neutral views on this topic.</p>
                    )}
                  </div>
                </div>

                {/* COLUMN 3: NEGATIVE VIEWPOINTS */}
                <div className="border border-[#E5E3DF] p-4 bg-[#F9F8F6]/10 flex flex-col h-[320px]">
                  <div className="flex items-center gap-1.5 border-b border-[#E5E3DF] pb-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-[#A13D2D]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">Negative views ({perspectives.negative.length})</h4>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                    {perspectives.negative.length > 0 ? (
                      perspectives.negative.map((n, idx) => (
                        <div key={n.id} className="p-2.5 bg-white border border-[#E5E3DF] text-gray-600 text-[11px] leading-relaxed relative hover:border-[#1A1A1A] transition-colors">
                          <p className="italic">"{n.text}"</p>
                          <div className="mt-1.5 text-[9px] text-gray-400 flex items-center justify-between font-mono">
                            <span>Row {n.csvRowIndex || "?"}</span>
                            <span>{n.organizationName || "Unknown Org"}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 italic text-center py-8">No opposing negative views on this topic.</p>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* SYNTHESIS DETAILS REPORT */}
            {synthesisResult && (
              <div className="bg-white border border-[#E5E3DF] p-6 rounded-none space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
                <div className="flex items-center justify-between border-b border-[#E5E3DF] pb-3 mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#4A6741]" />
                    <h4 className="font-serif italic text-base text-[#1A1A1A]">AI Perspective Contrast Synthesis</h4>
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-[#4A6741] font-bold">REPORT GENERATED</span>
                </div>

                <div className="markdown-body text-xs max-h-[400px] overflow-y-auto pr-1">
                  <MarkdownViewer markdown={synthesisResult} />
                </div>
              </div>
            )}

          </div>
        )}

      </div>
      
    </div>
  );
};
