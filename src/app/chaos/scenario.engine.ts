import { db } from "../storage/db";
import { authLifecycle } from "../auth/auth.lifecycle";

export interface SimulationState {
  backendOffline: boolean;
  timeout: boolean;
  auth401: boolean;
  snapshotMismatch: boolean;
  slowNetwork: boolean;
}

class ScenarioEngine {
  private state: SimulationState = {
    backendOffline: false,
    timeout: false,
    auth401: false,
    snapshotMismatch: false,
    slowNetwork: false,
  };

  private listeners: (() => void)[] = [];

  public getState(): Readonly<SimulationState> {
    return this.state;
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }

  public resetAll(): void {
    this.state = {
      backendOffline: false,
      timeout: false,
      auth401: false,
      snapshotMismatch: false,
      slowNetwork: false,
    };
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}][CHAOS][INFO] simulation-reset-all - All scenario simulations deactivated.`);
    this.notify();
  }

  public toggleOffline(): void {
    this.state.backendOffline = !this.state.backendOffline;
    if (this.state.backendOffline) {
      this.state.timeout = false; // mutually exclusive
    }
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}][CHAOS][INFO] toggle-offline - Backend offline simulation set to ${this.state.backendOffline}`);
    
    // Trigger online/offline event to make store aware
    if (this.state.backendOffline) {
      window.dispatchEvent(new Event("offline"));
    } else {
      window.dispatchEvent(new Event("online"));
    }
    this.notify();
  }

  public toggleTimeout(): void {
    this.state.timeout = !this.state.timeout;
    if (this.state.timeout) {
      this.state.backendOffline = false; // mutually exclusive
    }
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}][CHAOS][INFO] toggle-timeout - Timeout simulation set to ${this.state.timeout}`);
    this.notify();
  }

  public toggle401(): void {
    this.state.auth401 = !this.state.auth401;
    if (this.state.auth401) {
      this.state.snapshotMismatch = false; // mutually exclusive
    }
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}][CHAOS][INFO] toggle-401 - 401 Unauthorized simulation set to ${this.state.auth401}`);
    this.notify();
  }

  public toggleSnapshotMismatch(): void {
    this.state.snapshotMismatch = !this.state.snapshotMismatch;
    if (this.state.snapshotMismatch) {
      this.state.auth401 = false; // mutually exclusive
    }
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}][CHAOS][INFO] toggle-snapshot-mismatch - Snapshot signature mismatch simulation set to ${this.state.snapshotMismatch}`);
    this.notify();
  }

  public toggleSlowNetwork(): void {
    this.state.slowNetwork = !this.state.slowNetwork;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}][CHAOS][INFO] toggle-slow-network - Slow network (3s delay) simulation set to ${this.state.slowNetwork}`);
    this.notify();
  }

  public async simulateReconnectStorm(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}][CHAOS][WARN] start-reconnect-storm - Initiating rapid reconnect loops simulation...`);
    // Rapidly trigger handles to trip storm alert
    for (let i = 0; i < 7; i++) {
      authLifecycle.handleReconnect("reconnect");
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  public async simulateQueueCorruption(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}][CHAOS][WARN] simulate-queue-corruption - Inserting corrupted items into movements queue.`);
    
    // Item 1: Corrupted due to empty items list and future timestamp
    const futureTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await db.movementsQueue.add({
      clientGeneratedId: "corrupt-empty-items-" + Math.random().toString(36).substring(7),
      tipo: "INGRESO_MANUAL",
      offlineCreatedAt: futureTime,
      items: [],
      syncStatus: "PENDING",
      payloadHash: "corrupted-hash-empty",
      priority: "NORMAL",
      syncAttempts: 0
    });

    // Item 2: Corrupted due to missing clientGeneratedId
    await db.movementsQueue.add({
      clientGeneratedId: "", // Empty = corrupted!
      tipo: "TALLER_PROCESAR",
      offlineCreatedAt: new Date().toISOString(),
      items: [
        {
          productoId: "prod-temp-01",
          cantidadUnidades: 5,
          calidad: "PERFECTO",
          presentacion: "SIN_ETIQUETA",
          canal: "MAYORISTA",
          direccion: "ENTRADA"
        }
      ],
      syncStatus: "PENDING",
      payloadHash: "corrupted-hash-missing-id",
      priority: "NORMAL",
      syncAttempts: 0
    });

    this.notify();
  }

  public async simulateDuplicateReplay(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}][CHAOS][WARN] simulate-duplicate-replay - Seeding duplicate items in IndexedDB with collision hashes.`);
    
    const dupId = "dup-replay-" + Math.random().toString(36).substring(7);
    const movement = {
      clientGeneratedId: dupId,
      tipo: "INGRESO_MANUAL",
      offlineCreatedAt: new Date().toISOString(),
      items: [
        {
          productoId: "prod-temp-01",
          cantidadUnidades: 15,
          depositoDestinoId: "dep-01",
          calidad: "PERFECTO" as const,
          presentacion: "SIN_ETIQUETA" as const,
          canal: "MAYORISTA" as const,
          direccion: "ENTRADA" as const,
        }
      ],
      syncStatus: "PENDING" as const,
      payloadHash: "hash-replay-a",
      priority: "NORMAL" as const,
      syncAttempts: 0
    };

    // Add first item
    await db.movementsQueue.add(movement);
    // Add second item with matching ID but different hash to trigger 409 collision
    await db.movementsQueue.add({
      ...movement,
      payloadHash: "hash-replay-b"
    });

    this.notify();
  }
}

export const scenarioEngine = new ScenarioEngine();
export default scenarioEngine;
