import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  InsufficientFundsError,
  ConflictError,
} from '../../src/domain/errors.js';

describe('errors', () => {
  it('AppError guarda statusCode e code', () => {
    const e = new AppError('x', 418, 'TEAPOT');
    expect(e).toBeInstanceOf(Error);
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe('TEAPOT');
  });

  it('subclasses trazem status/code corretos', () => {
    expect(new ValidationError().statusCode).toBe(400);
    expect(new InsufficientFundsError().code).toBe('INSUFFICIENT_FUNDS');
    expect(new InsufficientFundsError().statusCode).toBe(422);
    expect(new ConflictError().statusCode).toBe(409);
  });
});
