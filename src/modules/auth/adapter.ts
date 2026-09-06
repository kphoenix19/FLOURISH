import type { Adapter, AdapterUser, AdapterAccount } from "next-auth/adapters";
import type { PrismaClient, User } from "../../generated/prisma/client";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const mapped = (user: User): AdapterUser => ({ id: user.id, email: user.email, name: user.name, image: user.imageUrl, emailVerified: user.emailVerified });

// JWT sessions need only identity/account methods. Google access/refresh tokens
// are deliberately not retained: FLOURISH does not call Google APIs.
export function flourishAdapter(getDb: () => PrismaClient): Adapter {
  return {
    async createUser(user: Omit<AdapterUser, "id">) {
      if (!user.email) throw new Error("Google email is required");
      return mapped(await getDb().user.create({ data: {
        email: normalizeEmail(user.email), name: user.name, imageUrl: user.image,
        emailVerified: user.emailVerified, player: { create: {} },
      } }));
    },
    async getUser(id) { const user = await getDb().user.findUnique({ where: { id } }); return user ? mapped(user) : null; },
    async getUserByEmail(email) { const user = await getDb().user.findUnique({ where: { email: normalizeEmail(email) } }); return user ? mapped(user) : null; },
    async getUserByAccount(key) {
      const account = await getDb().authAccount.findUnique({ where: { provider_providerAccountId: key }, include: { user: true } });
      return account ? mapped(account.user) : null;
    },
    async updateUser({ id, ...user }) {
      return mapped(await getDb().user.update({ where: { id }, data: {
        email: user.email === undefined ? undefined : normalizeEmail(user.email),
        name: user.name, imageUrl: user.image, emailVerified: user.emailVerified,
      } }));
    },
    async linkAccount(account: AdapterAccount) {
      if (account.provider !== "google" || account.type !== "oauth") throw new Error("Only Google OAuth accounts are supported");
      // Never overwrite an existing account's owner, even on a concurrent retry.
      const linked = await getDb().authAccount.upsert({
        where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
        create: { userId: account.userId, provider: account.provider, providerAccountId: account.providerAccountId, type: account.type }, update: {},
      });
      if (linked.userId !== account.userId) throw new Error("Provider account is already linked");
      return account;
    },
  };
}
