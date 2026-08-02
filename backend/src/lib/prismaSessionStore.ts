import { Store } from "express-session";
import { prisma } from "../db";

/**
 * Minimal express-session Store backed by Prisma/SQLite so logins survive
 * container restarts without pulling in another native dependency.
 */
export class PrismaSessionStore extends Store {
  private ttlMs: number;

  constructor(options: { ttlMs: number }) {
    super();
    this.ttlMs = options.ttlMs;
  }

  async get(sid: string, callback: (err: any, session?: any) => void) {
    try {
      const row = await prisma.session.findUnique({ where: { sid } });
      if (!row || row.expiresAt < new Date()) {
        return callback(null, null);
      }
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  async set(sid: string, session: any, callback?: (err?: any) => void) {
    try {
      const expiresAt = new Date(Date.now() + this.ttlMs);
      const data = JSON.stringify(session);
      await prisma.session.upsert({
        where: { sid },
        create: { sid, data, expiresAt },
        update: { data, expiresAt },
      });
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void) {
    try {
      await prisma.session.deleteMany({ where: { sid } });
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  async touch(sid: string, session: any, callback?: (err?: any) => void) {
    try {
      const expiresAt = new Date(Date.now() + this.ttlMs);
      await prisma.session.updateMany({ where: { sid }, data: { expiresAt } });
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  async clearExpired() {
    await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}
