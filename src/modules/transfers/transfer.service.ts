import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { performTransfer, type TransferParams } from './ledger.repository.js';
import * as accountsRepo from '../accounts/accounts.repository.js';
import { parseAmountToCents } from '../../domain/money.js';
import {
  AccountNotFoundError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../domain/errors.js';
import type { AuthContext } from '../../middleware/auth.js';

// Toda transferência trava a conta de origem com FOR UPDATE; num depósito essa
// conta é sempre a `treasury`, então depósitos concorrentes enfileiram na mesma
// linha. Os defaults do Prisma (maxWait 2s / timeout 5s) são apertados para essa
// fila — folga maior troca um 500 espúrio por uma espera um pouco mais longa.
const TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 };

// P2002 traz a constraint violada em `meta.target`. No Postgres + Prisma 5 isso é
// um array de nomes de campo (verificado: `{"modelName":"Transfer","target":["idempotencyKey"]}`),
// mas outros conectores devolvem o nome da constraint como string — daí normalizar.
function violatedIdempotencyKey(target: unknown): boolean {
  const parts = Array.isArray(target) ? target : [target];
  return parts.some((p) => typeof p === 'string' && p.includes('idempotencyKey'));
}

export async function executeTransfer(params: TransferParams) {
  try {
    return await prisma.$transaction((tx) => performTransfer(tx, params), TX_OPTIONS);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Só é replay de idempotência se a unique violada for mesmo a de
      // `idempotencyKey`. Hoje é a única unique alcançável daqui, mas assumir
      // isso faria uma unique futura virar um "já processei" silencioso.
      if (err.code === 'P2002' && violatedIdempotencyKey(err.meta?.target)) {
        const transfer = await prisma.transfer.findUniqueOrThrow({
          where: { idempotencyKey: params.idempotencyKey },
        });
        return { transfer, reused: true };
      }
      // P2028: a transação estourou timeout/maxWait. É contenção, não bug, e um
      // 500 genérico esconderia isso. Em `POST /transfers` o retry é seguro pela
      // `Idempotency-Key`; em depósitos a chave é interna, então o retry é
      // decisão do operador (ver "Limitações conhecidas" no README).
      if (err.code === 'P2028') {
        throw new ConflictError('Transaction timed out due to contention, please retry');
      }
    }
    throw err;
  }
}

export async function createTransfer(
  auth: AuthContext,
  input: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    idempotencyKey: string;
  },
) {
  const from = await accountsRepo.findById(input.fromAccountId);
  if (!from) throw new AccountNotFoundError();
  if (auth.role !== 'ADMIN' && from.userId !== auth.userId) {
    throw new ForbiddenError('Not your account');
  }
  const to = await accountsRepo.findById(input.toAccountId);
  if (!to) throw new AccountNotFoundError();

  return executeTransfer({
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount: parseAmountToCents(input.amount),
    idempotencyKey: `${auth.userId}:${input.idempotencyKey}`,
  });
}

export async function getTransfer(auth: AuthContext, id: string) {
  const transfer = await prisma.transfer.findUnique({ where: { id } });
  if (!transfer) throw new NotFoundError('Transfer not found');
  if (auth.role === 'ADMIN') return transfer;

  const accounts = await prisma.account.findMany({
    where: { id: { in: [transfer.fromAccountId, transfer.toAccountId] } },
  });
  const isParticipant = accounts.some((a) => a.userId === auth.userId);
  if (!isParticipant) throw new ForbiddenError('Not a participant of this transfer');
  return transfer;
}
