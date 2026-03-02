const https = require('https');
const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';

const tests = [
  // KS-045-UC: ANKO MITARASHI
  '45_UC_Anko_Striking_Shadow', '45_UC_Anko_Hidden_Shadow', '45_UC_Anko_Snake_Fang',
  '45_UC_Anko_Mitarashi', '45_UC_Anko_Forest', '45_UC_Anko_Death_Forest',
  '45_UC_Anko_Snakes', '45_UC_Anko_Sen_Ei_Jashu', '45_UC_Anko_Twin_Snakes',
  '45_UC_Anko_Hidden', '45_UC_Anko', '45_UC_Anko_Shadow_Snake',
  '45_UC_Anko_Snake_Hands', '45_UC_Anko_Shadow_Snake_Hands',

  // KS-112-R: CHOJI AKIMICHI
  '112_R_Choji_Angry', '112_R_Choji_Rage', '112_R_Choji_Super_Size',
  '112_R_Choji_Giant', '112_R_Choji_Akimichi', '112_R_Choji_Spiky',
  '112_R_Choji_Calorie', '112_R_Choji', '112_R_Chouji_Butterfly',
  '112_R_Chouji_Wings', '112_R_Chouji', '112_R_Choji_Pill',
  '112_R_Choji_Food_Pill', '112_R_Choji_Red_Pill', '112_R_Choji_Baika',

  // KS-115-R: SHINO ABURAME
  '115_R_Shino_Bug_Clone', '115_R_Shino_Aburame', '115_R_Shino_Beetle',
  '115_R_Shino_Bugs', '115_R_Shino', '115_R_Shino_Kikaichu',
  '115_R_Shino_Colony', '115_R_Shino_Insect_Wall', '115_R_Shino_Wall',
  '115_R_Shino_Insect_Swarm', '115_R_Shino_Destruction',
  // KS-115-RA
  '115_R_ART_Shino', '115_R_ART_Shino_Bugs', '115_R_ART_Shino_Aburame',
  '115_R_ART_Shino_Insect', '115_R_ART_Shino_Wall', '115_R_ART_Shino_Insect_Wall',
  '115_R_ART_Shino_Colony', '115_R_ART_Shino_Beetle',

  // KS-116-RA: NEJI HYUGA
  '116_R_ART_Neji_Byakugan', '116_R_ART_Neji_Gentle', '116_R_ART_Neji_Gentle_Fist',
  '116_R_ART_Neji', '116_R_ART_Neji_Prodigy', '116_R_ART_Neji_64',
  '116_R_ART_Neji_Eight', '116_R_ART_Neji_Hyuga', '116_R_ART_Neji_Eight_Trigrams',
  '116_R_ART_Neji_Trigrams', '116_R_ART_Neji_64_Palms', '116_R_ART_Neji_Palms',
  '116_R_ART_Neji_Rotation', '116_R_ART_Neji_Palm_Rotation',
  '116_R_Neji_Eight_Trigrams', '116_R_Neji_Trigrams', '116_R_Neji_64_Palms', '116_R_Neji',

  // KS-122-R/RA: JIROBO (note: gallery uses Jiroubou for C but Jirobo for UC)
  '122_R_Jiroubou_Arhat', '122_R_Jiroubou_Arhat_Fist', '122_R_Jiroubou_Level_2',
  '122_R_Jiroubou_Curse', '122_R_Jiroubou_Cursed', '122_R_Jiroubou_Transformation',
  '122_R_Jiroubou', '122_R_Jirobo_Arhat', '122_R_Jirobo_Arhat_Fist',
  '122_R_Jirobo_Level_2', '122_R_Jirobo', '122_R_Jirobo_Curse_Mark',
  '122_R_ART_Jiroubou_Arhat', '122_R_ART_Jirobo_Arhat',
  '122_R_ART_Jiroubou', '122_R_ART_Jirobo',

  // KS-124-R/RA: KIDOMARU
  '124_R_Kidomaru_Arrow', '124_R_Kidomaru_Web', '124_R_Kidomaru_Sticky',
  '124_R_Kidomaru_Cursed', '124_R_Kidomaru_Level_2', '124_R_Kidomaru',
  '124_R_Kidomaru_Bow', '124_R_Kidomaru_Fierce', '124_R_Kidomaru_Spider_Bow',
  '124_R_Kidomaru_Six_Arms',
  '124_R_ART_Kidomaru', '124_R_ART_Kidomaru_Arrow', '124_R_ART_Kidomaru_Bow',
  '124_R_ART_Kidomaru_Web', '124_R_ART_Kidomaru_Spider',

  // KS-126-R: OROCHIMARU
  '126_R_Orochimaru_Power', '126_R_Orochimaru_Curse', '126_R_Orochimaru_Immortal',
  '126_R_Orochimaru_Kusanagi', '126_R_Orochimaru_True_Form', '126_R_Orochimaru_Eight_Headed',
  '126_R_Orochimaru_Manda', '126_R_Orochimaru', '126_R_Orochimaru_Giant',
  '126_R_Orochimaru_Sword', '126_R_Orochimaru_Edo_Tensei',
  '126_R_Orochimaru_Reanimation', '126_R_Orochimaru_Seal',
  '126_R_Orochimaru_Five_Pronged', '126_R_Orochimaru_Striking_Shadow',

  // KS-127-R/RA: SAKON
  '127_R_Sakon_Ukon', '127_R_Sakon_Twin', '127_R_Sakon_Brothers',
  '127_R_Sakon_Cursed', '127_R_Sakon_Level_2', '127_R_Sakon',
  '127_R_Sakon_Parasite', '127_R_Sakon_Demon', '127_R_Sakon_Rashomon',
  '127_R_Sakon_Stone_Fist', '127_R_Sakon_Stone',
  '127_R_ART_Sakon', '127_R_ART_Sakon_Twin', '127_R_ART_Sakon_Ukon',
  '127_R_ART_Sakon_Level_2', '127_R_ART_Sakon_Stone',

  // KS-129-R/RA: NINE-TAILS
  '129_R_NineTails_Demon', '129_R_NineTails_Cloak', '129_R_NineTails_Fox',
  '129_R_NineTails', '129_R_Nine-Tails', '129_R_Nine_Tails_Cloak',
  '129_R_Kyubi_Cloak', '129_R_Kyubi', '129_R_Naruto_Fox_Cloak',
  '129_R_Naruto_Kyubi', '129_R_Nine-Tails_Cloak', '129_R_Nine-Tails_Fox',
  '129_R_One-Tail_Partial', // Gallery had 76_UC_One-Tail_Partial_Trasformation
  '129_R_Kyubi_Demon_Fox', '129_R_Naruto_Red_Chakra',
  '129_R_Naruto_Tailed_Beast',
  '129_R_ART_NineTails', '129_R_ART_Nine-Tails', '129_R_ART_Nine-Tails_Cloak',
  '129_R_ART_Nine-Tails_Fox', '129_R_ART_Kyubi', '129_R_ART_Naruto_Fox',
  '129_R_ART_Kyubi_Cloak',

  // KS-130-R: ONE-TAIL
  '130_R_One-Tail', '130_R_OneTail', '130_R_Shukaku',
  '130_R_Ichibi', '130_R_One-Tail_Shukaku', '130_R_One_Tail',
  '130_R_Shukaku_Full', '130_R_Gaara_Shukaku', '130_R_One-Tail_Full',
  '130_R_One-Tail_Transform', '130_R_One-Tail_Complete',
  '130_R_Full_Shukaku', '130_R_One-Tail_Awakening',
  '130_R_One-Tail_Rampage',

  // KS-134-S: NINE-TAILED FOX
  '134_Secret_GOLD_NineTailed_Beast', '134_Secret_GOLD_NineTailed_Awakens',
  '134_Secret_GOLD_NineTailed', '134_Secret_GOLD_Kyubi',
  '134_Secret_GOLD_Kyubi_Destruction', '134_SecretV_GOLD_NineTailed',
  '134_SecretV_GOLD_NineTailed_Beast', '134_SecretV_GOLD_Kyubi',
  '134_S_NineTailed_Beast', '134_Secret_GOLD_Nine-Tailed',
  '134_Secret_GOLD_Nine-Tailed_Fox', '134_SecretV_GOLD_Nine-Tailed',
  '134_SecretV_GOLD_Nine-Tailed_Fox', '134_Secret_GOLD_Kurama',
  '134_SecretV_GOLD_Kurama',
  '134_Secret_GOLD_Kyubi_Beast_Awakens', '134_Secret_GOLD_Fox',

  // KS-149-M: KIBA INUZUKA
  '149_M_Special_Kiba_Gatsuga', '149_M_Special_Kiba_All_Fours',
  '149_M_Special_Kiba_Man_Beast', '149_M_Special_Kiba_Inuzuka',
  '149_M_Special_Kiba', '149_M_Kiba', '149_M_Kiba_Inuzuka',
  '149_M_Kiba_Akamaru', '149_M_Special_Kiba_Fang',
  '149_M_Special_Kiba_Fang_Over_Fang', '149_M_Special_Kiba_Double',
  '149_M_Special_Kiba_Wolf', '149_M_Special_Kiba_Two-Headed',

  // KS-151-M: ROCK LEE
  '151_M_Special_RockLee', '151_M_Special_RockLee_Drunken',
  '151_M_Special_RockLee_Drunken_Fist', '151_M_Special_Rock_Lee',
  '151_M_Special_Rock_Lee_Loopy', '151_M_Special_Lee_Loopy_Fist',
  '151_M_RockLee', '151_M_Rock_Lee', '151_M_Lee_Loopy',
  '151_M_Special_Lee', '151_M_Special_Lee_Drunken',
  '151_M_Special_RockLee_Gate', '151_M_Special_RockLee_Hidden_Lotus',
  '151_M_Special_RockLee_Lotus',
  '151_M_Special_RockLee_Loopy_Fist',

  // KS-152-M: ITACHI UCHIHA
  '152_M_Special_Itachi', '152_M_Special_Itachi_Black_Flames',
  '152_M_Special_Itachi_Flames', '152_M_Special_Itachi_Mangekyou',
  '152_M_Special_Itachi_Susanoo', '152_M_Itachi',
  '152_M_Special_Itachi_Fire', '152_M_Special_Itachi_Crow',
  '152_M_Special_Itachi_Tsukuyomi', '152_M_Special_Itachi_Uchiha',
  '152_M_Special_Itachi_Amaterasu',

  // KS-153-M: GAARA
  '153_M_Special_Gaara', '153_M_Special_Gaara_Coffin',
  '153_M_Special_Gaara_Sabaku', '153_M_Special_Gaara_Desert',
  '153_M_Special_Gaara_Shield', '153_M_Special_Gaara_Kazekage',
  '153_M_Gaara', '153_M_Gaara_Coffin', '153_M_Gaara_Sabaku',
  '153_M_Special_Gaara_Sand', '153_M_Special_Gaara_Sand_Burial',
  '153_M_Special_Gaara_Burial', '153_M_Special_Gaara_Sand_Coffin',
  '153_M_Special_Gaara_Shukaku',
];

async function check(filename) {
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

(async () => {
  console.log('Testing ' + tests.length + ' URLs...');
  const hits = [];
  for (let i = 0; i < tests.length; i += 10) {
    const batch = tests.slice(i, i + 10);
    const results = await Promise.all(batch.map(t => check(t)));
    for (const r of results) {
      if (r.status === 200 && r.size > 1000) {
        console.log('HIT: ' + r.filename + ' (' + r.size + ' bytes)');
        hits.push(r);
      }
    }
  }
  console.log('\nDone! Found ' + hits.length + ' images');
  hits.forEach(h => console.log('  ' + h.filename));
})();
