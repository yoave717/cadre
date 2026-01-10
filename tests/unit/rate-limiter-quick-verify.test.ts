import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../../src/utils/rate-limiter.js';

describe('RateLimiter Quick Verification', () => {
  it('workers can start immediately - bucket is full', async () => {
    const rateLimiter = new RateLimiter({
      tokensPerMinute: 10000,
      verbose: false,
    });

    const startTime = Date.now();

    // All workers should get tokens immediately
    await Promise.all([
      rateLimiter.acquireTokens(2000),
      rateLimiter.acquireTokens(2000),
      rateLimiter.acquireTokens(2000),
      rateLimiter.acquireTokens(2000),
    ]);

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100); // Should be instant
  });

  it('continuous refill allows faster processing', async () => {
    const rateLimiter = new RateLimiter({
      tokensPerMinute: 12000, // 200 tokens/sec
      verbose: false,
    });

    // Use most tokens
    await rateLimiter.acquireTokens(11000);

    const startTime = Date.now();

    // Need to wait for ~500 more tokens at 200/sec = ~2.5 seconds
    await rateLimiter.acquireTokens(1500);

    const duration = Date.now() - startTime;

    // Should take ~2-3 seconds with continuous refill, not 60 seconds!
    expect(duration).toBeGreaterThan(2000);
    expect(duration).toBeLessThan(4000);
  });

  it('queued workers are all processed', async () => {
    const rateLimiter = new RateLimiter({
      tokensPerMinute: 12000, // 200 tokens/sec
      verbose: false,
    });

    // Drain bucket
    await rateLimiter.acquireTokens(12000);

    // Queue workers
    const promises = [
      rateLimiter.acquireTokens(1000),
      rateLimiter.acquireTokens(1000),
      rateLimiter.acquireTokens(1000),
    ];

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Workers hung!')), 20000)
    );

    // Should complete without hanging (~15 seconds needed for 3000 tokens)
    await Promise.race([Promise.all(promises), timeout]);
  }, 25000);
});
