import { db } from "../storage/db";
import { useRuntimeStore } from "../runtime/runtime.store";
import { authFetch } from "../auth/auth.api";

class CatalogService {
  constructor() {
    // Empty constructor
  }

  /**
   * Syncs master catalogs from the server to local IndexedDB.
   * Relies on Stale-While-Revalidate pattern or background sync.
   */
  public async syncCatalogos(): Promise<void> {
    const store = useRuntimeStore.getState();
    if (!store.online) return;
    if (store.authPhase !== "ONLINE_AUTH") return;

    try {
      console.log("[CATALOGOS] loading");
      const [resProd, resDep, resTal, resUser, resFam] = await Promise.all([
        authFetch("/api/productos", { method: "GET" }),
        authFetch("/api/depositos", { method: "GET" }),
        authFetch("/api/talleres", { method: "GET" }),
        authFetch("/api/usuarios", { method: "GET" }),
        authFetch("/api/familias", { method: "GET" })
      ]);

      const responses = [resProd, resDep, resTal, resUser, resFam];
      for (const res of responses) {
        if (!res.ok) {
          if (res.status === 401) {
            const { authLifecycle } = await import("../auth/auth.lifecycle");
            authLifecycle.transitionPhase("REAUTH_REQUIRED", "catalog_401");
            useRuntimeStore.getState().setReconnectRequired(true);
          }
          throw new Error(`Catalog HTTP error: ${res.status} on URL ${res.url}`);
        }
      }

      const [dataProd, dataDep, dataTal, dataUser, dataFam] = await Promise.all(
        responses.map(res => res.json())
      );

      const productos = dataProd.data || [];
      const depositos = dataDep.data || [];
      const talleres = dataTal.data || [];
      const usuarios = dataUser.data || [];
      const familias = dataFam.data || [];

      await db.transaction("rw", db.catalogos, async () => {
        // Clear all old catalog items first to prevent stale records
        await db.catalogos.clear();

        // 1. Products
        for (const p of productos) {
          await db.catalogos.put({
            id: p.id,
            tipo: "PRODUCTOS",
            nombre: p.nombre,
            data: p,
            actualizadoAt: new Date().toISOString()
          });
        }

        // 2. Depositos
        for (const d of depositos) {
          await db.catalogos.put({
            id: d.id,
            tipo: "DEPOSITOS",
            nombre: d.nombre,
            data: d,
            actualizadoAt: new Date().toISOString()
          });
        }

        // 3. Workshops
        for (const t of talleres) {
          await db.catalogos.put({
            id: t.id,
            tipo: "TALLERES",
            nombre: t.nombre,
            data: t,
            actualizadoAt: new Date().toISOString()
          });
        }

        // 4. Users
        for (const u of usuarios) {
          await db.catalogos.put({
            id: u.id,
            tipo: "USUARIOS" as any,
            nombre: u.nombre,
            data: u,
            actualizadoAt: new Date().toISOString()
          });
        }

        // 5. Families
        for (const f of familias) {
          await db.catalogos.put({
            id: f.id,
            tipo: "FAMILIAS" as any,
            nombre: f.nombre,
            data: f,
            actualizadoAt: new Date().toISOString()
          });
        }
      });

      console.log("[CATALOGOS] success");
      console.log(`[Catalog Service] Catalogs synchronized: Prod:${productos.length}, Dep:${depositos.length}, Tal:${talleres.length}, Usr:${usuarios.length}, Fam:${familias.length}`);
    } catch (err) {
      console.log("[CATALOGOS] error", err);
      console.warn("[Catalog Service] Failed to sync catalogs from server:", err);
    }
  }

  /**
   * Offline-first product list getter.
   */
  public async getProductos(): Promise<any[]> {
    const items = await db.catalogos.where("tipo").equals("PRODUCTOS").toArray();
    return items.map(item => item.data);
  }

  /**
   * Offline-first warehouse list getter.
   */
  public async getDepositos(): Promise<any[]> {
    const items = await db.catalogos.where("tipo").equals("DEPOSITOS").toArray();
    return items.map(item => item.data);
  }

  /**
   * Offline-first workshop list getter.
   */
  public async getTalleres(): Promise<any[]> {
    const items = await db.catalogos.where("tipo").equals("TALLERES").toArray();
    return items.map(item => item.data);
  }

  /**
   * Offline-first user list getter.
   */
  public async getUsuarios(): Promise<any[]> {
    const items = await db.catalogos.where("tipo").equals("USUARIOS" as any).toArray();
    return items.map(item => item.data);
  }

  /**
   * Offline-first family list getter.
   */
  public async getFamilias(): Promise<any[]> {
    const items = await db.catalogos.where("tipo").equals("FAMILIAS" as any).toArray();
    return items.map(item => item.data);
  }
}

export const catalogService = new CatalogService();
export default catalogService;
