import { describe, it, expect } from 'vitest';
import { isAdmin, isAdminUsername, isAdminEmail, ADMIN_USERNAMES, ADMIN_EMAILS } from '@/lib/auth/admins';

describe('admin whitelist', () => {
  it('contains exactly the expected admins', () => {
    expect(ADMIN_USERNAMES).toEqual(['Kutxyt', 'Daiki0']);
    expect(ADMIN_EMAILS).toEqual(['matteo.biyikli3224@gmail.com']);
  });

  it('isAdminUsername is case-insensitive', () => {
    expect(isAdminUsername('Kutxyt')).toBe(true);
    expect(isAdminUsername('kutxyt')).toBe(true);
    expect(isAdminUsername('KUTXYT')).toBe(true);
    expect(isAdminUsername('Daiki0')).toBe(true);
    expect(isAdminUsername('random')).toBe(false);
    expect(isAdminUsername(null)).toBe(false);
    expect(isAdminUsername(undefined)).toBe(false);
    expect(isAdminUsername('')).toBe(false);
  });

  it('isAdminEmail is case-insensitive', () => {
    expect(isAdminEmail('matteo.biyikli3224@gmail.com')).toBe(true);
    expect(isAdminEmail('MATTEO.BIYIKLI3224@GMAIL.COM')).toBe(true);
    expect(isAdminEmail('random@example.com')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });

  it('isAdmin accepts either username or email', () => {
    expect(isAdmin({ username: 'Kutxyt', email: null })).toBe(true);
    expect(isAdmin({ username: null, email: 'matteo.biyikli3224@gmail.com' })).toBe(true);
    expect(isAdmin({ username: 'random', email: 'random@example.com' })).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin({})).toBe(false);
  });
});
