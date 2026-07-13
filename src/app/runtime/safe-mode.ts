import { getActiveRenderPolicy, shouldDisableAnimations } from "../render/render.policy";
import { db } from "../storage/db";
import { useRuntimeStore } from "./runtime.store";

class SafeModeEngine {
  private static BOOT_TIMEOUT_MS = 6000; // 6 seconds to declare a boot "successful"

  constructor() {
    // Empty constructor
  }

  /**
   * Registers a boot attempt. If the app crashes before calling markSuccessfulBoot(),
   * the boot attempt is considered a crash.
   */
  public async registerBootAttempt() {
    try {
      const bootRegister = await db.systemConfig.get("boot_register");
      const crashesRegister = await db.systemConfig.get("crashes_count");
      
      const lastBootSuccess = bootRegister ? bootRegister.value : true;
      let currentCrashes = crashesRegister ? Number(crashesRegister.value) : 0;

      if (!lastBootSuccess) {
        // The last boot attempt did not complete successfully (it crashed or was killed)
        currentCrashes += 1;
        await db.systemConfig.put({ key: "crashes_count", value: currentCrashes });
        
        // Reflect immediately in the reactive Zustand store
        const store = useRuntimeStore.getState();
        for (let i = 0; i < currentCrashes; i++) {
          store.incrementCrashes();
        }
      }

      // Mark current boot as in-progress (unsafe)
      await db.systemConfig.put({ key: "boot_register", value: false });

      // Automatically mark as successful after a timeout as a fallback
      setTimeout(async () => {
        await this.markSuccessfulBoot();
      }, SafeModeEngine.BOOT_TIMEOUT_MS);

    } catch (err) {
      console.warn("Failed to register boot diagnostics:", err);
    }
  }

  /**
   * Marks the current boot as completely successful.
   */
  public async markSuccessfulBoot() {
    try {
      await db.systemConfig.put({ key: "boot_register", value: true });
      await db.systemConfig.put({ key: "crashes_count", value: 0 });
      useRuntimeStore.getState().resetCrashes();
    } catch (err) {
      console.warn("Failed to mark successful boot:", err);
    }
  }

  /**
   * Forces manual activation of Safe Mode.
   */
  public activateManualSafeMode() {
    useRuntimeStore.getState().setSafeMode(true);
  }

  /**
   * Deactivates Safe Mode and resets crash count.
   */
  public async deactivateSafeMode() {
    try {
      await db.systemConfig.put({ key: "crashes_count", value: 0 });
      await db.systemConfig.put({ key: "boot_register", value: true });
      useRuntimeStore.getState().resetCrashes();
      useRuntimeStore.getState().setSafeMode(false);
    } catch (err) {
      console.warn("Failed to reset safe mode status:", err);
    }
  }

  /**
   * Audit helper to check if performance-intensive features should be disabled.
   */
  public shouldDisableAnimations(): boolean {
    return shouldDisableAnimations(getActiveRenderPolicy());
  }
}

export const safeModeEngine = new SafeModeEngine();
export default safeModeEngine;
