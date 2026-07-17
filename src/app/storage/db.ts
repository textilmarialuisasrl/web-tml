import Dexie, { type Table } from "dexie";

export type SyncStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED" | "CONFLICT" | "RETRY_SCHEDULED" | "DEAD_LETTER";
export type SyncPriority = "HIGH" | "NORMAL" | "LOW";

export interface OfflineMovementItem {
  productoId: string;
  cantidadUnidades: number;
  depositoOrigenId?: string | null;
  tallerOrigenId?: string | null;
  depositoDestinoId?: string | null;
  tallerDestinoId?: string | null;
  calidad: "PERFECTO" | "FALLADO";
  presentacion: "UNIDAD" | "DOCENA" | "FARDO";
  canal: "MAYORISTA" | "MINORISTA";
  direccion: "ENTRADA" | "SALIDA" | "INTERNO";
  observaciones?: string | null;
}

export interface OfflineMovement {
  id?: number;
  clientGeneratedId: string;
  tipo: string;
  offlineCreatedAt: string;
  items: OfflineMovementItem[];
  tallerId?: string | null;
  observaciones?: string | null;
  syncStatus: SyncStatus;
  payloadHash: string;
  priority: SyncPriority;
  syncErrorMessage?: string | null;
  syncAttempts: number;
  lastAttemptAt?: string | null;
  syncBatchId?: string | null;
  insumos?: any[];
}

export interface CatalogoItem {
  id: string;
  tipo: "PRODUCTOS" | "DEPOSITOS" | "TALLERES" | "CONFIGURACIONES";
  nombre: string;
  data: any; // Entire JSON payload for flexible reuse
  actualizadoAt: string;
}

export interface StockCacheItem {
  id: string; // key: productoId_depositoId_tallerId_calidad_canal
  productoId: string;
  productoNombre: string;
  depositoId?: string | null;
  tallerId?: string | null;
  cantidadUnidades: number;
  calidad: string;
  canal: string;
  actualizadoAt: string;
}

export interface SystemConfigItem {
  key: string;
  value: any;
}

export interface ClientMetricLog {
  id?: number;
  timestamp: string;
  metricName: string;
  value: number;
  metadata?: any;
}

class TMLDatabase extends Dexie {
  movementsQueue!: Table<OfflineMovement, number>;
  catalogos!: Table<CatalogoItem, string>;
  stockCache!: Table<StockCacheItem, string>;
  systemConfig!: Table<SystemConfigItem, string>;
  metricsLog!: Table<ClientMetricLog, number>;

  constructor() {
    super("TML_Industrial_DB");
    
    // Define database schema versions and indices.
    // Compound indices are defined as [fieldA+fieldB] for lightning-fast queries.
    this.version(1).stores({
      movementsQueue: "++id, clientGeneratedId, syncStatus, payloadHash, priority, offlineCreatedAt, [syncStatus+offlineCreatedAt], [syncStatus+priority+offlineCreatedAt]",
      catalogos: "id, tipo, actualizadoAt",
      stockCache: "id, productoId, depositoId, tallerId, [productoId+depositoId], [productoId+tallerId]",
      systemConfig: "key",
      metricsLog: "++id, timestamp, metricName"
    });
  }
}

export const db = new TMLDatabase();
export default db;
