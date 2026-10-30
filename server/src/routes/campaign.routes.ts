import { Router } from 'express';
import { CampaignController } from '../controllers/campaign.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createCampaignSchema,
  updateCampaignSchema,
  copyCampaignSchema,
  campaignIdParamSchema,
} from '../validations/campaign.validation';

const router = Router();

// All campaign endpoints require authentication
router.use(authenticate);

// Reads: Any authenticated user can access (scoped internally by role)
router.get('/', CampaignController.listCampaigns);
router.get('/:id', validate(campaignIdParamSchema), CampaignController.getCampaign);
router.get('/:id/stats', validate(campaignIdParamSchema), CampaignController.getCampaignStats);

// Writes: ADMIN and MANAGER only
router.post(
  '/',
  authorize('ADMIN', 'MANAGER'),
  validate(createCampaignSchema),
  CampaignController.createCampaign,
);

router.patch(
  '/:id',
  authorize('ADMIN', 'MANAGER'),
  validate(updateCampaignSchema),
  CampaignController.updateCampaign,
);

router.post(
  '/:id/copy',
  authorize('ADMIN', 'MANAGER'),
  validate(copyCampaignSchema),
  CampaignController.copyCampaign,
);

router.delete(
  '/:id',
  authorize('ADMIN'),
  validate(campaignIdParamSchema),
  CampaignController.deleteCampaign,
);

export default router;
