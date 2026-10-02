import { createHash } from 'node:crypto';
import { firebaseFirestore } from '../config/firebase.js';

// Distributed across serverless instances; raw client IPs are never persisted.
export class FirestoreRateLimitStore {
  windowMs;
  constructor() {
    if (!firebaseFirestore) throw new Error('Firestore is required for distributed login rate limiting.');
    this.collection = firebaseFirestore.collection('rateLimits');
  }
  init(options) {
    this.windowMs = options.windowMs;
  }
  async increment(key) {
    const id = createHash('sha256').update(String(key)).digest('hex');
    const ref = this.collection.doc(id);
    return firebaseFirestore.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      const now = Date.now();
      const existing = doc.exists ? doc.data() : null;
      const resetAt = existing?.resetAt?.toMillis?.() || 0;
      const totalHits = resetAt > now ? Number(existing.hits || 0) + 1 : 1;
      const newResetTime = resetAt > now ? resetAt : now + this.windowMs;
      transaction.set(ref, {
        hits: totalHits,
        resetAt: new Date(newResetTime),
        expiresAt: new Date(newResetTime + this.windowMs),
      });
      return { totalHits, resetTime: new Date(newResetTime) };
    });
  }
  async decrement(key) {
    const id = createHash('sha256').update(String(key)).digest('hex');
    const ref = this.collection.doc(id);
    await firebaseFirestore.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      if (doc.exists && Number(doc.data().hits) > 0) {
        transaction.update(ref, { hits: Number(doc.data().hits) - 1 });
      }
    });
  }
  async resetKey(key) {
    const id = createHash('sha256').update(String(key)).digest('hex');
    await this.collection.doc(id).delete();
  }
}
