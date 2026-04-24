

let maintenanceActive = false;
let maintenanceStartedAt: number | null = null;
let drainTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let checkIntervalHandle: ReturnType<typeof setInterval> | null = null;

export function isMaintenanceActive(): boolean {
  return maintenanceActive;
}

export function getMaintenanceState(): { active: boolean; startedAt: number | null } {
  return { active: maintenanceActive, startedAt: maintenanceStartedAt };
}

export function activateMaintenance(): void {
  maintenanceActive = true;
  maintenanceStartedAt = Date.now();
}

export function deactivateMaintenance(): void {
  maintenanceActive = false;
  maintenanceStartedAt = null;
  if (drainTimeoutHandle) {
    clearTimeout(drainTimeoutHandle);
    drainTimeoutHandle = null;
  }
  if (checkIntervalHandle) {
    clearInterval(checkIntervalHandle);
    checkIntervalHandle = null;
  }
}

export function setDrainTimeout(handle: ReturnType<typeof setTimeout>): void {
  drainTimeoutHandle = handle;
}

export function setCheckInterval(handle: ReturnType<typeof setInterval>): void {
  checkIntervalHandle = handle;
}
