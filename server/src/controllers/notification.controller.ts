import { Request, Response, NextFunction } from 'express';
import { NotificationService } from '../services/notification.service';
import { AppError } from '../utils/AppError';

export class NotificationController {
  public static async getUserNotifications(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 30;
      const unreadOnly = req.query.unreadOnly === 'true';

      const result = await NotificationService.getUserNotifications(req.user._id, {
        page,
        limit,
        unreadOnly,
      });

      res.status(200).json({ status: 'success', ...result });
    } catch (err) {
      next(err);
    }
  }

  public static async markAsRead(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const notification = await NotificationService.markAsRead(req.user._id, req.params.id);
      res.status(200).json({ status: 'success', notification });
    } catch (err) {
      next(err);
    }
  }

  public static async markAllAsRead(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const result = await NotificationService.markAllAsRead(req.user._id);
      res.status(200).json({ status: 'success', ...result });
    } catch (err) {
      next(err);
    }
  }

  public static async getUnreadCount(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const unreadCount = await NotificationService.getUnreadCount(req.user._id);
      res.status(200).json({ status: 'success', unreadCount });
    } catch (err) {
      next(err);
    }
  }
}
