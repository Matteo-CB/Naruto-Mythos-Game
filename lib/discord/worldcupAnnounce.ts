import { englishMonthLabel } from '@/lib/worldcup/season';
import type { PodiumCountry } from '@/lib/worldcup/finalize';

const RANK_LABELS = ['1st', '2nd', '3rd'];

function countryName(code: string): string {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    return dn.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export async function announceSeasonResult(endMonth: string, podium: PodiumCountry[]): Promise<boolean> {
  const url = process.env.WORLDCUP_DISCORD_WEBHOOK;
  if (!url || podium.length === 0) return false;

  const lines = podium.map((c, i) => {
    const players = c.players.map((p) => p.username).join(', ');
    return `${RANK_LABELS[i] ?? `#${c.rank}`}  **${countryName(c.countryCode)}**  —  ${c.score.toFixed(1)} pts\n${players}`;
  });

  const embed = {
    title: `World Cup — ${englishMonthLabel(endMonth)}`,
    description: `The winning nation's players earned the World Champion title and rewards.\n\n${lines.join('\n\n')}`,
    color: 0xc4a35a,
    footer: { text: 'Naruto Mythos TCG' },
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'World Cup', embeds: [embed] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
