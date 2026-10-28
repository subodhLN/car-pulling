import type { NextAuthConfig } from 'next-auth';

/** Paths that need a signed-in user. */
export function isProtectedPath(pathname: string): boolean {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/') || pathname === '/trips/new';
}

/**
 * Edge-safe half of the Auth.js config (no Prisma, no bcrypt): used by the proxy (middleware)
 * and spread into the full config in src/auth.ts.
 */
export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? 'USER';
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      session.user.role = token.role ?? 'USER';
      return session;
    },
  },
} satisfies NextAuthConfig;
