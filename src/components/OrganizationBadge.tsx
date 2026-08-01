import React from "react";
import { Building2 } from "lucide-react";
import { StakeholderMapping, getQuadrantInfo } from "../types";

interface OrganizationBadgeProps {
  organizationName?: string | null;
  mapping?: StakeholderMapping | null;
  onClick?: (orgName: string) => void;
  className?: string;
  showIconOnly?: boolean;
}

export const OrganizationBadge: React.FC<OrganizationBadgeProps> = ({
  organizationName,
  mapping,
  onClick,
  className = "",
  showIconOnly = false
}) => {
  const org = organizationName?.trim() || "Unknown Organization";
  if (!organizationName || org === "(No Organization)" || org === "—") {
    return <span className="text-gray-400 italic font-sans text-xs">—</span>;
  }

  // Get quadrant info if mapped
  const qInfo = mapping 
    ? getQuadrantInfo(mapping.influence, mapping.interest) 
    : null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick(org);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold border transition-all cursor-pointer group ${
        qInfo 
          ? `${qInfo.bgColor} ${qInfo.color} ${qInfo.borderColor} hover:scale-[1.02]` 
          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-400"
      } ${className}`}
      title={qInfo ? `${org} • ${qInfo.label} (${qInfo.priorityWeight}x Priority Weight in Synthesis)` : `Click to map power-interest quadrant for ${org}`}
    >
      <span className="shrink-0 text-xs">
        {qInfo ? qInfo.icon : <Building2 className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-700" />}
      </span>

      {!showIconOnly && (
        <span className="truncate max-w-[140px] font-sans">
          {org}
        </span>
      )}

      {qInfo && (
        <span className="text-[9px] opacity-75 font-mono ml-0.5 font-normal">
          [{qInfo.shortLabel}]
        </span>
      )}
    </button>
  );
};
