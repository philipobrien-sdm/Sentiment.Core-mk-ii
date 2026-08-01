import React, { useState } from "react";
import { Sparkles, Loader2, CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";
import { LlmSettings } from "../types";
import { fetchLocalCompletion } from "../utils/localLlm";

interface PromptAssistantProps {
  llmSettings: LlmSettings;
  onPersonaGenerated: (newPersona: string) => void;
  className?: string;
}

export const PromptAssistant: React.FC<PromptAssistantProps> = ({
  llmSettings,
  onPersonaGenerated,
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error" | "info" | null;
    message: string;
  }>({ type: null, message: "" });

  const handleGenerate = async () => {
    const cleanDesc = description.trim();
    if (!cleanDesc) {
      setStatus({
        type: "error",
        message: "Please enter a brief description of your feedback dataset first."
      });
      return;
    }

    setIsGenerating(true);
    setStatus({ type: "info", message: "Synthesizing custom persona guidelines..." });

    try {
      // Craft the prompt to instruct the LLM to design a persona
      const prompt = `You are an expert AI Meta-Prompt Designer.
Your task is to write a single, robust, and highly detailed analytical persona instruction block for another AI model that will be analyzing stakeholder comments.

The user describes their target dataset and analysis goals as:
"${cleanDesc}"

Write a system persona instruction block that is highly tailored to this domain.
Structure it to be professional, precise, and authoritative. It should start with something like: "You are a Senior [Specific Domain Specialist]. Focus heavily on [specific priorities], correctly infer stakeholder intent from context, reconcile opposing friction points, and maintain absolute factual integrity with zero hallucinations."

CRITICAL: Do not include any preambles, greetings, HTML, markdown formatting, backticks, or additional conversational text. Respond ONLY with the raw instruction text itself (around 2-3 sentences) so that it can be directly used as a system prompt.`;

      // Attempt to call the configured local LLM
      const result = await fetchLocalCompletion(prompt, llmSettings);
      
      const cleanResult = result.trim().replace(/^["'`\s]+|["'`\s]+$/g, ""); // strip quotes
      if (cleanResult && cleanResult.length > 20) {
        onPersonaGenerated(cleanResult);
        setStatus({
          type: "success",
          message: "Custom persona generated and applied successfully!"
        });
      } else {
        throw new Error("Received an empty or invalid response from the local model.");
      }
    } catch (error: any) {
      console.warn("Local LLM not configured or failed to respond. Falling back to local smart template:", error);
      
      // Fallback: Generate a high-quality static persona based on their input
      // Capitalize first letter
      const uppercaseInput = cleanDesc.charAt(0).toUpperCase() + cleanDesc.slice(1);
      const fallbackPersona = `You are an expert Strategic Specialist specializing in analyzing feedback regarding: "${uppercaseInput}". Focus heavily on stakeholder sentiment, correctly infer user intent from context, reconcile opposing friction points, and isolate core recurring trends while maintaining complete factual integrity with zero hallucinations.`;
      
      onPersonaGenerated(fallbackPersona);
      setStatus({
        type: "success",
        message: "Smart template applied successfully (Local LLM not connected or offline)."
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={`border border-[#E5E3DF] bg-[#F9F8F6]/40 p-2.5 space-y-2.5 ${className}`}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setStatus({ type: null, message: "" });
        }}
        className="w-full flex items-center justify-between text-left text-xs font-semibold text-[#1A1A1A] hover:text-[#4A6741] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#4A6741]" />
          <span>✨ AI Prompt Assistant</span>
        </div>
        <span className="text-[10px] font-mono text-gray-400">
          {isOpen ? "[ Collapse ]" : "[ Expand ]"}
        </span>
      </button>

      {isOpen && (
        <div className="space-y-2.5 pt-1.5 border-t border-[#E5E3DF]/60 animate-in fade-in duration-150">
          <p className="text-[10px] text-gray-500 leading-normal">
            Describe what your dataset contains and your primary goals to automatically define tailored analysis instructions.
          </p>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., A CSV of patient reviews at a dental clinic. Focus on reception wait times and assistant friendliness."
            rows={2}
            className="w-full bg-white border border-[#E5E3DF] p-2 text-[11px] focus:outline-none focus:border-[#1A1A1A] font-sans rounded-none leading-relaxed resize-none"
            disabled={isGenerating}
          />

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !description.trim()}
            className="w-full py-1.5 bg-[#1A1A1A] hover:bg-[#333333] disabled:bg-gray-200 disabled:text-gray-400 text-white text-[10px] uppercase tracking-wider font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all rounded-none"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Generating custom persona...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                <span>Generate Persona & Guidelines</span>
              </>
            )}
          </button>

          {status.type && (
            <div 
              className={`p-2 text-[10px] leading-relaxed flex items-start gap-1.5 border ${
                status.type === "success" 
                  ? "bg-[#4A6741]/5 border-[#4A6741]/20 text-[#4A6741]" 
                  : status.type === "error"
                  ? "bg-[#A13D2D]/5 border-[#A13D2D]/20 text-[#A13D2D]"
                  : "bg-blue-50 border-blue-200 text-blue-700"
              }`}
            >
              {status.type === "success" ? (
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              )}
              <span>{status.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
