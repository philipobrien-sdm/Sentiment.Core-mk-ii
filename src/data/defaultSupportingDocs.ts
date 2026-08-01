import { DocumentExtractionRecord, IngestedLibraryDocument, SupportingDocContextItem } from "../types";
import { getDeterministicPseudoEmbedding } from "../utils/localLlm";

export const DEFAULT_EXTRACTION_RECORDS: DocumentExtractionRecord[] = [
  {
    metadata: {
      fileId: "doc_sec_2026_01",
      fileName: "CyberSecurity_Compliance_Standard_V2.pdf",
      fileType: "PDF",
      fileSizeFormatted: "2.8 MB",
      totalPages: 16,
      hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      processedAt: "2026-07-20T10:15:00Z"
    },
    executiveSummary: "Establishes mandatory security compliance protocols for session tokens, database encryption, multi-factor authentication, and maximum system maintenance windows.",
    documentSections: [
      { id: "sec_1", heading: "Section 3.1: Session Management & Expiration", pageNumber: 4, summary: "Details session timeouts and token refresh limits." },
      { id: "sec_2", heading: "Section 5.2: Data Isolation & Encryption", pageNumber: 8, summary: "AES-256 requirement across all storage volumes." }
    ],
    mainThemes: [
      {
        id: "theme_1",
        title: "Strict Identity & Access Governance",
        summary: "Zero-trust session lifecycle enforcement across all connected client interfaces.",
        keyTakeaways: [
          "Session tokens must strictly invalidate after 15 minutes of inactivity.",
          "MFA bypass is prohibited for administrator endpoints."
        ]
      }
    ],
    keyDataPoints: [
      {
        id: "dp_1",
        metric: "Session Inactivity Limit",
        value: "15 minutes",
        unit: "minutes",
        context: "Automatic token revocation threshold for non-MFA sessions",
        citation: { pageNumber: 4, snippet: "Tokens invalidate after 15 minutes of idle time." }
      },
      {
        id: "dp_2",
        metric: "Target Availability SLA",
        value: "99.95%",
        unit: "percent",
        context: "Guaranteed uptime for core API endpoints",
        citation: { pageNumber: 12, snippet: "SLA committed at 99.95% annual uptime." }
      }
    ],
    facts: [
      {
        id: "fact_1",
        statement: "The current system infrastructure resides in multi-region compliant cloud nodes.",
        category: "Infrastructure",
        citations: [{ pageNumber: 2, snippet: "Infrastructure hosted across multi-region nodes." }]
      }
    ],
    assumptions: [
      {
        id: "ass_1",
        statement: "Assumes client browsers support modern WebAssembly and standard ES2022 modules.",
        context: "Client runtime compatibility requirement",
        citations: [{ pageNumber: 5, snippet: "Modern browser support assumed for client execution." }]
      }
    ],
    assertions: [
      {
        id: "art_1",
        statement: "The automated backup pipeline guarantees zero-loss failover within 5 minutes of catastrophic failure.",
        assertedBy: "Chief Information Security Officer (CISO)",
        citations: [{ pageNumber: 9, snippet: "Guaranteed 5-minute RTO during regional outage." }]
      }
    ],
    expectations: [
      {
        id: "exp_1",
        outcome: "Achieve complete SOC-2 Type II certification by Q4 2026.",
        targetTimeline: "Q4 2026",
        citations: [{ pageNumber: 14, snippet: "Target SOC-2 Type II audit completion date." }]
      }
    ],
    constraints: [
      {
        id: "con_1",
        constraint: "Maximum allowable maintenance window downtime is strictly limited to 15 minutes per month between 02:00 AM and 04:00 AM UTC.",
        constraintType: "operational",
        citations: [{ pageNumber: 6, snippet: "Maintenance window capped at 15 minutes monthly." }]
      },
      {
        id: "con_2",
        constraint: "Third-party API key storage in client-side code is prohibited under security compliance guidelines.",
        constraintType: "security",
        citations: [{ pageNumber: 7, snippet: "Client-side secret exposure violates security policy." }]
      }
    ]
  },
  {
    metadata: {
      fileId: "doc_fin_2026_02",
      fileName: "Fiscal_Budget_Allocation_Directive_2026.docx",
      fileType: "DOCX",
      fileSizeFormatted: "1.4 MB",
      totalPages: 10,
      hash: "4f9b8c3d1e2a5f6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
      processedAt: "2026-07-22T14:30:00Z"
    },
    executiveSummary: "Outlines financial constraints, cloud spending limits, pricing tier caps, and resource allocation models for developer tooling.",
    documentSections: [
      { id: "sec_fin_1", heading: "Clause 2.1: Cloud Infrastructure Cap", pageNumber: 3, summary: "Monthly spending thresholds for server hosting." },
      { id: "sec_fin_2", heading: "Clause 4.3: Tier Pricing Contract Limits", pageNumber: 7, summary: "Restrictions on subscription price modifications." }
    ],
    mainThemes: [
      {
        id: "theme_fin_1",
        title: "Cost Governance & Value Protection",
        summary: "Ensuring individual developer tier affordability while capping cloud infrastructure expenses.",
        keyTakeaways: [
          "Developer Basic tier pricing remains locked until Q1 2027.",
          "Monthly infrastructure expenditure strictly capped at $15,000."
        ]
      }
    ],
    keyDataPoints: [
      {
        id: "dp_fin_1",
        metric: "Monthly Infrastructure Cap",
        value: "$15,000",
        unit: "USD",
        context: "Total cloud compute and storage spending limit",
        citation: { pageNumber: 3, snippet: "Monthly cloud spending shall not exceed $15,000." }
      }
    ],
    facts: [
      {
        id: "fact_fin_1",
        statement: "Developer tier subscriptions account for 45% of total user feedback submissions.",
        category: "Analytics",
        citations: [{ pageNumber: 2, snippet: "45% of total volume originates from developer tier users." }]
      }
    ],
    assumptions: [
      {
        id: "ass_fin_1",
        statement: "Assumes 20% year-over-year increase in active enterprise seats without requiring hardware upgrades.",
        context: "Capacity planning assumption",
        citations: [{ pageNumber: 5, snippet: "Assumes 20% annual user growth within current capacity." }]
      }
    ],
    assertions: [
      {
        id: "art_fin_1",
        statement: "The automated executive summary feature saves development leads an average of 5 hours per week.",
        assertedBy: "VP of Product Strategy",
        citations: [{ pageNumber: 6, snippet: "Saves 5 engineering lead hours per week." }]
      }
    ],
    expectations: [
      {
        id: "exp_fin_1",
        outcome: "Maintain gross margin above 75% throughout the 2026 fiscal year.",
        targetTimeline: "FY 2026",
        citations: [{ pageNumber: 9, snippet: "Target gross margin set to 75% minimum." }]
      }
    ],
    constraints: [
      {
        id: "con_fin_1",
        constraint: "Unannounced price increases on the Developer Basic tier are prohibited by active customer agreements until Q1 2027.",
        constraintType: "regulatory",
        citations: [{ pageNumber: 7, snippet: "Price adjustments locked until Q1 2027." }]
      },
      {
        id: "con_fin_2",
        constraint: "Total monthly cloud server infrastructure spending must not exceed $15,000 USD.",
        constraintType: "financial",
        citations: [{ pageNumber: 3, snippet: "Cloud budget capped at $15k per month." }]
      }
    ]
  }
];

export function generateDefaultSupportingDocs(): {
  documents: IngestedLibraryDocument[];
  items: SupportingDocContextItem[];
} {
  const documents: IngestedLibraryDocument[] = DEFAULT_EXTRACTION_RECORDS.map((rec) => ({
    id: `lib_doc_${rec.metadata.fileId}`,
    record: rec,
    ingestedAt: new Date(rec.metadata.processedAt).toLocaleDateString(),
    isActive: true,
    extractedItemCount:
      (rec.assertions?.length || 0) +
      (rec.assumptions?.length || 0) +
      (rec.constraints?.length || 0) +
      (rec.facts?.length || 0) +
      (rec.expectations?.length || 0) +
      (rec.keyDataPoints?.length || 0)
  }));

  const items: SupportingDocContextItem[] = [];

  DEFAULT_EXTRACTION_RECORDS.forEach((rec) => {
    const docId = `lib_doc_${rec.metadata.fileId}`;
    const fname = rec.metadata.fileName;

    // 1. Assertions
    rec.assertions?.forEach((art) => {
      const pageStr = art.citations?.[0]?.pageNumber ? ` (Page ${art.citations[0].pageNumber})` : "";
      const content = art.statement + (art.assertedBy ? ` [Asserted by: ${art.assertedBy}]` : "");
      items.push({
        id: `item_${art.id}`,
        documentId: docId,
        source: `${fname}${pageStr}`,
        flag: "Assertion",
        content,
        isActive: true,
        category: "Assertion",
        citations: art.citations,
        embedding: getDeterministicPseudoEmbedding(`${fname} Assertion ${content}`)
      });
    });

    // 2. Assumptions
    rec.assumptions?.forEach((ass) => {
      const pageStr = ass.citations?.[0]?.pageNumber ? ` (Page ${ass.citations[0].pageNumber})` : "";
      const content = ass.statement + (ass.context ? ` [Context: ${ass.context}]` : "");
      items.push({
        id: `item_${ass.id}`,
        documentId: docId,
        source: `${fname}${pageStr}`,
        flag: "Assumption",
        content,
        isActive: true,
        category: "Assumption",
        citations: ass.citations,
        embedding: getDeterministicPseudoEmbedding(`${fname} Assumption ${content}`)
      });
    });

    // 3. Constraints
    rec.constraints?.forEach((con) => {
      const pageStr = con.citations?.[0]?.pageNumber ? ` (Page ${con.citations[0].pageNumber})` : "";
      const content = con.constraint + (con.constraintType ? ` [Type: ${con.constraintType}]` : "");
      items.push({
        id: `item_${con.id}`,
        documentId: docId,
        source: `${fname}${pageStr}`,
        flag: "Constraint",
        content,
        isActive: true,
        category: con.constraintType || "Constraint",
        citations: con.citations,
        embedding: getDeterministicPseudoEmbedding(`${fname} Constraint ${content}`)
      });
    });

    // 4. Facts
    rec.facts?.forEach((fact) => {
      const pageStr = fact.citations?.[0]?.pageNumber ? ` (Page ${fact.citations[0].pageNumber})` : "";
      items.push({
        id: `item_${fact.id}`,
        documentId: docId,
        source: `${fname}${pageStr}`,
        flag: "Fact",
        content: fact.statement,
        isActive: true,
        category: fact.category || "Fact",
        citations: fact.citations,
        embedding: getDeterministicPseudoEmbedding(`${fname} Fact ${fact.statement}`)
      });
    });

    // 5. Expectations
    rec.expectations?.forEach((exp) => {
      const pageStr = exp.citations?.[0]?.pageNumber ? ` (Page ${exp.citations[0].pageNumber})` : "";
      const content = exp.outcome + (exp.targetTimeline ? ` [Timeline: ${exp.targetTimeline}]` : "");
      items.push({
        id: `item_${exp.id}`,
        documentId: docId,
        source: `${fname}${pageStr}`,
        flag: "Expectation",
        content,
        isActive: true,
        category: "Expectation",
        citations: exp.citations,
        embedding: getDeterministicPseudoEmbedding(`${fname} Expectation ${content}`)
      });
    });

    // 6. Key Data Points
    rec.keyDataPoints?.forEach((dp) => {
      const pageStr = dp.citation?.pageNumber ? ` (Page ${dp.citation.pageNumber})` : "";
      const content = `${dp.metric}: ${dp.value}${dp.unit ? ` ${dp.unit}` : ""}${dp.context ? ` (${dp.context})` : ""}`;
      items.push({
        id: `item_${dp.id}`,
        documentId: docId,
        source: `${fname}${pageStr}`,
        flag: "DataPoint",
        content,
        isActive: true,
        category: "DataPoint",
        citations: dp.citation ? [dp.citation] : undefined,
        embedding: getDeterministicPseudoEmbedding(`${fname} DataPoint ${content}`)
      });
    });
  });

  return { documents, items };
}
