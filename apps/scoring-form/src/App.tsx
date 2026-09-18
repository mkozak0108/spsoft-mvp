import { useEffect, useState } from 'react';
import './App.css';
import { ScoringForm } from './components/ScoringForm';
import { StudyView } from './components/StudyView';
import { ViewerAlert } from './components/ViewerAlert';
import { logger } from './lib/logger';
import { StudyLinkKind, parseStudyLink } from './lib/studyLink';
import { parseViewerOrigin } from './lib/viewerLink';
import { ViewerState } from './lib/viewerStatus';

type Notice = { title: string; text: string };

const NOT_CONFIGURED: Notice = {
  title: 'The viewer is not configured',
  text: "Set VITE_VIEWER_URL to the viewer's http or https address, then restart the app.",
};

const INVALID_LINK: Record<StudyLinkKind.Missing | StudyLinkKind.Malformed, Notice> = {
  [StudyLinkKind.Missing]: {
    title: 'No study selected',
    text: 'Open this page using a link that includes a study.',
  },
  [StudyLinkKind.Malformed]: {
    title: 'This study link is not valid',
    text: 'Check the link you were given and try again.',
  },
};

function readViewerOrigin(): string | null {
  try {
    return parseViewerOrigin(import.meta.env.VITE_VIEWER_URL);
  } catch {
    // Recovered visibly: the page shows the "not configured" alert, and App logs it.
    return null;
  }
}

// No study will be shown, which the form panel treats like a failed load.
function Unavailable(notice: Notice) {
  return (
    <>
      <div className="viewer-frame">
        <ViewerAlert {...notice} />
      </div>
      <ScoringForm viewerState={ViewerState.Failed} />
    </>
  );
}

function App() {
  // Read once per mount, not at module load, so tests can set the address and stub the
  // environment before rendering.
  const [studyLink] = useState(() => parseStudyLink(window.location.search));
  const [viewerOrigin] = useState(readViewerOrigin);

  useEffect(() => {
    if (viewerOrigin === null) {
      logger.error('invalid VITE_VIEWER_URL');
    } else if (studyLink.kind !== StudyLinkKind.Valid) {
      // Never the raw value: it is untrusted input.
      logger.warn('invalid study link', { kind: studyLink.kind });
    }
  }, [viewerOrigin, studyLink]);

  let content;
  if (viewerOrigin === null) {
    content = <Unavailable {...NOT_CONFIGURED} />;
  } else if (studyLink.kind !== StudyLinkKind.Valid) {
    content = <Unavailable {...INVALID_LINK[studyLink.kind]} />;
  } else {
    content = <StudyView origin={viewerOrigin} studyInstanceUid={studyLink.studyInstanceUid} />;
  }

  return <main className="app">{content}</main>;
}

export default App;
