import React, { useState, useEffect, useMemo } from "react";
import { 
  X, Building2, Crown, ShieldAlert, Radio, Eye, Check, Sparkles, 
  HelpCircle, MessageSquare, ArrowUpRight, Save, RotateCcw, Sliders, Layers,
  FileText, Target, AlertTriangle
} from "lucide-react";
import { CommentItem, StakeholderMapping, getQuadrantInfo, QuadrantInfo } from "../types";

interface StakeholderMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOrganizationName?: string | null;
  comments: CommentItem[];
  stakeholderMappings: Record<string, StakeholderMapping>;
  onSaveMapping: (mapping: StakeholderMapping) => void;
  onSaveAllMappings: (mappings: Record<string, StakeholderMapping>) => void;
  showToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const StakeholderMappingModal: React.FC<StakeholderMappingModalProps> = ({
  isOpen,
  onClose,
  initialOrganizationName,
  comments,
  stakeholderMappings,
  onSaveMapping,
  onSaveAllMappings,
  showToast,
}) => {
  // Get list of all unique organizations present in active dataset
  const uniqueOrganizations = useMemo(() => {
    const set = new Set<string>();
    comments.forEach((c) => {
      const org = c.organizationName || c.originalRowData?.["Organization"] || c.originalRowData?.["Org"] || c.originalRowData?.["Organization Name"];
      if (org && org.trim() && org !== "(No Organization)") {
        set.add(org.trim());
      }
    });

    // Add any existing mapped orgs not in active dataset
    Object.keys(stakeholderMappings).forEach((org) => {
      if (org && org.trim()) set.add(org.trim());
    });

    return Array.from(set).sort();
  }, [comments, stakeholderMappings]);

  // Active selected organization for editing
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [customOrgInput, setCustomOrgInput] = useState<string>("");

  // Current editing values
  const [interest, setInterest] = useState<number>(3.0);
  const [influence, setInfluence] = useState<number>(3.0);
  const [bio, setBio] = useState<string>("");
  const [redLines, setRedLines] = useState<string>("");
  const [expectations, setExpectations] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Sync state when initialOrganizationName or selectedOrg changes
  useEffect(() => {
    if (initialOrganizationName && initialOrganizationName.trim()) {
      setSelectedOrg(initialOrganizationName.trim());
    } else if (uniqueOrganizations.length > 0 && !selectedOrg) {
      setSelectedOrg(uniqueOrganizations[0]);
    }
  }, [initialOrganizationName, uniqueOrganizations]);

  // Load existing values when selectedOrg changes
  useEffect(() => {
    if (!selectedOrg) return;

    const existing = stakeholderMappings[selectedOrg];
    if (existing) {
      setInterest(existing.interest);
      setInfluence(existing.influence);
      setBio(existing.bio || "");
      setRedLines(existing.redLines || "");
      setExpectations(existing.expectations || "");
      setNotes(existing.notes || "");
    } else {
      // Default to neutral 3.0
      setInterest(3.0);
      setInfluence(3.0);
      setBio("");
      setRedLines("");
      setExpectations("");
      setNotes("");
    }
  }, [selectedOrg, stakeholderMappings]);

  if (!isOpen) return null;

  // Active quadrant info
  const activeQuadrant = getQuadrantInfo(influence, interest);

  // Count comments for selected organization
  const orgComments = comments.filter((c) => {
    const org = c.organizationName || c.originalRowData?.["Organization"] || c.originalRowData?.["Org"] || c.originalRowData?.["Organization Name"];
    return org?.trim().toLowerCase() === selectedOrg.toLowerCase();
  });

  const orgSentiments = {
    positive: orgComments.filter((c) => c.sentiment === "positive").length,
    neutral: orgComments.filter((c) => c.sentiment === "neutral").length,
    negative: orgComments.filter((c) => c.sentiment === "negative").length,
  };

  // Save current selected org mapping
  const handleSaveCurrentOrg = () => {
    const targetOrg = selectedOrg || customOrgInput.trim();
    if (!targetOrg) {
      showToast("Please select or specify an organization name.", "error");
      return;
    }

    const updatedMapping: StakeholderMapping = {
      organizationName: targetOrg,
      interest: Number(interest.toFixed(1)),
      influence: Number(influence.toFixed(1)),
      quadrant: activeQuadrant.quadrant,
      bio: bio.trim(),
      redLines: redLines.trim(),
      expectations: expectations.trim(),
      notes: notes.trim(),
      updatedAt: new Date().toISOString()
    };

    onSaveMapping(updatedMapping);
    showToast(`Saved stakeholder profile for "${targetOrg}" (${activeQuadrant.shortLabel})`, "success");
  };

  // Click on 2D Matrix Grid to set coordinates directly
  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert pixel coordinates (0-100%) to Interest (X: 1-5) and Influence (Y: 5-1 bottom to top)
    const normX = Math.max(0, Math.min(1, clickX / rect.width));
    const normY = Math.max(0, Math.min(1, clickY / rect.height));

    const calcInterest = Math.round((1 + normX * 4) * 10) / 10; // 1.0 to 5.0
    const calcInfluence = Math.round((5 - normY * 4) * 10) / 10; // 5.0 at top to 1.0 at bottom

    setInterest(calcInterest);
    setInfluence(calcInfluence);
  };

  // Quick Preset Handlers
  const handlePresetQuadrant = (targetQuadrant: 'key_players' | 'keep_satisfied' | 'keep_informed' | 'monitor') => {
    switch (targetQuadrant) {
      case 'key_players':
        setInfluence(4.5);
        setInterest(4.5);
        break;
      case 'keep_satisfied':
        setInfluence(4.5);
        setInterest(2.0);
        break;
      case 'keep_informed':
        setInfluence(2.0);
        setInterest(4.5);
        break;
      case 'monitor':
        setInfluence(2.0);
        setInterest(2.0);
        break;
    }
  };

  // Bulk classify all organizations based on comment volume / sentiment
  const handleAutoClassifyAll = () => {
    if (uniqueOrganizations.length === 0) {
      showToast("No organizations in dataset to auto-classify.", "error");
      return;
    }

    const newMappings: Record<string, StakeholderMapping> = { ...stakeholderMappings };

    uniqueOrganizations.forEach((org) => {
      const commentsForOrg = comments.filter((c) => {
        const o = c.organizationName || c.originalRowData?.["Organization"] || c.originalRowData?.["Org"];
        return o?.trim().toLowerCase() === org.toLowerCase();
      });

      const count = commentsForOrg.length;
      const negCount = commentsForOrg.filter((c) => c.sentiment === "negative").length;

      // Higher volume & negative count => Higher Interest & Influence
      let calcInterest = Math.min(5.0, Math.max(1.5, 2.0 + count * 0.5));
      let calcInfluence = Math.min(5.0, Math.max(1.5, 2.0 + (negCount + count) * 0.4));

      const quadInfo = getQuadrantInfo(calcInfluence, calcInterest);

      newMappings[org] = {
        organizationName: org,
        interest: Number(calcInterest.toFixed(1)),
        influence: Number(calcInfluence.toFixed(1)),
        quadrant: quadInfo.quadrant,
        notes: `Auto-mapped based on ${count} comments in dataset.`,
        updatedAt: new Date().toISOString()
      };
    });

    onSaveAllMappings(newMappings);
    showToast(`Auto-classified ${uniqueOrganizations.length} organizations on Power-Interest grid!`, "success");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white border border-[#1A1A1A] shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto rounded-none">
        
        {/* Header Bar */}
        <div className="bg-[#1A1A1A] text-white px-6 py-4 flex items-center justify-between border-b-4 border-[#4A6741]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#4A6741] text-white">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif italic text-lg font-bold">
                Stakeholder Power-Interest Matrix
              </h2>
              <p className="text-xs text-gray-300 font-sans">
                Map organizations on 2 axes (Interest vs Influence). High-priority stakeholders are automatically weighted in report evaluations.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#F9F8F6]/50">
          
          {/* LEFT 7 COLS: Interactive 2D Power-Interest Grid Visualizer */}
          <div className="lg:col-span-7 space-y-4">
            
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-700 font-mono flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#4A6741]" />
                2D Stakeholder Grid Canvas (Click to position)
              </span>
              <span className="text-[10px] text-gray-500 font-mono">
                {uniqueOrganizations.length} org{uniqueOrganizations.length === 1 ? "" : "s"} detected
              </span>
            </div>

            {/* 2D Interactive Grid Box */}
            <div className="relative bg-white border-2 border-[#1A1A1A] shadow-sm select-none">
              
              {/* Vertical Y-Axis Label: INFLUENCE / POWER */}
              <div className="absolute -left-7 top-1/2 -translate-y-1/2 -rotate-90 origin-center text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A] whitespace-nowrap">
                Influence / Power →
              </div>

              {/* Horizontal X-Axis Label: INTEREST */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A] whitespace-nowrap">
                Interest Level →
              </div>

              {/* 2x2 Quadrant Grid Matrix Container */}
              <div 
                onClick={handleGridClick}
                className="relative h-[340px] w-full grid grid-cols-2 grid-rows-2 cursor-crosshair overflow-hidden"
              >
                {/* Quadrant 1 (Top Left): KEEP SATISFIED */}
                <div className="bg-blue-50/60 border-r border-b border-blue-200 p-3 relative flex flex-col justify-between group">
                  <div className="flex items-center gap-1.5 text-blue-900 font-bold text-[11px] uppercase tracking-wider">
                    <span>🛡️</span>
                    <span>Keep Satisfied</span>
                  </div>
                  <span className="text-[9px] text-blue-700 font-serif italic">
                    High Power • Low Interest
                  </span>
                </div>

                {/* Quadrant 2 (Top Right): KEY PLAYERS */}
                <div className="bg-amber-50/70 border-b border-amber-200 p-3 relative flex flex-col justify-between group">
                  <div className="flex items-center gap-1.5 text-amber-900 font-bold text-[11px] uppercase tracking-wider">
                    <span>👑</span>
                    <span>Key Players</span>
                    <span className="ml-auto text-[9px] bg-amber-200/80 px-1.5 py-0.5 rounded-none text-amber-900 font-mono">2.5x Priority</span>
                  </div>
                  <span className="text-[9px] text-amber-800 font-serif italic">
                    High Power • High Interest (Manage Closely)
                  </span>
                </div>

                {/* Quadrant 3 (Bottom Left): MONITOR */}
                <div className="bg-gray-50/80 border-r border-gray-200 p-3 relative flex flex-col justify-between group">
                  <div className="flex items-center gap-1.5 text-gray-700 font-bold text-[11px] uppercase tracking-wider">
                    <span>👁️</span>
                    <span>Monitor</span>
                  </div>
                  <span className="text-[9px] text-gray-500 font-serif italic">
                    Low Power • Low Interest
                  </span>
                </div>

                {/* Quadrant 4 (Bottom Right): KEEP INFORMED */}
                <div className="bg-emerald-50/60 p-3 relative flex flex-col justify-between group">
                  <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-[11px] uppercase tracking-wider">
                    <span>📢</span>
                    <span>Keep Informed</span>
                  </div>
                  <span className="text-[9px] text-emerald-700 font-serif italic">
                    Low Power • High Interest
                  </span>
                </div>

                {/* Center Axis Reference Lines */}
                <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-gray-400 pointer-events-none" />
                <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-gray-400 pointer-events-none" />

                {/* Render Plotted Stakeholder Nodes */}
                {uniqueOrganizations.map((org) => {
                  const mapping = stakeholderMappings[org];
                  const orgInt = mapping ? mapping.interest : 3.0;
                  const orgInf = mapping ? mapping.influence : 3.0;

                  // Normalize 1..5 to 0..100%
                  const leftPct = Math.max(5, Math.min(92, ((orgInt - 1) / 4) * 100));
                  const topPct = Math.max(5, Math.min(90, ((5 - orgInf) / 4) * 100));

                  const isSelected = org.toLowerCase() === selectedOrg.toLowerCase();
                  const qInfo = getQuadrantInfo(orgInf, orgInt);

                  return (
                    <div
                      key={org}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOrg(org);
                      }}
                      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all cursor-pointer z-10 ${
                        isSelected 
                          ? "scale-110 z-30" 
                          : "hover:scale-105 hover:z-20 opacity-85 hover:opacity-100"
                      }`}
                      title={`${org}: Influence ${orgInf.toFixed(1)}, Interest ${orgInt.toFixed(1)} (${qInfo.shortLabel})${mapping?.bio ? ` | Bio: ${mapping.bio.slice(0, 50)}...` : ""}${mapping?.redLines ? ` | ⚠️ Red Line: ${mapping.redLines.slice(0, 50)}...` : ""}`}
                    >
                      <div className={`px-2 py-1 text-[10px] font-bold border shadow-xs flex items-center gap-1.5 whitespace-nowrap ${
                        isSelected
                          ? "bg-[#1A1A1A] text-white border-[#4A6741] ring-2 ring-[#4A6741]"
                          : `${qInfo.bgColor} ${qInfo.color} ${qInfo.borderColor}`
                      }`}>
                        <span className="text-[11px]">{qInfo.icon}</span>
                        <span className="truncate max-w-[110px]">{org}</span>
                        {mapping?.redLines && <span className="text-[9px]" title="Red Line Set">⚠️</span>}
                        {mapping?.bio && !mapping?.redLines && <span className="text-[9px]" title="Bio Set">📝</span>}
                      </div>
                    </div>
                  );
                })}

                {/* Live Indicator marker for active selected org */}
                {selectedOrg && (
                  <div
                    style={{
                      left: `${Math.max(5, Math.min(92, ((interest - 1) / 4) * 100))}%`,
                      top: `${Math.max(5, Math.min(90, ((5 - influence) / 4) * 100))}%`
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40 animate-pulse"
                  >
                    <div className="w-5 h-5 rounded-full border-2 border-[#A13D2D] bg-[#A13D2D]/20 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#A13D2D]" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions & Bulk Auto-Classify */}
            <div className="pt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E3DF]">
              <button
                type="button"
                onClick={handleAutoClassifyAll}
                className="px-3 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Automatically map all organizations based on comment volume and sentiment severity"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Auto-Classify All via Volume & Severity</span>
              </button>

              <span className="text-[10px] text-gray-400 font-mono italic">
                Click any position on the grid to instantly move node coordinates.
              </span>
            </div>

          </div>

          {/* RIGHT 5 COLS: Organization Selector & Quadrant Editor Panel */}
          <div className="lg:col-span-5 bg-white border border-[#E5E3DF] p-5 space-y-5">
            
            {/* Organization Picker */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-600 font-mono">
                Select Organization
              </label>

              <div className="flex gap-2">
                <select
                  value={selectedOrg}
                  onChange={(e) => setSelectedOrg(e.target.value)}
                  className="flex-1 bg-[#F9F8F6] border border-[#E5E3DF] px-3 py-2 text-xs font-bold text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A] cursor-pointer rounded-none"
                >
                  <option value="">-- Choose Organization --</option>
                  {uniqueOrganizations.map((org) => {
                    const mapped = stakeholderMappings[org];
                    const qInfo = mapped ? getQuadrantInfo(mapped.influence, mapped.interest) : null;
                    return (
                      <option key={org} value={org}>
                        {org} {qInfo ? `(${qInfo.shortLabel})` : "(Unmapped)"}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Or custom input if no orgs exist */}
              {uniqueOrganizations.length === 0 && (
                <input
                  type="text"
                  value={customOrgInput}
                  onChange={(e) => setCustomOrgInput(e.target.value)}
                  placeholder="Enter organization name..."
                  className="w-full bg-[#F9F8F6] border border-[#E5E3DF] px-3 py-2 text-xs font-sans text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A] rounded-none"
                />
              )}
            </div>

            {/* Active Selected Organization Metrics */}
            {selectedOrg && (
              <div className="bg-[#F9F8F6] p-3 border border-[#E5E3DF] flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-500" />
                  <span className="font-bold text-[#1A1A1A] truncate max-w-[160px]">{selectedOrg}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono">
                  <span className="text-gray-500">{orgComments.length} comment{orgComments.length === 1 ? "" : "s"}</span>
                  <span className="text-green-700 bg-green-50 px-1 border border-green-200">+{orgSentiments.positive}</span>
                  <span className="text-red-700 bg-red-50 px-1 border border-red-200">-{orgSentiments.negative}</span>
                </div>
              </div>
            )}

            {/* QUADRANT STATUS BADGE CARD */}
            <div className={`p-4 border-2 ${activeQuadrant.borderColor} ${activeQuadrant.bgColor} space-y-2 transition-all`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{activeQuadrant.icon}</span>
                  <div>
                    <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-gray-500 block">
                      Assigned Stakeholder Quadrant
                    </span>
                    <h4 className={`font-bold text-sm ${activeQuadrant.color}`}>
                      {activeQuadrant.label}
                    </h4>
                  </div>
                </div>

                <span className="px-2 py-1 bg-white/90 border border-current text-[10px] font-mono font-bold uppercase tracking-wider">
                  {activeQuadrant.priorityWeight}x Weight
                </span>
              </div>

              <p className="text-xs text-gray-700 leading-relaxed font-sans pt-1 border-t border-black/10">
                {activeQuadrant.description}
              </p>
            </div>

            {/* AXIS SLIDERS */}
            <div className="space-y-4 pt-1">
              
              {/* Slider 1: INFLUENCE / POWER (1.0 to 5.0) */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold uppercase tracking-wider text-gray-700 text-[10px] font-mono">
                    Influence / Power Score:
                  </span>
                  <span className="font-mono font-bold text-[#1A1A1A] bg-gray-100 px-2 py-0.5 border border-gray-300">
                    {influence.toFixed(1)} / 5.0
                  </span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="5.0"
                  step="0.1"
                  value={influence}
                  onChange={(e) => setInfluence(parseFloat(e.target.value))}
                  className="w-full accent-[#1A1A1A] cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-gray-400 font-mono">
                  <span>1.0 (Low Power)</span>
                  <span>3.0 (Moderate)</span>
                  <span>5.0 (Decision Maker)</span>
                </div>
              </div>

              {/* Slider 2: INTEREST (1.0 to 5.0) */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold uppercase tracking-wider text-gray-700 text-[10px] font-mono">
                    Interest Level Score:
                  </span>
                  <span className="font-mono font-bold text-[#4A6741] bg-emerald-50 px-2 py-0.5 border border-emerald-300">
                    {interest.toFixed(1)} / 5.0
                  </span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="5.0"
                  step="0.1"
                  value={interest}
                  onChange={(e) => setInterest(parseFloat(e.target.value))}
                  className="w-full accent-[#4A6741] cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-gray-400 font-mono">
                  <span>1.0 (Passive Observer)</span>
                  <span>3.0 (Interested)</span>
                  <span>5.0 (High Priority Need)</span>
                </div>
              </div>

            </div>

            {/* Quick Quadrant Presets Buttons */}
            <div className="space-y-1.5 pt-2 border-t border-[#E5E3DF]">
              <span className="block text-[9px] font-mono uppercase font-bold tracking-widest text-gray-400">
                Quick Quadrant Presets
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePresetQuadrant('key_players')}
                  className="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <span>👑 Key Player</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetQuadrant('keep_satisfied')}
                  className="px-2 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-900 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <span>🛡️ Keep Satisfied</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetQuadrant('keep_informed')}
                  className="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <span>📢 Keep Informed</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetQuadrant('monitor')}
                  className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-800 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <span>👁️ Monitor</span>
                </button>
              </div>
            </div>

            {/* Stakeholder Bio & Context */}
            <div className="space-y-1 pt-1 border-t border-[#E5E3DF]">
              <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-[#1A1A1A] flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-[#4A6741]" />
                  Stakeholder Bio & Strategic Context
                </span>
                {bio.trim() && <span className="text-[9px] text-[#4A6741] font-mono">✓ Active Context</span>}
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="e.g. Primary commercial enterprise partner operating 15+ years. Key priorities include API stability, transparent release notes, and high uptime."
                rows={2}
                className="w-full bg-[#F9F8F6] border border-[#E5E3DF] p-2 text-xs text-gray-800 focus:outline-none focus:border-[#1A1A1A] resize-none rounded-none"
              />
              <p className="text-[9px] text-gray-400 font-mono">
                Used in LLM prompts to provide stakeholder background when evaluating feedback or generating executive reports.
              </p>
            </div>

            {/* Red Lines & Non-Negotiables */}
            <div className="space-y-1 pt-1">
              <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-red-900 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-700" />
                  Red Lines & Non-Negotiable Boundaries
                </span>
                {redLines.trim() && <span className="text-[9px] bg-red-100 text-red-800 px-1 font-mono">⚠️ Red Line Set</span>}
              </label>
              <textarea
                value={redLines}
                onChange={(e) => setRedLines(e.target.value)}
                placeholder="e.g. Firm refusal of unscheduled daytime downtime. Will not accept unannounced breaking schema changes."
                rows={2}
                className="w-full bg-red-50/30 border border-red-200 p-2 text-xs text-red-950 focus:outline-none focus:border-red-600 resize-none rounded-none"
              />
              <p className="text-[9px] text-red-700/80 font-mono">
                The LLM will explicitly check proposed actions and feedback against these red lines to flag critical policy conflicts.
              </p>
            </div>

            {/* Key Expectations */}
            <div className="space-y-1 pt-1">
              <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-900 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-emerald-700" />
                  Key Stakeholder Expectations & Requirements
                </span>
                {expectations.trim() && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 font-mono">🎯 Expectations Set</span>}
              </label>
              <textarea
                value={expectations}
                onChange={(e) => setExpectations(e.target.value)}
                placeholder="e.g. Expects 99.9% SLA uptime guarantees, 24h advance notice for API updates, and quarterly technical audit access."
                rows={2}
                className="w-full bg-emerald-50/30 border border-emerald-200 p-2 text-xs text-emerald-950 focus:outline-none focus:border-emerald-600 resize-none rounded-none"
              />
            </div>

            {/* Optional Strategic Account Notes */}
            <div className="space-y-1 pt-1">
              <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-gray-500">
                Strategic Account Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Enterprise Tier account ($2.5M ARR). Critical requirement for upcoming compliance audit."
                rows={2}
                className="w-full bg-[#F9F8F6] border border-[#E5E3DF] p-2 text-xs text-gray-800 focus:outline-none focus:border-[#1A1A1A] resize-none rounded-none"
              />
            </div>

            {/* Save Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSaveCurrentOrg}
                disabled={!selectedOrg && !customOrgInput}
                className="w-full py-2.5 bg-[#4A6741] hover:bg-[#3D5535] disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all rounded-none shadow-xs"
              >
                <Save className="w-4 h-4" />
                <span>Save Mapping for "{selectedOrg || "Organization"}"</span>
              </button>
            </div>

          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#F9F8F6] border-t border-[#E5E3DF] flex items-center justify-between text-xs text-gray-500">
          <span className="font-mono text-[10px]">
            Saved stakeholder mappings persist automatically in session memory and guide executive report synthesis.
          </span>
          
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#E5E3DF] hover:border-[#1A1A1A] hover:bg-white text-[#1A1A1A] text-[10px] uppercase font-bold tracking-widest transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
