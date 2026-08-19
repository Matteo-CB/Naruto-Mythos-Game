export interface DiscordServerEntry {
  id: string;
  name: string;
  description: string;
  logo: string;
  inviteUrl: string;
}

export const DISCORD_SERVERS: DiscordServerEntry[] = [
  {
    id: 'naruto-mythos-simulator',
    name: 'Naruto Mythos Simulator',
    description: 'Discord server of the Naruto Mythos TCG simulator : narutomythosgame.com',
    logo: '/images/social/naruto-mythos-simulator.webp',
    inviteUrl: 'https://discord.com/invite/BBXVUsU3hn',
  },
  {
    id: 'naruto-mythos-community',
    name: 'Naruto Mythos TCG Community',
    description: '',
    logo: '/images/social/naruto-mythos-community.webp',
    inviteUrl: 'https://discord.gg/NTq2M5Mb9F',
  },
  {
    id: 'naruto-mythos-polska',
    name: 'Naruto Mythos TCG Polska',
    description: '',
    logo: '/images/social/naruto-mythos-polska-official.webp',
    inviteUrl: 'https://discord.gg/PwRjQyK5K',
  },
  {
    id: 'naruto-mythos-sud-est-france',
    name: 'Naruto Mythos TCG Sud-est France',
    description: '',
    logo: '/images/social/naruto-mythos-sud-est-france.webp',
    inviteUrl: 'https://discord.gg/TDHuy5rxaZ',
  },
  {
    id: 'new-world-server',
    name: 'New World Server',
    description: 'New World Loot',
    logo: '/images/social/new-world-server.webp',
    inviteUrl: 'https://discord.gg/UXQX8McFD3',
  },
];
