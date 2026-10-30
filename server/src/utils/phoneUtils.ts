/**
 * Utilities for formatting and masking phone numbers for telecalling privacy.
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return '****';

  // Obscure middle digits, preserve leading prefix and trailing digit:
  // e.g. +91 9876543210 -> +91 98765 ****0
  // e.g. 9876543210 -> 98765****0
  const prefixLen = trimmed.length > 10 ? trimmed.length - 5 : 5;
  const prefix = trimmed.slice(0, prefixLen);
  const suffix = trimmed.slice(-1);
  return `${prefix}****${suffix}`;
}
