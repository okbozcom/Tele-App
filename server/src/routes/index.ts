import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import pipelineRoutes from './pipeline.routes';
import campaignRoutes from './campaign.routes';
import { campaignLeadsRouter, leadsRouter } from './lead.routes';
import settingRoutes from './setting.routes';
import retryRuleRoutes from './retry-rule.routes';
import reportRoutes from './report.routes';
import branchRoutes from './branch.routes';
import auditRoutes from './audit.routes';
import agentBreakRoutes from './agent-break.routes';
import statRoutes from './stat.routes';
import syncRoutes from './sync.routes';

const router = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/pipelines', pipelineRoutes);
router.use('/campaigns/:id/leads', campaignLeadsRouter);
router.use('/campaigns', campaignRoutes);
router.use('/leads', leadsRouter);
router.use('/settings', settingRoutes);
router.use('/retry-rules', retryRuleRoutes);
router.use('/reports', reportRoutes);
router.use('/stats', statRoutes);
router.use('/sync', syncRoutes);
router.use('/branches', branchRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/breaks', agentBreakRoutes);

export default router;
