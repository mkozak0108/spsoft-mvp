import type { EllipseGeometry } from '@bridge-contract';

// Message data is untrusted input, and TypeScript types are not validation: these narrow it
// before the app uses it. The bridge keeps its own copy, since the two apps ship separately.

const MAX_IMAGE_ID_LENGTH = 512;
// DICOM caps a UID at 64 characters.
const MAX_UID_LENGTH = 64;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isPoint3(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

/** Used on bridge messages and on saved state alike: stored data is trusted no further. */
export function isEllipseGeometry(value: unknown): value is EllipseGeometry {
  return (
    isRecord(value) &&
    isNonEmptyString(value.referencedImageId) &&
    value.referencedImageId.length <= MAX_IMAGE_ID_LENGTH &&
    isNonEmptyString(value.FrameOfReferenceUID) &&
    value.FrameOfReferenceUID.length <= MAX_UID_LENGTH &&
    isPoint3(value.viewPlaneNormal) &&
    isPoint3(value.viewUp) &&
    Array.isArray(value.points) &&
    value.points.length === 4 &&
    value.points.every(isPoint3)
  );
}
