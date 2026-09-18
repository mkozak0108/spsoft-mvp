import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals, so Testing Library can't register its own
// automatic cleanup; unmount everything rendered by the previous test.
afterEach(() => {
  cleanup();
});
