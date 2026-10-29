import { storage } from '../utils/storage';

export const SIM_PREFERENCE_STORAGE_KEY = 'tele_preferred_sim_slot';

export type SimSlotPreference = 0 | 1 | null; // 0: SIM 1, 1: SIM 2, null: System default / Ask every time

export class SimPreferenceService {
  public static async getPreferredSimSlot(): Promise<SimSlotPreference> {
    try {
      const val = await storage.getItem(SIM_PREFERENCE_STORAGE_KEY);
      if (val === null || val === undefined || val === '') return null;
      const parsed = parseInt(val, 10);
      if (parsed === 0 || parsed === 1) return parsed as SimSlotPreference;
      return null;
    } catch {
      return null;
    }
  }

  public static async setPreferredSimSlot(slot: SimSlotPreference): Promise<void> {
    try {
      if (slot === null) {
        await storage.removeItem(SIM_PREFERENCE_STORAGE_KEY);
      } else {
        await storage.setItem(SIM_PREFERENCE_STORAGE_KEY, String(slot));
      }
    } catch (err) {
      console.warn('[SimPreferenceService] Failed to save preferred SIM slot:', err);
    }
  }
}
