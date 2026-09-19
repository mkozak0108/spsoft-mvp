import { useId, type ReactNode } from 'react';
import { ViewerState } from '../lib/viewerStatus';

type ScoringFormProps = {
  viewerState: ViewerState;
  /** Shown once the study is loaded; nothing else is rendered for that state. */
  children?: ReactNode;
};

export function ScoringForm({ viewerState, children }: ScoringFormProps) {
  const headingId = useId();
  return (
    <section className="scoring-form" aria-labelledby={headingId}>
      <h2 id={headingId}>Scoring form</h2>
      {viewerState === ViewerState.Loading && (
        <p role="status">Waiting for the study to load…</p>
      )}
      {viewerState === ViewerState.Loaded && children}
      {viewerState === ViewerState.Failed && <p>Scoring is unavailable.</p>}
    </section>
  );
}
