export interface SavedPunch {
  employeeId: string;
  offlineToken: string;
  idempotencyKey: string;
  type: "WORK_IN" | "WORK_OUT";
  occurredAt: string;
  syncError?: string;
}

// Remove only acknowledged records from the latest queue, so a punch saved
// while a request is in flight cannot be overwritten by an older snapshot.
export function createQueueSynchronizer(deps: {
  read: () => SavedPunch[];
  write: (queue: SavedPunch[]) => void;
  send: (punch: SavedPunch) => Promise<void>;
}) {
  let inFlight: Promise<void> | null = null;
  return function sync(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const blockedEmployees = new Set<string>();
      for (const punch of [...deps.read()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
        if (blockedEmployees.has(punch.employeeId)) continue;
        try {
          await deps.send(punch);
          deps.write(deps.read().filter(item => item.idempotencyKey !== punch.idempotencyKey));
        } catch (error) {
          blockedEmployees.add(punch.employeeId);
          const syncError = error instanceof Error ? error.message : "The saved punch could not sync.";
          deps.write(deps.read().map(item => item.idempotencyKey === punch.idempotencyKey ? { ...item, syncError } : item));
        }
      }
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
}
