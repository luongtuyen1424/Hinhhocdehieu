import React, { useMemo, useState, useEffect, useRef } from 'react';
import { GeometryData, Point3D, Point2D, Edge, FreehandStroke } from '../types';
import { projectPoint, get2DCentroid, getSmartLabelDirection, get3DCentroid } from '../utils/geometryUtils';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, X, Palette, Move, RotateCcw as ResetIcon, PenTool, Eraser, MousePointer2, Hand, Focus } from 'lucide-react';

interface CanvasProps {
  data: GeometryData | null;
  currentStepIndex: number;
  onDataUpdate: (newData: GeometryData) => void;
  onSpeak?: (text: string) => void;
}

const getPointOnVector = (start: Point3D, end: Point3D, distance: number): Point3D => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length === 0) return start;
  
  const ratio = distance / length;
  return {
    id: `temp_${Math.random()}`,
    x: start.x + dx * ratio,
    y: start.y + dy * ratio,
    z: start.z + dz * ratio
  };
};

const getMarkerPath = (type: string, p1: Point2D, p2: Point2D) => {
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return '';
  const nx = -dy / len;
  const ny = dx / len;
  const size = 6;
  if (type === 'tick') return `M ${midX - nx*size} ${midY - ny*size} L ${midX + nx*size} ${midY + ny*size}`;
  if (type === 'double-tick') {
    const gap = 3;
    const m1x = midX - (dx/len)*gap; const m1y = midY - (dy/len)*gap;
    const m2x = midX + (dx/len)*gap; const m2y = midY + (dy/len)*gap;
    return `M ${m1x - nx*size} ${m1y - ny*size} L ${m1x + nx*size} ${m1y + ny*size} M ${m2x - nx*size} ${m2y - ny*size} L ${m2x + nx*size} ${m2y + ny*size}`;
  }
  if (type === 'arrow') {
    const bx = midX - (dx/len)*size*1.5; const by = midY - (dy/len)*size*1.5;
    return `M ${bx + nx*size} ${by + ny*size} L ${midX} ${midY} L ${bx - nx*size} ${by - ny*size}`;
  }
  if (type === 'double-arrow') {
     const gap = 4; const bx = midX - (dx/len)*size*1.5; const by = midY - (dy/len)*size*1.5;
     const midX2 = midX + (dx/len)*gap*1.5; const midY2 = midY + (dy/len)*gap*1.5;
     const bx2 = midX2 - (dx/len)*size*1.5; const by2 = midY2 - (dy/len)*size*1.5;
     return `M ${bx + nx*size} ${by + ny*size} L ${midX} ${midY} L ${bx - nx*size} ${by - ny*size} M ${bx2 + nx*size} ${by2 + ny*size} L ${midX2} ${midY2} L ${bx2 - nx*size} ${by2 - ny*size}`;
  }
  return '';
};

const COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#cbd5e1'];

interface SelectedElement { id: string; type: 'point' | 'edge' | 'face' | 'label'; }

const Canvas: React.FC<CanvasProps> = ({ data, currentStepIndex, onDataUpdate, onSpeak }) => {
  // View state
  const [scale, setScale] = useState(25);
  const [angleX, setAngleX] = useState(15);
  const [angleY, setAngleY] = useState(30);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Selection state
  const [selectedElements, setSelectedElements] = useState<SelectedElement[]>([]);
  
  // Modes
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isPanMode, setIsPanMode] = useState(false);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);
  
  // Refs
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const pointersRef = useRef<Map<number, {x: number, y: number}>>(new Map());
  const prevPinchDistRef = useRef<number | null>(null);

  // Drawing
  const [currentStroke, setCurrentStroke] = useState<{x: number, y: number}[]>([]);
  const [drawingColor, setDrawingColor] = useState('#ef4444'); 

  // --- RESIZE & INIT ---
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    };
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isDrawingMode) setIsSpacePanning(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { setIsSpacePanning(false); setIsPanning(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [isDrawingMode]);

  // Auto Rotation Loop
  useEffect(() => {
    let interval: number;
    if (isAutoRotating && data?.type === '3D' && !isDrawingMode && !isPanning && !draggingLabelId) {
      interval = window.setInterval(() => setAngleY((prev) => (prev + 1) % 360), 50);
    }
    return () => clearInterval(interval);
  }, [isAutoRotating, data, isDrawingMode, isPanning, draggingLabelId]);

  // Initial View Setup
  useEffect(() => { 
    resetView(); 
  }, [data?.type, data?.points]);

  const resetView = () => {
    setPanOffset({ x: 0, y: 0 });
    if (data?.type === '2D') { 
        setAngleX(0); setAngleY(0); setScale(25); 
    } else { 
        setAngleX(15); setAngleY(45); setScale(20); 
    }
    setSelectedElements([]); 
    setIsDrawingMode(false); 
    setIsPanMode(false);
    
    // Auto-center geometry
    setTimeout(centerView, 50);
  };

  const centerView = () => {
      if (!data) return;
      const points = data.points;
      if (points.length === 0) return;
      
      const center3D = get3DCentroid(points);
      const proj = projectPoint(center3D, angleX, angleY, scale, dimensions.width, dimensions.height);
      
      // Target Center Screen
      const targetScreenX = dimensions.width * 0.5;
      const targetScreenY = dimensions.height * 0.5;
      
      const deltaX = targetScreenX - proj.x;
      const deltaY = targetScreenY - proj.y;
      
      setPanOffset({ x: deltaX, y: deltaY });
      
      // Auto Zoom to fit roughly
      setScale(s => Math.min(s * 1.5, 60));
  };

  // --- Coordinate Transformations (Screen <-> World) ---
  const toWorld = (screenX: number, screenY: number) => {
    return {
      x: (screenX - dimensions.width / 2 - panOffset.x) / scale,
      y: (screenY - dimensions.height / 2 - panOffset.y) / scale
    };
  };

  const toScreen = (worldX: number, worldY: number) => {
    return {
      x: worldX * scale + dimensions.width / 2 + panOffset.x,
      y: worldY * scale + dimensions.height / 2 + panOffset.y
    };
  };

  const projectedPoints = useMemo<Map<string, Point2D>>(() => {
    const map = new Map<string, Point2D>();
    if (!data) return map;

    data.points.forEach((p) => {
      const pt = projectPoint(p, angleX, angleY, scale, dimensions.width, dimensions.height);
      map.set(p.id, { x: pt.x + panOffset.x, y: pt.y + panOffset.y });
    });
    return map;
  }, [data, angleX, angleY, scale, dimensions, panOffset]);

  // Smart Label Positioning Logic
  const labelPositions = useMemo(() => {
    const posMap = new Map<string, Point2D>();
    if(!data) return posMap;

    const projCenter = get2DCentroid(Array.from(projectedPoints.values()));

    data.points.forEach(point => {
        const pt = projectedPoints.get(point.id);
        if(!pt) return;

        // 1. Manual Override (Priority 1)
        if (point.labelOffset) {
            posMap.set(point.id, { x: pt.x + point.labelOffset.x, y: pt.y + point.labelOffset.y });
            return;
        }

        // 2. Smart Calculation (Priority 2)
        // Find neighbor points
        const neighbors: Point2D[] = [];
        data.edges.forEach(edge => {
            if(edge.from === point.id) {
                const n = projectedPoints.get(edge.to);
                if(n) neighbors.push(n);
            } else if (edge.to === point.id) {
                const n = projectedPoints.get(edge.from);
                if(n) neighbors.push(n);
            }
        });

        const direction = getSmartLabelDirection(pt, neighbors, projCenter);
        const distance = 25; // Standard distance
        
        posMap.set(point.id, { 
            x: pt.x + direction.x * distance, 
            y: pt.y + direction.y * distance 
        });
    });
    return posMap;
  }, [data, projectedPoints]);


  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 1. PAN MODE
    if (e.button === 1 || (e.button === 0 && isPanMode)) { 
       e.preventDefault(); 
       setIsPanning(true); 
       lastPointerPos.current = { x: e.clientX, y: e.clientY }; 
       return;
    }

    if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left; 
        const y = e.clientY - rect.top;
        lastPointerPos.current = { x: e.clientX, y: e.clientY };

        // 2. SELECTION / DRAG Logic
        if (!isDrawingMode && !isPanMode && !isSpacePanning && pointersRef.current.size === 1) {
            
            // A. Check Labels first (Higher priority z-index usually)
            for (const p of data?.points || []) {
                const lblPos = labelPositions.get(p.id);
                if (lblPos && p.label) {
                     // Approximate text dimensions
                     const w = 30; const h = 20;
                     if (Math.abs(lblPos.x - x) < w && Math.abs(lblPos.y - y) < h) {
                         setDraggingLabelId(p.id);
                         return; // Stop here, we found a label
                     }
                }
            }

            // B. Check Points
            let clickedNodeId: string | null = null;
            for (const p of data?.points || []) {
                const pt = projectedPoints.get(p.id);
                if (pt) {
                    const hitRadius = 24;
                    if (Math.abs(pt.x - x) < hitRadius && Math.abs(pt.y - y) < hitRadius) {
                        clickedNodeId = p.id;
                        break;
                    }
                }
            }

            // C. Check Edges
            if (!clickedNodeId) {
                for (const edge of data?.edges || []) {
                    const p1 = projectedPoints.get(edge.from);
                    const p2 = projectedPoints.get(edge.to);
                    if (p1 && p2) {
                        const A = x - p1.x; const B = y - p1.y;
                        const C = p2.x - p1.x; const D = p2.y - p1.y;
                        const dot = A * C + B * D;
                        const len_sq = C * C + D * D;
                        let param = -1;
                        if (len_sq !== 0) param = dot / len_sq;
                        let xx, yy;
                        if (param < 0) { xx = p1.x; yy = p1.y; }
                        else if (param > 1) { xx = p2.x; yy = p2.y; }
                        else { xx = p1.x + param * C; yy = p1.y + param * D; }
                        const dx = x - xx; const dy = y - yy;
                        if (Math.sqrt(dx * dx + dy * dy) < 15) {
                             clickedNodeId = edge.id;
                             break;
                        }
                    }
                }
            }

            if (clickedNodeId) {
                const isAlreadySelected = isSelected(clickedNodeId);
                if (isAlreadySelected) {
                    setSelectedElements([]);
                } else {
                    setSelectedElements([{ id: clickedNodeId, type: clickedNodeId.includes('edge') ? 'edge' : 'point' }]);
                    const pt = data?.points.find(p => p.id === clickedNodeId);
                    if (onSpeak && pt?.label) onSpeak(`Điểm ${pt.label}`);
                }
                return;
            } else {
                setSelectedElements([]);
            }
        }

        const isPanAction = isSpacePanning || e.altKey || pointersRef.current.size === 2;
        if (pointersRef.current.size === 2) {
             setIsPanning(true);
             const points = Array.from(pointersRef.current.values()) as {x: number, y: number}[];
             prevPinchDistRef.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        } else if (isDrawingMode && !isPanAction) {
            const worldPos = toWorld(x, y);
            setCurrentStroke([worldPos]);
        } else if (isPanAction) {
            setIsPanning(true);
        }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const dx = e.clientX - lastPointerPos.current.x; 
        const dy = e.clientY - lastPointerPos.current.y;
        lastPointerPos.current = { x: e.clientX, y: e.clientY };

        if (pointersRef.current.size === 2) {
             const points = Array.from(pointersRef.current.values()) as {x: number, y: number}[];
             const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
             if (prevPinchDistRef.current !== null) {
                 const delta = dist - prevPinchDistRef.current;
                 const newScale = Math.min(Math.max(5, scale * (1 + delta * 0.01)), 200);
                 setScale(newScale);
             }
             prevPinchDistRef.current = dist;
             setPanOffset(prev => ({ x: prev.x + dx * 0.5, y: prev.y + dy * 0.5 }));
             return; 
        }

        // DRAGGING LABEL
        if (draggingLabelId && data) {
            // Update the temporary or permanent state of the label offset
            // Calculate new offset relative to the point
            const point = data.points.find(p => p.id === draggingLabelId);
            const ptProj = projectedPoints.get(draggingLabelId);
            if (point && ptProj) {
                const currentLabelPos = labelPositions.get(draggingLabelId) || ptProj;
                const newX = currentLabelPos.x + dx;
                const newY = currentLabelPos.y + dy;
                
                // Convert back to offset relative to the point
                const offsetX = newX - ptProj.x;
                const offsetY = newY - ptProj.y;

                // Update data immediately for smooth drag (or use temp state if performance issues)
                const newPoints = data.points.map(p => 
                    p.id === draggingLabelId ? { ...p, labelOffset: { x: offsetX, y: offsetY } } : p
                );
                onDataUpdate({ ...data, points: newPoints });
            }
            return;
        }

        if (isDrawingMode && !isPanning && currentStroke.length > 0) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const worldPos = toWorld(mouseX, mouseY);
            setCurrentStroke(prev => [...prev, worldPos]);
        } else if (isPanning) {
            setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) prevPinchDistRef.current = null;
    if (pointersRef.current.size === 0) setIsPanning(false);
    
    setDraggingLabelId(null); // Stop dragging label

    e.currentTarget.releasePointerCapture(e.pointerId);
    if (isDrawingMode && currentStroke.length > 0) {
        if (data) {
            const newStroke: FreehandStroke = { id: Date.now().toString(), points: currentStroke, color: drawingColor, width: 3 };
            onDataUpdate({ ...data, drawings: [...(data.drawings || []), newStroke] });
        }
        setCurrentStroke([]);
    }
  };

  const isSelected = (id: string) => selectedElements.some(e => e.id === id);
  const getOpacity = (id: string, baseOpacity: number = 1) => baseOpacity;

  if (!data) {
    return (
      <div id="canvas-container" ref={containerRef} className="flex-1 h-full bg-slate-50 flex items-center justify-center border-b border-slate-200">
        <div className="text-center text-slate-400 p-8">
          <div className="text-6xl mb-4 text-slate-300">📐</div>
          <p className="text-lg">Hãy nhập đề bài để AI vẽ hình.</p>
        </div>
      </div>
    );
  }

  // Cursor logic
  let cursorClass = 'cursor-default';
  if (isDrawingMode) cursorClass = 'cursor-crosshair';
  else if (isPanning) cursorClass = 'cursor-grabbing'; 
  else if (isPanMode) cursorClass = 'cursor-grab'; 
  else if (isSpacePanning) cursorClass = 'cursor-grab';
  else if (draggingLabelId) cursorClass = 'cursor-move';

  return (
    <div 
      id="canvas-container" 
      ref={containerRef} 
      className={`flex-1 h-full bg-slate-50 relative overflow-hidden touch-none border-b border-slate-200 ${cursorClass}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={(e) => { if(!isDrawingMode) setScale(s => Math.min(Math.max(5, s * (1 - e.deltaY * 0.002)), 200)); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Grid Background */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ backgroundImage: `linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)`, backgroundSize: `${scale}px ${scale}px`, backgroundPosition: `${panOffset.x + dimensions.width/2}px ${panOffset.y + dimensions.height/2}px`, opacity: 0.5 }} />
      
      <svg width="100%" height="100%" className="absolute inset-0 z-0">
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
           <filter id="selected-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="text-bg">
            <feFlood floodColor="white" floodOpacity="0.8"/>
            <feComposite in="SourceGraphic" operator="over"/>
          </filter>
        </defs>

        {(data.faces || []).map((face) => {
           if (!face.pointIds.every(id => data.points.some(gp => gp.id === id))) return null; 
           const pathData = (face.pointIds || []).map((pid, idx) => {
             const pt = projectedPoints.get(pid); return pt ? `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}` : '';
           }).join(' ') + ' Z';
           return <path key={face.id} d={pathData} fill={face.color || '#cbd5e1'} fillOpacity={getOpacity(face.id, isSelected(face.id) ? 0.8 : (face.opacity || 0.2))} stroke={isSelected(face.id) ? "#3b82f6" : "none"} strokeWidth={isSelected(face.id) ? 2 : 0} className="transition-opacity duration-300" pointerEvents={isDrawingMode || isPanMode ? "none" : "all"} />;
        })}

        {(data.angles || []).map((angle) => {
           const center = data.points.find(p => p.id === angle.centerId);
           const p1 = data.points.find(p => p.id === angle.arm1Id);
           const p2 = data.points.find(p => p.id === angle.arm2Id);
           if (!center || !p1 || !p2) return null;
           
           // Calculate distances to determine marker size dynamically
           const dist1 = Math.sqrt(Math.pow(p1.x - center.x, 2) + Math.pow(p1.y - center.y, 2) + Math.pow(p1.z - center.z, 2));
           const dist2 = Math.sqrt(Math.pow(p2.x - center.x, 2) + Math.pow(p2.y - center.y, 2) + Math.pow(p2.z - center.z, 2));
           
           // Standard reduced size: max 0.4 units, restricted by 25% of arm length for small shapes
           const markerSize = Math.min(0.4, dist1 * 0.25, dist2 * 0.25);

           const arm1Pt = getPointOnVector(center, p1, markerSize); 
           const arm2Pt = getPointOnVector(center, p2, markerSize);
           
           const centerProj = projectedPoints.get(center.id);
           const arm1ProjRaw = projectPoint(arm1Pt, angleX, angleY, scale, dimensions.width, dimensions.height);
           const arm2ProjRaw = projectPoint(arm2Pt, angleX, angleY, scale, dimensions.width, dimensions.height);
           
           const arm1Proj = { x: arm1ProjRaw.x + panOffset.x, y: arm1ProjRaw.y + panOffset.y };
           const arm2Proj = { x: arm2ProjRaw.x + panOffset.x, y: arm2ProjRaw.y + panOffset.y };
           
           if (!centerProj) return null;
           
           let d = '';
           if (angle.type === 'right') {
               // Parallelogram vector addition for 3D-consistent right angle mark
               const v1x = arm1Proj.x - centerProj.x;
               const v1y = arm1Proj.y - centerProj.y;
               const v2x = arm2Proj.x - centerProj.x;
               const v2y = arm2Proj.y - centerProj.y;
               const cornerX = centerProj.x + v1x + v2x;
               const cornerY = centerProj.y + v1y + v2y;
               d = `M ${arm1Proj.x} ${arm1Proj.y} L ${cornerX} ${cornerY} L ${arm2Proj.x} ${arm2Proj.y}`;
           } else {
               d = `M ${arm1Proj.x} ${arm1Proj.y} Q ${(arm1Proj.x+arm2Proj.x)/2} ${(arm1Proj.y+arm2Proj.y)/2} ${arm2Proj.x} ${arm2Proj.y}`;
           }
           
           // If double arc is needed (simple offset implementation for visual indication)
           const isDouble = angle.type === 'double-arc';

           return (
             <g key={angle.id} opacity={getOpacity(angle.id, 1)} pointerEvents="none">
                 <path d={d} fill="none" stroke="#475569" strokeWidth="1.5" />
                 {isDouble && (
                     // Simple double arc via slight scaling/offsetting isn't perfect but sufficient for small indicators
                     <path d={d} fill="none" stroke="#475569" strokeWidth="1.5" transform={`translate(2,2)`} opacity="0.5" /> 
                 )}
             </g>
           );
        })}

        {(data.edges || []).map((edge) => {
          const p1 = projectedPoints.get(edge.from); const p2 = projectedPoints.get(edge.to);
          if (!p1 || !p2) return null; 
          const selected = isSelected(edge.id);
          const strokeColor = selected ? '#2563eb' : (edge.color || '#1e293b');
          const strokeWidth = selected ? 5 : 2; // Thicker when selected
          return (
            <g key={edge.id} opacity={getOpacity(edge.id)}>
              {/* Invisible wide stroke for easier selection */}
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth="20" className="cursor-pointer" pointerEvents={isDrawingMode || isPanMode ? "none" : "all"} />
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" filter={selected ? "url(#selected-glow)" : ""} className="transition-all duration-300 pointer-events-none" />
              {edge.marker && <path d={getMarkerPath(edge.marker, p1, p2)} stroke={strokeColor} strokeWidth="2" fill="none" pointerEvents="none"/>}
              {edge.label && <text x={(p1.x+p2.x)/2} y={(p1.y+p2.y)/2 - 8} fontSize="10" textAnchor="middle" fill="#333" className="pointer-events-none bg-white/70">{edge.label}</text>}
            </g>
          );
        })}

        {data.points.map((point) => {
          const pt = projectedPoints.get(point.id);
          if (!pt) return null;
          const selected = isSelected(point.id);
          const labelPos = labelPositions.get(point.id) || pt;
          const isLabelDragging = draggingLabelId === point.id;

          return (
            <g key={point.id} className="cursor-pointer" opacity={getOpacity(point.id)}>
                {/* Invisible large circle for selection */}
                <circle cx={pt.x} cy={pt.y} r={20} fill="transparent" pointerEvents={isDrawingMode || isPanMode ? "none" : "all"}/>
                <circle cx={pt.x} cy={pt.y} r={selected ? 8 : 4} fill={selected?'#2563eb':'white'} stroke="#1e293b" strokeWidth={2} filter={selected ? "url(#selected-glow)" : ""} pointerEvents="none" className="transition-all duration-200"/>
                
                {point.label && (
                    <text 
                        x={labelPos.x} 
                        y={labelPos.y} 
                        className={`text-sm font-bold select-none transition-colors duration-100 ${selected || isLabelDragging ? 'fill-blue-700 text-base' : 'fill-slate-800'}`} 
                        textAnchor="middle" 
                        dominantBaseline="middle" 
                        style={{
                            textShadow: '0px 0px 4px #fff, 0px 0px 2px #fff',
                            cursor: isPanMode || isDrawingMode ? 'default' : 'move' // Indicate driftability
                        }}
                        pointerEvents={isDrawingMode || isPanMode ? "none" : "all"} // Allow grabbing label if not in tool mode
                    >
                        {point.label}
                    </text>
                )}
            </g>
          );
        })}

        {(data.drawings || []).map(stroke => (
            <polyline 
                key={stroke.id} 
                points={stroke.points.map(p => { const sp = toScreen(p.x, p.y); return `${sp.x},${sp.y}`; }).join(' ')} 
                fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" 
            />
        ))}
        
        {currentStroke.length > 0 && (
            <polyline 
                points={currentStroke.map(p => { const sp = toScreen(p.x, p.y); return `${sp.x},${sp.y}`; }).join(' ')} 
                fill="none" stroke={drawingColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" 
            />
        )}
      </svg>

      {/* Floating Toolbar - 1 Touch Toggle Buttons */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-auto">
        <button onClick={resetView} className="p-3 bg-white rounded-full shadow-lg border border-slate-200 active:scale-90 transition-transform text-slate-700" title="Về vị trí ban đầu"><ResetIcon size={24} /></button>
        <button onClick={() => setScale(s => s * 1.2)} className="p-3 bg-white rounded-full shadow-lg border border-slate-200 active:scale-90 transition-transform text-slate-700"><ZoomIn size={24} /></button>
        <button onClick={() => setScale(s => s / 1.2)} className="p-3 bg-white rounded-full shadow-lg border border-slate-200 active:scale-90 transition-transform text-slate-700"><ZoomOut size={24} /></button>
        
        {data.type === '3D' && <button onClick={() => setIsAutoRotating(!isAutoRotating)} className={`p-3 rounded-full shadow-lg border transition-all active:scale-90 ${isAutoRotating ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-700'}`}><RotateCw size={24} /></button>}
        
        <div className="h-px bg-slate-300 my-1 w-full" />
        
        {/* Move (Hand) Button */}
        <button 
            onClick={() => { 
                const newState = !isPanMode; 
                setIsPanMode(newState); 
                if(newState) setIsDrawingMode(false); 
            }} 
            className={`p-3 rounded-full shadow-lg border transition-all duration-200 active:scale-90 ${isPanMode ? 'bg-indigo-600 border-indigo-600 text-white ring-2 ring-indigo-300 ring-offset-2' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            title="Chế độ kéo thả"
        >
            <Hand size={24} />
        </button>
        
        {/* Draw (Pen) Button */}
        <button 
            onClick={() => { 
                const newState = !isDrawingMode; 
                setIsDrawingMode(newState); 
                if(newState) setIsPanMode(false); 
            }} 
            className={`p-3 rounded-full shadow-lg border transition-all duration-200 active:scale-90 ${isDrawingMode ? 'bg-amber-500 border-amber-500 text-white ring-2 ring-amber-300 ring-offset-2' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            title="Chế độ vẽ"
        >
            {isDrawingMode ? <PenTool size={24} /> : <MousePointer2 size={24} />}
        </button>
        
        {(data.drawings && data.drawings.length > 0) && <button onClick={() => onDataUpdate({...data, drawings:[]})} className="p-3 bg-white text-red-500 rounded-full shadow-lg border border-slate-200 active:scale-90 transition-transform hover:bg-red-50"><Eraser size={24} /></button>}
      </div>

      {isDrawingMode && (
         <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-xl border border-amber-200 flex items-center p-2 gap-2 animate-in fade-in slide-in-from-bottom-4 pointer-events-auto">
             {COLORS.map(color => <button key={color} onClick={() => setDrawingColor(color)} className={`w-10 h-10 rounded-full border-2 transition-transform active:scale-90 ${drawingColor === color ? 'border-amber-500 scale-110' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: color }} />)}
             <div className="w-px h-6 bg-slate-200 mx-1"></div>
             <button onClick={() => setIsDrawingMode(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full active:bg-slate-100"><X size={24} /></button>
         </div>
      )}

      {selectedElements.length > 0 && !isDrawingMode && !isPanning && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-xl border border-blue-200 flex flex-col animate-in fade-in slide-in-from-bottom-4 overflow-hidden max-w-[95vw] pointer-events-auto">
          <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 bg-blue-50">
             <span className="text-sm font-bold text-blue-700 uppercase tracking-wider flex items-center gap-2"><Focus size={16} className="text-blue-600"/>Đã chọn {selectedElements.length} đối tượng</span>
             <button onClick={() => setSelectedElements([])} className="text-slate-400 hover:text-red-500 ml-4 p-1 rounded-full active:bg-red-50"><X size={20} /></button>
          </div>
          <div className="flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <Palette size={20} className="text-slate-400 shrink-0" />
              {COLORS.map(color => <button key={color} onClick={() => { const newData = {...data}; const ids = new Set(selectedElements.map(e=>e.id)); newData.points = newData.points.map(p=>ids.has(p.id)?{...p,color}:p); newData.edges = newData.edges.map(e=>ids.has(e.id)?{...e,color}:e); newData.faces = newData.faces.map(f=>ids.has(f.id)?{...f,color}:f); onDataUpdate(newData); }} className="w-9 h-9 rounded-full border border-slate-200 shadow-sm active:scale-90 transition-transform shrink-0" style={{ backgroundColor: color }} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Canvas;