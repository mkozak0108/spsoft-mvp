import { useEffect, useState } from 'react';
import './App.css';
import { ScoringForm } from './components/ScoringForm';
import { StudyView } from './components/StudyView';
import { ViewerAlert } from './components/ViewerFrame';
import { logger } from './lib/logger';
import { parseStudyLink } from './lib/studyLink';
import { parseViewerOrigin } from './lib/viewerLink';

const NOT_CONFIGURED = {
  title: 'The viewer is not configured',
  text: "Set VITE_VIEWER_URL to the viewer's http or https address, then restart the app.",
};

const INVALID_LINK = {
  missing: {
    title: 'No study selected',
    text: 'Open this page using a link that includes a study.',
  },
  malformed: {
    title: 'This study link is not valid',
    text: 'Check the link you were given and try again.',
  },
};

/** The viewer's origin, or null when VITE_VIEWER_URL is invalid. */
function readViewerOrigin(): string | null {
  try {
    return parseViewerOrigin(import.meta.env.VITE_VIEWER_URL);
  } catch {
    // Recovered visibly: the page shows the "not configured" alert, and the
    // effect in App logs it.
    return null;
  }
}

/** No study can be shown: an alert where the viewer would be. */
function Unavailable({ title, text }: { title: string; text: string }) {
  return (
    <>
      <div className="viewer-frame">
        <ViewerAlert title={title} text={text} />
      </div>
      <ScoringForm mode="unavailable" />
    </>
  );
}

function App() {
  // Read once per mount, not at module load, so tests can set the address
  // and stub the environment before rendering.
  const [studyLink] = useState(() => parseStudyLink(window.location.search));
  const [viewerOrigin] = useState(readViewerOrigin);

  useEffect(() => {
    if (viewerOrigin === null) {
      logger.error('invalid VITE_VIEWER_URL');
    } else if (studyLink.kind !== 'valid') {
      // Never the raw value: it is untrusted input.
      logger.warn('invalid study link', { kind: studyLink.kind });
    }
  }, [viewerOrigin, studyLink]);

  let content;
  if (viewerOrigin === null) {
    content = <Unavailable {...NOT_CONFIGURED} />;
  } else if (studyLink.kind !== 'valid') {
    content = <Unavailable {...INVALID_LINK[studyLink.kind]} />;
  } else {
    content = <StudyView origin={viewerOrigin} studyInstanceUid={studyLink.studyInstanceUid} />;
  }

  return <main className="app">{content}</main>;
}

export default App;
