import { createHash, randomBytes } from 'node:crypto';

export function createInviteToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
