// AI Solutions Tracker — SPA entrypoint. Initialises telemetry + deploy-recovery, exposes the
// compile-time build id for deploy-recovery, and mounts the app inside the root error boundary.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ErrorBoundary } from './shared/ErrorBoundary';
import { initAppInsights } from './shared/appInsights';
import { initDeployRecovery } from './shared/deployRecovery';

// Injected by webpack DefinePlugin at build time (replaces the inline build-id script, which
// a strict script-src CSP would block).
declare const __BUILD_ID__: string;
window.__BUILD_ID__ = __BUILD_ID__;

initAppInsights();
initDeployRecovery();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root — index.html is malformed.');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
