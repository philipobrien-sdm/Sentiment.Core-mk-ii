import React, { useState, useMemo } from "react";
import { 
  CommentItem, 
  LlmSettings, 
  StakeholderMapping, 
  getQuadrantInfo, 
  WhatIfReport 
} from "../types";
import { 
  Building2, 
  Search, 
  Sparkles, 
  HelpCircle, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Zap, 
  Target, 
  Users, 
  Loader2, 
  ChevronRight, 
  FileText, 
  Send, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpDown,
  BookOpen,
  MessageSquare,
  X
} from "lucide-react";
import { OrganizationBadge } from "./OrganizationBadge";
import { fetchLocalCompletion, generateLocalHeuristicOrganizationReport } from "../utils/localLlm";
import { SavedSynthesis } from "./SynthesisModal";

interface OrganizationStakeholderViewProps {
  comments: CommentItem[];
  llmSettings: LlmSettings;
  stakeholderMappings: Record<string, StakeholderMapping>;
  onOpenStakeholderModal: (orgName?: string) => void;
  onUpdateComment: (updated: CommentItem) => void;
  onSaveSynthesisToHistory: (synth: { title: string; markdown: string; source: string }) => void;
  onPerformStakeholderMetaReview?: () => void;
  onOpenSynthesisHub?: () => void;
  onOpenWhatIfModal?: (contextType: "cluster" | "executive" | "synthesis_meta" | "custom_cluster_batch", targetCluster?: string) => void;
  whatIfReports?: WhatIfReport[];
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
}

export const OrganizationStakeholderView: React.FC<OrganizationStakeholderViewProps> = ({
  comments,
  llmSettings,
  stakeholderMappings,
  onOpenStakeholderModal,
  onUpdateComment,
  onSaveSynthesisToHistory,
  onPerformStakeholderMetaReview,
  onOpenSynthesisHub,
  onOpenWhatIfModal,
  whatIfReports = [],
  showToast
}) => {
  // Filter out archived comments
  const activeComments = useMemo(() => comments.filter(c => !c.isArchived), [comments]);

  // Group comments by Organization Name
  const organizationGroups = useMemo(() => {
    const groupsMap = new Map<string, CommentItem[]>();

    activeComments.forEach(c => {
      let orgName = c.organizationName?.trim() || 
                    c.originalRowData?.["Organization"]?.trim() || 
                    c.originalRowData?.["Org"]?.trim() || 
                    c.originalRowData?.["Organization Name"]?.trim();

      if (!orgName || orgName === "") {
        orgName = "General Public / Unspecified";
      }

      if (!groupsMap.has(orgName)) {
        groupsMap.set(orgName, []);
      }
      groupsMap.get(orgName)!.push(c);
    });

    const groupsList = Array.from(groupsMap.entries()).map(([orgName, orgComments]) => {
      const pos = orgComments.filter(c => c.sentiment === "positive").length;
      const neu = orgComments.filter(c => c.sentiment === "neutral").length;
      const neg = orgComments.filter(c => c.sentiment === "negative").length;
      const mapping = stakeholderMappings[orgName];
      const quadrantInfo = getQuadrantInfo(mapping?.influence ?? 3, mapping?.interest ?? 3);

      return {
        orgName,
        comments: orgComments,
        posCount: pos,
        neuCount: neu,
        negCount: neg,
        total: orgComments.length,
        mapping,
        quadrantInfo
      };
    });

    return groupsList;
  }, [activeComments, stakeholderMappings]);

  // Search & Filter state
  const [orgSearchQuery, setOrgSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"count" | "name" | "negative" | "priority">("count");
  const [selectedOrgName, setSelectedOrgName] = useState<string>("");

  // Sorted & Filtered Organizations list
  const filteredOrganizations = useMemo(() => {
    let list = organizationGroups.filter(g => 
      g.orgName.toLowerCase().includes(orgSearchQuery.toLowerCase()) ||
      g.comments.some(c => c.text.toLowerCase().includes(orgSearchQuery.toLowerCase()))
    );

    list.sort((a, b) => {
      if (sortBy === "count") return b.total - a.total;
      if (sortBy === "name") return a.orgName.localeCompare(b.orgName);
      if (sortBy === "negative") return b.negCount - a.negCount;
      if (sortBy === "priority") return b.quadrantInfo.priorityWeight - a.quadrantInfo.priorityWeight;
      return 0;
    });

    return list;
  }, [organizationGroups, orgSearchQuery, sortBy]);

  // Set default selected organization if not set
  React.useEffect(() => {
    if ((!selectedOrgName || !organizationGroups.some(g => g.orgName === selectedOrgName)) && filteredOrganizations.length > 0) {
      setSelectedOrgName(filteredOrganizations[0].orgName);
    }
  }, [filteredOrganizations, selectedOrgName, organizationGroups]);

  const selectedGroup = useMemo(() => {
    return organizationGroups.find(g => g.orgName === selectedOrgName) || filteredOrganizations[0];
  }, [organizationGroups, selectedOrgName, filteredOrganizations]);

  // Specific Comment Filter inside Selected Organization
  const [commentFilterText, setCommentFilterText] = useState<string>("");
  const [commentSentimentFilter, setCommentSentimentFilter] = useState<"all" | "positive" | "neutral" | "negative">("all");

  const filteredOrgComments = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.comments.filter(c => {
      const matchesSearch = c.text.toLowerCase().includes(commentFilterText.toLowerCase()) ||
                            (c.topic && c.topic.toLowerCase().includes(commentFilterText.toLowerCase())) ||
                            (c.documentReference && c.documentReference.toLowerCase().includes(commentFilterText.toLowerCase()));
      const matchesSentiment = commentSentimentFilter === "all" || c.sentiment === commentSentimentFilter;
      return matchesSearch && matchesSentiment;
    });
  }, [selectedGroup, commentFilterText, commentSentimentFilter]);

  // AI Report Generation state
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [generatedReportMarkdown, setGeneratedReportMarkdown] = useState<string | null>(null);

  // Draft proposed response editing state
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null);
  const [responseDraft, setResponseDraft] = useState<string>("");
  const [isDraftingAiResponse, setIsDraftingAiResponse] = useState<string | null>(null);

  // Batch Processing State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [batchSelectedOrgs, setBatchSelectedOrgs] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<number>(0);
  const [batchCurrentOrg, setBatchCurrentOrg] = useState<string>("");
  const [batchCompletedCount, setBatchCompletedCount] = useState<number>(0);

  // Initialize selected batch orgs when batch modal opens
  const handleOpenBatchModal = () => {
    const allNames = new Set(organizationGroups.map(g => g.orgName));
    setBatchSelectedOrgs(allNames);
    setBatchProgress(0);
    setBatchCompletedCount(0);
    setIsBatchModalOpen(true);
  };

  const toggleSelectAllBatchOrgs = () => {
    if (batchSelectedOrgs.size === organizationGroups.length) {
      setBatchSelectedOrgs(new Set());
    } else {
      setBatchSelectedOrgs(new Set(organizationGroups.map(g => g.orgName)));
    }
  };

  const selectKeyPlayersBatchOrgs = () => {
    const keyPlayers = organizationGroups
      .filter(g => g.quadrantInfo.label.toLowerCase().includes("key player") || g.quadrantInfo.label.toLowerCase().includes("keep satisfied"))
      .map(g => g.orgName);
    setBatchSelectedOrgs(new Set(keyPlayers));
  };

  const toggleBatchOrgSelection = (orgName: string) => {
    setBatchSelectedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(orgName)) {
        next.delete(orgName);
      } else {
        next.add(orgName);
      }
      return next;
    });
  };

  // Run Batch Processing
  const handleStartBatchProcessing = async () => {
    const orgsToProcess = organizationGroups.filter(g => batchSelectedOrgs.has(g.orgName));
    if (orgsToProcess.length === 0) {
      if (showToast) showToast("No organizations selected for batch synthesis.", "error");
      return;
    }

    setIsBatchProcessing(true);
    setBatchProgress(0);
    setBatchCompletedCount(0);

    for (let i = 0; i < orgsToProcess.length; i++) {
      const group = orgsToProcess[i];
      const orgName = group.orgName;
      const orgComments = group.comments;
      const mapping = group.mapping;

      setBatchCurrentOrg(orgName);

      const prompt = `You are an expert policy strategist, executive negotiator, and stakeholder analyst reviewing public consultation comments.
Perform a thorough, rigorous strategic stakeholder analysis for the organization: "${orgName}".

DATASET SUMMARY:
- Total Comments Submitted: ${orgComments.length}
- Sentiment Breakdown: Positive (${group.posCount}), Neutral (${group.neuCount}), Negative (${group.negCount})
- Stakeholder Power-Interest Profile: Influence (${mapping?.influence ?? 3}/5), Interest (${mapping?.interest ?? 3}/5) - ${group.quadrantInfo.label}
${mapping?.bio ? `- Stakeholder Bio & Strategic Context: "${mapping.bio}"\n` : ""}${mapping?.redLines ? `- Red Lines & Non-Negotiables: "${mapping.redLines}"\n` : ""}${mapping?.expectations ? `- Key Expectations: "${mapping.expectations}"\n` : ""}${mapping?.notes ? `- Strategic Notes: "${mapping.notes}"` : ""}

ORGANIZATION COMMENTS EXCERPTS:
${orgComments.map((c, idx) => `[Comment ${idx + 1} | ID: ${c.id} | Sentiment: ${c.sentiment.toUpperCase()}${c.documentReference ? ` | Reference: ${c.documentReference}` : ""}]
Text: "${c.text}"
${c.proposedResponse ? `Draft Response: "${c.proposedResponse}"` : ""}
`).join("\n---\n")}

REQUIREMENTS & STRUCTURED OUTPUT:
Generate a detailed Markdown Strategic Stakeholder Intelligence Report structured with these EXACT headers:

# 🏛️ STAKEHOLDER INTELLIGENCE REPORT: "${orgName}"
> **EXECUTIVE STAKEHOLDER SCOPE**: ${orgComments.length} feedback contributions analyzed for implicit drivers, non-negotiable constraints, and leverage points.

## 1. Executive Feedback & Sentiment Profile
## 2. Explicit & Inferable Expectations
## 3. Underlying Motivations & Strategic Priorities
## 4. Red Lines (Non-Negotiable Constraints & Dealbreakers)
## 5. Leverage Points & Engagement Drivers
## 6. Recommended Action Plan & Countermeasures
## 7. Audit Traceability Matrix`;

      let markdownResult = "";
      try {
        if (llmSettings.baseUrl && llmSettings.baseUrl.trim().length > 0) {
          markdownResult = await fetchLocalCompletion(prompt, llmSettings);
        } else {
          markdownResult = generateLocalHeuristicOrganizationReport(orgName, orgComments, mapping);
        }
      } catch (err) {
        markdownResult = generateLocalHeuristicOrganizationReport(orgName, orgComments, mapping);
      }

      // Save report with clear source tag for stakeholder reports
      onSaveSynthesisToHistory({
        title: `Stakeholder Intelligence: ${orgName}`,
        markdown: markdownResult,
        source: "organization"
      });

      setBatchCompletedCount(i + 1);
      setBatchProgress(Math.round(((i + 1) / orgsToProcess.length) * 100));
    }

    setIsBatchProcessing(false);
    if (showToast) {
      showToast(`Batch processing complete! Synthesized ${orgsToProcess.length} organization reports.`, "success");
    }
  };

  // Generate Strategic Stakeholder Intelligence Report
  const handleGenerateOrganizationReport = async () => {
    if (!selectedGroup) return;
    setIsGeneratingReport(true);
    setGeneratedReportMarkdown(null);

    const orgName = selectedGroup.orgName;
    const orgComments = selectedGroup.comments;
    const mapping = selectedGroup.mapping;

    // Build prompt for AI
    const prompt = `You are an expert policy strategist, executive negotiator, and stakeholder analyst reviewing public consultation comments.
Perform a thorough, rigorous strategic stakeholder analysis for the organization: "${orgName}".

DATASET SUMMARY:
- Total Comments Submitted: ${orgComments.length}
- Sentiment Breakdown: Positive (${selectedGroup.posCount}), Neutral (${selectedGroup.neuCount}), Negative (${selectedGroup.negCount})
- Stakeholder Power-Interest Profile: Influence (${mapping?.influence ?? 3}/5), Interest (${mapping?.interest ?? 3}/5) - ${selectedGroup.quadrantInfo.label}
${mapping?.bio ? `- Stakeholder Bio & Strategic Context: "${mapping.bio}"\n` : ""}${mapping?.redLines ? `- Red Lines & Non-Negotiables: "${mapping.redLines}"\n` : ""}${mapping?.expectations ? `- Key Expectations: "${mapping.expectations}"\n` : ""}${mapping?.notes ? `- Strategic Notes: "${mapping.notes}"` : ""}

ORGANIZATION COMMENTS EXCERPTS:
${orgComments.map((c, i) => `[Comment ${i + 1} | ID: ${c.id} | Sentiment: ${c.sentiment.toUpperCase()}${c.documentReference ? ` | Reference: ${c.documentReference}` : ""}]
Text: "${c.text}"
${c.proposedResponse ? `Draft Response: "${c.proposedResponse}"` : ""}
`).join("\n---\n")}

REQUIREMENTS & STRUCTURED OUTPUT:
Generate a detailed Markdown Strategic Stakeholder Intelligence Report structured with these EXACT headers:

# 🏛️ STAKEHOLDER INTELLIGENCE REPORT: "${orgName}"
> **EXECUTIVE STAKEHOLDER SCOPE**: ${orgComments.length} feedback contributions analyzed for implicit drivers, non-negotiable constraints, and leverage points.

## 1. Executive Feedback & Sentiment Profile
- Summarize the core tone, engagement depth, and primary topics raised by ${orgName}.

## 2. Explicit & Inferable Expectations
- What does ${orgName} explicitly demand or implicitly expect from the project, policy, or team?
- Differentiate between immediate technical demands and broader governance expectations.

## 3. Underlying Motivations & Strategic Priorities
- What underlying motivations (financial, operational stability, risk mitigation, reputational standing, regulatory compliance, competitive advantage) drive ${orgName}'s feedback?

## 4. Red Lines (Non-Negotiable Constraints & Dealbreakers)
- Identify non-negotiables, dealbreakers, or potential areas of fierce opposition where ${orgName} is unlikely to compromise.

## 5. Leverage Points & Engagement Drivers
- What incentives, concessions, early consultative arrangements, or technical adjustments can be offered to align ${orgName}?
- Where does the project team have leverage over ${orgName}'s positions?

## 6. Recommended Action Plan & Countermeasures
- Actionable steps for executive leadership and policy team to negotiate, satisfy, or manage ${orgName}.

## 7. Audit Traceability Matrix
- Concise table mapping comment IDs to cited references and primary takeaway.`;

    try {
      let markdownResult = "";
      if (llmSettings.baseUrl && llmSettings.baseUrl.trim().length > 0) {
        markdownResult = await fetchLocalCompletion(prompt, llmSettings);
      } else {
        // Fallback heuristic report
        markdownResult = generateLocalHeuristicOrganizationReport(orgName, orgComments, mapping);
      }

      setGeneratedReportMarkdown(markdownResult);

      // Save to Synthesis History
      onSaveSynthesisToHistory({
        title: `Stakeholder Intelligence: ${orgName}`,
        markdown: markdownResult,
        source: `Organization: ${orgName}`
      });

      if (showToast) {
        showToast(`Strategic report generated and saved for ${orgName}!`, "success");
      }
    } catch (err) {
      console.error("Failed to generate organization report:", err);
      // Fallback
      const fallback = generateLocalHeuristicOrganizationReport(orgName, orgComments, mapping);
      setGeneratedReportMarkdown(fallback);
      onSaveSynthesisToHistory({
        title: `Stakeholder Intelligence: ${orgName}`,
        markdown: fallback,
        source: `Organization: ${orgName}`
      });
      if (showToast) {
        showToast(`Generated heuristic stakeholder report for ${orgName}.`, "info");
      }
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Auto-draft proposed AI response for a single comment
  const handleAutoDraftResponse = async (comment: CommentItem) => {
    setIsDraftingAiResponse(comment.id);
    const prompt = `Draft a polite, authoritative, and constructive official policy response on behalf of the project review board to the following comment from organization "${comment.organizationName || selectedGroup?.orgName || "Stakeholder"}":

Comment Text: "${comment.text}"
Topic: "${comment.topic || "General"}"
Sentiment: ${comment.sentiment}
${comment.documentReference ? `Document Reference: ${comment.documentReference}` : ""}

Ensure the draft addresses their specific concerns directly, indicates planned actions or explanations, and maintains professional accountability. Keep under 150 words.`;

    try {
      let draftText = "";
      if (llmSettings.baseUrl && llmSettings.baseUrl.trim().length > 0) {
        draftText = await fetchLocalCompletion(prompt, llmSettings);
      } else {
        draftText = `Thank you for your feedback regarding ${comment.topic || "this initiative"}. The review board has logged your comments from ${comment.organizationName || "your organization"}. We are actively addressing these observations in our ongoing policy refinements and will provide updated documentation in the upcoming release.`;
      }

      const updated = {
        ...comment,
        proposedResponse: draftText.trim(),
        proposedResponseBy: "AI Assistant",
        proposedResponseAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString()
      };

      onUpdateComment(updated);
      setEditingResponseId(comment.id);
      setResponseDraft(draftText.trim());

      if (showToast) {
        showToast("Proposed response drafted successfully!", "success");
      }
    } catch (e) {
      if (showToast) showToast("Failed to draft AI response.", "error");
    } finally {
      setIsDraftingAiResponse(null);
    }
  };

  // Export organization comments to CSV
  const handleExportOrgCSV = () => {
    if (!selectedGroup) return;
    const headers = ["Comment ID", "Organization", "Text", "Sentiment", "Topic", "Document Reference", "Proposed Response"];
    const rows = selectedGroup.comments.map(c => [
      `"${c.id}"`,
      `"${(c.organizationName || selectedGroup.orgName).replace(/"/g, '""')}"`,
      `"${c.text.replace(/"/g, '""')}"`,
      `"${c.sentiment}"`,
      `"${(c.topic || "").replace(/"/g, '""')}"`,
      `"${(c.documentReference || "").replace(/"/g, '""')}"`,
      `"${(c.proposedResponse || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `stakeholder_${selectedGroup.orgName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_comments.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (showToast) {
      showToast(`Exported ${selectedGroup.comments.length} comments for ${selectedGroup.orgName} to CSV.`, "success");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Overview Header Banner */}
      <div className="bg-[#1A1A1A] text-white p-6 border-l-4 border-amber-500 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-extrabold uppercase tracking-wider text-white">
                Organizations & Stakeholder Intelligence
              </h2>
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-mono px-2 py-0.5 font-bold">
                {organizationGroups.length} Organizations Grouped
              </span>
            </div>
            <p className="text-xs text-gray-300 max-w-3xl leading-relaxed">
              Analyze public consultation submissions grouped by organization. Evaluate stakeholder power-interest dynamics, infer core motivations, identify dealbreaker red lines, and uncover strategic leverage points.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleOpenBatchModal}
              className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Batch process stakeholder intelligence reports for multiple organizations simultaneously"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Batch Process Positions</span>
            </button>

            {onPerformStakeholderMetaReview && (
              <button
                onClick={onPerformStakeholderMetaReview}
                className="px-3.5 py-2 bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs border border-amber-500"
                title="Generate an Executive Summary of Stakeholder Positions across all saved organization reports"
              >
                <Sparkles className="w-4 h-4 text-amber-200" />
                <span>Executive Summary of Positions</span>
              </button>
            )}

            <button
              onClick={() => onOpenStakeholderModal()}
              className="px-3.5 py-2 bg-amber-900/60 hover:bg-amber-900 text-amber-100 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs border border-amber-800"
              title="Open Stakeholder Power vs Interest Quadrant Matrix"
            >
              <Users className="w-4 h-4 text-amber-300" />
              <span>Stakeholder Matrix</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Organizations Selector & Stats Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Search & Sort Controls */}
          <div className="bg-white p-4 border border-[#E5E3DF] space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#1A1A1A] flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-gray-400" /> Search Stakeholders
              </label>
              <span className="text-[10px] text-gray-400 font-mono">
                {filteredOrganizations.length} shown
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Filter by org name or comment text..."
                value={orgSearchQuery}
                onChange={(e) => setOrgSearchQuery(e.target.value)}
                className="w-full bg-[#F9F8F6] border border-[#E5E3DF] pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-[#1A1A1A]"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="text-[9px] font-mono uppercase text-gray-400 font-bold">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="flex-1 bg-[#F9F8F6] border border-[#E5E3DF] px-2 py-1 text-[11px] font-semibold text-[#1A1A1A] focus:outline-none cursor-pointer"
              >
                <option value="count">Most Comments First</option>
                <option value="priority">Priority Power Quadrant</option>
                <option value="negative">Highest Negative Concerns</option>
                <option value="name">Alphabetical (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Organizations List */}
          <div className="bg-white border border-[#E5E3DF] max-h-[640px] overflow-y-auto divide-y divide-[#E5E3DF]">
            {filteredOrganizations.length === 0 ? (
              <div className="p-8 text-center text-gray-400 space-y-2">
                <Building2 className="w-8 h-8 mx-auto text-gray-300" />
                <p className="text-xs font-bold uppercase tracking-wider">No matching organizations found</p>
                <p className="text-[10px]">Try clearing search parameters or upload dataset with organization metadata.</p>
              </div>
            ) : (
              filteredOrganizations.map((group) => {
                const isSelected = group.orgName === selectedOrgName;
                const posPct = group.total > 0 ? Math.round((group.posCount / group.total) * 100) : 0;
                const negPct = group.total > 0 ? Math.round((group.negCount / group.total) * 100) : 0;

                return (
                  <button
                    key={group.orgName}
                    onClick={() => setSelectedOrgName(group.orgName)}
                    className={`w-full p-3.5 text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                      isSelected
                        ? "bg-[#1A1A1A] text-white border-l-4 border-amber-400"
                        : "hover:bg-[#F9F8F6] text-[#1A1A1A]"
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs truncate leading-snug">
                          {group.orgName}
                        </span>
                      </div>

                      {/* Power Quadrant Tag */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 font-bold uppercase ${
                          isSelected ? "bg-white/10 text-amber-300 border border-white/20" : `${group.quadrantInfo.bgColor} ${group.quadrantInfo.color}`
                        }`}>
                          {group.quadrantInfo.icon} {group.quadrantInfo.shortLabel}
                        </span>

                        <span className={`text-[9px] font-mono ${isSelected ? "text-gray-300" : "text-gray-500"}`}>
                          {group.total} comment{group.total === 1 ? "" : "s"}
                        </span>
                      </div>

                      {/* Sentiment Distribution Bar */}
                      <div className="w-full h-1.5 bg-gray-200 flex overflow-hidden rounded-none mt-1">
                        <div style={{ width: `${posPct}%` }} className="bg-emerald-500" title={`Positive: ${group.posCount}`} />
                        <div style={{ width: `${100 - posPct - negPct}%` }} className="bg-amber-400" title={`Neutral: ${group.neuCount}`} />
                        <div style={{ width: `${negPct}%` }} className="bg-rose-500" title={`Negative: ${group.negCount}`} />
                      </div>
                    </div>

                    <ChevronRight className={`w-4 h-4 shrink-0 mt-1 transition-transform ${isSelected ? "text-amber-400 translate-x-0.5" : "text-gray-300"}`} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Selected Organization Dashboard & AI Report (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {selectedGroup ? (
            <>
              {/* Selected Organization Header Card */}
              <div className="bg-white p-6 border border-[#E5E3DF] space-y-5 shadow-xs">
                
                {/* Org Title & Power Badging */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5E3DF]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-6 h-6 text-[#1A1A1A]" />
                      <h3 className="text-xl font-extrabold text-[#1A1A1A] tracking-tight">
                        {selectedGroup.orgName}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <OrganizationBadge
                        organizationName={selectedGroup.orgName}
                        mapping={selectedGroup.mapping}
                        onClick={() => onOpenStakeholderModal(selectedGroup.orgName)}
                      />
                      <span className="text-xs text-gray-500 font-mono">
                        ({selectedGroup.total} Total Feedback Submissions)
                      </span>
                    </div>
                  </div>

                  {/* Edit Mapping Trigger */}
                  <button
                    onClick={() => onOpenStakeholderModal(selectedGroup.orgName)}
                    className="px-3 py-1.5 border border-gray-300 hover:border-[#1A1A1A] hover:bg-[#F9F8F6] text-xs font-bold uppercase tracking-wider text-[#1A1A1A] cursor-pointer transition-all self-start sm:self-auto shrink-0"
                  >
                    Edit Stakeholder Power / Influence
                  </button>
                </div>

                {/* Sentiment & Metrics Breakdown Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-[#F9F8F6] p-3 border border-[#E5E3DF]">
                    <span className="text-[9px] font-mono uppercase text-gray-500 font-bold block">Total Feedback</span>
                    <span className="text-xl font-extrabold text-[#1A1A1A] font-mono">{selectedGroup.total}</span>
                  </div>

                  <div className="bg-emerald-50/60 p-3 border border-emerald-200">
                    <span className="text-[9px] font-mono uppercase text-emerald-800 font-bold block">Positive</span>
                    <span className="text-xl font-extrabold text-emerald-900 font-mono">{selectedGroup.posCount}</span>
                  </div>

                  <div className="bg-amber-50/60 p-3 border border-amber-200">
                    <span className="text-[9px] font-mono uppercase text-amber-800 font-bold block">Neutral</span>
                    <span className="text-xl font-extrabold text-amber-900 font-mono">{selectedGroup.neuCount}</span>
                  </div>

                  <div className="bg-rose-50/60 p-3 border border-rose-200">
                    <span className="text-[9px] font-mono uppercase text-rose-800 font-bold block">Negative</span>
                    <span className="text-xl font-extrabold text-rose-900 font-mono">{selectedGroup.negCount}</span>
                  </div>
                </div>

                {/* Strategic AI Action Toolbar */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    onClick={handleGenerateOrganizationReport}
                    disabled={isGeneratingReport}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                    title="Generate AI intelligence report covering Expectations, Motivations, Red Lines, and Leverage Points"
                  >
                    {isGeneratingReport ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-amber-200" />
                        <span>Analyzing Stakeholder Drivers...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-200" />
                        <span>Generate Strategic Stakeholder Intelligence Report</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      if (onOpenWhatIfModal) {
                        onOpenWhatIfModal("cluster", selectedGroup.orgName);
                      }
                    }}
                    className="px-3.5 py-2 bg-[#1A1A1A] hover:bg-black text-amber-300 border border-amber-500/40 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Simulate hypothetical what-if scenario for this organization"
                  >
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    <span>What-If Scenario</span>
                  </button>

                  <button
                    onClick={handleExportOrgCSV}
                    className="px-3.5 py-2 border border-gray-300 hover:border-[#1A1A1A] hover:bg-[#F9F8F6] text-xs font-bold uppercase tracking-wider text-[#1A1A1A] flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Export organization comments to CSV"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Generated AI Intelligence Report Display Area */}
              {generatedReportMarkdown && (
                <div className="bg-white border-2 border-amber-500/80 p-6 space-y-4 shadow-md animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-amber-200 pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-600" />
                      <h4 className="text-sm font-extrabold uppercase tracking-wider text-[#1A1A1A]">
                        Strategic Intelligence Report: {selectedGroup.orgName}
                      </h4>
                    </div>

                    <button
                      onClick={() => {
                        onSaveSynthesisToHistory({
                          title: `Stakeholder Intelligence: ${selectedGroup.orgName}`,
                          markdown: generatedReportMarkdown,
                          source: `Organization: ${selectedGroup.orgName}`
                        });
                        if (showToast) showToast("Saved report to Synthesis Hub!", "success");
                      }}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      Save to Synthesis Hub
                    </button>
                  </div>

                  <div className="prose prose-sm max-w-none text-[#1A1A1A] font-sans leading-relaxed bg-[#F9F8F6] p-5 border border-[#E5E3DF] overflow-x-auto">
                    <pre className="whitespace-pre-wrap font-sans text-xs text-[#1A1A1A] leading-relaxed">
                      {generatedReportMarkdown}
                    </pre>
                  </div>
                </div>
              )}

              {/* Comments List Section for Selected Organization */}
              <div className="bg-white p-6 border border-[#E5E3DF] space-y-4">
                
                {/* Search & Filter Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E3DF]">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#1A1A1A]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">
                      Submissions from {selectedGroup.orgName} ({filteredOrgComments.length} items)
                    </h4>
                  </div>

                  {/* Sentiment Filter Tabs */}
                  <div className="flex items-center gap-1 bg-[#F9F8F6] p-1 border border-[#E5E3DF]">
                    {(["all", "positive", "neutral", "negative"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setCommentSentimentFilter(s)}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                          commentSentimentFilter === s
                            ? "bg-[#1A1A1A] text-white"
                            : "text-gray-600 hover:text-[#1A1A1A]"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filter Text Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search within this organization's feedback..."
                    value={commentFilterText}
                    onChange={(e) => setCommentFilterText(e.target.value)}
                    className="w-full bg-[#F9F8F6] border border-[#E5E3DF] pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-[#1A1A1A]"
                  />
                </div>

                {/* Comments List */}
                <div className="space-y-4 pt-2">
                  {filteredOrgComments.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 py-6">
                      No comments match the search parameters.
                    </p>
                  ) : (
                    filteredOrgComments.map((comment, idx) => {
                      const isEditingResponse = editingResponseId === comment.id;

                      return (
                        <div 
                          key={comment.id}
                          className="bg-[#F9F8F6] p-4 border border-[#E5E3DF] space-y-3 relative hover:border-[#1A1A1A] transition-all"
                        >
                          {/* Top Meta Line */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 border border-[#E5E3DF]">
                                #{idx + 1} | {comment.id}
                              </span>

                              <span className={`text-[10px] font-mono px-2 py-0.5 font-bold uppercase ${
                                comment.sentiment === "positive" 
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                  : comment.sentiment === "negative"
                                  ? "bg-rose-100 text-rose-800 border border-rose-300"
                                  : "bg-amber-100 text-amber-800 border border-amber-300"
                              }`}>
                                {comment.sentiment}
                              </span>

                              {comment.topic && (
                                <span className="text-[10px] font-mono bg-gray-200 text-gray-800 px-2 py-0.5 font-semibold">
                                  {comment.topic}
                                </span>
                              )}
                            </div>

                            {comment.documentReference && (
                              <span className="text-[10px] font-mono text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 font-bold flex items-center gap-1">
                                <BookOpen className="w-3 h-3 text-amber-600" />
                                {comment.documentReference}
                              </span>
                            )}
                          </div>

                          {/* Comment Body */}
                          <p className="text-xs text-[#1A1A1A] leading-relaxed font-serif italic">
                            "{comment.text}"
                          </p>

                          {/* Proposed Response Section */}
                          <div className="pt-2 border-t border-[#E5E3DF] space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold uppercase text-amber-900 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-amber-600" /> Proposed Executive Response:
                              </span>

                              {!isEditingResponse && (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleAutoDraftResponse(comment)}
                                    disabled={isDraftingAiResponse === comment.id}
                                    className="text-[10px] font-mono font-bold text-amber-700 hover:text-amber-900 hover:underline flex items-center gap-1 cursor-pointer"
                                  >
                                    {isDraftingAiResponse === comment.id ? (
                                      <>
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Drafting...
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles className="w-3 h-3" />
                                        {comment.proposedResponse ? "Re-draft with AI" : "Auto-Draft with AI"}
                                      </>
                                    )}
                                  </button>

                                  <button
                                    onClick={() => {
                                      setEditingResponseId(comment.id);
                                      setResponseDraft(comment.proposedResponse || "");
                                    }}
                                    className="text-[10px] font-mono font-bold text-gray-600 hover:text-[#1A1A1A] hover:underline cursor-pointer"
                                  >
                                    {comment.proposedResponse ? "Edit Draft" : "+ Add Draft"}
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Response content or editor */}
                            {isEditingResponse ? (
                              <div className="space-y-2">
                                <textarea
                                  value={responseDraft}
                                  onChange={(e) => setResponseDraft(e.target.value)}
                                  placeholder="Type official draft response..."
                                  rows={3}
                                  className="w-full p-2.5 bg-white border border-amber-400 text-xs text-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => setEditingResponseId(null)}
                                    className="px-2.5 py-1 bg-white border border-gray-300 text-[10px] font-bold uppercase text-gray-700 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => {
                                      const updated = {
                                        ...comment,
                                        proposedResponse: responseDraft.trim(),
                                        proposedResponseBy: "Policy Analyst",
                                        proposedResponseAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString()
                                      };
                                      onUpdateComment(updated);
                                      setEditingResponseId(null);
                                      if (showToast) showToast("Proposed response updated!", "success");
                                    }}
                                    className="px-3 py-1 bg-[#1A1A1A] text-white text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                                  >
                                    Save Response
                                  </button>
                                </div>
                              </div>
                            ) : comment.proposedResponse ? (
                              <div className="bg-amber-50/70 p-3 border border-amber-200 text-xs text-[#1A1A1A] leading-relaxed">
                                <p className="font-sans font-medium text-[#1A1A1A]">
                                  {comment.proposedResponse}
                                </p>
                                {comment.proposedResponseBy && (
                                  <span className="text-[9px] font-mono text-amber-800 block mt-1.5 pt-1 border-t border-amber-200/60">
                                    Drafted by {comment.proposedResponseBy} {comment.proposedResponseAt ? `at ${comment.proposedResponseAt}` : ""}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-[10px] text-gray-400 italic">
                                No proposed response drafted yet for this submission.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white p-12 border border-[#E5E3DF] text-center space-y-3">
              <Building2 className="w-10 h-10 mx-auto text-gray-300" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#1A1A1A]">
                Select an Organization to View Intelligence
              </h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Choose an organization from the left sidebar to inspect stakeholder feedback, perform strategic AI driver analysis, and draft response actions.
              </p>
            </div>
          )}

        </div>

      </div>

      {/* Batch Organization Synthesis Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white border border-[#E5E3DF] shadow-2xl w-full max-w-2xl flex flex-col rounded-none overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="bg-[#1A1A1A] text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Zap className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-serif italic text-base leading-none">Batch Processing of Organization Positions</h3>
                  <p className="text-[9px] text-gray-400 uppercase tracking-widest font-mono mt-1">Automated Multi-Stakeholder Position Synthesis</p>
                </div>
              </div>
              {!isBatchProcessing && (
                <button 
                  onClick={() => setIsBatchModalOpen(false)}
                  className="p-1 hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {isBatchProcessing ? (
                <div className="py-8 space-y-6 text-center">
                  <div className="space-y-2">
                    <Loader2 className="w-10 h-10 text-amber-500 animate-spin mx-auto" />
                    <h4 className="text-sm font-bold uppercase tracking-wider text-[#1A1A1A]">
                      Synthesizing Stakeholder Positions ({batchCompletedCount} of {batchSelectedOrgs.size})
                    </h4>
                    <p className="text-xs text-amber-800 font-mono font-semibold">
                      Currently processing: <span className="underline">{batchCurrentOrg}</span>
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 h-3 overflow-hidden border border-gray-300">
                    <div 
                      className="bg-amber-600 h-full transition-all duration-300"
                      style={{ width: `${batchProgress}%` }}
                    />
                  </div>

                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-mono">
                    Generating explicit demands, red lines, motivations &amp; leverage points...
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Select which organizations to analyze in batch. The system will sequentially generate a Strategic Stakeholder Intelligence Report for each selected group and store it directly in the Synthesis Hub under the Stakeholder area.
                    </p>
                    
                    {/* Filter preset shortcuts */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        onClick={toggleSelectAllBatchOrgs}
                        className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider font-bold border border-gray-300 hover:border-[#1A1A1A] hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        {batchSelectedOrgs.size === organizationGroups.length ? "Deselect All" : "Select All"}
                      </button>

                      <button
                        onClick={selectKeyPlayersBatchOrgs}
                        className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
                      >
                        Select Key Players &amp; High Priority Only
                      </button>
                    </div>
                  </div>

                  {/* Organizations checklist */}
                  <div className="border border-[#E5E3DF] max-h-60 overflow-y-auto divide-y divide-[#E5E3DF] bg-[#F9F8F6]">
                    {organizationGroups.map((g) => {
                      const isChecked = batchSelectedOrgs.has(g.orgName);
                      return (
                        <label
                          key={g.orgName}
                          className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                            isChecked ? "bg-white" : "hover:bg-gray-100/60"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleBatchOrgSelection(g.orgName)}
                              className="w-4 h-4 text-amber-600 rounded-none border-gray-300 focus:ring-amber-500 cursor-pointer"
                            />
                            <div>
                              <p className="text-xs font-bold text-[#1A1A1A]">{g.orgName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] text-gray-400 font-mono">
                                  {g.total} comment{g.total !== 1 ? "s" : ""}
                                </span>
                                <span className="text-[9px] font-mono font-semibold text-amber-800 bg-amber-50 px-1 border border-amber-200">
                                  {g.quadrantInfo.label}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold">
                            <span className="text-emerald-700 bg-emerald-50 px-1">+{g.posCount}</span>
                            <span className="text-gray-600 bg-gray-100 px-1">~{g.neuCount}</span>
                            <span className="text-[#A13D2D] bg-red-50 px-1">-{g.negCount}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-[#F9F8F6] px-6 py-4 border-t border-[#E5E3DF] flex flex-wrap items-center justify-between gap-3 shrink-0">
              {!isBatchProcessing ? (
                <>
                  <span className="text-[10px] font-mono text-gray-500 font-bold">
                    {batchSelectedOrgs.size} of {organizationGroups.length} Organizations Selected
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsBatchModalOpen(false)}
                      className="px-3.5 py-2 border border-gray-300 hover:bg-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-700 cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      onClick={handleStartBatchProcessing}
                      disabled={batchSelectedOrgs.size === 0}
                      className="px-4 py-2 bg-[#1A1A1A] hover:bg-black text-amber-300 font-mono text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Start Batch Synthesis ({batchSelectedOrgs.size})</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="w-full flex items-center justify-between">
                  <span className="text-[10px] font-mono text-amber-800 font-bold animate-pulse">
                    Processing batch in background...
                  </span>
                  {onOpenSynthesisHub && (
                    <button
                      onClick={() => {
                        setIsBatchModalOpen(false);
                        onOpenSynthesisHub();
                      }}
                      className="px-3 py-1.5 bg-amber-600 text-white text-[10px] font-mono uppercase font-bold"
                    >
                      Open Synthesis Hub
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
