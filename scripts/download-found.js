/**
 * Download found images for missing cards + write full URL report
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';
const OUTPUT_DIR = path.join(__dirname, '..', 'newvisual');

// ─── ALL gallery URLs (from scraping the official site) ───
const ALL_GALLERY_URLS = [
  '01_C_Hiruzen_Professor', '02_UC_Hiruzen_Hokage', '03_C_Tsunade_Master',
  '04_UC_Tsunade_Reserve-Seal', '05_C_Shizune_Assistant', '06_UC_Shizune_Needle_Shot',
  '07_C_Jiraiya_Toad_Sage', '08_UC_Jiraiya_Dark_Swamp', '09_C_Naruto_Genin',
  '10_C_Naruto_Substitution', '11_C_Sakura_Genin', '12_UC_Sakura_Chakra_Prowess',
  '13_C_Sasuke_Last', '14_UC_Sasuke_Sharingan', '15_C_Kakashi_Teacher',
  '16_UC_Kakashi_Sharingan', '17_C_Choji_Expansion', '18_UC_Choji_Human_Boulder',
  '19_C_Ino_Genin', '20_UC_Ino_Mind_Transfer', '21_C_Shikamaru_Genin',
  '22_UC_Shikamaru_Shadow_Possession', '23_C_Asuma_Teacher', '24_UC_Asuma_Trench_Knives',
  '25_C_Kiba_Genin', '26_UC_Kiba_All_Four', '27_C_Akamaru_Hound',
  '28_UC_Akamaru_Man_Beast_Clone', '29_UC_Akamaru_Two-Headed_Wolf',
  '30_C_Hinata_Gentle_fist', '31_UC_Hinata_Byakugan', '32_C_Shino_Parasitic_Insects',
  // 33 UC Shino not on gallery
  '34_C_Kurenai_Teacher', '35_UC_Kurenai_Tree_Bind',
  '36_C_Neji_Gentle_fist', '37_UC_Neji_Palm_Rotation',
  '38_C_RockLee_Training', '39_UC_RockLee_Primary_Lotus',
  '40_C_Tenten_Genin', '41_UC_Tenten_Weapon_Specialist',
  '42_C_MightGuy_Teacher', '43_UC_MightGuy_Ferocious_Fist',
  '44_C_Anko_Proctor',
  // 45 UC Anko NOT on gallery
  '46_C_Ebisu_Trainer', '47_C_Iruka_Instructor',
  '48_C_Hayate_Shinobi', '49_C_Genma_Elite_Guard',
  '50_C_Orochimaru_Undercover', '51_UC_Orochimaru_Substitution',
  '52_C_Kabuto-Infiltrator', '53_UC_Kabuto_Yin_Healing', '54_UC_Kabuto_Nirvana_Temple',
  '55_C_Kimimaro_Camelia_Dance', '56_UC_Kimimaro_Shikotsumyaku',
  '57_C_Jiroubou_Bearer', '58_UC_Jirobo_Earth_Dome',
  '59_C_Kidomaru_Bearer', '60_UC_Kidomaru_Spider_Web',
  '61_C_Sakon_Bearer', '62_UC_Sakon_Black_Seal',
  '63_UC_Ukon_Molecular_Possession', '64_C_Tayuya_Bearer', '65_UC_Tayuya_Demon_Flute',
  '66_UC_Rage_Ogres_Summoning', '67_UC_Rashomon_Summoning',
  '68_C_Dosu_Superhuman', '69_UC_Dosu_Echo_Speaker',
  '70_C_Zaku_Shinobi', '71_UC_Zaku_Slicing',
  '72_C_Kin_Kunoichi', '73_UC_KinTsuchi_Bell_Sound',
  '74_C_Gaara_Jinchuriki', '75_C_Gaara_Sand_Shield',
  '76_UC_One-Tail_Partial_Trasformation',
  '77_C_Kankurou_Chakra_Threads', '78_UC_Kankurou_Puppet_Master_Jutsu',
  '79_C_Temari_Kunoichi', '80_UC_Temari_Sandstorm',
  '81_C_Baki_Council_Agent', '84_C_Yashamaru_Careteaker',
  '86_C_Zabuza_Kubikiribocho', '88_C_Haku_Orphan', '89_UC_Haku_Crystal_Ice_Mirrors',
  '90_C_Itachi_Akatsuki', '92_C_Kisame_Rogue_Ninja',
  '94_C_Gamabunta_Chief_Toad', '95_C_Gamahiro_Armed_Toad',
  '96_C_Gamakichi_Eldest_Son', '97_C_Gamatatsu_Youngest_Son',
  '98_C_Katsuyu_Giant_Slug', '99_C_Pakkun_Hound',
  '100_C_Ninja_Hound', '101_C_TonTon_Pig',
  // Rares
  '104_R_Tsunade_Hokage', '105_R_Jiraiya_Summoning_Jutsu',
  '108_M_Naruto',
  '109_R_ART_Sakura_Medical', '111_R_Shikamaru_Shadow_Strangle',
  '117_R_ART_RockLee_Loopy_Fist', '119_R_Kankuro_Iron_Maiden',
  '120_R_Gaara_Sand_Coffin', '121_R_Temari_Wind_Scythe',
  // Secrets
  '131_SecretV_GOLD_Tsunade_Hokage', '132_Secret_GOLD_Jiraiya_Toad_Mouth',
  '133_SecretV_GOLD_Naruto_Rasengan', '135_Secret_GOLD_Sakura_Recovery_Team',
  '136_SecretV_GOLD_Sasuke_Heaven_Curse_Mark', '137_SecretV_GOLD_Kakashi_Lightning_Blade',
  '138_Secret_GOLD_Orochimaru_Transference_Ritual',
  // Mythos
  '143_M_Special_Itachi_Hunting', '144_M_Special_Kisame_Chakra_absorb',
  // Legendary & Missions
  'Legendary_Naruto_',
  'M1_Call-for-support', 'M2_Chunin-exam', 'M3_Find-the-traitor',
  'M4_Assassination', 'M5_Bring-it-back', 'M6_Free-a-friend',
  'M7_I-have-to-go', 'M8_Set-a-trap', 'M9_Guard-a-VIP', 'M10_Chakra-improvement',
];

// ─── Images found by brute-force for MISSING cards ───
const FOUND_FOR_MISSING = [
  { cardId: 'KS-108-R', filename: '108_R_Naruto_Rasengan', size: 236468 },
  { cardId: 'KS-108-RA-alt', filename: '108_R_ART_Naruto_Shadow_Clone', size: 332718, note: 'KS-108-RA already has visual; this is an alternative from CDN' },
  { cardId: 'KS-108-R-alt', filename: '108_M_Naruto', size: 0, note: 'On gallery page with M prefix; may be alt version of 108-R' },
  { cardId: 'KS-128-R', filename: '128_R_Itachi_Control', size: 172914 },
  { cardId: 'KS-145-M', filename: '145_M_Naruto_Original_Team', size: 168118 },
];

// ─── Missing cards NOT found ───
const NOT_FOUND = [
  'KS-045-UC — ANKO MITARASHI "Shadow Snake Hands"',
  'KS-112-R — CHOJI AKIMICHI "Who are you calling fat?"',
  'KS-115-R — SHINO ABURAME "Insect Wall Technique"',
  'KS-115-RA — SHINO ABURAME "Insect Wall Technique" (Rare Art)',
  'KS-116-RA — NEJI HYUGA "Eight Trigrams Sixty-Four Palms"',
  'KS-122-R — JIROBO "Arhat Fist"',
  'KS-122-RA — JIROBO "Arhat Fist" (Rare Art)',
  'KS-124-R — KIDOMARU "Spider Bow: Fierce Rip"',
  'KS-124-RA — KIDOMARU "Spider Bow: Fierce Rip" (Rare Art)',
  'KS-126-R — OROCHIMARU "Get out of my way."',
  'KS-127-R — SAKON "Stone Fist"',
  'KS-127-RA — SAKON "Stone Fist" (Rare Art)',
  'KS-129-R — NINE-TAILS "Demon Fox Cloak"',
  'KS-129-RA — NINE-TAILS "Demon Fox Cloak" (Rare Art)',
  'KS-130-R — ONE-TAIL "I hope you\'re ready to die!"',
  'KS-134-S — NINE-TAILED FOX "The Beast Awakens"',
  'KS-149-M — KIBA INUZUKA "Fang Over Fang"',
  'KS-151-M — ROCK LEE "Loopy Fist"',
  'KS-152-M — ITACHI UCHIHA "Amaterasu"',
  'KS-153-M — GAARA "Sand Burial"',
];

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        return reject(new Error('HTTP ' + res.statusCode));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    });
    req.on('error', (err) => { file.close(); try { fs.unlinkSync(destPath); } catch {} reject(err); });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // ─── 1. Write ALL gallery URLs to text file ───
  const allUrlsFile = path.join(OUTPUT_DIR, 'all_gallery_urls.txt');
  const allLines = ALL_GALLERY_URLS.map(f => BASE + f + '-1920w.webp');
  fs.writeFileSync(allUrlsFile, allLines.join('\n') + '\n');
  console.log('Wrote ' + allLines.length + ' gallery URLs to: ' + allUrlsFile);

  // ─── 2. Write found missing card URLs ───
  const foundFile = path.join(OUTPUT_DIR, 'found_missing_urls.txt');
  const foundLines = FOUND_FOR_MISSING.map(f =>
    f.cardId + ' | ' + BASE + f.filename + '-1920w.webp' + (f.note ? ' | NOTE: ' + f.note : '')
  );
  fs.writeFileSync(foundFile, foundLines.join('\n') + '\n');
  console.log('Wrote ' + foundLines.length + ' found missing URLs to: ' + foundFile);

  // ─── 3. Write not-found list ───
  const notFoundFile = path.join(OUTPUT_DIR, 'not_found_cards.txt');
  fs.writeFileSync(notFoundFile,
    'Cards NOT found on CDN (not on gallery page, brute-force failed):\n\n' +
    NOT_FOUND.join('\n') + '\n\n' +
    'These 20 cards are likely not yet uploaded to the CDN.\n' +
    'Tested ~1100+ URL combinations per card across multiple naming patterns.\n'
  );
  console.log('Wrote not-found list to: ' + notFoundFile);

  // ─── 4. Download found images ───
  console.log('\nDownloading found images...');
  for (const item of FOUND_FOR_MISSING) {
    if (item.cardId.endsWith('-alt')) continue; // Skip alternatives for now

    const url = BASE + item.filename + '-1920w.webp';
    const destPath = path.join(OUTPUT_DIR, item.cardId + '.webp');
    try {
      await downloadFile(url, destPath);
      const stat = fs.statSync(destPath);
      console.log('  Downloaded: ' + item.cardId + '.webp (' + stat.size + ' bytes)');
    } catch (err) {
      console.log('  FAILED: ' + item.cardId + ' — ' + err.message);
    }
  }

  // Also download the alt versions
  for (const item of FOUND_FOR_MISSING) {
    if (!item.cardId.endsWith('-alt')) continue;
    const baseId = item.cardId.replace('-alt', '');
    const url = BASE + item.filename + '-1920w.webp';
    const destPath = path.join(OUTPUT_DIR, baseId + '_alt.webp');
    try {
      await downloadFile(url, destPath);
      const stat = fs.statSync(destPath);
      console.log('  Downloaded alt: ' + baseId + '_alt.webp (' + stat.size + ' bytes)');
    } catch (err) {
      console.log('  FAILED alt: ' + baseId + ' — ' + err.message);
    }
  }

  console.log('\nDone!');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
