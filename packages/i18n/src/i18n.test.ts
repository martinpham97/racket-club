import { describe, expect, it } from 'vitest';
import {
  argumentNames,
  coreMessages,
  flatten,
  missingKeys,
  pickLocale,
  placeholderMismatches,
} from './index';

describe('core translations', () => {
  it('Vietnamese has every English key', () => {
    expect(missingKeys(coreMessages.en, coreMessages.vi)).toEqual([]);
  });

  it('English has every Vietnamese key', () => {
    expect(missingKeys(coreMessages.vi, coreMessages.en)).toEqual([]);
  });

  it('placeholders match between languages', () => {
    expect(placeholderMismatches(coreMessages.en, coreMessages.vi)).toEqual([]);
  });
});

describe('helpers', () => {
  it('flattens nested keys', () => {
    expect(flatten({ a: { b: 'x', c: { d: 'y' } } })).toEqual({ 'a.b': 'x', 'a.c.d': 'y' });
  });

  it('reports missing and empty keys', () => {
    expect(missingKeys({ a: 'x', b: 'y' }, { a: ' ' })).toEqual(['a', 'b']);
  });

  it('reads ICU argument names but not plural branch text', () => {
    expect(argumentNames('{count, plural, =0 {Full} one {# left} other {# left by {name}}}')).toBe(
      'count,name',
    );
    expect(argumentNames('Pay {amount} to {payId}')).toBe('amount,payId');
  });

  it('reports placeholder mismatches', () => {
    expect(placeholderMismatches({ a: 'Hi {name}' }, { a: 'Chào {ten}' })).toEqual(['a']);
  });

  it('picks a supported locale from a browser or Google profile value', () => {
    expect(pickLocale('vi-VN')).toBe('vi');
    expect(pickLocale('en_AU')).toBe('en');
    expect(pickLocale('fr-FR')).toBe('en');
    expect(pickLocale(undefined, 'vi')).toBe('vi');
  });
});
