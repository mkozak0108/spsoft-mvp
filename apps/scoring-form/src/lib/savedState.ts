import type { EllipseGeometry } from '@bridge-contract';
import { hasAreaAndUnit, isEllipseGeometry, isRecord } from '../utils/guards';
import { logger } from './logger';
import { type MeasurementRow, type MeasurementState, RowStatus } from './measurements';

export enum SavedStateVersion {
  V1 = 1,
}

enum SavedStateRejected {
  StorageUnavailable = 'storageUnavailable',
  Unreadable = 'unreadable',
  UnsupportedVersion = 'unsupportedVersion',
  Shape = 'shape',
}

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

function pickEllipse({
  referencedImageId,
  FrameOfReferenceUID,
  viewPlaneNormal,
  viewUp,
  points,
}: EllipseGeometry): EllipseGeometry {
  return { referencedImageId, FrameOfReferenceUID, viewPlaneNormal, viewUp, points };
}

// Not at module level: measurements.ts imports this module, so RowStatus is not defined yet.
function isRowStatus(value: unknown): value is RowStatus {
  return (Object.values(RowStatus) as unknown[]).includes(value);
}

function readRow(value: unknown, nextRowNumber: number): MeasurementRow | undefined {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.number) ||
    value.number >= nextRowNumber ||
    value.id !== `row-${value.number}` ||
    !isRowStatus(value.status) ||
    (value.value !== undefined && !(isRecord(value.value) && hasAreaAndUnit(value.value))) ||
    (value.ellipse !== undefined && !isEllipseGeometry(value.ellipse))
  ) {
    return undefined;
  }
  const row: MeasurementRow = {
    id: value.id,
    number: value.number,
    status: value.status === RowStatus.Drawing ? RowStatus.Pending : value.status,
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
    if (!row || read.some((other) => other.id === row.id)) {
      return undefined;
    }
    read.push(row);
  }
  return { rows: read, nextRowNumber };
}

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

export function createSaver(studyInstanceUid: string, baseline: SavedWork): Saver {
  const key = keyFor(studyInstanceUid);
  let lastWritten = serialise(baseline);
  let pending: SavedWork | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // A window opens only after a real write, so a no-op doesn't delay the next change.
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
