import { Router } from 'express';
import { StatController } from '../controllers/stat.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Self stats for today
router.get('/today', authenticate, StatController.getTodayStats);

// Team stats for manager & admin
router.get('/team', authenticate, authorize('ADMIN', 'MANAGER'), StatController.getTeamStats);

// Range stats for trends
router.get('/range', authenticate, StatController.getRangeStats);

export default router;
