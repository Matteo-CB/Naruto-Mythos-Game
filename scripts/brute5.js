/**
 * Final round 5: creative hyphens, French words, alternate spellings.
 * Focus on the 18 cards still not found.
 */
const https = require('https');

const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';

// Build candidates with creative patterns
const candidates = [];

function add(num, prefixes, names, titles) {
  for (const p of prefixes) {
    for (const n of names) {
      candidates.push(`${num}_${p}_${n}`);
      for (const t of titles) {
        candidates.push(`${num}_${p}_${n}_${t}`);
      }
    }
  }
}

// ─── KS-045-UC: ANKO ───
// Gallery has 44_C_Anko_Proctor. UC version might not exist.
add(45, ['UC', 'R', 'R_ART', 'C'], ['Anko'], [
  'Shadow-Snake', 'Shadow-Snake-Hands', 'Snake-Hands', 'Sen-Ei-Jashu',
  'Snake_Shadow', 'Mitarashi', 'Anko_Shadow', 'Hidden_Snake_Hands',
  'Poisonous', 'Poison', 'Trench_Coat', 'Special_Jonin', 'Jonin',
  'Forest', 'Curse_Seal', 'Cursed', 'Orochimaru_Student',
]);

// ─── KS-115-R: SHINO ───
add(115, ['R', 'R_ART', 'M', 'UC'], ['Shino', 'Shino_Aburame'], [
  'Insect-Wall', 'Bug-Wall', 'Insect-Wall-Technique', 'Wall_Technique',
  'Insect_Technique', 'Bug_Technique', 'Destruction_Bug', 'Destruction_Bugs',
  'Parasitic_Insect', 'Parasitic_Insects', 'Kikaichuu', 'Kikaichu',
  'Secret_Technique', 'Hidden_Jutsu', 'Bug_Barrier', 'Insect_Barrier',
  'Bug_Sphere', 'Insect_Sphere',
]);

// ─── KS-122-R/RA: JIROBO ───
// Gallery has 57_C_Jiroubou and 58_UC_Jirobo (inconsistent)
add(122, ['R', 'R_ART', 'M'], ['Jirobo', 'Jiroubou', 'Jirobou', 'Jiroubô'], [
  'Arhat-Fist', 'Curse-Mark', 'Level-2', 'Stage-2', 'Cursed-Seal',
  'Earth-Dome', 'Earth_Prison', 'Earth-Prison', 'Absorption', 'Chakra_Absorption',
  'Earth-Style', 'Earth_Style', 'Sound_Four', 'Barrier',
  'Ogre', 'Monster', 'Demon',
]);

// ─── KS-124-R/RA: KIDOMARU ───
add(124, ['R', 'R_ART', 'M'], ['Kidomaru', 'Kidoumaru', 'Kidômaru'], [
  'Spider-Bow', 'Fierce-Rip', 'Spider-Arrow', 'Golden-Arrow',
  'Spider_Bow_Fierce_Rip', 'Spider-Web', 'Six-Arms', 'Curse-Mark',
  'Level-2', 'Stage-2', 'Cursed-Seal', 'Sound_Four', 'Thread',
  'Sticky_Spider_Thread', 'Kumoshibari',
]);

// ─── KS-126-R: OROCHIMARU ───
add(126, ['R', 'R_ART', 'M'], ['Orochimaru'], [
  'Get-Out', 'My-Way', 'Get_Out_Of_My_Way', 'Unstoppable',
  'Five-Pronged-Seal', 'Five-Pronged', 'Kusanagi-Sword', 'Giant-Snake',
  'Manda-Summoning', 'Forbidden-Jutsu', 'Living-Corpse-Reincarnation',
  'Body-Transfer', 'Sound-Leader', 'Sannin',
  'Triple_Rashomon', 'Rashomon', 'Yamata', 'Eight-Branches',
  'White_Snake', 'Rebirth', 'Resurrection',
]);

// ─── KS-127-R/RA: SAKON ───
add(127, ['R', 'R_ART', 'M'], ['Sakon', 'Sakon_Ukon', 'SakonUkon'], [
  'Stone-Fist', 'Cursed-Seal', 'Level-2', 'Stage-2',
  'Twin-Demon', 'Demon-Twin', 'Parasitic-Demon',
  'Parasite-Demon', 'Sound_Four', 'Rashomon',
  'Molecular', 'Molecular_Possession', 'Twin_Demons',
  'Black-Seal', 'Attack',
]);

// ─── KS-129-R/RA: NINE-TAILS ───
add(129, ['R', 'R_ART', 'M'], ['NineTails', 'Nine-Tails', 'Nine_Tails', 'Kyubi', 'Kurama'], [
  'Demon-Fox', 'Fox-Cloak', 'Demon_Fox_Cloak', 'Red-Chakra',
  'Tailed-Beast', 'Bijuu', 'Jinchuriki', 'Chakra-Cloak',
  'Four-Tails', 'Partial-Transform', 'Shroud', 'Mantle',
  'Fury', 'Rampage', 'Version_2', 'Version2', 'V2',
  'Initial_Jinchuriki', 'One_Tail', 'Naruto_Cloak',
]);

// ─── KS-130-R: ONE-TAIL ───
add(130, ['R', 'R_ART', 'M'], ['One-Tail', 'OneTail', 'One_Tail', 'Shukaku', 'Ichibi'], [
  'Full-Transformation', 'Full-Transform', 'Complete-Form',
  'Bijuu', 'Tailed-Beast', 'Sand-Monster', 'Tanuki',
  'Awakened', 'Unleashed', 'Full-Power', 'Full_Beast',
  'Giant', 'Demon-Tanuki', 'Sand_Beast', 'Ready-Die',
  'Possession', 'Gaara_Possession',
]);

// ─── KS-134-S: NINE-TAILED FOX ───
add(134, ['Secret_GOLD', 'SecretV_GOLD', 'S', 'R', 'R_ART', 'M'], [
  'NineTailed', 'Nine-Tailed', 'NineTailedFox', 'Nine-Tailed_Fox',
  'Kyubi', 'Kurama', 'NineTails', 'Nine-Tails',
], [
  'Beast-Awakens', 'Awakens', 'Beast', 'Destruction', 'Rampage',
  'Release', 'Unleashed', 'Full-Power', 'Fury', 'Attack',
  'Giant', 'Roar', 'Tailed_Beast_Bomb', 'Bijuu_Dama',
]);

// ─── KS-149-M: KIBA ───
add(149, ['M_Special', 'M', 'R', 'R_ART'], ['Kiba', 'Kiba_Inuzuka'], [
  'Fang-Over-Fang', 'Fang_over_Fang', 'Gatsuga', 'All-Fours',
  'Beast-Mimicry', 'Man-Beast', 'Two-Headed-Wolf', 'Two-Headed_Wolf',
  'Double-Fang', 'Wolf', 'Akamaru', 'Dynamic-Marking',
  'Inuzuka', 'Drill', 'Piercing-Fang', 'Wild',
]);

// ─── KS-151-M: ROCK LEE ───
add(151, ['M_Special', 'M', 'R', 'R_ART'], ['RockLee', 'Rock_Lee', 'Rock', 'Lee'], [
  'Loopy-Fist', 'Drunken-Fist', 'Drunken_Fist', 'Drunk',
  'Eight-Gates', 'Gate_of_Life', 'Gate_of_Opening', 'Hidden-Lotus',
  'Reverse-Lotus', 'Primary-Lotus', 'Lotus', 'Youth',
  'Green-Beast', 'Taijutsu-Master', 'Weights-Off',
  'Fifth-Gate', 'Inner-Gates', 'Front-Lotus', 'Omote-Renge',
]);

// ─── KS-152-M: ITACHI ───
add(152, ['M_Special', 'M', 'R', 'R_ART'], ['Itachi', 'Itachi_Uchiha', 'Itachi_Uchiwa'], [
  'Amaterasu', 'Black-Flames', 'Mangekyou-Sharingan', 'Mangekyou',
  'Susanoo', 'Tsukuyomi', 'Sharingan', 'Genjutsu',
  'Totsuka-Blade', 'Yata-Mirror', 'Crow', 'Clone',
  'Fire-Style', 'Fireball', 'Akatsuki', 'Massacre',
  'Uchiha_Prodigy', 'ANBU',
]);

// ─── KS-153-M: GAARA ───
add(153, ['M_Special', 'M', 'R', 'R_ART'], ['Gaara'], [
  'Sand-Burial', 'Sand-Coffin', 'Sand_Coffin', 'Desert-Funeral',
  'Sand-Funeral', 'Imperial-Funeral', 'Sabaku-Soso', 'Sabaku-Kyu',
  'Sabaku_Kyu', 'Sand-Shield', 'Sand-Tsunami', 'Third-Eye',
  'Sand_Waterfall', 'Gourd', 'Kazekage-Shield',
  'Quicksand', 'Sand-Prison', 'Sand_Prison',
]);

function check(filename) {
  return new Promise(resolve => {
    const url = BASE + filename + '-1920w.webp';
    const req = https.request(url, { method: 'HEAD', timeout: 8000 }, res => {
      const size = parseInt(res.headers['content-length'] || '0', 10);
      resolve({ filename: filename + '-1920w.webp', status: res.statusCode, size });
    });
    req.on('error', () => resolve({ filename, status: 'ERR', size: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ filename, status: 'TIMEOUT', size: 0 }); });
    req.end();
  });
}

async function main() {
  const unique = [...new Set(candidates)];
  console.log('Testing ' + unique.length + ' unique URL candidates (round 5)...');
  const hits = [];

  for (let i = 0; i < unique.length; i += 10) {
    const batch = unique.slice(i, i + 10);
    const results = await Promise.all(batch.map(c => check(c)));
    for (const r of results) {
      if (r.status === 200 && r.size > 1000) {
        console.log('HIT: ' + r.filename + ' (' + r.size + ' bytes)');
        hits.push(r);
      }
    }
    if (i % 1000 === 0) process.stdout.write('  Progress: ' + i + '/' + unique.length + '\r');
  }

  console.log('\n\nDone! Found ' + hits.length + ' images:');
  hits.forEach(h => console.log('  ' + BASE + h.filename));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
