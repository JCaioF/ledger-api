import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';

describe('schema', () => {
  it('cria user + account com balance BigInt default 0', async () => {
    const user = await prisma.user.create({ data: { email: 'a@b.com', passwordHash: 'x' } });
    const account = await prisma.account.create({ data: { userId: user.id } });
    expect(account.balance).toBe(0n);
    expect(account.currency).toBe('BRL');
    expect(user.role).toBe('USER');
  });

  it('impede email duplicado', async () => {
    await prisma.user.create({ data: { email: 'dup@b.com', passwordHash: 'x' } });
    await expect(
      prisma.user.create({ data: { email: 'dup@b.com', passwordHash: 'y' } }),
    ).rejects.toThrow();
  });
});
