import { CommentItem, DocumentSection, SupportingDocContextItem, DocumentExtractionRecord, IngestedLibraryDocument, DocFlag, StakeholderMapping, getQuadrantInfo } from "../types";
import { getDeterministicPseudoEmbedding } from "./localLlm";

/**
 * Calculates cosine similarity between two numeric vectors.
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const minLength = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < minLength; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Extracts all unique document references present across a list of comments.
 */
export function extractDocumentReferencesFromComments(comments: CommentItem[]): string[] {
  const refSet = new Set<string>();

  comments.forEach((c) => {
    if (c.documentReference && c.documentReference.trim()) {
      refSet.add(c.documentReference.trim());
    } else if (c.originalRowData) {
      // Check common column names in originalRowData if documentReference isn't set
      for (const [key, val] of Object.entries(c.originalRowData)) {
        const kLower = key.toLowerCase();
        if (
          (kLower.includes("doc") ||
            kLower.includes("section") ||
            kLower.includes("clause") ||
            kLower.includes("ref") ||
            kLower.includes("page") ||
            kLower.includes("article") ||
            kLower.includes("provision") ||
            kLower.includes("policy") ||
            kLower.includes("requirement")) &&
          val &&
          typeof val === "string" &&
          val.trim().length > 0 &&
          val.trim().length < 100
        ) {
          refSet.add(val.trim());
        }
      }
    }
  });

  return Array.from(refSet).sort();
}

/**
 * Auto-syncs document sections with references found in comments.
 * Ensures every reference present in comments has a DocumentSection entry in the store.
 */
export function syncDocumentSectionsWithComments(
  comments: CommentItem[],
  existingSections: DocumentSection[]
): DocumentSection[] {
  const discoveredRefs = extractDocumentReferencesFromComments(comments);
  const updatedList = [...existingSections];

  discoveredRefs.forEach((ref) => {
    const exists = updatedList.some(
      (sec) => sec.reference.toLowerCase().trim() === ref.toLowerCase().trim()
    );
    if (!exists) {
      updatedList.push({
        id: `doc_sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        reference: ref,
        title: ref,
        excerptText: "",
        updatedAt: new Date().toLocaleDateString(),
      });
    }
  });

  return updatedList;
}

/**
 * Builds a prompt-ready markdown block of document context relevant to a set of comments.
 */
export function buildDocumentContextPromptBlock(
  comments: CommentItem[],
  sections?: DocumentSection[]
): string {
  let effectiveSections = sections;
  if (!effectiveSections) {
    const saved = localStorage.getItem("document_sections");
    if (saved) {
      try {
        effectiveSections = JSON.parse(saved);
      } catch (e) {}
    }
  }
  if (!effectiveSections || effectiveSections.length === 0) return "";

  // 1. Find all references in the provided comments
  const activeRefs = new Set<string>();
  comments.forEach((c) => {
    if (c.documentReference && c.documentReference.trim()) {
      activeRefs.add(c.documentReference.trim().toLowerCase());
    }
  });

  // 2. Filter sections matching active references OR marked as general/global context
  const matchedSections = effectiveSections.filter((sec) => {
    const isGlobal = sec.reference.toLowerCase().includes("global") || sec.reference.toLowerCase().includes("general");
    const isMatched = activeRefs.has(sec.reference.trim().toLowerCase());
    return (isMatched || isGlobal || activeRefs.size === 0) && sec.excerptText && sec.excerptText.trim().length > 0;
  });

  if (matchedSections.length === 0) {
    // If no exact match with excerpts, check if any section has text available
    const sectionsWithText = effectiveSections.filter((s) => s.excerptText && s.excerptText.trim().length > 0);
    if (sectionsWithText.length === 0) return "";
    
    return `\n--- REVIEWED MATERIAL / DOCUMENT CONTEXT ---
The dataset reviews draft materials. Document sections registered in the context store:
${sectionsWithText.map((s) => `\n### [DOCUMENT REFERENCE: ${s.reference}]\n${s.excerptText.trim()}`).join("\n\n")}\n`;
  }

  return `\n--- REVIEWED MATERIAL / DOCUMENT CONTEXT ---
The user feedback entries being analyzed specifically react to the following draft document sections/clauses:

${matchedSections.map((s) => `### [DOCUMENT REFERENCE: ${s.reference}]\n${s.excerptText.trim()}`).join("\n\n")}\n`;
}

/**
 * Automatically parses a multi-section document text (e.g. pasted policy or bill)
 * into individual document section models based on section headers like "Section 1", "Clause 2", etc.
 */
export function parsePastedDocumentToSections(
  fullDocumentText: string,
  existingSections: DocumentSection[]
): DocumentSection[] {
  if (!fullDocumentText || !fullDocumentText.trim()) return existingSections;

  // Split by common heading patterns e.g. "Section 1", "Clause 3", "Article IV", "Chapter 2", "## Section"
  const sectionHeaderRegex = /(?:^|\n)(?=(?:#+\s*|)(?:Section|Clause|Article|Chapter|Part|Clause|Page|Requirement|Policy)\s+\d+[a-z0-9\.\-:]*)/gi;
  
  const chunks = fullDocumentText.split(sectionHeaderRegex).map((c) => c.trim()).filter(Boolean);

  if (chunks.length <= 1) {
    // Single block, add as General/Global Document Context
    const updated = [...existingSections];
    const generalIdx = updated.findIndex((s) => s.reference.toLowerCase().includes("general") || s.reference.toLowerCase().includes("global"));
    if (generalIdx >= 0) {
      updated[generalIdx].excerptText = fullDocumentText.trim();
      updated[generalIdx].updatedAt = new Date().toLocaleDateString();
    } else {
      updated.unshift({
        id: `doc_sec_general_${Date.now()}`,
        reference: "General Draft Document Context",
        title: "Full Draft Document / Policy",
        excerptText: fullDocumentText.trim(),
        updatedAt: new Date().toLocaleDateString(),
      });
    }
    return updated;
  }

  const updatedSections = [...existingSections];

  chunks.forEach((chunk) => {
    const firstLineEnd = chunk.indexOf("\n");
    let refTitle = firstLineEnd > -1 ? chunk.substring(0, firstLineEnd).trim() : chunk.substring(0, 50).trim();
    refTitle = refTitle.replace(/^#+\s*/, ""); // Clean markdown headers

    const bodyText = firstLineEnd > -1 ? chunk.substring(firstLineEnd + 1).trim() : chunk.trim();

    const existingIdx = updatedSections.findIndex(
      (s) => s.reference.toLowerCase().trim() === refTitle.toLowerCase().trim()
    );

    if (existingIdx >= 0) {
      updatedSections[existingIdx].excerptText = bodyText;
      updatedSections[existingIdx].updatedAt = new Date().toLocaleDateString();
    } else {
      updatedSections.push({
        id: `doc_sec_parsed_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        reference: refTitle,
        title: refTitle,
        excerptText: bodyText,
        updatedAt: new Date().toLocaleDateString(),
      });
    }
  });

  return updatedSections;
}

/**
 * Ingests a JSON payload adhering to the DocumentExtractionRecord schema
 * (or an array of DocumentExtractionRecord objects).
 * Extracts assertions, assumptions, constraints, facts, expectations, and key data points
 * into structured SupportingDocContextItems and registers the document in the bookshelf library.
 */
export function ingestDocumentExtractionRecordJSON(
  jsonInput: string | object,
  existingDocs: IngestedLibraryDocument[] = [],
  existingItems: SupportingDocContextItem[] = []
): {
  updatedDocs: IngestedLibraryDocument[];
  updatedItems: SupportingDocContextItem[];
  countAdded: number;
} {
  let parsed: any;
  if (typeof jsonInput === "string") {
    try {
      parsed = JSON.parse(jsonInput);
    } catch (err: any) {
      throw new Error(`Invalid JSON format: ${err.message}`);
    }
  } else {
    parsed = jsonInput;
  }

  const rawRecords: DocumentExtractionRecord[] = Array.isArray(parsed) ? parsed : [parsed];

  const updatedDocs = [...existingDocs];
  let updatedItems = [...existingItems];
  let countAdded = 0;

  rawRecords.forEach((rec, recIdx) => {
    // Basic fallback for metadata if missing
    const meta = rec.metadata || {
      fileId: `file_${Date.now()}_${recIdx}`,
      fileName: `Imported_Document_${recIdx + 1}.json`,
      fileType: "JSON",
      fileSizeFormatted: "100 KB",
      totalPages: 1,
      processedAt: new Date().toISOString()
    };

    const docId = `lib_doc_${meta.fileId || Date.now() + "_" + recIdx}`;

    // Filter out if document with same ID or file name already exists in library
    const existingDocIdx = updatedDocs.findIndex(
      (d) => d.id === docId || d.record.metadata?.fileName?.toLowerCase() === meta.fileName?.toLowerCase()
    );

    const extractedFromRec: SupportingDocContextItem[] = [];
    const fname = meta.fileName || "Imported_Doc";

    // Helper to format citation string
    const formatCitationSource = (citInput?: any) => {
      let cit: { pageNumber?: number; sectionHeader?: string } | undefined;
      if (Array.isArray(citInput)) {
        cit = citInput[0];
      } else if (citInput && typeof citInput === "object") {
        cit = citInput;
      }
      let pageStr = cit?.pageNumber ? ` (Page ${cit.pageNumber})` : "";
      if (cit?.sectionHeader) pageStr += ` [${cit.sectionHeader}]`;
      return `${fname}${pageStr}`;
    };

    // 1. Assertions
    if (Array.isArray(rec.assertions)) {
      rec.assertions.forEach((art: any, idx: number) => {
        const source = formatCitationSource(art.citations);
        const content = `${art.statement || ''}${art.assertedBy ? ` [Asserted by: ${art.assertedBy}]` : ""}`;
        if (content.trim()) {
          extractedFromRec.push({
            id: `item_assertion_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
            documentId: docId,
            source,
            flag: "Assertion",
            content,
            isActive: true,
            category: "Assertion",
            citations: Array.isArray(art.citations) ? art.citations : art.citations ? [art.citations] : undefined,
            embedding: getDeterministicPseudoEmbedding(`${source} Assertion ${content}`),
            updatedAt: new Date().toLocaleDateString()
          });
        }
      });
    }

    // 2. Assumptions
    if (Array.isArray(rec.assumptions)) {
      rec.assumptions.forEach((ass: any, idx: number) => {
        const source = formatCitationSource(ass.citations);
        const content = `${ass.statement || ''}${ass.context ? ` [Context: ${ass.context}]` : ""}`;
        if (content.trim()) {
          extractedFromRec.push({
            id: `item_assumption_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
            documentId: docId,
            source,
            flag: "Assumption",
            content,
            isActive: true,
            category: "Assumption",
            citations: Array.isArray(ass.citations) ? ass.citations : ass.citations ? [ass.citations] : undefined,
            embedding: getDeterministicPseudoEmbedding(`${source} Assumption ${content}`),
            updatedAt: new Date().toLocaleDateString()
          });
        }
      });
    }

    // 3. Constraints
    if (Array.isArray(rec.constraints)) {
      rec.constraints.forEach((con: any, idx: number) => {
        const source = formatCitationSource(con.citations);
        const content = `${con.constraint || ''}${con.constraintType ? ` [Type: ${con.constraintType}]` : ""}`;
        if (content.trim()) {
          extractedFromRec.push({
            id: `item_constraint_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
            documentId: docId,
            source,
            flag: "Constraint",
            content,
            isActive: true,
            category: con.constraintType || "Constraint",
            citations: Array.isArray(con.citations) ? con.citations : con.citations ? [con.citations] : undefined,
            embedding: getDeterministicPseudoEmbedding(`${source} Constraint ${content}`),
            updatedAt: new Date().toLocaleDateString()
          });
        }
      });
    }

    // 4. Facts
    if (Array.isArray(rec.facts)) {
      rec.facts.forEach((fact: any, idx: number) => {
        const source = formatCitationSource(fact.citations);
        const content = fact.statement || '';
        if (content.trim()) {
          extractedFromRec.push({
            id: `item_fact_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
            documentId: docId,
            source,
            flag: "Fact",
            content,
            isActive: true,
            category: fact.category || "Fact",
            citations: Array.isArray(fact.citations) ? fact.citations : fact.citations ? [fact.citations] : undefined,
            embedding: getDeterministicPseudoEmbedding(`${source} Fact ${content}`),
            updatedAt: new Date().toLocaleDateString()
          });
        }
      });
    }

    // 5. Expectations
    if (Array.isArray(rec.expectations)) {
      rec.expectations.forEach((exp: any, idx: number) => {
        const source = formatCitationSource(exp.citations);
        const content = `${exp.outcome || ''}${exp.targetTimeline ? ` [Timeline: ${exp.targetTimeline}]` : ""}`;
        if (content.trim()) {
          extractedFromRec.push({
            id: `item_expectation_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
            documentId: docId,
            source,
            flag: "Expectation",
            content,
            isActive: true,
            category: "Expectation",
            citations: Array.isArray(exp.citations) ? exp.citations : exp.citations ? [exp.citations] : undefined,
            embedding: getDeterministicPseudoEmbedding(`${source} Expectation ${content}`),
            updatedAt: new Date().toLocaleDateString()
          });
        }
      });
    }

    // 6. Key Data Points
    if (Array.isArray(rec.keyDataPoints)) {
      rec.keyDataPoints.forEach((dp: any, idx: number) => {
        const source = formatCitationSource(dp.citation || dp.citations);
        const content = `${dp.metric || 'Metric'}: ${dp.value || ''}${dp.unit ? ` ${dp.unit}` : ""}${dp.context ? ` (${dp.context})` : ""}`;
        if (content.trim()) {
          extractedFromRec.push({
            id: `item_datapoint_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
            documentId: docId,
            source,
            flag: "DataPoint",
            content,
            isActive: true,
            category: "DataPoint",
            citations: Array.isArray(dp.citation) ? dp.citation : dp.citation ? [dp.citation] : Array.isArray(dp.citations) ? dp.citations : undefined,
            embedding: getDeterministicPseudoEmbedding(`${source} DataPoint ${content}`),
            updatedAt: new Date().toLocaleDateString()
          });
        }
      });
    }

    // 7. Main Themes (if present in extraction schema)
    if (Array.isArray(rec.mainThemes)) {
      rec.mainThemes.forEach((theme: any, idx: number) => {
        const source = formatCitationSource(theme.citations);
        const content = `${theme.title || 'Theme'}: ${theme.summary || ''}${
          Array.isArray(theme.keyTakeaways) && theme.keyTakeaways.length > 0
            ? ` [Takeaways: ${theme.keyTakeaways.join('; ')}]`
            : ''
        }`;
        if (content.trim()) {
          extractedFromRec.push({
            id: `item_theme_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
            documentId: docId,
            source,
            flag: "Assertion",
            content,
            isActive: true,
            category: "Theme",
            citations: Array.isArray(theme.citations) ? theme.citations : theme.citations ? [theme.citations] : undefined,
            embedding: getDeterministicPseudoEmbedding(`${source} Theme ${content}`),
            updatedAt: new Date().toLocaleDateString()
          });
        }
      });
    }

    const libDoc: IngestedLibraryDocument = {
      id: docId,
      record: rec,
      ingestedAt: new Date().toLocaleDateString(),
      isActive: true,
      extractedItemCount: extractedFromRec.length
    };

    if (existingDocIdx >= 0) {
      updatedDocs[existingDocIdx] = libDoc;
      const filteredOldItems = updatedItems.filter((i) => i.documentId !== docId);
      updatedItems = [...filteredOldItems, ...extractedFromRec];
    } else {
      updatedDocs.push(libDoc);
      updatedItems = updatedItems.concat(extractedFromRec);
    }

    countAdded += extractedFromRec.length;
  });

  return { updatedDocs, updatedItems, countAdded };
}

/**
 * Performs vector embedding similarity search across active supporting documentation context items
 * (Assertions, Assumptions, Constraints, Facts, Expectations) to retrieve top RAG matches for AI calls.
 */
export function getRelevantSupportingDocsForPrompt(
  queryInput: string | number[] | CommentItem[],
  supportingItems: SupportingDocContextItem[],
  topK: number = 6
): SupportingDocContextItem[] {
  const activeItems = supportingItems.filter((item) => item.isActive !== false);
  if (activeItems.length === 0) return [];

  // Determine query embedding vector
  let queryVec: number[] = [];
  if (Array.isArray(queryInput)) {
    if (queryInput.length > 0 && typeof queryInput[0] === "number") {
      queryVec = queryInput as number[];
    } else if (queryInput.length > 0 && typeof queryInput[0] === "object") {
      // Array of CommentItems - combine text
      const combinedText = (queryInput as CommentItem[])
        .map((c) => `${c.topic} ${c.text}`)
        .join(" ");
      queryVec = getDeterministicPseudoEmbedding(combinedText);
    }
  } else if (typeof queryInput === "string") {
    queryVec = getDeterministicPseudoEmbedding(queryInput);
  }

  if (queryVec.length === 0) {
    return activeItems.slice(0, topK);
  }

  // Calculate similarity for each active item
  const scored = activeItems.map((item) => {
    const itemVec = item.embedding || getDeterministicPseudoEmbedding(`${item.source} ${item.flag} ${item.content}`);
    const similarity = calculateCosineSimilarity(queryVec, itemVec);
    return { item, similarity };
  });

  // Sort descending by similarity score
  scored.sort((a, b) => b.similarity - a.similarity);

  // Return top K items
  return scored.slice(0, topK).map((s) => s.item);
}

/**
 * Builds a prompt block containing RAG-matched supporting documentation context items
 * with instructions for the LLM to cite sources, point out user misinterpretations, or highlight document constraints.
 */
export function buildSupportingDocsRAGPromptBlock(
  queryInput: string | number[] | CommentItem[],
  supportingItems: SupportingDocContextItem[] = [],
  topK: number = 6
): string {
  const matched = getRelevantSupportingDocsForPrompt(queryInput, supportingItems, topK);
  if (matched.length === 0) return "";

  return `\n--- SUPPLEMENTAL DOCUMENTATION & CONSTRAINTS (RAG CONTEXT) ---
The following supporting documentation assertions, assumptions, and constraints were matched via vector similarity to the prompt/feedback being evaluated:

${matched
  .map(
    (item, i) =>
      `${i + 1}. [SOURCE: "${item.source}" | FLAG: ${item.flag.toUpperCase()}]\n   Content: "${item.content}"`
  )
  .join("\n\n")}

CRITICAL AI INSTRUCTIONS REGARDING SUPPLEMENTAL DOCUMENTATION:
Where any of the above supplemental documentation items, assertions, assumptions, or constraints are relevant:
1. Clearly reference the specific document Source and Flag in your analysis (e.g. [Source: ${matched[0]?.source || "Doc.pdf"} | ${matched[0]?.flag || "Constraint"}]).
2. Explicitly highlight if a user feedback item relies on or references a document but is INCORRECT in its interpretation.
3. Explicitly highlight if a document constraint LIMITS or ENABLES the potential to address a comment, feature request, or operational action.\n`;
}

/**
 * Builds a structured markdown context block containing mapped Stakeholder Profiles, Bios, Red Lines, and Expectations.
 * Provides explicit instructions for LLM synthesis engines to weigh stakeholder influence and respect non-negotiables.
 */
export function buildStakeholderContextPromptBlock(
  stakeholderMappings: Record<string, StakeholderMapping> = {}
): string {
  const mappingsList = Object.values(stakeholderMappings).filter(
    (m) => m && m.organizationName && m.organizationName.trim().length > 0
  );

  if (mappingsList.length === 0) return "";

  const itemsFormatted = mappingsList.map((m, i) => {
    const qInfo = getQuadrantInfo(m.influence, m.interest);
    const parts: string[] = [];
    parts.push(`ORGANIZATION #${i + 1}: "${m.organizationName}" (${qInfo.shortLabel} • Priority Weight: ${qInfo.priorityWeight}x)`);
    parts.push(`  - Power & Interest: Influence ${m.influence}/5 | Interest ${m.interest}/5`);
    if (m.bio && m.bio.trim()) {
      parts.push(`  - 📝 STAKEHOLDER BIO & STRATEGIC CONTEXT: "${m.bio.trim()}"`);
    }
    if (m.redLines && m.redLines.trim()) {
      parts.push(`  - ⚠️ RED LINES & NON-NEGOTIABLE BOUNDARIES: "${m.redLines.trim()}"`);
    }
    if (m.expectations && m.expectations.trim()) {
      parts.push(`  - 🎯 KEY EXPECTATIONS & DEMANDS: "${m.expectations.trim()}"`);
    }
    if (m.notes && m.notes.trim()) {
      parts.push(`  - 📌 Strategic Account Notes: "${m.notes.trim()}"`);
    }
    return parts.join("\n");
  });

  return `\n--- STAKEHOLDER PROFILES, BIOS & RED LINES CONTEXT ---
The following strategic stakeholder profiles, background bios, non-negotiable red lines, and expectations have been mapped for participating organizations:

${itemsFormatted.join("\n\n")}

CRITICAL AI INSTRUCTIONS REGARDING STAKEHOLDER CONTEXTS & RED LINES:
1. STAKEHOLDER BIO AWARENESS: Thoroughly evaluate stakeholder feedback through the lens of their defined Bio, organizational role, background, and strategic priorities.
2. RED LINES & NON-NEGOTIABLES: Explicitly cross-reference all proposed actions, policy recommendations, or comment responses against defined Stakeholder Red Lines. Flag any dealbreakers or non-negotiable friction points as high priority risks.
3. EXPECTATIONS ALIGNMENT: Ensure synthesis recommendations and proposed responses explicitly address defined Stakeholder Expectations and demands.
4. PRIORITY WEIGHTING: Weigh feedback from Key Players and High Influence stakeholders proportionally higher according to their assigned Priority Weights.\n`;
}
