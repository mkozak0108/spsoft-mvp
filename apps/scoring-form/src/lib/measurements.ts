import { buildCommand } from '@bridge-builders';
import {
  BridgeCommand,
  BridgeEvent,
  BridgeTool,
  type EllipseGeometry,
  MeasurementChange,
  type Point3,
} from '@bridge-contract';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { postToViewer, subscribeToViewer } from './bridge';
import { logger } from './logger';
import { createSaver, loadSavedState, type Saver } from './savedState';

export enum RowStatus {
  Pending = 'pending',
  Drawing = 'drawing',
  Done = 'done',
  /** Restored from a save, but the viewer could not put its ellipse back. */
  Failed = 'failed',
}

export enum MeasurementActionType {
  AddRow = 'addRow',
  Activate = 'activate',
  Cancel = 'cancel',
  ViewerReady = 'viewerReady',
  MeasurementAdded = 'measurementAdded',
  MeasurementAreaChanged = 'measurementAreaChanged',
  MeasurementAreaUnavailable = 'measurementAreaUnavailable',
  MeasurementRemoved = 'measurementRemoved',
  MeasurementRestoreFailed = 'measurementRestoreFailed',
}

enum DroppedBecause {
  UnknownRow = 'unknownRow',
  NotDrawing = 'notDrawing',
  NotDone = 'notDone',
}

export type MeasurementRow = {
  id: string;
  /** Shown as "Measurement N". Never reused, so removing a row renames none of the others. */
  number: number;
  status: RowStatus;
  /** Absent on a Done row whose ellipse can't be measured right now (partly off the image). */
  value?: { area: number; unit: string };
  /** Where the row's ellipse is, kept so it can be drawn again after a reload. Only Done rows. */
  ellipse?: EllipseGeometry;
};

export type MeasurementState = {
  rows: readonly MeasurementRow[];
  viewerReady: boolean;
  /** Ids come from this counter, so a row's id is never reused (research R2). */
  nextRowNumber: number;
};

export type MeasurementAction =
  | { type: MeasurementActionType.AddRow }
  | { type: MeasurementActionType.Activate; id: string }
  | { type: MeasurementActionType.Cancel; id: string }
  | { type: MeasurementActionType.ViewerReady }
  | {
      type: MeasurementActionType.MeasurementAdded;
      rowId: string;
      area: number;
      unit: string;
      ellipse: EllipseGeometry;
    }
  | {
      type: MeasurementActionType.MeasurementAreaChanged;
      rowId: string;
      area: number;
      unit: string;
      ellipse: EllipseGeometry;
    }
  | {
      type: MeasurementActionType.MeasurementAreaUnavailable;
      rowId: string;
      ellipse: EllipseGeometry;
    }
  | { type: MeasurementActionType.MeasurementRemoved; rowId: string }
  | { type: MeasurementActionType.MeasurementRestoreFailed; rowId: string };

export const INITIAL_MEASUREMENT_STATE: MeasurementState = {
  rows: [],
  viewerReady: false,
  nextRowNumber: 1,
};

/** A not-restored row is drawn again the same way a new one is drawn the first time. */
export function isActivatable(row: MeasurementRow | undefined): boolean {
  return row?.status === RowStatus.Pending || row?.status === RowStatus.Failed;
}

function mapRow(
  rows: readonly MeasurementRow[],
  id: string,
  change: (row: MeasurementRow) => MeasurementRow,
): readonly MeasurementRow[] {
  return rows.map((row) => (row.id === id ? change(row) : row));
}

// The viewer keeps its own copy of the area at full precision; the form stores one decimal so
// what is shown and what is summed are the same numbers (research R8).
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function isSamePoint(a: Point3, b: Point3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function isSameEllipse(a: EllipseGeometry | undefined, b: EllipseGeometry): boolean {
  return (
    a !== undefined &&
    a.referencedImageId === b.referencedImageId &&
    a.FrameOfReferenceUID === b.FrameOfReferenceUID &&
    isSamePoint(a.viewPlaneNormal, b.viewPlaneNormal) &&
    isSamePoint(a.viewUp, b.viewUp) &&
    a.points.every((point, i) => isSamePoint(point, b.points[i]))
  );
}

// An action outside its condition returns the state unchanged, so a stale or duplicate message
// can never corrupt a row.
export function measurementReducer(
  state: MeasurementState,
  action: MeasurementAction,
): MeasurementState {
  switch (action.type) {
    case MeasurementActionType.AddRow:
      return {
        ...state,
        rows: [
          ...state.rows,
          {
            id: `row-${state.nextRowNumber}`,
            number: state.nextRowNumber,
            status: RowStatus.Pending,
          },
        ],
        nextRowNumber: state.nextRowNumber + 1,
      };
    case MeasurementActionType.Activate: {
      const target = state.rows.find((row) => row.id === action.id);
      if (!state.viewerReady || !isActivatable(target)) {
        return state;
      }
      // The viewer holds one pending row, so the host keeps one "Drawing…" row too (FR-005).
      return {
        ...state,
        rows: state.rows.map((row) => {
          if (row.id === action.id) {
            // A not-restored row starts over; its saved value belongs to an ellipse that is gone.
            return { ...row, status: RowStatus.Drawing, value: undefined };
          }
          return row.status === RowStatus.Drawing ? { ...row, status: RowStatus.Pending } : row;
        }),
      };
    }
    case MeasurementActionType.Cancel: {
      if (state.rows.find((row) => row.id === action.id)?.status !== RowStatus.Drawing) {
        return state;
      }
      return {
        ...state,
        rows: mapRow(state.rows, action.id, (row) => ({ ...row, status: RowStatus.Pending })),
      };
    }
    case MeasurementActionType.ViewerReady:
      // A viewer that reloaded has lost the pending activation, so a "Drawing…" row would wait
      // for an ellipse that can never arrive (FR-008).
      return {
        ...state,
        viewerReady: true,
        rows: state.rows.map((row) =>
          row.status === RowStatus.Drawing ? { ...row, status: RowStatus.Pending } : row,
        ),
      };
    case MeasurementActionType.MeasurementAdded: {
      const target = state.rows.find((row) => row.id === action.rowId);
      if (target?.status !== RowStatus.Drawing) {
        return state;
      }
      return {
        ...state,
        rows: mapRow(state.rows, action.rowId, (row) => ({
          ...row,
          status: RowStatus.Done,
          value: { area: roundToOneDecimal(action.area), unit: action.unit },
          ellipse: action.ellipse,
        })),
      };
    }
    case MeasurementActionType.MeasurementAreaChanged: {
      const target = state.rows.find((row) => row.id === action.rowId);
      if (target?.status !== RowStatus.Done) {
        return state;
      }
      const area = roundToOneDecimal(action.area);
      // Two exact areas can round to the value already shown; the same state skips a re-render.
      // The shape counts too: a move with no resize shows nothing new, but it has to reach the
      // saved state, or the ellipse would come back where it was before the move.
      if (
        target.value?.area === area &&
        target.value.unit === action.unit &&
        isSameEllipse(target.ellipse, action.ellipse)
      ) {
        return state;
      }
      return {
        ...state,
        rows: mapRow(state.rows, action.rowId, (row) => ({
          ...row,
          value: { area, unit: action.unit },
          ellipse: action.ellipse,
        })),
      };
    }
    case MeasurementActionType.MeasurementAreaUnavailable: {
      const target = state.rows.find((row) => row.id === action.rowId);
      if (target?.status !== RowStatus.Done) {
        return state;
      }
      // An ellipse dragged further off the image has no area to report, but it has still moved.
      if (!target.value && isSameEllipse(target.ellipse, action.ellipse)) {
        return state;
      }
      return {
        ...state,
        rows: mapRow(state.rows, action.rowId, (row) => ({
          ...row,
          value: undefined,
          ellipse: action.ellipse,
        })),
      };
    }
    case MeasurementActionType.MeasurementRemoved: {
      if (state.rows.find((row) => row.id === action.rowId)?.status !== RowStatus.Done) {
        return state;
      }
      return { ...state, rows: state.rows.filter((row) => row.id !== action.rowId) };
    }
    case MeasurementActionType.MeasurementRestoreFailed: {
      if (state.rows.find((row) => row.id === action.rowId)?.status !== RowStatus.Done) {
        return state;
      }
      // The value stays, so the doctor sees what they had. The geometry goes, so a further
      // reload does not try the same failing ellipse again.
      return {
        ...state,
        rows: mapRow(state.rows, action.rowId, (row) => ({
          ...row,
          status: RowStatus.Failed,
          ellipse: undefined,
        })),
      };
    }
  }
}

export type AreaSum = { area: number; unit: string };

// Derived on render, never stored, so it cannot drift from the rows. Only finished rows with a
// value count, so one whose ellipse is partly off the image drops out until it has an area again.
// One sum per unit, in the order the units first appear: mm² and px² are not comparable.
export function computeAreaTotals(rows: readonly MeasurementRow[]): AreaSum[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    if (row.status === RowStatus.Done && row.value) {
      sums.set(row.value.unit, (sums.get(row.value.unit) ?? 0) + row.value.area);
    }
  }
  // Rows hold one-decimal values, so re-round to hide float noise such as 0.1 + 0.2.
  return [...sums].map(([unit, area]) => ({ unit, area: Math.round(area * 10) / 10 }));
}

type UseMeasurementsOptions = {
  origin: string;
  studyInstanceUid: string;
  /** Must be stable: a new function re-subscribes to the viewer. */
  getSource: () => Window | null;
};

export function useMeasurements({ origin, studyInstanceUid, getSource }: UseMeasurementsOptions) {
  // Read once per mount, never during a render.
  const [state, dispatch] = useReducer(
    measurementReducer,
    studyInstanceUid,
    (uid) => loadSavedState(uid) ?? INITIAL_MEASUREMENT_STATE,
  );

  // The handlers below decide from the latest state without re-subscribing on every change.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(
    () =>
      subscribeToViewer({
        origin,
        expectedStudyInstanceUid: studyInstanceUid,
        getSource,
        onMessage: (message) => {
          switch (message.event) {
            case BridgeEvent.ViewerReady: {
              dispatch({ type: MeasurementActionType.ViewerReady });
              // Sent on every ready, not only the first: a viewer that has just announced itself
              // has no annotations, so nothing can be drawn twice (research R7).
              const measurements = stateRef.current.rows.flatMap((row) =>
                row.ellipse ? [{ rowId: row.id, ellipse: row.ellipse }] : [],
              );
              if (measurements.length > 0) {
                postToViewer({
                  origin,
                  getSource,
                  message: buildCommand(BridgeCommand.RestoreMeasurements, {
                    StudyInstanceUID: studyInstanceUid,
                    measurements,
                  }),
                });
              }
              return;
            }
            case BridgeEvent.MeasurementAdded: {
              const { rowId, area, unit, ellipse } = message.payload;
              const row = stateRef.current.rows.find((candidate) => candidate.id === rowId);
              if (row?.status !== RowStatus.Drawing) {
                // Never the payload: it is untrusted.
                logger.warn('ignored a measurement for a row that is not drawing', {
                  reason: row ? DroppedBecause.NotDrawing : DroppedBecause.UnknownRow,
                });
                return;
              }
              dispatch({
                type: MeasurementActionType.MeasurementAdded,
                rowId,
                area,
                unit,
                ellipse,
              });
              return;
            }
            case BridgeEvent.MeasurementUpdated:
            case BridgeEvent.MeasurementRemoved:
            case BridgeEvent.MeasurementRestoreFailed: {
              const { rowId } = message.payload;
              const row = stateRef.current.rows.find((candidate) => candidate.id === rowId);
              if (row?.status !== RowStatus.Done) {
                logger.warn('ignored a measurement change for a row that is not done', {
                  reason: row ? DroppedBecause.NotDone : DroppedBecause.UnknownRow,
                });
                return;
              }
              if (message.event === BridgeEvent.MeasurementRemoved) {
                dispatch({ type: MeasurementActionType.MeasurementRemoved, rowId });
                return;
              }
              if (message.event === BridgeEvent.MeasurementRestoreFailed) {
                dispatch({ type: MeasurementActionType.MeasurementRestoreFailed, rowId });
                return;
              }
              // Area and shape changes are not logged: they are not transitions, and during a
              // drag they arrive with every mouse move.
              switch (message.payload.change) {
                case MeasurementChange.AreaChanged:
                  dispatch({
                    type: MeasurementActionType.MeasurementAreaChanged,
                    rowId,
                    area: message.payload.area,
                    unit: message.payload.unit,
                    ellipse: message.payload.ellipse,
                  });
                  return;
                case MeasurementChange.AreaUnavailable:
                  dispatch({
                    type: MeasurementActionType.MeasurementAreaUnavailable,
                    rowId,
                    ellipse: message.payload.ellipse,
                  });
                  return;
              }
            }
          }
        },
      }),
    [origin, studyInstanceUid, getSource],
  );

  const saverRef = useRef<Saver | null>(null);
  useEffect(() => {
    const saver = createSaver(studyInstanceUid, stateRef.current);
    saverRef.current = saver;
    // The last moments a page can rely on seeing (research R10). `beforeunload` and `unload` would
    // keep it out of the back/forward cache and are not fired reliably.
    const onPageHide = () => saver.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saver.flush();
      }
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      saver.dispose();
      saverRef.current = null;
    };
  }, [studyInstanceUid]);

  const { rows, nextRowNumber } = state;
  useEffect(() => {
    saverRef.current?.schedule({ rows, nextRowNumber });
  }, [rows, nextRowNumber]);

  // Logged here rather than in the reducer, which must stay pure. Never areas or units.
  const previousRows = useRef<readonly MeasurementRow[]>(state.rows);
  useEffect(() => {
    const before = previousRows.current;
    previousRows.current = state.rows;
    for (const row of state.rows) {
      const from = before.find((candidate) => candidate.id === row.id)?.status ?? null;
      if (from !== row.status) {
        logger.info('measurement row', { rowId: row.id, from, to: row.status });
      }
    }
    for (const row of before) {
      if (!state.rows.some((candidate) => candidate.id === row.id)) {
        logger.info('measurement row removed', { rowId: row.id });
      }
    }
  }, [state.rows]);

  const addRow = useCallback(() => dispatch({ type: MeasurementActionType.AddRow }), []);

  const activate = useCallback(
    (id: string) => {
      const { rows, viewerReady } = stateRef.current;
      if (!viewerReady || !isActivatable(rows.find((row) => row.id === id))) {
        return;
      }
      postToViewer({
        origin,
        getSource,
        message: buildCommand(BridgeCommand.ActivateTool, {
          rowId: id,
          tool: BridgeTool.EllipticalROI,
        }),
      });
      dispatch({ type: MeasurementActionType.Activate, id });
    },
    [origin, getSource],
  );

  const cancel = useCallback(
    (id: string) => {
      if (stateRef.current.rows.find((row) => row.id === id)?.status !== RowStatus.Drawing) {
        return;
      }
      postToViewer({
        origin,
        getSource,
        message: buildCommand(BridgeCommand.DeactivateTool, { rowId: id }),
      });
      dispatch({ type: MeasurementActionType.Cancel, id });
    },
    [origin, getSource],
  );

  return { state, addRow, activate, cancel };
}
