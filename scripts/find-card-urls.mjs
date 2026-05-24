#!/usr/bin/env node


import https from 'https';
import http from 'http';
import { mkdir, writeFile, access } from 'fs/promises';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

const OUTPUT_DIR = path.resolve(process.cwd(), 'card-finds');
const CONCURRENCY = 16;
const REQUEST_TIMEOUT_MS = 8000;
const POLITE_PAUSE_MS = 25;


const BASE_URLS = [
  'https://irp.cdn-website.com/99e556bf/dms3rep/multi/',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/',
];

const EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg'];
const SIZE_SUFFIXES = ['', '-1920w', '-1280w', '-960w', '-640w', '-480w'];


const SECRET_TARGETS = {
  Itachi: {
    number: 140,
    names: ['Itachi', 'Itachi_Uchiha', 'Itachi_Uchiwa', 'ItachiUchiha'],
    baseTitle: 'Tsukuyomi',
    extraTitles: ['Tsukuyomi', 'Mangekyo', 'Mangekyo_Sharingan', 'Sharingan', 'Amaterasu', 'Susanoo', 'Akatsuki', 'Crow', 'Genjutsu', 'Eternal_Tsukuyomi'],
  },
  Jiraiya: {
    number: 132,
    names: ['Jiraiya', 'Jiraya'],
    baseTitle: 'Toad Mouth Trap',
    extraTitles: ['Toad_Mouth_Trap', 'Mouth_Toad_Trap', 'Trap_Toad', 'Toad_Trap', 'Sage_Mode', 'Toad_Sage', 'Rasengan', 'Sannin', 'Boss_Summoning', 'Mount_Myoboku'],
  },
  Gaara: {
    number: 139,
    names: ['Gaara', 'GaaraOfTheSand', 'Gaara_of_the_Sand'],
    baseTitle: 'Sand Burial',
    extraTitles: ['Sand_Burial', 'Burial_Sand', 'Desert_Burial', 'Sand_Coffin', 'Sand_Tomb', 'Sabaku_Kyu', 'Sand_Shield', 'Ichibi', 'Shukaku'],
  },
  Orochimaru: {
    number: 138,
    names: ['Orochimaru'],
    baseTitle: 'Summoning: Impure World Reincarnation',
    extraTitles: ['Impure_World_Reincarnation', 'Edo_Tensei', 'Impure_Reincarnation', 'Reincarnation', 'Summoning_Impure_World_Reincarnation', 'Summoning_Edo_Tensei', 'Snake_Sannin', 'Sannin', 'Curse_Mark', 'Kusanagi'],
  },
  Kyubi: {
    number: 134,
    names: ['Kyubi', 'Kyuubi', 'Kyuubi_no_Yoko', 'Nine_Tails', 'NineTails', 'Nine_Tailed_Fox', 'NineTailedFox', 'NineTailed', 'Kurama'],
    baseTitle: 'Destruction',
    extraTitles: ['Destruction', 'Bijuu', 'Bijuudama', 'Tailed_Beast_Bomb', 'Fox', 'Nine_Tails', 'Fury', 'Rage', 'Chakra_Rage'],
  },
  Sakura: {
    number: 135,
    names: ['Sakura', 'Sakura_Haruno', 'SakuraHaruno'],
    baseTitle: 'The Leaf Medical Corps',
    extraTitles: ['The_Leaf_Medical_Corps', 'Leaf_Medical_Corps', 'Medical_Corps', 'Medical_Ninja', 'Chakra_Control', 'Cherry_Blossom', 'Inner_Sakura', 'Mitotic_Regeneration'],
  },
};

const LEGENDARY_TARGETS = {
  RockLee: {
    names: ['Rock_Lee', 'RockLee', 'Lee', 'Rocklee', 'Rock_Lee_Drunken_Fist', 'Lee_Drunken_Fist'],
    extraTitles: ['Drunken_Fist', 'Lotus', 'Reverse_Lotus', 'Eight_Gates', 'Strong_Fist', 'Front_Lotus', 'Initial_Lotus'],
  },
};



function titleVariants(title, extras = []) {
  const seen = new Set();
  const out = [];
  const push = (v) => {
    const clean = v.replace(/\s+/g, ' ').trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  const stripPunct = (s) => s.replace(/[:.,!?'"]/g, '').replace(/\s+/g, ' ').trim();
  const stripArticles = (s) => s.replace(/\b(the|of|a|an|and|to|in|on|at|by|with)\b/gi, '').replace(/\s+/g, ' ').trim();

  const base = stripPunct(title);
  push(base);
  push(stripArticles(base));

  const words = base.split(' ').filter(Boolean);
  if (words.length <= 4) {

    const perms = permutations(words);
    for (const p of perms) push(p.join(' '));
  } else {

    push(words.slice(-3).join(' '));
    push(words.slice(0, 3).join(' '));
    push(words.slice(-2).join(' '));
    push(stripArticles(words.join(' ')));
  }


  for (const e of extras) push(e.replace(/_/g, ' '));


  return out.map((s) => s.replace(/ /g, '_'));
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}


function generateSecretUrls(targetName, target) {
  const urls = new Set();
  const titles = titleVariants(target.baseTitle, target.extraTitles);


  const titleOptions = [...titles, ''];
  const typeOptions = ['Secret', 'SecretV'];

  for (const baseUrl of BASE_URLS) {
    for (const ext of EXTENSIONS) {
      for (const sizeSfx of SIZE_SUFFIXES) {
        for (const num of [target.number]) {
          for (const name of target.names) {
            for (const type of typeOptions) {
              for (const title of titleOptions) {
                const filename = title
                  ? `${num}_${type}_GOLD_${name}_${title}${sizeSfx}${ext}`
                  : `${num}_${type}_GOLD_${name}${sizeSfx}${ext}`;
                urls.add(baseUrl + filename);

                if (title) {
                  urls.add(baseUrl + `${num}_${type}_${name}_${title}${sizeSfx}${ext}`);
                }
              }
            }
          }
        }
      }
    }
  }
  return [...urls];
}

function generateLegendaryUrls(targetName, target) {
  const urls = new Set();
  const titleVariantsList = ['', ...target.extraTitles];

  for (const baseUrl of BASE_URLS) {
    for (const ext of EXTENSIONS) {
      for (const sizeSfx of SIZE_SUFFIXES) {
        for (const name of target.names) {
          for (const title of titleVariantsList) {

            urls.add(baseUrl + `Legendary_${name}_${sizeSfx}${ext}`.replace('__', '_'));
            urls.add(baseUrl + `Legendary_${name}${sizeSfx}${ext}`);
            if (title) {
              urls.add(baseUrl + `Legendary_${name}_${title}${sizeSfx}${ext}`);
              urls.add(baseUrl + `Legendary_${name}_${title}_${sizeSfx}${ext}`.replace('__', '_'));
            }

            urls.add(baseUrl + `${name}_Legendary${sizeSfx}${ext}`);
            if (title) urls.add(baseUrl + `${name}_Legendary_${title}${sizeSfx}${ext}`);
          }
        }
      }
    }
  }
  return [...urls];
}


function head(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    let settled = false;
    const finish = (status) => { if (!settled) { settled = true; resolve({ url, status }); } };
    const req = lib.request(url, { method: 'HEAD', timeout: REQUEST_TIMEOUT_MS, headers: { 'User-Agent': 'Mozilla/5.0 NarutoMythosFinder/1.0' } }, (res) => {
      finish(res.statusCode || 0);
    });
    req.on('error', () => finish(0));
    req.on('timeout', () => { try { req.destroy(); } catch { /* ignore */ } finish(0); });
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.request(url, { method: 'GET', timeout: REQUEST_TIMEOUT_MS, headers: { 'User-Agent': 'Mozilla/5.0 NarutoMythosFinder/1.0' } }, (res) => {
      if ((res.statusCode || 0) !== 200) {
        res.resume();
        return resolve(null);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { try { req.destroy(); } catch { /* ignore */ } reject(new Error('timeout')); });
    req.end();
  });
}

async function runChunked(urls, onFound) {
  const found = new Map();
  let checked = 0;
  const total = urls.length;

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const chunk = urls.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(head));
    for (const r of results) {
      checked++;
      if (r.status === 200) {
        if (!found.has(r.url)) {
          found.set(r.url, true);
          console.log(`\n  FOUND: ${r.url}`);
          if (onFound) await onFound(r.url).catch((err) => console.error(`  download failed: ${err.message}`));
        }
      }
    }
    process.stdout.write(`\r  checked ${checked}/${total} (found: ${found.size})  `);
    if (POLITE_PAUSE_MS > 0) await delay(POLITE_PAUSE_MS);
  }
  process.stdout.write('\n');
  return [...found.keys()];
}


async function downloadTo(folder, url) {
  const filename = url.split('/').pop().split('?')[0];
  const dest = path.join(folder, filename);
  try { await access(dest); console.log(`  already saved: ${filename}`); return; } catch { /* not exists */ }
  const buf = await get(url);
  if (!buf) { console.log(`  could not download: ${url}`); return; }
  await writeFile(dest, buf);
  console.log(`  saved: ${dest} (${Math.round(buf.length / 1024)} KB)`);
}


async function processTarget(targetName, generator, target) {
  console.log(`\n=== ${targetName} ===`);
  const urls = generator(targetName, target);
  console.log(`  ${urls.length} URL combinations to test`);
  const folder = path.join(OUTPUT_DIR, targetName);
  await mkdir(folder, { recursive: true });
  const onFound = (url) => downloadTo(folder, url);
  const found = await runChunked(urls, onFound);
  if (found.length === 0) console.log(`  (no images found for ${targetName})`);
  else console.log(`  ${found.length} image(s) downloaded to ${path.relative(process.cwd(), folder)}`);
  return found;
}


function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node scripts/find-card-urls.mjs [target...] [--all]

Targets:
  Secret variants: Itachi, Jiraiya, Gaara, Orochimaru, Kyubi, Sakura
  Legendary:       RockLee

Examples:
  node scripts/find-card-urls.mjs Kyubi
  node scripts/find-card-urls.mjs Itachi Jiraiya Gaara
  node scripts/find-card-urls.mjs --all

Found images are saved to ./card-finds/<TargetName>/`);
    process.exit(0);
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const wantAll = args.includes('--all');
  const targets = wantAll
    ? [...Object.keys(SECRET_TARGETS), ...Object.keys(LEGENDARY_TARGETS)]
    : args.filter((a) => !a.startsWith('-'));

  await mkdir(OUTPUT_DIR, { recursive: true });

  const totalFound = [];
  for (const t of targets) {
    if (SECRET_TARGETS[t]) {
      const found = await processTarget(t, generateSecretUrls, SECRET_TARGETS[t]);
      totalFound.push(...found);
    } else if (LEGENDARY_TARGETS[t]) {
      const found = await processTarget(t, generateLegendaryUrls, LEGENDARY_TARGETS[t]);
      totalFound.push(...found);
    } else {
      console.log(`Unknown target "${t}". Use one of: ${[...Object.keys(SECRET_TARGETS), ...Object.keys(LEGENDARY_TARGETS)].join(', ')}`);
    }
  }

  console.log(`\n=== summary ===\n  ${totalFound.length} total image(s) found and downloaded to ./card-finds/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
