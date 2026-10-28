import { Setting, ISettingDoc } from '../models/setting.model';
import { UpdateSettingInput } from '../validations/setting.validation';

export class SettingService {
  public static async getSettings(): Promise<ISettingDoc> {
    let setting = await Setting.findOne();
    if (!setting) {
      setting = await Setting.create({
        allowDisposeWithoutFollowUp: false,
        followUpMandatoryForNotConnected: false,
      });
    }
    return setting;
  }

  public static async updateSettings(updates: UpdateSettingInput): Promise<ISettingDoc> {
    const setting = await this.getSettings();

    if (updates.allowDisposeWithoutFollowUp !== undefined) {
      setting.allowDisposeWithoutFollowUp = updates.allowDisposeWithoutFollowUp;
    }

    if (updates.followUpMandatoryForNotConnected !== undefined) {
      setting.followUpMandatoryForNotConnected = updates.followUpMandatoryForNotConnected;
    }

    if (updates.autoLeadDistribution !== undefined) {
      setting.autoLeadDistribution = updates.autoLeadDistribution;
    }

    if (updates.reassignAfterHours !== undefined) {
      setting.reassignAfterHours = updates.reassignAfterHours;
    }

    await setting.save();
    return setting;
  }
}
