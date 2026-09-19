import type { ReactNode } from 'react';

type ViewerAlertProps = {
  title: string;
  text: string;
  children?: ReactNode;
};

// Used for link and configuration errors, which stop the viewer from ever mounting; not for
// viewer loading or study-load failures, which show the viewer's own screen (spec US2, revised).
export function ViewerAlert({ title, text, children }: ViewerAlertProps) {
  return (
    <div role="alert" className="viewer-notice">
      <p className="viewer-notice-title">{title}</p>
      <p>{text}</p>
      {children}
    </div>
  );
}
