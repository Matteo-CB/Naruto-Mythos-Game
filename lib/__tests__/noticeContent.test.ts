import { describe, it, expect } from 'vitest';
import { buildNoticeContent } from '@/lib/moderation/noticeContent';

const fmt = (ts: number) => `DATE(${ts})`;

describe('buildNoticeContent', () => {
  it('warn and warn_severe carry the reason', () => {
    const w = buildNoticeContent('warn', { reason: 'insultes' }, fmt)!;
    expect(w.titleKey).toBe('notify.warnTitle');
    expect(w.params.reason).toBe('insultes');
    expect(w.accent).toBe('gold');
    const ws = buildNoticeContent('warn_severe', { reason: 'récidive' }, fmt)!;
    expect(ws.bodyKey).toBe('notify.warnSevereBody');
    expect(ws.accent).toBe('red');
  });

  it('victim notice never exposes sanction details', () => {
    const v = buildNoticeContent('victim_notice', { reason: 'secret', sanctionType: 'suspension' }, fmt)!;
    expect(v.bodyKey).toBe('notify.victimBody');
    expect(v.params).toEqual({});
  });

  it('sanction notices pick timed or permanent body and format the date', () => {
    const timed = buildNoticeContent('sanction_notice', { sanctionType: 'mute_chat', untilTs: 12345, reason: 'spam' }, fmt)!;
    expect(timed.bodyKey).toBe('notify.sanction.muteTimed');
    expect(timed.params.date).toBe('DATE(12345)');
    const perm = buildNoticeContent('sanction_notice', { sanctionType: 'mute_chat', untilTs: null, reason: 'spam' }, fmt)!;
    expect(perm.bodyKey).toBe('notify.sanction.mutePermanent');
    expect(perm.params.date).toBeUndefined();
    const susp = buildNoticeContent('sanction_notice', { sanctionType: 'suspension', untilTs: null, reason: 'x' }, fmt)!;
    expect(susp.bodyKey).toBe('notify.sanction.suspensionPermanent');
    const spec = buildNoticeContent('sanction_notice', { sanctionType: 'spectate_ban', untilTs: 99, reason: 'x' }, fmt)!;
    expect(spec.bodyKey).toBe('notify.sanction.spectateBan');
  });

  it('unknown sanction types and shadow-mute produce no popup', () => {
    expect(buildNoticeContent('sanction_notice', { sanctionType: 'shadow_mute', untilTs: null }, fmt)).toBe(null);
    expect(buildNoticeContent('sanction_notice', { sanctionType: 'unknown_type' }, fmt)).toBe(null);
  });

  it('name reset uses its dedicated keys', () => {
    const n = buildNoticeContent('name_reset', {}, fmt)!;
    expect(n.titleKey).toBe('notify.nameResetTitle');
    expect(n.accent).toBe('red');
  });
});
