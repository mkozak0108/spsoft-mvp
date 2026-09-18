import type { Ref } from 'react';

type ViewerFrameProps = {
  src: string;
  iframeRef: Ref<HTMLIFrameElement>;
};

// Embeds apps/viewer on one study. No `sandbox`: OHIF needs scripts and
// same-origin storage.
export function ViewerFrame({ src, iframeRef }: ViewerFrameProps) {
  return (
    <div className="viewer-frame">
      <iframe title="Study viewer" src={src} ref={iframeRef} />
    </div>
  );
}
