import { Prisma } from '@prisma/client';
import argon2 from 'argon2';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../config/env.js';
import { AuthError, ConflictError } from '../../domain/errors.js';

export async function register(email: string, password: string) {
  // Fast path: responde 409 sem pagar o hash do argon2 no caso comum.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('Email already registered');

  // O findUnique acima não é atômico com o create: dois registros simultâneos do
  // mesmo e-mail passam os dois pelo pre-check e o perdedor bate na unique de
  // `User.email` (P2002). Sem este catch isso vazaria como 500 em vez do 409 que
  // o caminho sequencial já devolve. Mesmo padrão do executeTransfer.
  try {
    const user = await prisma.user.create({
      data: { email, passwordHash: await argon2.hash(password) },
    });
    return { id: user.id, email: user.email, role: user.role };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('Email already registered');
    }
    throw err;
  }
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await argon2.verify(user.passwordHash, password))) {
    throw new AuthError('Invalid credentials');
  }
  const options: SignOptions = { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] };
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, options);
  return { token };
}
