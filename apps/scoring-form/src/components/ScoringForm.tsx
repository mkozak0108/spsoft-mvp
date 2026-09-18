import { useId } from 'react';

type ScoringFormProps = {
  /**
   * `waiting` while the study loads, `ready` once it's on screen, and
   * `unavailable` when there is no study to score (FR-004).
   */
  mode: 'waiting' | 'ready' | 'unavailable';
};

// The right-hand panel where the doctor will score the open study. Scoring
// fields come in a later feature; for now it only says so.
export function ScoringForm({ mode }: ScoringFormProps) {
  const headingId = useId();
  return (
    <section className="scoring-form" aria-labelledby={headingId}>
      <h2 id={headingId}>Scoring form</h2>
      {mode === 'waiting' && <p role="status">Waiting for the study to load…</p>}
      {mode === 'ready' && <p>Scoring is not available yet.</p>}
      {mode === 'unavailable' && <p>Scoring is unavailable.</p>}
    </section>
  );
}
