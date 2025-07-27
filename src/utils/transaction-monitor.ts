export interface TransactionStats {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  averageDuration: number;
  activeTransactions: number;
}

export class TransactionMonitor {
  private stats: TransactionStats = {
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    averageDuration: 0,
    activeTransactions: 0,
  };

  recordTransaction(success: boolean, duration: number): void {
    this.stats.totalTransactions += 1;

    if (success) {
      this.stats.successfulTransactions += 1;
    } else {
      this.stats.failedTransactions += 1;
    }

    // Update average duration
    const totalDuration =
      this.stats.averageDuration * (this.stats.totalTransactions - 1) + duration;
    this.stats.averageDuration = totalDuration / this.stats.totalTransactions;
  }

  updateActiveCount(count: number): void {
    this.stats.activeTransactions = count;
  }

  getStats(): TransactionStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      averageDuration: 0,
      activeTransactions: 0,
    };
  }
}
