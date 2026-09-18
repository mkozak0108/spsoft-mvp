import { useCallback, useRef } from 'react';
import { buildViewerLink } from '../lib/viewerLink';
import { useViewerStatus } from '../lib/viewerStatus';
import { ScoringForm } from './ScoringForm';
import { ViewerFrame } from './ViewerFrame';

type StudyViewProps = {
  origin: string;
  studyInstanceUid: string;
};

// The screen for a valid study link: the viewer on the left, the form panel
// on the right, both driven by the viewer's status.
export function StudyView({ origin, studyInstanceUid }: StudyViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const getSource = useCallback(() => iframeRef.current?.contentWindow ?? null, []);
  const { status } = useViewerStatus({ origin, studyInstanceUid, getSource });

  return (
    <>
      <ViewerFrame src={buildViewerLink(origin, studyInstanceUid)} iframeRef={iframeRef} />
      <ScoringForm mode={status.status === 'loaded' ? 'ready' : 'waiting'} />
    </>
  );
}
