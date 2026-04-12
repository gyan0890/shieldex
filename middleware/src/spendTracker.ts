// ============================================================
// spendTracker.ts — Rolling daily spend tracker (in-memory)
// Tracks total USDC spent in the current calendar day (UTC).
// Resets automatically at midnight UTC.
// ============================================================

interface DayBucket {
  date: string;   // "YYYY-MM-DD" in UTC
  total: number;  // Total USDC spent
}

class SpendTracker {
  private bucket: DayBucket;

  constructor() {
    this.bucket = {
      date: this.todayUTC(),
      total: 0,
    };
  }

  /** Returns today's date as "YYYY-MM-DD" in UTC */
  private todayUTC(): string {
    return new Date().toISOString().split("T")[0];
  }

  /**
   * Rolls over the bucket if the day has changed.
   * Called before every read/write operation.
   */
  private rolloverIfNeeded(): void {
    const today = this.todayUTC();
    if (this.bucket.date !== today) {
      console.log(
        `[SpendTracker] New day detected. Resetting spend from ${this.bucket.total} to 0 (was ${this.bucket.date}, now ${today})`
      );
      this.bucket = { date: today, total: 0 };
    }
  }

  /** Returns the total USDC spent today */
  getDailySpent(): number {
    this.rolloverIfNeeded();
    return this.bucket.total;
  }

  /** Records a successful payment */
  recordSpend(amount: number): void {
    this.rolloverIfNeeded();
    this.bucket.total = parseFloat((this.bucket.total + amount).toFixed(6));
    console.log(
      `[SpendTracker] Recorded spend of ${amount} USDC. Daily total: ${this.bucket.total}`
    );
  }

  /** Returns remaining budget for today given a cap */
  getRemaining(dailyCap: number): number {
    this.rolloverIfNeeded();
    return parseFloat(Math.max(0, dailyCap - this.bucket.total).toFixed(6));
  }

  /** Returns the current bucket for debugging / API responses */
  getStatus(dailyCap: number): { date: string; spent: number; remaining: number; cap: number } {
    this.rolloverIfNeeded();
    return {
      date: this.bucket.date,
      spent: this.bucket.total,
      remaining: this.getRemaining(dailyCap),
      cap: dailyCap,
    };
  }
}

// Export a singleton so all routes share the same tracker
export const spendTracker = new SpendTracker();
