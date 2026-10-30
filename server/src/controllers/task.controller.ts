import { Request, Response, NextFunction } from 'express';
import { TaskService } from '../services/task.service';

export class TaskController {
  public static async createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = (req as any).user;
      const task = await TaskService.createTask(
        user._id || user.id,
        user.role,
        user.branch?.toString(),
        req.body
      );
      res.status(201).json({ success: true, task });
    } catch (error) {
      next(error);
    }
  }

  public static async getTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = (req as any).user;
      const filter = (req.query.filter as 'assigned' | 'reported') || 'assigned';
      const status = req.query.status as 'PENDING' | 'COMPLETED' | undefined;

      const tasks = await TaskService.getTasks(user._id || user.id, filter, status);
      res.status(200).json({ success: true, tasks });
    } catch (error) {
      next(error);
    }
  }

  public static async updateTaskStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = (req as any).user;
      const taskId = req.params.id;
      const { status } = req.body;

      const task = await TaskService.updateTaskStatus(
        taskId,
        user._id || user.id,
        user.role,
        status
      );
      res.status(200).json({ success: true, task });
    } catch (error) {
      next(error);
    }
  }
}
