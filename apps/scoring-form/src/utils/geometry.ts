import type { EllipseGeometry, Point3 } from '@bridge-contract';

function isSamePoint(a: Point3, b: Point3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function isSameEllipse(a: EllipseGeometry | undefined, b: EllipseGeometry): boolean {
  return (
    a !== undefined &&
    a.referencedImageId === b.referencedImageId &&
    a.FrameOfReferenceUID === b.FrameOfReferenceUID &&
    isSamePoint(a.viewPlaneNormal, b.viewPlaneNormal) &&
    isSamePoint(a.viewUp, b.viewUp) &&
    a.points.every((point, i) => isSamePoint(point, b.points[i]))
  );
}
