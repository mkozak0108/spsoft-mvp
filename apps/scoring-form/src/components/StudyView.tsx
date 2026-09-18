import { useCallback, useRef } from 'react';
import { buildViewerLink } from '../lib/viewerLink';
import { ViewerState, useViewerStatus } from '../lib/viewerStatus';
import { ScoringForm } from './ScoringForm';
import { ScoringFormMode } from './scoringFormMode';
import { ViewerFrame } from './ViewerFrame';

const FORM_MODE: Record<ViewerState, ScoringFormMode> = {
  [ViewerState.Loading]: ScoringFormMode.Waiting,
  [ViewerState.Loaded]: ScoringFormMode.Ready,
  [ViewerState.Failed]: ScoringFormMode.Unavailable,
};

export function StudyView({ origin, studyInstanceUid }: { origin: string; studyInstanceUid: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const getSource = useCallback(() => iframeRef.current?.contentWindow ?? null, []);
  const { status, attempt, retry } = useViewerStatus({ origin, studyInstanceUid, getSource });

  return (
    <>
      {/* A new key on retry remounts the iframe, which reloads the viewer. */}
      <ViewerFrame
        key={attempt}
        src={buildViewerLink(origin, studyInstanceUid)}
        iframeRef={iframeRef}
        status={status}
        onRetry={retry}
      />
      <ScoringForm mode={FORM_MODE[status.state]} />
    </>
  );
}
