#!/usr/bin/env node
/**
 * brute16-legendary.js  —  LEGENDARY CARD HUNTER
 *
 * Focused ONLY on finding Legendary card images.
 * We know two confirmed patterns:
 *   - Legendary_Naruto_-1920w.webp
 *   - Legendary_Kabuto_-1920w.webp
 *
 * This script tries MANY more creative combinations:
 *   - Legendary_{Name}_-1920w.webp  (proven, with trailing _)
 *   - Legendary_{Name}-1920w.webp   (without trailing _)
 *   - Legendary_{Name}_{Title}_-1920w.webp
 *   - Legendary_{FullName}_-1920w.webp
 *   - Various prefix casing: Legendary, LEGENDARY, legendary
 *   - French names too
 *   - With/without number prefix
 *   - Different separator styles (_, -, space-to-underscore)
 *
 * Usage:  node scripts/brute16-legendary.js
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// --- CONFIG ---
const CONCURRENCY   = 200;
const TIMEOUT_MS    = 4000;
const MIN_FILE_SIZE = 4000;
const OUT_DIR       = path.join(__dirname, '..', 'newvisual');
const REPORT_FILE   = path.join(OUT_DIR, 'brute16_legendary_report.txt');

const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 400,
  maxFreeSockets: 100,
  timeout: TIMEOUT_MS,
});

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
};

// --- ALL CHARACTERS WITH MANY NAME/TITLE VARIANTS ---
// Each entry: { names: [...], titles: [...] }
// Names include first name, full name, French variants, CDN-style variants
// Titles include card subtitles, jutsu names, descriptors
const CHARACTERS = [
  {
    names: ['Naruto', 'Naruto_Uzumaki', 'NarutoUzumaki', 'Uzumaki_Naruto'],
    titles: ['Rasengan', 'Genin', 'Sage', 'Nine_Tails', 'Kyubi', 'Jinchuriki',
             'Shadow_Clone', 'Kage_Bunshin', 'Hokage', 'Uzumaki', 'Substitution'],
  },
  {
    names: ['Sasuke', 'Sasuke_Uchiha', 'Sasuke_Uchiwa', 'SasukeUchiha', 'SasukeUchiwa', 'Uchiha_Sasuke', 'Uchiwa_Sasuke'],
    titles: ['Sharingan', 'Chidori', 'Last', 'Curse_Mark', 'Heaven_Curse_Mark',
             'Avenger', 'Genin', 'Lightning'],
  },
  {
    names: ['Sakura', 'Sakura_Haruno', 'SakuraHaruno', 'Haruno_Sakura'],
    titles: ['Medical', 'Genin', 'Recovery_Team', 'Chakra_Prowess', 'Inner_Sakura',
             'Healing', 'Cherry_Blossom'],
  },
  {
    names: ['Kakashi', 'Kakashi_Hatake', 'KakashiHatake', 'Hatake_Kakashi'],
    titles: ['Sharingan', 'Lightning_Blade', 'Copy_Ninja', 'Teacher', 'Sensei',
             'Raikiri', 'Chidori'],
  },
  {
    names: ['Tsunade'],
    titles: ['Hokage', 'Reserve_Seal', 'Sannin', 'Master', 'Medical', 'Healing',
             'Slug_Princess', 'Fifth_Hokage'],
  },
  {
    names: ['Jiraiya', 'Jiraya'],
    titles: ['Toad_Sage', 'Sannin', 'Summoning_Jutsu', 'Toad_Mouth', 'Hermit',
             'Sage_Mode', 'Dark_Swamp'],
  },
  {
    names: ['Orochimaru'],
    titles: ['Sannin', 'Undercover', 'Transference_Ritual', 'Snake', 'Serpent',
             'Substitution', 'Curse_Mark'],
  },
  {
    names: ['Itachi', 'Itachi_Uchiha', 'Itachi_Uchiwa', 'ItachiUchiha', 'ItachiUchiwa'],
    titles: ['Akatsuki', 'Amaterasu', 'Tsukuyomi', 'Sharingan', 'Mangekyo',
             'Hunting', 'Susanoo', 'Genjutsu'],
  },
  {
    names: ['Kisame', 'Kisame_Hoshigaki', 'KisameHoshigaki'],
    titles: ['Akatsuki', 'Samehada', 'Rogue_Ninja', 'Chakra_absorb', 'Shark',
             'Water_Prison'],
  },
  {
    names: ['Gaara'],
    titles: ['Sand_Coffin', 'Sand_Shield', 'Jinchuriki', 'Kazekage', 'Sand',
             'Shukaku', 'One_Tail'],
  },
  {
    names: ['Hinata', 'Hinata_Hyuga', 'HinataHyuga', 'Hyuga_Hinata'],
    titles: ['Byakugan', 'Gentle_Fist', 'Genin'],
  },
  {
    names: ['Shikamaru', 'Shikamaru_Nara', 'ShikamaruNara', 'Nara_Shikamaru'],
    titles: ['Shadow_Strangle', 'Shadow_Possession', 'Genin', 'Strategist', 'Shadow'],
  },
  {
    names: ['RockLee', 'Rock_Lee', 'Lee'],
    titles: ['Loopy_Fist', 'Primary_Lotus', 'Training', 'Taijutsu', 'Gates',
             'Hidden_Lotus', 'Drunken_Fist'],
  },
  {
    names: ['Neji', 'Neji_Hyuga', 'NejiHyuga', 'Hyuga_Neji'],
    titles: ['Byakugan', 'Gentle_Fist', 'Palm_Rotation', 'Sixty-Four_Palms',
             'Sixty_Four_Palms', '64_Palms'],
  },
  {
    names: ['Kiba', 'Kiba_Inuzuka', 'KibaInuzuka'],
    titles: ['Genin', 'All_Four', 'Fang_Over_Fang', 'Man_Beast'],
  },
  {
    names: ['Shino', 'Shino_Aburame', 'ShinoAburame'],
    titles: ['Parasitic_Insects', 'Wall_Insects', 'Bugs'],
  },
  {
    names: ['Temari'],
    titles: ['Kunoichi', 'Wind_Scythe', 'Sandstorm', 'Fan'],
  },
  {
    names: ['Kankuro', 'Kankurou'],
    titles: ['Puppet_Master', 'Chakra_Threads', 'Iron_Maiden', 'Crow'],
  },
  {
    names: ['Zabuza', 'Zabuza_Momochi'],
    titles: ['Kubikiribocho', 'Demon', 'Hidden_Mist', 'Silent_Killing',
             'Rogue_Ninja', 'Executioner_Blade'],
  },
  {
    names: ['Haku'],
    titles: ['Crystal_Ice_Mirrors', 'Orphan', 'Ice', 'Mirrors'],
  },
  {
    names: ['Kabuto', 'Kabuto_Yakushi'],
    titles: ['Infiltrator', 'Yin_Healing', 'Spy', 'Medical', 'Nirvana_Temple'],
  },
  {
    names: ['Kimimaro'],
    titles: ['Camelia_Dance', 'Shikotsumyaku', 'Bone', 'Dance'],
  },
  {
    names: ['Hiruzen', 'Hiruzen_Sarutobi', 'Sarutobi'],
    titles: ['Hokage', 'Professor', 'Third_Hokage', 'God_of_Shinobi'],
  },
  {
    names: ['Asuma', 'Asuma_Sarutobi'],
    titles: ['Teacher', 'Trench_Knives', 'Sensei'],
  },
  {
    names: ['Kurenai', 'Yuhi_Kurenai'],
    titles: ['Teacher', 'Tree_Bind', 'Genjutsu', 'Sensei'],
  },
  {
    names: ['MightGuy', 'Might_Guy', 'Gai', 'Gai_Maito', 'Guy'],
    titles: ['Teacher', 'Ferocious_Fist', 'Youth', 'Taijutsu', 'Sensei'],
  },
  {
    names: ['Tenten', 'Ten_Ten'],
    titles: ['Genin', 'Weapon_Specialist', 'Weapons'],
  },
  {
    names: ['Choji', 'Choji_Akimichi', 'Chouji'],
    titles: ['Expansion', 'Human_Boulder', 'Butterfly'],
  },
  {
    names: ['Ino', 'Ino_Yamanaka'],
    titles: ['Genin', 'Mind_Transfer'],
  },
  {
    names: ['Anko', 'Anko_Mitarashi'],
    titles: ['Proctor', 'Snake', 'Examiner'],
  },
  {
    names: ['Tayuya'],
    titles: ['Bearer', 'Demon_Flute', 'Flute', 'Sound_Four'],
  },
  {
    names: ['Sakon', 'Sakon_Ukon'],
    titles: ['Bearer', 'Black_Seal', 'Sound_Four'],
  },
  {
    names: ['Jirobo', 'Jiroubou'],
    titles: ['Bearer', 'Earth_Dome', 'Sound_Four'],
  },
  {
    names: ['Kidomaru', 'Kidoumaru'],
    titles: ['Bearer', 'Spider_Web', 'Sound_Four'],
  },
  {
    names: ['Dosu', 'Dosu_Kinuta'],
    titles: ['Superhuman', 'Echo_Speaker'],
  },
  {
    names: ['Zaku', 'Zaku_Abumi'],
    titles: ['Shinobi', 'Slicing'],
  },
  {
    names: ['Kin', 'Kin_Tsuchi', 'KinTsuchi'],
    titles: ['Kunoichi', 'Bell_Sound'],
  },
  {
    names: ['Akamaru'],
    titles: ['Hound', 'Man_Beast_Clone', 'Two-Headed_Wolf'],
  },
  {
    names: ['Pakkun'],
    titles: ['Hound', 'Ninja_Dog'],
  },
  {
    names: ['Gamabunta', 'Gama_Bunta'],
    titles: ['Chief_Toad', 'Toad'],
  },
  {
    names: ['Kyubi', 'Kyuubi', 'Kurama', 'Nine_Tails', 'Nine-Tails'],
    titles: ['Demon_Fox', 'Fox', 'Bijuu', 'Tailed_Beast'],
  },
  {
    names: ['One-Tail', 'One_Tail', 'Shukaku', 'Ichibi'],
    titles: ['Bijuu', 'Tailed_Beast', 'Sand', 'Tanuki'],
  },
  {
    names: ['Ebisu'],
    titles: ['Trainer', 'Elite'],
  },
  {
    names: ['Iruka', 'Iruka_Umino'],
    titles: ['Instructor', 'Teacher', 'Sensei'],
  },
  {
    names: ['Hayate', 'Hayate_Gekko'],
    titles: ['Shinobi', 'Proctor', 'Moonlight'],
  },
  {
    names: ['Genma', 'Genma_Shiranui'],
    titles: ['Elite_Guard', 'Proctor'],
  },
  {
    names: ['Baki'],
    titles: ['Council_Agent', 'Wind_Blade'],
  },
  {
    names: ['Yashamaru'],
    titles: ['Caretaker'],
  },
  {
    names: ['Shizune'],
    titles: ['Assistant', 'Medical'],
  },
  {
    names: ['Ukon'],
    titles: ['Molecular_Possession'],
  },
  {
    names: ['Katsuyu'],
    titles: ['Giant_Slug', 'Slug'],
  },
  {
    names: ['TonTon', 'Ton_Ton'],
    titles: ['Pig'],
  },
  {
    names: ['Ninja_Hound', 'Ninja_Hounds'],
    titles: ['Pack'],
  },
  {
    names: ['Gamahiro'],
    titles: ['Armed_Toad'],
  },
  {
    names: ['Gamakichi'],
    titles: ['Eldest_Son'],
  },
  {
    names: ['Gamatatsu'],
    titles: ['Youngest_Son'],
  },
  {
    names: ['Manda'],
    titles: ['Snake', 'Serpent', 'Summoning'],
  },
  {
    names: ['Rashomon', 'Rempart'],
    titles: ['Gate', 'Summoning'],
  },
  {
    names: ['Doki'],
    titles: ['Ogre', 'Summoning'],
  },
];

// Prefix variations
const PREFIXES = ['Legendary', 'LEGENDARY', 'legendary'];

// --- URL GENERATION ---
function generateUrls() {
  const urls = new Set();
  const items = [];

  function add(url, char, detail) {
    if (!urls.has(url)) {
      urls.add(url);
      items.push({ url, char, detail });
    }
  }

  for (const char of CHARACTERS) {
    for (const prefix of PREFIXES) {
      for (const name of char.names) {
        // Pattern A: Prefix_Name_-1920w.webp (proven: trailing underscore)
        add(`${BASE}${prefix}_${name}_-1920w.webp`, name, `${prefix}_${name}_`);

        // Pattern B: Prefix_Name-1920w.webp (no trailing underscore)
        add(`${BASE}${prefix}_${name}-1920w.webp`, name, `${prefix}_${name}`);

        // Pattern C: With titles
        for (const title of char.titles) {
          // Prefix_Name_Title_-1920w.webp
          add(`${BASE}${prefix}_${name}_${title}_-1920w.webp`, name, `${prefix}_${name}_${title}_`);
          add(`${BASE}${prefix}_${name}_${title}-1920w.webp`, name, `${prefix}_${name}_${title}`);
          // Prefix_Title_Name_-1920w.webp (reversed)
          add(`${BASE}${prefix}_${title}_${name}_-1920w.webp`, name, `${prefix}_${title}_${name}_`);
          add(`${BASE}${prefix}_${title}_${name}-1920w.webp`, name, `${prefix}_${title}_${name}`);
        }

        // Pattern D: With GOLD prefix (like Secret cards use GOLD)
        add(`${BASE}${prefix}_GOLD_${name}_-1920w.webp`, name, `${prefix}_GOLD_${name}_`);
        add(`${BASE}${prefix}_GOLD_${name}-1920w.webp`, name, `${prefix}_GOLD_${name}`);

        // Pattern E: With number
        for (const num of [1, 130, 155, 156, 157, 158, 159, 160]) {
          add(`${BASE}${prefix}_${num}_${name}_-1920w.webp`, name, `${prefix}_${num}_${name}_`);
          add(`${BASE}${prefix}_${num}_${name}-1920w.webp`, name, `${prefix}_${num}_${name}`);
          add(`${BASE}${num}_${prefix}_${name}_-1920w.webp`, name, `${num}_${prefix}_${name}_`);
          add(`${BASE}${num}_${prefix}_${name}-1920w.webp`, name, `${num}_${prefix}_${name}`);
        }
      }
    }

    // Pattern F: Without any prefix, just GOLD_Name (like Secret V uses SecretV_GOLD)
    for (const name of char.names) {
      add(`${BASE}GOLD_${name}_-1920w.webp`, name, `GOLD_${name}_`);
      add(`${BASE}GOLD_${name}-1920w.webp`, name, `GOLD_${name}`);
      add(`${BASE}Gold_${name}_-1920w.webp`, name, `Gold_${name}_`);
      add(`${BASE}Gold_${name}-1920w.webp`, name, `Gold_${name}`);
    }
  }

  return items;
}

// --- HTTP ENGINE ---
function headCheck(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', agent, timeout: TIMEOUT_MS }, (res) => {
      const len = parseInt(res.headers['content-length'] || '0', 10);
      res.resume();
      resolve(res.statusCode === 200 && len >= MIN_FILE_SIZE ? len : 0);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end();
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { agent, timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

// --- MAIN ---
async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n${C.bold}${C.cyan}  BRUTE16 - LEGENDARY HUNTER${C.reset}`);
  console.log(`${C.dim}  Find legendary card images with creative combos${C.reset}\n`);

  const allUrls = generateUrls();
  const total = allUrls.length;
  console.log(`  URLs to test: ${C.bold}${total.toLocaleString()}${C.reset}`);
  console.log(`  Concurrency:  ${C.bold}${CONCURRENCY}${C.reset}`);
  console.log('');

  const found = [];
  let tested = 0;
  let errors = 0;
  const startTime = Date.now();

  function showProgress() {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = elapsed > 0 ? (tested / elapsed).toFixed(0) : 0;
    const pct = total > 0 ? ((tested / total) * 100).toFixed(1) : '0.0';
    process.stdout.write(
      `\r  ${C.dim}Progress:${C.reset} ${tested.toLocaleString()}/${total.toLocaleString()} (${pct}%) ` +
      `${C.dim}|${C.reset} ${rate}/s ` +
      `${C.dim}|${C.reset} ${C.green}Found: ${found.length}${C.reset} ` +
      `${C.dim}|${C.reset} Errors: ${errors}   `
    );
  }

  const progressInterval = setInterval(showProgress, 250);

  let idx = 0;
  async function worker() {
    while (idx < allUrls.length) {
      const item = allUrls[idx++];
      if (!item) break;

      try {
        const size = await headCheck(item.url);
        if (size > 0) {
          const filename = item.url.split('/').pop();
          const sizeKB = (size / 1024).toFixed(1);
          process.stdout.write(
            `\n  ${C.bold}${C.green}FOUND${C.reset} ${item.char}: ${filename} (${sizeKB} KB)\n`
          );
          const destFile = path.join(OUT_DIR, filename);
          try {
            await downloadFile(item.url, destFile);
            process.stdout.write(`  ${C.dim}  -> Downloaded to ${destFile}${C.reset}\n`);
          } catch (dlErr) {
            process.stdout.write(`  ${C.yellow}  -> Download failed: ${dlErr.message}${C.reset}\n`);
          }
          found.push({ url: item.url, char: item.char, detail: item.detail, size, filename });
        }
      } catch {
        errors++;
      }
      tested++;
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  clearInterval(progressInterval);
  showProgress();
  console.log('\n');

  // Report
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const reportLines = [
    '='.repeat(70),
    'BRUTE16 - LEGENDARY HUNTER REPORT',
    `Date: ${new Date().toISOString()}`,
    '='.repeat(70),
    '',
    `Total URLs tested: ${total}`,
    `Time elapsed: ${elapsed}s`,
    `Errors: ${errors}`,
    `Images found: ${found.length}`,
    '',
  ];

  if (found.length > 0) {
    reportLines.push('FOUND IMAGES:');
    reportLines.push('-'.repeat(70));
    for (const f of found) {
      reportLines.push(`  ${f.char}: ${f.filename} (${(f.size / 1024).toFixed(1)} KB)`);
      reportLines.push(`    URL: ${f.url}`);
    }
  } else {
    reportLines.push('No new legendary images found.');
  }

  reportLines.push('', '='.repeat(70));
  fs.writeFileSync(REPORT_FILE, reportLines.join('\n'), 'utf8');

  console.log(`${C.bold}  RESULTS${C.reset}`);
  console.log(`  Tested:  ${total.toLocaleString()} URLs in ${elapsed}s`);
  console.log(`  Found:   ${C.bold}${C.green}${found.length}${C.reset} images`);
  console.log(`  Report:  ${REPORT_FILE}\n`);

  if (found.length > 0) {
    console.log(`${C.bold}${C.green}  FOUND:${C.reset}`);
    for (const f of found) {
      console.log(`    ${C.yellow}${f.filename}${C.reset} (${f.char})`);
    }
    console.log('');
  }

  agent.destroy();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
