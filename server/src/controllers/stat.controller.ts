import { Request, Response, NextFunction } from 'express';
import { DailyStatService } from '../services/daily-stat.service';
import { AppError } from '../utils/AppError';

export class StatController {
  public static async getTodayStats(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const dateQuery = typeof req.query.date === 'string' ? req.query.date : undefined;
      const stats = await DailyStatService.getTodayStats(req.user, dateQuery);

      res.setHeader('Cache-Control', 'private, max-age=15');
      res.status(200).json(stats);
    } catch (err) {
      next(err);
    }
  }

  public static async getTeamStats(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const dateQuery = typeof req.query.date === 'string' ? req.query.date : undefined;
      const branchQuery = typeof req.query.branch === 'string' ? req.query.branch : undefined;
      const campaignIdQuery = typeof req.query.campaignId === 'string' ? req.query.campaignId : undefined;

      const result = await DailyStatService.getTeamStats(req.user, {
        date: dateQuery,
        branch: branchQuery,
        campaignId: campaignIdQuery,
      });

      res.setHeader('Cache-Control', 'private, max-age=15');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public static async getRangeStats(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const from = typeof req.query.from === 'string' ? req.query.from : '';
      const to = typeof req.query.to === 'string' ? req.query.to : '';
      const branch = typeof req.query.branch === 'string' ? req.query.branch : undefined;
      const campaignId = typeof req.query.campaignId === 'string' ? req.query.campaignId : undefined;

      if (!from || !to) {
        throw new AppError('Query parameters "from" and "to" (YYYY-MM-DD) are required', 400);
      }

      const result = await DailyStatService.getRangeStats(req.user, {
        from,
        to,
        branch,
        campaignId,
      });

      res.setHeader('Cache-Control', 'private, max-age=30');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
