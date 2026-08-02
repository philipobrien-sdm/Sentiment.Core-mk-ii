import React, { useState, useMemo, useEffect } from "react";
import { DocumentSection, CommentItem, SupportingDocContextItem, IngestedLibraryDocument, DocFlag } from "../types";
import {
  FileText,
  X,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  Copy,
  BookOpen,
  FileCode2,
  Upload,
  Layers,
  Save,
  Flag,
  Library,
  Code,
  ShieldAlert,
  CheckSquare,
  Square
} from "lucide-react";
import {
  syncDocumentSectionsWithComments,
  parsePastedDocumentToSections,
  extractDocumentReferencesFromComments,
  ingestDocumentExtractionRecordJSON
} from "../utils/documentContext";
import { getDeterministicPseudoEmbedding } from "../utils/localLlm";

interface DocumentContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  comments: CommentItem[];
  sections?: DocumentSection[];
  documentSections?: DocumentSection[];
  onSaveSections?: (sections: DocumentSection[]) => void;
  onUpdateDocumentSections?: (sections: DocumentSection[]) => void;
  supportingItems?: SupportingDocContextItem[];
  onSaveSupportingItems?: (items: SupportingDocContextItem[]) => void;
  libraryDocuments?: IngestedLibraryDocument[];
  onSaveLibraryDocuments?: (docs: IngestedLibraryDocument[]) => void;
  showToast: (message: string, type?: "success" | "info" | "error") => void;
}

const SCHEMA_JSON_DRAFT07 = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DocumentExtractionRecord",
  "description": "Standardized schema for factual, referenced document extraction pipeline.",
  "type": "object",
  "required": [
    "metadata",
    "executiveSummary",
    "documentSections",
    "mainThemes",
    "keyDataPoints",
    "facts",
    "assumptions",
    "assertions",
    "expectations",
    "constraints"
  ],
  "properties": {
    "metadata": {
      "type": "object",
      "required": ["fileId", "fileName", "fileType", "fileSizeFormatted", "totalPages", "processedAt"],
      "properties": {
        "fileId": { "type": "string" },
        "fileName": { "type": "string" },
        "fileType": { "type": "string" },
        "fileSizeFormatted": { "type": "string" },
        "totalPages": { "type": "integer", "minimum": 1 },
        "hash": { "type": "string" },
        "processedAt": { "type": "string", "format": "date-time" }
      }
    },
    "executiveSummary": { "type": "string" },
    "documentSections": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "heading", "pageNumber"],
        "properties": {
          "id": { "type": "string" },
          "heading": { "type": "string" },
          "pageNumber": { "type": "integer" },
          "summary": { "type": "string" }
        }
      }
    },
    "assertions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "statement", "citations"],
        "properties": {
          "id": { "type": "string" },
          "statement": { "type": "string" },
          "assertedBy": { "type": "string" },
          "citations": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["pageNumber", "snippet"],
              "properties": {
                "pageNumber": { "type": "integer" },
                "snippet": { "type": "string" },
                "sectionHeader": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "assumptions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "statement", "context", "citations"],
        "properties": {
          "id": { "type": "string" },
          "statement": { "type": "string" },
          "context": { "type": "string" },
          "citations": { "type": "array" }
        }
      }
    },
    "constraints": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "constraint", "constraintType", "citations"],
        "properties": {
          "id": { "type": "string" },
          "constraint": { "type": "string" },
          "constraintType": { "type": "string", "enum": ["technical", "financial", "regulatory", "operational", "security", "other"] },
          "citations": { "type": "array" }
        }
      }
    }
  }
}`;

const OPENAPI_3_SPEC = `openapi: 3.0.3
info:
  title: Document Extraction & Knowledge Integration API
  version: 1.0.0
  description: Ingest standardized document extraction records into vector intelligence hub.
paths:
  /api/documents/ingest:
    post:
      summary: Ingest document extraction record
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DocumentExtractionRecord'
      responses:
        '200':
          description: Document successfully added to bookshelf and vector RAG index.
components:
  schemas:
    DocumentExtractionRecord:
      type: object;`;

const TYPESCRIPT_TYPINGS = `export interface SourceCitation {
  pageNumber: number;
  snippet: string;
  sectionHeader?: string;
  relevanceScore?: number;
}

export interface DocumentExtractionRecord {
  metadata: {
    fileId: string;
    fileName: string;
    fileType: string;
    fileSizeFormatted: string;
    totalPages: number;
    hash?: string;
    processedAt: string;
  };
  executiveSummary: string;
  documentSections: { id: string; heading: string; pageNumber: number; summary?: string }[];
  assertions: { id: string; statement: string; assertedBy?: string; citations: SourceCitation[] }[];
  assumptions: { id: string; statement: string; context: string; citations: SourceCitation[] }[];
  constraints: { id: string; constraint: string; constraintType: string; citations: SourceCitation[] }[];
}`;

export const DocumentContextModal: React.FC<DocumentContextModalProps> = ({
  isOpen,
  onClose,
  comments = [],
  sections,
  documentSections,
  onSaveSections,
  onUpdateDocumentSections,
  supportingItems = [],
  onSaveSupportingItems,
  libraryDocuments = [],
  onSaveLibraryDocuments,
  showToast,
}) => {
  if (!isOpen) return null;

  const activeSections = useMemo(() => {
    return sections || documentSections || [];
  }, [sections, documentSections]);

  const [activeModalTab, setActiveModalTab] = useState<'items' | 'library' | 'sections' | 'schema'>('items');

  const handleUpdateSections = (updated: DocumentSection[]) => {
    if (onSaveSections) onSaveSections(updated);
    if (onUpdateDocumentSections) onUpdateDocumentSections(updated);
  };

  const handleUpdateItems = (updated: SupportingDocContextItem[]) => {
    if (onSaveSupportingItems) onSaveSupportingItems(updated);
  };

  const handleUpdateDocs = (updated: IngestedLibraryDocument[]) => {
    if (onSaveLibraryDocuments) onSaveLibraryDocuments(updated);
  };

  // Section mapping states
  const [selectedSectionId, setSelectedSectionId] = useState<string>(activeSections[0]?.id || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [newRefInput, setNewRefInput] = useState("");
  const [pastedFullDoc, setPastedFullDoc] = useState("");
  const [isPastingFullDocOpen, setIsPastingFullDocOpen] = useState(false);

  // Manual Supporting Item Entry state
  const [itemSourceInput, setItemSourceInput] = useState("");
  const [itemFlagInput, setItemFlagInput] = useState<DocFlag>("Constraint");
  const [itemContentInput, setItemContentInput] = useState("");

  // JSON Ingestion state
  const [jsonIngestText, setJsonIngestText] = useState("");
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);

  // Selected section state
  const selectedSection = useMemo(() => {
    if (!activeSections || activeSections.length === 0) return null;
    return activeSections.find((s) => s.id === selectedSectionId) || activeSections[0] || null;
  }, [activeSections, selectedSectionId]);

  const [editingExcerpt, setEditingExcerpt] = useState<string>(selectedSection?.excerptText || "");

  React.useEffect(() => {
    if (selectedSection) {
      setEditingExcerpt(selectedSection.excerptText || "");
    }
  }, [selectedSection?.id]);

  // Counts & Filters for Supporting Items
  const [itemFilterFlag, setItemFilterFlag] = useState<string>("all");
  const [displayLimit, setDisplayLimit] = useState<number>(80);

  useEffect(() => {
    setDisplayLimit(80);
  }, [itemFilterFlag, searchQuery]);

  const filteredSupportingItems = useMemo(() => {
    return supportingItems.filter((i) => {
      const matchesFlag = itemFilterFlag === "all" || i.flag === itemFilterFlag;
      const matchesSearch =
        !searchQuery ||
        i.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.content.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFlag && matchesSearch;
    });
  }, [supportingItems, itemFilterFlag, searchQuery]);

  const visibleSupportingItems = useMemo(() => {
    return filteredSupportingItems.slice(0, displayLimit);
  }, [filteredSupportingItems, displayLimit]);

  // Handle manual item add
  const handleAddManualItem = () => {
    if (!itemSourceInput.trim() || !itemContentInput.trim()) {
      showToast("Please fill in both Source and Content fields.", "error");
      return;
    }

    const newItem: SupportingDocContextItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      source: itemSourceInput.trim(),
      flag: itemFlagInput,
      content: itemContentInput.trim(),
      isActive: true,
      category: itemFlagInput,
      embedding: getDeterministicPseudoEmbedding(`${itemSourceInput} ${itemFlagInput} ${itemContentInput}`),
      updatedAt: new Date().toLocaleDateString()
    };

    handleUpdateItems([newItem, ...supportingItems]);
    setItemSourceInput("");
    setItemContentInput("");
    showToast(`Added supporting context item: "${newItem.source}" [${newItem.flag}]`, "success");
  };

  // Toggle item active state
  const handleToggleItemActive = (id: string) => {
    const updated = supportingItems.map((i) => (i.id === id ? { ...i, isActive: !i.isActive } : i));
    handleUpdateItems(updated);
  };

  // Delete item
  const handleDeleteItem = (id: string) => {
    const updated = supportingItems.filter((i) => i.id !== id);
    handleUpdateItems(updated);
    showToast("Removed supporting context item.", "info");
  };

  const handleClearAllSupportingItems = () => {
    if (supportingItems.length === 0) return;
    handleUpdateItems([]);
    showToast("Cleared all supporting context items.", "info");
  };

  // Delete Library Document
  const handleDeleteLibraryDocument = (docId: string) => {
    const docToRemove = libraryDocuments.find((d) => d.id === docId);
    const updatedDocs = libraryDocuments.filter((d) => d.id !== docId);
    handleUpdateDocs(updatedDocs);

    // Also remove associated extracted supporting items if any
    if (docToRemove?.record?.metadata) {
      const { fileName, fileId } = docToRemove.record.metadata;
      const updatedItems = supportingItems.filter((item) => {
        const matchesName = fileName && item.source.toLowerCase().includes(fileName.toLowerCase());
        const matchesId = fileId && item.source.toLowerCase().includes(fileId.toLowerCase());
        return !(matchesName || matchesId);
      });
      if (updatedItems.length < supportingItems.length) {
        handleUpdateItems(updatedItems);
      }
    }

    showToast(`Removed "${docToRemove?.record?.metadata?.fileName || 'document'}" from bookshelf library.`, "info");
  };

  const handleClearAllLibraryDocuments = () => {
    if (libraryDocuments.length === 0) return;
    handleUpdateDocs([]);
    showToast("Cleared all ingested library documents.", "info");
  };

  // Delete Clause Section
  const handleDeleteSection = (secId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const secToRemove = activeSections.find((s) => s.id === secId);
    const updated = activeSections.filter((s) => s.id !== secId);
    handleUpdateSections(updated);
    if (selectedSectionId === secId) {
      setSelectedSectionId(updated[0]?.id || "");
    }
    showToast(`Removed section "${secToRemove?.reference || 'clause'}"`, "info");
  };

  const handleClearAllSections = () => {
    if (activeSections.length === 0) return;
    handleUpdateSections([]);
    setSelectedSectionId("");
    showToast("Cleared all clause sections.", "info");
  };

  // Handle JSON Ingestion
  const handleIngestJSON = () => {
    if (!jsonIngestText.trim()) {
      showToast("Please paste valid DocumentExtractionRecord JSON.", "error");
      return;
    }

    try {
      const { updatedDocs, updatedItems, countAdded } = ingestDocumentExtractionRecordJSON(
        jsonIngestText,
        libraryDocuments,
        supportingItems
      );

      handleUpdateDocs(updatedDocs);
      handleUpdateItems(updatedItems);

      setIsIngestModalOpen(false);
      setJsonIngestText("");
      showToast(`Successfully ingested document! Extracted ${countAdded} assertions, assumptions, and constraints into RAG library.`, "success");
    } catch (err: any) {
      showToast(`JSON Ingestion Error: ${err.message}`, "error");
    }
  };

  // Auto-Sync sections from CSV Comments
  const handleAutoExtractRefs = () => {
    const updated = syncDocumentSectionsWithComments(comments, activeSections);
    handleUpdateSections(updated);
    const addedCount = updated.length - activeSections.length;
    if (addedCount > 0) {
      showToast(`Discovered and added ${addedCount} document references from dataset!`, "success");
    } else {
      showToast("Document model is up to date with dataset references.", "info");
    }
  };

  // Add custom single section
  const handleAddCustomSection = () => {
    if (!newRefInput.trim()) return;
    const refName = newRefInput.trim();
    const exists = activeSections.some((s) => s.reference.toLowerCase() === refName.toLowerCase());
    if (exists) {
      showToast("A section with this reference name already exists.", "info");
      return;
    }

    const newSec: DocumentSection = {
      id: `doc_sec_${Date.now()}`,
      reference: refName,
      title: refName,
      excerptText: "",
      updatedAt: new Date().toLocaleDateString(),
    };

    const updated = [newSec, ...activeSections];
    handleUpdateSections(updated);
    setSelectedSectionId(newSec.id);
    setNewRefInput("");
    showToast(`Added document section "${refName}"`, "success");
  };

  // Save current excerpt
  const handleSaveCurrentExcerpt = () => {
    if (!selectedSection) return;
    const updated = activeSections.map((s) =>
      s.id === selectedSection.id
        ? { ...s, excerptText: editingExcerpt, updatedAt: new Date().toLocaleDateString() }
        : s
    );
    handleUpdateSections(updated);
    showToast(`Saved material context for "${selectedSection.reference}"`, "success");
  };

  const activeItemsCount = supportingItems.filter((i) => i.isActive !== false).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-6xl h-[92vh] border border-[#E5E3DF] shadow-2xl flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Header Bar */}
        <div className="bg-[#1A1A1A] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif italic text-lg leading-none">Supporting Documentation &amp; Library Context Hub</h2>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-mono mt-1">
                Manage Assertions, Assumptions, &amp; Constraints to Match via Vector Embeddings in AI Reports
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sub-Tabs & Actions */}
        <div className="bg-[#F9F8F6] border-b border-[#E5E3DF] px-6 py-2.5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-1 font-mono text-xs">
            <button
              onClick={() => setActiveModalTab('items')}
              className={`px-3 py-1.5 flex items-center gap-2 border text-xs font-bold transition-colors cursor-pointer ${
                activeModalTab === 'items'
                  ? 'bg-white border-[#1A1A1A] text-[#1A1A1A] shadow-2xs'
                  : 'border-transparent text-gray-600 hover:text-[#1A1A1A] hover:bg-white/50'
              }`}
            >
              <Flag className="w-3.5 h-3.5 text-amber-600" />
              <span>Supporting Context ({supportingItems.length})</span>
            </button>

            <button
              onClick={() => setActiveModalTab('library')}
              className={`px-3 py-1.5 flex items-center gap-2 border text-xs font-bold transition-colors cursor-pointer ${
                activeModalTab === 'library'
                  ? 'bg-white border-[#1A1A1A] text-[#1A1A1A] shadow-2xs'
                  : 'border-transparent text-gray-600 hover:text-[#1A1A1A] hover:bg-white/50'
              }`}
            >
              <Library className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ingested Bookshelf ({libraryDocuments.length})</span>
            </button>

            <button
              onClick={() => setActiveModalTab('sections')}
              className={`px-3 py-1.5 flex items-center gap-2 border text-xs font-bold transition-colors cursor-pointer ${
                activeModalTab === 'sections'
                  ? 'bg-white border-[#1A1A1A] text-[#1A1A1A] shadow-2xs'
                  : 'border-transparent text-gray-600 hover:text-[#1A1A1A] hover:bg-white/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>Clause Sections ({activeSections.length})</span>
            </button>

            <button
              onClick={() => setActiveModalTab('schema')}
              className={`px-3 py-1.5 flex items-center gap-2 border text-xs font-bold transition-colors cursor-pointer ${
                activeModalTab === 'schema'
                  ? 'bg-white border-[#1A1A1A] text-[#1A1A1A] shadow-2xs'
                  : 'border-transparent text-gray-600 hover:text-[#1A1A1A] hover:bg-white/50'
              }`}
            >
              <Code className="w-3.5 h-3.5 text-purple-600" />
              <span>Standard Schema Spec</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsIngestModalOpen(true)}
              className="px-3 py-1.5 bg-[#2D1B0D] hover:bg-[#3D2513] text-amber-200 border border-amber-800 text-[10px] font-mono uppercase tracking-wider font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>Ingest Document JSON</span>
            </button>
          </div>
        </div>

        {/* TAB 1: SUPPORTING DOCUMENTATION CONTEXT ITEMS */}
        {activeModalTab === 'items' && (
          <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-4 bg-[#FAF9F6]">
            
            {/* Top Quick Add Bar: "Source, (Assertion, Assumption, Constraint) Flag, Content" */}
            <div className="bg-white p-4 border border-[#E5E3DF] shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-[#1A1A1A] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-amber-600" />
                  Add Supporting Documentation Context Entry
                </h3>
                <span className="text-[10px] font-mono text-gray-500">
                  Format: <strong>Source, (Assertion/Assumption/Constraint) Flag, Content</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-4">
                  <label className="text-[10px] font-mono uppercase text-gray-500 mb-1 block">Source Identifier</label>
                  <input
                    type="text"
                    placeholder="e.g. CyberSecurity_Standard_V2.pdf (Page 4)"
                    value={itemSourceInput}
                    onChange={(e) => setItemSourceInput(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#FAF9F6] border border-[#E5E3DF] focus:outline-none focus:border-[#1A1A1A] font-mono"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="text-[10px] font-mono uppercase text-gray-500 mb-1 block">Context Flag</label>
                  <select
                    value={itemFlagInput}
                    onChange={(e) => setItemFlagInput(e.target.value as DocFlag)}
                    className="w-full px-3 py-1.5 text-xs bg-[#FAF9F6] border border-[#E5E3DF] focus:outline-none focus:border-[#1A1A1A] font-mono"
                  >
                    <option value="Constraint">Constraint (Policy/Limit)</option>
                    <option value="Assertion">Assertion (Authority Claim)</option>
                    <option value="Assumption">Assumption (Working Premise)</option>
                    <option value="Fact">Fact (Verified Data)</option>
                    <option value="Expectation">Expectation (Target Outcome)</option>
                    <option value="DataPoint">Data Point (Metric/Value)</option>
                  </select>
                </div>

                <div className="md:col-span-5">
                  <label className="text-[10px] font-mono uppercase text-gray-500 mb-1 block">Statement / Content</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Session inactivity timeout capped strictly at 15 minutes by compliance policy."
                      value={itemContentInput}
                      onChange={(e) => setItemContentInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddManualItem()}
                      className="flex-1 px-3 py-1.5 text-xs bg-[#FAF9F6] border border-[#E5E3DF] focus:outline-none focus:border-[#1A1A1A] font-mono"
                    />
                    <button
                      onClick={handleAddManualItem}
                      className="px-4 py-1.5 bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/90 text-xs font-mono uppercase font-bold cursor-pointer transition-colors shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex items-center justify-between gap-4 font-mono text-xs shrink-0 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-500 text-[11px]">Filter Flag:</span>
                {['all', 'Constraint', 'Assertion', 'Assumption', 'Fact', 'Expectation', 'DataPoint'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setItemFilterFlag(f)}
                    className={`px-2.5 py-1 text-[10px] uppercase font-bold border cursor-pointer transition-colors ${
                      itemFilterFlag === f
                        ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                        : 'bg-white text-gray-600 border-[#E5E3DF] hover:bg-gray-100'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-56">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search supporting items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1 text-xs bg-white border border-[#E5E3DF] focus:outline-none focus:border-[#1A1A1A]"
                  />
                </div>

                {supportingItems.length > 0 && (
                  <button
                    onClick={handleClearAllSupportingItems}
                    className="px-2.5 py-1 text-[10px] uppercase font-mono font-bold text-rose-700 hover:text-rose-900 border border-rose-200 hover:border-rose-300 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                    title="Remove all supporting items"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Clear All ({supportingItems.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Items Table */}
            <div className="flex-1 overflow-y-auto bg-white border border-[#E5E3DF] divide-y divide-[#E5E3DF]">
              {filteredSupportingItems.length === 0 ? (
                <div className="p-12 text-center text-gray-400 font-mono text-xs space-y-2">
                  <ShieldAlert className="w-8 h-8 mx-auto text-gray-300" />
                  <p>No supporting documentation items match the current filter.</p>
                  <p className="text-[11px] text-gray-400">
                    Add custom items above or click <strong>Ingest Document JSON</strong> to import structured extraction files!
                  </p>
                </div>
              ) : (
                <>
                  {visibleSupportingItems.map((item) => {
                    const isActive = item.isActive !== false;
                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 flex items-start justify-between gap-4 transition-colors ${
                          isActive ? "bg-white hover:bg-[#FAF9F6]" : "bg-gray-50/70 opacity-60"
                        }`}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <button
                            onClick={() => handleToggleItemActive(item.id)}
                            className="mt-0.5 text-gray-400 hover:text-[#1A1A1A] cursor-pointer"
                            title={isActive ? "Disable from RAG Vector Matching" : "Enable for RAG Vector Matching"}
                          >
                            {isActive ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-300" />
                            )}
                          </button>

                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-[#1A1A1A] truncate">{item.source}</span>
                              <span
                                className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider border ${
                                  item.flag === 'Constraint'
                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                    : item.flag === 'Assertion'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : item.flag === 'Assumption'
                                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                {item.flag}
                              </span>
                              {item.citations?.[0]?.pageNumber && (
                                <span className="text-[10px] font-mono text-gray-400">Page {item.citations[0].pageNumber}</span>
                              )}
                            </div>

                            <p className="text-xs text-[#1A1A1A] font-serif leading-relaxed">{item.content}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1 text-gray-400 hover:text-rose-700 transition-colors cursor-pointer shrink-0"
                          title="Delete Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}

                  {filteredSupportingItems.length > visibleSupportingItems.length && (
                    <div className="p-4 bg-[#FAF9F6] text-center font-mono text-xs flex items-center justify-between gap-3 flex-wrap border-t border-[#E5E3DF]">
                      <span className="text-gray-600">
                        Showing <strong className="text-[#1A1A1A]">{visibleSupportingItems.length}</strong> of <strong className="text-[#1A1A1A]">{filteredSupportingItems.length}</strong> items
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setDisplayLimit((prev) => prev + 100)}
                          className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-[#E5E3DF] text-xs font-bold text-[#1A1A1A] cursor-pointer transition-colors"
                        >
                          Show More (+100)
                        </button>
                        <button
                          onClick={() => setDisplayLimit(filteredSupportingItems.length)}
                          className="px-3 py-1.5 bg-[#1A1A1A] hover:bg-[#2A2A2A] text-white text-xs font-bold cursor-pointer transition-colors"
                        >
                          Show All ({filteredSupportingItems.length})
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="text-[11px] font-mono text-gray-500 bg-white p-2.5 border border-[#E5E3DF] flex items-center justify-between">
              <span>Active Items in RAG Vector Index: <strong>{activeItemsCount} / {supportingItems.length}</strong></span>
              <span className="text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Automatically included in AI Executive Summaries &amp; Prompt Assistant
              </span>
            </div>
          </div>
        )}

        {/* TAB 2: INGESTED BOOKSHELF LIBRARY */}
        {activeModalTab === 'library' && (
          <div className="flex-1 overflow-y-auto p-6 bg-[#FAF9F6] space-y-6">
            <div className="flex items-center justify-between border-b border-[#E5E3DF] pb-4 flex-wrap gap-3">
              <div>
                <h3 className="font-serif italic text-xl text-[#1A1A1A]">Ingested Document Library &amp; Bookshelf</h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  Extracted JSON documents storing facts, assumptions, assertions, and constraints.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {libraryDocuments.length > 0 && (
                  <button
                    onClick={handleClearAllLibraryDocuments}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 hover:border-rose-300 text-xs font-mono uppercase font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Clear all documents from bookshelf"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Clear All ({libraryDocuments.length})</span>
                  </button>
                )}

                <button
                  onClick={() => setIsIngestModalOpen(true)}
                  className="px-4 py-2 bg-[#2D1B0D] hover:bg-[#3D2513] text-amber-200 text-xs font-mono uppercase font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-amber-400" />
                  Ingest New JSON Document
                </button>
              </div>
            </div>

            {libraryDocuments.length === 0 ? (
              <div className="bg-white p-12 text-center border border-[#E5E3DF] space-y-3">
                <Library className="w-10 h-10 mx-auto text-gray-300" />
                <h4 className="font-serif italic text-lg text-[#1A1A1A]">No Ingested Documents Yet</h4>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  Import standardized JSON extraction files matching the <code>DocumentExtractionRecord</code> schema to populate the bookshelf.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {libraryDocuments.map((doc) => {
                  const meta = doc.record.metadata;
                  return (
                    <div key={doc.id} className="bg-white border border-[#E5E3DF] shadow-2xs p-5 space-y-4 relative group">
                      <div className="flex items-start justify-between gap-3 border-b border-[#E5E3DF] pb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 font-mono text-xs font-bold">
                            {meta?.fileType || "JSON"}
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-[#1A1A1A] font-mono">{meta?.fileName || "Document"}</h4>
                            <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 mt-0.5">
                              <span>Size: {meta?.fileSizeFormatted || "N/A"}</span>
                              <span>•</span>
                              <span>Pages: {meta?.totalPages || 1}</span>
                              <span>•</span>
                              <span>Ingested: {doc.ingestedAt}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold border border-emerald-300">
                            {doc.extractedItemCount} extracted items
                          </span>
                          <button
                            onClick={() => handleDeleteLibraryDocument(doc.id)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider"
                            title="Remove Document from Library"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Executive Summary</span>
                        <p className="text-xs text-[#1A1A1A] font-serif leading-relaxed line-clamp-3">
                          {doc.record.executiveSummary || "No executive summary provided."}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-[#E5E3DF] flex items-center justify-between text-xs font-mono text-gray-600">
                        <div className="flex items-center gap-3 text-[10px]">
                          <span>Assertions: <strong>{doc.record.assertions?.length || 0}</strong></span>
                          <span>Assumptions: <strong>{doc.record.assumptions?.length || 0}</strong></span>
                          <span>Constraints: <strong>{doc.record.constraints?.length || 0}</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CLAUSE SECTIONS (EXISTING FUNCTIONALITY) */}
        {activeModalTab === 'sections' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Sections Sidebar */}
            <div className="w-80 bg-[#F9F8F6] border-r border-[#E5E3DF] flex flex-col shrink-0">
              <div className="p-3 border-b border-[#E5E3DF] space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Filter sections or clauses..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E5E3DF] focus:outline-none focus:border-[#1A1A1A]"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="New section ref (e.g. Section 3.1)..."
                    value={newRefInput}
                    onChange={(e) => setNewRefInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCustomSection()}
                    className="flex-1 px-2.5 py-1 text-xs bg-white border border-[#E5E3DF] focus:outline-none focus:border-[#1A1A1A]"
                  />
                  <button
                    onClick={handleAddCustomSection}
                    className="p-1 bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/80 cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {activeSections.length > 0 && (
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleClearAllSections}
                      className="text-[10px] font-mono text-rose-700 hover:text-rose-900 underline cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3 text-rose-600" />
                      <span>Clear All Sections ({activeSections.length})</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[#E5E3DF]">
                {activeSections.map((sec) => {
                  const isSelected = selectedSection?.id === sec.id;
                  const hasText = sec.excerptText && sec.excerptText.trim().length > 0;
                  return (
                    <div
                      key={sec.id}
                      onClick={() => setSelectedSectionId(sec.id)}
                      className={`p-3 cursor-pointer transition-colors flex items-start justify-between gap-2 group ${
                        isSelected ? "bg-white border-l-4 border-l-amber-600 shadow-2xs" : "hover:bg-white/60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-[#1A1A1A] truncate">{sec.reference}</h4>
                        <span className={`text-[10px] font-mono ${hasText ? "text-emerald-700" : "text-amber-700"}`}>
                          {hasText ? "Excerpt Loaded" : "Needs Excerpt Text"}
                        </span>
                      </div>

                      <button
                        onClick={(e) => handleDeleteSection(sec.id, e)}
                        className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                        title="Remove Section"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Section Editor */}
            <div className="flex-1 p-6 bg-white overflow-y-auto space-y-6">
              {selectedSection ? (
                <div className="space-y-4 max-w-3xl mx-auto">
                  <div className="flex items-center justify-between border-b border-[#E5E3DF] pb-3">
                    <h3 className="font-serif italic text-2xl text-[#1A1A1A]">{selectedSection.reference}</h3>
                    <button
                      onClick={handleSaveCurrentExcerpt}
                      className="px-4 py-2 bg-[#4A6741] text-white text-xs font-mono uppercase font-bold flex items-center gap-2 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      Save Section Text
                    </button>
                  </div>

                  <textarea
                    rows={12}
                    value={editingExcerpt}
                    onChange={(e) => setEditingExcerpt(e.target.value)}
                    placeholder="Paste clause or document section excerpt here..."
                    className="w-full p-4 border border-[#E5E3DF] font-mono text-xs bg-[#FAF9F6] focus:outline-none focus:border-[#1A1A1A]"
                  />
                </div>
              ) : (
                <div className="text-center p-12 text-gray-400">No clause section selected.</div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: STANDARD SCHEMA & SPEC VIEWER */}
        {activeModalTab === 'schema' && (
          <div className="flex-1 overflow-y-auto p-6 bg-[#FAF9F6] space-y-6">
            <div>
              <h3 className="font-serif italic text-xl text-[#1A1A1A]">Standardized Schema &amp; Downstream Integration Spec</h3>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                Export standardized JSON schemas, OpenAPI specifications, and TypeScript typings to seamlessly build downstream analytical pipelines.
              </p>
            </div>

            <div className="space-y-6">
              <div className="bg-white border border-[#E5E3DF] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#1A1A1A] flex items-center gap-2">
                    <Code className="w-4 h-4 text-purple-600" /> JSON Schema (Draft-07)
                  </h4>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(SCHEMA_JSON_DRAFT07);
                      showToast("Copied JSON Schema (Draft-07) to clipboard!", "success");
                    }}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy JSON Schema
                  </button>
                </div>
                <pre className="p-3 bg-gray-900 text-emerald-400 text-[11px] font-mono overflow-x-auto max-h-48 rounded-xs">
                  {SCHEMA_JSON_DRAFT07}
                </pre>
              </div>

              <div className="bg-white border border-[#E5E3DF] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#1A1A1A] flex items-center gap-2">
                    <FileCode2 className="w-4 h-4 text-blue-600" /> OpenAPI 3.0 Specification
                  </h4>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(OPENAPI_3_SPEC);
                      showToast("Copied OpenAPI 3.0 Spec to clipboard!", "success");
                    }}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy OpenAPI Spec
                  </button>
                </div>
                <pre className="p-3 bg-gray-900 text-amber-300 text-[11px] font-mono overflow-x-auto max-h-48 rounded-xs">
                  {OPENAPI_3_SPEC}
                </pre>
              </div>

              <div className="bg-white border border-[#E5E3DF] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#1A1A1A] flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-600" /> TypeScript Typings (.d.ts)
                  </h4>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(TYPESCRIPT_TYPINGS);
                      showToast("Copied TypeScript Typings to clipboard!", "success");
                    }}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Typings
                  </button>
                </div>
                <pre className="p-3 bg-gray-900 text-blue-300 text-[11px] font-mono overflow-x-auto max-h-48 rounded-xs">
                  {TYPESCRIPT_TYPINGS}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Footer Bar */}
        <div className="bg-[#F9F8F6] border-t border-[#E5E3DF] px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="text-[10px] font-mono text-gray-500 flex items-center gap-2">
            <span className="h-2 w-2 bg-emerald-500 rounded-full" />
            <span>Supporting documentation automatically persists in session state and feeds AI RAG prompts.</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white font-mono text-[10px] uppercase tracking-widest font-bold cursor-pointer transition-colors"
          >
            Close Workspace
          </button>
        </div>

      </div>

      {/* JSON Ingestion Modal Overlay */}
      {isIngestModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-3xl border border-[#E5E3DF] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E3DF] pb-3">
              <h3 className="font-serif italic text-lg text-[#1A1A1A] flex items-center gap-2">
                <Upload className="w-5 h-5 text-amber-600" /> Ingest Supplemental Documentation JSON
              </h3>
              <button
                onClick={() => setIsIngestModalOpen(false)}
                className="p-1 hover:bg-gray-100 text-gray-400 hover:text-[#1A1A1A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Paste a standardized <code>DocumentExtractionRecord</code> JSON payload below. The engine will extract all facts, assumptions, assertions, and constraints into the RAG vector index and store the document in the bookshelf library.
            </p>

            <textarea
              rows={12}
              value={jsonIngestText}
              onChange={(e) => setJsonIngestText(e.target.value)}
              placeholder='{\n  "metadata": { "fileId": "doc_01", "fileName": "Policy.pdf", ... },\n  "executiveSummary": "...",\n  "assertions": [...],\n  "constraints": [...]\n}'
              className="w-full p-3 border border-[#E5E3DF] font-mono text-xs focus:outline-none focus:border-[#1A1A1A] bg-[#FAF9F6]"
            />

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  setJsonIngestText(JSON.stringify({
                    metadata: {
                      fileId: `doc_${Date.now()}`,
                      fileName: "Sample_Policy_Constraint.pdf",
                      fileType: "PDF",
                      fileSizeFormatted: "1.2 MB",
                      totalPages: 5,
                      processedAt: new Date().toISOString()
                    },
                    executiveSummary: "Sample policy constraining server maintenance windows and client API key exposures.",
                    constraints: [
                      {
                        id: "con_99",
                        constraint: "Client-side storage of master API keys is strictly prohibited under SOC-2 policy.",
                        constraintType: "security"
                      }
                    ]
                  }, null, 2));
                }}
                className="text-xs font-mono text-amber-800 underline hover:text-amber-900 cursor-pointer"
              >
                Load Sample JSON Template
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsIngestModalOpen(false)}
                  className="px-4 py-2 text-xs font-mono text-gray-600 hover:text-[#1A1A1A]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleIngestJSON}
                  className="px-4 py-2 bg-[#2D1B0D] hover:bg-[#3D2513] text-amber-200 text-xs font-mono uppercase font-bold cursor-pointer"
                >
                  Ingest &amp; Process JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

