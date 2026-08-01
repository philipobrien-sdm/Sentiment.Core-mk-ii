import React, { useState, useMemo } from "react";
import { 
  X, Sparkles, HelpCircle, Copy, Download, Trash2, Calendar, 
  Layers, FileText, Check, Loader2, ArrowRight, AlertTriangle, Lightbulb, RefreshCw
} from "lucide-react";
import { CommentItem, LlmSettings, StakeholderMapping, WhatIfReport } from "../types";
import { SavedSynthesis } from "./SynthesisModal";
import { MarkdownViewer } from "./MarkdownViewer";
import { fetchLocalCompletion, generateLocalHeuristicWhatIfReport } from "../utils/localLlm";
import { buildDocumentContextPromptBlock } from "../utils/documentContext";
import { buildStakeholderListMarkdown, buildCsvTraceabilityRowsMarkdown } from "./CommentsList";

interface WhatIfScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContextType?: "cluster" | "executive" | "synthesis_meta" | "custom_cluster_batch";
  initialTargetCluster?: string;
  comments: CommentItem[];
  clusterGroups?: { topicName: string; comments: any[] }[];
  synthesisHistory?: SavedSynthesis[];
  llmSettings: LlmSettings;
  stakeholderMappings?: Record<string, StakeholderMapping>;
  whatIfReports: WhatIfReport[];
  onSaveWhatIfReport: (report: WhatIfReport) => void;
  onDeleteWhatIfReport: (id: string) => void;
  onClearWhatIfReports: () => void;
  showToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

const PRESET_SCENARIOS = [
  "What if project budget is reduced by 30%?",
  "What if implementation timeline is delayed by 12 months?",
  "What if public transit fares / product pricing are made completely free?",
  "What if compliance, safety, and auditing standards are doubled?",
  "What if all unresolved software bugs / complaints are fixed in sprint 1?",
  "What if all drafted proposed official responses are adopted as binding policy?"
];

export const WhatIfScenarioModal: React.FC<WhatIfScenarioModalProps> = ({
  isOpen,
  onClose,
  initialContextType = "executive",
  initialTargetCluster = "",
  comments,
  clusterGroups = [],
  synthesisHistory = [],
  llmSettings,
  stakeholderMappings = {},
  whatIfReports,
  onSaveWhatIfReport,
  onDeleteWhatIfReport,
  onClearWhatIfReports,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<"evaluate" | "sandbox">("evaluate");
  const [contextType, setContextType] = useState<"cluster" | "executive" | "synthesis_meta" | "custom_cluster_batch">(initialContextType);
  
  // Derive available topic clusters if clusterGroups prop is empty
  const availableClusters = useMemo(() => {
    if (clusterGroups && clusterGroups.length > 0) {
      return clusterGroups;
    }
    // Extract unique topics from comments dataset
    const map = new Map<string, CommentItem[]>();
    comments.filter(c => !c.isArchived).forEach(c => {
      const t = c.topic?.trim() || c.preAssignedTopic?.trim();
      if (
        t && 
        t !== "" && 
        t !== "Unassigned" && 
        t !== "Unassigned / General" && 
        t !== "Unassigned / Low Confidence" && 
        t !== "General Feedback"
      ) {
        if (!map.has(t)) map.set(t, []);
        map.get(t)!.push(c);
      }
    });

    if (map.size === 0) {
      // Fallback: group by preAssignedTopic if present
      comments.filter(c => !c.isArchived).forEach(c => {
        const t = c.preAssignedTopic?.trim() || "General Feedback";
        if (!map.has(t)) map.set(t, []);
        map.get(t)!.push(c);
      });
    }

    return Array.from(map.entries()).map(([topicName, groupComments]) => ({
      topicName,
      comments: groupComments
    }));
  }, [clusterGroups, comments]);

  const [selectedCluster, setSelectedCluster] = useState<string>(initialTargetCluster || (availableClusters[0]?.topicName || ""));
  const [scenarioPrompt, setScenarioPrompt] = useState<string>("");
  const [scenarioTitle, setScenarioTitle] = useState<string>("");
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [activeReport, setActiveReport] = useState<WhatIfReport | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Sync state if initial props change on modal open
  React.useEffect(() => {
    if (isOpen) {
      setContextType(initialContextType);
      if (initialTargetCluster) {
        setSelectedCluster(initialTargetCluster);
      } else if (availableClusters.length > 0) {
        setSelectedCluster(availableClusters[0].topicName);
      }
    }
  }, [isOpen, initialContextType, initialTargetCluster, availableClusters]);

  if (!isOpen) return null;

  // Selected comments set based on chosen scope context
  const activeCommentsForContext = () => {
    const unarchived = comments.filter(c => !c.isArchived);
    if (contextType === "cluster" && selectedCluster) {
      const group = availableClusters.find(g => g.topicName === selectedCluster);
      return group ? group.comments : unarchived;
    }
    return unarchived;
  };

  const handleSelectPreset = (presetText: string) => {
    setScenarioPrompt(presetText);
    setScenarioTitle(presetText.replace(/^What if\s+/i, "If "));
  };

  const handleRunEvaluation = async () => {
    const promptText = scenarioPrompt.trim();
    if (!promptText) {
      showToast("Please enter or select a 'What If' scenario hypothesis.", "error");
      return;
    }

    setIsEvaluating(true);
    const targetComments = activeCommentsForContext();
    const docContextBlock = buildDocumentContextPromptBlock(targetComments);
    const stakeholderBlock = buildStakeholderListMarkdown(targetComments, stakeholderMappings);
    const traceabilityBlock = buildCsvTraceabilityRowsMarkdown(targetComments);

    const titleToUse = scenarioTitle.trim() || promptText.slice(0, 60);

    let evaluatedMarkdown = "";

    try {
      if (contextType === "synthesis_meta" && synthesisHistory.length > 0) {
        // Meta-synthesis What-If across prior synthesis reports
        const metaContext = synthesisHistory.map((h, i) => `[Report ${i+1}] Title: "${h.title}" (Source: ${h.source})\nMarkdown Excerpt:\n${h.markdown.slice(0, 500)}...`).join("\n---\n");

        const fullPrompt = `You are a Principal Strategic Analyst conducting a hypothetical "WHAT IF" scenario simulation.
EVALUATE THIS HYPOTHETICAL SCENARIO ACROSS ALL PRIOR SYNTHESIS REPORTS:
Hypothesis Scenario: "${promptText}"

PRIOR SYNTHESIS REPORTS AUDITED IN APP HISTORY:
${metaContext}

TASK & DIRECTIVES:
1. ASSUME THE "WHAT IF" HYPOTHESIS IS 100% TRUE AND FULLY ENACTED.
2. Perform a comprehensive, high-level evaluation analyzing how this scenario changes prior report conclusions, stakeholder sentiment trends, organizational risk, and strategic recommendations.
3. Contrast the hypothetical future against prior baseline reports.

Format as structured, professional Markdown with these exact sections:
# ⚡ HYPOTHETICAL WHAT-IF META EVALUATION: "${titleToUse}"
> **SCENARIO HYPOTHESIS**: *"${promptText}"*
> **DATA ISOLATION NOTICE**: *This hypothetical simulation is stored in your isolated What-If Sandbox and does NOT alter standard dataset reports.*

## 1. Executive Scenario Meta Impact
## 2. Shift in Cross-Report Stakeholder Sentiment
## 3. Organizational Risk & New Unintended Friction
## 4. Adjusted Multi-Cluster Strategic Recommendations
## 5. Audit Traceability across Historical Syntheses`;

        evaluatedMarkdown = await fetchLocalCompletion(fullPrompt, llmSettings);

      } else {
        // Cluster or Executive What-If evaluation on feedback comments
        const sentimentCounts = {
          pos: targetComments.filter(c => c.sentiment === "positive").length,
          neu: targetComments.filter(c => c.sentiment === "neutral").length,
          neg: targetComments.filter(c => c.sentiment === "negative").length,
        };

        const fullPrompt = `You are a Senior Customer Experience & Strategic Scenario Analyst.
Perform a deep, comprehensive "WHAT IF" scenario evaluation for stakeholder feedback.

EVALUATE THIS HYPOTHETICAL SCENARIO:
Hypothesis / Condition: "${promptText}"

EVALUATION SCOPE:
- Scope Context: ${contextType === "cluster" ? `Custom Topic Cluster "${selectedCluster}"` : "Full Feedback Dataset Executive Evaluation"}
- Total Feedback Comments Evaluated: ${targetComments.length}
- Baseline Sentiment Breakdown: ${sentimentCounts.pos} Positive, ${sentimentCounts.neu} Neutral, ${sentimentCounts.neg} Negative
${docContextBlock}
${stakeholderBlock}

REPRESENTATIVE STAKEHOLDER COMMENTS:
${targetComments.slice(0, 25).map((c, i) => `[Comment ${i+1}] ID: ${c.originalId || c.id} (Org: "${c.organizationName || "General Public"}", Sentiment: "${c.sentiment.toUpperCase()}"${c.documentReference ? `, Ref: "${c.documentReference}"` : ""}): "${c.text}"`).join("\n")}
${targetComments.length > 25 ? `...and ${targetComments.length - 25} additional feedback records.` : ""}

DIRECTIVES:
1. ASSUME THE "WHAT IF" ACTION/EVENT/QUALIFIER IS 100% TRUE AND ACCURATE.
2. Perform the EXACT same high-level, rigorous evaluation as a standard executive synthesis report, but calculated under the assumption that this hypothesis is reality.
3. Analyze predicted sentiment shifts, organizational reactions from key players, new opportunities, new risk factors, and required strategic countermeasures.

Format as clean, elegant Markdown:
# ⚡ HYPOTHETICAL WHAT-IF EVALUATION: "${titleToUse}"
> **SCENARIO HYPOTHESIS**: *"${promptText}"*
> **DATA ISOLATION NOTICE**: *This hypothetical evaluation is generated for scenario planning. It is stored separately in your What-If Sandbox and does NOT alter the core dataset or standard summary reports.*

## 1. Executive Scenario Impact Overview
## 2. Predicted Stakeholder Sentiment Shift & Reactions
## 3. Affected Organizations & Strategic Nuances
## 4. Emerging Opportunities & New Operational Risk Factors
## 5. Adjusted Strategic Action Plan & Mitigations
## 6. Traceability to Affected Feedback Excerpts`;

        evaluatedMarkdown = await fetchLocalCompletion(fullPrompt, llmSettings);
      }
    } catch (err: any) {
      console.warn("LLM What-If evaluation failed, using heuristic fallback:", err);
      evaluatedMarkdown = generateLocalHeuristicWhatIfReport(
        titleToUse,
        promptText,
        contextType,
        targetComments,
        contextType === "cluster" ? selectedCluster : undefined
      );
    }

    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString();

    const newReport: WhatIfReport = {
      id: "whatif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      scenarioTitle: titleToUse,
      hypothesisText: promptText,
      contextType,
      targetClusterName: contextType === "cluster" ? selectedCluster : undefined,
      markdown: evaluatedMarkdown,
      timestamp: timestampStr,
      commentCount: targetComments.length
    };

    onSaveWhatIfReport(newReport);
    setActiveReport(newReport);
    setIsEvaluating(false);
    showToast(`What-If Scenario Evaluation complete: "${titleToUse}"!`, "success");
  };

  const handleCopy = () => {
    if (!activeReport) return;
    navigator.clipboard.writeText(activeReport.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!activeReport) return;
    const blob = new Blob([activeReport.markdown], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `what_if_scenario_${activeReport.scenarioTitle.toLowerCase().replace(/[^a-z0-9]/g, "_")}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-[#E5E3DF] shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col rounded-none overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-[#1A1A1A] text-white px-6 py-4 flex items-center justify-between shrink-0 border-b border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif italic text-lg leading-none">What-If Scenario Evaluator &amp; Sandbox</h2>
                <span className="text-[9px] bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 uppercase tracking-widest font-mono font-bold">
                  Hypothetical Sandbox
                </span>
              </div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-mono mt-1">
                Isolated Curiosity Simulator • Evaluates Scenarios without Modifying Core Dataset or Standard Reports
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-[#F9F8F6] border-b border-[#E5E3DF] px-6 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("evaluate")}
              className={`px-4 py-2 text-xs uppercase tracking-wider font-bold transition-all flex items-center gap-2 cursor-pointer border-b-2 -mb-[9px] ${
                activeTab === "evaluate"
                  ? "border-amber-600 text-amber-900 bg-white shadow-xs"
                  : "border-transparent text-gray-500 hover:text-[#1A1A1A]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Simulate Scenario</span>
            </button>

            <button
              onClick={() => setActiveTab("sandbox")}
              className={`px-4 py-2 text-xs uppercase tracking-wider font-bold transition-all flex items-center gap-2 cursor-pointer border-b-2 -mb-[9px] ${
                activeTab === "sandbox"
                  ? "border-amber-600 text-amber-900 bg-white shadow-xs"
                  : "border-transparent text-gray-500 hover:text-[#1A1A1A]"
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              <span>What-If Sandbox History ({whatIfReports.length})</span>
            </button>
          </div>

          <div className="text-[10px] font-mono font-bold uppercase text-gray-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Isolated from main summary reports</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-white">
          
          {activeTab === "evaluate" ? (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              
              {/* Left Column: Input Form & Controls */}
              <div className="w-full md:w-5/12 border-r border-[#E5E3DF] p-6 flex flex-col overflow-y-auto bg-[#F9F8F6]/30">
                <div className="space-y-5">
                  
                  {/* Context Scope Picker */}
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-gray-500 tracking-wider mb-2">
                      1. Select Evaluation Context Scope
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        onClick={() => setContextType("executive")}
                        className={`p-3 text-left border transition-all cursor-pointer flex items-center justify-between ${
                          contextType === "executive"
                            ? "border-amber-600 bg-amber-50/80 text-amber-950 font-bold shadow-xs"
                            : "border-[#E5E3DF] bg-white hover:border-gray-400 text-gray-700"
                        }`}
                      >
                        <div>
                          <div className="text-xs uppercase font-mono font-bold">Full Executive Dataset</div>
                          <div className="text-[10px] text-gray-500 font-normal">Evaluates scenario over all {comments.filter(c => !c.isArchived).length} active comments</div>
                        </div>
                        <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                      </button>

                      <button
                        onClick={() => setContextType("cluster")}
                        className={`p-3 text-left border transition-all cursor-pointer flex items-center justify-between ${
                          contextType === "cluster"
                            ? "border-amber-600 bg-amber-50/80 text-amber-950 font-bold shadow-xs"
                            : "border-[#E5E3DF] bg-white hover:border-gray-400 text-gray-700"
                        }`}
                      >
                        <div>
                          <div className="text-xs uppercase font-mono font-bold">Specific Custom Topic Cluster</div>
                          <div className="text-[10px] text-gray-500 font-normal">Target a single cluster for focused scenario evaluation</div>
                        </div>
                        <Layers className="w-4 h-4 text-amber-600 shrink-0" />
                      </button>

                      {contextType === "cluster" && (
                        <div className="pl-3 pt-1">
                          <select
                            value={selectedCluster}
                            onChange={(e) => setSelectedCluster(e.target.value)}
                            className="w-full border border-amber-300 bg-white p-2.5 text-xs font-bold text-[#1A1A1A] focus:outline-hidden cursor-pointer shadow-xs"
                          >
                            {availableClusters.length === 0 ? (
                              <option value="">No topic clusters available</option>
                            ) : (
                              availableClusters.map(g => (
                                <option key={g.topicName} value={g.topicName}>
                                  Cluster: "{g.topicName}" ({g.comments.length} comments)
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      )}

                      <button
                        onClick={() => setContextType("synthesis_meta")}
                        className={`p-3 text-left border transition-all cursor-pointer flex items-center justify-between ${
                          contextType === "synthesis_meta"
                            ? "border-amber-600 bg-amber-50/80 text-amber-950 font-bold shadow-xs"
                            : "border-[#E5E3DF] bg-white hover:border-gray-400 text-gray-700"
                        }`}
                      >
                        <div>
                          <div className="text-xs uppercase font-mono font-bold">Meta Analysis over Saved Reports</div>
                          <div className="text-[10px] text-gray-500 font-normal">Evaluates scenario against all {synthesisHistory.length} saved synthesis reports</div>
                        </div>
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      </button>
                    </div>
                  </div>

                  {/* Preset Quick Scenarios */}
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-gray-500 tracking-wider mb-2">
                      2. Quick Suggested Scenarios
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_SCENARIOS.map((preset, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSelectPreset(preset)}
                          className="text-[10px] bg-white hover:bg-amber-100 hover:text-amber-900 border border-[#E5E3DF] hover:border-amber-400 px-2.5 py-1.5 text-left font-sans text-gray-700 cursor-pointer transition-colors"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Scenario Text Input */}
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-gray-500 tracking-wider mb-1">
                      3. Custom "What If" Hypothesis
                    </label>
                    <textarea
                      value={scenarioPrompt}
                      onChange={(e) => {
                        setScenarioPrompt(e.target.value);
                        if (!scenarioTitle || scenarioTitle === scenarioPrompt.replace(/^What if\s+/i, "If ")) {
                          setScenarioTitle(e.target.value.replace(/^What if\s+/i, "If "));
                        }
                      }}
                      placeholder="e.g., What if line 2 construction is restricted to night hours, and public transit fares are reduced by 50%?"
                      rows={3}
                      className="w-full border border-[#E5E3DF] focus:border-amber-500 p-3 text-xs text-[#1A1A1A] bg-white focus:outline-hidden leading-relaxed shadow-xs"
                    />
                  </div>

                  {/* Scenario Title Label */}
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-gray-500 tracking-wider mb-1">
                      Report Title / Tag
                    </label>
                    <input
                      type="text"
                      value={scenarioTitle}
                      onChange={(e) => setScenarioTitle(e.target.value)}
                      placeholder="Title for report (e.g. Budget Cut 30% Impact)"
                      className="w-full border border-[#E5E3DF] focus:border-amber-500 px-3 py-2 text-xs font-bold text-[#1A1A1A] bg-white focus:outline-hidden"
                    />
                  </div>

                  {/* Evaluate Button */}
                  <button
                    onClick={handleRunEvaluation}
                    disabled={isEvaluating || !scenarioPrompt.trim()}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:text-gray-500 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                  >
                    {isEvaluating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-amber-200" />
                        <span>Evaluating Hypothesis...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-200" />
                        <span>Evaluate Scenario Report</span>
                      </>
                    )}
                  </button>

                  <div className="p-3 bg-amber-50 border border-amber-200 text-[10px] text-amber-900 leading-relaxed font-mono">
                    <strong>Rule Guarantee:</strong> What-If evaluations are stored in a dedicated sandbox. They will NEVER alter your original CSV comments or feed into standard summary reports unless you perform an explicit What-If meta synthesis.
                  </div>

                </div>
              </div>

              {/* Right Column: Active Generated What-If Report View */}
              <div className="flex-1 p-6 flex flex-col overflow-y-auto bg-white">
                {isEvaluating ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <Loader2 className="w-10 h-10 text-amber-600 animate-spin mb-4" />
                    <h3 className="font-serif italic text-lg text-[#1A1A1A]">Simulating Scenario Ripple Effects...</h3>
                    <p className="text-xs text-gray-500 max-w-md mt-2 leading-relaxed">
                      Assumptions: <em>"{scenarioPrompt}"</em>
                      <br />
                      Evaluating sentiment shifts, stakeholder power-interest movements, and strategic action plans.
                    </p>
                  </div>
                ) : activeReport ? (
                  <div className="flex-1 flex flex-col">
                    
                    {/* Report Header Bar */}
                    <div className="flex items-center justify-between border-b border-[#E5E3DF] pb-4 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 font-mono uppercase font-bold">
                            What-If Evaluation
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">{activeReport.timestamp}</span>
                        </div>
                        <h3 className="font-serif italic text-xl text-[#1A1A1A] mt-1">{activeReport.scenarioTitle}</h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopy}
                          className="px-3 py-1.5 border border-[#E5E3DF] hover:border-[#1A1A1A] hover:bg-[#F9F8F6] text-[10px] uppercase font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? "Copied" : "Copy MD"}</span>
                        </button>

                        <button
                          onClick={handleDownload}
                          className="px-3 py-1.5 border border-[#1A1A1A] hover:bg-[#F9F8F6] text-[10px] uppercase font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download MD</span>
                        </button>
                      </div>
                    </div>

                    {/* Report Render Frame */}
                    <div className="flex-1 overflow-y-auto p-6 bg-[#F9F8F6] border border-[#E5E3DF]">
                      <MarkdownViewer markdown={activeReport.markdown} />
                    </div>

                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <div className="w-12 h-12 border border-amber-300 bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                      <HelpCircle className="w-6 h-6" />
                    </div>
                    <h3 className="font-serif italic text-lg text-[#1A1A1A]">No What-If Scenario Evaluated Yet</h3>
                    <p className="text-xs text-gray-500 max-w-md mt-2 leading-relaxed">
                      Select or type a hypothesis on the left (e.g. <em>"What if project budget is reduced by 30%?"</em>) and click <strong>Evaluate Scenario Report</strong>.
                    </p>
                  </div>
                )}
              </div>

            </div>
          ) : (
            /* Sandbox History Tab */
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              
              {/* History List */}
              <div className="w-full md:w-5/12 border-r border-[#E5E3DF] p-6 flex flex-col overflow-y-auto bg-[#F9F8F6]/30">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif italic text-base text-[#1A1A1A]">What-If Sandbox Reports ({whatIfReports.length})</h3>
                  {whatIfReports.length > 0 && (
                    <button
                      onClick={onClearWhatIfReports}
                      className="text-[10px] text-red-600 hover:text-red-800 uppercase font-mono font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Clear History
                    </button>
                  )}
                </div>

                {whatIfReports.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-xs italic">
                    No hypothetical What-If reports saved in sandbox history.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {whatIfReports.map((report) => {
                      const isSelected = activeReport?.id === report.id;
                      return (
                        <div
                          key={report.id}
                          onClick={() => setActiveReport(report)}
                          className={`p-3 border text-left cursor-pointer transition-all ${
                            isSelected
                              ? "border-amber-600 bg-amber-50/90 text-amber-950 font-bold shadow-xs"
                              : "border-[#E5E3DF] bg-white hover:border-gray-400 text-gray-700"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] uppercase font-mono font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5">
                              {report.contextType === "cluster" ? `Cluster: ${report.targetClusterName}` : report.contextType === "executive" ? "Executive" : "Meta"}
                            </span>
                            <span className="text-[9px] font-mono text-gray-400">{report.timestamp}</span>
                          </div>
                          <h4 className="font-serif italic text-sm mt-1 text-[#1A1A1A]">{report.scenarioTitle}</h4>
                          <p className="text-[10px] text-gray-500 line-clamp-1 italic mt-0.5">"{report.hypothesisText}"</p>
                          
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200/60 text-[9px] font-mono text-gray-400">
                            <span>{report.commentCount} comments</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteWhatIfReport(report.id);
                                if (activeReport?.id === report.id) {
                                  setActiveReport(null);
                                }
                              }}
                              className="text-red-500 hover:text-red-700 p-0.5 cursor-pointer"
                              title="Delete What-If report"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* History Preview Frame */}
              <div className="flex-1 p-6 flex flex-col overflow-y-auto bg-white">
                {activeReport ? (
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center justify-between border-b border-[#E5E3DF] pb-4 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 font-mono uppercase font-bold">
                            What-If Sandbox Item
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">{activeReport.timestamp}</span>
                        </div>
                        <h3 className="font-serif italic text-xl text-[#1A1A1A] mt-1">{activeReport.scenarioTitle}</h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopy}
                          className="px-3 py-1.5 border border-[#E5E3DF] hover:border-[#1A1A1A] hover:bg-[#F9F8F6] text-[10px] uppercase font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? "Copied" : "Copy MD"}</span>
                        </button>

                        <button
                          onClick={handleDownload}
                          className="px-3 py-1.5 border border-[#1A1A1A] hover:bg-[#F9F8F6] text-[10px] uppercase font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download MD</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-[#F9F8F6] border border-[#E5E3DF]">
                      <MarkdownViewer markdown={activeReport.markdown} />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400">
                    <HelpCircle className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-xs">Select a What-If report from the sandbox list to inspect.</p>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
