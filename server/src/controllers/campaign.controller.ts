import { Request, Response, NextFunction } from 'express';
import { CampaignService } from '../services/campaign.service';
import { AppError } from '../utils/AppError';

export class CampaignController {
  public static async createCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const campaign = await CampaignService.createCampaign(req.user, req.body);
      res.status(201).json({ campaign });
    } catch (error) {
      next(error);
    }
  }

  public static async listCampaigns(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const campaigns = await CampaignService.listCampaigns(req.user, req.query as { branch?: string });
      res.status(200).json({ campaigns });
    } catch (error) {
      next(error);
    }
  }

  public static async getCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const campaign = await CampaignService.getCampaignById(req.user, req.params.id);
      res.status(200).json({ campaign });
    } catch (error) {
      next(error);
    }
  }

  public static async getCampaignStats(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const data = await CampaignService.getCampaignStats(req.user, req.params.id);
      res.status(200).json(data);
    } catch (error) {
      next(error);
    }
  }

  public static async updateCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const result = await CampaignService.updateCampaign(req.user, req.params.id, req.body);
      res.status(200).json({
        campaign: result.campaign,
        ...(result.warning ? { warning: result.warning } : {}),
      });
    } catch (error) {
      next(error);
    }
  }

  public static async copyCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const campaign = await CampaignService.copyCampaign(req.user, req.params.id, req.body);
      res.status(201).json({ campaign });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      await CampaignService.deleteCampaign(req.user, req.params.id);
      res.status(200).json({ message: 'Campaign deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}
