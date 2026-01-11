/**
 * RateLimiter using Token Bucket algorithm
 * Manages API rate limits across parallel workers
 */

export interface RateLimiterConfig {
  tokensPerMinute: number;
  verbose?: boolean;
}

export interface RateLimitStatus {
  availableTokens: number;
  tokensPerMinute: number;
  currentWindowStart: Date;
  waitTimeMs: number;
}

/**
 * Token bucket rate limiter for coordinating API calls across workers.
 * Ensures the system stays within rate limits by tracking token usage per minute.
 */
export class RateLimiter {
  private tokensUsed: number = 0;
  private lastUpdate: number; // Track last time we updated the bucket
  private readonly tokensPerMinute: number;
  private readonly windowMs: number = 60000; // 1 minute
  private readonly verbose: boolean;
  private waitingQueue: Array<{
    tokens: number;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  private processingQueue: boolean = false;

  constructor(config: RateLimiterConfig) {
    this.tokensPerMinute = config.tokensPerMinute;
    this.verbose = config.verbose ?? false;

    // Start with bucket full (tokensUsed = 0) and set last update to now
    this.lastUpdate = Date.now();

    if (this.verbose) {
      console.log(`[RateLimiter] Initialized with ${this.tokensPerMinute} tokens per minute (bucket starts full)`);
    }
  }

  /**
   * Request tokens from the rate limiter.
   * If tokens are available, returns immediately.
   * If limit is reached, waits until the next window or tokens become available.
   */
  async acquireTokens(estimatedTokens: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.waitingQueue.push({ tokens: estimatedTokens, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the waiting queue, granting tokens when available
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue) {
      if (this.verbose) {
        console.log(`[RateLimiter] processQueue() called but already processing. Queue length: ${this.waitingQueue.length}`);
      }
      return;
    }
    this.processingQueue = true;

    if (this.verbose) {
      console.log(`[RateLimiter] processQueue() started. Queue length: ${this.waitingQueue.length}`);
    }

    try {
      while (this.waitingQueue.length > 0) {
        const request = this.waitingQueue[0];
        const available = this.getAvailableTokens();

        if (this.verbose) {
          console.log(`[RateLimiter] Processing request for ${request.tokens} tokens. Available: ${available}, Queue length: ${this.waitingQueue.length}`);
        }

        // If enough tokens available, grant immediately
        // OR if the request is larger than the entire bucket size, grant it if the bucket is full
        // (This logic remains for safety against infinite loops, though optimistic reservation makes it less likely to be hit)
        if (
          available >= request.tokens ||
          (request.tokens > this.tokensPerMinute && available >= this.tokensPerMinute)
        ) {
          this.tokensUsed += request.tokens;
          this.waitingQueue.shift();
          request.resolve();

          if (this.verbose) {
            console.log(
              `[RateLimiter] Granted ${request.tokens} tokens. Used: ${this.tokensUsed}/${this.tokensPerMinute}`,
            );
          }
        } else {
          // Need to wait for tokens to become available
          const tokensNeeded = request.tokens - available;

          // With continuous refill, calculate time needed for tokensNeeded to be refilled
          // Token refill rate: tokensPerMinute per windowMs (60000ms)
          const refillRatePerMs = this.tokensPerMinute / this.windowMs;

          // Time to refill tokensNeeded: tokensNeeded / refillRatePerMs
          let waitTime = Math.ceil(tokensNeeded / refillRatePerMs);

          // Add a small buffer (100ms) to account for timing precision
          waitTime = Math.max(100, waitTime + 100);

          // Cap wait time at 2x window size to prevent excessive waits
          waitTime = Math.min(waitTime, this.windowMs * 2);

          if (this.verbose) {
            console.log(
              `[RateLimiter] Rate limit reached. Need ${tokensNeeded} more tokens. Waiting ${Math.round(waitTime / 1000)}s (refill rate: ${Math.round(refillRatePerMs * 1000)} tokens/sec). Queue length: ${this.waitingQueue.length}`,
            );
          }

          // Wait for tokens to be refilled
          await new Promise((resolve) => setTimeout(resolve, waitTime));

          if (this.verbose) {
            console.log(`[RateLimiter] Wait completed. Queue length: ${this.waitingQueue.length}`);
          }

          // After waiting, getAvailableTokens() will automatically account for refill
        }
      }

      if (this.verbose) {
        console.log(`[RateLimiter] processQueue() completed. Queue is empty.`);
      }
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Report actual token usage after an API call.
   * This adjusts the limiter based on real usage vs estimates.
   */
  reportUsage(actualTokens: number, estimatedTokens: number): void {
    // Adjust the used tokens based on the difference
    const difference = actualTokens - estimatedTokens;

    if (difference !== 0) {
      this.tokensUsed += difference;

      if (this.verbose && Math.abs(difference) > 100) {
        console.log(
          `[RateLimiter] Adjusted usage: estimated ${estimatedTokens}, actual ${actualTokens} (diff: ${difference})`,
        );
      }
    }
  }

  /**
   * Get the number of tokens available, accounting for continuous refill
   * This also updates the bucket state based on elapsed time
   */
  getAvailableTokens(): number {
    const now = Date.now();
    const elapsed = now - this.lastUpdate;

    // Calculate tokens refilled since last update
    // Token refill rate: tokensPerMinute per windowMs
    const tokensRefilled = (elapsed / this.windowMs) * this.tokensPerMinute;

    // Reduce tokens used by refilled amount (continuous refill)
    this.tokensUsed = Math.max(0, this.tokensUsed - tokensRefilled);

    // Update last update time
    this.lastUpdate = now;

    // Available = bucket size - tokens used (capped at bucket size)
    const available = Math.max(0, this.tokensPerMinute - this.tokensUsed);

    return available;
  }

  /**
   * Get current status of the rate limiter
   */
  getStatus(): RateLimitStatus {
    const available = this.getAvailableTokens();
    // Calculate wait time for next token to become available
    const tokensNeeded = Math.max(1, this.tokensUsed - this.tokensPerMinute + 1);
    const refillRatePerMs = this.tokensPerMinute / this.windowMs;
    const waitTimeMs = tokensNeeded / refillRatePerMs;

    return {
      availableTokens: available,
      tokensPerMinute: this.tokensPerMinute,
      currentWindowStart: new Date(this.lastUpdate),
      waitTimeMs: Math.max(0, waitTimeMs),
    };
  }

  /**
   * Check if a request would exceed the rate limit
   */
  wouldExceedLimit(tokens: number): boolean {
    const available = this.getAvailableTokens();
    return available < tokens;
  }
}
