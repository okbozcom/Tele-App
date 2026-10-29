import { Request, Response, NextFunction } from 'express';
import { WorkSessionService } from '../services/work-session.service';
import { AppError } from '../utils/AppError';

export class WorkSessionController {
  public static async clockIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const session = await WorkSessionService.clockIn(req.user);
      res.status(200).json({ status: 'success', session });
    } catch (err) {
      next(err);
    }
  }

  public static async clockOut(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const session = await WorkSessionService.clockOut(req.user);
      res.status(200).json({ status: 'success', session });
    } catch (err) {
      next(err);
    }
  }

  public static async getCurrentSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const result = await WorkSessionService.getCurrentSession(req.user._id);
      res.status(200).json({ status: 'success', ...result });
    } catch (err) {
      next(err);
    }
  }

  public static async getTeamSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const sessions = await WorkSessionService.getTeamSessions(req.user, date);
      res.status(200).json({ status: 'success', sessions });
    } catch (err) {
      next(err);
    }
  }
}
