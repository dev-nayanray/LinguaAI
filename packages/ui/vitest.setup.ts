import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import '@testing-library/jest-dom/vitest';

// RTL's own auto-cleanup only self-registers in vitest's "globals" mode
// (a global `afterEach`); this repo deliberately imports test functions
// explicitly everywhere (see every other package's vitest.config.ts), so
// cleanup is wired up here instead.
afterEach(cleanup);
