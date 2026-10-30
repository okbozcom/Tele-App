import { Request, Response, NextFunction } from 'express';
import { ActivityService } from '../services/activity.service';
import { AppError } from '../utils/AppError';

export class ActivityController {
  public static async disposeLead(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const result = await ActivityService.disposeLead(req.user, req.params.id, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  public static async getLeadHistory(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const activities = await ActivityService.getLeadHistory(req.user, req.params.id);
      res.status(200).json({ activities });
    } catch (error) {
      next(error);
    }
  }

  public static async getUserActivities(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const activities = await ActivityService.getUserActivities(
        req.user,
        req.query as unknown as Parameters<typeof ActivityService.getUserActivities>[1],
      );
      res.status(200).json({ activities });
    } catch (error) {
      next(error);
    }
  }

  public static async attachRecording(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const recordingUrl = req.body.recordingUrl || (req.file ? `/uploads/recordings/${req.file.filename}` : null);
      if (!recordingUrl) {
        throw new AppError('recordingUrl is required', 400);
      }
      const activity = await ActivityService.attachRecording(req.user, req.params.id, recordingUrl);
      res.status(200).json({ status: 'success', activity });
    } catch (error) {
      next(error);
    }
  }

  public static async getRecording(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const result = await ActivityService.getRecording(req.user, req.params.id);
      res.status(200).json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }
}
