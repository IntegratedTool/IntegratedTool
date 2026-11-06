import { describe, expect, it } from 'vitest';
import {
  CAPTCHA_ALPHABET,
  GSTIN_RE,
  TIN_RE,
  isAdminIdentifier,
  isStrongPassword,
  isValidName,
  maskEmail,
} from './validation';

describe('validation', () => {
  it('password rules 8–16, mixed, no spaces', () => {
    expect(isStrongPassword('Abcd@123')).toBe(true);
    expect(isStrongPassword('Abcd@12')).toBe(false); // 7
    expect(isStrongPassword('Abcd@1234567890xy')).toBe(false); // 17
    expect(isStrongPassword('abcd@1234')).toBe(false);
    expect(isStrongPassword('ABCD@1234')).toBe(false);
    expect(isStrongPassword('Abcdef@gh')).toBe(false);
    expect(isStrongPassword('Abcdefg12')).toBe(false);
    expect(isStrongPassword('Abc d@123')).toBe(false);
  });
  it('name: English only, max 60', () => {
    expect(isValidName('A. Kumar, Jr')).toBe(true);
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('Kumar9')).toBe(false);
    expect(isValidName('குமார்')).toBe(false);
    expect(isValidName('a'.repeat(61))).toBe(false);
  });
  it('GSTIN / TIN', () => {
    expect(GSTIN_RE.test('33ABCDE1234F1Z7')).toBe(true);
    expect(GSTIN_RE.test('27ABCDE1234F1Z5')).toBe(false);
    expect(GSTIN_RE.test('33ABCDE1234F1Z')).toBe(false);
    expect(TIN_RE.test('33123456789')).toBe(true);
    expect(TIN_RE.test('3312345678')).toBe(false);
    expect(TIN_RE.test('3312345678A')).toBe(false);
  });
  it('admin identifier', () => {
    expect(isAdminIdentifier('x@tn.gov.in', 'Admin Helpdesk')).toBe(true);
    expect(isAdminIdentifier('x@tn.gov.in.evil.com', 'Admin Helpdesk')).toBe(false);
    expect(isAdminIdentifier('x@gmail.com', 'Admin Helpdesk')).toBe(false);
    expect(isAdminIdentifier('admin helpdesk', 'Admin Helpdesk')).toBe(true);
  });
  it('captcha alphabet excludes confusing characters', () => {
    for (const c of '0O I1LUVTJ'.replace(' ', '')) expect(CAPTCHA_ALPHABET.includes(c)).toBe(false);
    expect(CAPTCHA_ALPHABET.length).toBe(27);
  });
  it('maskEmail hides most of the local part', () => {
    expect(maskEmail('officer.demo@tn.gov.in')).toBe('o******o@tn.gov.in');
    expect(maskEmail('ab@x.com')).toBe('a*@x.com');
  });
});
