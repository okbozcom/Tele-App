import { Request, Response, NextFunction } from 'express';
import { SyncService } from '../services/sync.service';
import { BatchSyncInput } from '../validations/sync.validation';
import { AppError } from '../utils/AppError';

export class SyncController {
  public static async batchSync(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const input = req.body as BatchSyncInput;
      const result = await SyncService.batchSync(req.user, input.events);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
