/**
 * Round 4: Try R_ART prefix for R cards, M prefix for R cards,
 * and many more creative title keywords.
 */
const https = require('https');

const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';

// Generate with multiple prefixes per card
function gen(num, names, titles) {
  const prefixes = ['R', 'R_ART', 'M', 'M_Special', 'UC', 'Secret_GOLD', 'SecretV_GOLD', 'MV', 'MV_Special'];
  const candidates = [];
  for (const p of prefixes) {
    for (const n of names) {
      candidates.push(`${num}_${p}_${n}`);
      for (const t of titles) {
        candidates.push(`${num}_${p}_${n}_${t}`);
      }
    }
  }
  return candidates;
}

const candidates = [
  // KS-045-UC: ANKO
  ...gen(45, ['Anko', 'Anko_Mitarashi'], [
    'Shadow_Snake', 'Snake', 'Shadow', 'Snakes', 'Serpent', 'Hidden_Shadow',
    'Striking_Shadow', 'Venom', 'Fang', 'Fangs', 'Twin_Snakes', 'Many_Hidden',
    'Forest_of_Death', 'Death_Forest', 'Exam', 'Proctor', 'Curse_Mark',
    'Sen_Ei', 'Hidden_Snake', 'Snake_Hands', 'Shadow_Snake_Hands',
  ]),
  // KS-112-R: CHOJI — already found R_ART_Butterfly, but try more
  ...gen(112, ['Choji', 'Chouji', 'Choji_Akimichi'], [
    'Butterfly', 'Wings', 'Fat', 'Angry', 'Rage', 'Giant', 'Pill', 'Food_Pill',
    'Baika', 'Multi_Size', 'Partial', 'Expansion', 'Super', 'Calorie',
    'Spiky', 'Human_Boulder', 'Boulder', 'Red_Pill', 'Chakra_Wings',
    'Butterfly_Mode', 'Butterfly_Wings',
  ]),
  // KS-115-R/RA: SHINO
  ...gen(115, ['Shino', 'Shino_Aburame'], [
    'Insect_Wall', 'Bug_Wall', 'Insect', 'Bugs', 'Beetle', 'Parasitic', 'Swarm',
    'Wall', 'Colony', 'Destruction', 'Kikaichu', 'Bug_Clone', 'Bug',
    'Insect_Swarm', 'Hidden_Jutsu', 'Barrier', 'Shield', 'Insect_Barrier',
    'Bug_Shield', 'Secret', 'Hidden',
  ]),
  // KS-116-RA: NEJI
  ...gen(116, ['Neji', 'Neji_Hyuga'], [
    'Eight_Trigrams', 'Trigrams', '64_Palms', 'Palms', 'Hakke', 'Byakugan',
    'Gentle', 'Eight', 'Rotation', 'Palm', 'Gentle_Fist', 'Prodigy',
    'Sixty_Four', '128_Palms', 'Air_Palm', 'Vacuum', 'Heavenly_Spin',
    'Eight_Trigrams_64', 'Sixty-Four_Palms', '64',
  ]),
  // KS-122-R/RA: JIROBO
  ...gen(122, ['Jirobo', 'Jiroubou', 'Jirobou'], [
    'Arhat', 'Arhat_Fist', 'Fist', 'Earth', 'Curse', 'Level_2', 'Transform',
    'Stage_2', 'Earth_Dome', 'Dome', 'Giant', 'Power', 'Absorption',
    'Barrier', 'Curse_Mark', 'Cursed', 'Transformation', 'Earth_Prison',
    'Boulder',
  ]),
  // KS-124-R/RA: KIDOMARU
  ...gen(124, ['Kidomaru', 'Kidoumaru'], [
    'Spider', 'Spider_Bow', 'Bow', 'Arrow', 'Fierce', 'Rip', 'Web',
    'Six_Arms', 'Curse', 'Level_2', 'Cursed', 'Transform', 'Golden',
    'Golden_Arrow', 'Sticky', 'Sticky_Spider', 'Spider_Web', 'Thread',
    'Net', 'Fierce_Rip',
  ]),
  // KS-126-R: OROCHIMARU
  ...gen(126, ['Orochimaru'], [
    'Get_Out', 'Snake', 'Sword', 'Kusanagi', 'Manda', 'True_Form',
    'Power', 'Immortal', 'Forbidden', 'Seal', 'Giant', 'Eight',
    'Reanimation', 'Edo_Tensei', 'Five_Pronged', 'Curse', 'Sound',
    'Summoning', 'Three_Headed', 'Eight_Headed', 'Giant_Snake',
    'Rashomon', 'Way', 'Senin', 'Sannin', 'Living_Corpse', 'Body_Transfer',
  ]),
  // KS-127-R/RA: SAKON
  ...gen(127, ['Sakon', 'Sakon_Ukon'], [
    'Stone', 'Stone_Fist', 'Fist', 'Ukon', 'Twin', 'Parasitic',
    'Curse', 'Level_2', 'Brothers', 'Demon', 'Rashomon', 'Cursed',
    'Black_Seal', 'Transformation', 'Stage_2', 'Molecular',
    'Parasite', 'Demon_Twin', 'Attack',
  ]),
  // KS-129-R/RA: NINE-TAILS
  ...gen(129, ['Nine-Tails', 'NineTails', 'Nine_Tails', 'Kyubi', 'Naruto', 'Kurama'], [
    'Demon', 'Fox', 'Cloak', 'Demon_Fox', 'Fox_Cloak', 'Red_Chakra',
    'Rage', 'Tailed_Beast', 'Chakra', 'Bijuu', 'Jinchuriki', 'Rampage',
    'Four_Tails', 'Partial', 'Mantle', 'Shroud', 'Fury', 'Awakening',
    'Tails',
  ]),
  // KS-130-R: ONE-TAIL
  ...gen(130, ['One-Tail', 'OneTail', 'One_Tail', 'Shukaku', 'Ichibi', 'Gaara'], [
    'Death', 'Die', 'Full', 'Transform', 'Awakening', 'Rampage',
    'Shukaku', 'Complete', 'Beast', 'Full_Transformation', 'Sand',
    'Bijuu', 'Ready', 'Kill', 'Tanuki', 'Possession', 'Monster',
    'Demon', 'Transformation',
  ]),
  // KS-134-S: NINE-TAILED FOX
  ...gen(134, ['NineTailed', 'Nine-Tailed', 'Nine-Tailed_Fox', 'Kyubi', 'Kurama', 'NineTailed_Fox'], [
    'Beast', 'Awakens', 'Beast_Awakens', 'Destruction', 'Fox', 'Rampage',
    'Release', 'Nine_Tails', 'Bijuu', 'Demon', 'Fury', 'Attack',
    'Unleashed', 'Full_Power', 'Tailed_Beast', 'Chakra', 'Roar',
  ]),
  // KS-149-M: KIBA
  ...gen(149, ['Kiba', 'Kiba_Inuzuka'], [
    'Fang', 'Fang_Over_Fang', 'Gatsuga', 'All_Fours', 'Beast', 'Man_Beast',
    'Akamaru', 'Wolf', 'Double', 'Two-Headed', 'Two_Headed', 'Inuzuka',
    'Beast_Mimicry', 'Wild', 'Fierce', 'Drill', 'Rotation',
  ]),
  // KS-151-M: ROCK LEE
  ...gen(151, ['RockLee', 'Rock_Lee', 'Rock', 'Lee'], [
    'Loopy', 'Loopy_Fist', 'Drunken', 'Drunken_Fist', 'Gate', 'Eight_Gates',
    'Lotus', 'Primary', 'Hidden', 'Reverse', 'Primary_Lotus', 'Hidden_Lotus',
    'Reverse_Lotus', 'Fifth_Gate', 'Youth', 'Green_Beast', 'Taijutsu',
    'Strong_Fist', 'Training', 'Weights',
  ]),
  // KS-152-M: ITACHI
  ...gen(152, ['Itachi', 'Itachi_Uchiha', 'Itachi_Uchiwa'], [
    'Amaterasu', 'Black_Flames', 'Flames', 'Mangekyou', 'Susanoo',
    'Fire', 'Tsukuyomi', 'Crow', 'Sharingan', 'Akatsuki', 'Genjutsu',
    'Control', 'Uchiha', 'Massacre', 'Totsuka', 'Yata_Mirror',
    'Sealing', 'Blade',
  ]),
  // KS-153-M: GAARA
  ...gen(153, ['Gaara'], [
    'Sand', 'Sand_Burial', 'Burial', 'Coffin', 'Sand_Coffin', 'Desert',
    'Sabaku', 'Kazekage', 'Shield', 'Shukaku', 'Funeral', 'Sand_Funeral',
    'Waterfall', 'Imperial', 'Imperial_Funeral', 'Sabaku_no_Gaara',
    'Jinchuriki', 'Sand_Tsunami', 'Gourd', 'Third_Eye',
  ]),
];

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
  // Deduplicate
  const unique = [...new Set(candidates)];
  console.log('Testing ' + unique.length + ' unique URL candidates...');
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
