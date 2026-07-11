export type NoticeKind = 'warn' | 'warn_severe' | 'sanction_notice' | 'victim_notice' | 'name_reset';

export interface NoticePayload {
  reason?: string;
  sanctionType?: string;
  untilTs?: number | null;
}

export interface NoticeContent {
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
  accent: 'gold' | 'red';
}

const SANCTION_BODY_KEYS: Record<string, { timed: string; permanent: string }> = {
  mute_chat: { timed: 'notify.sanction.muteTimed', permanent: 'notify.sanction.mutePermanent' },
  ranked_ban: { timed: 'notify.sanction.rankedBan', permanent: 'notify.sanction.rankedBan' },
  suspension: { timed: 'notify.sanction.suspensionTimed', permanent: 'notify.sanction.suspensionPermanent' },
  spectate_ban: { timed: 'notify.sanction.spectateBan', permanent: 'notify.sanction.spectateBanPermanent' },
};

export function buildNoticeContent(kind: NoticeKind, payload: NoticePayload, formatDate: (ts: number) => string): NoticeContent | null {
  const reason = payload.reason ?? '';
  switch (kind) {
    case 'warn':
      return { titleKey: 'notify.warnTitle', bodyKey: 'notify.warnBody', params: { reason }, accent: 'gold' };
    case 'warn_severe':
      return { titleKey: 'notify.warnSevereTitle', bodyKey: 'notify.warnSevereBody', params: { reason }, accent: 'red' };
    case 'victim_notice':
      return { titleKey: 'notify.victimTitle', bodyKey: 'notify.victimBody', params: {}, accent: 'gold' };
    case 'name_reset':
      return { titleKey: 'notify.nameResetTitle', bodyKey: 'notify.nameResetBody', params: {}, accent: 'red' };
    case 'sanction_notice': {
      const type = payload.sanctionType ?? '';
      const keys = SANCTION_BODY_KEYS[type];
      if (!keys) return null;
      const isPermanent = payload.untilTs === null || payload.untilTs === undefined;
      const bodyKey = isPermanent ? keys.permanent : keys.timed;
      const params: Record<string, string> = { reason };
      if (!isPermanent && payload.untilTs) params.date = formatDate(payload.untilTs);
      return { titleKey: 'notify.sanctionTitle', bodyKey, params, accent: 'red' };
    }
    default:
      return null;
  }
}
