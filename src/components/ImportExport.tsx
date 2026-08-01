import React, { useRef, useState } from "react";
import Papa from "papaparse";
import { CommentItem } from "../types";
import { Upload, Download, FileSpreadsheet, FileJson, AlertCircle, HelpCircle, Loader2, Globe, FileCode2 } from "lucide-react";
import { clusterCommentsDynamically } from "../utils/topicClustering";

interface ImportExportProps {
  onImportSession: (sessionData: {
    comments: CommentItem[];
    similarityThreshold: number;
    executiveSummary: string | null;
  }) => void;
  onExportSession: () => void;
  onExportOfflineHtml: () => void;
  onImportCSV: (newComments: CommentItem[]) => void;
  onStartIndexing: (
    texts: string[],
    onProgress?: (completedCount: number, currentEmbeddings: number[][]) => void
  ) => Promise<number[][]>;
  isIndexing: boolean;
}

export const ImportExport: React.FC<ImportExportProps> = ({
  onImportSession,
  onExportSession,
  onExportOfflineHtml,
  onImportCSV,
  onStartIndexing,
  isIndexing,
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

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Process selected files (drag-dropped or manual file explorer selection)
  const processFile = (file: File) => {
    setErrorMessage(null);
    if (file.name.endsWith(".json")) {
      // Parse Session JSON
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          if (json && Array.isArray(json.comments)) {
            onImportSession({
              comments: json.comments,
              similarityThreshold: json.similarityThreshold || 0.85,
              executiveSummary: json.executiveSummary || null,
            });
            setCsvPreview(null);
          } else {
            setErrorMessage("Invalid Session JSON format. Must contain a 'comments' array.");
          }
        } catch (err) {
          setErrorMessage("Failed to parse JSON file.");
        }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith(".csv")) {
      // Parse CSV File
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

            // Smart auto-detection of feedback column headers
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
                lower.includes("page") ||
                lower.includes("article") ||
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
            setErrorMessage("The uploaded CSV file appears to be empty.");
          }
        },
        error: (err) => {
          setErrorMessage(`Failed to parse CSV: ${err.message}`);
        },
      });
    } else {
      setErrorMessage("Unsupported file type. Please upload a .csv dataset or .json session.");
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

  // Parse mapped CSV rows into standard comment format & request coordinates
  const handleApplyCSVMapping = async () => {
    if (!csvPreview || !selectedTextField) return;

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

      // Programmatic 2D Projection mapping based on embeddings
      // Uses a deterministic standard projection algorithm to create clustered X, Y coordinates
      const formattedComments: CommentItem[] = csvPreview.rows.map((row, idx) => {
        const text = row[selectedTextField]?.toString() || "";
        const vector = embeddings[idx] || [];
        
        // Custom simple dimensional reduction (t-SNE/PCA approximation) for 2D Canvas plot
        let x = 0;
        let y = 0;
        
        if (vector.length >= 2) {
          // Project using vector subsections
          const half = Math.floor(vector.length / 2);
          const sumA = vector.slice(0, half).reduce((sum, v) => sum + v, 0);
          const sumB = vector.slice(half).reduce((sum, v) => sum + v, 0);
          
          // Magnify variance to map nicely between [-1, 1]
          x = Math.sin(sumA * 4.5) * 0.95;
          y = Math.cos(sumB * 4.5) * 0.95;
        } else {
          // Fallback coordinate circle
          x = Math.sin(idx * 0.4) * 0.8;
          y = Math.cos(idx * 0.4) * 0.8;
        }

        // Auto-assign sentiment if not present in CSV columns
        let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
        if (selectedSentimentField && row[selectedSentimentField]) {
          const rawS = row[selectedSentimentField].toLowerCase();
          if (rawS.includes("pos") || rawS.includes("good") || rawS.includes("like")) sentiment = 'positive';
          else if (rawS.includes("neg") || rawS.includes("bad") || rawS.includes("hate") || rawS.includes("issue")) sentiment = 'negative';
        } else {
          // Simple rule-based lexical guesser as a fast default
          const lowerText = text.toLowerCase();
          const positiveWords = ["love", "great", "awesome", "perfect", "good", "happy", "value", "gorgeous", "clean", "fast"];
          const negativeWords = ["crash", "slow", "freeze", "expensive", "fail", "bad", "hate", "issue", "lag", "unbearable"];
          
          const posScore = positiveWords.filter(w => lowerText.includes(w)).length;
          const negScore = negativeWords.filter(w => lowerText.includes(w)).length;
          
          if (posScore > negScore) sentiment = 'positive';
          else if (negScore > posScore) sentiment = 'negative';
        }

        // Auto-assign topic cluster if not present
        let topic = "";
        if (selectedTopicField && row[selectedTopicField] && String(row[selectedTopicField]).trim()) {
          topic = String(row[selectedTopicField]).trim();
        }

        const parsedId = selectedIdField && row[selectedIdField] ? String(row[selectedIdField]).trim() : "";
        const finalId = parsedId || `csv_rec_${idx + 1}`;
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

      onImportCSV(finalComments);
      setCsvPreview(null);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process and index the dataset.");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
      {/* CSV/JSON Importer Card */}
      <div className="bg-white p-6 border border-[#E5E3DF] rounded-none flex flex-col justify-between shadow-none">
        <div>
          <h2 className="font-serif italic text-base text-[#1A1A1A] mb-2 flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#1A1A1A]" /> Upload Data Center
          </h2>
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            Drag & drop your feedback datasets. We support importing raw **CSV** lists or restoring complete **JSON** active session states.
          </p>

          {/* Upload Drag zone */}
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
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 border border-[#E5E3DF] rounded-none flex items-center justify-center text-[#1A1A1A] mb-1">
                  <Upload className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-[#1A1A1A]">
                  Drag and drop file here, or click to browse
                </p>
                <span className="text-[9px] text-gray-400 uppercase tracking-wider">
                  Supports CSV (comment list) or JSON (session recovery)
                </span>
              </div>
            </div>
          )}

          {/* Error banner */}
          {errorMessage && (
            <div className="bg-[#A13D2D]/5 text-[#A13D2D] border border-[#A13D2D]/15 rounded-none p-3 text-xs flex items-center gap-2 mt-4">
              <AlertCircle className="w-4 h-4 text-[#A13D2D] shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* CSV Column Mapping Panel */}
          {csvPreview && (
            <div className="bg-[#F9F8F6] p-4 border border-[#E5E3DF] rounded-none mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1A1A1A] flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-[#4A6741]" /> Mapped CSV Configuration
                </span>
                <span className="text-[9px] bg-white border border-[#E5E3DF] text-[#1A1A1A] px-2 py-0.5 rounded-none font-mono font-bold uppercase tracking-wider">
                  {csvPreview.rows.length} rows loaded
                </span>
              </div>

              <div className="space-y-3 text-xs">
                {/* 1. Comments Column Mapper */}
                <div>
                  <label className="font-semibold text-gray-600 block mb-1.5 uppercase tracking-wider text-[9px]">
                    Identify Feedback Text Column (Required):
                  </label>
                  <select
                    value={selectedTextField}
                    onChange={(e) => setSelectedTextField(e.target.value)}
                    className="w-full bg-white border border-[#E5E3DF] rounded-none px-2.5 py-1.5 focus:outline-none focus:border-[#1A1A1A] text-xs"
                  >
                    <option value="" disabled>Select Column...</option>
                    {csvPreview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Sentiment Column Mapper */}
                <div>
                  <label className="font-semibold text-gray-600 block mb-1.5 uppercase tracking-wider text-[9px]">
                    Sentiment Column (Optional, otherwise auto-guessed):
                  </label>
                  <select
                    value={selectedSentimentField}
                    onChange={(e) => setSelectedSentimentField(e.target.value)}
                    className="w-full bg-white border border-[#E5E3DF] rounded-none px-2.5 py-1.5 focus:outline-none focus:border-[#1A1A1A] text-xs"
                  >
                    <option value="">-- Let AI Classifier Handle Sentiment --</option>
                    {csvPreview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* 3. Topic Column Mapper */}
                <div>
                  <label className="font-semibold text-gray-600 block mb-1.5 uppercase tracking-wider text-[9px]">
                    Topic Cluster Column (Optional, otherwise auto-clustered):
                  </label>
                  <select
                    value={selectedTopicField}
                    onChange={(e) => setSelectedTopicField(e.target.value)}
                    className="w-full bg-white border border-[#E5E3DF] rounded-none px-2.5 py-1.5 focus:outline-none focus:border-[#1A1A1A] text-xs"
                  >
                    <option value="">-- Let AI Classifier Group Into Clusters --</option>
                    {csvPreview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* 4. Comment ID Column Mapper */}
                <div>
                  <label className="font-semibold text-gray-600 block mb-1.5 uppercase tracking-wider text-[9px]">
                    Comment ID Column (Optional, otherwise auto-generated):
                  </label>
                  <select
                    value={selectedIdField}
                    onChange={(e) => setSelectedIdField(e.target.value)}
                    className="w-full bg-white border border-[#E5E3DF] rounded-none px-2.5 py-1.5 focus:outline-none focus:border-[#1A1A1A] text-xs"
                  >
                    <option value="">-- Auto-generate unique IDs --</option>
                    {csvPreview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* 5. Organization Name Column Mapper */}
                <div>
                  <label className="font-semibold text-gray-600 block mb-1.5 uppercase tracking-wider text-[9px]">
                    Organization Name Column (Optional, otherwise omitted):
                  </label>
                  <select
                    value={selectedOrgField}
                    onChange={(e) => setSelectedOrgField(e.target.value)}
                    className="w-full bg-white border border-[#E5E3DF] rounded-none px-2.5 py-1.5 focus:outline-none focus:border-[#1A1A1A] text-xs"
                  >
                    <option value="">-- None / No organization data --</option>
                    {csvPreview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* 6. Document Reference / Section / Model Column Mapper */}
                <div>
                  <label className="font-semibold text-amber-800 block mb-1.5 uppercase tracking-wider text-[9px] flex items-center justify-between">
                    <span>Document Model / Ref / Section Column (Optional):</span>
                    <span className="text-gray-400 normal-case font-mono text-[9px]">Links to Doc Model Context</span>
                  </label>
                  <select
                    value={selectedDocRefField}
                    onChange={(e) => setSelectedDocRefField(e.target.value)}
                    className="w-full bg-amber-50/50 border border-amber-300 rounded-none px-2.5 py-1.5 focus:outline-none focus:border-[#1A1A1A] text-xs font-mono font-medium text-[#1A1A1A]"
                  >
                    <option value="">-- Auto-detect or omit document reference --</option>
                    {csvPreview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setCsvPreview(null)}
                  className="flex-1 text-center py-2 text-[10px] uppercase tracking-wider font-semibold text-[#1A1A1A] border border-[#E5E3DF] hover:border-[#1A1A1A] rounded-none bg-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={!selectedTextField || isIndexing}
                  onClick={handleApplyCSVMapping}
                  className="flex-1 py-2 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white text-[10px] uppercase tracking-wider font-semibold rounded-none flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isIndexing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Indexing Vectors...
                    </>
                  ) : (
                    <>
                      Apply & Index Dataset
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-[#E5E3DF] text-[9px] uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-gray-300" />
          <span>Uploads are processed locally. Embeddings are generated in secure server-side calls.</span>
        </div>
      </div>

      {/* Exporter Card */}
      <div className="bg-white p-6 border border-[#E5E3DF] rounded-none flex flex-col justify-between shadow-none">
        <div>
          <h2 className="font-serif italic text-base text-[#1A1A1A] mb-2 flex items-center gap-2">
            <Download className="w-4 h-4 text-[#1A1A1A]" /> Export Session Hub
          </h2>
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            Preserve and share your complete diagnostic snapshot. Generate a standalone self-contained HTML dashboard or save raw session state for re-importing.
          </p>

          <div className="space-y-3">
            <div className="border border-[#4A6741]/30 rounded-none p-4 bg-[#F4F7F3] flex flex-col gap-2">
              <div className="flex items-center gap-2 font-bold text-xs text-[#2D4526]">
                <Globe className="w-4 h-4 text-[#4A6741]" />
                <span>Standalone Interactive HTML Dashboard</span>
              </div>
              <span className="text-[10px] text-gray-600 leading-relaxed">
                Generates a fully self-contained offline HTML file with interactive tabs, live dataset filtering, stakeholder matrix, custom topic clusters, and synthesis reports. Perfect for sharing with stakeholders!
              </span>
              <button
                onClick={onExportOfflineHtml}
                className="w-full mt-2 py-2.5 bg-[#4A6741] hover:bg-[#3D5535] text-white font-bold text-[10px] uppercase tracking-widest rounded-none flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <FileCode2 className="w-4 h-4 text-emerald-200" /> Export Offline HTML Snapshot (.html)
              </button>
            </div>

            <div className="border border-[#E5E3DF] rounded-none p-4 bg-[#F9F8F6] flex flex-col gap-2">
              <div className="flex items-center gap-2 font-bold text-xs text-[#1A1A1A]">
                <FileJson className="w-4 h-4 text-[#1A1A1A]" />
                <span>Raw Application Session Data (.json)</span>
              </div>
              <span className="text-[10px] text-gray-500 leading-relaxed">
                Save raw vector embeddings, custom topic labels, archived duplicates, and text structures to re-import into this application later.
              </span>
              <button
                onClick={onExportSession}
                className="w-full mt-2 py-2 border border-[#1A1A1A] hover:bg-[#F9F8F6] text-[#1A1A1A] font-bold text-[10px] uppercase tracking-widest rounded-none flex items-center justify-center gap-2 transition-all bg-white cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Export Session JSON (.json)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
