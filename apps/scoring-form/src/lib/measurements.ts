import { BridgeCommand, BridgeEvent, BridgeTool } from '@bridge-contract';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { postToViewer, subscribeToViewer } from './bridge';
import { logger } from './logger';

export enum RowStatus {
  Pending = 'pending',
  Drawing = 'drawing',
  Done = 'done',
}

export enum MeasurementActionType {
  AddRow = 'addRow',
  Activate = 'activate',
  Cancel = 'cancel',
  ViewerReady = 'viewerReady',
  MeasurementAdded = 'measurementAdded',
}

export enum AreaTotalKind {
  None = 'none',
  Sum = 'sum',
  MixedUnits = 'mixedUnits',
}

enum DroppedBecause {
  UnknownRow = 'unknownRow',
  NotDrawing = 'notDrawing',
}

export type MeasurementRow = {
  id: string;
  status: RowStatus;
  value?: { area: number; unit: string };
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
  | { type: MeasurementActionType.MeasurementAdded; rowId: string; area: number; unit: string };

export const INITIAL_MEASUREMENT_STATE: MeasurementState = {
  rows: [],
  viewerReady: false,
  nextRowNumber: 1,
};

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
        rows: [...state.rows, { id: `row-${state.nextRowNumber}`, status: RowStatus.Pending }],
        nextRowNumber: state.nextRowNumber + 1,
      };
    case MeasurementActionType.Activate: {
      const target = state.rows.find((row) => row.id === action.id);
      if (!state.viewerReady || target?.status !== RowStatus.Pending) {
        return state;
      }
      // The viewer holds one pending row, so the host keeps one "Drawing…" row too (FR-005).
      return {
        ...state,
        rows: state.rows.map((row) => {
          if (row.id === action.id) {
            return { ...row, status: RowStatus.Drawing };
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
        })),
      };
    }
  }
}

export type AreaTotal =
  | { kind: AreaTotalKind.None }
  | { kind: AreaTotalKind.Sum; area: number; unit: string }
  | { kind: AreaTotalKind.MixedUnits };

// Derived on render, never stored, so it cannot drift from the rows. Only finished rows count.
export function computeAreaTotal(rows: readonly MeasurementRow[]): AreaTotal {
  const values = rows.flatMap((row) =>
    row.status === RowStatus.Done && row.value ? [row.value] : [],
  );
  if (values.length === 0) {
    return { kind: AreaTotalKind.None };
  }
  const { unit } = values[0];
  if (values.some((value) => value.unit !== unit)) {
    return { kind: AreaTotalKind.MixedUnits };
  }
  // Rows hold one-decimal values, so re-round to hide float noise such as 0.1 + 0.2.
  const area = Math.round(values.reduce((sum, value) => sum + value.area, 0) * 10) / 10;
  return { kind: AreaTotalKind.Sum, area, unit };
}

type UseMeasurementsOptions = {
  origin: string;
  studyInstanceUid: string;
  /** Must be stable: a new function re-subscribes to the viewer. */
  getSource: () => Window | null;
};

export function useMeasurements({ origin, studyInstanceUid, getSource }: UseMeasurementsOptions) {
  const [state, dispatch] = useReducer(measurementReducer, INITIAL_MEASUREMENT_STATE);

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
          if (message.event === BridgeEvent.ViewerReady) {
            dispatch({ type: MeasurementActionType.ViewerReady });
            return;
          }
          if (message.event !== BridgeEvent.MeasurementAdded) {
            return;
          }
          const { rowId, area, unit } = message.payload;
          const row = stateRef.current.rows.find((candidate) => candidate.id === rowId);
          if (row?.status !== RowStatus.Drawing) {
            // Never the payload: it is untrusted.
            logger.warn('ignored a measurement for a row that is not drawing', {
              reason: row ? DroppedBecause.NotDrawing : DroppedBecause.UnknownRow,
            });
            return;
          }
          dispatch({ type: MeasurementActionType.MeasurementAdded, rowId, area, unit });
        },
      }),
    [origin, studyInstanceUid, getSource],
  );

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
  }, [state.rows]);

  const addRow = useCallback(() => dispatch({ type: MeasurementActionType.AddRow }), []);

  const activate = useCallback(
    (id: string) => {
      const { rows, viewerReady } = stateRef.current;
      if (!viewerReady || rows.find((row) => row.id === id)?.status !== RowStatus.Pending) {
        return;
      }
      postToViewer({
        origin,
        getSource,
        command: {
          command: BridgeCommand.ActivateTool,
          payload: { rowId: id, tool: BridgeTool.EllipticalROI },
        },
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
        command: { command: BridgeCommand.DeactivateTool, payload: { rowId: id } },
      });
      dispatch({ type: MeasurementActionType.Cancel, id });
    },
    [origin, getSource],
  );

  return { state, addRow, activate, cancel };
}
