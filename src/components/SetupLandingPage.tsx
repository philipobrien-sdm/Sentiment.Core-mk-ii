import React, { useRef, useState } from "react";
import Papa from "papaparse";
import { CommentItem, LlmSettings } from "../types";
import { 
  Upload, 
  FileJson, 
  FileSpreadsheet, 
  AlertCircle, 
  HelpCircle, 
  Server, 
  Sliders, 
  Sparkles, 
  Play, 
  Check, 
  Info,
  RefreshCcw
} from "lucide-react";
import { generateDefaultDataset } from "../data/defaultComments";
import { clusterCommentsDynamically } from "../utils/topicClustering";
import { PromptAssistant } from "./PromptAssistant";

interface SetupLandingPageProps {
  llmSettings: LlmSettings;
  onChangeSettings: (settings: LlmSettings) => void;
  onInitializeWithComments: (comments: CommentItem[], summary?: string | null) => void;
  onStartIndexing: (
    texts: string[],
    onProgress?: (completedCount: number, currentEmbeddings: number[][]) => void
  ) => Promise<number[][]>;
  isIndexing: boolean;
  availableModels: string[];
  availableEmbeddingModels: string[];
  onTestConnection: (settings?: LlmSettings) => Promise<void>;
  isTestingConnection: boolean;
}

export const SetupLandingPage: React.FC<SetupLandingPageProps> = ({
  llmSettings,
  onChangeSettings,
  onInitializeWithComments,
  onStartIndexing,
  isIndexing,
  availableModels,
  availableEmbeddingModels,
  onTestConnection,
  isTestingConnection,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState<boolean>(false);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: any[] } | null>(null);
  const [selectedTextField, setSelectedTextField] = useState<string>("");
  const [selectedSentimentField, setSelectedSentimentField] = useState<string>("");
  const [selectedTopicField, setSelectedTopicField] = useState<string>("");
  const [selectedIdField, setSelectedIdField] = useState<string>("");
  const [selectedOrgField, setSelectedOrgField] = useState<string>("");
  const [selectedDocRefField, setSelectedDocRefField] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [fileContext, setFileContext] = useState<string>(llmSettings.datasetContext || "");

  const PRESET_CONTEXTS = [
    {
      icon: "🏛️",
      label: "Public Policy & Zoning",
      context: "Public consultation feedback regarding municipal zoning ordinances, transit expansion, and urban development plans."
    },
    {
      icon: "📱",
      label: "Product & SaaS",
      context: "Customer feedback and app store reviews for a SaaS product release, focusing on usability, performance, and feature requests."
    },
    {
      icon: "💼",
      label: "Employee Survey",
      context: "Internal employee engagement survey responses evaluating organizational culture, leadership communication, and workplace policies."
    },
    {
      icon: "🏥",
      label: "Healthcare & Clinical",
      context: "Patient and medical staff feedback evaluating clinical care quality, appointment scheduling, and facility services."
    },
    {
      icon: "🎓",
      label: "Higher Education",
      context: "Student and faculty comments regarding university curriculum, campus housing, and student support services."
    }
  ];

  const updatePersonaFromContext = (contextText: string) => {
    const trimmed = contextText.trim();
    let generatedPersona = "";
    if (!trimmed) {
      generatedPersona = "You are a Senior Strategic Product & Customer Experience Analyst. Focus heavily on stakeholder sentiment, correctly infer user intent from context, and reconcile opposing friction points while maintaining complete factual integrity with zero hallucinations.";
    } else {
      const upperCtx = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      generatedPersona = `You are an expert Senior Strategic Specialist analyzing stakeholder feedback for the following project context: "${upperCtx}". Focus heavily on stakeholder sentiment in this domain, correctly infer user intent from context, reconcile opposing friction points, and isolate core recurring trends while maintaining complete factual integrity with zero hallucinations.`;
    }

    onChangeSettings({
      ...llmSettings,
      datasetContext: trimmed,
      customPersona: generatedPersona
    });
  };

  // Drag-and-drop support
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setErrorMessage(null);
    if (file.name.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          if (json && Array.isArray(json.comments)) {
            onInitializeWithComments(
              json.comments,
              json.executiveSummary || null
            );
          } else {
            setErrorMessage("Invalid Session JSON format. Must contain a 'comments' array.");
          }
        } catch (err) {
          setErrorMessage("Failed to parse session JSON file.");
        }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith(".csv")) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            const headers = Object.keys(results.data[0]);
            setCsvPreview({
              headers,
              rows: results.data,
            });

            // Auto-detect columns
            const commentHeader = headers.find((h) => {
              const lower = h.toLowerCase();
              return (
                lower.includes("comment") ||
                lower.includes("text") ||
                lower.includes("feedback") ||
                lower.includes("body") ||
                lower.includes("message") ||
                lower.includes("review")
              );
            });
            const sentimentHeader = headers.find((h) => h.toLowerCase().includes("sentiment"));
            const topicHeader = headers.find((h) => {
              const lower = h.toLowerCase();
              return lower.includes("topic") || lower.includes("category") || lower.includes("theme") || lower.includes("cluster");
            });
            const idHeader = headers.find((h) => {
              const lower = h.toLowerCase();
              return lower === "id" || lower.includes("identifier") || lower.includes("comment id") || lower.includes("row id") || lower.includes("feedback id");
            });
            const orgHeader = headers.find((h) => {
              const lower = h.toLowerCase();
              return lower.includes("org") || lower.includes("company") || lower.includes("organization") || lower.includes("account");
            });
            const docRefHeader = headers.find((h) => {
              const lower = h.toLowerCase();
              return (
                lower.includes("doc") ||
                lower.includes("model") ||
                lower.includes("section") ||
                lower.includes("clause") ||
                lower.includes("ref") ||
                lower.includes("reference") ||
                lower.includes("provision") ||
                lower.includes("requirement") ||
                lower.includes("policy") ||
                lower.includes("material") ||
                lower.includes("spec") ||
                lower.includes("paragraph")
              );
            });

            setSelectedTextField(commentHeader || headers[0]);
            setSelectedSentimentField(sentimentHeader || "");
            setSelectedTopicField(topicHeader || "");
            setSelectedIdField(idHeader || "");
            setSelectedOrgField(orgHeader || "");
            setSelectedDocRefField(docRefHeader || "");
          } else {
            setErrorMessage("The uploaded CSV file is empty.");
          }
        },
        error: (err) => {
          setErrorMessage(`Failed to parse CSV: ${err.message}`);
        },
      });
    } else {
      setErrorMessage("Unsupported file type. Please upload a .csv file or .json session.");
    }
  };

  const handleApplyCSVMapping = async () => {
    if (!csvPreview || !selectedTextField) return;

    if (fileContext && fileContext.trim()) {
      updatePersonaFromContext(fileContext);
    }

    try {
      const texts = csvPreview.rows.map((row) => row[selectedTextField]?.toString() || "");
      
      const embeddings = await onStartIndexing(texts, (completedCount, currentEmbeddings) => {
        // Trigger auto-backup download for every 200 embeddings processed!
        if (completedCount % 200 === 0) {
          const partialRows = csvPreview.rows.slice(0, completedCount);
          const formattedComments: CommentItem[] = partialRows.map((row, idx) => {
            const text = row[selectedTextField]?.toString() || "";
            const vector = currentEmbeddings[idx] || [];
            
            let x = 0;
            let y = 0;
            
            if (vector.length >= 2) {
              const half = Math.floor(vector.length / 2);
              const sumA = vector.slice(0, half).reduce((sum, v) => sum + v, 0);
              const sumB = vector.slice(half).reduce((sum, v) => sum + v, 0);
              x = Math.sin(sumA * 4.5) * 0.95;
              y = Math.cos(sumB * 4.5) * 0.95;
            } else {
              x = Math.sin(idx * 0.4) * 0.8;
              y = Math.cos(idx * 0.4) * 0.8;
            }

            let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
            if (selectedSentimentField && row[selectedSentimentField]) {
              const rawS = row[selectedSentimentField].toLowerCase();
              if (rawS.includes("pos") || rawS.includes("good") || rawS.includes("like")) sentiment = 'positive';
              else if (rawS.includes("neg") || rawS.includes("bad") || rawS.includes("hate") || rawS.includes("issue")) sentiment = 'negative';
            } else {
              const lowerText = text.toLowerCase();
              const positiveWords = ["love", "great", "awesome", "perfect", "good", "happy", "value", "gorgeous", "clean", "fast"];
              const negativeWords = ["crash", "slow", "freeze", "expensive", "fail", "bad", "hate", "issue", "lag", "unbearable"];
              const posScore = positiveWords.filter(w => lowerText.includes(w)).length;
              const negScore = negativeWords.filter(w => lowerText.includes(w)).length;
              if (posScore > negScore) sentiment = 'positive';
              else if (negScore > posScore) sentiment = 'negative';
            }

            let topic = "";
            if (selectedTopicField && row[selectedTopicField] && String(row[selectedTopicField]).trim()) {
              topic = String(row[selectedTopicField]).trim();
            }

            const parsedId = selectedIdField && row[selectedIdField] ? String(row[selectedIdField]).trim() : "";
            const finalId = parsedId || `csv_backup_${idx + 1}_${Math.random().toString(36).substr(2, 4)}`;
            const orgName = selectedOrgField && row[selectedOrgField] ? String(row[selectedOrgField]).trim() : undefined;
            const docRef = selectedDocRefField && row[selectedDocRefField] ? String(row[selectedDocRefField]).trim() : undefined;

            return {
              id: finalId,
              text,
              sentiment,
              topic,
              embedding: vector,
              x,
              y,
              isArchived: false,
              timestamp: new Date().toISOString().split('T')[0],
              csvRowIndex: idx + 1,
              originalId: parsedId || finalId,
              organizationName: orgName || undefined,
              documentReference: docRef || undefined,
              originalRowData: row
            };
          });

          const clusterBackupComments = selectedTopicField ? formattedComments : clusterCommentsDynamically(formattedComments);

          const backupSession = {
            comments: clusterBackupComments,
            similarityThreshold: 0.6,
            executiveSummary: null,
          };

          const blob = new Blob([JSON.stringify(backupSession, null, 2)], {
            type: "application/json;charset=utf-8;",
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.setAttribute("download", `session_backup_row_${completedCount}.json`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      });

      const formattedComments: CommentItem[] = csvPreview.rows.map((row, idx) => {
        const text = row[selectedTextField]?.toString() || "";
        const vector = embeddings[idx] || [];
        
        let x = 0;
        let y = 0;
        
        if (vector.length >= 2) {
          const half = Math.floor(vector.length / 2);
          const sumA = vector.slice(0, half).reduce((sum, v) => sum + v, 0);
          const sumB = vector.slice(half).reduce((sum, v) => sum + v, 0);
          x = Math.sin(sumA * 4.5) * 0.95;
          y = Math.cos(sumB * 4.5) * 0.95;
        } else {
          x = Math.sin(idx * 0.4) * 0.8;
          y = Math.cos(idx * 0.4) * 0.8;
        }

        let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
        if (selectedSentimentField && row[selectedSentimentField]) {
          const rawS = row[selectedSentimentField].toLowerCase();
          if (rawS.includes("pos") || rawS.includes("good") || rawS.includes("like")) sentiment = 'positive';
          else if (rawS.includes("neg") || rawS.includes("bad") || rawS.includes("hate") || rawS.includes("issue")) sentiment = 'negative';
        } else {
          const lowerText = text.toLowerCase();
          const positiveWords = ["love", "great", "awesome", "perfect", "good", "happy", "value", "gorgeous", "clean", "fast"];
          const negativeWords = ["crash", "slow", "freeze", "expensive", "fail", "bad", "hate", "issue", "lag", "unbearable"];
          const posScore = positiveWords.filter(w => lowerText.includes(w)).length;
          const negScore = negativeWords.filter(w => lowerText.includes(w)).length;
          if (posScore > negScore) sentiment = 'positive';
          else if (negScore > posScore) sentiment = 'negative';
        }

        let topic = "";
        if (selectedTopicField && row[selectedTopicField] && String(row[selectedTopicField]).trim()) {
          topic = String(row[selectedTopicField]).trim();
        }

        const parsedId = selectedIdField && row[selectedIdField] ? String(row[selectedIdField]).trim() : "";
        const finalId = parsedId || `csv_${idx + 1}_${Math.random().toString(36).substr(2, 4)}`;
        const orgName = selectedOrgField && row[selectedOrgField] ? String(row[selectedOrgField]).trim() : undefined;
        const docRef = selectedDocRefField && row[selectedDocRefField] ? String(row[selectedDocRefField]).trim() : undefined;

        return {
          id: finalId,
          text,
          sentiment,
          topic,
          embedding: vector,
          x,
          y,
          isArchived: false,
          timestamp: new Date().toISOString().split('T')[0],
          csvRowIndex: idx + 1,
          originalId: parsedId || finalId,
          organizationName: orgName || undefined,
          documentReference: docRef || undefined,
          originalRowData: row
        };
      });

      // If no pre-existing topic column is selected, run dynamic topic clustering
      // based strictly on identifiable terms inside the comments themselves
      const finalComments = selectedTopicField ? formattedComments : clusterCommentsDynamically(formattedComments);

      // Final automatic download of processed session JSON with full embeddings for offline testing
      try {
        const completedSession = {
          comments: finalComments,
          similarityThreshold: 0.85,
          executiveSummary: null,
        };
        const blob = new Blob([JSON.stringify(completedSession, null, 2)], {
          type: "application/json;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "final_session_dataset_complete.json");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error("Failed to automatically download the final complete dataset:", err);
      }

      onInitializeWithComments(finalComments);
      setCsvPreview(null);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process and index the dataset.");
    }
  };

  const handleQuickStart = () => {
    if (fileContext && fileContext.trim()) {
      updatePersonaFromContext(fileContext);
    }
    onInitializeWithComments(generateDefaultDataset());
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 space-y-8 animate-in fade-in duration-300">
      
      {/* Title block */}
      <div className="text-center space-y-3 mb-4">
        <h1 className="font-serif italic text-4xl md:text-5xl text-[#1A1A1A] tracking-tight">
          Sentiment.Core
        </h1>
        <p className="text-sm font-light tracking-wide text-gray-500 uppercase max-w-xl mx-auto">
          Local-first semantic explorer for stakeholder feedback, vector cluster maps, and duplicate audits
        </p>
        <div className="w-12 h-px bg-[#E5E3DF] mx-auto pt-1"></div>
      </div>

      {/* Main Form Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        
        {/* Panel 1: Local LLM Configuration */}
        <div className="bg-white border border-[#E5E3DF] p-6 space-y-5 rounded-none shadow-none">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E5E3DF]">
            <Server className="w-4 h-4 text-[#1A1A1A]" />
            <h2 className="font-serif italic text-lg text-[#1A1A1A]">1. Local LLM Settings</h2>
          </div>

          <div className="space-y-4 text-xs">
            {/* Base URL */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                Local LLM API Base URL
              </label>
              <input
                type="text"
                value={llmSettings.baseUrl}
                onChange={(e) => onChangeSettings({ ...llmSettings, baseUrl: e.target.value })}
                placeholder="http://localhost:11434/v1"
                className="w-full bg-white border border-[#E5E3DF] px-3 py-2 text-xs focus:outline-none focus:border-[#1A1A1A] rounded-none font-mono mb-2"
              />
              <button
                type="button"
                disabled={isTestingConnection}
                onClick={() => onTestConnection(llmSettings)}
                className="w-full py-2 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 disabled:bg-gray-300 text-white text-[9px] uppercase tracking-wider font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <RefreshCcw className={`w-3 h-3 ${isTestingConnection ? 'animate-spin' : ''}`} />
                {isTestingConnection ? "Testing & Fetching Models..." : "Test Connection & Fetch Models"}
              </button>
              <p className="text-[9px] text-gray-400 mt-1 uppercase tracking-wider leading-relaxed">
                OpenAI-compatible local server (Ollama, LM Studio, etc.)
              </p>
            </div>

            {/* Model Name */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                Synthesis Chat Model Name
              </label>
              <div className="flex gap-2">
                <select
                  value={availableModels.includes(llmSettings.modelName) ? llmSettings.modelName : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      onChangeSettings({ ...llmSettings, modelName: e.target.value });
                    }
                  }}
                  className="flex-1 bg-white border border-[#E5E3DF] px-2 py-2 text-xs focus:outline-none focus:border-[#1A1A1A] rounded-none"
                >
                  <option value="" disabled>-- Select retrieved model --</option>
                  {availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={llmSettings.modelName}
                  onChange={(e) => onChangeSettings({ ...llmSettings, modelName: e.target.value })}
                  placeholder="llama3"
                  className="w-1/3 bg-white border border-[#E5E3DF] px-2 py-2 text-xs focus:outline-none focus:border-[#1A1A1A] font-mono rounded-none"
                  title="Manual model override"
                />
              </div>
            </div>

            {/* Embeddings Toggle */}
            <div className="pt-3 border-t border-dashed border-[#E5E3DF] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700">Custom Local Embeddings Endpoint</span>
                <input
                  type="checkbox"
                  checked={llmSettings.useCustomEmbedding}
                  onChange={(e) => onChangeSettings({ ...llmSettings, useCustomEmbedding: e.target.checked })}
                  className="w-4 h-4 accent-[#1A1A1A] cursor-pointer"
                />
              </div>

              {llmSettings.useCustomEmbedding ? (
                <div className="space-y-3 p-3 bg-[#F9F8F6] border border-[#E5E3DF] animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                      Embedding Endpoint Base URL
                    </label>
                    <input
                      type="text"
                      value={llmSettings.embeddingUrl}
                      onChange={(e) => onChangeSettings({ ...llmSettings, embeddingUrl: e.target.value })}
                      placeholder="http://localhost:11434/v1"
                      className="w-full bg-white border border-[#E5E3DF] px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-[#1A1A1A] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                      Embedding Model Name
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={availableEmbeddingModels.includes(llmSettings.embeddingModel) ? llmSettings.embeddingModel : ""}
                        onChange={(e) => {
                          if (e.target.value) {
                            onChangeSettings({ ...llmSettings, embeddingModel: e.target.value });
                          }
                        }}
                        className="flex-1 bg-white border border-[#E5E3DF] px-2 py-1.5 text-[11px] focus:outline-none focus:border-[#1A1A1A] rounded-none"
                      >
                        <option value="" disabled>-- Select retrieved model --</option>
                        {availableEmbeddingModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={llmSettings.embeddingModel}
                        onChange={(e) => onChangeSettings({ ...llmSettings, embeddingModel: e.target.value })}
                        placeholder="nomic-embed-text"
                        className="w-1/3 bg-white border border-[#E5E3DF] px-2 py-1.5 text-[11px] focus:outline-none focus:border-[#1A1A1A] font-mono rounded-none"
                        title="Manual embedding model override"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 bg-[#4A6741]/5 border border-[#4A6741]/20 text-[#4A6741]">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p className="text-[10px] leading-relaxed">
                    <strong>Built-in Local Heuristics Active</strong>: Instant, client-side offline projections. No server dependencies or downloads required.
                  </p>
                </div>
              )}
            </div>

            {/* Advanced toggle */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-[#1A1A1A] flex items-center gap-1 cursor-pointer"
              >
                <Sliders className="w-3 h-3" />
                {showAdvanced ? "Hide API Auth Settings" : "Show API Auth Settings"}
              </button>

              {showAdvanced && (
                <div className="mt-3 p-3 border border-[#E5E3DF] space-y-2 animate-in fade-in duration-200">
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                    Authorization Header Bearer Token (Optional)
                  </label>
                  <input
                    type="password"
                    value={llmSettings.apiKey}
                    onChange={(e) => onChangeSettings({ ...llmSettings, apiKey: e.target.value })}
                    placeholder="e.g. sk-..."
                    className="w-full bg-white border border-[#E5E3DF] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#1A1A1A] font-mono"
                  />
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#E5E3DF] space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500">
                  AI Persona & Analysis Guidelines
                </label>
                <button
                  type="button"
                  onClick={() => {
                    onChangeSettings({
                      ...llmSettings,
                      datasetContext: "",
                      customPersona: "You are a Senior Strategic Product & Customer Experience Analyst. Focus heavily on stakeholder sentiment, correctly infer user intent from context, and reconcile opposing friction points while maintaining complete factual integrity with zero hallucinations."
                    });
                  }}
                  className="text-[8px] uppercase tracking-wider text-[#4A6741] hover:underline cursor-pointer font-bold"
                >
                  Reset to Default
                </button>
              </div>

              {llmSettings.datasetContext && (
                <div className="p-2 bg-[#4A6741]/10 border border-[#4A6741]/20 text-[10px] space-y-1">
                  <div className="flex items-center justify-between font-bold text-[#4A6741] uppercase tracking-wider text-[9px]">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Active File Context
                    </span>
                    <button
                      type="button"
                      onClick={() => updatePersonaFromContext(llmSettings.datasetContext || "")}
                      className="hover:underline cursor-pointer"
                    >
                      Re-calibrate
                    </button>
                  </div>
                  <p className="text-gray-700 italic font-serif text-xs leading-snug">
                    "{llmSettings.datasetContext}"
                  </p>
                </div>
              )}

              <PromptAssistant
                llmSettings={llmSettings}
                onPersonaGenerated={(newPersona) => {
                  onChangeSettings({
                    ...llmSettings,
                    customPersona: newPersona
                  });
                }}
              />

              <textarea
                value={llmSettings.customPersona || ""}
                onChange={(e) => onChangeSettings({ ...llmSettings, customPersona: e.target.value })}
                placeholder="e.g., You are a senior policy analyst. You must focus on stakeholder sentiment. You must infer intent, but never make up factual information..."
                rows={4}
                className="w-full bg-white border border-[#E5E3DF] p-2.5 text-xs focus:outline-none focus:border-[#1A1A1A] font-sans rounded-none leading-relaxed resize-none"
              />
              <p className="text-[9px] text-gray-400 uppercase tracking-wider leading-relaxed">
                Define custom roles, analytical focal points, or strict rules the AI must adhere to during synthesis.
              </p>
            </div>
          </div>
        </div>

        {/* Panel 2: Dataset Loading Operations */}
        <div className="space-y-6">
          <div className="bg-white border border-[#E5E3DF] p-6 space-y-5 rounded-none shadow-none">
            <div className="flex items-center gap-2 pb-3 border-b border-[#E5E3DF]">
              <Upload className="w-4 h-4 text-[#1A1A1A]" />
              <h2 className="font-serif italic text-lg text-[#1A1A1A]">2. Load Stakeholder Data</h2>
            </div>

            {/* Initial Context for File before upload */}
            {!csvPreview && (
              <div className="p-3 bg-[#4A6741]/5 border border-[#4A6741]/20 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#4A6741] font-mono flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#4A6741]" />
                    Initial File Context & Purpose
                  </label>
                  <span className="text-[9px] text-[#4A6741] font-mono font-semibold">Calibrates AI Persona</span>
                </div>
                <input
                  type="text"
                  value={fileContext}
                  onChange={(e) => {
                    setFileContext(e.target.value);
                    updatePersonaFromContext(e.target.value);
                  }}
                  placeholder="e.g. Public stakeholder feedback on 2026 Downtown Mobility Master Plan..."
                  className="w-full bg-white border border-[#E5E3DF] px-3 py-2 text-xs focus:outline-none focus:border-[#4A6741] rounded-none"
                />
                <div className="flex flex-wrap gap-1 pt-1">
                  <span className="text-[9px] text-gray-400 font-mono self-center mr-1">Domain Presets:</span>
                  {PRESET_CONTEXTS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setFileContext(preset.context);
                        updatePersonaFromContext(preset.context);
                      }}
                      className="px-2 py-0.5 bg-white hover:bg-emerald-50 border border-gray-200 hover:border-[#4A6741] text-[9px] text-gray-700 cursor-pointer transition-all"
                    >
                      {preset.icon} {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Drag & Drop Frame */}
            {!csvPreview && (
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed p-8 text-center cursor-pointer transition-all rounded-none ${
                  dragActive
                    ? "border-[#1A1A1A] bg-[#F9F8F6]"
                    : "border-[#E5E3DF] hover:border-[#1A1A1A] bg-[#F9F8F6]/20 hover:bg-[#F9F8F6]/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 border border-[#E5E3DF] flex items-center justify-center text-[#1A1A1A] bg-white">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#1A1A1A]">
                      Upload CSV file or Restore JSON Session
                    </p>
                    <span className="text-[10px] text-gray-400 block mt-1 uppercase tracking-wider">
                      Drag and drop file here, or click to browse
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Column Mapping block inside CSV preview */}
            {csvPreview && (
              <div className="space-y-4 p-4 bg-[#F9F8F6] border border-[#E5E3DF] animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-[#E5E3DF] pb-2">
                  <span className="text-xs font-bold text-[#1A1A1A] flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#4A6741]" /> Configure CSV Dataset & AI Persona
                  </span>
                  <span className="text-[9px] bg-white border border-[#E5E3DF] text-gray-500 px-2 py-0.5 font-mono">
                    {csvPreview.rows.length} rows
                  </span>
                </div>

                {/* File Context & AI Persona Setup Box */}
                <div className="p-3 bg-[#4A6741]/5 border border-[#4A6741]/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A1A1A] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#4A6741]" /> Initial Context for CSV File
                    </span>
                    <span className="text-[9px] bg-[#4A6741] text-white px-2 py-0.5 font-mono font-bold uppercase tracking-wider">
                      Live Persona Sync
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-600 leading-relaxed font-sans">
                    Specify the initial background or domain purpose for this file. This context will directly calibrate the AI's persona prompt for tailored executive synthesis.
                  </p>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                      File Context / Domain Purpose
                    </label>
                    <textarea
                      value={fileContext}
                      onChange={(e) => {
                        setFileContext(e.target.value);
                        updatePersonaFromContext(e.target.value);
                      }}
                      placeholder="e.g. Public stakeholder consultation comments regarding the 2026 Downtown Zoning Ordinance and Transit Expansion..."
                      rows={2}
                      className="w-full bg-white border border-[#E5E3DF] p-2 text-xs focus:outline-none focus:border-[#4A6741] resize-none rounded-none font-sans"
                    />
                  </div>

                  {/* Domain Presets */}
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[9px] text-gray-400 font-mono self-center mr-1">Quick Presets:</span>
                    {PRESET_CONTEXTS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setFileContext(p.context);
                          updatePersonaFromContext(p.context);
                        }}
                        className="px-2 py-0.5 bg-white hover:bg-emerald-50 border border-gray-200 hover:border-[#4A6741] text-[9px] text-gray-700 transition-all cursor-pointer"
                      >
                        {p.icon} {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Persona System Prompt Preview */}
                  <div className="pt-2 border-t border-[#4A6741]/20 space-y-1">
                    <div className="flex items-center justify-between text-[9px] font-mono font-bold text-gray-500 uppercase tracking-wider">
                      <span>Calibrated AI System Persona Prompt:</span>
                      <button
                        type="button"
                        onClick={() => updatePersonaFromContext(fileContext)}
                        className="text-[#4A6741] hover:underline cursor-pointer flex items-center gap-1 font-bold"
                      >
                        <RefreshCcw className="w-2.5 h-2.5" /> Re-sync Persona
                      </button>
                    </div>
                    <div className="p-2 bg-white border border-gray-200 text-[11px] font-mono text-gray-800 leading-snug max-h-24 overflow-y-auto border-l-2 border-l-[#4A6741]">
                      {llmSettings.customPersona || "No custom persona configured."}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                      Text/Comment Column (Required)
                    </label>
                    <select
                      value={selectedTextField}
                      onChange={(e) => setSelectedTextField(e.target.value)}
                      className="w-full bg-white border border-[#E5E3DF] px-2 py-1.5 rounded-none text-xs focus:outline-none"
                    >
                      <option value="" disabled>Select column...</option>
                      {csvPreview.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                      Sentiment Column (Optional)
                    </label>
                    <select
                      value={selectedSentimentField}
                      onChange={(e) => setSelectedSentimentField(e.target.value)}
                      className="w-full bg-white border border-[#E5E3DF] px-2 py-1.5 rounded-none text-xs focus:outline-none"
                    >
                      <option value="">-- Auto-detect sentiment --</option>
                      {csvPreview.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                      Topic Cluster Column (Optional)
                    </label>
                    <select
                      value={selectedTopicField}
                      onChange={(e) => setSelectedTopicField(e.target.value)}
                      className="w-full bg-white border border-[#E5E3DF] px-2 py-1.5 rounded-none text-xs focus:outline-none"
                    >
                      <option value="">-- Auto-cluster by keywords --</option>
                      {csvPreview.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                      Comment ID Column (Optional)
                    </label>
                    <select
                      value={selectedIdField}
                      onChange={(e) => setSelectedIdField(e.target.value)}
                      className="w-full bg-white border border-[#E5E3DF] px-2 py-1.5 rounded-none text-xs focus:outline-none"
                    >
                      <option value="">-- Auto-generate unique IDs --</option>
                      {csvPreview.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                      Organization Name Column (Optional)
                    </label>
                    <select
                      value={selectedOrgField}
                      onChange={(e) => setSelectedOrgField(e.target.value)}
                      className="w-full bg-white border border-[#E5E3DF] px-2 py-1.5 rounded-none text-xs focus:outline-none"
                    >
                      <option value="">-- None / No organization data --</option>
                      {csvPreview.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-amber-800 uppercase tracking-widest mb-1 flex items-center justify-between">
                      <span>Document Model / Ref / Section Column (Optional)</span>
                      <span className="text-gray-400 normal-case font-mono text-[9px]">Links to Doc Model Context</span>
                    </label>
                    <select
                      value={selectedDocRefField}
                      onChange={(e) => setSelectedDocRefField(e.target.value)}
                      className="w-full bg-amber-50/50 border border-amber-300 px-2 py-1.5 rounded-none text-xs focus:outline-none font-mono text-[#1A1A1A] font-medium"
                    >
                      <option value="">-- Auto-detect or omit document reference --</option>
                      {csvPreview.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-[#E5E3DF]">
                  <button
                    onClick={() => setCsvPreview(null)}
                    className="flex-1 text-center py-2 text-[10px] uppercase tracking-wider font-semibold text-[#1A1A1A] border border-[#E5E3DF] bg-white hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!selectedTextField || isIndexing}
                    onClick={handleApplyCSVMapping}
                    className="flex-1 py-2 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white text-[10px] uppercase tracking-wider font-bold rounded-none flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isIndexing ? "Indexing..." : "Apply & Initialize"}
                  </button>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 bg-[#A13D2D]/5 border border-[#A13D2D]/20 text-[#A13D2D] text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Quick Start / Load Sample Dataset option */}
          {!csvPreview && (
            <div className="bg-white border border-[#E5E3DF] p-6 text-center space-y-4 rounded-none shadow-none">
              <div className="flex items-center justify-center gap-1 text-xs text-gray-400 uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5 text-gray-400" />
                <span>No dataset on hand?</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
                Explore the workspace immediately using 120+ pre-compiled stakeholder comment records grouped into structured clusters.
              </p>
              <button
                onClick={handleQuickStart}
                className="w-full py-2.5 bg-white border border-[#1A1A1A] hover:bg-[#F9F8F6] text-[#1A1A1A] text-[10px] uppercase tracking-widest font-bold rounded-none transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Quick Start with Demo Data</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Security note footer */}
      <div className="text-center text-[10px] uppercase tracking-wider text-gray-400">
        🔒 All calculations and imports run inside your local browser. No personal data leaves this device.
      </div>
    </div>
  );
};
