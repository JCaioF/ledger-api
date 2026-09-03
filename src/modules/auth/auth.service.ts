import argon2 from 'argon2';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../config/env.js';
import { AuthError, ConflictError } from '../../domain/errors.js';

export async function register(email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('Email already registered');
  const user = await prisma.user.create({
    data: { email, passwordHash: await argon2.hash(password) },
  });
  return { id: user.id, email: user.email, role: user.role };
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
