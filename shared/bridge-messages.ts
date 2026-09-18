/**
 * postMessage contract between apps/scoring-form (the host, in the parent
 * window) and apps/viewer (the OHIF fork, in the iframe). Types only, no
 * runtime code — see README.md.
 *
 * The viewer side is implemented in apps/viewer/extensions/bridge, a
 * separate package manager (pnpm) that can't import this file directly;
 * keep the two in sync by hand.
 */

/** Sent by the host app into the viewer iframe to run an OHIF command. */
export type BridgeCommandMessage = {
  source: 'spsoft-host';
  type: 'command';
  command: string;
  commandOptions?: Record<string, unknown>;
  context?: string;
};

/** Sent by the viewer iframe back to the host app when something happens. */
export type BridgeEventMessage = {
  source: 'spsoft-viewer';
  type: 'event';
  event: BridgeEventName;
  payload?: unknown;
};

export type BridgeEventName =
  | 'ready'
  | 'layoutChanged'
  | 'measurementAdded'
  | 'measurementUpdated'
  | 'measurementRemoved'
  | 'activeViewportChanged'
  | 'commandError';
