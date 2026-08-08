import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const findFirst = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args), findFirst: (...args: unknown[]) => findFirst(...args) } },
}));

const { findUserByEmail, normalizeEmail } = await import('@/lib/auth/findUserByEmail');

describe('an account is found whatever the case the player types', () => {
  beforeEach(() => {
    findUnique.mockReset();
    findFirst.mockReset();
  });

  it('an exact match is used as is, so nothing changes for existing players', async () => {
    findUnique.mockResolvedValue({ id: 'u1', email: 'Foo@Gmail.com' });
    const user = await findUserByEmail('Foo@Gmail.com');
    expect(user?.id).toBe('u1');
    expect(findFirst, 'no second query when the exact address exists').not.toHaveBeenCalled();
  });

  it('a different case still finds the account', async () => {
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue({ id: 'u2', email: 'Foo@Gmail.com' });

    const user = await findUserByEmail('foo@gmail.com');
    expect(user?.id).toBe('u2');
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'foo@gmail.com', mode: 'insensitive' } },
    });
  });

  it('surrounding spaces never break the lookup', async () => {
    findUnique.mockResolvedValue({ id: 'u3', email: 'a@b.com' });
    await findUserByEmail('  a@b.com  ');
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
  });

  it('two accounts differing only by case keep the exact one', async () => {
    findUnique.mockResolvedValue({ id: 'exact', email: 'Mimmo500@x.com' });
    findFirst.mockResolvedValue({ id: 'other', email: 'mimmo500@x.com' });

    const user = await findUserByEmail('Mimmo500@x.com');
    expect(user?.id, 'the address typed wins over its case twin').toBe('exact');
  });

  it('an unknown address returns nothing', async () => {
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue(null);
    expect(await findUserByEmail('nobody@nowhere.com')).toBeNull();
  });

  it('an empty address never queries the database', async () => {
    expect(await findUserByEmail('   ')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Gmail.COM ')).toBe('foo@gmail.com');
  });
});
