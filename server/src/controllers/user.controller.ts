import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { AppError } from '../utils/AppError';

export class UserController {
  public static async createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const user = await UserService.createUser(req.user, req.body);
      res.status(201).json({
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // req.query is validated and cast by validate(listUsersQuerySchema)
      const users = await UserService.listUsers(req.user, req.query);
      res.status(200).json({
        users,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const user = await UserService.updateUser(req.user, req.params.id, req.body);
      res.status(200).json({
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async resetPassword(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const newPassword = req.body.password || req.body.newPassword;
      await UserService.resetPassword(req.params.id, newPassword);
      res.status(200).json({
        message: 'Password reset successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async bulkCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await UserService.bulkCreateUsers(req.body);
      res.status(201).json({
        users,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }
      const result = await UserService.deleteUser(req.user, req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}
