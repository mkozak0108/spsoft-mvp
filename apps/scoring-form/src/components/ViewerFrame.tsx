import { StudyLoadFailureReason } from '@bridge-contract';
import type { ReactNode, Ref } from 'react';
import { type ViewerStatus, ViewerState } from '../lib/viewerStatus';

type Notice = { title: string; text: string };

const FAILURE_NOTICES: Record<StudyLoadFailureReason, Notice> = {
  [StudyLoadFailureReason.NotFound]: {
    title: 'Study not found',
    text: 'The image source has no study with this identifier.',
  },
  [StudyLoadFailureReason.SourceUnreachable]: {
    title: "Can't reach the image source",
    text: 'Check your connection and try again.',
  },
};

export function ViewerAlert({ title, text, children }: Notice & { children?: ReactNode }) {
  return (
    <div role="alert" className="viewer-notice">
      <p className="viewer-notice-title">{title}</p>
      <p>{text}</p>
      {children}
    </div>
  );
}

type ViewerFrameProps = {
  src: string;
  iframeRef: Ref<HTMLIFrameElement>;
  status: ViewerStatus;
  onRetry: () => void;
};

// No `sandbox`: OHIF needs scripts and same-origin storage.
export function ViewerFrame({ src, iframeRef, status, onRetry }: ViewerFrameProps) {
  return (
    <div className="viewer-frame">
      {/* Covered, not hidden, while loading: the viewer must lay out and render. */}
      <iframe
        title="Study viewer"
        src={src}
        ref={iframeRef}
        hidden={status.state === ViewerState.Failed}
      />
      {status.state === ViewerState.Loading && (
        <div role="status" className="viewer-notice">
          <p>Loading study…</p>
          {status.slow && <p>This is taking longer than it should.</p>}
        </div>
      )}
      {status.state === ViewerState.Failed && (
        <ViewerAlert {...FAILURE_NOTICES[status.reason]}>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </ViewerAlert>
      )}
    </div>
  );
}
