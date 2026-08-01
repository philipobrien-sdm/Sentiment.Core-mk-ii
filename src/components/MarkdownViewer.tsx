import React from "react";

interface MarkdownViewerProps {
  markdown: string;
}

// Simple inline helper to bold **text** in responses
function renderInlineBold(text: string) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, index) => {
    // Every odd part is captured between stars
    if (index % 2 === 1) {
      return <strong key={index} className="font-semibold text-[#1A1A1A]">{part}</strong>;
    }
    return part;
  });
}

// A beautiful, secure client-side Markdown formatter for clean rendering without external package overhead
export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ markdown }) => {
  const lines = markdown.split("\n");
  
  return (
    <div className="space-y-4 text-[#1A1A1A] leading-relaxed text-sm">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        
        // Headers (H1, H2, H3)
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} className="text-base font-serif italic text-[#1A1A1A] pt-4 pb-1 flex items-center gap-2 border-b border-dashed border-[#E5E3DF] font-semibold">
              {trimmed.substring(4)}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={idx} className="text-lg font-serif italic text-[#1A1A1A] pt-5 pb-1.5 flex items-center gap-2 border-b border-[#E5E3DF] font-semibold">
              {trimmed.substring(3)}
            </h3>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={idx} className="text-xl font-serif italic font-semibold text-[#1A1A1A] pt-6 pb-2 border-b border-2 border-[#1A1A1A] mb-4">
              {trimmed.substring(2)}
            </h2>
          );
        }

        // Unordered list items
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const content = trimmed.substring(2);
          return (
            <li key={idx} className="ml-5 list-disc pl-1 text-gray-700 my-1">
              {renderInlineBold(content)}
            </li>
          );
        }

        // Ordered list items (e.g., "1. ")
        const numberedMatch = trimmed.match(/^(\d+)\.\s(.*)/);
        if (numberedMatch) {
          return (
            <div key={idx} className="flex gap-2.5 my-2.5 items-start">
              <span className="font-mono text-[10px] bg-[#F9F8F6] border border-[#E5E3DF] text-[#1A1A1A] font-bold w-5 h-5 flex items-center justify-center shrink-0 mt-0.5 rounded-none">
                {numberedMatch[1]}
              </span>
              <p className="flex-1 text-gray-700">{renderInlineBold(numberedMatch[2])}</p>
            </div>
          );
        }

        // Blank line
        if (trimmed === "") {
          return <div key={idx} className="h-2" />;
        }

        // Default paragraph
        return (
          <p key={idx} className="my-1.5 leading-relaxed text-xs">
            {renderInlineBold(trimmed)}
          </p>
        );
      })}
    </div>
  );
};
