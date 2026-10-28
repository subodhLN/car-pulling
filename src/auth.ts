import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import type { Provider } from 'next-auth/providers';
import { authConfig } from '@/auth.config';
import { db } from '@/lib/db';
import { loginSchema } from '@/modules/auth/schemas';
import { verifyCredentials } from '@/modules/auth/service';

const providers: Provider[] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw) {
      const parsed = loginSchema.safeParse(raw);
      if (!parsed.success) return null;
      return verifyCredentials(parsed.data.email, parsed.data.password);
    },
  }),
];

// Google only appears when credentials are configured, so local dev works without them.
if (process.env.AUTH_GOOGLE_ID) providers.push(Google);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === 'credentials' || !user.email) return true;
      const existing = await db.user.findUnique({ where: { email: user.email }, select: { status: true } });
      return existing?.status !== 'SUSPENDED';
    },
  },
});
