import { routing } from './routing';

const COUNTRY_TO_LOCALE: Record<string, string> = {
  FR: 'fr',
  JP: 'ja',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', PE: 'es', VE: 'es', CL: 'es', EC: 'es',
  GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es',
  CR: 'es', PA: 'es', UY: 'es', PR: 'es',
};

export function countryToSupportedLocale(country: string | null | undefined): string | null {
  if (!country) return null;
  const loc = COUNTRY_TO_LOCALE[country.toUpperCase()];
  return loc && (routing.locales as readonly string[]).includes(loc) ? loc : null;
}

function hasLocalePrefix(pathname: string): boolean {
  return routing.locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
}

export function geoRedirectPath(
  pathname: string,
  hasCookie: boolean,
  country: string | null | undefined,
): string | null {
  if (hasCookie || hasLocalePrefix(pathname)) return null;
  const geo = countryToSupportedLocale(country);
  if (!geo) return null;
  return `/${geo}${pathname === '/' ? '' : pathname}`;
}
