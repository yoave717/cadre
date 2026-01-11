import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../../src/utils/rate-limiter.js';

describe('RateLimiter Repro', () => {
  it('should ALLOW oversized requests if bucket is full', async () => {
    const rateLimiter = new RateLimiter({
      tokensPerMinute: 100, // Small limit
      verbose: true,
    });

    console.log('Requesting 200 tokens (limit 100)...');

    // This should now succeed immediately (or very quickly) because the bucket is full (initialized to full)
    // and we allow oversized requests when full.
    const requestPromise = rateLimiter.acquireTokens(200);

    // Use a small timeout to catch if it still hangs (regression)
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000));

    const result = await Promise.race([requestPromise.then(() => 'success'), timeoutPromise]);

    expect(result).toBe('success');
  });
});
