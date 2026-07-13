import Dexie from "dexie";
import { db, type OfflineMovement, type SyncStatus } from "../storage/db";
import {
  getSearchScanCap,
  getTimelinePageSize,
  type RenderPolicySnapshot,
} from "./render.policy";

export type TimelineStatusFilter = "ALL" | SyncStatus | "PENDING_GROUP";

/** Cursor keyset: fecha del ítem más antiguo ya mostrado (página siguiente = más viejos). */
export type TimelineCursor = string | null;

export interface TimelineQueryParams {
  statusFilter: TimelineStatusFilter;
  searchQuery: string;
  cursorBefore: TimelineCursor;
  policy: RenderPolicySnapshot;
  /** Solo búsqueda acotada: offset en resultados filtrados. */
  searchOffset?: number;
  tallerId?: string;
}

export interface TimelinePageResult {
  items: OfflineMovement[];
  nextCursorBefore: TimelineCursor;
  nextSearchOffset: number;
  hasMore: boolean;
  queryDurationMs: number;
  scannedRows?: number;
}

function movementMatchesSearch(m: OfflineMovement, query: string): boolean {
  const q = query.toLowerCase();
  if (m.observaciones?.toLowerCase().includes(q)) return true;
  if (m.tipo.toLowerCase().includes(q)) return true;
  return m.items.some(
    (it) =>
      it.productoId.toLowerCase().includes(q) ||
      it.calidad.toLowerCase().includes(q) ||
      it.canal.toLowerCase().includes(q)
  );
}

function sortNewestFirst(a: OfflineMovement, b: OfflineMovement): number {
  return (
    new Date(b.offlineCreatedAt).getTime() - new Date(a.offlineCreatedAt).getTime()
  );
}

function pageBounds(raw: OfflineMovement[], pageSize: number) {
  const hasMore = raw.length > pageSize;
  const items = hasMore ? raw.slice(0, pageSize) : raw;
  const nextCursorBefore =
    items.length > 0 ? items[items.length - 1].offlineCreatedAt : null;
  return { items, hasMore, nextCursorBefore };
}

async function fetchAllStatusPage(
  cursorBefore: TimelineCursor,
  pageSize: number,
  tallerId?: string
): Promise<OfflineMovement[]> {
  let collection = cursorBefore
    ? db.movementsQueue.where("offlineCreatedAt").below(cursorBefore).reverse()
    : db.movementsQueue.orderBy("offlineCreatedAt").reverse();

  if (tallerId) {
    return collection
      .filter((m) => m.tallerId === tallerId)
      .limit(pageSize + 1)
      .toArray();
  }
  return collection.limit(pageSize + 1).toArray();
}

async function fetchSingleStatusPage(
  status: SyncStatus,
  cursorBefore: TimelineCursor,
  pageSize: number,
  tallerId?: string
): Promise<OfflineMovement[]> {
  const upper = cursorBefore ?? Dexie.maxKey;
  const includeUpper = cursorBefore == null;
  let collection = db.movementsQueue
    .where("[syncStatus+offlineCreatedAt]")
    .between([status, Dexie.minKey], [status, upper], true, includeUpper)
    .reverse();

  if (tallerId) {
    return collection
      .filter((m) => m.tallerId === tallerId)
      .limit(pageSize + 1)
      .toArray();
  }
  return collection.limit(pageSize + 1).toArray();
}

/** PENDING + RETRY_SCHEDULED: dos queries acotadas (cap fijo), merge, sin offset global. */
async function fetchPendingGroupPage(
  cursorBefore: TimelineCursor,
  pageSize: number,
  tallerId?: string
): Promise<OfflineMovement[]> {
  const upper = cursorBefore ?? Dexie.maxKey;
  const includeUpper = cursorBefore == null;
  const cap = pageSize + 1;

  let [pending, retry] = await Promise.all([
    db.movementsQueue
      .where("[syncStatus+offlineCreatedAt]")
      .between(["PENDING", Dexie.minKey], ["PENDING", upper], true, includeUpper)
      .reverse()
      .limit(tallerId ? 100 : cap)
      .toArray(),
    db.movementsQueue
      .where("[syncStatus+offlineCreatedAt]")
      .between(["RETRY_SCHEDULED", Dexie.minKey], ["RETRY_SCHEDULED", upper], true, includeUpper)
      .reverse()
      .limit(tallerId ? 100 : cap)
      .toArray(),
  ]);

  if (tallerId) {
    pending = pending.filter((m) => m.tallerId === tallerId);
    retry = retry.filter((m) => m.tallerId === tallerId);
  }

  return [...pending, ...retry].sort(sortNewestFirst).slice(0, cap);
}

async function fetchSearchPage(
  params: TimelineQueryParams,
  pageSize: number
): Promise<TimelinePageResult> {
  const start = performance.now();
  const scanCap = getSearchScanCap(params.policy);
  const query = params.searchQuery.trim().toLowerCase();
  const searchOffset = params.searchOffset ?? 0;

  let recent: OfflineMovement[];

  if (params.statusFilter === "ALL") {
    recent = await db.movementsQueue
      .orderBy("offlineCreatedAt")
      .reverse()
      .limit(scanCap)
      .toArray();
  } else if (params.statusFilter === "PENDING_GROUP") {
    const half = Math.ceil(scanCap / 2);
    const [pending, retry] = await Promise.all([
      db.movementsQueue
        .where("[syncStatus+offlineCreatedAt]")
        .between(["PENDING", Dexie.minKey], ["PENDING", Dexie.maxKey])
        .reverse()
        .limit(half)
        .toArray(),
      db.movementsQueue
        .where("[syncStatus+offlineCreatedAt]")
        .between(["RETRY_SCHEDULED", Dexie.minKey], ["RETRY_SCHEDULED", Dexie.maxKey])
        .reverse()
        .limit(half)
        .toArray(),
    ]);
    recent = [...pending, ...retry].sort(sortNewestFirst);
  } else {
    recent = await db.movementsQueue
      .where("[syncStatus+offlineCreatedAt]")
      .between(
        [params.statusFilter, Dexie.minKey],
        [params.statusFilter, Dexie.maxKey]
      )
      .reverse()
      .limit(scanCap)
      .toArray();
  }

  if (params.tallerId) {
    recent = recent.filter((m) => m.tallerId === params.tallerId);
  }

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoStr = twoDaysAgo.toISOString();

  const matched = recent.filter((m) => movementMatchesSearch(m, query) && m.offlineCreatedAt >= twoDaysAgoStr);
  const slice = matched.slice(searchOffset, searchOffset + pageSize + 1);
  const { items, hasMore, nextCursorBefore } = pageBounds(slice, pageSize);

  return {
    items,
    nextCursorBefore,
    nextSearchOffset: searchOffset + items.length,
    hasMore,
    queryDurationMs: performance.now() - start,
    scannedRows: recent.length,
  };
}

export async function fetchTimelinePage(
  params: TimelineQueryParams
): Promise<TimelinePageResult> {
  const pageSize = getTimelinePageSize(params.policy);
  const start = performance.now();

  if (params.searchQuery.trim()) {
    return fetchSearchPage(params, pageSize);
  }

  let raw: OfflineMovement[];

  if (params.statusFilter === "ALL") {
    raw = await fetchAllStatusPage(params.cursorBefore, pageSize, params.tallerId);
  } else if (params.statusFilter === "PENDING_GROUP") {
    raw = await fetchPendingGroupPage(params.cursorBefore, pageSize, params.tallerId);
  } else {
    raw = await fetchSingleStatusPage(params.statusFilter, params.cursorBefore, pageSize, params.tallerId);
  }

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoStr = twoDaysAgo.toISOString();
  
  const filteredRaw = raw.filter(m => m.offlineCreatedAt >= twoDaysAgoStr);
  const { items, hasMore, nextCursorBefore } = pageBounds(filteredRaw, pageSize);

  return {
    items,
    nextCursorBefore,
    nextSearchOffset: 0,
    hasMore: hasMore && filteredRaw.length > 0,
    queryDurationMs: performance.now() - start,
  };
}

export function mergeTimelineItems(
  existing: OfflineMovement[],
  incoming: OfflineMovement[]
): OfflineMovement[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((m) => m.id).filter((id) => id != null));
  const merged = [...existing];
  for (const item of incoming) {
    if (item.id == null) {
      merged.push(item);
      continue;
    }
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export function mapUiStatusFilter(uiFilter: string): TimelineStatusFilter {
  if (uiFilter === "ALL") return "ALL";
  if (uiFilter === "PENDING") return "PENDING_GROUP";
  return uiFilter as SyncStatus;
}
