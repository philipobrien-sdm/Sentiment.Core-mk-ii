import React, { useRef, useEffect, useState, useMemo } from "react";
import { CommentItem } from "../types";
import { Maximize2, RotateCcw, Paintbrush, HelpCircle, Info, X } from "lucide-react";
import { getCommentEmbedding } from "../utils/embeddingsCache";
import { calculateCosineSimilarity } from "./DuplicateReview";

interface VectorPlotProps {
  comments: CommentItem[];
  selectedCommentId: string | null;
  onSelectComment: (id: string) => void;
  colorMode: "sentiment" | "topic";
  setColorMode: (mode: "sentiment" | "topic") => void;
}

export const VectorPlot: React.FC<VectorPlotProps> = ({
  comments,
  selectedCommentId,
  onSelectComment,
  colorMode,
  setColorMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Canvas transform state
  const [zoom, setZoom] = useState<number>(200); // pixels per unit
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [dimensions, setDimensions] = useState({ width: 600, height: 450 });
  const [hoveredItem, setHoveredItem] = useState<CommentItem | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Mouse interaction state (refs to prevent re-renders on dragging)
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const originalPan = useRef({ x: 0, y: 0 });

  // Legend Filter & Hover State
  const [activeLegendFilter, setActiveLegendFilter] = useState<string | null>(null);
  const [hoveredLegendItem, setHoveredLegendItem] = useState<string | null>(null);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);

  // Memoize topic colors to remain stable
  const topicColorMap = useMemo(() => {
    const topics: string[] = Array.from(new Set<string>(comments.map((c) => c.topic))).sort();
    const colors = [
      "#1A1A1A", // deep charcoal
      "#4A6741", // olive green
      "#A13D2D", // dark red
      "#4F6D7A", // slate blue
      "#D0A352", // muted gold
      "#5E4B56", // eggplant
      "#855E42", // teak brown
      "#7C9082", // sage green
      "#2B4C7E", // royal navy
      "#8B5CF6", // purple
      "#D97706", // amber
      "#059669", // emerald
      "#DB2777", // pink
    ];
    const map: Record<string, string> = {};
    topics.forEach((topic, idx) => {
      map[topic] = colors[idx % colors.length];
    });
    return map;
  }, [comments]);

  // Topic & Sentiment node counts for legend badges
  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    comments.forEach((c) => {
      if (!c.isArchived) {
        counts[c.topic] = (counts[c.topic] || 0) + 1;
      }
    });
    return counts;
  }, [comments]);

  const sentimentCounts = useMemo(() => {
    const counts = { positive: 0, neutral: 0, negative: 0, duplicate: 0 };
    comments.forEach((c) => {
      if (!c.isArchived) {
        if (c.sentiment === "positive") counts.positive++;
        else if (c.sentiment === "negative") counts.negative++;
        else counts.neutral++;
        if (c.isDuplicate) counts.duplicate++;
      }
    });
    return counts;
  }, [comments]);

  // Handle Resize using ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 300),
        height: Math.max(height, 350),
      });
    });

    observer.observe(container);
    return () => {
      observer.unobserve(container);
    };
  }, []);

  // Helper to map 2D coordinates (x, y) from [-1.2, 1.2] space to canvas pixel space
  const toPixelCoords = (x: number, y: number) => {
    const cx = dimensions.width / 2 + panX + x * zoom;
    const cy = dimensions.height / 2 + panY - y * zoom; // Invert Y for standard math axis
    return { x: cx, y: cy };
  };

  // Helper to map canvas pixel space to 2D math coordinates
  const toMathCoords = (px: number, py: number) => {
    const mx = (px - dimensions.width / 2 - panX) / zoom;
    const my = -(py - dimensions.height / 2 - panY) / zoom;
    return { x: mx, y: my };
  };

  // Calculate the bounds of all active nodes on the map
  const getNodesBounds = () => {
    if (comments.length === 0) {
      return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    }
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    comments.forEach((c) => {
      if (c.isArchived) return;
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    });
    
    if (minX === Infinity || maxX === -Infinity) {
      return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    }
    
    // Add small padding to the node limits
    const padding = 0.25;
    return {
      minX: minX - padding,
      maxX: maxX + padding,
      minY: minY - padding,
      maxY: maxY + padding,
    };
  };

  // Keep the viewport center constrained inside the active node boundaries
  const getConstrainedPan = (z: number, px: number, py: number) => {
    const { minX, maxX, minY, maxY } = getNodesBounds();
    
    // centerX = -panX / zoom => -panX = centerX * zoom
    // We want centerX between minX and maxX => -panX between minX * zoom and maxX * zoom
    // => panX between -maxX * zoom and -minX * zoom
    const minPanX = -maxX * z;
    const maxPanX = -minX * z;
    
    // centerY = panY / zoom => panY = centerY * zoom
    // We want centerY between minY and maxY => panY between minY * z and maxY * z
    const minPanY = minY * z;
    const maxPanY = maxY * z;
    
    const constrainedX = Math.max(minPanX, Math.min(maxPanX, px));
    const constrainedY = Math.max(minPanY, Math.min(maxPanY, py));
    
    return { panX: constrainedX, panY: constrainedY };
  };

  // Reset viewport zoom & pan to perfectly center all comments and clear active legend filters
  const handleResetView = () => {
    setActiveLegendFilter(null);
    setHoveredLegendItem(null);
    if (comments.length === 0) {
      setZoom(200);
      setPanX(0);
      setPanY(0);
      return;
    }

    const { minX, maxX, minY, maxY } = getNodesBounds();

    const viewWidth = maxX - minX;
    const viewHeight = maxY - minY;

    // Calculate ideal zoom
    const zoomX = (dimensions.width * 0.8) / viewWidth;
    const zoomY = (dimensions.height * 0.8) / viewHeight;
    const idealZoom = Math.max(Math.min(zoomX, zoomY, 350), 60);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(idealZoom);
    setPanX(-centerX * idealZoom);
    setPanY(centerY * idealZoom);
  };

  // Trigger auto-fit once when comments are first loaded
  useEffect(() => {
    if (comments.length > 0) {
      handleResetView();
    }
  }, [comments.length]);

  // Color selection helper
  const getColorForItem = (item: CommentItem) => {
    if (item.id === "user_query_node") {
      return "#ec4899"; // Vibrant electric pink for the search query node
    }
    if (colorMode === "sentiment") {
      switch (item.sentiment) {
        case "positive":
          return "#4A6741"; // olive green
        case "negative":
          return "#A13D2D"; // dark terracotta red
        case "neutral":
        default:
          return "#8C867E"; // warm gray
      }
    } else {
      return topicColorMap[item.topic] || "#8C867E";
    }
  };

  // Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and set sizing
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // 1. Render background grid lines for reference
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 1;

    // Grid spacing matches zoom levels
    const gridSpacing = zoom > 180 ? 0.25 : zoom > 90 ? 0.5 : 1.0;
    const mathMin = toMathCoords(0, dimensions.height);
    const mathMax = toMathCoords(dimensions.width, 0);

    const startX = Math.floor(mathMin.x / gridSpacing) * gridSpacing;
    const endX = Math.ceil(mathMax.x / gridSpacing) * gridSpacing;
    const startY = Math.floor(mathMin.y / gridSpacing) * gridSpacing;
    const endY = Math.ceil(mathMax.y / gridSpacing) * gridSpacing;

    // Draw grid columns
    for (let x = startX; x <= endX; x += gridSpacing) {
      const p = toPixelCoords(x, 0);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, dimensions.height);
      ctx.stroke();
    }

    // Draw grid rows
    for (let y = startY; y <= endY; y += gridSpacing) {
      const p = toPixelCoords(0, y);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(dimensions.width, p.y);
      ctx.stroke();
    }

    // 2. Main Origin Axis Lines (X = 0 and Y = 0) with crisp slate styling
    const origin = toPixelCoords(0, 0);

    // X-Axis Line (Horizontal line at Y = 0)
    ctx.strokeStyle = "#64748b"; // Slate-500
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(dimensions.width, origin.y);
    ctx.stroke();

    // Y-Axis Line (Vertical line at X = 0)
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, dimensions.height);
    ctx.stroke();

    // 3. Draw Axis Ticks & Numeric Labels directly on the graphical plot
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "#475569";

    // X-Axis Ticks & Values (along Y=0 line or pinned to bottom if panned offscreen)
    const labelY = Math.max(16, Math.min(dimensions.height - 24, origin.y + 4));
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (let x = startX; x <= endX; x += gridSpacing) {
      if (Math.abs(x) < 0.001) continue; // skip 0 for dedicated origin tag
      const p = toPixelCoords(x, 0);
      
      // Draw tick mark
      ctx.strokeStyle = "#475569";
      ctx.beginPath();
      ctx.moveTo(p.x, origin.y - 4);
      ctx.lineTo(p.x, origin.y + 4);
      ctx.stroke();

      // Format numeric label
      const valStr = (x > 0 ? "+" : "") + x.toFixed(gridSpacing < 0.5 ? 2 : 1);
      ctx.fillText(valStr, p.x, labelY);
    }

    // Y-Axis Ticks & Values (along X=0 line or pinned to left if panned offscreen)
    const labelX = Math.max(34, Math.min(dimensions.width - 45, origin.x - 6));
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let y = startY; y <= endY; y += gridSpacing) {
      if (Math.abs(y) < 0.001) continue;
      const p = toPixelCoords(0, y);

      // Draw tick mark
      ctx.strokeStyle = "#475569";
      ctx.beginPath();
      ctx.moveTo(origin.x - 4, p.y);
      ctx.lineTo(origin.x + 4, p.y);
      ctx.stroke();

      // Format numeric label
      const valStr = (y > 0 ? "+" : "") + y.toFixed(gridSpacing < 0.5 ? 2 : 1);
      ctx.fillText(valStr, labelX, p.y);
    }

    // Origin (0,0) Coordinate Tag
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 9px monospace";
    ctx.fillText("(0, 0)", origin.x - 6, origin.y + 6);

    // Quadrant Watermark Labels in 4 corners of mathematical space
    ctx.font = "bold 9px monospace";
    ctx.fillStyle = "rgba(100, 116, 139, 0.35)";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText("Q1 [+X, +Y]", dimensions.width - 12, 12);

    ctx.textAlign = "left";
    ctx.fillText("Q2 [-X, +Y]", 12, 12);

    ctx.fillText("Q3 [-X, -Y]", 12, dimensions.height - 24);

    ctx.textAlign = "right";
    ctx.fillText("Q4 [+X, -Y]", dimensions.width - 12, dimensions.height - 24);

    // 4. Draw similarity link lines between duplicates and their parent originals
    ctx.strokeStyle = "rgba(100, 116, 139, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    
    comments.forEach((item) => {
      if (item.isArchived || !item.isDuplicate || !item.duplicateOfId) return;
      const original = comments.find((c) => c.id === item.duplicateOfId);
      if (original && !original.isArchived) {
        const pA = toPixelCoords(item.x, item.y);
        const pB = toPixelCoords(original.x, original.y);
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      }
    });
    ctx.setLineDash([]); // Reset line style

    // 5. Draw active connections/highlight for selected item
    if (selectedCommentId) {
      const selected = comments.find((c) => c.id === selectedCommentId);
      if (selected && !selected.isArchived) {
        const pSel = toPixelCoords(selected.x, selected.y);
        
        // Pulse ring around selection
        const time = Date.now() / 250;
        const ringRadius = 14 + Math.sin(time) * 3;
        ctx.strokeStyle = "rgba(79, 70, 229, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pSel.x, pSel.y, ringRadius, 0, 2 * Math.PI);
        ctx.stroke();

        // Connect lines from selection to its duplicates
        ctx.strokeStyle = "rgba(79, 70, 229, 0.15)";
        ctx.lineWidth = 1;
        comments.forEach((item) => {
          if (item.isArchived) return;
          if (item.duplicateOfId === selected.id || selected.duplicateOfId === item.id) {
            const pOther = toPixelCoords(item.x, item.y);
            ctx.beginPath();
            ctx.moveTo(pSel.x, pSel.y);
            ctx.lineTo(pOther.x, pOther.y);
            ctx.stroke();
          }
        });

        // Special case: If user_query_node is selected, draw lines to its top 5 nearest neighbors
        if (selected.id === "user_query_node") {
          const queryEmbedding = getCommentEmbedding(selected, true) || getCommentEmbedding(selected, false);
          if (queryEmbedding && queryEmbedding.length > 0) {
            const neighbors = comments
              .filter((c) => !c.isArchived && c.id !== "user_query_node")
              .map((c) => {
                const emb = getCommentEmbedding(c, true) || getCommentEmbedding(c, false);
                const similarity = emb ? calculateCosineSimilarity(queryEmbedding, emb) : 0;
                return { item: c, similarity };
              })
              .filter((res) => res.similarity >= 0.3)
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, 5);

            ctx.strokeStyle = "rgba(236, 72, 153, 0.4)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            neighbors.forEach(({ item: neighborItem, similarity }) => {
              const pNeighbor = toPixelCoords(neighborItem.x, neighborItem.y);
              ctx.beginPath();
              ctx.moveTo(pSel.x, pSel.y);
              ctx.lineTo(pNeighbor.x, pNeighbor.y);
              ctx.stroke();

              ctx.fillStyle = "#ec4899";
              ctx.font = "bold 9px monospace";
              ctx.fillText(`${Math.round(similarity * 100)}%`, pNeighbor.x + 8, pNeighbor.y - 4);
            });
            ctx.setLineDash([]);
          }
        }
      }
    }

    // Determine current active filter item (either clicked active legend filter or hovered legend item)
    const currentFilter = activeLegendFilter || hoveredLegendItem;

    // Helper to test if a comment matches current legend filter
    const matchesLegendFilter = (item: CommentItem) => {
      if (!currentFilter) return true;
      if (colorMode === "sentiment") {
        if (currentFilter === "positive") return item.sentiment === "positive";
        if (currentFilter === "neutral") return item.sentiment === "neutral";
        if (currentFilter === "negative") return item.sentiment === "negative";
        if (currentFilter === "duplicate") return !!item.isDuplicate;
      } else if (colorMode === "topic") {
        return item.topic === currentFilter;
      }
      return true;
    };

    // 6. Draw all nodes (with opacity fading for non-matching legend filter items)
    comments.forEach((item) => {
      if (item.isArchived) return;
      const { x: px, y: py } = toPixelCoords(item.x, item.y);

      const isSelected = item.id === selectedCommentId;
      const isHovered = hoveredItem && item.id === hoveredItem.id;
      const isDup = item.isDuplicate;
      const isMatch = matchesLegendFilter(item);

      ctx.save();

      // Fade out non-matching nodes when legend filter is active
      if (currentFilter && !isMatch && !isSelected) {
        ctx.globalAlpha = 0.12;
      } else {
        ctx.globalAlpha = 1.0;
      }

      // Base circle radius
      let radius = isDup ? 5 : 7;
      const isQueryNode = item.id === "user_query_node";
      if (isQueryNode) radius = 9;
      if (isSelected) radius += 3;
      if (isHovered) radius += 2;
      if (currentFilter && isMatch && !isQueryNode) radius += 1.5; // Slightly enlarge matching nodes

      // Draw point fill
      ctx.fillStyle = getColorForItem(item);
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, 2 * Math.PI);
      ctx.fill();

      // Border style based on item qualities & active filter
      if (isQueryNode) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        const time = Date.now() / 250;
        const pulseRadius = radius + 4 + Math.sin(time) * 2;
        ctx.strokeStyle = "rgba(236, 72, 153, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, pulseRadius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (isSelected) {
        ctx.strokeStyle = "#4f46e5"; // Indigo-600
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (currentFilter && isMatch) {
        // High-contrast border for matching filtered nodes
        ctx.strokeStyle = "#1A1A1A";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (isHovered) {
        ctx.strokeStyle = "#1e293b"; // Slate-800
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (isDup) {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();
    });

  }, [comments, dimensions, zoom, panX, panY, selectedCommentId, hoveredItem, colorMode, topicColorMap, activeLegendFilter, hoveredLegendItem]);

  // Mouse move handler for hover checks and panning
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    setMousePos({ x: mx, y: my });

    if (isDragging.current) {
      // Execute panning calculation
      const dx = mx - dragStart.current.x;
      const dy = my - dragStart.current.y;
      
      const targetPanX = originalPan.current.x + dx;
      const targetPanY = originalPan.current.y + dy;
      
      const constrained = getConstrainedPan(zoom, targetPanX, targetPanY);
      setPanX(constrained.panX);
      setPanY(constrained.panY);
    } else {
      // Execute hit testing for hover
      let found: CommentItem | null = null;
      // Loop backwards to favor rendering order (top layer first)
      for (let i = comments.length - 1; i >= 0; i--) {
        const item = comments[i];
        if (item.isArchived) continue;
        const p = toPixelCoords(item.x, item.y);
        const dist = Math.hypot(mx - p.x, my - p.y);

        const isSelected = item.id === selectedCommentId;
        const threshold = isSelected ? 12 : 9;

        if (dist < threshold) {
          found = item;
          break;
        }
      }
      setHoveredItem(found);
    }
  };

  // Mouse down - start pan drag or select point
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Only left-click
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (hoveredItem) {
      // Clicked on an item! Select it.
      onSelectComment(hoveredItem.id);
    } else {
      // Clicked on background, start panning
      isDragging.current = true;
      dragStart.current = { x: mx, y: my };
      originalPan.current = { x: panX, y: panY };
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
    setHoveredItem(null);
  };

  // Zoom on wheel scroll
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Get current math coords under cursor
    const mathUnderMouse = toMathCoords(mx, my);

    // Calculate new zoom level
    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(Math.min(zoom * zoomFactor, 1200), 40);

    // Adjust pan to keep same math point under cursor
    const newPanX = mx - dimensions.width / 2 - mathUnderMouse.x * newZoom;
    const newPanY = dimensions.height / 2 - my + mathUnderMouse.y * newZoom;

    const constrained = getConstrainedPan(newZoom, newPanX, newPanY);
    setZoom(newZoom);
    setPanX(constrained.panX);
    setPanY(constrained.panY);
  };

  return (
    <div id="vector_plot_card" className="flex flex-col bg-white border border-[#E5E3DF] rounded-none overflow-hidden h-full animate-in fade-in duration-300">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between px-6 py-3.5 border-b border-[#E5E3DF] gap-4 bg-white">
        <div className="flex items-center gap-3">
          <Paintbrush className="w-4 h-4 text-[#1A1A1A]" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif italic text-base text-[#1A1A1A] leading-none">
                Similarity Mapping Space
              </h2>
              <button
                onClick={() => setIsAboutModalOpen(true)}
                className="p-1 hover:bg-[#F9F8F6] border border-[#E5E3DF] text-gray-500 hover:text-[#1A1A1A] transition-colors cursor-pointer"
                title="About Similarity Mapping Space & Axis Breakdown"
              >
                <Info className="w-3.5 h-3.5 text-amber-700" />
              </button>
            </div>
            <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">
              2D High-Dimensional Semantic Vector Axis
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Active Legend Filter status badge (if active) */}
          {activeLegendFilter && (
            <div className="flex items-center gap-2 bg-amber-50 text-amber-950 border border-amber-300 px-2.5 py-1 text-[10px] font-mono font-bold uppercase">
              <span>Filter: <strong>{activeLegendFilter}</strong></span>
              <button
                onClick={() => setActiveLegendFilter(null)}
                className="text-amber-700 hover:text-amber-950 font-bold ml-1 cursor-pointer"
                title="Clear Legend Filter"
              >
                ✕
              </button>
            </div>
          )}

          {/* Toggle Color Mode */}
          <div className="flex bg-[#F9F8F6] p-1 border border-[#E5E3DF] text-xs rounded-none">
            <button
              onClick={() => {
                setColorMode("sentiment");
                setActiveLegendFilter(null);
              }}
              className={`px-3 py-1 text-[10px] uppercase tracking-wider font-semibold transition-all rounded-none cursor-pointer ${
                colorMode === "sentiment"
                  ? "bg-[#1A1A1A] text-white"
                  : "text-gray-500 hover:text-[#1A1A1A]"
              }`}
            >
              Sentiment
            </button>
            <button
              onClick={() => {
                setColorMode("topic");
                setActiveLegendFilter(null);
              }}
              className={`px-3 py-1 text-[10px] uppercase tracking-wider font-semibold transition-all rounded-none cursor-pointer ${
                colorMode === "topic"
                  ? "bg-[#1A1A1A] text-white"
                  : "text-gray-500 hover:text-[#1A1A1A]"
              }`}
            >
              Topic
            </button>
          </div>

          {/* Reset View & Filter */}
          <button
            onClick={handleResetView}
            title="Recenter Map Viewport and Clear Legend Filters"
            className="px-3 py-1.5 text-[#1A1A1A] hover:bg-[#F9F8F6] border border-[#E5E3DF] text-[10px] font-mono uppercase font-bold tracking-wider rounded-none transition-colors bg-white flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
            <span>Reset View</span>
          </button>
        </div>
      </div>

      {/* Canvas Graphical Representation Area */}
      <div
        ref={containerRef}
        className="relative flex-1 bg-[#F9F8F6] cursor-grab active:cursor-grabbing overflow-hidden select-none min-h-[280px]"
      >
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          className="block"
        />

        {/* Graphical Axis Labels Overlay */}
        {/* Horizontal X-Axis Label */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-10 flex items-center gap-1.5 bg-[#1A1A1A]/95 text-white px-3 py-1 text-[9px] font-mono tracking-widest uppercase border border-white/20 shadow-xs">
          <span>◄ Horizontal Axis (X): Primary Semantic Theme (Topic Difference) ►</span>
        </div>

        {/* Vertical Y-Axis Label */}
        <div className="absolute left-6 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 pointer-events-none z-10 flex items-center gap-1.5 bg-[#1A1A1A]/95 text-white px-3 py-1 text-[9px] font-mono tracking-widest uppercase border border-white/20 shadow-xs whitespace-nowrap">
          <span>◄ Vertical Axis (Y): Secondary Semantic Theme (Tone / Context Variance) ►</span>
        </div>

        {/* Dynamic Hover Tooltip inside canvas container */}
        {hoveredItem && (
          <div
            className="absolute z-20 pointer-events-none bg-white text-[#1A1A1A] p-4 rounded-none shadow-md border border-[#1A1A1A] transition-all duration-75 max-w-xs"
            style={{
              left: `${mousePos.x + 15}px`,
              top: `${mousePos.y + 15}px`,
            }}
          >
            <div className="flex items-center justify-between gap-4 mb-2">
              <span className="font-semibold text-gray-500 uppercase tracking-widest text-[9px]">
                {hoveredItem.topic}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-none text-[9px] font-mono border uppercase tracking-wider ${
                  hoveredItem.sentiment === "positive"
                    ? "bg-[#4A6741]/10 text-[#4A6741] border-[#4A6741]/20"
                    : hoveredItem.sentiment === "negative"
                    ? "bg-[#A13D2D]/10 text-[#A13D2D] border-[#A13D2D]/20"
                    : "bg-gray-100 text-gray-600 border-gray-300"
                }`}
              >
                {hoveredItem.sentiment}
              </span>
            </div>
            <p className="text-[#1A1A1A] leading-relaxed mb-2 font-serif italic text-xs">
              "{hoveredItem.text.length > 120 ? hoveredItem.text.substring(0, 117) + "..." : hoveredItem.text}"
            </p>
            {hoveredItem.isDuplicate && (
              <div className="pt-2 border-t border-[#E5E3DF] text-[9px] text-[#A13D2D] uppercase tracking-wider font-semibold">
                ⚠️ Duplicate Flag ({((hoveredItem.similarityScore || 0) * 100).toFixed(0)}%)
              </div>
            )}
            <div className="text-[9px] text-gray-400 mt-1 uppercase tracking-wider">
              Click to inspect details
            </div>
          </div>
        )}
      </div>

      {/* Interactive Dynamic Legend & Filter Toolbar */}
      <div className="bg-white border-t border-[#E5E3DF] p-3 space-y-2 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-700">
              Legend ({colorMode === "sentiment" ? "Sentiment Categories" : "Topic Clusters"}):
            </span>
            <span className="text-[9px] text-gray-400 font-mono">
              Click any item below to isolate matching vector nodes
            </span>
          </div>

          {activeLegendFilter && (
            <button
              onClick={() => setActiveLegendFilter(null)}
              className="text-[10px] font-mono font-bold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-0.5 uppercase cursor-pointer transition-colors"
            >
              Clear Legend Filter ({activeLegendFilter})
            </button>
          )}
        </div>

        {/* Legend Filter Buttons Row */}
        <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto p-2 border border-gray-200 bg-[#FAF9F7]">
          {colorMode === "sentiment" ? (
            <>
              {/* Positive */}
              <button
                onClick={() => setActiveLegendFilter(prev => prev === "positive" ? null : "positive")}
                onMouseEnter={() => setHoveredLegendItem("positive")}
                onMouseLeave={() => setHoveredLegendItem(null)}
                className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border ${
                  activeLegendFilter === "positive"
                    ? "bg-[#1A1A1A] text-white border-[#1A1A1A] font-bold shadow-xs scale-105"
                    : hoveredLegendItem === "positive"
                    ? "bg-[#4A6741]/15 text-[#4A6741] border-[#4A6741]"
                    : "bg-white text-gray-700 border-[#E5E3DF] hover:border-[#4A6741]"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#4A6741] shrink-0" />
                <span>Positive</span>
                <span className="text-[9px] opacity-75 font-bold">({sentimentCounts.positive})</span>
              </button>

              {/* Neutral */}
              <button
                onClick={() => setActiveLegendFilter(prev => prev === "neutral" ? null : "neutral")}
                onMouseEnter={() => setHoveredLegendItem("neutral")}
                onMouseLeave={() => setHoveredLegendItem(null)}
                className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border ${
                  activeLegendFilter === "neutral"
                    ? "bg-[#1A1A1A] text-white border-[#1A1A1A] font-bold shadow-xs scale-105"
                    : hoveredLegendItem === "neutral"
                    ? "bg-gray-200 text-[#1A1A1A] border-gray-400"
                    : "bg-white text-gray-700 border-[#E5E3DF] hover:border-gray-400"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#8C867E] shrink-0" />
                <span>Neutral</span>
                <span className="text-[9px] opacity-75 font-bold">({sentimentCounts.neutral})</span>
              </button>

              {/* Negative */}
              <button
                onClick={() => setActiveLegendFilter(prev => prev === "negative" ? null : "negative")}
                onMouseEnter={() => setHoveredLegendItem("negative")}
                onMouseLeave={() => setHoveredLegendItem(null)}
                className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border ${
                  activeLegendFilter === "negative"
                    ? "bg-[#1A1A1A] text-white border-[#1A1A1A] font-bold shadow-xs scale-105"
                    : hoveredLegendItem === "negative"
                    ? "bg-[#A13D2D]/15 text-[#A13D2D] border-[#A13D2D]"
                    : "bg-white text-gray-700 border-[#E5E3DF] hover:border-[#A13D2D]"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#A13D2D] shrink-0" />
                <span>Negative</span>
                <span className="text-[9px] opacity-75 font-bold">({sentimentCounts.negative})</span>
              </button>

              {/* Duplicates */}
              <button
                onClick={() => setActiveLegendFilter(prev => prev === "duplicate" ? null : "duplicate")}
                onMouseEnter={() => setHoveredLegendItem("duplicate")}
                onMouseLeave={() => setHoveredLegendItem(null)}
                className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border ${
                  activeLegendFilter === "duplicate"
                    ? "bg-[#1A1A1A] text-white border-[#1A1A1A] font-bold shadow-xs scale-105"
                    : hoveredLegendItem === "duplicate"
                    ? "bg-red-100 text-red-700 border-red-400"
                    : "bg-white text-gray-700 border-[#E5E3DF] hover:border-red-400"
                }`}
              >
                <span className="w-2.5 h-2.5 border-2 border-[#ef4444] bg-[#F9F8F6] shrink-0" />
                <span>Duplicate Flag</span>
                <span className="text-[9px] opacity-75 font-bold">({sentimentCounts.duplicate})</span>
              </button>
            </>
          ) : (
            <>
              {/* Dynamic Topics Legend Items */}
              {Object.keys(topicColorMap).map((topicName) => {
                const isSelected = activeLegendFilter === topicName;
                const isHovered = hoveredLegendItem === topicName;
                const color = topicColorMap[topicName] || "#8C867E";
                const count = topicCounts[topicName] || 0;

                return (
                  <button
                    key={topicName}
                    onClick={() => setActiveLegendFilter(prev => prev === topicName ? null : topicName)}
                    onMouseEnter={() => setHoveredLegendItem(topicName)}
                    onMouseLeave={() => setHoveredLegendItem(null)}
                    className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border ${
                      isSelected
                        ? "bg-[#1A1A1A] text-white border-[#1A1A1A] font-bold shadow-xs scale-105"
                        : isHovered
                        ? "bg-gray-100 text-[#1A1A1A] border-gray-400"
                        : "bg-white text-gray-700 border-[#E5E3DF] hover:border-gray-400"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="truncate max-w-[140px]" title={topicName}>{topicName}</span>
                    <span className="text-[9px] opacity-75 font-bold">({count})</span>
                  </button>
                );
              })}
            </>
          )}

          {comments.some(c => c.id === "user_query_node") && (
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-[#ec4899] bg-pink-50 border border-pink-200 px-2.5 py-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ec4899] shadow-[0_0_4px_#ec4899]" />
              <span>Search Query Node</span>
            </div>
          )}
        </div>

        {/* View Controls Hint Footer */}
        <div className="flex items-center justify-between text-[9px] font-mono text-gray-400 pt-1 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <span>🖱️ Left-Click & Drag to Pan</span>
            <span>⚙️ Mouse Scroll to Zoom</span>
            <span>🎯 Click Node to Select</span>
          </div>
          <div>
            <span>Showing {comments.filter(c => !c.isArchived).length} Vector Projections</span>
          </div>
        </div>
      </div>

      {/* ABOUT SIMILARITY MAPPING SPACE MODAL */}
      {isAboutModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#1A1A1A] w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="bg-[#1A1A1A] text-white p-4 flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-2.5">
                <Info className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-serif italic font-bold text-lg text-white">About Similarity Mapping Space</h3>
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">2D High-Dimensional Vector Projection Guide</p>
                </div>
              </div>
              <button
                onClick={() => setIsAboutModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs font-sans text-gray-800 leading-relaxed">
              
              {/* Concept Overview */}
              <div className="bg-[#F9F8F6] border border-[#E5E3DF] p-3.5 space-y-1.5">
                <h4 className="font-mono font-bold uppercase text-[11px] text-gray-900 flex items-center gap-1.5">
                  <Paintbrush className="w-3.5 h-3.5 text-amber-700" />
                  What is this plot?
                </h4>
                <p className="text-gray-700">
                  Each dot on the map represents a public comment mapped in a 2D mathematical vector space. High-dimensional text embeddings (768+ numerical dimensions) generated by AI models are projected down into 2 principal coordinate dimensions.
                </p>
                <p className="text-gray-700 font-semibold">
                  Comments close together share similar semantic meaning, policy intent, or wording, while distant points represent distinct topics or tones.
                </p>
              </div>

              {/* Plain English Axis Explanation */}
              <div className="space-y-3">
                <h4 className="font-mono font-bold uppercase text-[11px] text-gray-900 border-b border-gray-200 pb-1">
                  The Two Axes (in Plain English)
                </h4>

                <div className="border border-indigo-200 bg-indigo-50/50 p-3 space-y-1">
                  <strong className="block font-mono text-indigo-950 uppercase text-[10px]">
                    ↔ Horizontal Axis (X): Primary Semantic Theme (Topic Difference)
                  </strong>
                  <p className="text-indigo-900 text-[11px]">
                    Measures the primary thematic variation across comments. Points far to the left vs. far to the right represent fundamentally different policy subjects (e.g., Environmental Policy vs. Budgeting & Taxes vs. Transit Infrastructure).
                  </p>
                </div>

                <div className="border border-emerald-200 bg-emerald-50/50 p-3 space-y-1">
                  <strong className="block font-mono text-emerald-950 uppercase text-[10px]">
                    ↕ Vertical Axis (Y): Secondary Semantic Theme (Tone & Sub-Context Variance)
                  </strong>
                  <p className="text-emerald-900 text-[11px]">
                    Measures secondary semantic nuances such as sentiment polarity (Positive vs. Negative), tone intensity, or specialized sub-topics within a broader policy group.
                  </p>
                </div>
              </div>

              {/* Map Controls Guide */}
              <div className="space-y-2 border-t border-gray-100 pt-3">
                <h4 className="font-mono font-bold uppercase text-[11px] text-gray-900">
                  Interactive Features
                </h4>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-600 font-mono">
                  <li className="bg-gray-50 border border-gray-200 p-2">
                    <strong className="text-gray-900 block">🎯 Click Nodes:</strong> Select comment to trace duplicate links & similarity scores.
                  </li>
                  <li className="bg-gray-50 border border-gray-200 p-2">
                    <strong className="text-gray-900 block">🏷️ Legend Filter:</strong> Click any sentiment or topic badge below the canvas to isolate matching points.
                  </li>
                  <li className="bg-gray-50 border border-gray-200 p-2">
                    <strong className="text-gray-900 block">🖱️ Pan & Zoom:</strong> Left-click and drag to move map; scroll wheel to zoom into clusters.
                  </li>
                  <li className="bg-gray-50 border border-gray-200 p-2">
                    <strong className="text-gray-900 block">🔄 Reset View:</strong> Instantly recenter view and clear active legend filters.
                  </li>
                </ul>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-[#F9F8F6] border-t border-[#E5E3DF] p-3 flex justify-end">
              <button
                onClick={() => setIsAboutModalOpen(false)}
                className="px-4 py-1.5 bg-[#1A1A1A] hover:bg-black text-white text-xs font-mono font-bold uppercase cursor-pointer"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
