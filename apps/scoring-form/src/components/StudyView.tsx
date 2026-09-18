import { useCallback, useRef } from 'react';
import { buildViewerLink } from '../lib/viewerLink';
import { useViewerStatus } from '../lib/viewerStatus';
import { ScoringForm } from './ScoringForm';
import { ViewerFrame } from './ViewerFrame';

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
      <ScoringForm viewerState={status.state} />
    </>
  );
}
