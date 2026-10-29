import { Router } from 'express';
import { TaskController } from '../controllers/task.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createTaskSchema,
  updateTaskStatusSchema,
  getTasksSchema,
} from '../validations/task.validation';

const router = Router();

router.use(authenticate);

router.post('/', validate(createTaskSchema), TaskController.createTask);
router.get('/', validate(getTasksSchema), TaskController.getTasks);
router.patch('/:id/status', validate(updateTaskStatusSchema), TaskController.updateTaskStatus);

export default router;
