import { db } from "../storage/db";

/**
 * Scans the IndexedDB movements queue for structural corruption or tamper evidence.
 * Corrupted items are placed in quarantine (syncStatus: "DEAD_LETTER") to prevent syncing.
 * Returns the count of newly quarantined items.
 */
export async function detectAndQuarantineCorruption(): Promise<number> {
  try {
    const queue = await db.movementsQueue.toArray();
    let quarantinedCount = 0;
    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();

    // Pass 1: Identify all duplicate clientGeneratedIds in the local queue
    for (const item of queue) {
      if (item.clientGeneratedId) {
        if (seenIds.has(item.clientGeneratedId)) {
          duplicateIds.add(item.clientGeneratedId);
        }
        seenIds.add(item.clientGeneratedId);
      }
    }

    const now = Date.now();
    const oneMinuteInFuture = now + 60_000; // Allow 60s clock skew

    // Pass 2: Inspect items and quarantine any containing structural failures
    for (const item of queue) {
      let isCorrupted = false;
      let reason = "";

      if (!item.clientGeneratedId || item.clientGeneratedId.trim() === "") {
        isCorrupted = true;
        reason = "Missing or empty clientGeneratedId";
      } else if (duplicateIds.has(item.clientGeneratedId)) {
        isCorrupted = true;
        reason = `Duplicate clientGeneratedId: ${item.clientGeneratedId}`;
      } else if (!item.items || !Array.isArray(item.items) || item.items.length === 0) {
        isCorrupted = true;
        reason = "Empty items list";
      } else if (item.offlineCreatedAt) {
        const itemTime = new Date(item.offlineCreatedAt).getTime();
        if (isNaN(itemTime) || itemTime > oneMinuteInFuture) {
          isCorrupted = true;
          reason = `Future or invalid timestamp offlineCreatedAt: ${item.offlineCreatedAt}`;
        }
      }

      if (isCorrupted && item.syncStatus !== "DEAD_LETTER") {
        item.syncStatus = "DEAD_LETTER";
        const cleanMsg = item.syncErrorMessage || "";
        item.syncErrorMessage = `[QUARANTINE] ${reason}${cleanMsg ? " | " + cleanMsg : ""}`;
        
        // Save back to local IndexedDB to mark as quarantined
        await db.movementsQueue.put(item);
        quarantinedCount++;

        const timestamp = new Date().toISOString();
        console.warn(`[${timestamp}][OFFLINE][WARN] quarantined-corrupted-queue-item - Item ID: ${item.id}, clientGeneratedId: ${item.clientGeneratedId || "N/A"} - Reason: ${reason}`);
      }
    }

    if (quarantinedCount > 0) {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}][OFFLINE][CRITICAL] queue-integrity-violations-quarantined - Quarantined ${quarantinedCount} corrupted movements in IndexedDB.`);
    }

    return quarantinedCount;
  } catch (error: any) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}][OFFLINE][ERROR] queue-integrity-check-failed - Failed to scan queue for corruption: ${error.message}`, error);
    return 0;
  }
}
