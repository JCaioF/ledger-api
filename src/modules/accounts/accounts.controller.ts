import type { Request, Response } from 'express';
import * as service from './accounts.service.js';
import { toAccountDTO } from './accounts.dto.js';
import { toTransferDTO } from '../transfers/transfer.dto.js';

export async function createAccountHandler(req: Request, res: Response) {
  const account = await service.createAccount(req.auth!.userId);
  res.status(201).json(toAccountDTO(account));
}

export async function getAccountHandler(req: Request, res: Response) {
  const account = await service.getAccount(req.auth!, req.params.id);
  res.status(200).json(toAccountDTO(account));
}

export async function depositHandler(req: Request, res: Response) {
  const transfer = await service.deposit(req.params.id, req.body.amount);
  res.status(201).json(toTransferDTO(transfer));
}

export async function statementHandler(req: Request, res: Response) {
  const result = await service.getStatement(
    req.auth!,
    req.params.id,
    req.validatedQuery as {
      limit: number;
      cursor?: string;
      from?: Date;
      to?: Date;
    },
  );
  res.status(200).json(result);
}
