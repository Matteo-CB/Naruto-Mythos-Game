import { describe, it, expect } from 'vitest';
import { countryToSupportedLocale, geoRedirectPath } from '@/lib/i18n/geoLocale';
import { routing } from '@/lib/i18n/routing';

describe('countryToSupportedLocale', () => {
  it('maps a French country to fr when fr is supported', () => {
    expect(countryToSupportedLocale('FR')).toBe('fr');
    expect(countryToSupportedLocale('fr')).toBe('fr');
  });

  it('returns null for a country whose locale is not yet in routing.locales', () => {
    const jaSupported = (routing.locales as readonly string[]).includes('ja');
    expect(countryToSupportedLocale('JP')).toBe(jaSupported ? 'ja' : null);
    const esSupported = (routing.locales as readonly string[]).includes('es');
    expect(countryToSupportedLocale('MX')).toBe(esSupported ? 'es' : null);
  });

  it('returns null for unknown / ambiguous / empty countries', () => {
    expect(countryToSupportedLocale('US')).toBeNull();
    expect(countryToSupportedLocale('CH')).toBeNull();
    expect(countryToSupportedLocale('')).toBeNull();
    expect(countryToSupportedLocale(null)).toBeNull();
    expect(countryToSupportedLocale(undefined)).toBeNull();
  });
});

describe('geoRedirectPath (middleware decision)', () => {
  it('geo-redirects the root path for a supported country, no cookie, no prefix', () => {
    expect(geoRedirectPath('/', false, 'FR')).toBe('/fr');
  });

  it('preserves the sub-path when geo-redirecting', () => {
    expect(geoRedirectPath('/collection', false, 'FR')).toBe('/fr/collection');
  });

  it('does NOT redirect a path that already has a locale prefix (no loop)', () => {
    expect(geoRedirectPath('/fr', false, 'FR')).toBeNull();
    expect(geoRedirectPath('/fr/collection', false, 'FR')).toBeNull();
    expect(geoRedirectPath('/en/collection', false, 'FR')).toBeNull();
  });

  it('does NOT redirect when an explicit NEXT_LOCALE cookie exists', () => {
    expect(geoRedirectPath('/', true, 'FR')).toBeNull();
    expect(geoRedirectPath('/collection', true, 'JP')).toBeNull();
  });

  it('does NOT redirect for an unsupported/ambiguous/empty country (falls through to Accept-Language)', () => {
    expect(geoRedirectPath('/', false, 'US')).toBeNull();
    expect(geoRedirectPath('/', false, 'CH')).toBeNull();
    expect(geoRedirectPath('/', false, null)).toBeNull();
    expect(geoRedirectPath('/collection', false, '')).toBeNull();
  });
});
