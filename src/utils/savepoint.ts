interface DatabaseLike {
  exec(sql: string): Promise<void>;
}

export class Savepoint {
  constructor(
    private readonly name: string,
    private readonly db: DatabaseLike
  ) {}

  async create(): Promise<void> {
    await this.db.exec(`SAVEPOINT ${this.name}`);
  }

  async release(): Promise<void> {
    await this.db.exec(`RELEASE SAVEPOINT ${this.name}`);
  }

  async rollback(): Promise<void> {
    await this.db.exec(`ROLLBACK TO SAVEPOINT ${this.name}`);
  }
}
