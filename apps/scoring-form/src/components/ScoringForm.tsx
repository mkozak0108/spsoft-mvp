import { useId } from 'react';
import { ViewerState } from '../lib/viewerStatus';

export function ScoringForm({ viewerState }: { viewerState: ViewerState }) {
  const headingId = useId();
  return (
    <section className="scoring-form" aria-labelledby={headingId}>
      <h2 id={headingId}>Scoring form</h2>
      {viewerState === ViewerState.Loading && (
        <p role="status">Waiting for the study to load…</p>
      )}
      {viewerState === ViewerState.Loaded && <p>Scoring is not available yet.</p>}
      {viewerState === ViewerState.Failed && <p>Scoring is unavailable.</p>}
    </section>
  );
}
