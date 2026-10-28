import { Types } from 'mongoose';
import { ICampaignDoc } from '../models/campaign.model';
import { Lead } from '../models/lead.model';
import { User, IUserDoc } from '../models/user.model';

export class LeadAssignmentService {
  /**
   * Fetches eligible agents (role: 'AGENT', isActive: true, canReceiveLeads: true) from an ID array.
   */
  private static async getEligibleAgents(agentIds: Types.ObjectId[]): Promise<IUserDoc[]> {
    if (!agentIds || agentIds.length === 0) {
      return [];
    }

    return User.find({
      _id: { $in: agentIds },
      role: 'AGENT',
      isActive: true,
      canReceiveLeads: true,
    });
  }

  /**
   * Selects an agent from the candidate list balanced by the lowest number of current OPEN leads.
   */
  private static async pickBalancedAgent(
    candidates: IUserDoc[],
    campaignId: Types.ObjectId,
  ): Promise<Types.ObjectId | null> {
    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0]._id;
    }

    const candidateIds = candidates.map((c) => c._id);

    // Count open leads for each candidate across this campaign
    const counts = await Lead.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          campaignId,
          assignedTo: { $in: candidateIds },
          status: 'OPEN',
        },
      },
      {
        $group: {
          _id: '$assignedTo',
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map<string, number>();
    for (const c of counts) {
      countMap.set(c._id.toString(), c.count);
    }

    // Sort candidate agents by open lead count ascending
    const sorted = [...candidates].sort((a, b) => {
      const countA = countMap.get(a._id.toString()) || 0;
      const countB = countMap.get(b._id.toString()) || 0;
      return countA - countB;
    });

    return sorted[0]._id;
  }

  /**
   * Assigns an agent based on the campaign's distributionMode and customProperties.
   * Returns the assigned agent's ObjectId or null if unassigned.
   */
  public static async assignLead(
    campaign: ICampaignDoc,
    customProperties: Map<string, string> | Record<string, string>,
  ): Promise<Types.ObjectId | null> {
    const getProp = (field: string): string | undefined => {
      if (customProperties instanceof Map) {
        return customProperties.get(field);
      }
      return customProperties[field];
    };

    if (campaign.distributionMode === 'EQUAL') {
      let eligible = await this.getEligibleAgents(campaign.agentIds);
      if (campaign.branch) {
        const branchEligible = eligible.filter(
          (a) => a.branch && a.branch.toLowerCase().trim() === campaign.branch!.toLowerCase().trim(),
        );
        if (branchEligible.length > 0) {
          eligible = branchEligible;
        } else {
          eligible = await User.find({
            role: 'AGENT',
            branch: campaign.branch,
            isActive: true,
            canReceiveLeads: true,
          });
        }
      }
      return this.pickBalancedAgent(eligible, campaign._id);
    }

    if (campaign.distributionMode === 'CONDITIONAL') {
      // Find the first matching conditional rule
      for (const rule of campaign.conditionalRules) {
        const leadVal = getProp(rule.field);
        if (leadVal !== undefined && leadVal.toLowerCase() === rule.value.toLowerCase()) {
          const eligibleInRule = await this.getEligibleAgents(rule.agentIds);
          if (eligibleInRule.length > 0) {
            return this.pickBalancedAgent(eligibleInRule, campaign._id);
          }
        }
      }

      // No rule matched or no eligible agents in matched rule; fallback
      if (campaign.fallbackAgentId) {
        const fallback = await User.findOne({
          _id: campaign.fallbackAgentId,
          role: 'AGENT',
          isActive: true,
          canReceiveLeads: true,
        });

        if (fallback) {
          return fallback._id;
        }
      }
    }

    // Lead stays unassigned
    return null;
  }
}
