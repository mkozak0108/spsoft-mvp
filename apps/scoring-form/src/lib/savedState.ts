import type { EllipseGeometry } from '@bridge-contract';
import { hasAreaAndUnit, isEllipseGeometry, isRecord } from '../utils/guards';
import { logger } from './logger';
import { type MeasurementRow, type MeasurementState, RowStatus } from './measurements';

// The doctor's work for one study, in the tab's sessionStorage, so it survives a reload and ends
// with the tab. The contract is specs/005-restore-state-on-reload/contracts/saved-state.md.

/** Checked before any field, for the reason every bridge message carries a version. */
export enum SavedStateVersion {
  V1 = 1,
}

enum SavedStateRejected {
  StorageUnavailable = 'storageUnavailable',
  Unreadable = 'unreadable',
  UnsupportedVersion = 'unsupportedVersion',
  Shape = 'shape',
}

// The flush on pagehide and visibilitychange is what keeps every reload exact. This width only
// bounds what a crash can lose, which fires no event, to the spec's "last second".
const SAVE_INTERVAL_MS = 1000;

export type SavedWork = Pick<MeasurementState, 'rows' | 'nextRowNumber'>;

export type Saver = {
  schedule: (work: SavedWork) => void;
  flush: () => void;
  dispose: () => void;
};

function keyFor(studyInstanceUid: string): string {
  return `spsoft-mvp.measurements.${studyInstanceUid}`;
}

function serialise({ rows, nextRowNumber }: SavedWork): string {
  return JSON.stringify({ version: SavedStateVersion.V1, nextRowNumber, rows });
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// Only the checked fields are kept, so nothing unchecked rides along into the state, back into
// storage or out to the viewer in a restore.
function pickEllipse({
  referencedImageId,
  FrameOfReferenceUID,
  viewPlaneNormal,
  viewUp,
  points,
}: EllipseGeometry): EllipseGeometry {
  return { referencedImageId, FrameOfReferenceUID, viewPlaneNormal, viewUp, points };
}

function readRow(value: unknown, nextRowNumber: number): MeasurementRow | undefined {
  // Read here rather than at module level: measurements.ts imports this module as well, so
  // RowStatus is not defined yet while this one loads.
  const statuses: readonly unknown[] = Object.values(RowStatus);
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.number) ||
    value.number >= nextRowNumber ||
    value.id !== `row-${value.number}` ||
    !statuses.includes(value.status) ||
    (value.value !== undefined && !(isRecord(value.value) && hasAreaAndUnit(value.value))) ||
    (value.ellipse !== undefined && !isEllipseGeometry(value.ellipse))
  ) {
    return undefined;
  }
  // Checked against the enum's values just above; TypeScript cannot narrow through `includes`.
  const status = value.status as RowStatus;
  const row: MeasurementRow = {
    id: value.id,
    number: value.number,
    // Its ellipse was never finished, so nothing can arrive for it (FR-007).
    status: status === RowStatus.Drawing ? RowStatus.Pending : status,
  };
  if (isRecord(value.value) && hasAreaAndUnit(value.value)) {
    row.value = { area: value.value.area, unit: value.value.unit };
  }
  if (isEllipseGeometry(value.ellipse)) {
    row.ellipse = pickEllipse(value.ellipse);
  }
  return row;
}

function readWork(data: Record<string, unknown>): SavedWork | undefined {
  const { nextRowNumber, rows } = data;
  if (!isPositiveInteger(nextRowNumber) || !Array.isArray(rows)) {
    return undefined;
  }
  const read: MeasurementRow[] = [];
  for (const value of rows) {
    const row = readRow(value, nextRowNumber);
    // A repeated id would make one message change two rows.
    if (!row || read.some((other) => other.id === row.id)) {
      return undefined;
    }
    read.push(row);
  }
  return { rows: read, nextRowNumber };
}

// Removes the value so the same failure does not repeat on every open for the life of the tab.
function reject(key: string, reason: SavedStateRejected): undefined {
  logger.warn('saved measurements not restored', { reason });
  try {
    sessionStorage.removeItem(key);
  } catch {
    logger.warn('saved measurements not removed', {
      reason: SavedStateRejected.StorageUnavailable,
    });
  }
  return undefined;
}

/**
 * The saved work for this study, or `undefined` to start empty. Stored data is untrusted input,
 * so it is all or nothing: one bad field drops the whole value (FR-010, FR-012).
 */
export function loadSavedState(studyInstanceUid: string): MeasurementState | undefined {
  const key = keyFor(studyInstanceUid);
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    logger.warn('saved measurements not restored', {
      reason: SavedStateRejected.StorageUnavailable,
    });
    return undefined;
  }
  if (raw === null) {
    return undefined;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return reject(key, SavedStateRejected.Unreadable);
  }
  if (!isRecord(data)) {
    return reject(key, SavedStateRejected.Unreadable);
  }
  if (data.version !== SavedStateVersion.V1) {
    return reject(key, SavedStateRejected.UnsupportedVersion);
  }
  const work = readWork(data);
  if (!work) {
    return reject(key, SavedStateRejected.Shape);
  }
  return { ...work, viewerReady: false };
}

/**
 * Writes at most once a second while the work keeps changing: at once for the first change after
 * a quiet second, and once more at its end. `flush` writes whatever is pending immediately. The
 * `baseline` counts as already written, so opening a study writes nothing.
 */
export function createSaver(studyInstanceUid: string, baseline: SavedWork): Saver {
  const key = keyFor(studyInstanceUid);
  let lastWritten = serialise(baseline);
  // Serialised only when written, not on every change: during a drag that is ~60 times a second.
  let pending: SavedWork | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Says whether it tried, so a window opens only after a real write: a change that equals what
  // is stored must not delay the next real one. A failed try counts, so retries are throttled too.
  const write = (): boolean => {
    if (pending === undefined) {
      return false;
    }
    const value = serialise(pending);
    pending = undefined;
    if (value === lastWritten) {
      return false;
    }
    try {
      sessionStorage.setItem(key, value);
      lastWritten = value;
    } catch {
      // lastWritten is left as it was, so the next change tries again.
      logger.warn('measurements not saved', { reason: SavedStateRejected.StorageUnavailable });
    }
    return true;
  };

  const endWindow = () => {
    timer = undefined;
    if (write()) {
      timer = setTimeout(endWindow, SAVE_INTERVAL_MS);
    }
  };

  return {
    schedule(work) {
      pending = work;
      if (timer === undefined && write()) {
        timer = setTimeout(endWindow, SAVE_INTERVAL_MS);
      }
    },
    flush() {
      write();
    },
    dispose() {
      write();
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
