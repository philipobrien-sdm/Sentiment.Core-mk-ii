import React, { useState } from "react";
import { 
  X, Info, ArrowLeft, ArrowRight, Sparkles, Database, 
  Layers, Search, FileText, CheckCircle2, ChevronRight, HelpCircle,
  Crown, ShieldAlert, Target, BookOpen, Sliders, Wand2, FileSpreadsheet,
  Zap, BrainCircuit, Compass, ListFilter, PlayCircle, BarChart3, Upload
} from "lucide-react";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FeatureGuideItem {
  id: string;
  title: string;
  shortTag: string;
  icon: React.ReactNode;
  category: "Core Analytics" | "Strategic Context" | "AI & Simulation" | "Data & Tools";
  purpose: string;
  howToUse: string[];
  underTheHood: string;
  keyBenefit: string;
  proTip: string;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  // Navigation mode: 'concept' (explainer slides) or 'features' (functionality menu guide)
  const [activeTab, setActiveTab] = useState<"concept" | "features">("concept");
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>("stakeholder_mapping");

  // Custom interactive comparison sentences state
  const [sentencePair, setSentencePair] = useState<number>(0);

  const sentences = [
    {
      group: "System Performance",
      a: "The loading times are incredibly sluggish.",
      b: "The interface feels laggy and slow to respond.",
      similarity: 0.88,
      explanation: "Zero shared descriptive keywords, yet both indicate severe performance degradation. Vector math bridges the lexical gap."
    },
    {
      group: "Price / Value Feedback",
      a: "It costs too much for small businesses.",
      b: "The monthly subscription is quite expensive.",
      similarity: 0.84,
      explanation: "Excel filters for 'costs' or 'expensive' separately miss the opposite comment. Embeddings place them in the exact same economic coordinate block."
    },
    {
      group: "Usability / Layout Issues",
      a: "I can never find where the buttons are hidden.",
      b: "The new layout is highly counter-intuitive.",
      similarity: 0.81,
      explanation: "One talks about button locations; the other about layouts. Both map to the 'UI Design Friction' semantic neighborhood."
    }
  ];

  const slides = [
    {
      title: "Introducing Sentiment.Core",
      tagline: "Unlocking Insights That Hide from Traditional Spreadsheets",
      icon: <Layers className="w-8 h-8 text-[#4A6741]" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
            Analyzing stakeholder and customer feedback at scale has always been slow. Teams usually dump thousands of reviews into Excel, filter by keyword (like <code className="bg-gray-100 text-[#A13D2D] px-1 font-mono">"slow"</code>), and hope they caught everything.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="border border-[#E5E3DF] p-4 bg-[#F9F8F6]/50">
              <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-gray-400 block mb-1">Traditional Excel Method</span>
              <h5 className="font-serif italic text-xs font-semibold text-[#1A1A1A] mb-2">Lexical Keyword Matching</h5>
              <ul className="space-y-1.5 text-[11px] text-gray-500">
                <li className="flex items-start gap-1.5">
                  <span className="text-[#A13D2D] font-bold">❌</span>
                  <span>Misses synonyms (sluggish, laggy, delayed)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-[#A13D2D] font-bold">❌</span>
                  <span>Misses context or complex phrasing</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-[#A13D2D] font-bold">❌</span>
                  <span>Results in flat, unorganized lists of text</span>
                </li>
              </ul>
            </div>

            <div className="border border-[#4A6741]/20 p-4 bg-[#4A6741]/5">
              <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-[#4A6741] block mb-1">Sentiment.Core Method</span>
              <h5 className="font-serif italic text-xs font-semibold text-[#1A1A1A] mb-2">Semantic AI Projections</h5>
              <ul className="space-y-1.5 text-[11px] text-gray-600">
                <li className="flex items-start gap-1.5">
                  <span className="text-[#4A6741] font-bold">✔</span>
                  <span>Understands deep meaning and intent</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-[#4A6741] font-bold">✔</span>
                  <span>Groups similar topics automatically</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-[#4A6741] font-bold">✔</span>
                  <span>Flattens multidimensional data into intuitive visual maps</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "The Engine: What is a Vector Embedding?",
      tagline: "Translating Human Nuance into High-Dimensional Geometry",
      icon: <Database className="w-8 h-8 text-[#4A6741]" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
            To a computer, text is just letters. To understand <em>meaning</em>, an AI model converts words into a dense numerical array called an <strong>Embedding Vector</strong>.
          </p>

          <div className="bg-[#1A1A1A] text-white p-4 font-mono text-[11px] space-y-3 border-l-4 border-[#4A6741]">
            <div className="flex justify-between text-gray-400 text-[10px] uppercase pb-1 border-b border-white/10">
              <span>Plain Human Feedback</span>
              <span>1,536-Dimensional Math Array (Vector)</span>
            </div>
            
            <div className="space-y-2 leading-normal">
              <div>
                <span className="text-gray-400">"The app is laggy"</span>
                <span className="text-[#4A6741] font-bold mx-2">➔</span>
                <span className="text-green-300">[ 0.1241, -0.4502, 0.8911, -0.0125, 0.3218, ... ]</span>
              </div>
              <div className="border-t border-white/5 pt-2">
                <span className="text-gray-400">"Interface is slow"</span>
                <span className="text-[#4A6741] font-bold mx-2">➔</span>
                <span className="text-green-300">[ 0.1239, -0.4498, 0.8899, -0.0131, 0.3220, ... ]</span>
              </div>
            </div>
          </div>

          <p className="text-gray-500 text-xs leading-relaxed">
            Think of each number in the array as a coordinate representing a conceptual trait (e.g. <em>speed</em>, <em>user interface</em>, 0frustration*). Comments with similar meanings will have numbers that align closely, placing them near each other in geometric space.
          </p>
        </div>
      )
    },
    {
      title: "Interactive Demo: Semantic Equivalence",
      tagline: "See Vector Similarity in Action with Zero Shared Keywords",
      icon: <Sparkles className="w-8 h-8 text-[#4A6741]" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
            Select a comparison category below to see how our vectors detect similarity even when the words used are entirely different.
          </p>

          {/* Selector Tabs */}
          <div className="flex border border-[#E5E3DF] p-1 bg-[#F9F8F6]">
            {sentences.map((pair, idx) => (
              <button
                key={idx}
                onClick={() => setSentencePair(idx)}
                className={`flex-1 py-1 px-2 text-[10px] sm:text-xs font-semibold cursor-pointer uppercase transition-colors ${
                  sentencePair === idx 
                    ? "bg-[#1A1A1A] text-white" 
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {pair.group}
              </button>
            ))}
          </div>

          {/* Interactive Calculation Visualization */}
          <div className="border border-[#E5E3DF] p-4 bg-[#F9F8F6]/20 space-y-3.5">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-[10px] uppercase font-mono bg-amber-100 text-amber-800 px-1 py-0.5 mt-0.5">Phrase A</span>
                <p className="text-xs font-medium text-gray-800 italic">"{sentences[sentencePair].a}"</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[10px] uppercase font-mono bg-blue-100 text-blue-800 px-1 py-0.5 mt-0.5">Phrase B</span>
                <p className="text-xs font-medium text-gray-800 italic">"{sentences[sentencePair].b}"</p>
              </div>
            </div>

            {/* Simulated Vector Graph Comparison */}
            <div className="bg-[#1A1A1A] p-3 text-white rounded-none font-mono text-[10px] space-y-2">
              <div className="flex justify-between items-center text-gray-400 border-b border-white/10 pb-1.5 mb-1">
                <span>VECTOR OVERLAP CORRELATION</span>
                <span className="text-green-400 font-bold">MATCH FOUND</span>
              </div>
              
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-16 text-gray-400 text-right truncate">Vec_A:</span>
                  <div className="flex-1 bg-white/10 h-3 flex overflow-hidden">
                    <div className="bg-amber-400 h-full w-[85%]" />
                    <div className="bg-amber-400/30 h-full w-[15%]" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 text-gray-400 text-right truncate">Vec_B:</span>
                  <div className="flex-1 bg-white/10 h-3 flex overflow-hidden">
                    <div className="bg-blue-400 h-full w-[81%]" />
                    <div className="bg-blue-400/30 h-full w-[19%]" />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-1">
                <span className="text-gray-400">Cosine Similarity Score:</span>
                <span className="text-green-400 font-bold text-xs">{(sentences[sentencePair].similarity * 100).toFixed(0)}% Match</span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 leading-normal">
              <strong>Why this works:</strong> {sentences[sentencePair].explanation}
            </p>
          </div>
        </div>
      )
    },
    {
      title: "Unmatched Operational Scale",
      tagline: "What Excel Filters Simply Can't Achieve",
      icon: <Search className="w-8 h-8 text-[#4A6741]" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
            By grouping thoughts rather than exact keywords, Sentiment.Core elevates stakeholder review into an automated strategic advantage:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="border border-[#E5E3DF] p-3 text-center space-y-1">
              <div className="text-[#4A6741] font-bold text-lg">Instant Cluster</div>
              <p className="text-[11px] text-gray-500">
                Maps thousands of multi-sentence reviews into distinct topical "islands" instantly.
              </p>
            </div>
            <div className="border border-[#E5E3DF] p-3 text-center space-y-1">
              <div className="text-[#4A6741] font-bold text-lg">Conflict Review</div>
              <p className="text-[11px] text-gray-500">
                Contrast opposing sentiment blocks (Positive vs. Negative) on the exact same topic instantly.
              </p>
            </div>
            <div className="border border-[#E5E3DF] p-3 text-center space-y-1">
              <div className="text-[#4A6741] font-bold text-lg">AI Synthesis</div>
              <p className="text-[11px] text-gray-500">
                Leverage local LLMs to generate strategic action items based on vector clusters, not hearsay.
              </p>
            </div>
          </div>

          <div className="bg-[#F9F8F6] p-4 text-xs text-gray-600 border border-[#E5E3DF] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#1A1A1A]">💡 Ready to explore all features?</span>
              <button
                onClick={() => setActiveTab("features")}
                className="px-3 py-1 bg-[#4A6741] text-white text-[10px] font-mono font-bold uppercase tracking-wider hover:bg-[#3D5535] transition-colors flex items-center gap-1"
              >
                <span>View Features Menu</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <p className="leading-relaxed text-[11px]">
              Switch to the <strong>App Functionalities Guide</strong> tab above to browse guided walkthroughs for every tool in the workspace.
            </p>
          </div>
        </div>
      )
    }
  ];

  // Comprehensive list of app functionalities
  const featureGuides: FeatureGuideItem[] = [
    {
      id: "stakeholder_mapping",
      title: "Stakeholder Grid, Bios & Red Lines",
      shortTag: "Power-Interest & Policy Rules",
      icon: <Crown className="w-5 h-5 text-amber-700" />,
      category: "Strategic Context",
      purpose: "Classify participating organizations into 4 power-interest quadrants and define stakeholder background bios, non-negotiable red lines, and key expectations.",
      howToUse: [
        "Click 'Stakeholder Grid' in the top bar or header badge to open the matrix.",
        "Select any organization from the list or click directly on the 2D Power/Interest grid to adjust coordinates.",
        "Fill in the Stakeholder Bio (organizational role/history), Red Lines (non-negotiable dealbreakers), and Key Expectations.",
        "Click 'Save Stakeholder Mapping' to commit the profile."
      ],
      underTheHood: "Key Players receive a 2.5x priority weight calculation. Profiles and red lines are automatically injected into LLM prompt blocks, forcing the synthesis engine to audit proposed actions against non-negotiable boundaries.",
      keyBenefit: "Ensures critical enterprise partners and regulators are never overlooked or offended by policy changes.",
      proTip: "Set explicit Red Lines (e.g., 'No daytime downtime') to trigger automated warnings during 'What-If' policy simulations."
    },
    {
      id: "vector_plot",
      title: "Interactive 2D Similarity Vector Plot",
      shortTag: "Visual Cluster Mapping",
      icon: <Layers className="w-5 h-5 text-[#4A6741]" />,
      category: "Core Analytics",
      purpose: "Visualize thousands of feedback comments as geometric points in 2D space, grouping semantically related thoughts together regardless of phrasing.",
      howToUse: [
        "Navigate to the main 'Similarity Plot' tab.",
        "Use the Lasso tool or Click-and-Drag box to isolate clusters of related comments.",
        "Filter by Quadrant, Sentiment, or Topic using the top controls.",
        "Hover or click on individual vector nodes to view comment text and organization metadata."
      ],
      underTheHood: "Uses UMAP / PCA dimensional reduction to project 1,536-dimensional embedding vectors into a 2D Cartesian coordinate space.",
      keyBenefit: "Instantly exposes hidden feedback trends and sentiment pockets without reading every row manually.",
      proTip: "Lasso-select points on the boundary between positive and negative nodes to isolate controversial product changes."
    },
    {
      id: "document_context",
      title: "Document Context & RAG Library",
      shortTag: "Reference Specs & SLAs",
      icon: <BookOpen className="w-5 h-5 text-blue-700" />,
      category: "Strategic Context",
      purpose: "Attach official policy specs, SLAs, and technical documentation so AI synthesis can cross-reference user comments against ground-truth requirements.",
      howToUse: [
        "Click 'Document Context' in the main navigation or header bar.",
        "Upload reference PDFs or paste text sections in the Document Sections manager.",
        "Manage the Ingested Library to link official documents to comment clusters.",
        "Review auto-flagged misinterpretations where feedback misquotes official policy."
      ],
      underTheHood: "Performs Retrieval-Augmented Generation (RAG) by measuring cosine distance between feedback items and reference document chunks.",
      keyBenefit: "Prevents making knee-jerk product changes when feedback stems from user misunderstanding of existing specs.",
      proTip: "Upload your SLA agreements to automatically detect when stakeholder feedback reports contractual compliance breaches."
    },
    {
      id: "what_if_simulator",
      title: "'What-If' Strategic Policy Simulator",
      shortTag: "Scenario Impact Testing",
      icon: <PlayCircle className="w-5 h-5 text-purple-700" />,
      category: "AI & Simulation",
      purpose: "Simulate proposed policy changes, API deprecations, or release schedules before implementation to predict stakeholder reactions and policy breaches.",
      howToUse: [
        "Click 'What-If Simulator' in the top header or actions toolbar.",
        "Enter a hypothetical proposal (e.g. 'Deprecate v1 REST API in 30 days').",
        "Select target stakeholder groups or run a full fleet simulation.",
        "Review predicted sentiment shifts, stakeholder risk scores, and red line conflict alerts."
      ],
      underTheHood: "Combines stakeholder power weights, bios, and non-negotiable red lines with vector similarity to project sentiment impact and policy friction.",
      keyBenefit: "Test high-stakes decisions safely in sandbox before announcing changes publicly.",
      proTip: "Check the 'Red Line Conflict Audit' section in report outputs to identify dealbreaker friction early."
    },
    {
      id: "ai_synthesis",
      title: "AI Synthesis & Local LLM Reports",
      shortTag: "Automated Executive Briefs",
      icon: <Sparkles className="w-5 h-5 text-emerald-700" />,
      category: "AI & Simulation",
      purpose: "Generate executive reports, sentiment breakdowns, and 3-step strategic action plans using Gemini or privacy-preserving local web LLMs.",
      howToUse: [
        "Click 'AI Synthesis' or 'Generate Executive Brief' in any view.",
        "Choose between server-side Gemini 3.5 Flash or local browser LLMs (WebLLM / Chrome AI) in Settings.",
        "View structured Markdown outputs covering Executive Summaries, Key Player Demands, and Action Plans.",
        "Export or copy the report directly to share with leadership."
      ],
      underTheHood: "Synthesizes multi-source context (comments, stakeholder weights, bios, red lines, document RAG) into a structured prompt matrix.",
      keyBenefit: "Saves hours of manual report writing by converting raw comment data into actionable C-suite presentations.",
      proTip: "Configure Local WebLLM in Settings if you need 100% offline, air-gapped data privacy."
    },
    {
      id: "topic_clustering",
      title: "Dynamic Topic Clustering & Sentiment View",
      shortTag: "Divergence & Conflict Analysis",
      icon: <ListFilter className="w-5 h-5 text-cyan-700" />,
      category: "Core Analytics",
      purpose: "Group feedback into hierarchical semantic topics and compare positive vs. negative sentiment side-by-side for any given theme.",
      howToUse: [
        "Switch to the 'Topic Clusters' or 'Comments List' view.",
        "Browse auto-generated topic clusters (e.g. 'API & Uptime', 'Pricing & Licensing').",
        "Click any cluster card to expand side-by-side Positive vs. Negative comment streams.",
        "Review organization badges and priority weights attached to each comment."
      ],
      underTheHood: "Runs dynamic agglomerative clustering on embedding vectors to auto-discover natural topic boundaries without pre-defined tags.",
      keyBenefit: "Identify why two organizations hold opposing views on the exact same product feature.",
      proTip: "Filter by 'Negative Sentiment Only' within Key Player topics to isolate critical bugs."
    },
    {
      id: "semantic_query",
      title: "Semantic Vector Search & Natural Language Query",
      shortTag: "Meaning-Based Search",
      icon: <Search className="w-5 h-5 text-rose-700" />,
      category: "Core Analytics",
      purpose: "Find relevant comments using natural language queries (e.g., 'complaints about mobile layout') even if those exact words are missing.",
      howToUse: [
        "Locate the Semantic Query bar at the top of the Vector Plot or Comments List.",
        "Type any phrase or descriptive goal in plain English.",
        "Adjust the Similarity Threshold slider to tighten or broaden matching sensitivity.",
        "View real-time similarity percentage scores attached to returned feedback items."
      ],
      underTheHood: "Computes real-time Cosine Similarity between the query vector and all comment vectors in the dataset.",
      keyBenefit: "Finds hidden comments that traditional string-matching searches miss completely.",
      proTip: "Query abstract concepts like 'trust and reliability' to uncover sentiment drivers."
    },
    {
      id: "import_export",
      title: "CSV Dataset Import, Export & Local Persistence",
      shortTag: "Data Management & Privacy",
      icon: <Upload className="w-5 h-5 text-indigo-700" />,
      category: "Data & Tools",
      purpose: "Upload your own customer/stakeholder CSV files, export analysis results, and persist all state in local browser storage.",
      howToUse: [
        "Click 'Import / Export' in the top bar.",
        "Upload any standard CSV containing text feedback, organization, and sentiment columns.",
        "Map your CSV columns using the visual column mapper.",
        "Export updated stakeholder mappings, synthesis reports, or processed datasets as JSON/CSV."
      ],
      underTheHood: "Client-side state persistence via localStorage ensures all customized stakeholder mappings, document contexts, and notes remain saved.",
      keyBenefit: "Full compatibility with existing enterprise spreadsheet workflows and BI tools.",
      proTip: "Use the Reset Default Dataset option anytime to restore initial demo data."
    }
  ];

  const categories = ["Core Analytics", "Strategic Context", "AI & Simulation", "Data & Tools"] as const;

  const selectedFeature = featureGuides.find(f => f.id === selectedFeatureId) || featureGuides[0];

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      id="about_mechanism_modal"
    >
      <div 
        className="bg-white border border-[#E5E3DF] w-full max-w-4xl flex flex-col shadow-2xl relative max-h-[92vh] sm:max-h-[88vh]"
        style={{ minHeight: "540px" }}
      >
        {/* Top Header & Tab Navigation Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-4 border-b border-[#E5E3DF] bg-[#F9F8F6] gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#1A1A1A] text-white rounded-none">
              <Compass className="w-5 h-5 text-[#4A6741]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase font-mono tracking-widest text-[#4A6741] font-bold">
                  Sentiment.Core Platform Guide
                </span>
              </div>
              <h3 className="font-serif italic text-lg sm:text-xl text-[#1A1A1A]">
                {activeTab === "concept" ? slides[currentSlide].title : "App Functionalities & Features Menu"}
              </h3>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex border border-[#E5E3DF] p-1 bg-white">
              <button
                onClick={() => setActiveTab("concept")}
                className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors flex items-center gap-1.5 ${
                  activeTab === "concept"
                    ? "bg-[#1A1A1A] text-white"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>How It Works ({currentSlide + 1}/4)</span>
              </button>
              <button
                onClick={() => setActiveTab("features")}
                className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors flex items-center gap-1.5 ${
                  activeTab === "features"
                    ? "bg-[#4A6741] text-white"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Features Menu ({featureGuides.length})</span>
              </button>
            </div>

            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-[#1A1A1A] p-1.5 cursor-pointer hover:bg-gray-100 transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab 1: How the App Works Explainer Slides */}
        {activeTab === "concept" && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tagline bar */}
            <div className="px-6 py-2 border-b border-[#E5E3DF] bg-[#F9F8F6]/40 text-[10px] sm:text-xs text-gray-500 font-sans font-medium tracking-wide">
              {slides[currentSlide].tagline}
            </div>

            {/* Slide Content */}
            <div className="flex-1 p-6 overflow-y-auto">
              {slides[currentSlide].content}
            </div>

            {/* Explainer Footer Navigation */}
            <div className="p-5 border-t border-[#E5E3DF] bg-[#F9F8F6]/80 flex flex-wrap items-center justify-between gap-3">
              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    className={`w-2.5 h-2.5 rounded-full cursor-pointer transition-all ${
                      idx === currentSlide 
                        ? "bg-[#4A6741] scale-125" 
                        : "bg-gray-300 hover:bg-gray-400"
                    }`}
                    title={`Go to concept slide ${idx + 1}`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
                  disabled={currentSlide === 0}
                  className="px-3.5 py-1.5 border border-[#E5E3DF] hover:border-[#1A1A1A] text-gray-700 bg-white text-xs font-semibold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>

                {currentSlide < slides.length - 1 ? (
                  <button
                    onClick={() => setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))}
                    className="px-4 py-1.5 bg-[#4A6741] hover:bg-[#3D5535] text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <span>Next Concept</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setActiveTab("features")}
                    className="px-4 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <span>Browse App Features</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Interactive Features & Functionality Menu Guide */}
        {activeTab === "features" && (
          <div className="flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden">
            {/* Left Sidebar: Feature Selection Menu */}
            <div className="w-full sm:w-72 bg-[#F9F8F6] border-b sm:border-b-0 sm:border-r border-[#E5E3DF] flex flex-col overflow-y-auto max-h-48 sm:max-h-none shrink-0">
              <div className="p-3 border-b border-[#E5E3DF] bg-[#F4F2EE]">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-gray-600 block">
                  Select App Functionality
                </span>
                <p className="text-[10px] text-gray-500">Choose a tool to see guided walkthroughs.</p>
              </div>

              <div className="p-2 space-y-3">
                {categories.map((cat) => {
                  const items = featureGuides.filter(f => f.category === cat);
                  if (items.length === 0) return null;

                  return (
                    <div key={cat} className="space-y-1">
                      <span className="text-[9px] uppercase font-mono font-bold tracking-widest text-[#4A6741] px-2 block">
                        {cat}
                      </span>
                      <div className="space-y-0.5">
                        {items.map((item) => {
                          const isSelected = item.id === selectedFeatureId;
                          return (
                            <button
                              key={item.id}
                              onClick={() => setSelectedFeatureId(item.id)}
                              className={`w-full text-left p-2 text-xs transition-colors flex items-center justify-between cursor-pointer rounded-none border ${
                                isSelected
                                  ? "bg-white border-[#1A1A1A] font-semibold text-[#1A1A1A] shadow-xs"
                                  : "border-transparent text-gray-600 hover:bg-white/60 hover:text-gray-900"
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate pr-1">
                                <span className="shrink-0">{item.icon}</span>
                                <div className="truncate">
                                  <div className="truncate text-xs">{item.title}</div>
                                  <div className="text-[9px] text-gray-400 font-mono truncate">{item.shortTag}</div>
                                </div>
                              </div>
                              <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isSelected ? "text-[#1A1A1A] translate-x-0.5" : "text-gray-300"}`} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Main Content Pane: Detailed Guided Walkthrough */}
            <div className="flex-1 p-5 sm:p-6 overflow-y-auto space-y-5 bg-white">
              {/* Feature Header */}
              <div className="border-b border-[#E5E3DF] pb-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#F9F8F6] border border-[#E5E3DF]">
                      {selectedFeature.icon}
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-mono tracking-widest text-[#4A6741] font-bold block">
                        {selectedFeature.category}
                      </span>
                      <h4 className="font-serif italic text-lg sm:text-xl font-bold text-[#1A1A1A]">
                        {selectedFeature.title}
                      </h4>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 font-semibold">
                    {selectedFeature.shortTag}
                  </span>
                </div>
                
                <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-medium bg-[#F9F8F6] p-3 border border-[#E5E3DF]">
                  <strong>Purpose:</strong> {selectedFeature.purpose}
                </p>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="space-y-2">
                <h5 className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#1A1A1A] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#4A6741]" />
                  Step-by-Step Instructions
                </h5>
                <ol className="space-y-2 text-xs text-gray-600 border-l-2 border-[#4A6741] pl-3 py-1">
                  {selectedFeature.howToUse.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="font-mono text-[10px] font-bold text-[#4A6741] bg-[#4A6741]/10 px-1.5 py-0.2 shrink-0">
                        0{idx + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Under the Hood & Key Benefit Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="border border-[#E5E3DF] p-3.5 bg-[#F9F8F6]/60 space-y-1">
                  <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-gray-500 flex items-center gap-1">
                    <BrainCircuit className="w-3 h-3 text-[#4A6741]" />
                    Under the Hood Math & AI Logic
                  </span>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    {selectedFeature.underTheHood}
                  </p>
                </div>

                <div className="border border-[#4A6741]/30 p-3.5 bg-[#4A6741]/5 space-y-1">
                  <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-[#4A6741] flex items-center gap-1">
                    <Zap className="w-3 h-3 text-[#4A6741]" />
                    Strategic Key Benefit
                  </span>
                  <p className="text-[11px] text-gray-700 font-medium leading-relaxed">
                    {selectedFeature.keyBenefit}
                  </p>
                </div>
              </div>

              {/* Pro Tip Box */}
              <div className="bg-[#1A1A1A] text-white p-3.5 border-l-4 border-amber-500 text-xs flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 font-bold block">
                    Power User Pro Tip
                  </span>
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    {selectedFeature.proTip}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Modal Bottom Actions Bar */}
        <div className="p-4 border-t border-[#E5E3DF] bg-[#F9F8F6] flex items-center justify-between">
          <button
            onClick={() => setActiveTab(activeTab === "concept" ? "features" : "concept")}
            className="text-xs text-gray-600 hover:text-[#1A1A1A] font-semibold flex items-center gap-1.5 cursor-pointer underline underline-offset-2"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#4A6741]" />
            <span>Switch to {activeTab === "concept" ? "App Functionalities Guide" : "Concept Explainer Slides"}</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all"
          >
            <span>Close & Start Exploring</span>
          </button>
        </div>
      </div>
    </div>
  );
};

