# Vector-Based Feedback Explorer & Stakeholder Intelligence Engine

A comprehensive, high-performance, full-stack visual analytics application designed to ingest customer feedback, public consultation comments, support tickets, and survey datasets. It transforms qualitative feedback into high-dimensional text embeddings, provides interactive 2D spatial visualization, performs semantic searches, deduplicates records, and generates stakeholder-prioritized, hallucination-free AI executive syntheses.

Built with an **Express + Vite + React (TypeScript)** architecture, it features an offline-first workflow, client-side vector calculations, custom topic clustering, a Stakeholder Power-Interest Matrix, standalone HTML snapshot exporting, and seamless local LLM integration (*Ollama, LM Studio, OpenAI-compatible APIs*).
<img width="1267" height="679" alt="Screenshot 2026-07-29 144538" src="https://github.com/user-attachments/assets/1f1ba17c-0cba-49c7-bc93-03e95cb8f1ed" />


---

## 💡 The Need for the Application

Modern organizations—including public policy makers, SaaS product teams, municipal governments, healthcare providers, and enterprise operations—are overwhelmed by massive volumes of unstructured qualitative feedback. 

### Key Challenges Faced Today:
1. **The Volume & Noise Dilemma**: Manually sifting through hundreds or thousands of open-ended survey responses, public consultation submissions, or customer tickets is slow, expensive, and subject to analyst fatigue and subjective bias.
2. **Loss of High-Impact Stakeholder Signal**: Standard survey tools treat all feedback entries equally. In reality, comments from high-influence **Key Players** (e.g., enterprise clients, regulatory bodies, key community leaders) carry vastly different strategic weight than casual single-line entries.
3. **Keyword Limitations**: Traditional keyword filters miss non-obvious phrasing, semantic variations, and cross-cutting themes (e.g., searching "delay" misses "slow response time" or "held up in transit").
4. **Data Privacy & AI Hallucination Risks**: Sending sensitive consultation datasets or confidential customer complaints to public cloud LLMs creates compliance risks. Furthermore, generic AI summaries frequently introduce "hallucinations"—fabricating ungrounded assumptions not present in the source dataset.

### The Solution:
This application bridges the gap by combining **spatial vector analytics**, **stakeholder power-interest weighting**, **custom taxonomy clustering**, and **factually grounded local AI synthesis**. It provides a single visual workbench where leaders can explore semantic relationships, audit duplicates, prioritize stakeholder voices, draft proposed responses, and export executive-ready reports with complete data privacy. 

---

## 🎯 Key Functionalities

### 📍 1. Interactive 2D Spatial Vector Canvas
<img width="1861" height="744" alt="Screenshot 2026-07-29 145117" src="https://github.com/user-attachments/assets/3db07bd0-1f53-42b2-ab27-f8a243892b86" /> 
..is converted to ..
<img width="1229" height="725" alt="Screenshot 2026-07-29 144507" src="https://github.com/user-attachments/assets/0861ac5c-ebdb-44a2-be47-6ea3ea27fc6a" />


* **High-Dimensional Spatial Projections**: Projects text embeddings onto a responsive 2D coordinate space where semantically similar feedback items visually cluster together.
* **Dynamic Color Mapping**: Color-code data points instantly by **Sentiment** (*Positive / Neutral / Negative*), **Topic Clusters**, **Organization**, or **Stakeholder Power-Interest Quadrants**.
* **Interactive Spotlight & Inspector**: Pan, zoom, and hover over data points to inspect text content, match confidence, row index, and organizational metadata in real time.

### 🏛️ 2. Stakeholder Power-Interest Matrix & Priority Weighting

<img width="1035" height="853" alt="Screenshot 2026-07-29 144735" src="https://github.com/user-attachments/assets/c19b7b7d-baf9-4ae3-ba5a-9c30257bd402" />


* **2x2 Strategic Classification**: Classify stakeholder organizations along **Influence (Power)** and **Interest** axes (1.0 to 5.0 scale).
* **Four Strategic Quadrants**:
  * 🔴 **Key Players** (*High Power, High Interest*) – **2.5x Priority Weight**
  * 🟡 **Keep Satisfied** (*High Power, Low Interest*) – **1.8x Priority Weight**
  * 🔵 **Keep Informed** (*Low Power, High Interest*) – **1.2x Priority Weight**
  * ⚪ **Monitor** (*Low Power, Low Interest*) – **0.8x Priority Weight**
* **Automated Organization Discovery**: Automatically identifies organization names across imported datasets and assigns initial quadrant classifications.
* **Priority-Weighted Prompts**: Automatically injects stakeholder priority weights into AI synthesis prompts, ensuring Key Player concerns take precedence in executive summaries.

### 🏷️ 3. Dynamic Topic Clustering & Custom Workbench

<img width="1227" height="804" alt="Screenshot 2026-07-29 144651" src="https://github.com/user-attachments/assets/5135b33a-f996-423c-9684-6a246fee4c9a" />

* **Algorithmic & AI Clustering**: Automatically group feedback into distinct semantic themes using vector distance algorithms or local LLMs.
* **Custom Taxonomy Workbench**: Create custom topic tags, reclassify individual or batched comments, merge related themes, rename topics, or delete obsolete categories.
* **Secondary Topic Matching**: Automatically detects cross-cutting themes that match secondary topics at ≥50% confidence.
* **Cluster-Specific AI Syntheses**: Generate focused report critiques for individual topic clusters, complete with sentiment breakdowns, prepended stakeholder rosters, and CSV traceability rows.
* **Sequential Batch Report Generation**: Generate qualitative synthesis reports in automated batches (one report at a time) for selected or all custom topic clusters, with real-time progress tracking and cancellation controls.
* **Inline Proposed Response Drafting**: Propose official organizational or AI-assisted responses directly within cluster data tables, with visible status flags for responded comments.

### 🔍 4. Natural Language Semantic Search
* **Vector-Based Querying**: Search the dataset using natural language concepts (e.g., *"usability friction during checkout"* or *"route delay complaints"*) rather than exact keyword matches.
* **Cosine Similarity Evaluator**: Calculates angular similarity between the search query vector and all dataset records.
* **Precision Threshold Cutoff**: Adjustable similarity slider (10% to 95%) to dynamically highlight matching records on the 2D canvas and filter the dataset view.

### 💬 5. Comment Response Management & Stakeholder Flagging
* **Proposed Response Drafting**: Draft official policy or customer service responses to any individual stakeholder comment manually or using one-click AI draft generation (`✨ AI Draft Response`).
* **Author Role & Timestamp Tagging**: Assign author roles (e.g., *"Policy Analyst"*, *"CX Lead"*) and timestamp metadata to drafted responses.
* **Visual Response Flagging**: Comments with proposed responses are visibly flagged with `💬 Proposed Response` badges in comments lists, topic cluster tables, and detailed inspector cards.
* **Response Status Filtering**: Filter feedback datasets by response status (*All*, *💬 Proposed Only*, *No Response Yet*) to streamline review workflows.

### 🛡️ 6. AI-Powered Deduplication Audit
* **Pairwise Vector Scanner**: Scans datasets for duplicate, near-identical, or redundant feedback entries using cosine distance metrics.
* **Performance Safeguards**: Automatically caps pairwise deduplication checks at **1,500 records** to eliminate CPU bottlenecks on large datasets while preserving full spatial visualization for all points.
* **Audit & Merge Actions**: Inspect duplicate clusters, select primary entries, archive redundant records, and export clean, deduplicated datasets or annotated audit logs.

### 📊 7. Executive Synthesis & Critical Review Hub

<img width="1037" height="788" alt="Screenshot 2026-07-29 144630" src="https://github.com/user-attachments/assets/d7878e12-2205-4234-9157-0a6ebc50847f" />

* **Stakeholder-Prioritized Reports**: Generates structured Markdown executive reports highlighting critical feedback from top-tier Key Players.
* **Interactive Report Editor & Copy Engine**: Edit report titles and Markdown source content directly in the Synthesis modal with live side-by-side preview, one-click clipboard copying, and `.md` file export.
* **Critical Executive Review**: Perform a factual meta-review across all generated syntheses to date. Summarizes existing conclusions without creating ungrounded external data or hallucinated facts.
* **Structured Output Sections**:
  1. Executive Summary (Overall sentiment & core takeaways)
  2. Key Player & High-Power Stakeholder Priorities
  3. Top Recurring Friction Issues & Positive Feature Requests
  4. Strategic Action Plan (Prioritized by stakeholder impact)
  5. Audit Traceability Matrix (Direct row citations linking findings to source CSV data)
 
<img width="574" height="378" alt="Screenshot 2026-07-29 144940" src="https://github.com/user-attachments/assets/a3b7fc9d-52ad-41e5-b48e-9a24b6522865" />

### 📄 8. Document Model Context & Reference Mapping
* **Document Reference Column Mapping**: Map CSV columns containing document section references (e.g., *"Section 3.2"*, *"Clause 4.1"*) directly during import.
* **Contextual Anchor Linking**: Inspect document reference context alongside stakeholder comments to ground policy reviews in exact source document sections.

### 🌐 9. Standalone Offline HTML Export Snapshot
* **Self-Contained HTML Dashboard Export**: Export a complete, interactive, offline-ready HTML document (`.html`) containing the entire session snapshot.
* **Zero Dependencies**: Recipients can open the exported HTML file in any browser without an internet connection, local servers, or software installation.
* **Interactive Navigation**: Includes tabbed views for Executive Reports, Stakeholder Power-Interest Matrix, Dataset Explorer with live filters, and the Synthesis Reports Hub.
* **Embedded Session Restoration**: Embeds the raw session data payload directly inside the HTML file with a one-click button to restore state in the main application.

### 🗄️ 10. Flexible Local LLM & Offline-First Engine

<img width="859" height="833" alt="Screenshot 2026-07-29 144429" src="https://github.com/user-attachments/assets/58ecc0ba-34e2-4769-bc87-604ed71c0546" />

* **Dual Embedding Modes**:
  * **Built-in Heuristics**: High-speed pseudo-embedding engine for instant testing without external dependencies or API keys.
  * **Local Custom LLM Proxy**: Integrates with local embedding models (*Ollama, LM Studio, Llama.cpp, OpenAI-compatible APIs*) via the backend CORS proxy (`/api/proxy-llm`).
* **Storage Optimization**: Automatically strips floating-point arrays before saving to `localStorage` to prevent quota limits, while auto-downloading full `final_session_dataset_complete.json` files for offline reuse.

---

## ✨ Key Benefits of Using This Engine

| Benefit | How It Solves Your Needs |
| :--- | :--- |
| **Stakeholder-Weighted Clarity** | Focus on what matters most by weighting feedback according to organizational influence and interest. |
| **100% Data Privacy** | Process sensitive surveys and public consultation datasets entirely on-device or via local LLMs (*Ollama / LM Studio*). |
| **Zero-Hallucination Integrity** | Every AI synthesis includes strict factual constraints and direct row index citations back to source CSV records. |
| **Frictionless Executive Sharing** | Share fully interactive standalone `.html` dashboards with stakeholders that run offline in any web browser. |
| **Rapid Noise Reduction** | Instantly detect near-duplicate comments and redundant survey submissions with pairwise vector scanning. |
| **Agile Taxonomy Management** | Effortlessly rename, merge, or reclassify topics on the fly without re-indexing the dataset. |
| **Automated Batch Synthesis** | Generate qualitative reports across all topic clusters sequentially with zero manual repetition. |
| **Auditable Response Workflow** | Draft and track official proposed responses with visible flags and status filters across all views. |

---

## 🏗️ Technical Architecture

* **Frontend**: React 19 (TypeScript), Vite, Tailwind CSS (v4), Motion (layout animations), Lucide React (iconography).
* **Backend**: Express (port 3000) acting as a static asset server and a backend CORS-bypassing proxy for local LLM and embedding endpoints.
* **Build System**: Compiled via `esbuild` into a bundled CommonJS output (`dist/server.cjs`) for clean Node runtime execution.

---

## ⚙️ Local Installation & Setup

### Prerequisites
* **Node.js** (v18 or higher)
* **npm** (v9 or higher)
* *(Optional)* A local LLM/embedding server (e.g., **Ollama**, **LM Studio**, or an OpenAI-compatible server).

### 1. Clone & Navigate
```bash
git clone <repository-url>
cd <project-directory>
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory if needed:
```env
PORT=3000
NODE_ENV=development
```

### 4. Run Development Server
```bash
npm run dev
```
Access the application at `http://localhost:3000`.

### 5. Production Build & Execution
```bash
# Compile static assets & server bundle
npm run build

# Start production server
npm run start
```

---

## 🛠️ Connecting a Local LLM Server (Ollama Example)

To use local vector embeddings and completions:

1. **Start Ollama** with an embedding model (e.g., `nomic-embed-text`):
   ```bash
   ollama run nomic-embed-text
   ```
2. **Open Settings / Manage Datasets** in the application.
3. Toggle **Use Custom LLM / Embedding Server**.
4. Configure endpoints:
   * **Embedding Endpoint:** `http://localhost:11434/api/embeddings`
   * **Embedding Model:** `nomic-embed-text`
   * **LLM Completion Endpoint:** `http://localhost:11434/api/generate` (or `/v1/chat/completions`)
5. Import your dataset. Vector calculations and synthesis reports will route directly through your local LLM server!
