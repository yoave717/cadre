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
  private windowStart: number = Date.now();
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

    if (this.verbose) {
      console.log(`[RateLimiter] Initialized with ${this.tokensPerMinute} tokens per minute`);
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
    if (this.processingQueue) return;
    this.processingQueue = true;

    try {
      while (this.waitingQueue.length > 0) {
        // Reset window if needed
        this.resetIfNeeded();

        const request = this.waitingQueue[0];
        const available = this.getAvailableTokens();

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
          // Need to wait for next window
          const waitTime = this.getWaitTime();

          if (this.verbose) {
            console.log(
              `[RateLimiter] Rate limit reached. Waiting ${Math.round(waitTime / 1000)}s for next window.`,
            );
          }

          // Wait for the window to reset
          await new Promise((resolve) => setTimeout(resolve, waitTime));

          // After waiting, reset window and continue
          this.resetIfNeeded();
        }
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
   * Get the number of tokens available in the current window
   */
  getAvailableTokens(): number {
    this.resetIfNeeded();
    return Math.max(0, this.tokensPerMinute - this.tokensUsed);
  }

  /**
   * Get the wait time in milliseconds until the next window
   */
  private getWaitTime(): number {
    const elapsed = Date.now() - this.windowStart;
    return Math.max(0, this.windowMs - elapsed);
  }

  /**
   * Reset the window if a minute has passed
   */
  private resetIfNeeded(): void {
    const now = Date.now();
    const elapsed = now - this.windowStart;

    if (elapsed >= this.windowMs) {
      // Calculate how many windows have passed
      const windowsPassed = Math.floor(elapsed / this.windowMs);

      // Reduce used tokens by the capacity of the passed windows
      // This effectively "pays off" the debt over time
      const tokensToRestore = windowsPassed * this.tokensPerMinute;
      this.tokensUsed = Math.max(0, this.tokensUsed - tokensToRestore);

      // Advance window start time
      this.windowStart += windowsPassed * this.windowMs;

      if (this.verbose) {
        console.log(
          `[RateLimiter] Window reset (${windowsPassed}x). New usage: ${this.tokensUsed}`,
        );
      }
    }
  }

  /**
   * Get current status of the rate limiter
   */
  getStatus(): RateLimitStatus {
    this.resetIfNeeded();
    return {
      availableTokens: this.getAvailableTokens(),
      tokensPerMinute: this.tokensPerMinute,
      currentWindowStart: new Date(this.windowStart),
      waitTimeMs: this.getWaitTime(),
    };
  }

  /**
   * Check if a request would exceed the rate limit
   */
  wouldExceedLimit(tokens: number): boolean {
    this.resetIfNeeded();
    return this.tokensUsed + tokens > this.tokensPerMinute;
  }
}
