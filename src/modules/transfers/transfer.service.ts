import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { performTransfer, type TransferParams } from './ledger.repository.js';

export async function executeTransfer(params: TransferParams) {
  try {
    return await prisma.$transaction((tx) => performTransfer(tx, params));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const transfer = await prisma.transfer.findUniqueOrThrow({
        where: { idempotencyKey: params.idempotencyKey },
      });
      return { transfer, reused: true };
    }
    throw err;
  }
}
