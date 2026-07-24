import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { DISCORD_SERVERS } from '../data/discordServers';

describe('social hub Discord servers data', () => {
  it('has at least one server', () => {
    expect(DISCORD_SERVERS.length).toBeGreaterThan(0);
  });

  it('every server has a non-empty id and name', () => {
    for (const s of DISCORD_SERVERS) {
      expect(s.id, `id for ${s.name}`).toBeTruthy();
      expect(s.name.trim(), `name for ${s.id}`).toBeTruthy();
    }
  });

  it('description is always a string (may be empty)', () => {
    for (const s of DISCORD_SERVERS) {
      expect(typeof s.description, `description type for ${s.id}`).toBe('string');
    }
  });

  it('every logo path is well-formed and the file exists on disk', () => {
    for (const s of DISCORD_SERVERS) {
      expect(s.logo, `logo path for ${s.id}`).toMatch(/^\/images\/social\/[\w-]+\.(webp|png|jpg|jpeg)$/);
      const abs = join(process.cwd(), 'public', s.logo);
      expect(existsSync(abs), `logo file missing for ${s.id}: ${abs}`).toBe(true);
    }
  });

  it('every invite URL is a valid Discord invite', () => {
    for (const s of DISCORD_SERVERS) {
      expect(s.inviteUrl, `invite for ${s.id}`).toMatch(/^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+$/);
    }
  });

  it('server ids are unique', () => {
    const ids = DISCORD_SERVERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
