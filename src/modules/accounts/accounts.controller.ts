import type { Request, Response } from 'express';
import * as service from './accounts.service.js';
import { toAccountDTO } from './accounts.dto.js';

export async function createAccountHandler(req: Request, res: Response) {
  const account = await service.createAccount(req.auth!.userId);
  res.status(201).json(toAccountDTO(account));
}

export async function getAccountHandler(req: Request, res: Response) {
  const account = await service.getAccount(req.auth!, req.params.id);
  res.status(200).json(toAccountDTO(account));
}
