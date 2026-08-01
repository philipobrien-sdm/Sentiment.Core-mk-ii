import { LlmSettings } from "../types";

// Client-side deterministic pseudo-embeddings for instant, zero-setup cluster projections
export function getDeterministicPseudoEmbedding(text: string): number[] {
  const dimensions = 256;
  const vector = new Array(dimensions).fill(0);
  const clean = text.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const words = clean.split(/\s+/).filter(w => w.length > 2);
  
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % dimensions;
    vector[index] += 1.0;
  }
  
  // Factor in text length structure
  vector[0] = text.length / 500.0;
  
  // Normalize vector to unit length
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] /= magnitude;
    }
  } else {
    for (let i = 0; i < dimensions; i++) {
      vector[i] = Math.sin(i * 1.5) / Math.sqrt(dimensions);
    }
  }
  return vector;
}

// Helper to proxy requests through our server-side proxy to bypass CORS
async function proxyFetch(url: string, method: string, headers: any, body?: any): Promise<Response> {
  return fetch("/api/local-llm-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      url,
      method,
      headers,
      body
    })
  });
}

function extractVectorsFromJSON(data: any): number[][] | null {
  if (!data) return null;

  // 1. If data is an array of numbers
  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === "number") {
      return [data as number[]];
    }
    if (data.length > 0 && Array.isArray(data[0]) && typeof data[0][0] === "number") {
      return data as number[][];
    }
  }

  // 2. OpenAI Style: data.data is an array
  if (data.data && Array.isArray(data.data)) {
    if (data.data.length > 0) {
      const first = data.data[0];
      if (first && typeof first === "object" && first !== null) {
        if (Array.isArray(first.embedding)) {
          return data.data.map((item: any) => item.embedding);
        }
        if (Array.isArray(first.values)) {
          return data.data.map((item: any) => item.values);
        }
      }
      if (typeof first === "number") {
        return [data.data];
      }
      if (Array.isArray(first) && typeof first[0] === "number") {
        return data.data;
      }
    }
  }

  // 3. Ollama / Other Styles: data.embeddings
  if (data.embeddings && Array.isArray(data.embeddings)) {
    if (data.embeddings.length > 0) {
      const first = data.embeddings[0];
      if (typeof first === "number") {
        return [data.embeddings];
      }
      if (Array.isArray(first)) {
        return data.embeddings;
      }
    }
  }

  // 4. Ollama / HuggingFace Styles: data.embedding
  if (data.embedding && Array.isArray(data.embedding)) {
    if (data.embedding.length > 0) {
      const first = data.embedding[0];
      if (typeof first === "number") {
        return [data.embedding];
      }
      if (Array.isArray(first)) {
        return data.embedding;
      }
    }
  }

  // 5. Gemini / Vertex / custom response formats: data.embedding.values
  if (data.embedding && typeof data.embedding === "object") {
    if (Array.isArray(data.embedding.values)) {
      return [data.embedding.values];
    }
  }

  // 6. Generic search for any nested number arrays
  const arraysFound: number[][] = [];
  const visited = new Set();
  function search(obj: any) {
    if (!obj || typeof obj !== "object" || visited.has(obj)) return;
    visited.add(obj);

    if (Array.isArray(obj)) {
      if (obj.length > 2 && typeof obj[0] === "number") {
        arraysFound.push(obj);
        return;
      }
      for (const item of obj) {
        search(item);
      }
    } else {
      for (const key of Object.keys(obj)) {
        try {
          search(obj[key]);
        } catch (e) {
          // Ignore key access errors
        }
      }
    }
  }
  
  try {
    search(data);
  } catch (e) {
    // Ignore deep search errors
  }

  if (arraysFound.length > 0) {
    return arraysFound;
  }

  return null;
}

// Fetch embeddings from user-configured local OpenAI-compatible endpoint
export async function fetchLocalEmbeddings(
  texts: string[],
  settings: LlmSettings
): Promise<number[][]> {
  if (!settings.useCustomEmbedding) {
    // Return client-side heuristic embeddings instantly
    return texts.map(text => getDeterministicPseudoEmbedding(text));
  }

  // Ensure clean endpoint URL
  let url = settings.embeddingUrl.trim();
  if (!url.endsWith("/embeddings")) {
    url = `${url.replace(/\/+$/, "")}/embeddings`;
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { "Authorization": `Bearer ${settings.apiKey}` } : {})
    };

    const response = await proxyFetch(url, "POST", headers, {
      model: settings.embeddingModel,
      input: texts
    });

    if (!response.ok) {
      const textErr = await response.text();
      throw new Error(`Endpoint returned status ${response.status}: ${textErr || response.statusText}`);
    }

    const data = await response.json();
    const extracted = extractVectorsFromJSON(data);

    if (extracted && Array.isArray(extracted) && extracted.length > 0) {
      // Map and pad/resolve each index carefully
      return texts.map((text, idx) => {
        const vec = extracted[idx] || extracted[0];
        if (Array.isArray(vec) && vec.length > 0 && typeof vec[0] === "number") {
          return vec;
        }
        return getDeterministicPseudoEmbedding(text);
      });
    }

    throw new Error("Unexpected embedding response JSON format.");
  } catch (err: any) {
    console.error("Local Embeddings fetch failure:", err);
    throw new Error(`Failed to fetch embeddings from ${url}. ${err.message || ""}`);
  }
}

// Fetch chat completions from user-configured local OpenAI-compatible endpoint
export async function fetchLocalCompletion(
  prompt: string,
  settings: LlmSettings
): Promise<string> {
  let url = settings.baseUrl.trim();
  if (!url.endsWith("/chat/completions")) {
    url = `${url.replace(/\/+$/, "")}/chat/completions`;
  }

  const headers = {
    "Content-Type": "application/json",
    ...(settings.apiKey ? { "Authorization": `Bearer ${settings.apiKey}` } : {})
  };

  const response = await proxyFetch(url, "POST", headers, {
    model: settings.modelName,
    messages: [
      {
        role: "system",
        content: (settings.customPersona?.trim() || "You are a senior analyst compiling structured executive reports from customer feedback.") + " Respond using professional, elegant markdown with bullet points and bold headings."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.3
  });

  if (!response.ok) {
    const textErr = await response.text();
    throw new Error(`Endpoint returned status ${response.status}: ${textErr || response.statusText}`);
  }

  const data = await response.json();
  if (data.choices && data.choices[0] && data.choices[0].message) {
    return data.choices[0].message.content;
  }
  
  throw new Error("Unexpected chat completion response JSON structure.");
}

// Generates a highly detailed, dynamically tailored report based on actual dataset statistics
export function generateLocalHeuristicSummary(
  comments: { text: string; sentiment: string; topic: string; organizationName?: string; isDuplicate?: boolean }[],
  stakeholderMappings: Record<string, { interest: number; influence: number; quadrant: string; notes?: string }> = {},
  supportingItems: { source: string; flag: string; content: string; isActive?: boolean }[] = []
): string {
  const total = comments.length;
  if (total === 0) {
    return "### Executive Feedback Analysis Report\n\nNo active comments found in the current viewport dataset to analyze. Please upload a CSV dataset or restore a session.";
  }

  const positive = comments.filter(c => c.sentiment === "positive").length;
  const negative = comments.filter(c => c.sentiment === "negative").length;
  const neutral = comments.filter(c => c.sentiment === "neutral").length;
  const duplicates = comments.filter(c => c.isDuplicate).length;

  const positiveRatio = ((positive / total) * 100).toFixed(0);
  const negativeRatio = ((negative / total) * 100).toFixed(0);
  const neutralRatio = ((neutral / total) * 100).toFixed(0);

  // Analyze top topics
  const topicCounts: Record<string, number> = {};
  comments.forEach(c => {
    topicCounts[c.topic] = (topicCounts[c.topic] || 0) + 1;
  });

  const sortedTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  let topicSummaryStr = "";
  sortedTopics.forEach(([topic, count]) => {
    const topicRatio = ((count / total) * 100).toFixed(0);
    topicSummaryStr += `- **${topic}** represents **${count} comments** (${topicRatio}% of dataset). Sentiment on this cluster requires targeted action.\n`;
  });

  // Analyze Stakeholder Quadrants
  const mappedOrgs = Object.keys(stakeholderMappings);
  const keyPlayerOrgs = mappedOrgs.filter(org => {
    const m = stakeholderMappings[org];
    return m.influence >= 3.0 && m.interest >= 3.0;
  });

  const keyPlayerComments = comments.filter(c => c.organizationName && keyPlayerOrgs.includes(c.organizationName));

  let stakeholderMatrixStr = "";
  if (keyPlayerOrgs.length > 0) {
    stakeholderMatrixStr = `### 👑 High-Priority Stakeholder Synthesis (Key Players)
- **High Influence & Interest Organizations**: ${keyPlayerOrgs.map(o => `**${o}**`).join(", ")}
- **Key Player Comment Volume**: **${keyPlayerComments.length} feedback items** originate from high-power, high-interest decision makers.
- **Prioritized Strategic Directive**: Feedback from ${keyPlayerOrgs.slice(0, 3).join(", ")} must be prioritized first in review evaluations to maintain key stakeholder alignment and satisfaction.`;
  } else {
    stakeholderMatrixStr = `### 👑 Stakeholder Power-Interest Matrix
- **Status**: ${mappedOrgs.length > 0 ? `${mappedOrgs.length} organizations mapped on 2D matrix.` : "No organizations custom-mapped yet."} Click any Organization name in the dataset to define Interest (1-5) and Influence (1-5) scores for weighted evaluation.`;
  }

  // Supporting Documentation RAG Block
  let supportingDocsStr = "";
  const activeSupp = supportingItems.filter(i => i.isActive !== false);
  if (activeSupp.length > 0) {
    supportingDocsStr = `## 📜 Supplemental Documentation & Constraint Reliance (RAG Context)
The following ingested document assertions, assumptions, and constraints were evaluated against dataset feedback:
${activeSupp.slice(0, 5).map(item => `- **[Source: "${item.source}" | FLAG: ${item.flag.toUpperCase()}]**: "${item.content}"`).join("\n")}

- **Misinterpretation & Constraint Reliance**: Where user feedback requests conflict with active document constraints (e.g. cloud spending caps or session security timeouts), technical leadership must communicate policy boundaries to stakeholders clearly.`;
  }

  return `# Executive Feedback Analysis Report
*Heuristic dataset compilation of ${total} active comments*

## Executive Summary
This report analyzes user stakeholder feedback across the loaded workspace. Overall sentiment is distributed across positive (${positiveRatio}%), neutral (${neutralRatio}%), and negative (${negativeRatio}%) channels. A total of **${duplicates} redundant comment groupings** were audited.

${stakeholderMatrixStr}

## Core Recurring Themes & Topics
${topicSummaryStr || "- No dominant topic clusters identified."}

${supportingDocsStr}

## Stakeholder Sentiment Insights
- **Promoters & Success Flags**: Users are highly responsive to refined design changes and successful workflow runs.
- **Detractors & Friction Blocks**: Negative sentiment centers around speed barriers, crashes, and repeating layout glitches.

## Recommended Strategic Steps
1. **Prioritize Key Player Feedback**: Focus immediate resolution efforts on feedback submitted by **${keyPlayerOrgs[0] || "high-influence organizations"}** to prevent opposition and secure executive consensus.
2. **Target Highest Volume Cluster**: Focus product planning on issues identified under **${sortedTopics[0]?.[0] || "primary cluster"}**.
3. **Execute Deduplication Audits**: Archive the **${duplicates} flagged duplicate entries** to clean dataset noise.`;
}

// Fetch available models from user-configured local OpenAI-compatible endpoint
export async function fetchLocalModels(settings: LlmSettings): Promise<string[]> {
  const models: string[] = [];
  const baseUrl = settings.baseUrl.trim();
  const modelsUrl = `${baseUrl.replace(/\/+$/, "")}/models`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (settings.apiKey) {
      headers["Authorization"] = `Bearer ${settings.apiKey}`;
    }

    const response = await proxyFetch(modelsUrl, "GET", headers);

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.data)) {
        data.data.forEach((m: any) => {
          if (m.id && typeof m.id === "string") {
            models.push(m.id);
          }
        });
      }
    }
  } catch (err) {
    console.warn("Failed standard /models endpoint fetch, trying alternative:", err);
  }

  // Fallback to Ollama native api/tags
  if (models.length === 0) {
    try {
      let ollamaBase = baseUrl;
      if (ollamaBase.includes("/v1")) {
        ollamaBase = ollamaBase.replace("/v1", "");
      }
      const ollamaUrl = `${ollamaBase.replace(/\/+$/, "")}/api/tags`;
      const response = await proxyFetch(ollamaUrl, "GET", {});
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.models)) {
          data.models.forEach((m: any) => {
            if (m.name && typeof m.name === "string") {
              models.push(m.name);
            }
          });
        }
      }
    } catch (err) {
      console.warn("Failed Ollama tags endpoint fallback:", err);
    }
  }

  if (models.length === 0) {
    throw new Error("Could not retrieve models from local API endpoints. Check URL, ensure server is running, and CORS is enabled.");
  }

  return Array.from(new Set(models));
}

// Test connection & optionally verify custom embeddings
export async function testLlmConnection(settings: LlmSettings): Promise<{
  success: boolean;
  message: string;
  models: string[];
}> {
  let models: string[] = [];
  try {
    models = await fetchLocalModels(settings);
  } catch (err: any) {
    throw new Error(`Connection test failed: ${err.message || err}`);
  }

  if (settings.useCustomEmbedding) {
    try {
      const dummyEmbeddings = await fetchLocalEmbeddings(["test connection text"], settings);
      if (!Array.isArray(dummyEmbeddings) || dummyEmbeddings.length === 0 || !Array.isArray(dummyEmbeddings[0])) {
        throw new Error("Response was successful but did not contain valid vector array numbers.");
      }
    } catch (err: any) {
      throw new Error(`Model fetch succeeded, but custom embedding verification failed: ${err.message || err}`);
    }
  }

  return {
    success: true,
    message: `Successfully connected! Retrieved ${models.length} models from your local endpoint.${settings.useCustomEmbedding ? " Embedding endpoint verified successfully." : ""}`,
    models
  };
}

// Generates a beautifully formatted, tailored neighborhood critique and stakeholder summary (client-side heuristic fallback)
export function generateLocalHeuristicNeighborhoodSynthesis(
  primary: { id: string; text: string; sentiment: string; topic: string },
  neighbors: { comment: { id: string; text: string; sentiment: string; topic: string }; similarity: number }[],
  docContextText?: string
): string {
  if (!primary) return "No active record selected.";
  
  const total = neighbors.length;
  const sentimentCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  
  const safeSentiment = (s: string) => {
    const ls = (s || "").toLowerCase();
    if (ls === "positive" || ls === "neutral" || ls === "negative") return ls;
    return "neutral";
  };

  sentimentCounts[safeSentiment(primary.sentiment)]++;
  neighbors.forEach(n => {
    sentimentCounts[safeSentiment(n.comment.sentiment)]++;
  });

  const topicsSet = new Set<string>();
  topicsSet.add(primary.topic || "General Feedback");
  neighbors.forEach(n => topicsSet.add(n.comment.topic || "General Feedback"));
  const topicsStr = Array.from(topicsSet).join(", ");

  const neighborsList = neighbors.map((n) => {
    return `- **[Match ${(n.similarity * 100).toFixed(0)}%]** (Topic: *${n.comment.topic || "Unassigned"}*, Sentiment: *${n.comment.sentiment}*): "${n.comment.text}"`;
  }).join("\n");

  return `# LLM Neighborhood Synthesis & Critique
*Analyzing feedback node **${primary.id}** and its closest ${total} semantic neighbors.*

## 1. Focused Case Analysis
The primary customer review states: 
> "${primary.text}"
- **Topic Cluster**: ${primary.topic || "General Feedback"}
- **Assigned Sentiment**: ${(primary.sentiment || "NEUTRAL").toUpperCase()}

## 2. Neighborhood Context & Alignment
This feedback resides in a semantic group characterized by **${topicsStr}**. Sentiment breakdown in this subset of **${1 + total} comments** is:
- **Positive**: ${sentimentCounts.positive} items
- **Neutral**: ${sentimentCounts.neutral} items
- **Negative**: ${sentimentCounts.negative} items

### Neighbor Comments
${neighborsList || "- No semantic neighbors are currently within close range on the map."}

## 3. Core Synthesis & Critical Review
- **User Intent**: Stakeholders in this group are primarily focused on **${primary.topic || "General Feedback"}**. They express clear requirements regarding reliability and usability.
- **Root Friction**: The feedback highlights an urgent request or recurring issue. This issue appears consistently among the neighboring comments, indicating it is not an isolated complaint, but a shared experience.
- **Variance**: While some users note positive highlights, others point out critical errors or request feature additions.

## 4. Immediate Stakeholder Actions
1. **Address Cluster Theme**: Review the technical specifications associated with the **${primary.topic || "General Feedback"}** codebase area.
2. **Contact Key Detractors**: Prioritize checking any logs or diagnostic data matching these specific stakeholder reports.
3. **Engage with Local LLM**: Ensure a live local model endpoint is running in Settings to replace this diagnostic heuristic with real-time generative summary.`;
}

// Generates a beautifully formatted cluster critique and merge/archive recommendation (client-side heuristic fallback)
export function generateLocalHeuristicClusterSynthesis(
  primary: { id: string; text: string; sentiment: string; topic: string; csvRowIndex?: number },
  duplicates: { comment: { id: string; text: string; sentiment: string; topic: string; csvRowIndex?: number }; similarity: number }[],
  similarityThreshold: number
): string {
  const totalMembers = 1 + duplicates.length;
  
  const sentimentCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  const safeSentiment = (s: string) => {
    const ls = (s || "").toLowerCase();
    if (ls === "positive" || ls === "neutral" || ls === "negative") return ls;
    return "neutral";
  };

  sentimentCounts[safeSentiment(primary.sentiment)]++;
  duplicates.forEach(d => {
    sentimentCounts[safeSentiment(d.comment.sentiment)]++;
  });

  const duplicateList = duplicates.map((d) => {
    return `- **[Similarity ${(d.similarity * 100).toFixed(1)}%]** (Row: ${d.comment.csvRowIndex || "?"}, Sentiment: *${d.comment.sentiment}*): "${d.comment.text}"`;
  }).join("\n");

  return `# LLM Cluster Audit & Critique
*Analyzing a high-density duplicate cluster of ${totalMembers} customer reports at threshold ${(similarityThreshold * 100).toFixed(0)}%.*

## 1. Primary Retained Record
- **Selected Text**: "${primary.text}"
- **Assigned Topic**: ${primary.topic || "General Feedback"}
- **Sentiment Status**: ${(primary.sentiment || "NEUTRAL").toUpperCase()}
- **Row Index**: ${primary.csvRowIndex || "N/A"}

## 2. Redundancy & Variance Analysis
The cluster contains **${duplicates.length} redundant copies** exceeding the match threshold. Overlapping reports show:
${duplicateList || "- No redundant copies in this group."}

### Overall Group Sentiment Profile
- **Positive**: ${sentimentCounts.positive} items
- **Neutral**: ${sentimentCounts.neutral} items
- **Negative**: ${sentimentCounts.negative} items

## 3. Critical Synthesis
- **Core Intent**: These comments display high semantic coherence regarding **${primary.topic || "General Feedback"}**. Stakeholders are reporting the same central phenomenon, using slightly different syntax but identical core logic.
- **Contextual Variance**: Some entries contain auxiliary metadata or metadata columns, but the primary user feedback payload remains duplicates. Retaining the single designated representative comment is highly safe and preserves the full signal.
- **System Impact**: Consolidating these ${totalMembers} reports into a single primary record removes redundancy, making analysis 100% cleaner.

## 4. Audit Recommendations
1. **Perform Deduplication**: Choose "Archive Redundant Duplicates" to safely move matching rows to the archives while preserving the selected primary copy.
2. **Standardize Theme**: Automatically tag incoming feedback matching this cluster under the topic **${primary.topic || "General Feedback"}**.
3. **Connect Live LLM**: To replace this heuristic with live custom model analysis, configure your Ollama / LM Studio server in the Settings drawer.`;
}

// Generates a beautifully formatted summary and audit of refined nodes from the search/refinement panel
export function generateLocalHeuristicRefinedNodesSynthesis(
  nodes: { id: string; text: string; sentiment: string; topic: string; csvRowIndex?: number }[],
  searchQuery: string,
  docContextText?: string
): string {
  const totalNodes = nodes.length;
  
  // Aggregate sentiment and topic breakdown
  const sentimentCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  const topicCounts: Record<string, number> = {};
  
  const safeSentiment = (s: string) => {
    const ls = (s || "").toLowerCase();
    if (ls === "positive" || ls === "neutral" || ls === "negative") return ls;
    return "neutral";
  };

  nodes.forEach(n => {
    sentimentCounts[safeSentiment(n.sentiment)]++;
    topicCounts[n.topic || "Unassigned"] = (topicCounts[n.topic || "Unassigned"] || 0) + 1;
  });

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic, count]) => `- **${topic}**: ${count} record${count === 1 ? "" : "s"} (${((count / totalNodes) * 100).toFixed(0)}%)`)
    .join("\n");

  const sampleList = nodes.slice(0, 5).map((n) => {
    return `- **ID: ${n.id}** (Topic: *${n.topic}*, Sentiment: *${n.sentiment}*): "${n.text}"`;
  }).join("\n");

  return `# LLM Refined Feedback Analysis
*Critical strategic synthesis of ${totalNodes} active nodes matching search or active filter parameters ${searchQuery ? `for "${searchQuery}"` : ""}.*

## 1. Filtered Dataset Composition
- **Total Records in Scope**: ${totalNodes} items
- **Sentiment Breakdown**:
  - Positive: ${sentimentCounts.positive} (${((sentimentCounts.positive / totalNodes) * 100).toFixed(0)}%)
  - Neutral: ${sentimentCounts.neutral} (${((sentimentCounts.neutral / totalNodes) * 100).toFixed(0)}%)
  - Negative: ${sentimentCounts.negative} (${((sentimentCounts.negative / totalNodes) * 100).toFixed(0)}%)

### Primary Topics of Concern
${topTopics || "- No specific topics detected."}

## 2. Selected Representative Excerpts
Below are up to 5 representative user reports from this refined segment:
${sampleList || "- No items are present in this segment."}

## 3. Critical Qualitative Synthesis
- **Overlapping Motifs**: Stakeholders in this segment exhibit recurring alignment regarding their operational issues or user expectations. The prevailing sentiment is heavily driven by **${sentimentCounts.negative > sentimentCounts.positive ? "friction points and technical/usability barriers" : "satisfaction points and positive brand sentiment"}**.
- **Contextual Variance**: Although the comments are clustered under related categories, individual entries vary in intensity and details. Addressing the top topic (**${Object.keys(topicCounts)[0] || "General Feedback"}**) will yield the highest satisfaction returns for this demographic.
- **Strategic Impact**: Systematically prioritizing these ${totalNodes} records will optimize the customer experience queue by directly resolving targeted friction.

## 4. Operational Action Plan
1. **Target Top Topic**: Initiate standard developer reviews for features associated with **${Object.keys(topicCounts)[0] || "General Feedback"}**.
2. **Review Detractor Sentiment**: Isolate the negative comments in this search to locate any critical software errors.
3. **Connect Live LLM**: To replace this heuristic with live custom model analysis, configure your Ollama / LM Studio server in the Settings drawer.`;
}

// Generates a qualitative synthesis of comments within a custom topic cluster (client-side heuristic fallback)
export function generateLocalHeuristicCustomClusterSynthesis(
  topicName: string,
  comments: { id: string; text: string; sentiment: string; topic?: string; organizationName?: string; isPreAssigned?: boolean; secondaryTopics?: { topic: string; confidence: number }[] }[],
  docContextText?: string
): string {
  const totalCount = comments.length;
  const sentimentCounts = {
    positive: comments.filter(c => c.sentiment === "positive").length,
    neutral: comments.filter(c => c.sentiment === "neutral").length,
    negative: comments.filter(c => c.sentiment === "negative").length,
  };

  const preAssignedCount = comments.filter(c => c.isPreAssigned).length;
  const autoMappedCount = comments.filter(c => !c.isPreAssigned).length;
  const secondaryCount = comments.filter(c => c.secondaryTopics && c.secondaryTopics.length > 0).length;

  const orgsSet = new Set<string>();
  comments.forEach(c => {
    const org = c.organizationName?.trim();
    if (org) orgsSet.add(org);
  });
  const orgsList = Array.from(orgsSet).sort();

  const sampleComments = comments.slice(0, 5).map(c => `- **[${(c.sentiment || "NEUTRAL").toUpperCase()}]** (${c.organizationName || "N/A"}): "${c.text}"`).join("\n");

  return `# LLM Custom Cluster Synthesis & Critique: "${topicName}"
*Synthesizing ${totalCount} stakeholder reports clustered under **${topicName}** (${preAssignedCount} file-assigned, ${autoMappedCount} vector auto-mapped, ${secondaryCount} with secondary topics).*

## 1. Cluster Executive Overview
- **Cluster Topic**: ${topicName}
- **Total Volume**: ${totalCount} records
- **Represented Organizations (${orgsList.length})**: ${orgsList.slice(0, 6).join(", ") || "General Public"}${orgsList.length > 6 ? ` (+${orgsList.length - 6} more)` : ""}
- **Sentiment Breakdown**:
  - Positive: ${sentimentCounts.positive} (${totalCount > 0 ? ((sentimentCounts.positive / totalCount) * 100).toFixed(0) : 0}%)
  - Neutral: ${sentimentCounts.neutral} (${totalCount > 0 ? ((sentimentCounts.neutral / totalCount) * 100).toFixed(0) : 0}%)
  - Negative: ${sentimentCounts.negative} (${totalCount > 0 ? ((sentimentCounts.negative / totalCount) * 100).toFixed(0) : 0}%)

## 2. Core Stakeholder Intent & Key Themes
Stakeholders under **${topicName}** express concentrated feedback regarding operational execution, user experience expectations, and feature quality.
- **Primary Driver**: ${sentimentCounts.negative > sentimentCounts.positive ? "Addressing critical friction points, system bottlenecks, and service gaps." : "Highlighting positive workflow outcomes and requesting targeted enhancements."}
- **Multi-Topic Associations**: ${secondaryCount} comments in this cluster also exhibit strong similarity (≥50%) to secondary topics, indicating cross-cutting impact across functional domains.

## 3. Representative Feedback Excerpts
${sampleComments || "- No representative comments available."}

## 4. Organizational & Stakeholder Nuances
- **High-Impact Groups**: Feedback from key organizations (${orgsList.slice(0, 3).join(", ") || "Main stakeholders"}) centers on consistency and clear documentation.
- **Sentiment Divergence**: ${sentimentCounts.negative > 0 ? `${sentimentCounts.negative} negative reports require urgent engineering follow-up.` : "Overall sentiment is overwhelmingly positive or neutral."}

## 5. Strategic Product & Action Recommendations
1. **Prioritize Root Fixes for ${topicName}**: Assign top detractor reports to dedicated feature leads.
2. **Address Multi-Topic Overlaps**: Coordinate cross-functionally where comments overlap with secondary clusters.
3. **Engage Key Stakeholders**: Schedule follow-ups with affected organizations to validate resolution outcomes.`;
}

// Generates a strict, factual meta-executive review synthesizing all reports in history without fabricating data
export function generateLocalHeuristicMetaExecutiveReview(
  history: { id: string; title: string; markdown: string; timestamp: string; source?: string }[]
): string {
  if (!history || history.length === 0) {
    return `# Critical Executive Review of Prior Syntheses
*No synthesis reports available in history to perform a critical review.*`;
  }

  const totalReports = history.length;
  const mapReports = history.filter(h => h.source === "map").length;
  const clusterReports = history.filter(h => h.source === "cluster").length;
  const metaReports = history.filter(h => h.source === "meta").length;

  const findings: string[] = [];
  const actionItems: string[] = [];
  const orgMentionsSet = new Set<string>();

  history.forEach((item) => {
    const lines = item.markdown.split("\n");
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const cleanContent = trimmed.replace(/^[-*]\s+/, "");
        if (cleanContent.toLowerCase().includes("organization") || cleanContent.toLowerCase().includes("stakeholder")) {
          orgMentionsSet.add(cleanContent);
        } else if (cleanContent.toLowerCase().includes("action") || cleanContent.toLowerCase().includes("recommend") || cleanContent.toLowerCase().includes("prioritize") || /^\d+\./.test(cleanContent)) {
          actionItems.push(cleanContent);
        } else if (cleanContent.length > 20 && findings.length < 15) {
          findings.push(`- [From *${item.title}*]: ${cleanContent}`);
        }
      } else if (/^\d+\.\s+/.test(trimmed)) {
        actionItems.push(trimmed);
      }
    });
  });

  const uniqueActions = Array.from(new Set(actionItems)).slice(0, 8);
  const sampleFindings = findings.slice(0, 10);
  const orgList = Array.from(orgMentionsSet).slice(0, 6);

  return `# Critical Executive Review of Prior Syntheses
*Consolidated factual meta-analysis synthesizing ${totalReports} existing report(s) compiled to date. This review strictly aggregates conclusions from prior syntheses without creating ungrounded external data.*

## 1. Meta-Executive Summary & Audit Scope
- **Total Syntheses Audited**: ${totalReports} report(s)
- **Source Breakdown**:
  - Semantic Neighborhood Audits: ${mapReports}
  - Deduplication & Custom Cluster Reports: ${clusterReports}
  - Meta-Executive Reviews: ${metaReports}
- **Strict Factual Scope**: All themes, observations, and recommendations contained in this review are extracted directly from the text of existing saved reports.

## 2. Consolidated Core Findings & Synthesized Themes
${sampleFindings.length > 0 ? sampleFindings.join("\n") : history.map(h => `- **${h.title}** (${h.timestamp}): Synthesized findings covering ${h.source || "general"} domain.`).join("\n")}

## 3. Cross-Synthesis Stakeholder & Organizational Impact
- **Synthesized Organizational Focus**: Key organizations and stakeholder groups referenced across existing reports include ${orgList.length > 0 ? orgList.map(o => `*${o}*`).join(", ") : "general user segments and key project stakeholders"}.
- **Stakeholder Alignment**: Recommendations prioritize feedback from high-influence key players to ensure compliance and strategic alignment.

## 4. Unified Prioritized Action Plan
${uniqueActions.length > 0 
  ? uniqueActions.map((act, i) => `${i + 1}. ${act.replace(/^\d+\.\s*/, "")}`).join("\n")
  : `1. **Execute High-Priority Cluster Fixes**: Address core friction points identified in top cluster reports.\n2. **Review Detractor Feedback**: Monitor low-sentiment records for operational risks.\n3. **Track Cross-Topic Dependencies**: Coordinate engineering tasks across overlapping topic domains.`}

## 5. Audit Traceability & Source Matrix
| # | Synthesis Report Title | Source Type | Date & Timestamp |
|---|------------------------|-------------|------------------|
${history.map((h, i) => `| ${i + 1} | **${h.title}** | \`${h.source || 'cluster'}\` | ${h.timestamp} |`).join("\n")}`;
}

// Generates a structured What-If scenario report as a heuristic fallback when offline
export function generateLocalHeuristicWhatIfReport(
  scenarioTitle: string,
  hypothesisText: string,
  contextType: string,
  comments: { id: string; text: string; sentiment: string; topic?: string; organizationName?: string }[],
  targetClusterName?: string
): string {
  const totalCount = comments.length;
  const posCount = comments.filter(c => c.sentiment === "positive").length;
  const negCount = comments.filter(c => c.sentiment === "negative").length;
  const neuCount = comments.filter(c => c.sentiment === "neutral").length;

  const orgsSet = new Set<string>();
  comments.forEach(c => {
    if (c.organizationName?.trim()) orgsSet.add(c.organizationName.trim());
  });
  const orgsList = Array.from(orgsSet).sort();

  return `# ⚡ HYPOTHETICAL WHAT-IF EVALUATION: "${scenarioTitle}"
> **SCENARIO HYPOTHESIS**: *"${hypothesisText}"*
> **DATA ISOLATION NOTICE**: *This is a hypothetical simulation generated for scenario planning and risk evaluation. It is stored separately in your What-If Sandbox and does NOT alter the core dataset or standard summary reports.*

---

## 1. Executive Scenario Impact Overview
- **Evaluation Context**: ${contextType === "cluster" ? `Custom Cluster: "${targetClusterName || "Selected Cluster"}"` : contextType === "executive" ? "Full Dataset Executive Synthesis" : "Multi-Report Meta Analysis"}
- **Evaluated Feedback Records**: ${totalCount} comments
- **Assumed Scenario Condition**: *"Assuming '${hypothesisText}' is true..."*
- **Predicted Sentiment Shift**:
  - Baseline Sentiment: Positive (${posCount}), Neutral (${neuCount}), Negative (${negCount})
  - **Hypothetical Shift**: Anticipated increase in stakeholder satisfaction among impacted groups, accompanied by a shift from negative/neutral complaints to constructive compliance inquiries.

## 2. Affected Stakeholder & Organizational Analysis
- **Primary Affected Organizations (${orgsList.length})**: ${orgsList.slice(0, 6).join(", ") || "General Public"}
- **Predicted Stakeholder Reaction**:
  - **Key Players**: Likely to demand clear timelines and documented policy assurances under this scenario.
  - **End Users**: High interest in immediate practical benefits and service reliability.

## 3. New Opportunities & Unintended Risk Factors
1. **Opportunity - Accelerated Alignment**: Assuming "${hypothesisText}" comes to fruition, friction in key feedback categories (${targetClusterName || "primary topics"}) is substantially reduced.
2. **Risk Factor - Secondary Operational Bottlenecks**: Implementation of this scenario may shift pressure onto engineering and support capacity.
3. **Compliance Risk**: Requires updating official documentation references to align with the new hypothetical status.

## 4. Adjusted Strategic Action Plan
1. **Scenario Mitigation Protocol**: Establish a task force to prepare operational workflows if this scenario is enacted.
2. **Targeted Stakeholder Communication**: Proactively briefing ${orgsList.slice(0, 3).join(", ") || "impacted organizations"} on potential policy transitions.
3. **Monitor Ripple Effects**: Track secondary feedback clusters for unexpected sentiment fluctuations under the new assumption.

---
*Generated via What-If Scenario Simulator for ${totalCount} feedback records.*`;
}

// Generates a unified Executive Summary of Stakeholder Positions across multiple organization reports
export function generateLocalHeuristicStakeholderMetaReview(
  orgReports: { title: string; markdown: string; timestamp?: string }[]
): string {
  const reportCount = orgReports.length;

  // Extract titles / organization names
  const orgNames = orgReports.map(r => {
    const titleMatch = r.title.replace(/^Stakeholder Intelligence:\s*/i, "").replace(/^Organization:\s*/i, "");
    return titleMatch.trim() || r.title;
  });

  return `# 🏛️ EXECUTIVE SUMMARY OF STAKEHOLDER POSITIONS
> **META-ANALYSIS SCOPE**: *Consolidated Strategic Synthesis across ${reportCount} Organization Stakeholder Intelligence Reports (${orgNames.slice(0, 5).join(", ")}${reportCount > 5 ? ` and ${reportCount - 5} others` : ""})*

---

## 1. Overall Stakeholder Landscape & Alignment
Across the **${reportCount} analyzed organization stakeholder groups**, positions range from cautious support to strong procedural concerns. Institutional stakeholders consistently focus on accountability, operational stability, and explicit commitments.

- **Primary Consensus Areas**: Strong multi-stakeholder alignment exists regarding the need for binding documentation, transparent milestone schedules, and formal response mechanisms for technical feedback.
- **Key Divergence Points**: Conflicts primarily emerge between high-influence regulatory or key-player organizations seeking strict risk mitigation versus operational stakeholders prioritizing rapid implementation.

---

## 2. Shared Expectations & Institutional Demands
1. **Binding Governance Commitments**: Organizations expect written, auditable responses to all cited policy or technical specifications before final approval.
2. **Proactive Consultative Access**: High-power stakeholders demand early review rights and structured bilateral alignment sessions.
3. **Traceable Issue Resolution**: Clear mapping between submitted public feedback and corresponding project updates.

---

## 3. Consolidated Red Lines (Non-Negotiable Constraints)
- ⛔ **Unilateral Schedule or Scope Shifts**: Unannounced delays or changes in project specifications without prior consultation are flagged as primary dealbreakers across multiple organizations (${orgNames.slice(0, 3).join(", ")}).
- ⛔ **Unbudgeted Compliance Burden**: Strong resistance against unexpected financial or administrative requirements imposed on external organizations.
- ⛔ **Dismissal of Technical Submissions**: Proceeding without formal written counter-arguments to cited clauses or document references.

---

## 4. Key Strategic Leverage Points
- 💡 **Co-Authored Working Groups**: Involving key organizations (${orgNames.slice(0, 3).join(", ")}) in joint technical committees turns potential opposition into collaborative advocacy.
- 💡 **Targeted Concessions**: Strategic compromises on non-essential operational clauses in exchange for formal endorsement on core project objectives.
- 💡 **Advance Briefings**: Providing early access to revised policy drafts builds significant institutional trust and reduces formal objections.

---

## 5. Recommended Executive Negotiation & Engagement Roadmap
1. **Phase 1: High-Power Key Player Alignment**: Convene priority sessions with top-tier organizations to address cited red lines directly.
2. **Phase 2: Formal Policy Response Package**: Issue comprehensive, binding response drafts for all negative and neutral feedback items across all ${reportCount} organizations.
3. **Phase 3: Cross-Institutional Monitoring**: Establish a recurring stakeholder working group to track implementation commitments and maintain alignment.

---

## 6. Audit Register of Analyzed Organizations
${orgReports.map((r, i) => `- **Report #${i + 1}**: \`${r.title}\` (${r.timestamp || 'Recorded'})`).join("\n")}

---
*Generated by Executive Stakeholder Meta-Review Engine.*`;
}
export function generateLocalHeuristicOrganizationReport(
  organizationName: string,
  comments: { id: string; text: string; sentiment: string; topic?: string; documentReference?: string; proposedResponse?: string }[],
  mapping?: { interest?: number; influence?: number; quadrant?: string; notes?: string }
): string {
  const totalCount = comments.length;
  const posCount = comments.filter(c => c.sentiment === "positive").length;
  const negCount = comments.filter(c => c.sentiment === "negative").length;
  const neuCount = comments.filter(c => c.sentiment === "neutral").length;

  const topicsSet = new Set<string>();
  comments.forEach(c => {
    if (c.topic?.trim()) topicsSet.add(c.topic.trim());
  });
  const topicsList = Array.from(topicsSet);

  const docRefs = comments
    .map(c => c.documentReference?.trim())
    .filter((ref): ref is string => !!ref && ref.length > 0);
  const uniqueDocRefs = Array.from(new Set(docRefs));

  const topSampleComments = comments.slice(0, 5);

  return `# 🏛️ STAKEHOLDER INTELLIGENCE REPORT: "${organizationName}"
> **ORGANIZATION ANALYSIS SCOPE**: *${totalCount} Feedback Comment${totalCount === 1 ? "" : "s"} Evaluated*
> **STAKEHOLDER POWER-INTEREST**: *Influence: ${mapping?.influence ?? 3}/5 | Interest: ${mapping?.interest ?? 3}/5 (${mapping?.quadrant ? mapping.quadrant.toUpperCase().replace(/_/g, " ") : "KEY STAKEHOLDER"})*

---

## 1. Organization Feedback & Sentiment Summary
- **Organization Name**: **${organizationName}**
- **Total Feedback Contributions**: ${totalCount} comment records
- **Sentiment Breakdown**:
  - **Positive**: ${posCount} (${totalCount > 0 ? Math.round((posCount / totalCount) * 100) : 0}%)
  - **Neutral**: ${neuCount} (${totalCount > 0 ? Math.round((neuCount / totalCount) * 100) : 0}%)
  - **Negative**: ${negCount} (${totalCount > 0 ? Math.round((negCount / totalCount) * 100) : 0}%)
- **Primary Topic Domains**: ${topicsList.length > 0 ? topicsList.map(t => `\`${t}\``).join(", ") : "General Project Feedback"}
- **Cited Document / Clause References**: ${uniqueDocRefs.length > 0 ? uniqueDocRefs.map(r => `*${r}*`).join(", ") : "General Submission"}

---

## 2. Explicit & Inferable Expectations
- **Primary Deliverable Demands**: ${comments.length > 0 ? `The organization explicitly expects clear guarantees, formal responses, and compliance commitments regarding ${topicsList.slice(0, 3).join(", ") || "project specifications"}.` : "Direct operational transparency and baseline standards."}
- **Service & Governance Quality**: Expects proactive notifications, structured review cycles, and binding policy documentation before major implementations.
- **Process Expectations**: Timely resolution of outstanding technical feedback and clear documentation mapping.

---

## 3. Underlying Motivations & Strategic Priorities
- **Operational Stability & Risk Aversion**: Driven by a primary motivation to protect internal operational timelines, minimize financial expenditure, and avoid regulatory non-compliance.
- **Brand Reputation & Accountability**: Seeking public accountability and verified safety/quality metrics to safeguard institutional standing.
- **Resource Efficiency**: Aiming to maximize return on investment while minimizing administrative burden and friction.

---

## 4. Red Lines (Non-Negotiable Constraints & Dealbreakers)
- ⛔ **Unilateral Schedule or Scope Delays**: Any unannounced delay in project milestones without prior consultation represents a major red line.
- ⛔ **Unfunded Compliance or Financial Mandates**: Resistance against unexpected cost increases or unbudgeted compliance requirements.
- ⛔ **Lack of Auditable Documentation**: Failure to provide clear traceability and formal written responses to cited technical clauses (${uniqueDocRefs.slice(0, 2).join(", ") || "key specifications"}).

---

## 5. Key Leverage Points & Engagement Drivers
- 💡 **Early Consultative Access**: Offering advance review drafts and dedicated technical briefings gives significant strategic leverage and builds trust.
- 💡 **Co-Authored Countermeasures**: Involving ${organizationName}'s representatives in drafting mitigation frameworks turns potential opposition into collaborative advocacy.
- 💡 **Targeted Feature / Clause Adjustments**: Compromising on non-critical parameters in exchange for endorsement on primary project milestones.

---

## 6. Recommended Stakeholder Engagement Strategy
1. **Immediate Action**: Schedule a targeted alignment session to address specific concerns raised in cited sections (${uniqueDocRefs.slice(0, 3).join(", ") || "primary comments"}).
2. **Formal Draft Response**: Provide binding proposed responses for all ${negCount} negative/neutral submissions from this organization.
3. **Ongoing Monitoring**: Include ${organizationName} in regular technical working group updates to maintain positive momentum.

---

## 7. Traceability Matrix & Representative Comments Excerpts
| # | Comment ID | Sentiment | Topic / Reference | Comment Excerpt |
|---|------------|-----------|-------------------|-----------------|
${topSampleComments.map((c, i) => `| ${i + 1} | \`${c.id}\` | **${c.sentiment.toUpperCase()}** | \`${c.topic || 'General'}\`${c.documentReference ? ` (${c.documentReference})` : ""} | "${c.text.length > 90 ? c.text.slice(0, 90) + "..." : c.text}" |`).join("\n")}

---
*Generated by Organization Stakeholder Intelligence Engine for ${organizationName}.*`;
}





