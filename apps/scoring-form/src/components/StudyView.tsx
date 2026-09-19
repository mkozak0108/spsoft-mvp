import { useCallback, useRef } from 'react';
import { buildViewerLink } from '../lib/viewerLink';
import { useViewerStatus } from '../lib/viewerStatus';
import { ScoringForm } from './ScoringForm';
import { ViewerFrame } from './ViewerFrame';

export function StudyView({ origin, studyInstanceUid }: { origin: string; studyInstanceUid: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const getSource = useCallback(() => iframeRef.current?.contentWindow ?? null, []);
  const { status } = useViewerStatus({ origin, studyInstanceUid, getSource });

  return (
    <>
      <ViewerFrame src={buildViewerLink(origin, studyInstanceUid)} iframeRef={iframeRef} />
      <ScoringForm viewerState={status.state} />
    </>
  );
}
