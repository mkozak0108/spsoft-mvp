import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./lib/logger');

const VIEWER_ORIGIN = 'http://viewer.test:3000';
const STUDY_UID = '1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5';
const FORM_CONTROLS = ['textbox', 'combobox', 'checkbox', 'radio', 'spinbutton'] as const;

function openPage(search: string) {
  window.history.replaceState(null, '', `/${search}`);
  return render(<App />);
}

function viewerFrame(): HTMLIFrameElement {
  return screen.getByTitle('Study viewer') as HTMLIFrameElement;
}

function scoringForm(): HTMLElement {
  return screen.getByRole('region', { name: 'Scoring form' });
}

/** Posts a bridge event from the current viewer iframe, as the viewer would. */
function postFromViewer(event: 'studyLoaded'): void;
function postFromViewer(event: 'studyLoadFailed', reason: string): void;
function postFromViewer(event: string, reason?: string) {
  const payload = reason === undefined ? { StudyInstanceUID: STUDY_UID } : { StudyInstanceUID: STUDY_UID, reason };
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: VIEWER_ORIGIN,
        source: viewerFrame().contentWindow,
        data: { source: 'spsoft-mvp-viewer', type: 'event', event, payload },
      }),
    );
  });
}

beforeEach(() => {
  vi.stubEnv('VITE_VIEWER_URL', VIEWER_ORIGIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('US1: open a study next to the scoring form', () => {
  it('embeds the viewer on the linked study, next to the scoring form (US1-1)', () => {
    openPage(`?StudyInstanceUIDs=${STUDY_UID}`);

    expect(viewerFrame().src).toBe(`${VIEWER_ORIGIN}/viewer?StudyInstanceUIDs=${STUDY_UID}`);
    expect(scoringForm()).toBeTruthy();
  });

  it('shows the study and the form with no status or error once loaded (US1-1)', () => {
    openPage(`?StudyInstanceUIDs=${STUDY_UID}`);

    postFromViewer('studyLoaded');

    expect(viewerFrame()).toBeTruthy();
    expect(scoringForm()).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a placeholder and no inputs in the form once loaded (US1-3)', () => {
    openPage(`?StudyInstanceUIDs=${STUDY_UID}`);

    postFromViewer('studyLoaded');

    const form = scoringForm();
    expect(within(form).getByText('Scoring is not available yet.')).toBeTruthy();
    for (const role of FORM_CONTROLS) {
      expect(within(form).queryByRole(role)).toBeNull();
    }
  });

  it('keeps the form unchanged after later viewer messages (US1-2)', () => {
    openPage(`?StudyInstanceUIDs=${STUDY_UID}`);
    postFromViewer('studyLoaded');
    const before = scoringForm().textContent;

    postFromViewer('studyLoaded');
    postFromViewer('studyLoadFailed', 'notFound');

    expect(scoringForm().textContent).toBe(before);
  });

  it('opens the same study again after a reload (US1-4)', () => {
    const first = openPage(`?StudyInstanceUIDs=${STUDY_UID}`);
    const src = viewerFrame().src;
    first.unmount();

    render(<App />);

    expect(viewerFrame().src).toBe(src);
  });
});
