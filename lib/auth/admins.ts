export const ADMIN_USERNAMES = ['Kutxyt', 'Daiki0'] as const;

export const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'] as const;

const usernameSet = new Set(ADMIN_USERNAMES.map((u) => u.toLowerCase()));
const emailSet = new Set(ADMIN_EMAILS.map((e) => e.toLowerCase()));

export function isAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return usernameSet.has(username.toLowerCase());
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return emailSet.has(email.toLowerCase());
}

export function isAdmin(input: { username?: string | null; email?: string | null } | null | undefined): boolean {
  if (!input) return false;
  return isAdminUsername(input.username) || isAdminEmail(input.email);
}
