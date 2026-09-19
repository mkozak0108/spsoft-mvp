import { useCallback, useRef } from 'react';
import { buildViewerLink } from '../lib/viewerLink';
import { useMeasurements } from '../lib/measurements';
import { useViewerStatus } from '../lib/viewerStatus';
import { MeasurementForm } from './MeasurementForm';
import { ScoringForm } from './ScoringForm';
import { ViewerFrame } from './ViewerFrame';

export function StudyView({ origin, studyInstanceUid }: { origin: string; studyInstanceUid: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const getSource = useCallback(() => iframeRef.current?.contentWindow ?? null, []);
  const { status } = useViewerStatus({ origin, studyInstanceUid, getSource });
  const { state, addRow, activate, cancel } = useMeasurements({ origin, studyInstanceUid, getSource });

  return (
    <>
      <ViewerFrame src={buildViewerLink(origin, studyInstanceUid)} iframeRef={iframeRef} />
      <ScoringForm viewerState={status.state}>
        <MeasurementForm state={state} addRow={addRow} activate={activate} cancel={cancel} />
      </ScoringForm>
    </>
  );
}
