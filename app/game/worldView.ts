export type Vector3 = [number, number, number];

export const ORIGINAL_CAMERA_DISTANCE = 42.5;
export const ORIGINAL_LIGHT_POSITION: Vector3 = [0, 4.2, -35];

export interface WorldView {
  pitch: number;
  yaw: number;
  lightPosition: Vector3;
  worldPosition: Vector3;
}

export function screenCenterToWorld(
  centerX: number,
  centerY: number,
  viewCenterX: number,
  viewCenterY: number,
  worldUnitsPerPixel: number,
  cameraDistance = ORIGINAL_CAMERA_DISTANCE,
): Vector3 {
  return [
    (centerX - viewCenterX) * worldUnitsPerPixel,
    (viewCenterY - centerY) * worldUnitsPerPixel,
    -cameraDistance,
  ];
}

export function projectWorldPoint(
  point: Vector3,
  viewCenterX: number,
  viewCenterY: number,
  worldUnitsPerPixel: number,
  cameraDistance = ORIGINAL_CAMERA_DISTANCE,
): [number, number] {
  const pixelsPerUnit = 1 / worldUnitsPerPixel;
  const perspective = cameraDistance / Math.max(1, -point[2]);
  return [
    viewCenterX + point[0] * pixelsPerUnit * perspective,
    viewCenterY - point[1] * pixelsPerUnit * perspective,
  ];
}

export function calculateWorldView(
  centerX: number,
  centerY: number,
  viewCenterX: number,
  viewCenterY: number,
  worldUnitsPerPixel: number,
  cameraDistance = ORIGINAL_CAMERA_DISTANCE,
): WorldView {
  const worldPosition = screenCenterToWorld(
    centerX,
    centerY,
    viewCenterX,
    viewCenterY,
    worldUnitsPerPixel,
    cameraDistance,
  );
  const [worldX, worldY] = worldPosition;
  const focalPixels = cameraDistance / worldUnitsPerPixel;
  return {
    pitch: Math.atan2(centerY - viewCenterY, focalPixels),
    yaw: Math.atan2(centerX - viewCenterX, focalPixels),
    lightPosition: [-worldX, 4.2 - worldY, 7.5],
    worldPosition,
  };
}
