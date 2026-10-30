import { Router } from 'express';
import { WorkSessionController } from '../controllers/work-session.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/clock-in', WorkSessionController.clockIn);
router.post('/clock-out', WorkSessionController.clockOut);
router.get('/current', WorkSessionController.getCurrentSession);
router.get('/team', authorize('ADMIN', 'MANAGER'), WorkSessionController.getTeamSessions);

export const workSessionRoutes = router;
