import { describe, it, expect } from 'vitest';
import { parseAmountToCents, centsToString } from '../../src/domain/money.js';
import { ValidationError } from '../../src/domain/errors.js';

describe('parseAmountToCents', () => {
  it('aceita inteiro positivo', () => {
    expect(parseAmountToCents(150)).toBe(150n);
    expect(parseAmountToCents('150')).toBe(150n);
  });

  it('rejeita zero, negativo, float, texto e valor gigante', () => {
    for (const bad of [0, -5, 1.5, 'abc', Number.MAX_SAFE_INTEGER + 1, null, undefined]) {
      expect(() => parseAmountToCents(bad as unknown)).toThrow(ValidationError);
    }
  });
});

describe('centsToString', () => {
  it('serializa BigInt como string', () => {
    expect(centsToString(1234567890123n)).toBe('1234567890123');
  });
});
