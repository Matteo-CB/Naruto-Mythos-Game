import { describe, it, expect } from 'vitest';
import { validateOffer, isFullyExcluded, isTournamentVariant } from '@/lib/trade/inventory-rules';
import { getUserTier, canUserTrade, MIN_TRADE_TIER } from '@/lib/trade/userTier';

describe('trade inventory rules', () => {
  it('flags fully excluded battlepass cards', () => {
    expect(isFullyExcluded('KS-133-MV')).toBe(true);
    expect(isFullyExcluded('KS-133_2-MV')).toBe(true);
    expect(isFullyExcluded('KS-137-MV')).toBe(true);
    expect(isFullyExcluded('KS-108-MV')).toBe(false);
  });

  it('flags tournament-group cards', () => {
    expect(isTournamentVariant('KS-107-MV')).toBe(true);
    expect(isTournamentVariant('KS-108-MV')).toBe(true);
    expect(isTournamentVariant('KS-120-MV')).toBe(true);
    expect(isTournamentVariant('KS-128-MV')).toBe(true);
    expect(isTournamentVariant('KS-137-MV')).toBe(false);
    expect(isTournamentVariant('KS-104-RA')).toBe(false);
  });

  it('accepts a plain non-tournament offer on both sides', () => {
    expect(validateOffer(['KS-104-RA'], ['KS-105-RA', 'KS-106-RA']).valid).toBe(true);
  });

  it('rejects offers over 20 cards', () => {
    const big = Array.from({ length: 21 }, () => 'KS-104-RA');
    const r = validateOffer(big, ['KS-105-RA']);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('too_many');
  });

  it('rejects any fully excluded card in either offer', () => {
    expect(validateOffer(['KS-133-MV'], ['KS-104-RA']).reason).toBe('fully_excluded');
    expect(validateOffer(['KS-104-RA'], ['KS-133_2-MV']).reason).toBe('fully_excluded');
  });

  it('rejects mixing tournament and non-tournament in one offer', () => {
    const r = validateOffer(['KS-108-MV', 'KS-104-RA'], ['KS-120-MV']);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('mixed_tournament');
  });

  it('rejects tournament offered against non-tournament', () => {
    const r = validateOffer(['KS-108-MV'], ['KS-104-RA']);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('asymmetric_tournament');
  });

  it('accepts tournament-for-tournament', () => {
    const r = validateOffer(['KS-108-MV'], ['KS-120-MV', 'KS-128-MV']);
    expect(r.valid).toBe(true);
  });

  it('accepts a one-sided non-tournament gift (empty other side)', () => {
    expect(validateOffer(['KS-104-RA'], []).valid).toBe(true);
  });

  it('accepts a one-sided tournament gift (empty other side)', () => {
    expect(validateOffer(['KS-108-MV'], []).valid).toBe(true);
  });
});

describe('user tier gating', () => {
  it('maps elo to 1-based tier', () => {
    expect(getUserTier(0)).toBe(1);
    expect(getUserTier(449)).toBe(1);
    expect(getUserTier(450)).toBe(2);
    expect(getUserTier(550)).toBe(3);
    expect(getUserTier(700)).toBe(4);
    expect(getUserTier(1000)).toBe(5);
    expect(getUserTier(1200)).toBe(6);
    expect(getUserTier(2500)).toBe(9);
  });

  it('requires tier 5 (elo 1000) to trade', () => {
    expect(MIN_TRADE_TIER).toBe(5);
    expect(canUserTrade(999)).toBe(false);
    expect(canUserTrade(1000)).toBe(true);
    expect(canUserTrade(2000)).toBe(true);
    expect(canUserTrade(500)).toBe(false);
  });
});
