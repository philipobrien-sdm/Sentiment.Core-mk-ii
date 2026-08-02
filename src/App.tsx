import { useState, useEffect, useMemo } from "react";
import { CommentItem, FilterState, LlmSettings, StakeholderMapping, getQuadrantInfo, DocumentSection, WhatIfReport, SupportingDocContextItem, IngestedLibraryDocument } from "./types";
import { generateDefaultDataset } from "./data/defaultComments";
import { generateDefaultSupportingDocs } from "./data/defaultSupportingDocs";
import { clusterCommentsDynamically } from "./utils/topicClustering";
import { VectorPlot } from "./components/VectorPlot";
import { DashboardStats } from "./components/DashboardStats";
import { DuplicateReview, calculateCosineSimilarity } from "./components/DuplicateReview";
import { ExecutiveReport } from "./components/ExecutiveReport";
import { ImportExport } from "./components/ImportExport";
import { SetupLandingPage } from "./components/SetupLandingPage";
import { SemanticQuery } from "./components/SemanticQuery";
import { CommentsList } from "./components/CommentsList";
import { AboutModal } from "./components/AboutModal";
import { DocumentContextModal } from "./components/DocumentContextModal";
import { buildDocumentContextPromptBlock, syncDocumentSectionsWithComments, buildSupportingDocsRAGPromptBlock, buildStakeholderContextPromptBlock } from "./utils/documentContext";
import { PromptAssistant } from "./components/PromptAssistant";
import { CustomTopicClusterView } from "./components/CustomTopicClusterView";
import { SynthesisModal, SavedSynthesis } from "./components/SynthesisModal";
import { StakeholderMappingModal } from "./components/StakeholderMappingModal";
import { WhatIfScenarioModal } from "./components/WhatIfScenarioModal";
import { OrganizationBadge } from "./components/OrganizationBadge";
import { OrganizationStakeholderView } from "./components/OrganizationStakeholderView";
import { getCachedEmbedding, loadEmbeddingsIntoCache, setCachedEmbedding, getCommentEmbedding } from "./utils/embeddingsCache";
import { 
  fetchLocalEmbeddings, 
  fetchLocalCompletion, 
  generateLocalHeuristicSummary, 
  getDeterministicPseudoEmbedding,
  testLlmConnection,
  generateLocalHeuristicNeighborhoodSynthesis,
  generateLocalHeuristicClusterSynthesis,
  generateLocalHeuristicRefinedNodesSynthesis,
  generateLocalHeuristicMetaExecutiveReview,
  generateLocalHeuristicStakeholderMetaReview
} from "./utils/localLlm";
import { MarkdownViewer } from "./components/MarkdownViewer";
import { generateSelfContainedOfflineHtml } from "./utils/exportOfflineHtml";
import { 
  Sparkles, 
  Map, 
  ShieldCheck, 
  Layers, 
  Database, 
  Search, 
  Trash2, 
  RefreshCcw, 
  PlusCircle, 
  Calendar,
  Sparkle,
  Info,
  CheckCircle,
  Clock,
  Settings,
  X,
  LogOut,
  Server,
  Loader2,
  Eye,
  History,
  List,
  FolderKanban,
  BookOpen,
  Building2
} from "lucide-react";

export const DEFAULT_STAKEHOLDER_MAPPINGS: Record<string, StakeholderMapping> = {
  "Acme Corp": {
    organizationName: "Acme Corp",
    interest: 4.8,
    influence: 4.5,
    quadrant: "key_players",
    bio: "Primary commercial enterprise partner operating high-volume regional distribution logistics for over 15 years. Strongly prioritizes platform uptime, API schema stability, and transparent release schedules.",
    redLines: "Firm refusal of unscheduled daytime service downtime (08:00–18:00). Will not accept unannounced breaking schema changes.",
    expectations: "Expects 99.9% uptime SLA, 24-hour advance notice for API updates, and quarterly technical review access.",
    notes: "Enterprise Tier account ($2.5M ARR). Critical partner in upcoming Q3 review.",
    updatedAt: new Date().toISOString()
  },
  "Metro Transit Authority": {
    organizationName: "Metro Transit Authority",
    interest: 4.6,
    influence: 4.9,
    quadrant: "key_players",
    bio: "Public sector municipal transportation agency governing regional transit corridors and public accessibility compliance.",
    redLines: "Strict refusal of any policy or software change that compromises ADA accessibility or public safety standards.",
    expectations: "Requires quarterly public audit reports, full data sovereignty, and strict adherence to WCAG 2.1 AA accessibility guidelines.",
    notes: "High influence regulator & public buyer.",
    updatedAt: new Date().toISOString()
  },
  "Apex Logistics": {
    organizationName: "Apex Logistics",
    interest: 3.8,
    influence: 4.2,
    quadrant: "keep_satisfied",
    bio: "Key freight and fleet management operator focused on real-time tracking accuracy and driver mobile interface usability.",
    redLines: "Opposes mandatory hardware upgrades or forced migration to paid tier extensions.",
    expectations: "Seamless mobile interface responsiveness for fleet drivers and simplified batch CSV data exports.",
    notes: "High influence logistics operator.",
    updatedAt: new Date().toISOString()
  }
};

export default function App() {
  // 1. Initial State Definition
  const [comments, setCommentsInternal] = useState<CommentItem[]>(() => {
    const saved = localStorage.getItem("workspace_comments");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return []; // Empty by default so it forces the landing/setup page
  });

  const setComments = (newComments: CommentItem[] | ((prev: CommentItem[]) => CommentItem[])) => {
    if (typeof newComments === "function") {
      setCommentsInternal((prev) => {
        const resolved = newComments(prev);
        loadEmbeddingsIntoCache(resolved);
        return resolved.map(({ embedding, ...rest }) => rest as CommentItem);
      });
    } else {
      loadEmbeddingsIntoCache(newComments);
      setCommentsInternal(newComments.map(({ embedding, ...rest }) => rest as CommentItem));
    }
  };

  const [isInitialized, setIsInitialized] = useState<boolean>(comments.length > 0);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [isAnalyzingNeighborhood, setIsAnalyzingNeighborhood] = useState<boolean>(false);
  const [neighborhoodSynthesis, setNeighborhoodSynthesis] = useState<string | null>(null);
  const [expandedOriginalRow, setExpandedOriginalRow] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'explore' | 'list' | 'duplicates' | 'query' | 'clusters' | 'organizations' | 'report' | 'data'>('explore');
  const [colorMode, setColorMode] = useState<'sentiment' | 'topic'>('sentiment');

  // Critique Modal & History states
  const [isSynthesisModalOpen, setIsSynthesisModalOpen] = useState<boolean>(false);
  const [activeSynthesis, setActiveSynthesis] = useState<SavedSynthesis | null>(null);
  const [isAnalyzingClusterId, setIsAnalyzingClusterId] = useState<string | null>(null);
  const [isSynthesizingMeta, setIsSynthesizingMeta] = useState<boolean>(false);
  const [synthesisHistory, setSynthesisHistory] = useState<SavedSynthesis[]>(() => {
    const saved = localStorage.getItem("synthesis_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  // Sync synthesis history to localStorage
  useEffect(() => {
    localStorage.setItem("synthesis_history", JSON.stringify(synthesisHistory));
  }, [synthesisHistory]);

  // Document Context Store & Modal State
  const [documentSections, setDocumentSections] = useState<DocumentSection[]>(() => {
    const saved = localStorage.getItem("document_sections");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });
  
  const [supportingItems, setSupportingItems] = useState<SupportingDocContextItem[]>(() => {
    const saved = localStorage.getItem("supporting_doc_items");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return generateDefaultSupportingDocs().items;
  });

  const [libraryDocuments, setLibraryDocuments] = useState<IngestedLibraryDocument[]>(() => {
    const saved = localStorage.getItem("library_documents");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return generateDefaultSupportingDocs().documents;
  });

  const [isDocumentContextModalOpen, setIsDocumentContextModalOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem("document_sections", JSON.stringify(documentSections));
    } catch (e) {
      console.warn("Failed to persist document_sections to localStorage:", e);
    }
  }, [documentSections]);

  useEffect(() => {
    try {
      // Strip embedding arrays when saving to localStorage to prevent QuotaExceededError (embeddings are computed on demand)
      const sanitizedItems = supportingItems.map(({ embedding, ...rest }) => rest);
      localStorage.setItem("supporting_doc_items", JSON.stringify(sanitizedItems));
    } catch (e) {
      console.warn("Failed to persist supporting_doc_items to localStorage:", e);
    }
  }, [supportingItems]);

  useEffect(() => {
    try {
      localStorage.setItem("library_documents", JSON.stringify(libraryDocuments));
    } catch (e) {
      console.warn("Failed to persist full library_documents to localStorage:", e);
      // Fallback: Store lightweight version of records if localStorage quota is reached
      try {
        const lightweightDocs = libraryDocuments.map((doc) => ({
          ...doc,
          record: {
            metadata: doc.record.metadata,
            executiveSummary: doc.record.executiveSummary,
            documentSections: doc.record.documentSections?.slice(0, 10) || [],
          }
        }));
        localStorage.setItem("library_documents", JSON.stringify(lightweightDocs));
      } catch (err2) {
        console.warn("Failed to persist lightweight library_documents:", err2);
      }
    }
  }, [libraryDocuments]);

  useEffect(() => {
    if (comments.length > 0) {
      setDocumentSections((prev) => syncDocumentSectionsWithComments(comments, prev));
    }
  }, [comments]);
  
  // Local LLM Settings
  const [llmSettings, setLlmSettings] = useState<LlmSettings>(() => {
    const saved = localStorage.getItem("llm_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.customPersona) {
          parsed.customPersona = "You are a Senior Strategic Product & Customer Experience Analyst. Focus heavily on stakeholder sentiment, correctly infer user intent from context, and reconcile opposing friction points while maintaining complete factual integrity with zero hallucinations.";
        }
        return parsed;
      } catch (e) {}
    }
    return {
      baseUrl: "http://localhost:11434/v1",
      modelName: "llama3",
      embeddingUrl: "http://localhost:11434/v1",
      embeddingModel: "nomic-embed-text",
      apiKey: "",
      useCustomEmbedding: false,
      customPersona: "You are a Senior Strategic Product & Customer Experience Analyst. Focus heavily on stakeholder sentiment, correctly infer user intent from context, and reconcile opposing friction points while maintaining complete factual integrity with zero hallucinations."
    };
  });

  // Settings Slide-over visibility
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);

  // Stakeholder Power-Interest Mappings state
  const [stakeholderMappings, setStakeholderMappings] = useState<Record<string, StakeholderMapping>>(() => {
    const saved = localStorage.getItem("stakeholder_mappings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) return parsed;
      } catch (e) {}
    }
    return DEFAULT_STAKEHOLDER_MAPPINGS;
  });

  const [isStakeholderModalOpen, setIsStakeholderModalOpen] = useState<boolean>(false);
  const [stakeholderModalTargetOrg, setStakeholderModalTargetOrg] = useState<string | null>(null);

  // Persist stakeholder mappings to localStorage
  useEffect(() => {
    localStorage.setItem("stakeholder_mappings", JSON.stringify(stakeholderMappings));
  }, [stakeholderMappings]);

  const handleOpenStakeholderModal = (orgName?: string) => {
    setStakeholderModalTargetOrg(orgName || null);
    setIsStakeholderModalOpen(true);
  };

  const handleSaveStakeholderMapping = (mapping: StakeholderMapping) => {
    setStakeholderMappings((prev) => ({
      ...prev,
      [mapping.organizationName]: mapping,
    }));
  };

  const handleSaveAllStakeholderMappings = (mappings: Record<string, StakeholderMapping>) => {
    setStakeholderMappings(mappings);
  };

  // What-If Scenario Reports state
  const [whatIfReports, setWhatIfReports] = useState<WhatIfReport[]>(() => {
    const saved = localStorage.getItem("what_if_reports");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  });

  const [isWhatIfModalOpen, setIsWhatIfModalOpen] = useState<boolean>(false);
  const [whatIfInitialContext, setWhatIfInitialContext] = useState<"cluster" | "executive" | "synthesis_meta" | "custom_cluster_batch">("executive");
  const [whatIfInitialCluster, setWhatIfInitialCluster] = useState<string>("");

  useEffect(() => {
    localStorage.setItem("what_if_reports", JSON.stringify(whatIfReports));
  }, [whatIfReports]);

  const handleOpenWhatIfModal = (
    contextType: "cluster" | "executive" | "synthesis_meta" | "custom_cluster_batch" = "executive",
    targetCluster: string = ""
  ) => {
    setWhatIfInitialContext(contextType);
    setWhatIfInitialCluster(targetCluster);
    setIsWhatIfModalOpen(true);
  };

  const handleSaveWhatIfReport = (report: WhatIfReport) => {
    setWhatIfReports((prev) => [report, ...prev.filter(r => r.id !== report.id)]);
  };

  const handleDeleteWhatIfReport = (id: string) => {
    setWhatIfReports((prev) => prev.filter(r => r.id !== id));
  };

  const handleClearWhatIfReports = () => {
    setWhatIfReports([]);
  };

  // Local discovered models list states
  const [availableModels, setAvailableModels] = useState<string[]>(() => {
    const saved = localStorage.getItem("workspace_available_models");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return ["llama3", "llama3.2", "mistral", "gemma2", "phi3", "qwen2.5"];
  });

  const [availableEmbeddingModels, setAvailableEmbeddingModels] = useState<string[]>(() => {
    const saved = localStorage.getItem("workspace_available_embedding_models");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return ["nomic-embed-text", "all-minilm", "bge-large", "mxbai-embed-large"];
  });

  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  const handleTestConnection = async (settingsToTest?: LlmSettings) => {
    const activeSettings = settingsToTest || llmSettings;
    setIsTestingConnection(true);
    showToast("Testing local LLM server connection...", "info");
    try {
      const res = await testLlmConnection(activeSettings);
      if (res.success) {
        showToast(res.message, "success");
        if (res.models && res.models.length > 0) {
          setAvailableModels(res.models);
          setAvailableEmbeddingModels(res.models);
          
          // Auto select if currently configured names are not in the list
          const updatedSettings = { ...activeSettings };
          let changed = false;
          if (!res.models.includes(activeSettings.modelName)) {
            updatedSettings.modelName = res.models[0];
            changed = true;
          }
          if (activeSettings.useCustomEmbedding && !res.models.includes(activeSettings.embeddingModel)) {
            updatedSettings.embeddingModel = res.models[0];
            changed = true;
          }
          if (changed) {
            setLlmSettings(updatedSettings);
          }
        }
      }
    } catch (err: any) {
      showToast(err.message || "Connection test failed.", "error");
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Real-time notification banners
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Applet status flags
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [isIndexing, setIsIndexing] = useState<boolean>(false);
  const [indexingProgress, setIndexingProgress] = useState<number>(0);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [executiveSummary, setExecutiveSummary] = useState<string | null>(() => {
    return localStorage.getItem("executive_summary") || null;
  });

  const closeSettings = () => {
    setIsSettingsOpen(false);
    setShowClearConfirm(false);
  };

  const handleClearWorkspace = () => {
    // Reset all application data states
    setComments([]);
    setIsInitialized(false);
    setSelectedCommentId(null);
    setNeighborhoodSynthesis(null);
    setExecutiveSummary(null);
    setSynthesisHistory([]);
    setActiveSynthesis(null);
    setDocumentSections([]);
    setSupportingItems([]);
    setLibraryDocuments([]);
    setStakeholderMappings(DEFAULT_STAKEHOLDER_MAPPINGS);
    setWhatIfReports([]);
    setPreviousCommentsBeforeReclustering(null);
    setFilters({
      sentiments: [],
      topics: [],
      organizations: [],
      searchQuery: "",
      showDuplicatesOnly: false,
      similarityThreshold: 0.85,
    });

    // Clear application data from localStorage while preserving local model connection settings
    // (llmSettings, workspace_available_models, workspace_available_embedding_models are kept!)
    localStorage.removeItem("workspace_comments");
    localStorage.removeItem("synthesis_history");
    localStorage.removeItem("executive_summary");
    localStorage.removeItem("document_sections");
    localStorage.removeItem("supporting_doc_items");
    localStorage.removeItem("library_documents");
    localStorage.removeItem("stakeholder_mappings");
    localStorage.removeItem("what_if_reports");
    localStorage.removeItem("previous_comments_before_reclustering");

    setShowClearConfirm(false);
    setIsSettingsOpen(false);
    showToast("Workspace cleared. Local model connection settings preserved.", "info");
  };

  // Filter structure
  const [filters, setFilters] = useState<FilterState>({
    sentiments: [],
    topics: [],
    organizations: [],
    searchQuery: "",
    showDuplicatesOnly: false,
    similarityThreshold: 0.85,
  });

  // State to hold comments before a smart re-clustering run, enabling full revert/undo.
  const [previousCommentsBeforeReclustering, setPreviousCommentsBeforeReclustering] = useState<CommentItem[] | null>(null);

  // Reset selected comment neighborhood critique and column details state on selection change
  useEffect(() => {
    setNeighborhoodSynthesis(null);
    setExpandedOriginalRow(false);
  }, [selectedCommentId]);

  // Sync state helpers
  useEffect(() => {
    try {
      // To prevent QuotaExceededError and massive performance/storage issues,
      // we strip the raw, high-dimensional float arrays (embedding property) from the comments
      // list stored in localStorage. All other metadata (x, y, sentiment, topic) are fully preserved.
      // This reduces storage size by ~99% and ensures it stays well under the 5MB browser quota.
      const lightweightComments = comments.map(({ embedding, ...rest }) => rest);
      localStorage.setItem("workspace_comments", JSON.stringify(lightweightComments));
    } catch (err) {
      console.warn("Could not save lightweight comments to localStorage (quota limit exceeded or storage blocked):", err);
    }
    setIsInitialized(comments.length > 0);
  }, [comments]);

  // Load/Generate embeddings for comments in cache if they don't exist
  useEffect(() => {
    if (comments.length > 0) {
      for (const c of comments) {
        if (!getCachedEmbedding(c.id)) {
          if (c.embedding && c.embedding.length > 0) {
            setCachedEmbedding(c.id, c.embedding);
          } else if (!llmSettings.useCustomEmbedding) {
            setCachedEmbedding(c.id, getDeterministicPseudoEmbedding(c.text));
          }
        }
      }
    }
  }, [comments, llmSettings.useCustomEmbedding]);

  useEffect(() => {
    localStorage.setItem("llm_settings", JSON.stringify(llmSettings));
  }, [llmSettings]);

  useEffect(() => {
    localStorage.setItem("workspace_available_models", JSON.stringify(availableModels));
  }, [availableModels]);

  useEffect(() => {
    localStorage.setItem("workspace_available_embedding_models", JSON.stringify(availableEmbeddingModels));
  }, [availableEmbeddingModels]);

  useEffect(() => {
    if (executiveSummary) {
      localStorage.setItem("executive_summary", executiveSummary);
    } else {
      localStorage.removeItem("executive_summary");
    }
  }, [executiveSummary]);

  // Simple toast trigger
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 3. Filter Comments
  const filteredComments = useMemo(() => {
    return comments.filter((item) => {
      // Always include user query node to keep it visible on the map
      if (item.id === "user_query_node") return true;

      // Skip archived
      if (item.isArchived) return false;

      // Filter by duplicates setting
      if (filters.showDuplicatesOnly && !item.isDuplicate) return false;

      // Filter by Sentiment list
      if (filters.sentiments.length > 0 && !filters.sentiments.includes(item.sentiment)) return false;

      // Filter by Topic cluster list
      if (filters.topics.length > 0 && !filters.topics.includes(item.topic)) return false;

      // Filter by Organization list
      if (filters.organizations && filters.organizations.length > 0) {
        const org = item.organizationName || "(No Organization)";
        if (!filters.organizations.includes(org)) return false;
      }

      // Filter by Search text query (case-insensitive)
      if (filters.searchQuery.trim().length > 0) {
        const query = filters.searchQuery.toLowerCase();
        const matchesText = item.text.toLowerCase().includes(query);
        const matchesTopic = item.topic.toLowerCase().includes(query);
        const matchesId = item.id.toLowerCase().includes(query);
        if (!matchesText && !matchesTopic && !matchesId) return false;
      }

      return true;
    });
  }, [comments, filters]);

  // Selected Comment record
  const selectedComment = useMemo(() => {
    if (!selectedCommentId) return null;
    return comments.find((c) => c.id === selectedCommentId && !c.isArchived) || null;
  }, [comments, selectedCommentId]);

  // Unique Topics extracted from active comments in the dataset
  const datasetTopics = useMemo(() => {
    const topicsSet = new Set<string>();
    comments.forEach((c) => {
      if (c.topic && c.topic.trim() && c.id !== "user_query_node" && !c.isArchived) {
        topicsSet.add(c.topic);
      }
    });
    // Ensure that if the selected comment has a topic, it's included in the list
    if (selectedComment?.topic && selectedComment.topic.trim()) {
      topicsSet.add(selectedComment.topic);
    }
    const sorted = Array.from(topicsSet).sort();
    if (sorted.length === 0) {
      return [
        "Performance & Speed",
        "UI/UX & Layout",
        "Bugs & Crashes",
        "Pricing & Value",
        "Features & Requests",
        "General Feedback"
      ];
    }
    return sorted;
  }, [comments, selectedComment]);

  // Similar items to the currently selected comment
  const similarToSelected = useMemo(() => {
    if (!selectedComment) return [];
    const selectedEmbedding = getCommentEmbedding(selectedComment, llmSettings.useCustomEmbedding);
    if (!selectedEmbedding || selectedEmbedding.length === 0) return [];
    
    // Lower threshold for user query node to find matching items visually aligned on the map
    const cutoffThreshold = selectedComment.id === "user_query_node" ? 0.3 : 0.5;
    
    return comments
      .filter((c) => c.id !== selectedComment.id && !c.isArchived)
      .map((c) => {
        const cEmbedding = getCommentEmbedding(c, llmSettings.useCustomEmbedding);
        const similarity = cEmbedding ? calculateCosineSimilarity(selectedEmbedding, cEmbedding) : 0;
        return { comment: c, similarity };
      })
      .filter((res) => res.similarity >= cutoffThreshold) // Display matches above appropriate threshold
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5); // top 5 matches
  }, [comments, selectedComment, llmSettings.useCustomEmbedding]);

  // 4. API Event: Indexing raw CSV comments
  const handleStartIndexing = async (
    texts: string[],
    onProgress?: (completedCount: number, currentEmbeddings: number[][]) => void
  ): Promise<number[][]> => {
    setIsIndexing(true);
    setIndexingProgress(0);
    showToast(
      llmSettings.useCustomEmbedding 
        ? `Requesting embeddings row-by-row from ${llmSettings.embeddingModel} on local server...` 
        : "Generating client-side heuristic embeddings row-by-row...",
      "info"
    );

    const embeddings: number[][] = [];
    try {
      for (let i = 0; i < texts.length; i++) {
        let vector: number[] = [];
        const text = texts[i];
        
        if (llmSettings.useCustomEmbedding) {
          try {
            // Process each row separately as a call to the embedding LLM
            const singleEmbeddingArray = await fetchLocalEmbeddings([text], llmSettings);
            vector = singleEmbeddingArray[0] || getDeterministicPseudoEmbedding(text);
          } catch (err) {
            console.warn(`Row ${i + 1} local embedding fetch failed. Using deterministic heuristic fallback.`, err);
            vector = getDeterministicPseudoEmbedding(text);
          }
        } else {
          // Heuristic embedding
          vector = getDeterministicPseudoEmbedding(text);
          // Add a tiny artificial delay to simulate real-time processing and display progress cleanly
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        embeddings.push(vector);

        const currentCount = i + 1;
        const progressPercent = Math.round((currentCount / texts.length) * 100);
        setIndexingProgress(progressPercent);

        if (onProgress) {
          try {
            onProgress(currentCount, embeddings);
          } catch (cbErr) {
            console.error("Error in onProgress callback during indexing auto-backup:", cbErr);
          }
        }
      }

      setIndexingProgress(100);
      setIsIndexing(false);
      showToast("Embeddings successfully mapped and indexed row-by-row!", "success");
      return embeddings;
    } catch (err: any) {
      console.warn("Indexing failed.", err);
      setIndexingProgress(100);
      setIsIndexing(false);
      showToast("Error during dataset indexing.", "error");
      // Fallback
      return texts.map(t => getDeterministicPseudoEmbedding(t));
    }
  };

  // Helper to append traceability nodes register at the end of generated reviews/reports
  const generateTraceabilitySection = (nodes: CommentItem[]): string => {
    if (!nodes || nodes.length === 0) return "";
    let section = `\n\n---\n\n### 📋 Traceability Register: Referenced Feedback Nodes\n`;
    section += `This report synthesized the following **${nodes.length} comments** directly from the active filtered workspace:\n\n`;
    section += `| Comment ID | Organization Name | Feedback Comment Text |\n`;
    section += `| :--- | :--- | :--- |\n`;
    nodes.forEach((c) => {
      const id = c.id;
      const org = c.organizationName || "*(No Organization)*";
      const textSnippet = c.text.length > 150 ? `${c.text.substring(0, 150)}...` : c.text;
      // Escape newlines and pipes to preserve table format
      const cleanTextSnippet = textSnippet.replace(/[\n\r]+/g, " ").replace(/\|/g, "\\|");
      section += `| \`${id}\` | ${org} | ${cleanTextSnippet} |\n`;
    });
    return section;
  };

  // 5. API Event: Generate Summary
  const handleGenerateSummary = async () => {
    setIsSummarizing(true);
    showToast(`Requesting summary from local chat model: ${llmSettings.modelName}...`, "info");

    try {
      let summaryText = "";
      
      // Calculate stakeholder priority weight for each comment
      const getCommentPriorityWeight = (c: CommentItem) => {
        const org = c.organizationName || c.originalRowData?.["Organization"] || c.originalRowData?.["Org"] || c.originalRowData?.["Organization Name"];
        if (org && stakeholderMappings[org]) {
          const m = stakeholderMappings[org];
          const qInfo = getQuadrantInfo(m.influence, m.interest);
          return qInfo.priorityWeight;
        }
        return 1.0;
      };

      // Sort comments by stakeholder priority weight descending (Key Players / High Power & Interest first!)
      const prioritizedComments = [...filteredComments].sort((a, b) => getCommentPriorityWeight(b) - getCommentWeight(a));
      function getCommentWeight(c: CommentItem) {
        return getCommentPriorityWeight(c);
      }

      const nodesUsed = prioritizedComments.slice(0, 80);
      const docContextBlock = buildDocumentContextPromptBlock(nodesUsed, documentSections);
      const ragDocsBlock = buildSupportingDocsRAGPromptBlock(nodesUsed, supportingItems);
      const stakeholderContextBlock = buildStakeholderContextPromptBlock(stakeholderMappings);
      
      const structuredPrompt = `You are a Principal Customer Experience & Data Analyst.
Analyze the following stakeholder comments collected from an update or product release.
Provide an executive synthesis summarizing stakeholder sentiment, core themes, recurring pain points, and action items.

STAKEHOLDER POWER-INTEREST PRIORITIZATION GUIDELINES:
- Organizations have been classified along Influence (Power) and Interest axes.
- Key Players (High Influence & High Interest, 2.5x Priority Weight) MUST be given top strategic priority.
- Explicitly evaluate feedback through the lens of defined Stakeholder Bios, Red Lines, and Expectations.
- Highlight any policy recommendations or proposed actions that conflict with defined stakeholder red lines.
${docContextBlock}
${ragDocsBlock}
${stakeholderContextBlock}
Comments Dataset (Sorted by Stakeholder Power & Interest Priority):
${nodesUsed.map((c, i) => {
  const org = c.organizationName || c.originalRowData?.["Organization"] || c.originalRowData?.["Org"] || "Unspecified Org";
  const m = stakeholderMappings[org];
  const qLabel = m ? getQuadrantInfo(m.influence, m.interest).label : "Unmapped (1.0x Weight)";
  const refText = c.documentReference ? ` | Ref: "${c.documentReference}"` : "";
  return `[Comment ${i+1}] Org: "${org}" (${qLabel}) | Topic: "${c.topic}" | Sentiment: "${c.sentiment}"${refText}\nText: "${c.text}"`;
}).join("\n---\n")}

Format the response using beautiful, professional Markdown including:
1. **Executive Summary**: A concise paragraph of the overall stakeholder mood.
2. **Key Player & High Power Stakeholder Priorities**: Highlight specific feedback, friction, or alignment from top-tier organizations, referencing their Bios and Expectations.
3. **Red Lines & Non-Negotiable Boundary Audit**: Identify any dealbreakers, constraints, or non-negotiable friction points flagged by key stakeholders.
4. **Top Recurring Issues & Common Themes**: Key complaints/bugs and positive request clusters.
5. **Strategic Action Plan**: 3 clear bullet points on how to resolve the issues while respecting stakeholder red lines and fulfilling expectations.`;

      try {
        summaryText = await fetchLocalCompletion(structuredPrompt, llmSettings);
        showToast("Local LLM report synthesis complete!", "success");
      } catch (innerErr: any) {
        console.warn("Local model connection failed. Creating tailored heuristic report.", innerErr);
        showToast("Local server offline/CORS blocked. Compiled dynamic analysis.", "info");
        summaryText = generateLocalHeuristicSummary(filteredComments, stakeholderMappings);
      }

      const tracedText = summaryText + generateTraceabilitySection(nodesUsed);
      setExecutiveSummary(tracedText);
      setIsSummarizing(false);
    } catch (err: any) {
      setIsSummarizing(false);
      showToast(err.message || "Report generation failed.", "error");
    }
  };

  // 5.5 API Event: Generate Neighborhood Synthesis & Critique
  const handleGenerateNeighborhoodSynthesis = async () => {
    if (!selectedComment) return;
    setIsAnalyzingNeighborhood(true);
    showToast(`Requesting LLM review for comment and adjacent neighborhood...`, "info");
    
    const neighborhoodNodes = [selectedComment, ...similarToSelected.map((r) => r.comment)];
    const docContextBlock = buildDocumentContextPromptBlock(neighborhoodNodes, documentSections);

    const structuredPrompt = `You are a Senior Strategic Customer Experience & Data Analyst.
Analyze the following primary customer comment along with its closest semantic neighbors.
Provide a critical, objective review summarizing what stakeholders in this subset are saying, their underlying intent/problems, and any specific action recommendations.
${docContextBlock}
Selected Primary Comment (ID: ${selectedComment.id}):
Text: "${selectedComment.text}"
Topic: "${selectedComment.topic}"
Sentiment: "${selectedComment.sentiment}"
${selectedComment.documentReference ? `Document Reference: "${selectedComment.documentReference}"` : ""}

Nearest Semantic Neighbors:
${similarToSelected.map((res, i) => `[Neighbor ${i+1}] (Similarity Match: ${(res.similarity * 100).toFixed(0)}%) Text: "${res.comment.text}" (Topic: "${res.comment.topic}", Sentiment: "${res.comment.sentiment}"${res.comment.documentReference ? `, Ref: "${res.comment.documentReference}"` : ""})`).join("\n")}

Format your response using beautiful, structured Markdown. Make it professional and direct, highlighting overlapping needs and key friction points. Include:
1. **Case-Specific Critique**: Breakdown of the primary report.
2. **Adjacent Neighborhood Sentiment**: Overlapping themes or contradictions in the subset.
3. **Synthesis of Stakeholder Intent**: What they are collectively advocating/complaining about.
4. **Concrete Next Steps**: 2-3 strategic developer/product recommendations.`;

    try {
      let synthesisText = "";
      try {
        synthesisText = await fetchLocalCompletion(structuredPrompt, llmSettings);
        showToast("Local LLM neighborhood analysis complete!", "success");
      } catch (innerErr) {
        console.warn("Local model query failed, compiling offline client-side heuristic synthesis.", innerErr);
        showToast("Local LLM offline. Compiled client-side subset critique.", "info");
        synthesisText = generateLocalHeuristicNeighborhoodSynthesis(selectedComment, similarToSelected, docContextBlock);
      }

      const tracedText = synthesisText + generateTraceabilitySection(neighborhoodNodes);
      setNeighborhoodSynthesis(tracedText);

      const newHistoryItem: SavedSynthesis = {
        id: `map_${selectedComment.id}_${Date.now()}`,
        title: `Neighborhood of ${selectedComment.id} (${1 + similarToSelected.length} items)`,
        markdown: tracedText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString(),
        source: "map"
      };

      setSynthesisHistory((prev) => [newHistoryItem, ...prev]);
      setActiveSynthesis(newHistoryItem);
      setIsSynthesisModalOpen(true);
    } catch (err: any) {
      showToast(err.message || "Neighborhood review generation failed.", "error");
    } finally {
      setIsAnalyzingNeighborhood(false);
    }
  };

  // 5.6 API Event: Generate Cluster Synthesis & Critique for Deduplication tab
  const handleGenerateClusterSynthesis = async (group: any, groupIndex: number) => {
    setIsAnalyzingClusterId(group.id);
    showToast(`Requesting LLM review for Cluster #${groupIndex + 1}...`, "info");

    const totalMembers = 1 + group.duplicates.length;
    const clusterNodes = [group.originalComment, ...group.duplicates.map((d: any) => d.comment)];
    const docContextBlock = buildDocumentContextPromptBlock(clusterNodes, documentSections);

    const structuredPrompt = `You are a Senior Customer Quality Auditor & Product Strategy Analyst.
Analyze the following cluster of highly similar / duplicate feedback comments.
Provide a critical, objective review summarizing what stakeholders in this cluster are saying, their underlying intent, friction points, and specific actionable recommendations for deduplication and product action.
${docContextBlock}
Cluster Details:
- Number of items in Cluster: ${totalMembers}
- Similarity Threshold: ${filters.similarityThreshold * 100}%

Primary Retained Comment:
Text: "${group.originalComment.text}"
Topic: "${group.originalComment.topic}"
Sentiment: "${group.originalComment.sentiment}"
${group.originalComment.documentReference ? `Document Reference: "${group.originalComment.documentReference}"` : ""}

Other Matching/Duplicate Comments in Cluster:
${group.duplicates.map((dup: any, i: number) => `[Duplicate ${i+1}] (Similarity Match: ${(dup.similarity * 100).toFixed(0)}%) Text: "${dup.comment.text}" (Topic: "${dup.comment.topic}", Sentiment: "${dup.comment.sentiment}"${dup.comment.documentReference ? `, Ref: "${dup.comment.documentReference}"` : ""})`).join("\n")}

Format your response using beautiful, structured Markdown. Make it professional and direct. Include:
1. **Cluster Essence**: Objective critique of what the core complaint or suggestion is.
2. **Variance Analysis**: Note if any duplicate comments contain extra unique context, columns, or slight differences in severity.
3. **Product & Audit Recommendation**: 2-3 specific strategic guidelines on how to resolve the root user friction and whether these rows are safe to archive/merge.`;

    try {
      let synthesisText = "";
      try {
        synthesisText = await fetchLocalCompletion(structuredPrompt, llmSettings);
        showToast(`Local LLM synthesis complete for Cluster #${groupIndex + 1}!`, "success");
      } catch (innerErr) {
        console.warn("Local model query failed, compiling offline client-side cluster synthesis.", innerErr);
        showToast("Local LLM offline. Compiled client-side cluster critique.", "info");
        synthesisText = generateLocalHeuristicClusterSynthesis(group.originalComment, group.duplicates, filters.similarityThreshold);
      }

      const tracedText = synthesisText + generateTraceabilitySection(clusterNodes);

      const newHistoryItem: SavedSynthesis = {
        id: `cluster_${group.id}_${Date.now()}`,
        title: `Cluster #${groupIndex + 1} Audit (${totalMembers} items)`,
        markdown: tracedText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString(),
        source: "cluster"
      };

      setSynthesisHistory((prev) => [newHistoryItem, ...prev]);
      setActiveSynthesis(newHistoryItem);
      setIsSynthesisModalOpen(true);
    } catch (err: any) {
      showToast(err.message || "Cluster critique generation failed.", "error");
    } finally {
      setIsAnalyzingClusterId(null);
    }
  };

  // 5.7 API Event: Generate Refined Nodes Critique
  const [isAnalyzingRefinedNodes, setIsAnalyzingRefinedNodes] = useState<boolean>(false);
  const [showRefinedConfirmWarning, setShowRefinedConfirmWarning] = useState<boolean>(false);

  const handleGenerateRefinedNodesSynthesis = async () => {
    const realFiltered = filteredComments.filter(c => c.id !== "user_query_node");
    if (realFiltered.length === 0) {
      showToast("No active refined nodes in scope to analyze.", "error");
      return;
    }

    setIsAnalyzingRefinedNodes(true);
    showToast(`Requesting LLM review for ${realFiltered.length} refined nodes...`, "info");

    const activeQueryText = filters.searchQuery.trim();
    const docContextBlock = buildDocumentContextPromptBlock(realFiltered, documentSections);

    const structuredPrompt = `You are a Lead CX Strategist & Vector Data Auditor.
Analyze the following custom subset of customer feedback records matching the user's current search/refinement filters.
Provide a critical, objective review summarizing the collective voice of this segment, key complaints/friction points, and specific action recommendations.
${docContextBlock}
Segment Details:
- Active Search Query: "${activeQueryText || "N/A (All Active Filters)"}"
- Sentiment Filters: [${filters.sentiments.join(", ")}]
- Topic Filters: [${filters.topics.join(", ")}]
- Number of items in segment: ${realFiltered.length}

Matching Customer Comments:
${realFiltered.slice(0, 30).map((c, i) => `[Record ${i+1}] ID: ${c.id} (Topic: "${c.topic}", Sentiment: "${c.sentiment}"${c.documentReference ? `, Ref: "${c.documentReference}"` : ""}): "${c.text}"`).join("\n")}
${realFiltered.length > 30 ? `...and ${realFiltered.length - 30} more matching comments.` : ""}

Format your response using beautiful, structured Markdown. Make it professional and direct. Include:
1. **Segment Theme & Tone**: High-level critical review of what stakeholders in this subset are collectively saying.
2. **Sentiment & Topic Distribution**: Highlights of key subcategories or unexpected outliers.
3. **Core Conflict/Friction**: The deepest root-cause issues affecting this group.
4. **Action Recommendations**: 2-3 strategic guidelines for engineering or product teams.`;

    try {
      const refinedNodes = realFiltered.slice(0, 30);
      let synthesisText = "";
      try {
        synthesisText = await fetchLocalCompletion(structuredPrompt, llmSettings);
        showToast("Local LLM refined nodes analysis complete!", "success");
      } catch (innerErr) {
        console.warn("Local model query failed, compiling offline client-side refined nodes critique.", innerErr);
        showToast("Local LLM offline. Compiled client-side refined nodes critique.", "info");
        synthesisText = generateLocalHeuristicRefinedNodesSynthesis(realFiltered, activeQueryText, docContextBlock);
      }

      const tracedText = synthesisText + generateTraceabilitySection(refinedNodes);

      const newHistoryItem: SavedSynthesis = {
        id: `refined_${Date.now()}`,
        title: activeQueryText 
          ? `Refined Search: "${activeQueryText}" (${realFiltered.length} items)`
          : `Refined Nodes Subset (${realFiltered.length} items)`,
        markdown: tracedText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString(),
        source: "map"
      };

      setSynthesisHistory((prev) => [newHistoryItem, ...prev]);
      setActiveSynthesis(newHistoryItem);
      setIsSynthesisModalOpen(true);
    } catch (err: any) {
      showToast(err.message || "Refined nodes review generation failed.", "error");
    } finally {
      setIsAnalyzingRefinedNodes(false);
    }
  };

  // 5.8 API Event: Generate Semantic Query Synthesis & Critique
  const [isAnalyzingSemanticQuery, setIsAnalyzingSemanticQuery] = useState<boolean>(false);

  const handleGenerateSemanticQuerySynthesis = async (queryText: string, results: CommentItem[]) => {
    if (results.length === 0) {
      showToast("No active search results to analyze.", "error");
      return;
    }

    setIsAnalyzingSemanticQuery(true);
    showToast(`Requesting LLM review for "${queryText}" (${results.length} results)...`, "info");

    const docContextBlock = buildDocumentContextPromptBlock(results, documentSections);

    const structuredPrompt = `You are a Lead Customer Experience Strategist & Vector Auditor.
Analyze the following customer feedback records retrieved via semantic search vector similarity.
Provide a critical, objective review summarizing the collective user feedback, their central complaints/friction, and actionable developer recommendations.
${docContextBlock}
Search Parameters:
- Semantic Query Text: "${queryText}"
- Match Threshold: >= ${filters.similarityThreshold * 100}%
- Total Matches: ${results.length}

Top Matching Comments:
${results.slice(0, 30).map((c, i) => `[Match ${i+1}] ID: ${c.id} (Similarity: ${c.similarityScore !== undefined ? (c.similarityScore * 100).toFixed(0) : "N/A"}%${c.documentReference ? `, Ref: "${c.documentReference}"` : ""}): "${c.text}"`).join("\n")}
${results.length > 30 ? `...and ${results.length - 30} more matching comments.` : ""}

Format your response using beautiful, structured Markdown. Make it professional and direct. Include:
1. **Search Context Critique**: Critical overview of what users are reporting when querying for "${queryText}".
2. **Common Intent & Alignment**: Overlapping expectations or friction trends in this semantic matching set.
3. **Product Resolutions**: 2-3 strategic actionable developer recommendations to address this feedback area.`;

    try {
      const semanticNodes = results.slice(0, 30);
      let synthesisText = "";
      try {
        synthesisText = await fetchLocalCompletion(structuredPrompt, llmSettings);
        showToast("Local LLM semantic query analysis complete!", "success");
      } catch (innerErr) {
        console.warn("Local model query failed, compiling offline client-side semantic search synthesis.", innerErr);
        showToast("Local LLM offline. Compiled client-side query critique.", "info");
        synthesisText = generateLocalHeuristicRefinedNodesSynthesis(results, queryText, docContextBlock);
      }

      const tracedText = synthesisText + generateTraceabilitySection(semanticNodes);

      const newHistoryItem: SavedSynthesis = {
        id: `semantic_${Date.now()}`,
        title: `Semantic Search: "${queryText}" (${results.length} items)`,
        markdown: tracedText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString(),
        source: "map"
      };

      setSynthesisHistory((prev) => [newHistoryItem, ...prev]);
      setActiveSynthesis(newHistoryItem);
      setIsSynthesisModalOpen(true);
    } catch (err: any) {
      showToast(err.message || "Semantic query review generation failed.", "error");
    } finally {
      setIsAnalyzingSemanticQuery(false);
    }
  };

  // Perform factual executive meta-review of syntheses done to date
  const handlePerformMetaReview = async () => {
    if (synthesisHistory.length === 0) {
      showToast("No synthesis reports recorded in history yet.", "error");
      return;
    }

    setIsSynthesizingMeta(true);
    let reviewMarkdown = "";

    const structuredPrompt = `You are a senior executive auditor. Perform a comprehensive critical executive review pulling together the information from the following ${synthesisHistory.length} synthesis report(s) generated to date.

CRITICAL CONSTRAINTS & GUARANTEES:
1. DO NOT fabricate new data, numbers, or assumptions not present in the provided reports.
2. DO NOT hallucinate or extrapolate facts. Remain 100% factual and grounded exclusively in the text of the existing syntheses.
3. Combine, harmonize, and critically review the findings, stakeholder concerns, and action items already established in these reports into a cohesive executive meta-review.

--- EXISTING SYNTHESES TO AUDIT & SYNTHESIZE ---
${synthesisHistory.map((item, idx) => `REPORT #${idx + 1}: "${item.title}" (${item.timestamp}) [Source: ${item.source || 'General'}]\n${item.markdown}\n`).join("\n\n")}

--- OUTPUT FORMAT ---
Respond using clean, structured markdown with the following headers:
# Critical Executive Review of Prior Syntheses
## 1. Meta-Executive Summary & Audit Scope
## 2. Consolidated Core Findings & Themes
## 3. Cross-Cutting Stakeholder Impact
## 4. Unified Prioritized Action Plan
## 5. Audit Traceability Log`;

    try {
      try {
        reviewMarkdown = await fetchLocalCompletion(structuredPrompt, llmSettings);
        showToast("Executive meta-review compiled via LLM!", "success");
      } catch (innerErr) {
        console.warn("Local model query failed, using client-side deterministic meta-review.", innerErr);
        reviewMarkdown = generateLocalHeuristicMetaExecutiveReview(synthesisHistory);
        showToast("Compiled client-side executive review of existing syntheses.", "info");
      }
    } catch (err: any) {
      reviewMarkdown = generateLocalHeuristicMetaExecutiveReview(synthesisHistory);
    } finally {
      setIsSynthesizingMeta(false);
    }

    const newMetaItem: SavedSynthesis = {
      id: `meta_review_${Date.now()}`,
      title: `Executive Review of Syntheses (${synthesisHistory.length} Reports)`,
      markdown: reviewMarkdown,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString(),
      source: "meta"
    };

    setSynthesisHistory((prev) => [newMetaItem, ...prev]);
    setActiveSynthesis(newMetaItem);
    setIsSynthesisModalOpen(true);
  };

  const handlePerformStakeholderMetaReview = async () => {
    // Filter synthesisHistory for organization/stakeholder reports
    const stakeholderReports = synthesisHistory.filter(
      (item) => item.source === "organization" || item.source?.startsWith("Organization:") || item.source === "stakeholder_meta"
    );

    if (stakeholderReports.length === 0) {
      showToast("No organization or stakeholder intelligence reports found in history. Generate some organization reports first!", "error");
      return;
    }

    setIsSynthesizingMeta(true);
    let reviewMarkdown = "";

    const structuredPrompt = `You are a senior executive policy director and chief negotiation auditor. Perform a comprehensive Executive Summary of Stakeholder Positions across the following ${stakeholderReports.length} organization/stakeholder intelligence report(s).

CRITICAL CONSTRAINTS & GUARANTEES:
1. Ground every statement exclusively in the provided stakeholder reports. Do NOT fabricate or extrapolate unstated facts.
2. Synthesize organization expectations, non-negotiable red lines, implicit motivations, and strategic leverage points.
3. Compare positions across organizations to highlight potential coalitions, irreconcilable conflicts, and win-win negotiation pathways.

--- ORGANIZATIONS & STAKEHOLDER REPORTS TO SYNTHESIZE ---
${stakeholderReports.map((item, idx) => `STAKEHOLDER REPORT #${idx + 1}: "${item.title}" (${item.timestamp})\n${item.markdown}\n`).join("\n\n")}

--- OUTPUT FORMAT ---
Respond using clean, structured markdown with the following headers:
# 🏛️ EXECUTIVE SUMMARY OF STAKEHOLDER POSITIONS
## 1. Multi-Stakeholder Executive Overview
## 2. Shared Expectations & Common Ground
## 3. Critical Red Lines & High-Risk Dealbreakers
## 4. Implicit Motivations & Power-Interest Dynamics
## 5. Strategic Leverage Points & Compromise Pathways
## 6. Executive Action Plan for Stakeholder Engagement`;

    try {
      try {
        reviewMarkdown = await fetchLocalCompletion(structuredPrompt, llmSettings);
        showToast("Executive summary of stakeholder positions compiled via LLM!", "success");
      } catch (innerErr) {
        console.warn("Local model query failed, using client-side deterministic stakeholder meta-review.", innerErr);
        reviewMarkdown = generateLocalHeuristicStakeholderMetaReview(stakeholderReports);
        showToast("Compiled executive summary of stakeholder positions.", "info");
      }
    } catch (err: any) {
      reviewMarkdown = generateLocalHeuristicStakeholderMetaReview(stakeholderReports);
    } finally {
      setIsSynthesizingMeta(false);
    }

    const newMetaItem: SavedSynthesis = {
      id: `stakeholder_meta_${Date.now()}`,
      title: `Executive Summary of Stakeholder Positions (${stakeholderReports.length} Organizations)`,
      markdown: reviewMarkdown,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString(),
      source: "stakeholder_meta"
    };

    setSynthesisHistory((prev) => [newMetaItem, ...prev]);
    setActiveSynthesis(newMetaItem);
    setIsSynthesisModalOpen(true);
  };

  // 6. Action: Add a manual single comment
  const [newCommentText, setNewCommentText] = useState("");
  const handleAddManualComment = () => {
    if (!newCommentText.trim()) return;

    // Generate coordinates on outer borders
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.5 + Math.random() * 0.4;
    const x = Math.sin(angle) * radius;
    const y = Math.cos(angle) * radius;

    // Fast deterministic vector
    const vector = new Array(256).fill(0).map((_, i) => Math.sin(i * newCommentText.length));

    const newRec: CommentItem = {
      id: `man_${Date.now().toString().slice(-4)}`,
      text: newCommentText.trim(),
      sentiment: "neutral",
      topic: "Unassigned Feedback",
      embedding: vector,
      x,
      y,
      isArchived: false,
      timestamp: new Date().toISOString().split('T')[0]
    };

    setComments((prev) => [...prev, newRec]);
    setNewCommentText("");
    setSelectedCommentId(newRec.id);
    showToast("Added manual comment. Click it on the map to label or categorize!", "success");
  };

  // 7. Action: Update metadata details on selected comment
  const handleUpdateSelectedMetadata = (fields: Partial<CommentItem>) => {
    setComments((prev) =>
      prev.map((c) => (c.id === selectedCommentId ? { ...c, ...fields } : c))
    );
    showToast("Updated item properties", "success");
  };

  // 8. Action: Archive / Remove duplicate or comment
  const handleArchiveComment = (id: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isArchived: true } : c))
    );
    if (selectedCommentId === id) {
      setSelectedCommentId(null);
    }
    showToast("Comment archived successfully.", "success");
  };

  // 9. Action: Dismiss Duplicate status (Keep both)
  const handleDismissDuplicate = (id: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isDuplicate: false, duplicateOfId: undefined } : c))
    );
    showToast("Marked as unique.", "success");
  };

  // 10. Session Operations: Export & Import JSON / HTML Snapshot
  const handleExportOfflineHtml = () => {
    const fullComments = comments.map((c) => ({
      ...c,
      embedding: getCommentEmbedding(c, llmSettings.useCustomEmbedding) || c.embedding,
    }));

    const htmlString = generateSelfContainedOfflineHtml({
      comments: fullComments,
      stakeholderMappings,
      executiveSummary,
      synthesisHistory,
      similarityThreshold: filters.similarityThreshold,
    });

    const blob = new Blob([htmlString], {
      type: "text/html;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `feedback_analysis_snapshot_${new Date().toISOString().split('T')[0]}.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Exported self-contained offline HTML snapshot! Open in any browser.", "success");
  };

  const handleExportSession = () => {
    const fullComments = comments.map((c) => ({
      ...c,
      embedding: getCommentEmbedding(c, llmSettings.useCustomEmbedding) || c.embedding,
    }));
    const sessionData = {
      comments: fullComments,
      similarityThreshold: filters.similarityThreshold,
      executiveSummary,
    };
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `similarity_session_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Session JSON file exported successfully!", "success");
  };

  const handleImportSession = (sessionData: {
    comments: CommentItem[];
    similarityThreshold: number;
    executiveSummary: string | null;
  }) => {
    setComments(sessionData.comments);
    setFilters((prev) => ({ ...prev, similarityThreshold: sessionData.similarityThreshold }));
    setExecutiveSummary(sessionData.executiveSummary);
    setSelectedCommentId(null);
    setPreviousCommentsBeforeReclustering(null); // Clear previous clustering on import
    showToast("Session state successfully restored!", "success");
  };

  const handleImportCSV = (newComments: CommentItem[]) => {
    setComments(newComments);
    setSelectedCommentId(null);
    setExecutiveSummary(null); // Clear summary for new dataset
    setPreviousCommentsBeforeReclustering(null); // Clear previous clustering on import
    showToast(`Loaded ${newComments.length} comments from CSV dataset!`, "success");
  };

  const handleReclusterTopics = () => {
    if (comments.length === 0) {
      showToast("No active comments found to analyze.", "error");
      return;
    }
    // Save current comments state to allow reverting/undoing
    setPreviousCommentsBeforeReclustering([...comments]);

    const updated = clusterCommentsDynamically(comments);
    setComments(updated);
    setFilters((prev) => ({ ...prev, topics: [] })); // Clear selected topics since they are updated
    showToast("Successfully identified and clustered authentic topics from comments! You can revert this if needed.", "success");
  };

  const handleRevertReclustering = () => {
    if (!previousCommentsBeforeReclustering) {
      showToast("No previous clustering state found to revert.", "error");
      return;
    }
    setComments(previousCommentsBeforeReclustering);
    setPreviousCommentsBeforeReclustering(null);
    setFilters((prev) => ({ ...prev, topics: [] }));
    showToast("Successfully reverted smart topic re-clustering to prior state.", "success");
  };

  const handleReloadProjectionWithQuery = (queryText: string, queryEmbedding: number[]) => {
    if (comments.length === 0) {
      showToast("No active comments found to project.", "error");
      return;
    }

    // Filter out previous user query node
    const otherComments = comments.filter((c) => c.id !== "user_query_node");

    // Compute coordinates using the standard projection logic
    let qX = 0;
    let qY = 0;
    if (queryEmbedding && queryEmbedding.length >= 2) {
      const half = Math.floor(queryEmbedding.length / 2);
      const sumA = queryEmbedding.slice(0, half).reduce((sum, v) => sum + v, 0);
      const sumB = queryEmbedding.slice(half).reduce((sum, v) => sum + v, 0);
      qX = Math.sin(sumA * 4.5) * 0.95;
      qY = Math.cos(sumB * 4.5) * 0.95;
    }

    const queryNode: CommentItem = {
      id: "user_query_node",
      text: queryText,
      sentiment: "neutral",
      topic: "🔍 Search Query",
      embedding: queryEmbedding,
      x: qX,
      y: qY,
      isArchived: false,
      timestamp: new Date().toISOString().split('T')[0]
    };

    const allItemsToProject = [...otherComments, queryNode];

    // Re-calculate coordinates for all items (re-project them all)
    const updated = allItemsToProject.map((item, idx) => {
      const vector = getCommentEmbedding(item, llmSettings.useCustomEmbedding) || item.embedding || [];
      
      let x = 0;
      let y = 0;
      
      if (vector && vector.length >= 2) {
        const half = Math.floor(vector.length / 2);
        const sumA = vector.slice(0, half).reduce((sum, v) => sum + v, 0);
        const sumB = vector.slice(half).reduce((sum, v) => sum + v, 0);
        x = Math.sin(sumA * 4.5) * 0.95;
        y = Math.cos(sumB * 4.5) * 0.95;
      } else {
        x = Math.sin(idx * 0.4) * 0.8;
        y = Math.cos(idx * 0.4) * 0.8;
      }

      return {
        ...item,
        x,
        y
      };
    });

    setComments(updated);
    setSelectedCommentId("user_query_node");
    showToast("Re-computed coordinates & placed query node in the visual cluster!", "success");
  };

  const handleClearQueryNode = () => {
    setComments((prev) => prev.filter((c) => c.id !== "user_query_node"));
    if (selectedCommentId === "user_query_node") {
      setSelectedCommentId(null);
    }
    showToast("Removed search query node from the visual cluster.", "info");
  };

  const apiMode = llmSettings.useCustomEmbedding ? "live" : "demo";

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-[#1A1A1A] flex flex-col font-sans selection:bg-[#E5E3DF]">
      
      {/* Dynamic Toast System */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`px-5 py-3 shadow-sm flex items-center gap-3 border text-xs tracking-wide font-medium rounded-none bg-white ${
            toast.type === "success" 
              ? "border-[#4A6741] text-[#4A6741]" 
              : toast.type === "error"
              ? "border-[#A13D2D] text-[#A13D2D]"
              : "border-[#1A1A1A] text-[#1A1A1A]"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              toast.type === "success" 
                ? "bg-[#4A6741]" 
                : toast.type === "error"
                ? "bg-[#A13D2D]"
                : "bg-[#1A1A1A]"
            }`} />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Slide-over Settings Drawer */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden font-sans">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-[#1A1A1A]/30 backdrop-blur-xs transition-opacity duration-300"
            onClick={closeSettings}
          />

          <div className="absolute inset-y-0 right-0 max-w-full pl-10 flex h-full">
            <div className="w-screen max-w-md bg-white border-l border-[#E5E3DF] p-6 flex flex-col justify-between shadow-xl animate-in slide-in-from-right duration-300 h-full overflow-y-auto scrollbar-thin">
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-[#E5E3DF]">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-[#1A1A1A]" />
                    <h3 className="font-serif italic text-lg text-[#1A1A1A]">Local LLM Configuration</h3>
                  </div>
                  <button 
                    onClick={closeSettings}
                    className="p-1 text-gray-400 hover:text-[#1A1A1A] cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Form fields */}
                <div className="space-y-5 text-xs">
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                      Local LLM API Base URL
                    </label>
                    <input
                      type="text"
                      value={llmSettings.baseUrl}
                      onChange={(e) => setLlmSettings({ ...llmSettings, baseUrl: e.target.value })}
                      placeholder="http://localhost:11434/v1"
                      className="w-full bg-white border border-[#E5E3DF] px-3 py-2 text-xs focus:outline-none focus:border-[#1A1A1A] font-mono rounded-none mb-2"
                    />
                    <button
                      type="button"
                      disabled={isTestingConnection}
                      onClick={() => handleTestConnection()}
                      className="w-full py-1.5 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 disabled:bg-gray-300 text-white text-[9px] uppercase tracking-wider font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <RefreshCcw className={`w-3 h-3 ${isTestingConnection ? 'animate-spin' : ''}`} />
                      {isTestingConnection ? "Testing & Fetching Models..." : "Test Connection & Fetch Models"}
                    </button>
                    <p className="text-[9px] text-gray-400 mt-1 uppercase tracking-wider leading-relaxed">
                      OpenAI-compatible local server (Ollama, LM Studio, etc.)
                    </p>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                      Synthesis Chat Model Name
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={availableModels.includes(llmSettings.modelName) ? llmSettings.modelName : ""}
                        onChange={(e) => {
                          if (e.target.value) {
                            setLlmSettings({ ...llmSettings, modelName: e.target.value });
                          }
                        }}
                        className="flex-1 bg-white border border-[#E5E3DF] px-2 py-1.5 text-xs focus:outline-none focus:border-[#1A1A1A] rounded-none"
                      >
                        <option value="" disabled>-- Select retrieved model --</option>
                        {availableModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={llmSettings.modelName}
                        onChange={(e) => setLlmSettings({ ...llmSettings, modelName: e.target.value })}
                        placeholder="llama3"
                        className="w-1/3 bg-white border border-[#E5E3DF] px-2 py-1.5 text-xs focus:outline-none focus:border-[#1A1A1A] font-mono rounded-none"
                        title="Manual model override"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-dashed border-[#E5E3DF] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-700">Custom Local Embeddings Endpoint</span>
                      <input
                        type="checkbox"
                        checked={llmSettings.useCustomEmbedding}
                        onChange={(e) => setLlmSettings({ ...llmSettings, useCustomEmbedding: e.target.checked })}
                        className="w-4 h-4 accent-[#1A1A1A] cursor-pointer"
                      />
                    </div>

                    {llmSettings.useCustomEmbedding ? (
                      <div className="space-y-3 p-3 bg-[#F9F8F6] border border-[#E5E3DF] animate-in fade-in duration-200">
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                            Embedding Endpoint Base URL
                          </label>
                          <input
                            type="text"
                            value={llmSettings.embeddingUrl}
                            onChange={(e) => setLlmSettings({ ...llmSettings, embeddingUrl: e.target.value })}
                            placeholder="http://localhost:11434/v1"
                            className="w-full bg-white border border-[#E5E3DF] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#1A1A1A] font-mono rounded-none"
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
                                  setLlmSettings({ ...llmSettings, embeddingModel: e.target.value });
                                }
                              }}
                              className="flex-1 bg-white border border-[#E5E3DF] px-2 py-1.5 text-xs focus:outline-none focus:border-[#1A1A1A] rounded-none"
                            >
                              <option value="" disabled>-- Select retrieved model --</option>
                              {availableEmbeddingModels.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={llmSettings.embeddingModel}
                              onChange={(e) => setLlmSettings({ ...llmSettings, embeddingModel: e.target.value })}
                              placeholder="nomic-embed-text"
                              className="w-1/3 bg-white border border-[#E5E3DF] px-2 py-1.5 text-xs focus:outline-none focus:border-[#1A1A1A] font-mono rounded-none"
                              title="Manual embedding model override"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5 p-3 bg-[#4A6741]/5 border border-[#4A6741]/20 text-[#4A6741]">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <p className="text-[9px] leading-normal">
                          Using built-in local heuristics. Snappy, client-side, and 100% offline.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[#E5E3DF]">
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                      Bearer Authorization Key (Optional)
                    </label>
                    <input
                      type="password"
                      value={llmSettings.apiKey}
                      onChange={(e) => setLlmSettings({ ...llmSettings, apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="w-full bg-white border border-[#E5E3DF] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#1A1A1A] font-mono rounded-none"
                    />
                  </div>

                  <div className="pt-3 border-t border-[#E5E3DF]">
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500">
                        AI Persona & Analysis Guidelines
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setLlmSettings({
                            ...llmSettings,
                            customPersona: "You are a Senior Strategic Product & Customer Experience Analyst. Focus heavily on stakeholder sentiment, correctly infer user intent from context, and reconcile opposing friction points while maintaining complete factual integrity with zero hallucinations."
                          });
                        }}
                        className="text-[8px] uppercase tracking-wider text-[#4A6741] hover:underline cursor-pointer font-bold"
                      >
                        Reset to Default
                      </button>
                    </div>

                    <PromptAssistant
                      llmSettings={llmSettings}
                      onPersonaGenerated={(newPersona) => {
                        setLlmSettings(prev => ({
                          ...prev,
                          customPersona: newPersona
                        }));
                      }}
                      className="mb-2.5"
                    />

                    <textarea
                      value={llmSettings.customPersona || ""}
                      onChange={(e) => setLlmSettings({ ...llmSettings, customPersona: e.target.value })}
                      placeholder="e.g., You are a senior policy analyst. You must focus on stakeholder sentiment. You must infer intent, but never make up factual information..."
                      rows={5}
                      className="w-full bg-white border border-[#E5E3DF] p-2.5 text-xs focus:outline-none focus:border-[#1A1A1A] font-sans rounded-none leading-relaxed resize-none"
                    />
                    <p className="text-[9px] text-gray-400 mt-1 uppercase tracking-wider leading-relaxed">
                      Customizes the AI's role, analytical focal points, and reasoning bounds for all reports, critiques, and multi-perspective contrast syntheses.
                    </p>
                  </div>
                </div>
              </div>

              {/* Reset/Clear Button inside the settings tray */}
              <div className="pt-4 border-t border-[#E5E3DF] space-y-3">
                {!showClearConfirm ? (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="w-full py-2.5 bg-[#A13D2D] hover:bg-[#A13D2D]/90 text-white text-[10px] uppercase tracking-widest font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Clear Workspace & Exit
                  </button>
                ) : (
                  <div className="bg-[#A13D2D]/5 p-3.5 border border-[#A13D2D]/20 space-y-3 animate-in fade-in duration-200">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-[#A13D2D] text-center">
                      Confirm Clear Workspace?
                    </p>
                    <p className="text-[9px] text-gray-500 text-center leading-normal">
                      This will erase all workspace comments, synthesis reports, matrices, and document models. Your local LLM connection settings are kept intact.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className="flex-1 py-1.5 border border-[#E5E3DF] hover:border-[#1A1A1A] text-[#1A1A1A] bg-white text-[9px] uppercase tracking-wider font-bold cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleClearWorkspace}
                        className="flex-1 py-1.5 bg-[#A13D2D] hover:bg-[#A13D2D]/90 text-white text-[9px] uppercase tracking-wider font-bold cursor-pointer transition-colors"
                      >
                        Yes, Clear
                      </button>
                    </div>
                  </div>
                )}
                <button
                  onClick={closeSettings}
                  className="w-full py-2.5 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white text-[10px] uppercase tracking-widest font-bold flex items-center justify-center cursor-pointer transition-all"
                >
                  Close Panel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Header navigation */}
      <header id="main_header" className="bg-white border-b border-[#E5E3DF] min-h-16 py-3 px-4 sm:px-8 flex flex-wrap items-center justify-between gap-3 shrink-0 sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <span className="font-serif italic text-xl sm:text-2xl tracking-tighter text-[#1A1A1A]">Sentiment.Core</span>
          <span className="h-4 w-px bg-[#E5E3DF]"></span>
          <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] font-semibold opacity-60">Vector Intelligence Hub</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          {/* Active Local LLM Info Label */}
          <div className="hidden md:flex items-center gap-2 border border-[#E5E3DF] bg-[#F9F8F6] px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-mono">
            <span className={`h-1.5 w-1.5 rounded-full ${llmSettings.useCustomEmbedding ? "bg-[#4A6741] animate-pulse" : "bg-gray-400"}`} />
            <span className="text-gray-500">LLM:</span>
            <span className="font-bold text-[#1A1A1A]">{llmSettings.modelName}</span>
          </div>

          {/* Quick stats label (only if initialized) */}
          {isInitialized && (
            <div className="border border-[#E5E3DF] text-[#1A1A1A] px-2.5 py-1.5 text-[10px] uppercase tracking-widest font-mono font-bold bg-white">
              {comments.filter(c => !c.isArchived).length} records
            </div>
          )}

          {/* Synthesis History Button */}
          {isInitialized && (
            <button 
              onClick={() => {
                if (!activeSynthesis && synthesisHistory.length > 0) {
                  setActiveSynthesis(synthesisHistory[0]);
                }
                setIsSynthesisModalOpen(true);
              }}
              className="flex items-center gap-1.5 border border-[#E5E3DF] hover:border-[#1A1A1A] hover:bg-[#F9F8F6] text-[#1A1A1A] px-2.5 py-1.5 text-[10px] uppercase tracking-widest font-bold cursor-pointer transition-all bg-white"
              title="Open LLM Critique History Hub"
            >
              <History className="w-3.5 h-3.5 text-amber-500" />
              <span>History ({synthesisHistory.length})</span>
            </button>
          )}

          {/* Stakeholder Matrix Button */}
          {isInitialized && (
            <button 
              onClick={() => handleOpenStakeholderModal()}
              className="flex items-center gap-1.5 border border-[#E5E3DF] hover:border-[#4A6741] hover:bg-emerald-50 text-[#1A1A1A] px-2.5 py-1.5 text-[10px] uppercase tracking-widest font-bold cursor-pointer transition-all bg-white"
              title="Open Stakeholder Power-Interest Matrix Modal"
            >
              <FolderKanban className="w-3.5 h-3.5 text-[#4A6741]" />
              <span>Stakeholder Grid</span>
            </button>
          )}

          {/* Document Context Workbench Button */}
          {isInitialized && (
            <button 
              onClick={() => setIsDocumentContextModalOpen(true)}
              className="flex items-center gap-1.5 border border-[#E5E3DF] hover:border-amber-600 hover:bg-amber-50 text-[#1A1A1A] px-2.5 py-1.5 text-[10px] uppercase tracking-widest font-bold cursor-pointer transition-all bg-white"
              title="Open Document Context Workbench Modal"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-600" />
              <span>Doc Model ({documentSections.filter(s => s.excerptText && s.excerptText.trim().length > 0).length}/{documentSections.length})</span>
            </button>
          )}

          {/* About Modal Button */}
          <button 
            onClick={() => setIsAboutOpen(true)}
            className="flex items-center gap-1.5 border border-[#E5E3DF] hover:border-[#1A1A1A] hover:bg-[#F9F8F6] text-[#1A1A1A] px-2.5 py-1.5 text-[10px] uppercase tracking-widest font-bold cursor-pointer transition-all bg-white"
            title="About Sentiment.Core & Embeddings"
          >
            <Info className="w-3.5 h-3.5 text-[#4A6741]" />
            <span>About</span>
          </button>

          {/* Slide Drawer Button */}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 border border-[#1A1A1A] hover:bg-[#F9F8F6] text-[#1A1A1A] px-2.5 py-1.5 text-[10px] uppercase tracking-widest font-bold cursor-pointer transition-all bg-white"
            title="Configure Local LLM"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* Conditional Rendering Content */}
      {!isInitialized ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <SetupLandingPage
            llmSettings={llmSettings}
            onChangeSettings={setLlmSettings}
            onInitializeWithComments={(newComments, summary) => {
              setComments(newComments);
              setPreviousCommentsBeforeReclustering(null);
              if (summary) setExecutiveSummary(summary);
            }}
            onStartIndexing={handleStartIndexing}
            isIndexing={isIndexing}
            availableModels={availableModels}
            availableEmbeddingModels={availableEmbeddingModels}
            onTestConnection={handleTestConnection}
            isTestingConnection={isTestingConnection}
          />
        </div>
      ) : (
        <>
          {/* Heuristics notification banner */}
          {!llmSettings.useCustomEmbedding && (
            <div className="bg-[#1A1A1A] text-white py-3 px-8 border-b border-[#E5E3DF]">
              <div className="max-w-7xl mx-auto flex items-center gap-3 text-xs tracking-wide">
                <Info className="w-4 h-4 text-gray-300 shrink-0" />
                <span>
                  <strong className="font-semibold">LOCAL HEURISTIC PROJECTIONS ACTIVE:</strong> Generate embeddings and synthesis directly inside the browser instantly. Open <strong>Settings</strong> to configure a local model endpoint (Ollama, LM Studio).
                </span>
              </div>
            </div>
          )}

          {/* Main body viewport */}
          <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-8">
            
            {/* Dynamic Interactive Metrics Dashboard Row */}
            <section id="metrics_dashboard">
              <DashboardStats 
                comments={comments} 
                filters={filters} 
                onChangeFilters={setFilters} 
                onClearFilters={() => setFilters({
                  sentiments: [],
                  topics: [],
                  organizations: [],
                  searchQuery: "",
                  showDuplicatesOnly: false,
                  similarityThreshold: filters.similarityThreshold,
                })}
                isFallback={apiMode === "demo"}
                onReclusterTopics={handleReclusterTopics}
                onRevertReclustering={handleRevertReclustering}
                canRevertReclustering={!!previousCommentsBeforeReclustering}
              />
            </section>

            {/* View Mode Navigation Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#E5E3DF] gap-2 w-full pb-1 md:pb-0">
              <section className="flex flex-wrap items-center gap-1 sm:gap-2 max-w-full overflow-x-auto scrollbar-thin">
                {[
                  { id: "explore", label: "Similarity Plot", icon: Map },
                  { id: "list", label: "Comments List", icon: List },
                  { id: "duplicates", label: "Deduplication Audit", icon: ShieldCheck },
                  { id: "query", label: "Semantic Query", icon: Sparkle },
                  { id: "clusters", label: "Custom Clusters", icon: FolderKanban },
                  { id: "organizations", label: "Organizations", icon: Building2 },
                  { id: "report", label: "Executive Synthesis", icon: Layers },
                  { id: "data", label: "Manage Datasets", icon: Database },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 text-[10px] sm:text-[11px] uppercase tracking-[0.12em] font-semibold border-b-2 transition-all cursor-pointer ${
                        isActive
                          ? "border-[#1A1A1A] text-[#1A1A1A] bg-[#F9F8F6]"
                          : "border-transparent text-gray-500 hover:text-[#1A1A1A] hover:bg-gray-50"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </section>

              <div className="flex items-center px-2 sm:px-0 py-1 sm:py-0 shrink-0">
                <button 
                  onClick={() => {
                    if (!activeSynthesis && synthesisHistory.length > 0) {
                      setActiveSynthesis(synthesisHistory[0]);
                    }
                    setIsSynthesisModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 border border-[#E5E3DF] hover:border-[#1A1A1A] hover:bg-[#F9F8F6] text-[#1A1A1A] px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold cursor-pointer transition-all bg-white shadow-xs"
                  title="View Saved Critical Summaries & Audits"
                >
                  <History className="w-3.5 h-3.5 text-amber-500" />
                  <span>Synthesis Hub ({synthesisHistory.length})</span>
                </button>
              </div>
            </div>

            {/* Dynamic Display Panels */}
            <section className="transition-all duration-300">
              
              {/* TAB 1: VECTOR COORDINATE EXPLORATION SPACE */}
              {activeTab === "explore" && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  
                  {/* Interactive Plot */}
                  <div className="xl:col-span-2 min-h-[580px] lg:h-[620px] flex flex-col">
                    <VectorPlot
                      comments={filteredComments}
                      selectedCommentId={selectedCommentId}
                      onSelectComment={(id) => setSelectedCommentId(id)}
                      colorMode={colorMode}
                      setColorMode={setColorMode}
                    />
                  </div>

                  {/* Sidebar filter list & Details inspection */}
                  <div className="xl:col-span-1 flex flex-col gap-6">
                    
                    {/* A. Search and List Filter controller */}
                    <div className="bg-white p-6 border border-[#E5E3DF] space-y-4 rounded-none shadow-none">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A] flex items-center gap-2">
                        <Search className="w-4 h-4 text-gray-400" /> Refine & Search
                      </h3>

                      <div className="relative">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                        <input
                          type="text"
                          placeholder="Search comments text, topic..."
                          value={filters.searchQuery}
                          onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                          className="w-full bg-white border border-[#E5E3DF] pl-9 pr-4 py-2.5 text-xs focus:outline-none focus:border-[#1A1A1A] rounded-none"
                        />
                      </div>

                      {/* Add manual comment */}
                      <div className="pt-3 border-t border-[#E5E3DF] flex gap-2">
                        <input
                          type="text"
                          placeholder="Add manual comment..."
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddManualComment()}
                          className="flex-1 bg-white border border-[#E5E3DF] px-3 py-2 text-xs focus:outline-none focus:border-[#1A1A1A] rounded-none"
                        />
                        <button
                          onClick={handleAddManualComment}
                          title="Add Comment"
                          className="p-2 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white rounded-none transition-colors shrink-0 flex items-center justify-center cursor-pointer"
                        >
                          <PlusCircle className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Critique and Summary of Refined Set */}
                      <div className="pt-3 border-t border-[#E5E3DF] space-y-2">
                        {isAnalyzingRefinedNodes ? (
                          <button
                            disabled
                            className="w-full py-2 bg-[#1A1A1A]/20 text-[#1A1A1A] font-mono text-[9px] uppercase tracking-widest font-bold flex items-center justify-center gap-1.5"
                          >
                            <Loader2 className="w-3.5 h-3.5 animate-spin animate-pulse text-[#1A1A1A]" />
                            <span>Analyzing Nodes...</span>
                          </button>
                        ) : showRefinedConfirmWarning ? (
                          <div className="bg-[#A13D2D]/5 p-2.5 border border-[#A13D2D]/20 text-center space-y-2 animate-in fade-in duration-200">
                            <p className="text-[9px] text-[#A13D2D] font-mono uppercase font-bold leading-tight">
                              ⚠️ Warning: Over 30 Nodes ({filteredComments.filter(c => c.id !== "user_query_node").length}) in query. This may exceed context limits or fail. Proceed?
                            </p>
                            <div className="flex gap-2 justify-center">
                              <button
                                onClick={() => setShowRefinedConfirmWarning(false)}
                                className="px-3 py-1 bg-white border border-gray-300 hover:border-gray-400 text-gray-700 text-[9px] font-mono uppercase font-bold cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => {
                                  setShowRefinedConfirmWarning(false);
                                  handleGenerateRefinedNodesSynthesis();
                                }}
                                className="px-3 py-1 bg-[#A13D2D] hover:bg-[#A13D2D]/90 text-white text-[9px] font-mono uppercase font-bold cursor-pointer"
                              >
                                Proceed
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              const nodeCount = filteredComments.filter(c => c.id !== "user_query_node").length;
                              if (nodeCount === 0) {
                                showToast("No active refined nodes to review.", "error");
                              } else if (nodeCount > 30) {
                                setShowRefinedConfirmWarning(true);
                              } else {
                                handleGenerateRefinedNodesSynthesis();
                              }
                            }}
                            className="w-full py-2.5 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white font-mono text-[9px] uppercase tracking-widest font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>Critique Refined Set ({filteredComments.filter(c => c.id !== "user_query_node").length})</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* B. Active Comment details or fallback instruction */}
                    {selectedComment ? (
                      selectedComment.id === "user_query_node" ? (
                        <div className="bg-white p-6 border border-[#E5E3DF] space-y-4 animate-in fade-in duration-200 rounded-none">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] bg-[#ec4899]/10 text-[#ec4899] font-bold px-2.5 py-0.5 border border-[#ec4899]/30 font-mono uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_4px_rgba(236,72,153,0.1)]">
                              <Sparkle className="w-3.5 h-3.5 animate-pulse" />
                              Active Search Query
                            </span>
                            <button
                              onClick={handleClearQueryNode}
                              title="Remove search query node from map"
                              className="px-2 py-1 text-[9px] uppercase tracking-wider font-semibold text-[#A13D2D] hover:bg-[#A13D2D]/5 border border-[#A13D2D]/20 hover:border-[#A13D2D]/40 transition-all cursor-pointer rounded-none"
                            >
                              Remove from Map
                            </button>
                          </div>

                          <div className="bg-[#F9F8F6] p-4 border border-[#E5E3DF] max-h-36 overflow-y-auto rounded-none">
                            <p className="text-xs text-[#1A1A1A] leading-relaxed font-serif italic font-medium">
                              "{selectedComment.text}"
                            </p>
                          </div>

                          <div className="text-[11px] text-gray-500 leading-relaxed bg-[#ec4899]/5 p-3.5 border border-[#ec4899]/15">
                            This virtual coordinate node is projected inside the map to help you visually locate semantic groupings relative to the search query. Click the similar neighboring points below to inspect feedback.
                          </div>

                          {/* Vector Neighbors similarity display */}
                          {similarToSelected.length > 0 ? (
                            <div className="pt-4 border-t border-[#E5E3DF]">
                              <span className="text-[10px] uppercase font-bold tracking-widest text-[#1A1A1A]/60 block mb-2">
                                Nearest Semantic Neighbors ({similarToSelected.length})
                              </span>
                              <div className="space-y-1">
                                {similarToSelected.map(({ comment, similarity }) => (
                                  <button
                                    key={comment.id}
                                    onClick={() => setSelectedCommentId(comment.id)}
                                    className="w-full p-2 hover:bg-[#F9F8F6] border border-transparent hover:border-[#E5E3DF] text-left transition-colors flex items-center justify-between gap-3 text-xs rounded-none cursor-pointer"
                                  >
                                    <p className="truncate font-medium text-gray-700 flex-1">
                                      "{comment.text}"
                                    </p>
                                    <span className="text-[10px] font-bold font-mono text-[#ec4899] bg-[#ec4899]/5 border border-[#ec4899]/20 px-1.5 py-0.5 rounded-none">
                                      {(similarity * 100).toFixed(0)}%
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="pt-4 border-t border-[#E5E3DF] text-center py-4">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                No similar nodes detected
                              </span>
                              <span className="text-[9px] text-gray-400 mt-0.5 block">
                                Try a broader search phrase to pull in neighbors.
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-white p-6 border border-[#E5E3DF] space-y-4 animate-in fade-in duration-200 rounded-none">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] bg-[#F9F8F6] text-[#1A1A1A] font-semibold px-2 py-0.5 border border-[#E5E3DF] font-mono">
                              {selectedComment.id}
                            </span>
                            <button
                              onClick={() => handleArchiveComment(selectedComment.id)}
                              title="Archive Comment"
                              className="p-1.5 text-gray-400 hover:text-[#A13D2D] hover:bg-[#A13D2D]/5 rounded-none transition-all cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="bg-[#F9F8F6] p-4 border border-[#E5E3DF] max-h-36 overflow-y-auto rounded-none">
                            <p className="text-xs text-[#1A1A1A] leading-relaxed font-serif italic">
                              "{selectedComment.text}"
                            </p>
                          </div>

                          {/* Original row details expansion */}
                          {selectedComment.originalRowData && (
                            <div className="pt-1">
                              <button
                                onClick={() => setExpandedOriginalRow(!expandedOriginalRow)}
                                className="text-[10px] text-[#4A6741] hover:underline flex items-center gap-1.5 font-bold uppercase tracking-wider cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                {expandedOriginalRow ? "Hide Original Row Columns" : "Inspect Original Row Columns"}
                              </button>
                              {expandedOriginalRow && (
                                <div className="bg-[#F9F8F6] border border-[#E5E3DF] p-3 text-[10px] font-mono text-gray-600 mt-2 space-y-1 max-h-48 overflow-y-auto rounded-none">
                                  <p className="text-[9px] font-bold uppercase text-gray-400 mb-1 border-b border-gray-200 pb-0.5">Original File Columns</p>
                                  {Object.entries(selectedComment.originalRowData).map(([k, v]) => (
                                    <div key={k} className="flex flex-col md:flex-row md:justify-between gap-1 border-b border-gray-100 pb-1 last:border-0">
                                      <span className="text-gray-400 font-bold break-all">{k}:</span>
                                      <span className="text-[#1A1A1A] break-all">{v !== null && v !== undefined ? String(v) : "(empty)"}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Organization badge with stakeholder power-interest mapping trigger */}
                          <div>
                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Organization Stakeholder</label>
                            <OrganizationBadge
                              organizationName={selectedComment.organizationName || selectedComment.originalRowData?.["Organization"] || selectedComment.originalRowData?.["Org"]}
                              mapping={stakeholderMappings[selectedComment.organizationName || selectedComment.originalRowData?.["Organization"] || selectedComment.originalRowData?.["Org"] || ""]}
                              onClick={() => handleOpenStakeholderModal(selectedComment.organizationName || selectedComment.originalRowData?.["Organization"] || selectedComment.originalRowData?.["Org"])}
                            />
                          </div>

                          {/* Meta modifier selectors */}
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Sentiment</label>
                              <select
                                value={selectedComment.sentiment}
                                onChange={(e) => handleUpdateSelectedMetadata({ sentiment: e.target.value as any })}
                                className="w-full bg-white border border-[#E5E3DF] px-2 py-1.5 text-xs rounded-none focus:outline-none focus:border-[#1A1A1A]"
                              >
                                <option value="positive">Positive</option>
                                <option value="neutral">Neutral</option>
                                <option value="negative">Negative</option>
                              </select>
                            </div>

                            <div>
                              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Topic Cluster</label>
                              <select
                                value={selectedComment.topic}
                                onChange={(e) => handleUpdateSelectedMetadata({ topic: e.target.value })}
                                className="w-full bg-white border border-[#E5E3DF] px-2 py-1.5 text-xs rounded-none focus:outline-none focus:border-[#1A1A1A]"
                              >
                                {datasetTopics.map((topicName) => (
                                  <option key={topicName} value={topicName}>
                                    {topicName}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Vector Neighbors similarity display */}
                          {similarToSelected.length > 0 && (
                            <div className="pt-4 border-t border-[#E5E3DF]">
                              <span className="text-[10px] uppercase font-bold tracking-widest text-[#1A1A1A]/60 block mb-2">
                                Nearest Semantic Neighbors
                              </span>
                              <div className="space-y-1">
                                {similarToSelected.map(({ comment, similarity }) => (
                                  <button
                                    key={comment.id}
                                    onClick={() => setSelectedCommentId(comment.id)}
                                    className="w-full p-2 hover:bg-[#F9F8F6] border border-transparent hover:border-[#E5E3DF] text-left transition-colors flex items-center justify-between gap-3 text-xs rounded-none cursor-pointer"
                                  >
                                    <p className="truncate font-medium text-gray-700 flex-1">
                                      "{comment.text}"
                                    </p>
                                    <span className="text-[10px] font-bold font-mono text-[#4A6741] bg-[#4A6741]/5 border border-[#4A6741]/20 px-1.5 py-0.5 rounded-none">
                                      {(similarity * 100).toFixed(0)}%
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* LLM Neighborhood Review section */}
                          <div className="pt-4 border-t border-[#E5E3DF] space-y-3">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-[#1A1A1A]/60 block">
                              LLM Neighborhood Synthesis
                            </span>
                            
                            {isAnalyzingNeighborhood ? (
                              <div className="bg-[#F9F8F6] p-4 border border-[#E5E3DF] text-center flex flex-col items-center justify-center space-y-2 py-6 rounded-none">
                                <Loader2 className="w-5 h-5 text-[#1A1A1A] animate-spin" />
                                <p className="text-[10px] text-gray-500 font-medium font-mono uppercase tracking-wider">Analyzing neighborhood...</p>
                              </div>
                            ) : neighborhoodSynthesis ? (
                              <div className="space-y-3">
                                <div className="bg-[#F9F8F6] p-4 border border-[#E5E3DF] rounded-none max-h-60 overflow-y-auto text-xs leading-relaxed">
                                  <MarkdownViewer markdown={neighborhoodSynthesis} />
                                </div>
                                <button
                                  onClick={handleGenerateNeighborhoodSynthesis}
                                  className="w-full py-2 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white font-mono text-[9px] uppercase tracking-widest font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Sparkles className="w-3.5 h-3.5" /> Re-run Subset Synthesis
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-[10px] text-gray-500 leading-normal">
                                  Critically review this comment and its {similarToSelected.length} closest neighbors to summarize stakeholder opinion.
                                </p>
                                <button
                                  onClick={handleGenerateNeighborhoodSynthesis}
                                  className="w-full py-2.5 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white font-mono text-[9px] uppercase tracking-widest font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                                >
                                  <Sparkles className="w-3.5 h-3.5" /> Review Subset with LLM
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                      )
                    ) : (
                      <div className="bg-white p-8 border border-[#E5E3DF] text-center flex flex-col items-center justify-center min-h-[220px] rounded-none shadow-none">
                        <div className="w-10 h-10 border border-[#E5E3DF] text-gray-400 rounded-none flex items-center justify-center mb-3">
                          <Clock className="w-5 h-5 text-gray-400" />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[#1A1A1A] mb-1">
                          No selection
                        </p>
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 max-w-[180px] leading-relaxed">
                          Click any coordinate point on the map to inspect neighbors.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 1.5: COMMENTS LIST COMPARISON VIEW */}
              {activeTab === "list" && (
                <CommentsList
                  comments={comments}
                  llmSettings={llmSettings}
                  stakeholderMappings={stakeholderMappings}
                  onOpenStakeholderModal={handleOpenStakeholderModal}
                  selectedCommentIdGlobal={selectedCommentId}
                  onSelectCommentGlobal={setSelectedCommentId}
                  onUpdateComment={(updated) => setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))}
                  onSaveSynthesisToHistory={(synth) => {
                    const newHistoryItem: SavedSynthesis = {
                      id: `perspective_${Date.now()}`,
                      title: synth.title,
                      markdown: synth.markdown,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString(),
                      source: "map"
                    };
                    setSynthesisHistory((prev) => [newHistoryItem, ...prev]);
                    setActiveSynthesis(newHistoryItem);
                    setIsSynthesisModalOpen(true);
                  }}
                />
              )}

              {/* TAB 2: VECTOR DEDUPLICATION REVIEW TABLE */}
              {activeTab === "duplicates" && (
                <DuplicateReview
                  comments={comments}
                  similarityThreshold={filters.similarityThreshold}
                  onChangeThreshold={(val) => setFilters({ ...filters, similarityThreshold: val })}
                  onArchiveDuplicate={handleArchiveComment}
                  onDismissDuplicate={handleDismissDuplicate}
                  useCustomEmbedding={llmSettings.useCustomEmbedding}
                  onCriticallyReviewCluster={handleGenerateClusterSynthesis}
                  isAnalyzingClusterId={isAnalyzingClusterId}
                />
              )}

              {/* SEMANTIC QUERY SEARCH PANEL */}
              {activeTab === "query" && (
                <SemanticQuery
                  comments={comments}
                  llmSettings={llmSettings}
                  selectedCommentId={selectedCommentId}
                  onSelectComment={setSelectedCommentId}
                  onNavigateToExplore={() => setActiveTab("explore")}
                  onReloadProjectionWithQuery={handleReloadProjectionWithQuery}
                  onClearQueryNode={handleClearQueryNode}
                  onCriticallyReviewSearchResults={handleGenerateSemanticQuerySynthesis}
                  isAnalyzingSearchResults={isAnalyzingSemanticQuery}
                />
              )}

              {/* TAB 3: CUSTOM TOPIC EMBEDDING CLUSTERING */}
              {activeTab === "clusters" && (
                <CustomTopicClusterView
                  comments={comments}
                  llmSettings={llmSettings}
                  stakeholderMappings={stakeholderMappings}
                  onOpenStakeholderModal={handleOpenStakeholderModal}
                  onApplyTopicsToDataset={(updatedComments) => {
                    setComments(updatedComments);
                    setFilters((prev) => ({ ...prev, topics: [] }));
                  }}
                  showToast={showToast}
                  onSelectComment={(id) => {
                    setSelectedCommentId(id);
                    setActiveTab("explore");
                  }}
                  onUpdateComment={(updated) => setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))}
                  onSaveSynthesisToHistory={(synth) => {
                    const newHistoryItem: SavedSynthesis = {
                      id: `synth_${Date.now()}`,
                      title: synth.title,
                      markdown: synth.markdown,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString(),
                      source: synth.source
                    };
                    setSynthesisHistory((prev) => [newHistoryItem, ...prev]);
                    setActiveSynthesis(newHistoryItem);
                    setIsSynthesisModalOpen(true);
                  }}
                  onOpenWhatIfModal={handleOpenWhatIfModal}
                  whatIfReports={whatIfReports}
                />
              )}

              {/* TAB 3.5: ORGANIZATIONS & STAKEHOLDER INTELLIGENCE */}
              {activeTab === "organizations" && (
                <OrganizationStakeholderView
                  comments={comments}
                  llmSettings={llmSettings}
                  stakeholderMappings={stakeholderMappings}
                  onOpenStakeholderModal={handleOpenStakeholderModal}
                  onUpdateComment={(updated) => setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))}
                  onSaveSynthesisToHistory={(synth) => {
                    const newHistoryItem: SavedSynthesis = {
                      id: `stakeholder_${Date.now()}`,
                      title: synth.title,
                      markdown: synth.markdown,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + new Date().toLocaleDateString(),
                      source: synth.source
                    };
                    setSynthesisHistory((prev) => [newHistoryItem, ...prev]);
                    setActiveSynthesis(newHistoryItem);
                    setIsSynthesisModalOpen(true);
                  }}
                  onOpenWhatIfModal={handleOpenWhatIfModal}
                  whatIfReports={whatIfReports}
                  onPerformStakeholderMetaReview={handlePerformStakeholderMetaReview}
                  onOpenSynthesisHub={() => setIsSynthesisModalOpen(true)}
                  showToast={showToast}
                />
              )}

              {/* TAB 4: EXECUTIVE SUMMARY WRITER */}
              {activeTab === "report" && (
                <ExecutiveReport
                  comments={comments}
                  executiveSummary={executiveSummary}
                  isSummarizing={isSummarizing}
                  onGenerateSummary={handleGenerateSummary}
                  apiMode={apiMode}
                  onOpenHistory={() => {
                    if (!activeSynthesis && synthesisHistory.length > 0) {
                      setActiveSynthesis(synthesisHistory[0]);
                    }
                    setIsSynthesisModalOpen(true);
                  }}
                  historyCount={synthesisHistory.length}
                  onExportOfflineHtml={handleExportOfflineHtml}
                  onOpenWhatIfModal={handleOpenWhatIfModal}
                  whatIfReports={whatIfReports}
                />
              )}

              {/* TAB 4: MANAGE DATASETS (IMPORT / EXPORT / UPLOADER) */}
              {activeTab === "data" && (
                <ImportExport
                  onImportSession={handleImportSession}
                  onExportSession={handleExportSession}
                  onExportOfflineHtml={handleExportOfflineHtml}
                  onImportCSV={handleImportCSV}
                  onStartIndexing={handleStartIndexing}
                  isIndexing={isIndexing}
                />
              )}
            </section>
          </main>
        </>
      )}

      {/* Modern footer section */}
      <footer id="main_footer" className="h-12 bg-[#1A1A1A] text-white flex items-center px-8 justify-between text-[10px] uppercase tracking-widest mt-12 shrink-0">
        <div className="flex gap-6">
          <span className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${llmSettings.useCustomEmbedding ? "bg-[#4A6741] animate-pulse" : "bg-gray-400"}`} />
            Local LLM: {llmSettings.modelName} ({llmSettings.useCustomEmbedding ? "Custom Endpoints" : "Built-in Heuristics"})
          </span>
          <span>Index: Cosine Projection</span>
        </div>
        <div className="flex gap-6">
          <span className="opacity-60">Comment Processor v2.4</span>
        </div>
      </footer>

      {/* Item-by-item Indexing Progress overlay */}
      {isIndexing && (
        <div className="fixed inset-0 bg-[#1A1A1A]/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-[#E5E3DF] max-w-md w-full p-8 text-center space-y-6 shadow-2xl">
            <div className="flex justify-center">
              <Loader2 className="w-8 h-8 text-[#1A1A1A] animate-spin" />
            </div>
            <div className="space-y-2">
              <h3 className="font-serif italic text-xl text-[#1A1A1A]">Processing Dataset</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Vectorizing comments row-by-row for 2D semantic projection. This keeps payload size stable and prevents timeout issues.
              </p>
            </div>
            
            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold text-gray-500">
                <span>Progress</span>
                <span>{indexingProgress}%</span>
              </div>
              <div className="w-full bg-gray-100 h-2 border border-[#E5E3DF]">
                <div 
                  className="bg-[#1A1A1A] h-full transition-all duration-300"
                  style={{ width: `${indexingProgress}%` }}
                />
              </div>
            </div>

            <div className="text-[10px] uppercase tracking-wider font-bold text-[#4A6741] flex items-center justify-center gap-1.5 bg-[#4A6741]/5 py-2.5 border border-[#4A6741]/20">
              <span className="w-1.5 h-1.5 bg-[#4A6741] rounded-full animate-ping" />
              <span>Auto-backups active (Downloads every 200 items)</span>
            </div>
          </div>
        </div>
      )}

      {/* Critique & Synthesis Modal with History */}
      <SynthesisModal
        isOpen={isSynthesisModalOpen}
        onClose={() => setIsSynthesisModalOpen(false)}
        activeSynthesis={activeSynthesis}
        history={synthesisHistory}
        onSelectHistoryItem={(item) => setActiveSynthesis(item)}
        onUpdateSynthesis={(updated) => {
          setSynthesisHistory((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
          setActiveSynthesis(updated);
          showToast(`Saved edits to report "${updated.title}"`, "success");
        }}
        onDeleteHistoryItem={(id) => {
          setSynthesisHistory((prev) => prev.filter((item) => item.id !== id));
          if (activeSynthesis?.id === id) {
            setActiveSynthesis(null);
          }
        }}
        onClearHistory={() => {
          setSynthesisHistory([]);
          setActiveSynthesis(null);
        }}
        onPerformMetaReview={handlePerformMetaReview}
        onPerformStakeholderMetaReview={handlePerformStakeholderMetaReview}
        isSynthesizingMeta={isSynthesizingMeta}
        onOpenWhatIfModal={handleOpenWhatIfModal}
        whatIfReports={whatIfReports}
      />

      {/* About & Embeddings Explainer Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      {/* Stakeholder Power-Interest Matrix Mapping Modal */}
      <StakeholderMappingModal
        isOpen={isStakeholderModalOpen}
        onClose={() => setIsStakeholderModalOpen(false)}
        initialOrganizationName={stakeholderModalTargetOrg}
        comments={comments}
        stakeholderMappings={stakeholderMappings}
        onSaveMapping={handleSaveStakeholderMapping}
        onSaveAllMappings={handleSaveAllStakeholderMappings}
        showToast={showToast}
      />

      {/* Document Context Model Workbench Modal */}
      <DocumentContextModal
        isOpen={isDocumentContextModalOpen}
        onClose={() => setIsDocumentContextModalOpen(false)}
        comments={comments}
        documentSections={documentSections}
        onUpdateDocumentSections={(updated) => {
          setDocumentSections(updated);
          showToast(`Saved ${updated.length} document context section(s)!`, "success");
        }}
        supportingItems={supportingItems}
        onSaveSupportingItems={(items) => {
          setSupportingItems(items);
        }}
        libraryDocuments={libraryDocuments}
        onSaveLibraryDocuments={(docs) => {
          setLibraryDocuments(docs);
        }}
        showToast={showToast}
      />

      {/* What-If Hypothetical Scenario Evaluator Modal */}
      <WhatIfScenarioModal
        isOpen={isWhatIfModalOpen}
        onClose={() => setIsWhatIfModalOpen(false)}
        initialContextType={whatIfInitialContext}
        initialTargetCluster={whatIfInitialCluster}
        comments={comments}
        synthesisHistory={synthesisHistory}
        llmSettings={llmSettings}
        stakeholderMappings={stakeholderMappings}
        whatIfReports={whatIfReports}
        onSaveWhatIfReport={handleSaveWhatIfReport}
        onDeleteWhatIfReport={handleDeleteWhatIfReport}
        onClearWhatIfReports={handleClearWhatIfReports}
        showToast={showToast}
      />
    </div>
  );
}
