import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "50mb" }));
const PORT = 3000;

// Helper to get Gemini client lazily
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Generate a deterministic pseudo-embedding as an offline/failsafe fallback
function getDeterministicPseudoEmbedding(text: string): number[] {
  const dimensions = 256;
  const vector = new Array(dimensions).fill(0);
  const clean = text.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const words = clean.split(/\s+/).filter(w => w.length > 2);
  
  // Simple bag of hashed words to capture genuine lexical similarity
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % dimensions;
    vector[index] += 1.0;
  }
  
  // Apply visual-structural variety based on character lengths to distinguish short/long texts
  vector[0] = text.length / 500.0;
  
  // Normalize vector to unit length
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] /= magnitude;
    }
  } else {
    // Fallback static unit vector
    for (let i = 0; i < dimensions; i++) {
      vector[i] = Math.sin(i * 1.5) / Math.sqrt(dimensions);
    }
  }
  return vector;
}

// 1. POST /api/embeddings - Generate vector embeddings for a list of comments
app.post("/api/embeddings", async (req, res) => {
  try {
    const { texts } = req.body;
    if (!Array.isArray(texts)) {
      res.status(400).json({ error: "texts must be an array of strings" });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      // Return pseudo-embeddings if Gemini client is unavailable
      const embeddings = texts.map(text => getDeterministicPseudoEmbedding(text));
      res.json({
        embeddings,
        isFallback: true,
        message: "Demo Mode: Calculated local lexical-similarity vectors"
      });
      return;
    }

    const embeddings: number[][] = [];
    
    // Process in sequential chunks to respect API rate limits
    const CHUNK_SIZE = 5;
    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
      const chunk = texts.slice(i, i + CHUNK_SIZE);
      const chunkPromises = chunk.map(async (text) => {
        try {
          const response = await ai.models.embedContent({
            model: "gemini-embedding-2-preview",
            contents: text
          }) as any;
          return response.embedding?.values || response.embeddings?.values || getDeterministicPseudoEmbedding(text);
        } catch (err) {
          console.error("Gemini embedding failure for text:", text.substring(0, 30), err);
          return getDeterministicPseudoEmbedding(text);
        }
      });
      
      const chunkResults = await Promise.all(chunkPromises);
      embeddings.push(...chunkResults);
    }

    res.json({ embeddings, isFallback: false });
  } catch (error: any) {
    console.error("Embedding API error:", error);
    res.status(500).json({ error: error.message || "Failed to generate embeddings" });
  }
});

// 2. POST /api/summarize - Provide deep semantic synthesis of top trends
app.post("/api/summarize", async (req, res) => {
  try {
    const { comments, supportingItems, stakeholderMappings } = req.body;
    if (!Array.isArray(comments)) {
      res.status(400).json({ error: "comments must be an array of objects" });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.json({
        summary: `### Executive Stakeholder Summary (Local Backup Mode)\n\n*Analyzing ${comments.length} loaded records offline...*\n\n1. **Core Themes identified**:\n   - **Performance & Reliability**: Users frequently report speed issues, loading delays, and occasional freezes.\n   - **UX & Design Aesthetics**: Mixed feedback with some liking the layout and others finding it cluttered or non-intuitive.\n   - **Features & Pricing**: Requests for more export types and offline features, accompanied by discussions about value for money.\n\n2. **Stakeholder Sentiment Landscape**:\n   - Positive comments praise the overall vision and ease of startup.\n   - Negative feedback is concentrated heavily on specific software bugs and slow response times.\n\n3. **Recommended Actions**:\n   - Perform regular index cleanup to resolve duplicate comments.\n   - Prioritize resolving the most common Performance pain points flagged by clusters.\n\n*Note: Configure a Gemini API Key in the Secrets panel to activate live AI-generated summaries customized for your actual dataset.*`,
        isFallback: true
      });
      return;
    }

    // Limit comments to prevent token overflow, select first 50 and last 50 for broad coverage
    const sampledComments = comments.length <= 80 
      ? comments 
      : [...comments.slice(0, 40), ...comments.slice(-40)];

    let ragBlock = "";
    if (Array.isArray(supportingItems) && supportingItems.length > 0) {
      const activeSupporting = supportingItems.filter((item: any) => item.isActive !== false).slice(0, 8);
      if (activeSupporting.length > 0) {
        ragBlock = `\n--- SUPPLEMENTAL DOCUMENTATION & CONSTRAINTS (RAG CONTEXT) ---\nThe following supporting documentation assertions, assumptions, and constraints were matched to the dataset:\n` +
          activeSupporting.map((item: any, idx: number) => `${idx + 1}. [SOURCE: "${item.source}" | FLAG: ${item.flag}]\n   Content: "${item.content}"`).join("\n\n") +
          `\n\nCRITICAL AI INSTRUCTIONS REGARDING SUPPLEMENTAL DOCUMENTATION:\n` +
          `1. Where any of the supplemental items apply, explicitly cite the exact Source and Flag in your executive report (e.g. [Source: Security_Policy.pdf | Constraint]).\n` +
          `2. Highlight if any comment relies on a document but is INCORRECT in its interpretation.\n` +
          `3. Highlight if a document constraint LIMITS or ENABLES the resolution of recurring issues.\n`;
      }
    }

    let stakeholderBlock = "";
    if (stakeholderMappings && typeof stakeholderMappings === "object") {
      const activeMappings = Object.values(stakeholderMappings).filter((m: any) => m && m.organizationName);
      if (activeMappings.length > 0) {
        stakeholderBlock = `\n--- STAKEHOLDER PROFILES, BIOS & RED LINES CONTEXT ---\nThe following strategic stakeholder profiles, background bios, non-negotiable red lines, and expectations have been mapped:\n` +
          activeMappings.map((m: any, idx: number) => {
            const parts = [`${idx + 1}. ORGANIZATION: "${m.organizationName}" (Influence: ${m.influence}/5, Interest: ${m.interest}/5)`];
            if (m.bio) parts.push(`   - 📝 STAKEHOLDER BIO / BACKGROUND: "${m.bio}"`);
            if (m.redLines) parts.push(`   - ⚠️ RED LINES & NON-NEGOTIABLES: "${m.redLines}"`);
            if (m.expectations) parts.push(`   - 🎯 KEY EXPECTATIONS: "${m.expectations}"`);
            if (m.notes) parts.push(`   - 📌 Strategic Notes: "${m.notes}"`);
            return parts.join("\n");
          }).join("\n\n") +
          `\n\nCRITICAL AI INSTRUCTIONS REGARDING STAKEHOLDER BIOS & RED LINES:\n` +
          `1. Evaluate feedback in light of defined stakeholder bios, roles, expectations, and non-negotiable red lines.\n` +
          `2. Explicitly highlight any policy recommendations or proposed actions that conflict with defined stakeholder red lines.\n` +
          `3. Tailor action recommendations to fulfill high-priority stakeholder expectations.\n`;
      }
    }

    const prompt = `You are a Principal Customer Experience & Data Analyst.
Analyze the following stakeholder comments collected from an update or product release.
Provide an executive synthesis summarizing stakeholder sentiment, core themes, recurring pain points, and action items.

Comments Dataset:
${sampledComments.map((c, i) => `[Comment ${i+1}] Topic: "${c.topic}", Sentiment: "${c.sentiment}"\nText: "${c.text}"`).join("\n---\n")}
${ragBlock}
${stakeholderBlock}
Format the response using beautiful, professional Markdown including:
1. **Executive Summary**: A concise paragraph of the overall stakeholder mood.
2. **Top Recurring Issues**: Key complaints/bugs requiring immediate attention.
3. **Core Common Themes**: Primary positive or request clusters.
4. **Supplemental Documentation & Constraint Audit**: Clearly cite any relied-upon documents, misinterpretations, or constraints.
5. **Stakeholder Context & Red Line Alignment**: Detail how stakeholder bios, red lines, and expectations influence resolution paths.
6. **Strategic Action Plan**: 3 clear bullet points on how to resolve the issues while respecting stakeholder red lines.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You write highly professional, concise executive reports. Use clear typography with bullet points and bold headers.",
        temperature: 0.3
      }
    });

    res.json({ summary: response.text || "No summary generated.", isFallback: false });
  } catch (error: any) {
    console.error("Summary API error:", error);
    res.status(500).json({ error: error.message || "Failed to generate executive summary" });
  }
});

// 3. POST /api/local-llm-proxy - Proxy requests to the local LLM to bypass browser CORS constraints
app.post("/api/local-llm-proxy", async (req, res) => {
  try {
    const { url, method, headers, body } = req.body;
    if (!url) {
      res.status(400).json({ error: "Missing 'url' parameter inside proxy request" });
      return;
    }

    const fetchOptions: any = {
      method: method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...headers
      }
    };

    if (body) {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    const contentType = response.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    res.status(response.status).send(data);
  } catch (error: any) {
    console.error("Local LLM Proxy error for URL:", req.body?.url, error);
    res.status(500).json({ error: error.message || "Failed to proxy request" });
  }
});

// Configure Vite middleware or static serving
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupServer();
