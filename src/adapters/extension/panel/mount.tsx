import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Bridge } from '../../bridge/types';
import { App } from './App';
import { AuditController } from './audit-controller';
import { ControllerContext } from './use-audit';
import './styles/tokens.css';
import './styles/ui.css';
import './styles/panel.css';

/** Mounts the panel against any Bridge (Chrome in the extension, Preview on the dev page). */
export function mountPanel(container: HTMLElement, bridge: Bridge): AuditController {
  const controller = new AuditController(bridge);
  void controller.init();
  createRoot(container).render(
    <StrictMode>
      <ControllerContext.Provider value={controller}>
        <App />
      </ControllerContext.Provider>
    </StrictMode>,
  );
  return controller;
}
