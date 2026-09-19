import { useId } from 'react';
import {
  AreaTotalKind,
  RowStatus,
  computeAreaTotal,
  type AreaTotal,
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
        {totalText(computeAreaTotal(rows))}
      </p>
    </section>
  );
}

function totalText(total: AreaTotal): string {
  switch (total.kind) {
    case AreaTotalKind.None:
      return 'Total area: —';
    case AreaTotalKind.Sum:
      return `Total area: ${total.area.toFixed(1)} ${total.unit}`;
    case AreaTotalKind.MixedUnits:
      return "Total area: can't be added up because the units differ";
  }
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
