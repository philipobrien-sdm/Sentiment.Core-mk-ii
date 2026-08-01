import React, { useState, useEffect, useMemo } from "react";
import { MarkdownViewer } from "./MarkdownViewer";
import { X, Calendar, Sparkles, Copy, Download, Trash2, Clock, Map, Layers, FileCheck2, Edit3, Check, Save, Eye, HelpCircle, Building2, FolderKanban } from "lucide-react";
import { WhatIfReport } from "../types";

export interface SavedSynthesis {
  id: string;
  title: string;
  markdown: string;
  timestamp: string;
  source: "map" | "cluster" | "meta" | "organization" | "stakeholder_meta" | string;
}

interface SynthesisModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSynthesis: SavedSynthesis | null;
  history: SavedSynthesis[];
  onSelectHistoryItem: (item: SavedSynthesis) => void;
  onDeleteHistoryItem: (id: string) => void;
  onClearHistory: () => void;
  onUpdateSynthesis?: (updated: SavedSynthesis) => void;
  onPerformMetaReview?: () => void;
  onPerformStakeholderMetaReview?: () => void;
  isSynthesizingMeta?: boolean;
  onOpenWhatIfModal?: (contextType?: "cluster" | "executive" | "synthesis_meta" | "custom_cluster_batch") => void;
  whatIfReports?: WhatIfReport[];
}

export const SynthesisModal: React.FC<SynthesisModalProps> = ({
  isOpen,
  onClose,
  activeSynthesis,
  history,
  onSelectHistoryItem,
  onDeleteHistoryItem,
  onClearHistory,
  onUpdateSynthesis,
  onPerformMetaReview,
  onPerformStakeholderMetaReview,
  isSynthesizingMeta = false,
  onOpenWhatIfModal,
  whatIfReports = []
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [editingMarkdown, setEditingMarkdown] = useState<string>("");
  const [editTab, setEditTab] = useState<"write" | "preview">("write");
  const [copied, setCopied] = useState<boolean>(false);

  // Tab state for history panel: "cluster" vs "stakeholder"
  const [historyTab, setHistoryTab] = useState<"cluster" | "stakeholder">("cluster");

  // Helper to test if item is stakeholder/organization report
  const isStakeholderReport = (item: SavedSynthesis) => {
    return (
      item.source === "organization" ||
      item.source === "stakeholder_meta" ||
      item.title.toLowerCase().includes("stakeholder intelligence") ||
      item.title.toLowerCase().includes("organization:") ||
      item.title.toLowerCase().includes("stakeholder positions")
    );
  };

  const clusterReports = useMemo(() => history.filter((item) => !isStakeholderReport(item)), [history]);
  const stakeholderReports = useMemo(() => history.filter((item) => isStakeholderReport(item)), [history]);

  // Auto-switch tab based on activeSynthesis when modal opens or item changes
  useEffect(() => {
    if (activeSynthesis) {
      if (isStakeholderReport(activeSynthesis)) {
        setHistoryTab("stakeholder");
      } else {
        setHistoryTab("cluster");
      }
    }
  }, [activeSynthesis?.id]);

  // Sync editing fields when active synthesis changes
  useEffect(() => {
    if (activeSynthesis) {
      setEditingTitle(activeSynthesis.title);
      setEditingMarkdown(activeSynthesis.markdown);
      setIsEditing(false);
    }
  }, [activeSynthesis?.id]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!activeSynthesis) return;
    const textToCopy = isEditing ? editingMarkdown : activeSynthesis.markdown;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!activeSynthesis) return;
    const content = isEditing ? editingMarkdown : activeSynthesis.markdown;
    const title = isEditing ? editingTitle : activeSynthesis.title;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}_synthesis.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveChanges = () => {
    if (!activeSynthesis || !onUpdateSynthesis) return;
    const updated: SavedSynthesis = {
      ...activeSynthesis,
      title: editingTitle.trim() || activeSynthesis.title,
      markdown: editingMarkdown,
      timestamp: `${activeSynthesis.timestamp} (Edited)`
    };
    onUpdateSynthesis(updated);
    setIsEditing(false);
  };

  const activeReportsList = historyTab === "cluster" ? clusterReports : stakeholderReports;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-[#E5E3DF] shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col rounded-none overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-[#1A1A1A] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-serif italic text-lg leading-none">LLM Critical Synthesis Hub</h2>
              <p className="text-[9px] text-gray-400 uppercase tracking-widest font-mono mt-1">Advanced Vector-Semantic Auditing &amp; Meta-Analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenWhatIfModal && (
              <button
                onClick={() => onOpenWhatIfModal("synthesis_meta")}
                className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-[10px] font-mono uppercase tracking-wider font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                title="Evaluate a hypothetical 'What-If' scenario across all saved synthesis reports"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber-300" />
                <span>What-If Meta Review</span>
              </button>
            )}

            {historyTab === "cluster" && clusterReports.length > 0 && onPerformMetaReview && (
              <button
                onClick={onPerformMetaReview}
                disabled={isSynthesizingMeta}
                className="px-3 py-1.5 bg-amber-900/80 hover:bg-amber-800 border border-amber-700 text-amber-100 text-[10px] font-mono uppercase tracking-wider font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                title="Perform a critical executive review across all topic and cluster reports"
              >
                <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${isSynthesizingMeta ? "animate-spin" : ""}`} />
                <span>{isSynthesizingMeta ? "Reviewing..." : "Executive Cluster Meta-Review"}</span>
              </button>
            )}

            {historyTab === "stakeholder" && stakeholderReports.length > 0 && onPerformStakeholderMetaReview && (
              <button
                onClick={onPerformStakeholderMetaReview}
                disabled={isSynthesizingMeta}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 border border-amber-400/60 text-white text-[10px] font-mono uppercase tracking-wider font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                title="Perform an executive summary of stakeholder positions across all organization reports"
              >
                <Building2 className={`w-3.5 h-3.5 text-amber-200 ${isSynthesizingMeta ? "animate-spin" : ""}`} />
                <span>{isSynthesizingMeta ? "Synthesizing..." : "Executive Summary of Stakeholder Positions"}</span>
              </button>
            )}

            <button 
              onClick={onClose}
              className="p-1 hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal body (Two-column layout) */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          
          {/* Left Panel: Saved Summaries History */}
          <div className="hidden md:flex w-80 bg-[#F9F8F6] border-r border-[#E5E3DF] flex-col shrink-0">
            
            {/* Separate Category Tabs */}
            <div className="bg-[#1A1A1A] p-1.5 grid grid-cols-2 gap-1 border-b border-[#E5E3DF] shrink-0">
              <button
                onClick={() => setHistoryTab("cluster")}
                className={`py-1.5 px-2 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  historyTab === "cluster"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-400/40"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <FolderKanban className="w-3.5 h-3.5" />
                <span>Clusters ({clusterReports.length})</span>
              </button>

              <button
                onClick={() => setHistoryTab("stakeholder")}
                className={`py-1.5 px-2 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  historyTab === "stakeholder"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-400/40"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Stakeholders ({stakeholderReports.length})</span>
              </button>
            </div>

            {/* Sidebar Header Actions */}
            <div className="p-3 border-b border-[#E5E3DF] space-y-2 shrink-0 bg-white">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400" /> 
                  {historyTab === "cluster" ? "Topic & Cluster Reports" : "Stakeholder Reports"}
                </span>
                {history.length > 0 && (
                  <button
                    onClick={onClearHistory}
                    className="text-[9px] font-mono uppercase text-[#A13D2D] hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {historyTab === "cluster" && clusterReports.length > 0 && onPerformMetaReview && (
                <button
                  onClick={onPerformMetaReview}
                  disabled={isSynthesizingMeta}
                  className="w-full py-2 px-3 bg-[#2D1B0D] hover:bg-[#3D2513] text-amber-200 border border-amber-800 text-[10px] font-mono uppercase tracking-wider font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  title="Perform a critical executive review across all topic and cluster reports"
                >
                  <FileCheck2 className={`w-3.5 h-3.5 text-amber-400 ${isSynthesizingMeta ? "animate-spin" : ""}`} />
                  <span>{isSynthesizingMeta ? "Synthesizing..." : "Executive Cluster Review"}</span>
                </button>
              )}

              {historyTab === "stakeholder" && stakeholderReports.length > 0 && onPerformStakeholderMetaReview && (
                <button
                  onClick={onPerformStakeholderMetaReview}
                  disabled={isSynthesizingMeta}
                  className="w-full py-2 px-3 bg-amber-700 hover:bg-amber-800 text-white border border-amber-500 text-[10px] font-mono uppercase tracking-wider font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  title="Perform an executive summary of stakeholder positions across all organization reports"
                >
                  <Building2 className={`w-3.5 h-3.5 text-amber-200 ${isSynthesizingMeta ? "animate-spin" : ""}`} />
                  <span>{isSynthesizingMeta ? "Synthesizing..." : "Executive Stakeholder Summary"}</span>
                </button>
              )}
            </div>

            {/* List of Reports in Active Tab */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {activeReportsList.length === 0 ? (
                <div className="text-center py-12 px-4 space-y-1">
                  <p className="text-xs font-semibold text-[#1A1A1A]/40 uppercase tracking-wider">
                    No {historyTab === "cluster" ? "cluster" : "stakeholder"} reports
                  </p>
                  <p className="text-[10px] text-gray-400 leading-normal">
                    {historyTab === "cluster"
                      ? "Your topic, search query, and deduplication cluster reports will accumulate here."
                      : "Your organization stakeholder intelligence reports and batch position syntheses will accumulate here."}
                  </p>
                </div>
              ) : (
                activeReportsList.map((item) => {
                  const isActive = activeSynthesis?.id === item.id;
                  const Icon = item.source === "organization" ? Building2 :
                               item.source === "stakeholder_meta" ? Building2 :
                               item.source === "map" ? Map :
                               item.source === "meta" ? Sparkles : Layers;

                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelectHistoryItem(item)}
                      className={`group relative p-3 border transition-all cursor-pointer flex gap-2.5 items-start ${
                        isActive
                          ? "bg-white border-[#1A1A1A] shadow-sm"
                          : "bg-[#F9F8F6] border-[#E5E3DF] hover:bg-white hover:border-gray-400"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${
                        isActive 
                          ? (item.source === "stakeholder_meta" ? "text-amber-600" : item.source === "organization" ? "text-amber-700" : "text-[#4A6741]") 
                          : "text-gray-400"
                      }`} />

                      <div className="flex-1 min-w-0 pr-6">
                        <p className={`text-xs font-bold leading-snug truncate ${isActive ? "text-[#1A1A1A]" : "text-gray-700"}`}>
                          {item.title}
                        </p>
                        <span className="text-[9px] font-mono text-gray-400 block mt-1">
                          {item.timestamp}
                        </span>
                      </div>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteHistoryItem(item.id);
                        }}
                        title="Delete critique"
                        className="absolute right-2.5 top-3 opacity-0 group-hover:opacity-100 hover:text-[#A13D2D] text-gray-400 transition-opacity p-0.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Selected Active Critique */}
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            {activeSynthesis ? (
              <>
                {/* Active Critique Information Header */}
                <div className="px-6 py-4 border-b border-[#E5E3DF] bg-[#F9F8F6]/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="space-y-1 flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2">
                      <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 uppercase tracking-wider ${
                        activeSynthesis.source === "organization"
                          ? "bg-amber-100 border border-amber-300 text-amber-900"
                          : activeSynthesis.source === "stakeholder_meta"
                          ? "bg-amber-200 border border-amber-400 text-amber-950 font-extrabold"
                          : activeSynthesis.source === "map" 
                          ? "bg-blue-50 border border-blue-200 text-blue-600" 
                          : activeSynthesis.source === "meta"
                          ? "bg-purple-100 border border-purple-300 text-purple-900 font-bold"
                          : "bg-purple-50 border border-purple-200 text-purple-600"
                      }`}>
                        {activeSynthesis.source === "organization" ? "Organization Stakeholder Intelligence" :
                         activeSynthesis.source === "stakeholder_meta" ? "Executive Summary of Stakeholder Positions" :
                         activeSynthesis.source === "map" ? "Semantic Neighborhood" :
                         activeSynthesis.source === "meta" ? "Executive Cluster Meta-Review" : "Cluster Synthesis"}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">{activeSynthesis.timestamp}</span>
                    </div>

                    {isEditing ? (
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        placeholder="Report title..."
                        className="w-full bg-white border border-[#1A1A1A] px-2.5 py-1 text-sm font-serif italic text-[#1A1A1A] font-bold focus:outline-none"
                      />
                    ) : (
                      <h3 className="text-base font-serif italic text-[#1A1A1A] font-bold">
                        {activeSynthesis.title}
                      </h3>
                    )}
                  </div>

                  {/* Actions for active report */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Copy Button with visual feedback */}
                    <button
                      onClick={handleCopy}
                      className={`px-3 py-1.5 border text-[10px] font-mono uppercase font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        copied
                          ? "bg-emerald-600 text-white border-emerald-700"
                          : "bg-white border-[#E5E3DF] hover:border-[#1A1A1A] text-gray-800"
                      }`}
                      title="Copy report markdown to clipboard"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Report</span>
                        </>
                      )}
                    </button>

                    {/* Edit Mode Toggle / Save Button */}
                    {isEditing ? (
                      <button
                        onClick={handleSaveChanges}
                        className="px-3 py-1.5 bg-[#4A6741] hover:bg-[#3D5535] text-white text-[10px] font-mono uppercase font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <Save className="w-3.5 h-3.5" /> Save Changes
                      </button>
                    ) : (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-3 py-1.5 border border-[#E5E3DF] hover:border-[#1A1A1A] bg-white text-[10px] font-mono uppercase font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Edit report title or markdown text"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-700" /> Edit Report
                      </button>
                    )}

                    <button
                      onClick={handleDownload}
                      className="px-3 py-1.5 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white text-[10px] font-mono uppercase font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Download as Markdown file"
                    >
                      <Download className="w-3.5 h-3.5" /> Save .md
                    </button>
                  </div>
                </div>

                {/* Body Area: Editing vs View Mode */}
                {isEditing ? (
                  <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-3 bg-[#F9F8F6]">
                    <div className="flex items-center justify-between border-b border-[#E5E3DF] pb-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditTab("write")}
                          className={`px-3 py-1 text-[10px] font-mono uppercase font-bold transition-all ${
                            editTab === "write"
                              ? "bg-[#1A1A1A] text-white"
                              : "bg-white border border-[#E5E3DF] text-gray-600 hover:text-black"
                          }`}
                        >
                          <Edit3 className="w-3 h-3 inline mr-1" /> Edit Content
                        </button>
                        <button
                          onClick={() => setEditTab("preview")}
                          className={`px-3 py-1 text-[10px] font-mono uppercase font-bold transition-all ${
                            editTab === "preview"
                              ? "bg-[#1A1A1A] text-white"
                              : "bg-white border border-[#E5E3DF] text-gray-600 hover:text-black"
                          }`}
                        >
                          <Eye className="w-3 h-3 inline mr-1" /> Live Preview
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            setEditingTitle(activeSynthesis.title);
                            setEditingMarkdown(activeSynthesis.markdown);
                          }}
                          className="px-2.5 py-1 text-[10px] font-mono text-gray-500 hover:text-[#A13D2D] hover:underline cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveChanges}
                          className="px-3 py-1 bg-[#4A6741] text-white text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-hidden">
                      {editTab === "write" ? (
                        <textarea
                          value={editingMarkdown}
                          onChange={(e) => setEditingMarkdown(e.target.value)}
                          placeholder="Type or paste markdown content here..."
                          className="w-full h-full bg-white border border-[#E5E3DF] p-4 font-mono text-xs text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A] resize-none leading-relaxed"
                        />
                      ) : (
                        <div className="h-full bg-white border border-[#E5E3DF] p-6 overflow-y-auto prose max-w-none">
                          <MarkdownViewer markdown={editingMarkdown} />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Standard Markdown View Mode */
                  <div className="flex-1 overflow-y-auto p-8 prose max-w-none">
                    <MarkdownViewer markdown={activeSynthesis.markdown} />
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400">
                <Sparkles className="w-8 h-8 mb-3 text-amber-500" />
                <h4 className="font-serif italic text-lg text-[#1A1A1A] mb-1">Critical Synthesis Hub</h4>
                <p className="text-xs max-w-sm leading-relaxed text-gray-500 mb-4">
                  Select a past report from history, or perform a factual executive review pulling together information from all syntheses done to date.
                </p>
                {history.length > 0 && onPerformMetaReview && (
                  <button
                    onClick={onPerformMetaReview}
                    disabled={isSynthesizingMeta}
                    className="px-4 py-2 bg-[#2D1B0D] hover:bg-[#3D2513] text-amber-200 border border-amber-800 text-xs font-mono uppercase tracking-wider font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <FileCheck2 className={`w-4 h-4 text-amber-400 ${isSynthesizingMeta ? "animate-spin" : ""}`} />
                    <span>{isSynthesizingMeta ? "Synthesizing Existing Reports..." : "Perform Executive Review of Syntheses"}</span>
                  </button>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Footer (mobile only view of history toggle, or standard close bar) */}
        <div className="bg-[#F9F8F6] border-t border-[#E5E3DF] px-6 py-3.5 flex items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500">
            <span className="h-2 w-2 bg-amber-500 rounded-full" />
            <span>Factual Audit Mode: Pulls exclusively from existing reports to prevent hallucinated data.</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white font-mono text-[10px] uppercase tracking-widest font-bold cursor-pointer transition-colors"
          >
            Dismiss
          </button>
        </div>

      </div>
    </div>
  );
};

