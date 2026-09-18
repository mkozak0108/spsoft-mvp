import { useId } from 'react';

type ScoringFormProps = {
  /** `waiting` while no study is on screen; `ready` once it is. */
  mode: 'waiting' | 'ready';
};

// The right-hand panel where the doctor will score the open study. Scoring
// fields come in a later feature; for now it only says so.
export function ScoringForm({ mode }: ScoringFormProps) {
  const headingId = useId();
  return (
    <section className="scoring-form" aria-labelledby={headingId}>
      <h2 id={headingId}>Scoring form</h2>
      {mode === 'ready' && <p>Scoring is not available yet.</p>}
    </section>
  );
}
