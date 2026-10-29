import { Router } from 'express';
import { SyncController } from '../controllers/sync.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { batchSyncSchema } from '../validations/sync.validation';

const router = Router();

router.post('/batch', authenticate, validate(batchSyncSchema), SyncController.batchSync);

export default router;
