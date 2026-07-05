import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from '@/lib/i18n/routing';
import { geoRedirectPath } from '@/lib/i18n/geoLocale';

const intlMiddleware = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const country =
    req.headers.get('x-vercel-ip-country') ||
    req.headers.get('cf-ipcountry') ||
    req.headers.get('x-country');
  const target = geoRedirectPath(req.nextUrl.pathname, req.cookies.has('NEXT_LOCALE'), country);

  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    const res = NextResponse.redirect(url);
    res.cookies.set('NEXT_LOCALE', target.split('/')[1], { path: '/', maxAge: 60 * 60 * 24 * 365 });
    return res;
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
