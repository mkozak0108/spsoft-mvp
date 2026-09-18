import { useState } from 'react';
import './App.css';
import { ScoringForm } from './components/ScoringForm';
import { StudyView } from './components/StudyView';
import { parseStudyLink } from './lib/studyLink';
import { parseViewerOrigin } from './lib/viewerLink';

function App() {
  // Read once per mount, not at module load, so tests can set the address
  // and stub the environment before rendering.
  const [studyLink] = useState(() => parseStudyLink(window.location.search));
  const [viewerOrigin] = useState(() => parseViewerOrigin(import.meta.env.VITE_VIEWER_URL));

  return (
    <main className="app">
      {studyLink.kind === 'valid' ? (
        <StudyView origin={viewerOrigin} studyInstanceUid={studyLink.studyInstanceUid} />
      ) : (
        <>
          <div className="viewer-frame" />
          <ScoringForm mode="waiting" />
        </>
      )}
    </main>
  );
}

export default App;
