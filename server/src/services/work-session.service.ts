import { Types } from 'mongoose';
import { WorkSession, IWorkSessionDoc } from '../models/work-session.model';
import { AgentBreakService } from './agent-break.service';
import { User, IUserDoc } from '../models/user.model';
import { AuditService } from './audit.service';
import { getISTDayKey } from '../utils/dateUtils';
import { AppError } from '../utils/AppError';

export class WorkSessionService {
  public static async clockIn(user: IUserDoc): Promise<IWorkSessionDoc> {
    const today = getISTDayKey();
    let session = await WorkSession.findOne({ userId: user._id, date: today });

    const now = new Date();
    if (!session) {
      session = await WorkSession.create({
        userId: user._id,
        date: today,
        clockInAt: now,
        clockOutAt: null,
        status: 'ONLINE',
        totalWorkSeconds: 0,
        totalBreakSeconds: 0,
      });
    } else {
      session.status = 'ONLINE';
      session.clockOutAt = null;
      await session.save();
    }

    await User.findByIdAndUpdate(user._id, { canReceiveLeads: true });

    await AuditService.log({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'WORK_SESSION_CLOCK_IN',
      resourceType: 'USER',
      resourceId: user._id.toString(),
      details: { date: today, clockInAt: now.toISOString() },
    });

    return session;
  }

  public static async clockOut(user: IUserDoc): Promise<IWorkSessionDoc> {
    const today = getISTDayKey();
    const session = await WorkSession.findOne({ userId: user._id, date: today });
    if (!session) {
      throw new AppError('No work session found for today', 400);
    }

    // If currently on break, automatically end the break
    const activeBreak = await AgentBreakService.getCurrentBreak(user._id);
    if (activeBreak) {
      await AgentBreakService.endBreak(user._id);
    }

    const now = new Date();
    const elapsedSeconds = Math.max(
      0,
      Math.round((now.getTime() - new Date(session.clockInAt).getTime()) / 1000),
    );
    const workSeconds = Math.max(0, elapsedSeconds - (session.totalBreakSeconds || 0));

    session.clockOutAt = now;
    session.status = 'OFFLINE';
    session.totalWorkSeconds = workSeconds;
    await session.save();

    await User.findByIdAndUpdate(user._id, { canReceiveLeads: false });

    await AuditService.log({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'WORK_SESSION_CLOCK_OUT',
      resourceType: 'USER',
      resourceId: user._id.toString(),
      details: {
        date: today,
        clockOutAt: now.toISOString(),
        totalWorkSeconds: workSeconds,
        totalBreakSeconds: session.totalBreakSeconds,
      },
    });

    return session;
  }

  public static async getCurrentSession(userId: string | Types.ObjectId) {
    const today = getISTDayKey();
    const [session, todayBreaks] = await Promise.all([
      WorkSession.findOne({ userId, date: today }),
      AgentBreakService.getTodayBreaks(userId),
    ]);

    return {
      session,
      activeBreak: todayBreaks.activeBreak,
      breaks: todayBreaks.breaks,
      totalBreakMinutes: todayBreaks.totalDurationMinutes,
    };
  }

  public static async getTeamSessions(
    requester: IUserDoc,
    targetDate?: string,
  ): Promise<unknown[]> {
    const date = targetDate || getISTDayKey();

    const userFilter: Record<string, unknown> = { isActive: true };
    if (requester.role === 'MANAGER' && requester.branch) {
      userFilter.branch = requester.branch;
    } else if (requester.role === 'ADMIN' && requester.branch) {
      userFilter.branch = requester.branch;
    }

    const teamUsers = await User.find(userFilter, '_id name email role branch canReceiveLeads');
    const userIds = teamUsers.map((u) => u._id);

    const sessions = await WorkSession.find({
      userId: { $in: userIds },
      date,
    }).populate('userId', 'name email role branch canReceiveLeads');

    return sessions;
  }
}
