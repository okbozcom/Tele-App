import { Router } from 'express';
import multer from 'multer';
import { LeadController } from '../controllers/lead.controller';
import { ActivityController } from '../controllers/activity.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createLeadSchema,
  listCampaignLeadsQuerySchema,
  myLeadsQuerySchema,
  reassignLeadSchema,
  bulkReassignSchema,
  updateLeadSchema,
  getNextLeadSchema,
} from '../validations/lead.validation';
import { disposeLeadSchema } from '../validations/activity.validation';

// Multer memory storage configuration for CSV uploads (10 MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Router for /api/campaigns/:id/leads
export const campaignLeadsRouter = Router({ mergeParams: true });

campaignLeadsRouter.use(authenticate);

campaignLeadsRouter.post(
  '/upload',
  authorize('ADMIN', 'MANAGER'),
  upload.single('file'),
  LeadController.uploadCsv,
);

campaignLeadsRouter.post(
  '/',
  authorize('ADMIN', 'MANAGER', 'AGENT'),
  validate(createLeadSchema),
  LeadController.createWalkInLead,
);

campaignLeadsRouter.get(
  '/',
  validate(listCampaignLeadsQuerySchema),
  LeadController.listCampaignLeads,
);

campaignLeadsRouter.get(
  '/export',
  authorize('ADMIN', 'MANAGER'),
  LeadController.exportCampaignLeadsCsv,
);

// Router for /api/leads
export const leadsRouter = Router();

// Public / partner webhook route (authenticated via HMAC SHA-256 header)
leadsRouter.post('/webhook', LeadController.handleWebhook);

leadsRouter.use(authenticate);

// Tag lead to Manager / Admin (priority alerts across devices)
leadsRouter.post('/tag', LeadController.tagLeadToManager);
leadsRouter.post('/:id/tag', LeadController.tagLeadToManager);
leadsRouter.get('/tagged', LeadController.getTaggedLeads);
leadsRouter.post('/tagged/:id/dismiss', LeadController.dismissTaggedLead);

leadsRouter.get('/my', validate(myLeadsQuerySchema), LeadController.getMyLeads);
leadsRouter.get('/export', validate(myLeadsQuerySchema), LeadController.exportMyLeadsCsv);
leadsRouter.get('/activities/my', ActivityController.getUserActivities);

leadsRouter.post(
  '/:id/reassign',
  authorize('ADMIN', 'MANAGER'),
  validate(reassignLeadSchema),
  LeadController.reassignLead,
);

leadsRouter.post(
  '/bulk-reassign',
  authorize('ADMIN', 'MANAGER'),
  validate(bulkReassignSchema),
  LeadController.bulkReassign,
);

// Lead disposition: assigned agent or ADMIN/MANAGER
leadsRouter.post('/:id/dispose', validate(disposeLeadSchema), ActivityController.disposeLead);

// Lead call activity history
leadsRouter.get('/:id/history', ActivityController.getLeadHistory);

// Next lead cursor with atomic lease lock (NeoDove Spec 4.2)
leadsRouter.post('/next', validate(getNextLeadSchema), LeadController.getNextLead);
leadsRouter.post('/:id/unlock', LeadController.unlockLead);

// Update lead details (e.g. name, phone, email)
leadsRouter.patch('/:id', validate(updateLeadSchema), LeadController.updateLead);
