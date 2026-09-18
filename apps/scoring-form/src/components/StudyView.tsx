import { useCallback, useRef } from 'react';
import { buildViewerLink } from '../lib/viewerLink';
import { type ViewerStatus, useViewerStatus } from '../lib/viewerStatus';
import { ScoringForm } from './ScoringForm';
import { ViewerFrame } from './ViewerFrame';

type StudyViewProps = {
  origin: string;
  studyInstanceUid: string;
};

const PANEL_MODE = {
  loading: 'waiting',
  loaded: 'ready',
  failed: 'unavailable',
} as const satisfies Record<ViewerStatus['status'], string>;

// The screen for a valid study link: the viewer on the left, the form panel
// on the right, both driven by the viewer's status.
export function StudyView({ origin, studyInstanceUid }: StudyViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const getSource = useCallback(() => iframeRef.current?.contentWindow ?? null, []);
  const { status, attempt, retry } = useViewerStatus({ origin, studyInstanceUid, getSource });

  return (
    <>
      {/* A new key on retry remounts the iframe, reloading the viewer. */}
      <ViewerFrame
        key={attempt}
        src={buildViewerLink(origin, studyInstanceUid)}
        iframeRef={iframeRef}
        status={status}
        onRetry={retry}
      />
      <ScoringForm mode={PANEL_MODE[status.status]} />
    </>
  );
}
