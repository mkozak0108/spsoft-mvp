import type { StudyLoadFailureReason } from '@bridge-contract';
import type { ReactNode, Ref } from 'react';
import type { ViewerStatus } from '../lib/viewerStatus';

const FAILURE_MESSAGES: Record<StudyLoadFailureReason, { title: string; text: string }> = {
  notFound: {
    title: 'Study not found',
    text: 'The image source has no study with this identifier.',
  },
  sourceUnreachable: {
    title: "Can't reach the image source",
    text: 'Check your connection and try again.',
  },
};

type ViewerAlertProps = {
  title: string;
  text: string;
  children?: ReactNode;
};

/** An error shown in the viewer column, over or instead of the viewer. */
export function ViewerAlert({ title, text, children }: ViewerAlertProps) {
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

// Embeds apps/viewer on one study, with its loading and failure states.
// No `sandbox`: OHIF needs scripts and same-origin storage.
export function ViewerFrame({ src, iframeRef, status, onRetry }: ViewerFrameProps) {
  return (
    <div className="viewer-frame">
      {/* Covered, not hidden, while loading: the viewer must lay out and render. */}
      <iframe title="Study viewer" src={src} ref={iframeRef} hidden={status.status === 'failed'} />
      {status.status === 'loading' && (
        <div role="status" className="viewer-notice">
          <p>Loading study…</p>
          {status.slow && <p>This is taking longer than it should.</p>}
        </div>
      )}
      {status.status === 'failed' && (
        <ViewerAlert {...FAILURE_MESSAGES[status.reason]}>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </ViewerAlert>
      )}
    </div>
  );
}
