/**
 * Canonical Activity Direction and Classification Helpers
 * Single source of truth used across server and mobile.
 */

export interface ActivityLike {
  _id?: unknown;
  direction?: string | null;
  callType?: string | null;
  stage?: string | null;
  type?: string | null;
}

/**
 * Returns true if an activity is canonically INCOMING.
 * Outbound calls (even if unanswered or marked 'Missed Call') are NEVER classified as incoming.
 */
export function isActivityIncoming(act: ActivityLike | null | undefined): boolean {
  if (!act) return false;
  const dir = (act.direction || '').toUpperCase();
  if (dir === 'OUTGOING') return false;
  if (dir === 'INCOMING') return true;
  if ((act.callType || '').toUpperCase() === 'INCOMING') return true;

  const idStr = String(act._id || '');
  if (idStr.startsWith('inc-')) return true;

  return act.stage === 'Missed Call' && dir !== 'OUTGOING';
}
