import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig, isProtectedPath } from '@/auth.config';

// Next 16 renamed the `middleware` file convention to `proxy`. Only the edge-safe config is imported here.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (isProtectedPath(pathname) && !req.auth?.user) {
    const url = new URL('/login', req.nextUrl.origin);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/dashboard/:path*', '/trips/new'],
};
