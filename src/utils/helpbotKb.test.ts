import { describe, expect, it } from 'vitest';
import { KB, bestAnswer } from './helpbotKb';

describe('help assistant answers', () => {
  it('finds the right topic for common questions', () => {
    expect(bestAnswer('How do I withdraw my ticket?')?.id).toBe('withdraw');
    expect(bestAnswer('my OTP expired, can I resend')?.id).toBe('otp');
    expect(bestAnswer('what is the GSTIN format')?.id).toBe('gstin');
    expect(bestAnswer('I forgot my password')?.id).toBe('password');
    expect(bestAnswer('கடவுச்சொல் மறந்துவிட்டேன்')?.id).toBe('password');
  });
  it('returns nothing for unrelated text', () => {
    expect(bestAnswer('what is the weather')).toBeNull();
    expect(bestAnswer('x')).toBeNull();
  });
  it('every topic has English and Tamil text', () => {
    for (const e of KB) for (const v of [e.topic, e.answer]) expect(v.en && v.ta).toBeTruthy();
  });
});
