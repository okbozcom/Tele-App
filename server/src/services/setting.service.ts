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

    if (updates.breakNotificationThresholdMinutes !== undefined) {
      setting.breakNotificationThresholdMinutes = updates.breakNotificationThresholdMinutes;
    }

    if (updates.enableAutoCallDialing !== undefined) {
      setting.enableAutoCallDialing = updates.enableAutoCallDialing;
    }

    if (updates.autoCallDialingDelaySeconds !== undefined) {
      setting.autoCallDialingDelaySeconds = updates.autoCallDialingDelaySeconds;
    }

    if (updates.maskContactNumber !== undefined) {
      setting.maskContactNumber = updates.maskContactNumber;
    }

    if (updates.displayStartCallingButton !== undefined) {
      setting.displayStartCallingButton = updates.displayStartCallingButton;
    }

    if (updates.allowCallRecordingPlayback !== undefined) {
      setting.allowCallRecordingPlayback = updates.allowCallRecordingPlayback;
    }

    if (updates.preferredSimSlot !== undefined) {
      setting.preferredSimSlot = updates.preferredSimSlot;
    }

    await setting.save();
    return setting;
  }
}
