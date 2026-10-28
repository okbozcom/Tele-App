import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  bulkCreateUsersSchema,
  listUsersQuerySchema,
  userIdParamSchema,
} from '../validations/user.validation';

const router = Router();

// All user management routes require authentication
router.use(authenticate);

// Create user: ADMIN and MANAGER (managers restricted to AGENT in service logic)
router.post('/', authorize('ADMIN', 'MANAGER'), validate(createUserSchema), UserController.createUser);

// List users with optional role and isActive filters: ADMIN, MANAGER, and AGENT (for reassignment)
router.get('/', authorize('ADMIN', 'MANAGER', 'AGENT'), validate(listUsersQuerySchema), UserController.listUsers);

// Bulk create users: ADMIN only
router.post(
  '/bulk',
  authorize('ADMIN'),
  validate(bulkCreateUsersSchema),
  UserController.bulkCreate,
);

// Edit user: ADMIN and MANAGER (role change restricted to ADMIN in service logic)
router.patch('/:id', authorize('ADMIN', 'MANAGER'), validate(updateUserSchema), UserController.updateUser);

// Delete user: ADMIN and MANAGER (managers restricted to AGENT in their branch)
router.delete('/:id', authorize('ADMIN', 'MANAGER'), validate(userIdParamSchema), UserController.deleteUser);

// Reset user password: ADMIN only
router.post(
  '/:id/reset-password',
  authorize('ADMIN'),
  validate(resetPasswordSchema),
  UserController.resetPassword,
);

export default router;
