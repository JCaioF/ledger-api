import { ValidationError } from './errors.js';

export function parseAmountToCents(input: unknown): bigint {
  if (typeof input !== 'number' && typeof input !== 'string') {
    throw new ValidationError('amount must be a number of cents');
  }
  const n = Number(input);
  if (!Number.isInteger(n)) throw new ValidationError('amount must be an integer number of cents');
  if (n <= 0) throw new ValidationError('amount must be greater than zero');
  if (n > Number.MAX_SAFE_INTEGER) throw new ValidationError('amount too large');
  return BigInt(n);
}

export function centsToString(v: bigint): string {
  return v.toString();
}
