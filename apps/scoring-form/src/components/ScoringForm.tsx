import { useId } from 'react';
import { ScoringFormMode } from './scoringFormMode';

export function ScoringForm({ mode }: { mode: ScoringFormMode }) {
  const headingId = useId();
  return (
    <section className="scoring-form" aria-labelledby={headingId}>
      <h2 id={headingId}>Scoring form</h2>
      {mode === ScoringFormMode.Waiting && <p role="status">Waiting for the study to load…</p>}
      {mode === ScoringFormMode.Ready && <p>Scoring is not available yet.</p>}
      {mode === ScoringFormMode.Unavailable && <p>Scoring is unavailable.</p>}
    </section>
  );
}
