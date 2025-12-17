
export interface Point3D {
  id: string;
  x: number;
  y: number;
  z: number;
  label?: string;
  color?: string; // Allow custom color for points
  labelOffset?: { x: number, y: number }; // Manual offset for label positioning
  linkedIds?: string[]; // IDs of geometry elements related to this mind map node
}

export interface Edge {
  id: string;
  from: string; // Point ID
  to: string;   // Point ID
  color?: string; // Hex code
  thickness?: number;
  label?: string; // e.g., "5cm"
  marker?: 'tick' | 'double-tick' | 'arrow' | 'double-arrow'; // Symbols for equality or parallel
}

export interface Face {
  id: string;
  pointIds: string[];
  color?: string; // Hex code with opacity usually
  opacity?: number;
}

export interface Angle {
  id: string;
  centerId: string; // The vertex of the angle
  arm1Id: string;   // A point on the first arm
  arm2Id: string;   // A point on the second arm
  type: 'right' | 'arc' | 'double-arc';
  label?: string;   // e.g. "60°"
}

export interface DrawingStep {
  stepNumber: number;
  description: string; // Vietnamese text
  activeElementIds: string[]; // IDs of points/edges/faces to highlight
}

export interface ReasoningStep {
  id: string;
  question: string; // e.g. "Muốn chứng minh hai tam giác bằng nhau?"
  answer: string;   // e.g. "Cần xét góc xen giữa..."
  relatedElementIds: string[]; // Elements to highlight/zoom
}

export interface FreehandStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface GeometryData {
  points: Point3D[];
  edges: Edge[];
  faces: Face[];
  angles: Angle[];
  steps: DrawingStep[];
  reasoning?: ReasoningStep[]; // New: Backward reasoning steps
  drawings?: FreehandStroke[]; 
  type: '2D' | '3D';
  message?: string; 
  mathSolution?: string;
  groundingSource?: { title: string; url: string }[]; // New: Citations from Research Agent
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  image?: string; // Base64 string of the uploaded image
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Project {
  id: string;
  name: string;
  subjectId: string | null;
  geometryData: GeometryData | null;
  currentStepIndex: number;
  messages: ChatMessage[];
  lastModified: number;
}
