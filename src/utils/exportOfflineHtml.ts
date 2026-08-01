import { CommentItem, StakeholderMapping, getQuadrantInfo, StakeholderQuadrant } from "../types";

export interface SavedSynthesis {
  id: string;
  title: string;
  markdown: string;
  timestamp: string;
  source?: string;
}

export interface OfflineExportData {
  comments: CommentItem[];
  stakeholderMappings: Record<string, StakeholderMapping>;
  executiveSummary: string | null;
  synthesisHistory: SavedSynthesis[];
  similarityThreshold: number;
}

// Escapes special HTML characters
function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Lightweight Markdown to HTML renderer for standalone HTML file
function renderMarkdownToHtml(md: string): string {
  if (!md) return '<div style="color: #888; font-style: italic; padding: 20px;">No report content available.</div>';

  let lines = md.split("\n");
  let inTable = false;
  let tableHeaderParsed = false;
  let htmlLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Tables
    if (line.startsWith("|") && line.endsWith("|")) {
      if (!inTable) {
        inTable = true;
        tableHeaderParsed = false;
        htmlLines.push('<div style="overflow-x: auto; margin: 16px 0;"><table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; background: #fff; border: 1px solid #E5E3DF;">');
      }

      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      // Check if separator line
      if (cells.every(c => /^[:\-\s]+$/.test(c))) {
        tableHeaderParsed = true;
        continue;
      }

      if (!tableHeaderParsed) {
        htmlLines.push('<thead style="background: #1A1A1A; color: #fff;"><tr>');
        cells.forEach(cell => {
          htmlLines.push(`<th style="padding: 8px 12px; border: 1px solid #333; font-weight: bold;">${parseInlineMarkdown(cell)}</th>`);
        });
        htmlLines.push('</tr></thead><tbody>');
      } else {
        htmlLines.push('<tr style="border-bottom: 1px solid #E5E3DF;">');
        cells.forEach(cell => {
          htmlLines.push(`<td style="padding: 8px 12px; border: 1px solid #E5E3DF;">${parseInlineMarkdown(cell)}</td>`);
        });
        htmlLines.push('</tr>');
      }
      continue;
    } else if (inTable) {
      inTable = false;
      htmlLines.push('</tbody></table></div>');
    }

    // Headers
    if (line.startsWith("# ")) {
      htmlLines.push(`<h1 style="font-family: Georgia, serif; font-style: italic; font-size: 22px; color: #1A1A1A; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #D97706; padding-bottom: 6px;">${parseInlineMarkdown(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      htmlLines.push(`<h2 style="font-size: 17px; font-weight: bold; color: #2D1B0D; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #E5E3DF; padding-bottom: 4px;">${parseInlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      htmlLines.push(`<h3 style="font-size: 14px; font-weight: bold; color: #4A6741; margin-top: 16px; margin-bottom: 8px;">${parseInlineMarkdown(line.slice(4))}</h3>`);
    } else if (line.startsWith("---")) {
      htmlLines.push('<hr style="border: none; border-top: 1px solid #E5E3DF; margin: 20px 0;" />');
    } else if (line.startsWith("> ")) {
      htmlLines.push(`<blockquote style="border-left: 4px solid #D97706; background: #FFFBEB; padding: 10px 14px; margin: 12px 0; font-style: italic; color: #78350F; font-size: 13px;">${parseInlineMarkdown(line.slice(2))}</blockquote>`);
    } else if (line.startsWith("- ")) {
      htmlLines.push(`<li style="margin-left: 20px; list-style-type: disc; margin-bottom: 4px; font-size: 13px; color: #2C2C2C;">${parseInlineMarkdown(line.slice(2))}</li>`);
    } else if (line.length > 0) {
      htmlLines.push(`<p style="font-size: 13px; line-height: 1.6; color: #2C2C2C; margin-bottom: 12px;">${parseInlineMarkdown(line)}</p>`);
    }
  }

  if (inTable) {
    htmlLines.push('</tbody></table></div>');
  }

  return htmlLines.join("\n");
}

function parseInlineMarkdown(text: string): string {
  let escaped = escapeHtml(text);
  // Bold
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Inline code
  escaped = escaped.replace(/`(.*?)`/g, '<code style="background: #F3F4F6; padding: 2px 4px; font-family: monospace; font-size: 11px; border-radius: 2px; color: #111827;">$1</code>');
  return escaped;
}

export function generateSelfContainedOfflineHtml(data: OfflineExportData): string {
  const { comments, stakeholderMappings, executiveSummary, synthesisHistory, similarityThreshold } = data;

  const exportTimestamp = new Date().toLocaleString();
  const totalComments = comments.length;

  // Group by topic
  const topicGroups: Record<string, CommentItem[]> = {};
  comments.forEach(c => {
    const t = c.topic || "Unassigned Feedback";
    if (!topicGroups[t]) topicGroups[t] = [];
    topicGroups[t].push(c);
  });

  const uniqueTopics = Object.keys(topicGroups).sort();

  // Organizations mapped
  const orgNames = Object.keys(stakeholderMappings).sort();

  // Quantify sentiment breakdown
  const positiveCount = comments.filter(c => c.sentiment === "positive").length;
  const neutralCount = comments.filter(c => c.sentiment === "neutral").length;
  const negativeCount = comments.filter(c => c.sentiment === "negative").length;

  // Render Quadrant Cards
  const quadrantOrgs: Record<StakeholderQuadrant, { name: string; mapping: StakeholderMapping; count: number }[]> = {
    key_players: [],
    keep_satisfied: [],
    keep_informed: [],
    monitor: []
  };

  // Group comments by org
  const orgCommentCounts: Record<string, number> = {};
  comments.forEach(c => {
    const org = c.organizationName?.trim();
    if (org) {
      orgCommentCounts[org] = (orgCommentCounts[org] || 0) + 1;
    }
  });

  // Categorize synthesis reports for hub layout
  const isStakeholderReport = (s: SavedSynthesis): boolean => {
    const src = (s.source || "").toLowerCase();
    const title = (s.title || "").toLowerCase();
    return src === "organization" || src === "stakeholder_meta" || src.startsWith("organization:") ||
           title.includes("stakeholder intelligence") || title.includes("organization:") || title.includes("stakeholder positions");
  };

  const isExecutiveSummary = (s: SavedSynthesis): boolean => {
    const src = (s.source || "").toLowerCase();
    const title = (s.title || "").toLowerCase();
    return src === "meta" || src === "stakeholder_meta" || title.includes("executive") || title.includes("meta-review");
  };

  const clusterReports = synthesisHistory.filter(s => !isStakeholderReport(s));
  const stakeholderReports = synthesisHistory.filter(s => isStakeholderReport(s));

  function renderSynthItem(synth: SavedSynthesis, globalIdx: number): string {
    const isExec = isExecutiveSummary(synth);
    const isStakeholder = isStakeholderReport(synth);

    let headerClass = "synth-header-cluster";
    let bodyClass = "synth-body";
    let badgeHtml = '<span class="badge-cluster">📁 Topic Cluster</span>';

    if (isExec) {
      headerClass = "synth-header-executive";
      bodyClass = "synth-body-executive";
      badgeHtml = '<span class="badge-executive">⭐ EXECUTIVE SUMMARY</span>';
    } else if (isStakeholder) {
      headerClass = "synth-header-stakeholder";
      bodyClass = "synth-body";
      badgeHtml = '<span class="badge-stakeholder">🏛️ Stakeholder Report</span>';
    }

    const subTitleColor = isExec ? "#FEF3C7" : isStakeholder ? "#E9D5FF" : "#CBD5E1";

    return `
      <div class="synth-item" data-title="${escapeHtml(synth.title.toLowerCase())}">
        <div class="${headerClass}" onclick="toggleSynthBody('synth-body-${globalIdx}')">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-family: Georgia, serif; font-style: italic; font-size: 15px; color: #FFFFFF;">📜 ${escapeHtml(synth.title)}</span>
              ${badgeHtml}
            </div>
            <div style="font-size: 11px; color: ${subTitleColor}; font-family: monospace; margin-top: 4px;">
              Generated ${escapeHtml(synth.timestamp)} • Source: ${escapeHtml(synth.source || 'General')}
            </div>
          </div>
          <button class="btn-secondary" style="background: #FFFFFF; color: #1A1A1A; border: none; font-size: 10px; padding: 5px 12px; font-weight: 700;" onclick="event.stopPropagation(); copyTextToClipboard(decodeURIComponent('${encodeURIComponent(synth.markdown)}'))">Copy Report</button>
        </div>
        <div id="synth-body-${globalIdx}" class="${bodyClass}" style="${globalIdx === 0 ? 'display: block;' : 'display: none;'}">
          ${renderMarkdownToHtml(synth.markdown)}
        </div>
      </div>
    `;
  }

  orgNames.forEach(name => {
    const m = stakeholderMappings[name];
    if (m && m.quadrant) {
      quadrantOrgs[m.quadrant].push({
        name,
        mapping: m,
        count: orgCommentCounts[name] || 0
      });
    }
  });

  const sessionJsonStr = JSON.stringify({
    comments,
    stakeholderMappings,
    executiveSummary,
    synthesisHistory,
    similarityThreshold,
    exportedAt: exportTimestamp
  }, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Offline Feedback Synthesis & Cluster Snapshot</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #F9F8F6;
      color: #1A1A1A;
      line-height: 1.5;
      font-size: 13px;
    }
    
    header {
      background-color: #1A1A1A;
      color: #FFFFFF;
      padding: 24px 32px;
      border-bottom: 4px solid #4A6741;
    }
    
    .header-content {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .app-title {
      font-family: Georgia, serif;
      font-style: italic;
      font-size: 24px;
      font-weight: 700;
      color: #FFFFFF;
      letter-spacing: -0.5px;
    }

    .app-subtitle {
      font-size: 11px;
      color: #A3A3A3;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 2px;
    }

    .badge-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .header-badge {
      background: #2A2A2A;
      border: 1px solid #3A3A3A;
      color: #D1D5DB;
      font-size: 11px;
      padding: 4px 10px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .header-badge strong { color: #FFFFFF; }

    nav.tab-nav {
      background: #FFFFFF;
      border-bottom: 2px solid #E5E3DF;
      padding: 0 32px;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .nav-container {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      gap: 4px;
      overflow-x: auto;
    }

    .tab-btn {
      background: transparent;
      border: none;
      border-bottom: 3px solid transparent;
      padding: 14px 20px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6B7280;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .tab-btn:hover { color: #1A1A1A; background: #F3F4F6; }
    .tab-btn.active {
      color: #4A6741;
      border-bottom-color: #4A6741;
      background: #F9F8F6;
    }

    main.content {
      max-width: 1400px;
      margin: 24px auto;
      padding: 0 32px;
    }

    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    .card {
      background: #FFFFFF;
      border: 1px solid #E5E3DF;
      padding: 24px;
      margin-bottom: 24px;
    }

    .card-title {
      font-family: Georgia, serif;
      font-style: italic;
      font-size: 18px;
      font-weight: 700;
      color: #1A1A1A;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Grid layouts */
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
    .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }

    /* Quadrant styles */
    .quad-card {
      border-top: 4px solid #888;
      background: #FFFFFF;
      border-left: 1px solid #E5E3DF;
      border-right: 1px solid #E5E3DF;
      border-bottom: 1px solid #E5E3DF;
      padding: 16px;
    }
    .quad-key-players { border-top-color: #D97706; background: #FEF3C7; }
    .quad-keep-satisfied { border-top-color: #2563EB; background: #EFF6FF; }
    .quad-keep-informed { border-top-color: #059669; background: #ECFDF5; }
    .quad-monitor { border-top-color: #6B7280; background: #F9FAFB; }

    .quad-title { font-weight: 700; font-size: 13px; text-transform: uppercase; margin-bottom: 8px; }

    /* Tables */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      background: #FFFFFF;
    }
    table.data-table th {
      background: #1A1A1A;
      color: #FFFFFF;
      text-align: left;
      padding: 10px 12px;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
      position: sticky;
      top: 50px;
    }
    table.data-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #E5E3DF;
      vertical-align: top;
    }
    table.data-table tr:hover { background: #F9F8F6; }

    /* Sentiment Pill Badges */
    .pill {
      display: inline-block;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-radius: 2px;
    }
    .pill-positive { background: #DCFCE7; color: #15803D; border: 1px solid #86EFAC; }
    .pill-neutral { background: #F3F4F6; color: #4B5563; border: 1px solid #D1D5DB; }
    .pill-negative { background: #FEE2E2; color: #B91C1C; border: 1px solid #FCA5A5; }

    .tag-sec {
      display: inline-block;
      background: #FEF3C7;
      color: #92400E;
      border: 1px solid #FCD34D;
      font-size: 10px;
      padding: 1px 5px;
      margin: 2px 2px 0 0;
      font-family: monospace;
    }

    /* Filter Controls */
    .filter-bar {
      background: #FFFFFF;
      border: 1px solid #E5E3DF;
      padding: 16px;
      margin-bottom: 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }

    .filter-input, .filter-select {
      padding: 8px 12px;
      border: 1px solid #D1D5DB;
      font-size: 12px;
      background: #FFFFFF;
      outline: none;
    }
    .filter-input { flex: 1; min-width: 220px; }
    .filter-input:focus, .filter-select:focus { border-color: #4A6741; }

    /* Synthesis Sub-Nav Tabs */
    .synth-subnav {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      border-bottom: 2px solid #E5E3DF;
      padding-bottom: 12px;
    }
    .synth-subbtn {
      background: #F3F4F6;
      border: 1px solid #D1D5DB;
      color: #4B5563;
      padding: 10px 18px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.15s ease;
    }
    .synth-subbtn:hover {
      background: #E5E7EB;
      color: #111827;
    }
    .synth-subbtn.active {
      background: #1A1A1A;
      color: #FCD34D;
      border-color: #1A1A1A;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }

    /* Synthesis Item Base */
    .synth-item {
      border: 1px solid #E5E3DF;
      background: #FFFFFF;
      margin-bottom: 16px;
      overflow: hidden;
      transition: box-shadow 0.15s ease;
    }
    .synth-item:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    }

    /* Standard Cluster Header */
    .synth-header-cluster {
      background: #1E293B;
      color: #F8FAFC;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      font-weight: 700;
      border-bottom: 1px solid #334155;
    }

    /* Standard Stakeholder Header */
    .synth-header-stakeholder {
      background: #3B0764;
      color: #FAF5FF;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      font-weight: 700;
      border-bottom: 1px solid #581C87;
    }

    /* Executive Summary / Meta-Review Highlighted Header */
    .synth-header-executive {
      background: linear-gradient(135deg, #B45309 0%, #D97706 100%);
      color: #FFFFFF;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      font-weight: 800;
      border: 1px solid #F59E0B;
      box-shadow: 0 3px 10px rgba(217, 119, 6, 0.25);
    }

    /* Badges */
    .badge-executive {
      background: #FEF3C7;
      color: #78350F;
      border: 1px solid #FCD34D;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .badge-cluster {
      background: #F1F5F9;
      color: #334155;
      border: 1px solid #CBD5E1;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      text-transform: uppercase;
    }
    .badge-stakeholder {
      background: #F3E8FF;
      color: #6B21A8;
      border: 1px solid #D8B4FE;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      text-transform: uppercase;
    }

    /* Body styling */
    .synth-body {
      padding: 20px 24px;
      background: #FFFDF9;
      border-top: 1px solid #E5E3DF;
    }
    .synth-body-executive {
      padding: 22px 26px;
      background: #FFFDF5;
      border: 2px solid #FCD34D;
      border-top: none;
    }

    .btn-action {
      background: #4A6741;
      color: #FFFFFF;
      border: none;
      padding: 8px 16px;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-action:hover { background: #3D5535; }

    .btn-secondary {
      background: #FFFFFF;
      color: #1A1A1A;
      border: 1px solid #1A1A1A;
      padding: 8px 16px;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      cursor: pointer;
    }
    .btn-secondary:hover { background: #F3F4F6; }
  </style>
</head>
<body>

  <header>
    <div class="header-content">
      <div>
        <h1 class="app-title">Feedback Analysis &amp; Cluster Synthesis</h1>
        <div class="app-subtitle">Self-Contained Offline Interactive Dashboard • Generated ${escapeHtml(exportTimestamp)}</div>
      </div>

      <div class="badge-bar">
        <div class="header-badge">Total Items: <strong>${totalComments}</strong></div>
        <div class="header-badge">Topic Clusters: <strong>${uniqueTopics.length}</strong></div>
        <div class="header-badge">Mapped Orgs: <strong>${orgNames.length}</strong></div>
        <div class="header-badge">Saved Reports: <strong>${synthesisHistory.length}</strong></div>
        <button class="btn-action" onclick="downloadRawJsonSession()">Download Raw Session JSON</button>
      </div>
    </div>
  </header>

  <nav class="tab-nav">
    <div class="nav-container">
      <button class="tab-btn active" onclick="switchTab('tab-exec')">📊 Executive Report</button>
      <button class="tab-btn" onclick="switchTab('tab-stakeholders')">👑 Stakeholder Power-Interest Matrix (${orgNames.length})</button>
      <button class="tab-btn" onclick="switchTab('tab-dataset')">📁 Topic Clusters &amp; Dataset (${totalComments})</button>
      <button class="tab-btn" onclick="switchTab('tab-syntheses')">📜 Synthesis Reports Hub (${synthesisHistory.length})</button>
    </div>
  </nav>

  <main class="content">

    <!-- TAB 1: EXECUTIVE REPORT -->
    <section id="tab-exec" class="tab-panel active">
      <div class="card">
        <div class="card-title">
          <span>Executive Summary &amp; Stakeholder Priority Audit</span>
          <button class="btn-secondary" onclick="copyExecutiveSummaryMarkdown()">Copy Markdown</button>
        </div>
        <div id="exec-markdown-content" style="background: #FFFDF9; border: 1px solid #E5E3DF; padding: 24px; font-size: 13px;">
          ${renderMarkdownToHtml(executiveSummary || "# Executive Summary\n*No executive summary report was compiled prior to exporting this offline snapshot.*")}
        </div>
      </div>
    </section>

    <!-- TAB 2: STAKEHOLDER MATRIX -->
    <section id="tab-stakeholders" class="tab-panel">
      <div class="card">
        <div class="card-title">Stakeholder Power &amp; Interest Classification Grid</div>
        <p style="color: #6B7280; margin-bottom: 16px; font-size: 12px;">
          Organizations classified along Influence (Power) and Interest axes. Priority weights prioritize feedback from Key Players and High Influence groups in synthesis reports.
        </p>

        <div class="grid-4" style="margin-bottom: 24px;">
          <!-- Key Players -->
          <div class="quad-card quad-key-players">
            <div class="quad-title" style="color: #92400E;">👑 Key Players (2.5x Priority Weight)</div>
            <div style="font-size: 11px; color: #78350F; margin-bottom: 10px;">High Influence &amp; High Interest • Manage Closely</div>
            ${quadrantOrgs.key_players.length === 0 ? '<div style="color: #A3A3A3; font-style: italic;">No organizations in this quadrant</div>' : ''}
            ${quadrantOrgs.key_players.map(o => `
              <div style="background: #FFFFFF; border: 1px solid #FCD34D; padding: 8px 10px; margin-bottom: 6px; font-weight: 600; display: flex; justify-content: space-between;">
                <span>${escapeHtml(o.name)}</span>
                <span style="font-family: monospace; color: #B45309;">${o.count} items</span>
              </div>
            `).join('')}
          </div>

          <!-- Keep Satisfied -->
          <div class="quad-card quad-keep-satisfied">
            <div class="quad-title" style="color: #1E40AF;">🛡️ Keep Satisfied (1.8x Priority Weight)</div>
            <div style="font-size: 11px; color: #1E3A8A; margin-bottom: 10px;">High Influence &amp; Low Interest • Compliance &amp; Alignment</div>
            ${quadrantOrgs.keep_satisfied.length === 0 ? '<div style="color: #A3A3A3; font-style: italic;">No organizations in this quadrant</div>' : ''}
            ${quadrantOrgs.keep_satisfied.map(o => `
              <div style="background: #FFFFFF; border: 1px solid #93C5FD; padding: 8px 10px; margin-bottom: 6px; font-weight: 600; display: flex; justify-content: space-between;">
                <span>${escapeHtml(o.name)}</span>
                <span style="font-family: monospace; color: #1D4ED8;">${o.count} items</span>
              </div>
            `).join('')}
          </div>

          <!-- Keep Informed -->
          <div class="quad-card quad-keep-informed">
            <div class="quad-title" style="color: #065F46;">📢 Keep Informed (1.4x Priority Weight)</div>
            <div style="font-size: 11px; color: #064E3B; margin-bottom: 10px;">Low Influence &amp; High Interest • Active End-Users</div>
            ${quadrantOrgs.keep_informed.length === 0 ? '<div style="color: #A3A3A3; font-style: italic;">No organizations in this quadrant</div>' : ''}
            ${quadrantOrgs.keep_informed.map(o => `
              <div style="background: #FFFFFF; border: 1px solid #6EE7B7; padding: 8px 10px; margin-bottom: 6px; font-weight: 600; display: flex; justify-content: space-between;">
                <span>${escapeHtml(o.name)}</span>
                <span style="font-family: monospace; color: #047857;">${o.count} items</span>
              </div>
            `).join('')}
          </div>

          <!-- Monitor -->
          <div class="quad-card quad-monitor">
            <div class="quad-title" style="color: #374151;">👁️ Minimal Effort (1.0x Priority Weight)</div>
            <div style="font-size: 11px; color: #4B5563; margin-bottom: 10px;">Low Influence &amp; Low Interest • General Segment</div>
            ${quadrantOrgs.monitor.length === 0 ? '<div style="color: #A3A3A3; font-style: italic;">No organizations in this quadrant</div>' : ''}
            ${quadrantOrgs.monitor.map(o => `
              <div style="background: #FFFFFF; border: 1px solid #E5E7EB; padding: 8px 10px; margin-bottom: 6px; font-weight: 600; display: flex; justify-content: space-between;">
                <span>${escapeHtml(o.name)}</span>
                <span style="font-family: monospace; color: #6B7280;">${o.count} items</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card-title" style="font-size: 15px;">Mapped Stakeholder Roster</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Organization Name</th>
              <th>Influence (1-5)</th>
              <th>Interest (1-5)</th>
              <th>Quadrant</th>
              <th>Priority Weight</th>
              <th>Feedback Records</th>
            </tr>
          </thead>
          <tbody>
            ${orgNames.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: #888;">No organization mappings configured.</td></tr>' : ''}
            ${orgNames.map(name => {
              const m = stakeholderMappings[name];
              const qInfo = getQuadrantInfo(m?.influence || 3, m?.interest || 3);
              const count = orgCommentCounts[name] || 0;
              return `
                <tr>
                  <td style="font-weight: 700;">${escapeHtml(name)}</td>
                  <td style="font-family: monospace;">${m?.influence?.toFixed(1) || "3.0"}</td>
                  <td style="font-family: monospace;">${m?.interest?.toFixed(1) || "3.0"}</td>
                  <td>
                    <span class="pill" style="background: ${qInfo.bgColor}; color: ${qInfo.color}; border: 1px solid ${qInfo.borderColor};">
                      ${qInfo.icon} ${qInfo.shortLabel}
                    </span>
                  </td>
                  <td style="font-family: monospace; font-weight: 700;">${qInfo.priorityWeight.toFixed(1)}x</td>
                  <td style="font-family: monospace;">${count}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <!-- TAB 3: DATASET & CLUSTERS -->
    <section id="tab-dataset" class="tab-panel">
      <div class="card">
        <div class="card-title">Custom Topic Clusters Breakdown</div>
        <div class="grid-4" style="margin-bottom: 24px;">
          ${uniqueTopics.map(t => {
            const group = topicGroups[t];
            const pos = group.filter(c => c.sentiment === 'positive').length;
            const neu = group.filter(c => c.sentiment === 'neutral').length;
            const neg = group.filter(c => c.sentiment === 'negative').length;
            return `
              <div style="background: #FFFDF9; border: 1px solid #E5E3DF; padding: 14px;">
                <div style="font-weight: 700; font-size: 13px; margin-bottom: 6px; color: #1A1A1A;">${escapeHtml(t)}</div>
                <div style="font-size: 11px; color: #6B7280; font-family: monospace; margin-bottom: 8px;">
                  ${group.length} items (${((group.length / totalComments) * 100).toFixed(0)}%)
                </div>
                <div style="display: flex; gap: 4px; font-size: 10px; font-weight: 700;">
                  <span style="color: #15803D;">+${pos}</span>
                  <span style="color: #4B5563;">=${neu}</span>
                  <span style="color: #B91C1C;">-${neg}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="card-title">Feedback Dataset Explorer</div>

        <div class="filter-bar">
          <input type="text" id="search-input" class="filter-input" placeholder="Search feedback text, ID, or organization..." oninput="filterDatasetTable()" />
          
          <select id="topic-select" class="filter-select" onchange="filterDatasetTable()">
            <option value="">All Topics (${uniqueTopics.length})</option>
            ${uniqueTopics.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${topicGroups[t].length})</option>`).join('')}
          </select>

          <select id="sentiment-select" class="filter-select" onchange="filterDatasetTable()">
            <option value="">All Sentiments</option>
            <option value="positive">Positive (${positiveCount})</option>
            <option value="neutral">Neutral (${neutralCount})</option>
            <option value="negative">Negative (${negativeCount})</option>
          </select>

          <span id="filtered-count" style="font-size: 11px; font-weight: 700; color: #4A6741; margin-left: auto;">
            Showing ${totalComments} / ${totalComments} records
          </span>
        </div>

        <table class="data-table" id="comments-table">
          <thead>
            <tr>
              <th style="width: 70px;">ID / Row</th>
              <th>Feedback Text</th>
              <th>Primary Cluster Topic</th>
              <th style="width: 100px;">Match %</th>
              <th>Secondary Tags (≥50%)</th>
              <th style="width: 90px;">Sentiment</th>
              <th>Organization</th>
            </tr>
          </thead>
          <tbody id="comments-tbody">
            ${comments.map((c, idx) => {
              const confPct = c.clusterConfidence ? Math.round(c.clusterConfidence * 100) : 100;
              const sentPill = c.sentiment === 'positive' ? 'pill-positive' : c.sentiment === 'negative' ? 'pill-negative' : 'pill-neutral';
              const secondaryTags = (c.secondaryTopics || []).map(s => `<span class="tag-sec">${escapeHtml(s.topic)} (${Math.round(s.confidence * 100)}%)</span>`).join('');
              const rowId = c.originalId || c.id || `row_${idx + 1}`;
              
              return `
                <tr class="comment-row" data-text="${escapeHtml(c.text.toLowerCase())}" data-topic="${escapeHtml(c.topic || '')}" data-sentiment="${c.sentiment}" data-org="${escapeHtml((c.organizationName || '').toLowerCase())}">
                  <td style="font-family: monospace; font-size: 11px; font-weight: 700; color: #6B7280;">#${escapeHtml(rowId)}</td>
                  <td style="line-height: 1.5; color: #111827;">${escapeHtml(c.text)}</td>
                  <td style="font-weight: 600; color: #2D1B0D;">${escapeHtml(c.topic || 'Unassigned')}</td>
                  <td style="font-family: monospace; font-weight: 700; color: ${confPct >= 80 ? '#15803D' : confPct >= 60 ? '#D97706' : '#6B7280'};">${confPct}%</td>
                  <td>${secondaryTags || '<span style="color: #9CA3AF; font-size: 11px;">—</span>'}</td>
                  <td><span class="pill ${sentPill}">${c.sentiment}</span></td>
                  <td style="font-weight: 600;">${escapeHtml(c.organizationName || 'N/A')}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <!-- TAB 4: SYNTHESIS REPORTS HUB -->
    <section id="tab-syntheses" class="tab-panel">
      <div class="card">
        <div class="card-title">
          <span>Synthesis Reports &amp; Intelligence Hub (${synthesisHistory.length})</span>
          <div style="display: flex; gap: 8px;">
            <button class="btn-secondary" style="font-size: 10px;" onclick="toggleAllSynthBodies(true)">Expand All</button>
            <button class="btn-secondary" style="font-size: 10px;" onclick="toggleAllSynthBodies(false)">Collapse All</button>
          </div>
        </div>
        <p style="color: #6B7280; margin-bottom: 20px; font-size: 12px;">
          Explore qualitatively synthesized intelligence reports categorized into distinct Cluster &amp; Topic Syntheses and Organization Stakeholder Intelligence. Executive Summaries are highlighted with prominent gold banners.
        </p>

        <!-- Sub-category Selection Tabs -->
        <div class="synth-subnav">
          <button id="btn-synth-sub-cluster" class="synth-subbtn active" onclick="switchSynthSubTab('cluster')">
            <span>📁 Topic &amp; Cluster Reports</span>
            <span style="background: rgba(0,0,0,0.08); padding: 1px 6px; font-family: monospace; border-radius: 2px;">${clusterReports.length}</span>
          </button>
          
          <button id="btn-synth-sub-stakeholder" class="synth-subbtn" onclick="switchSynthSubTab('stakeholder')">
            <span>🏛️ Stakeholder &amp; Organization Reports</span>
            <span style="background: rgba(0,0,0,0.08); padding: 1px 6px; font-family: monospace; border-radius: 2px;">${stakeholderReports.length}</span>
          </button>
        </div>

        <!-- Filter / Search input for Synthesis Hub -->
        <div class="filter-bar" style="margin-bottom: 16px;">
          <input type="text" id="synth-search-input" class="filter-input" placeholder="Filter reports in active list by title or keywords..." oninput="filterSynthReports()" />
          <span id="synth-count-display" style="font-size: 11px; font-weight: 700; color: #D97706; margin-left: auto;">
            Showing reports in current area
          </span>
        </div>

        <!-- Panel 1: Cluster Reports -->
        <div id="synth-panel-cluster" class="synth-cat-panel">
          ${clusterReports.length === 0 ? `
            <div style="background: #FFFDF9; border: 1px dashed #D1D5DB; padding: 32px; text-align: center; color: #888;">
              <div style="font-size: 14px; font-weight: 700; margin-bottom: 4px; color: #374151;">No Topic or Cluster Reports Saved</div>
              <p style="font-size: 12px; color: #6B7280;">Cluster syntheses and deduplication reports will appear here when generated.</p>
            </div>
          ` : clusterReports.map((synth, idx) => renderSynthItem(synth, idx)).join('')}
        </div>

        <!-- Panel 2: Stakeholder Reports -->
        <div id="synth-panel-stakeholder" class="synth-cat-panel" style="display: none;">
          ${stakeholderReports.length === 0 ? `
            <div style="background: #FFFDF9; border: 1px dashed #D1D5DB; padding: 32px; text-align: center; color: #888;">
              <div style="font-size: 14px; font-weight: 700; margin-bottom: 4px; color: #374151;">No Stakeholder Reports Saved</div>
              <p style="font-size: 12px; color: #6B7280;">Organization stakeholder intelligence reports and position meta-summaries will appear here when generated.</p>
            </div>
          ` : stakeholderReports.map((synth, idx) => renderSynthItem(synth, clusterReports.length + idx)).join('')}
        </div>

      </div>
    </section>

  </main>

  <!-- Embedded Raw Session Data Payload -->
  <script type="application/json" id="raw-session-data">
    ${sessionJsonStr.replace(/<\/script>/g, '<\\/script>')}
  </script>

  <script>
    function switchTab(tabId) {
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      
      const panel = document.getElementById(tabId);
      if (panel) panel.classList.add('active');

      const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabId));
      if (activeBtn) activeBtn.classList.add('active');
    }

    function switchSynthSubTab(cat) {
      document.querySelectorAll('.synth-cat-panel').forEach(p => p.style.display = 'none');
      document.querySelectorAll('.synth-subbtn').forEach(b => b.classList.remove('active'));

      const activePanel = document.getElementById('synth-panel-' + cat);
      if (activePanel) activePanel.style.display = 'block';

      const activeBtn = document.getElementById('btn-synth-sub-' + cat);
      if (activeBtn) activeBtn.classList.add('active');

      filterSynthReports();
    }

    function toggleSynthBody(bodyId) {
      const el = document.getElementById(bodyId);
      if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }
    }

    function toggleAllSynthBodies(expand) {
      document.querySelectorAll('.synth-body, .synth-body-executive').forEach(b => {
        b.style.display = expand ? 'block' : 'none';
      });
    }

    function filterSynthReports() {
      const query = (document.getElementById('synth-search-input').value || '').toLowerCase();
      const activePanel = Array.from(document.querySelectorAll('.synth-cat-panel')).find(p => p.style.display !== 'none');
      if (!activePanel) return;

      const items = activePanel.querySelectorAll('.synth-item');
      let visible = 0;
      items.forEach(item => {
        const title = item.getAttribute('data-title') || '';
        if (!query || title.includes(query)) {
          item.style.display = '';
          visible++;
        } else {
          item.style.display = 'none';
        }
      });

      const countEl = document.getElementById('synth-count-display');
      if (countEl) {
        countEl.textContent = 'Showing ' + visible + ' / ' + items.length + ' reports';
      }
    }

    function filterDatasetTable() {
      const query = (document.getElementById('search-input').value || '').toLowerCase();
      const selectedTopic = document.getElementById('topic-select').value;
      const selectedSentiment = document.getElementById('sentiment-select').value;

      const rows = document.querySelectorAll('.comment-row');
      let visibleCount = 0;

      rows.forEach(row => {
        const text = row.getAttribute('data-text') || '';
        const topic = row.getAttribute('data-topic') || '';
        const sentiment = row.getAttribute('data-sentiment') || '';
        const org = row.getAttribute('data-org') || '';

        const matchesQuery = !query || text.includes(query) || topic.toLowerCase().includes(query) || org.includes(query);
        const matchesTopic = !selectedTopic || topic === selectedTopic;
        const matchesSentiment = !selectedSentiment || sentiment === selectedSentiment;

        if (matchesQuery && matchesTopic && matchesSentiment) {
          row.style.display = '';
          visibleCount++;
        } else {
          row.style.display = 'none';
        }
      });

      const countEl = document.getElementById('filtered-count');
      if (countEl) {
        countEl.textContent = 'Showing ' + visibleCount + ' / ' + rows.length + ' records';
      }
    }

    function downloadRawJsonSession() {
      const dataEl = document.getElementById('raw-session-data');
      if (!dataEl) return;
      const blob = new Blob([dataEl.textContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'session_snapshot_' + new Date().toISOString().split('T')[0] + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    function copyTextToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        alert('Copied report markdown to clipboard!');
      }).catch(err => {
        console.error('Copy failed:', err);
      });
    }

    function copyExecutiveSummaryMarkdown() {
      const dataEl = document.getElementById('raw-session-data');
      if (!dataEl) return;
      try {
        const parsed = JSON.parse(dataEl.textContent);
        if (parsed.executiveSummary) {
          copyTextToClipboard(parsed.executiveSummary);
        } else {
          alert('No executive summary content available.');
        }
      } catch (e) {
        alert('Failed to read session data.');
      }
    }
  </script>
</body>
</html>`;
}
