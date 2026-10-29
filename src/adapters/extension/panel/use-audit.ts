import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AuditController, AuditState } from './audit-controller';

export const ControllerContext = createContext<AuditController | null>(null);

export function useController(): AuditController {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error('useController must be used inside <ControllerContext.Provider>.');
  return controller;
}

export function useAuditState(): AuditState {
  const controller = useController();
  return useSyncExternalStore(controller.subscribe, controller.getState);
}
