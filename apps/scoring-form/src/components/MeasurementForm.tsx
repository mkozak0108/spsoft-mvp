import { useId } from 'react';
import { RowStatus, type MeasurementRow, type MeasurementState } from '../lib/measurements';

type MeasurementFormProps = {
  state: MeasurementState;
  addRow: () => void;
  activate: (id: string) => void;
};

const STATUS_TEXT: Record<RowStatus, string> = {
  [RowStatus.Pending]: 'Pending',
  [RowStatus.Drawing]: 'Drawing…',
  [RowStatus.Done]: 'Done',
};

export function MeasurementForm({ state, addRow, activate }: MeasurementFormProps) {
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
          />
        ))}
      </ol>
    </section>
  );
}

type MeasurementItemProps = {
  row: MeasurementRow;
  number: number;
  viewerReady: boolean;
  activate: (id: string) => void;
};

function MeasurementItem({ row, number, viewerReady, activate }: MeasurementItemProps) {
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
    </li>
  );
}
