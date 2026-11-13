import bcrypt from "bcryptjs";

// 12 rounds ≈ 250 ms on this machine: enough that a stolen dump is expensive
// to brute-force without making login feel slow.
const ROUNDS = 12;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}
