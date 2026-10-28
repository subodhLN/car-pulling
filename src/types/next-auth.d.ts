import type { DefaultSession } from 'next-auth';

type AppRole = 'USER' | 'ADMIN';

declare module 'next-auth' {
  interface User {
    role?: AppRole;
  }
  interface Session {
    user: { id: string; role: AppRole } & DefaultSession['user'];
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string;
    role?: AppRole;
  }
}
