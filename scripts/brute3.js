/**
 * Final exhaustive CDN enumeration: try all number/rarity/name combinations
 * for the range 102-160 that aren't already on the gallery.
 */
const https = require('https');

const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';

// Numbers already confirmed on gallery: 104, 105, 108(M), 109, 111, 117, 119, 120, 121, 131-138, 143, 144
// Missing numbers to scan: 45, 102-103, 106-107, 110, 112-116, 118, 122-130, 134, 139-142, 145-153

const RARITY_PREFIXES = ['R', 'R_ART', 'UC', 'M', 'M_Special', 'Secret_GOLD', 'SecretV_GOLD', 'MV', 'MV_Special'];

const NAME_MAP = {
  45: ['Anko', 'Anko_Mitarashi'],
  102: ['Hiruzen', 'Hiruzen_Sarutobi'],
  103: ['Tsunade'],
  106: ['Naruto', 'Naruto_Uzumaki'],
  107: ['Naruto', 'Naruto_Uzumaki'],
  108: ['Naruto', 'Naruto_Uzumaki'],
  110: ['Sakura', 'Sakura_Haruno'],
  112: ['Choji', 'Chouji', 'Choji_Akimichi'],
  113: ['Ino', 'Ino_Yamanaka'],
  114: ['Shikamaru', 'Shikamaru_Nara'],
  115: ['Shino', 'Shino_Aburame'],
  116: ['Neji', 'Neji_Hyuga'],
  118: ['Tenten'],
  122: ['Jirobo', 'Jiroubou', 'Jirôbô'],
  123: ['Kidomaru', 'Kidômaru'],
  124: ['Kidomaru', 'Kidômaru'],
  125: ['Sakon'],
  126: ['Orochimaru'],
  127: ['Sakon'],
  128: ['Itachi', 'Itachi_Uchiha', 'Itachi_Uchiwa'],
  129: ['Nine-Tails', 'NineTails', 'Kyubi', 'Naruto'],
  130: ['One-Tail', 'OneTail', 'Shukaku', 'Ichibi', 'Gaara'],
  134: ['Nine-Tailed', 'NineTailed', 'Kyubi', 'Kurama', 'Nine-Tailed_Fox'],
  139: ['Sasuke', 'Sasuke_Uchiha'],
  140: ['Kakashi', 'Kakashi_Hatake'],
  141: ['Orochimaru'],
  142: ['Kabuto', 'Kabuto_Yakushi'],
  145: ['Naruto', 'Naruto_Uzumaki'],
  146: ['Naruto', 'Naruto_Uzumaki'],
  147: ['Sakura', 'Sakura_Haruno'],
  148: ['Sasuke', 'Sasuke_Uchiha'],
  149: ['Kiba', 'Kiba_Inuzuka'],
  150: ['Gaara'],
  151: ['RockLee', 'Rock_Lee', 'Lee', 'Rock'],
  152: ['Itachi', 'Itachi_Uchiha'],
  153: ['Gaara'],
  154: ['Naruto'],
  155: ['Naruto'],
};

// Title keywords to try per number
const TITLE_MAP = {
  45: ['Shadow_Snake', 'Snake', 'Shadow', 'Snakes', 'Serpent'],
  112: ['Fat', 'Calling', 'Butterfly', 'Wings', 'Spiky', 'Pill', 'Food_Pill', 'Baika', 'Expansion', 'Multi_Size'],
  115: ['Insect_Wall', 'Bug_Wall', 'Insect', 'Bugs', 'Beetle', 'Parasitic', 'Swarm', 'Wall', 'Colony'],
  116: ['Eight_Trigrams', 'Trigrams', '64_Palms', 'Palms', 'Hakke', 'Byakugan', 'Gentle', 'Eight'],
  122: ['Arhat', 'Arhat_Fist', 'Fist', 'Earth', 'Curse', 'Level_2', 'Transform', 'Stage_2'],
  124: ['Spider', 'Spider_Bow', 'Bow', 'Arrow', 'Fierce', 'Rip', 'Web', 'Six_Arms', 'Curse', 'Level_2'],
  126: ['Get_Out', 'Snake', 'Sword', 'Kusanagi', 'Manda', 'True_Form', 'Power', 'Immortal', 'Forbidden', 'Seal', 'Giant', 'Eight', 'Reanimation', 'Edo_Tensei', 'Five_Pronged', 'Curse'],
  127: ['Stone', 'Stone_Fist', 'Fist', 'Ukon', 'Twin', 'Parasitic', 'Curse', 'Level_2', 'Brothers', 'Demon'],
  129: ['Demon', 'Fox', 'Cloak', 'Demon_Fox', 'Fox_Cloak', 'Red_Chakra', 'Rage', 'Tailed_Beast', 'Chakra'],
  130: ['Death', 'Die', 'Full', 'Transform', 'Awakening', 'Rampage', 'Shukaku', 'Complete', 'Beast'],
  134: ['Beast', 'Awakens', 'Beast_Awakens', 'Destruction', 'Fox', 'Rampage', 'Release', 'Nine_Tails'],
  149: ['Fang', 'Fang_Over_Fang', 'Gatsuga', 'All_Fours', 'Beast', 'Man_Beast', 'Akamaru', 'Wolf', 'Double', 'Two-Headed'],
  151: ['Loopy', 'Loopy_Fist', 'Drunken', 'Drunken_Fist', 'Gate', 'Eight_Gates', 'Lotus', 'Primary', 'Hidden', 'Reverse'],
  152: ['Amaterasu', 'Black_Flames', 'Flames', 'Mangekyou', 'Susanoo', 'Fire', 'Tsukuyomi', 'Crow'],
  153: ['Sand', 'Sand_Burial', 'Burial', 'Coffin', 'Sand_Coffin', 'Desert', 'Sabaku', 'Kazekage', 'Shield', 'Shukaku'],
};

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
  const candidates = [];

  // For each number in range
  const nums = [45, ...Array.from({ length: 59 }, (_, i) => 102 + i)]; // 45, 102-160

  for (const num of nums) {
    const nameList = NAME_MAP[num] || [];
    if (nameList.length === 0) continue;

    const titleList = TITLE_MAP[num] || [];

    for (const rarity of RARITY_PREFIXES) {
      for (const name of nameList) {
        // Without title
        candidates.push(num + '_' + rarity + '_' + name);
        // With each title
        for (const title of titleList) {
          candidates.push(num + '_' + rarity + '_' + name + '_' + title);
        }
      }
    }
  }

  console.log('Testing ' + candidates.length + ' URL candidates...');
  const hits = [];

  for (let i = 0; i < candidates.length; i += 10) {
    const batch = candidates.slice(i, i + 10);
    const results = await Promise.all(batch.map(c => check(c)));
    for (const r of results) {
      if (r.status === 200 && r.size > 1000) {
        console.log('HIT: ' + r.filename + ' (' + r.size + ' bytes)');
        hits.push(r);
      }
    }
    if (i % 500 === 0) process.stdout.write('  Progress: ' + i + '/' + candidates.length + '\r');
  }

  console.log('\n\nDone! Found ' + hits.length + ' images:');
  hits.forEach(h => console.log('  ' + BASE + h.filename));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
