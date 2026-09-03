import type { Request, Response } from 'express';
import * as service from './transfer.service.js';
import { toTransferDTO } from './transfer.dto.js';
import { ValidationError } from '../../domain/errors.js';

export async function createTransferHandler(req: Request, res: Response) {
  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey) throw new ValidationError('Idempotency-Key header is required');

  const { transfer, reused } = await service.createTransfer(req.auth!, {
    fromAccountId: req.body.fromAccountId,
    toAccountId: req.body.toAccountId,
    amount: req.body.amount,
    idempotencyKey,
  });
  res.status(reused ? 200 : 201).json(toTransferDTO(transfer));
}

export async function getTransferHandler(req: Request, res: Response) {
  const transfer = await service.getTransfer(req.auth!, req.params.id);
  res.status(200).json(toTransferDTO(transfer));
}
