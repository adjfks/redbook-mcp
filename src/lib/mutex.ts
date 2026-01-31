export class Mutex {
  private chain: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.chain;

    let release!: () => void;
    this.chain = new Promise<void>((resolve) => {
      release = resolve;
    });

    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

