import { useId } from 'react';
import {
  RowStatus,
  computeAreaTotals,
  type AreaSum,
  type MeasurementRow,
  type MeasurementState,
} from '../lib/measurements';

type MeasurementFormProps = {
  state: MeasurementState;
  addRow: () => void;
  activate: (id: string) => void;
  cancel: (id: string) => void;
};

const STATUS_TEXT: Record<RowStatus, string> = {
  [RowStatus.Pending]: 'Pending',
  [RowStatus.Drawing]: 'Drawing…',
  [RowStatus.Done]: 'Done',
};

export function MeasurementForm({ state, addRow, activate, cancel }: MeasurementFormProps) {
  const headingId = useId();
  const { rows, viewerReady } = state;

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId}>Measurements</h3>
      <button type="button" onClick={addRow}>
        Add measurement
      </button>
      {!viewerReady && <p role="status">Waiting for the viewer to be ready…</p>}
      <ol className="measurement-list">
        {rows.map((row, index) => (
          <MeasurementItem
            key={row.id}
            row={row}
            number={index + 1}
            viewerReady={viewerReady}
            activate={activate}
            cancel={cancel}
          />
        ))}
      </ol>
      <p role="status" className="area-total">
        {totalText(computeAreaTotals(rows))}
      </p>
    </section>
  );
}

function totalText(sums: AreaSum[]): string {
  if (sums.length === 0) {
    return 'Total area: —';
  }
  return `Total area: ${sums.map(({ area, unit }) => `${area.toFixed(1)} ${unit}`).join(' + ')}`;
}

type MeasurementItemProps = {
  row: MeasurementRow;
  number: number;
  viewerReady: boolean;
  activate: (id: string) => void;
  cancel: (id: string) => void;
};

function MeasurementItem({ row, number, viewerReady, activate, cancel }: MeasurementItemProps) {
  return (
    <li className="measurement-row">
      <span className="measurement-name">Measurement {number}</span>
      <span>{STATUS_TEXT[row.status]}</span>
      {row.value && (
        <span>
          {row.value.area.toFixed(1)} {row.value.unit}
        </span>
      )}
      {row.status === RowStatus.Done && !row.value && <span>No area</span>}
      {row.status === RowStatus.Pending && (
        <button type="button" disabled={!viewerReady} onClick={() => activate(row.id)}>
          Activate
        </button>
      )}
      {row.status === RowStatus.Drawing && (
        <button type="button" onClick={() => cancel(row.id)}>
          Cancel
        </button>
      )}
    </li>
  );
}
