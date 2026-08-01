import { CommentItem } from "../types";

// Base templates to construct a diverse, realistic dataset
const FEEDBACK_TEMPLATES = [
  // UI / UX (Clusters around x: 0.6, y: -0.4)
  {
    text: "The new navigation layout is a huge step backward. So hard to find basic settings.",
    sentiment: "negative" as const,
    topic: "UI/UX & Layout",
    centerX: 0.55,
    centerY: -0.35,
  },
  {
    text: "Really loving the modern dark theme, very eye-strain friendly for night work!",
    sentiment: "positive" as const,
    topic: "UI/UX & Layout",
    centerX: 0.6,
    centerY: -0.45,
  },
  {
    text: "The typography in the dashboard is gorgeous, incredibly clean and legible.",
    sentiment: "positive" as const,
    topic: "UI/UX & Layout",
    centerX: 0.65,
    centerY: -0.4,
  },
  {
    text: "Buttons on the mobile interface are far too small. Kept tapping the wrong button.",
    sentiment: "negative" as const,
    topic: "UI/UX & Layout",
    centerX: 0.5,
    centerY: -0.3,
  },
  {
    text: "Clean, minimalist user interface. No unnecessary clutter. Just what I needed.",
    sentiment: "positive" as const,
    topic: "UI/UX & Layout",
    centerX: 0.62,
    centerY: -0.42,
  },

  // Performance & Loading (Clusters around x: -0.5, y: 0.5)
  {
    text: "Takes ages to load the main dashboard, definitely slower than the previous version.",
    sentiment: "negative" as const,
    topic: "Performance & Speed",
    centerX: -0.45,
    centerY: 0.55,
  },
  {
    text: "Search queries are extremely fast now. Instant results even on massive text lists.",
    sentiment: "positive" as const,
    topic: "Performance & Speed",
    centerX: -0.55,
    centerY: 0.45,
  },
  {
    text: "The rendering lag when scrolling through 500 rows is unbearable on Safari.",
    sentiment: "negative" as const,
    topic: "Performance & Speed",
    centerX: -0.5,
    centerY: 0.5,
  },
  {
    text: "RAM usage spike is huge during imports. My browser froze completely twice.",
    sentiment: "negative" as const,
    topic: "Performance & Speed",
    centerX: -0.42,
    centerY: 0.58,
  },
  {
    text: "Incredibly snappy on desktop! Smooth transitions and zero lag during operations.",
    sentiment: "positive" as const,
    topic: "Performance & Speed",
    centerX: -0.58,
    centerY: 0.42,
  },

  // Bugs & Crashes (Clusters around x: -0.6, y: -0.5)
  {
    text: "The application crashes every single time I try to open the PDF reports menu on iOS.",
    sentiment: "negative" as const,
    topic: "Bugs & Crashes",
    centerX: -0.55,
    centerY: -0.55,
  },
  {
    text: "Constant 504 Gateway Timeout error when trying to synchronize with my external calendar.",
    sentiment: "negative" as const,
    topic: "Bugs & Crashes",
    centerX: -0.65,
    centerY: -0.45,
  },
  {
    text: "Saved filters do not persist after refreshing the page, have to re-enter them every session.",
    sentiment: "negative" as const,
    topic: "Bugs & Crashes",
    centerX: -0.58,
    centerY: -0.52,
  },
  {
    text: "File upload drops silently on larger uploads without any helpful error message.",
    sentiment: "negative" as const,
    topic: "Bugs & Crashes",
    centerX: -0.62,
    centerY: -0.48,
  },

  // Pricing & Value (Clusters around x: 0.1, y: 0.7)
  {
    text: "Too expensive for individual developers. Please bring back the basic cheaper tier.",
    sentiment: "negative" as const,
    topic: "Pricing & Value",
    centerX: 0.05,
    centerY: 0.68,
  },
  {
    text: "The automated report summary feature alone saves me 5 hours a week. Exceptional value.",
    sentiment: "positive" as const,
    topic: "Pricing & Value",
    centerX: 0.15,
    centerY: 0.72,
  },
  {
    text: "Price increased by 30% without any advanced notice. Very disappointed with this decision.",
    sentiment: "negative" as const,
    topic: "Pricing & Value",
    centerX: 0.1,
    centerY: 0.65,
  },
  {
    text: "Excellent bang for the buck. The team productivity gains have easily justified the expense.",
    sentiment: "positive" as const,
    topic: "Pricing & Value",
    centerX: 0.12,
    centerY: 0.75,
  },
  {
    text: "A bit pricey but the uptime and support quality make it worth every single dollar.",
    sentiment: "positive" as const,
    topic: "Pricing & Value",
    centerX: 0.08,
    centerY: 0.7,
  },

  // Features & Integrations (Clusters around x: 0.7, y: 0.5)
  {
    text: "Really need a direct integration with Slack and Microsoft Teams to push alerts.",
    sentiment: "neutral" as const,
    topic: "Features & Requests",
    centerX: 0.68,
    centerY: 0.48,
  },
  {
    text: "The multi-user collaborative board works flawlessly. Everyone can brainstorm in real time.",
    sentiment: "positive" as const,
    topic: "Features & Requests",
    centerX: 0.75,
    centerY: 0.55,
  },
  {
    text: "Please add a CSV export option in addition to the standard JSON download.",
    sentiment: "neutral" as const,
    topic: "Features & Requests",
    centerX: 0.72,
    centerY: 0.45,
  },
  {
    text: "Integrates perfectly with Salesforce. Saved our CRM administrators a massive headache.",
    sentiment: "positive" as const,
    topic: "Features & Requests",
    centerX: 0.7,
    centerY: 0.52,
  },
  {
    text: "I wish there was a voice transcription memo feature built into the feedback input.",
    sentiment: "neutral" as const,
    topic: "Features & Requests",
    centerX: 0.65,
    centerY: 0.42,
  }
];

// Deterministic lexical vector fallback to enable instant client-side calculations
function getDeterministicPseudoEmbedding(text: string): number[] {
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
  
  vector[0] = text.length / 500.0;
  
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

// Helper to add minor random coordinate offset
function perturb(val: number, range: number = 0.06): number {
  return val + (Math.random() - 0.5) * range;
}

// Generate a rich, large initial comments list
export function generateDefaultDataset(): CommentItem[] {
  const list: CommentItem[] = [];
  let idCounter = 1;

  const orgs = ["Acme Corp", "Stark Industries", "Wayne Enterprises", "Globex Corp", "Initech", "Umbrella Corp", "Hooli", "Soylent Corp", "Tyrell Corp", "Oscorp"];

  // 1. Generate core diverse comments from templates (repeating to build a robust volume)
  for (let i = 0; i < 3; i++) {
    for (const temp of FEEDBACK_TEMPLATES) {
      const id = `rec_${idCounter++}`;
      const suffix = i === 1 ? " (Verified User)" : i === 2 ? " - Hope this gets fixed soon." : "";
      const text = `${temp.text}${suffix}`;
      const timestamp = new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const tier = Math.random() > 0.4 ? (Math.random() > 0.5 ? "Enterprise" : "Professional") : "Developer Basic";
      const channel = Math.random() > 0.6 ? "Intercom Chat" : (Math.random() > 0.4 ? "Zendesk Ticket" : "App Store Review");
      const userId = `usr_${1000 + Math.floor(Math.random() * 9000)}`;
      const orgName = Math.random() > 0.25 ? orgs[Math.floor(Math.random() * orgs.length)] : "";

      list.push({
        id,
        text,
        sentiment: temp.sentiment,
        topic: temp.topic,
        embedding: getDeterministicPseudoEmbedding(text),
        x: perturb(temp.centerX),
        y: perturb(temp.centerY),
        isArchived: false,
        timestamp,
        csvRowIndex: idCounter - 1,
        originalId: id,
        organizationName: orgName || undefined,
        originalRowData: {
          "ID": id,
          "Row ID": String(idCounter - 1),
          "User ID": userId,
          "User Plan": tier,
          "Feedback Channel": channel,
          "Priority": temp.sentiment === "negative" ? "High" : "Normal",
          "Comment Text": text,
          "Date Received": timestamp,
          "Organization Name": orgName
        }
      });
    }
  }

  // 2. Add explicit exact duplicates & near-duplicates for demonstrating cleanup flows!
  const duplicatePairs = [
    {
      originalId: "rec_6", // Slower dashboard performance
      dupText: "Takes ages to load the main dashboard, definitely slower than the previous version.",
      sentiment: "negative" as const,
      topic: "Performance & Speed",
      x: -0.45,
      y: 0.55
    },
    {
      originalId: "rec_11", // PDF crash iOS
      dupText: "The application crashes every single time I try to open the PDF reports menu on iOS.",
      sentiment: "negative" as const,
      topic: "Bugs & Crashes",
      x: -0.55,
      y: -0.55
    },
    {
      originalId: "rec_15", // Slack integration request
      dupText: "We really need a direct integration with Slack and MS Teams to push live alerts.",
      sentiment: "neutral" as const,
      topic: "Features & Requests",
      x: 0.68,
      y: 0.48
    },
    {
      originalId: "rec_16", // Pricing tier cheaper
      dupText: "Too expensive for individual developers. Please bring back the basic cheaper tier.",
      sentiment: "negative" as const,
      topic: "Pricing & Value",
      x: 0.05,
      y: 0.68
    }
  ];

  for (const dup of duplicatePairs) {
    const id = `dup_${idCounter++}`;
    const timestamp = new Date().toISOString().split('T')[0];
    const userId = `usr_${1000 + Math.floor(Math.random() * 9000)}`;
    const channel = "App Store Review";
    const tier = "Developer Basic";

    // Link duplicate organization to its corresponding original's organization if possible, or randomize
    const originalNode = list.find(l => l.id === dup.originalId);
    const orgName = originalNode?.organizationName || (Math.random() > 0.25 ? orgs[Math.floor(Math.random() * orgs.length)] : "");

    list.push({
      id,
      text: dup.dupText,
      sentiment: dup.sentiment,
      topic: dup.topic,
      embedding: getDeterministicPseudoEmbedding(dup.dupText),
      x: perturb(dup.x, 0.02), // Very close to the original
      y: perturb(dup.y, 0.02),
      isDuplicate: true,
      duplicateOfId: dup.originalId,
      similarityScore: 0.98,
      isArchived: false,
      timestamp,
      csvRowIndex: idCounter - 1,
      originalId: id,
      organizationName: orgName || undefined,
      originalRowData: {
        "ID": id,
        "Row ID": String(idCounter - 1),
        "User ID": userId,
        "User Plan": tier,
        "Feedback Channel": channel,
        "Priority": dup.sentiment === "negative" ? "High" : "Normal",
        "Comment Text": dup.dupText,
        "Date Received": timestamp,
        "Organization Name": orgName
      }
    });
  }

  // Define original links for the duplicates
  for (const item of list) {
    const dupRef = duplicatePairs.find(d => d.dupText === item.text && item.id.startsWith("rec_"));
    if (dupRef) {
      // Find the actual generated dup to link
      const correspondingDup = list.find(l => l.duplicateOfId === item.id);
      if (correspondingDup) {
        item.isDuplicate = false; // Original is not a duplicate itself
      }
    }
  }

  return list;
}
