import { DashboardRepository } from "../repositories/dashboard.repository";
import { dashboardCache } from "../utils/cache";

export const DashboardService = {
  /**
   * Fetches high-level metrics for the operations dashboard.
   * Utilizes dashboardCache for 30 seconds to prevent query floods on database.
   */
  async getMetrics() {
    const cacheKey = "dashboard:metrics:summary";
    const cached = dashboardCache.get<any>(cacheKey);
    
    if (cached !== null) {
      return {
        ...cached,
        _cached: true,
      };
    }

    const summary = await DashboardRepository.getMetricsSummary();
    dashboardCache.set(cacheKey, summary, 30); // 30s TTL cache

    return {
      ...summary,
      _cached: false,
    };
  },
};
