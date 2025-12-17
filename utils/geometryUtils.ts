import { Point3D, Point2D } from '../types';

// Simple weak perspective projection
export const projectPoint = (
  point: Point3D,
  angleX: number,
  angleY: number,
  scale: number,
  canvasWidth: number,
  canvasHeight: number
): Point2D => {
  // Convert degrees to radians
  const radX = (angleX * Math.PI) / 180;
  const radY = (angleY * Math.PI) / 180;

  // Rotate around Y axis
  let x = point.x * Math.cos(radY) - point.z * Math.sin(radY);
  let z = point.x * Math.sin(radY) + point.z * Math.cos(radY);
  let y = point.y;

  // Rotate around X axis
  let y_new = y * Math.cos(radX) - z * Math.sin(radX);
  z = y * Math.sin(radX) + z * Math.cos(radX);
  y = y_new;

  // Project to 2D (Basic orthographic for simplicity in education)
  // Scale and center
  const projectedX = x * scale + canvasWidth / 2;
  const projectedY = -y * scale + canvasHeight / 2; // Flip Y for screen coords

  return { x: projectedX, y: projectedY };
};

export const getCenterPoint = (points: Point3D[]): Point3D => {
  if (points.length === 0) return { id: 'center', x: 0, y: 0, z: 0 };
  
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }),
    { x: 0, y: 0, z: 0 }
  );

  return {
    id: 'center',
    x: sum.x / points.length,
    y: sum.y / points.length,
    z: sum.z / points.length,
  };
};

export const get3DCentroid = (points: Point3D[]): Point3D => {
  if (points.length === 0) return { id: 'temp_center', x: 0, y: 0, z: 0 };
  const count = points.length;
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }), { x: 0, y: 0, z: 0 });
  return {
    id: 'temp_center',
    x: sum.x / count,
    y: sum.y / count,
    z: sum.z / count
  };
};

// Calculate 2D centroid of projected points to push labels outward
export const get2DCentroid = (points: Point2D[]): Point2D => {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
};

// SMART LABEL POSITIONING
// Calculates the optimal direction to place a label so it doesn't overlap edges
export const getSmartLabelDirection = (
  currentPoint: Point2D,
  neighborPoints: Point2D[],
  geometryCenter: Point2D
): { x: number, y: number } => {
  
  let dirX = 0;
  let dirY = 0;

  if (neighborPoints.length > 0) {
    // 1. Calculate vector AWAY from all connected edges
    // Sum the unit vectors pointing to neighbors
    let sumX = 0;
    let sumY = 0;
    
    neighborPoints.forEach(nb => {
      const dx = nb.x - currentPoint.x;
      const dy = nb.y - currentPoint.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        sumX += dx / len;
        sumY += dy / len;
      }
    });

    // The average direction of edges is (sumX, sumY).
    // We want the OPPOSITE direction.
    dirX = -sumX;
    dirY = -sumY;
  } else {
    // Isolated point? Push away from geometry center
    dirX = currentPoint.x - geometryCenter.x;
    dirY = currentPoint.y - geometryCenter.y;
  }

  // Normalize
  const len = Math.sqrt(dirX * dirX + dirY * dirY);
  if (len === 0) {
    // Fallback: Top Right
    return { x: 0.707, y: -0.707 }; 
  }

  return { x: dirX / len, y: dirY / len };
};

export const getLabelPosition = (point: Point2D, center: Point2D, offset: number = 20): Point2D => {
    // Fallback legacy function
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length === 0) return { x: point.x + offset, y: point.y - offset }; 
  
  return {
    x: point.x + (dx / length) * offset,
    y: point.y + (dy / length) * offset
  };
};