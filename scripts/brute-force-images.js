/**
 * Brute-force image finder for missing Naruto Mythos TCG card visuals.
 *
 * CDN base: https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/{filename}-{width}w.webp
 * Known example: 01_C_Hiruzen_Professor-1920w.webp  (card 001, Common, HIRUZEN SARUTOBI, "The Professor")
 *
 * Strategy: generate thousands of URL candidates per card, try HEAD requests first (fast),
 * then GET to download the ones that respond 200. Save to ./newvisual/
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';
const OUTPUT_DIR = path.join(__dirname, '..', 'newvisual');
const CONCURRENCY = 5;        // parallel requests
const DELAY_MS = 200;         // delay between batches to avoid rate limiting
const REQUEST_TIMEOUT = 10000; // 10s timeout per request

// ─── Missing cards data ───────────────────────────────────────────────────────
const MISSING_CARDS = [
  { id: 'KS-045-UC', num: 45, rarity: 'UC', name_en: 'ANKO MITARASHI', name_fr: 'ANKO MITARASHI', title_en: 'Shadow Snake Hands', title_fr: 'La Poigne du Serpent Spectral' },
  { id: 'KS-108-R', num: 108, rarity: 'R', name_en: 'NARUTO UZUMAKI', name_fr: 'NARUTO UZUMAKI', title_en: 'Believe it!', title_fr: 'Believe it!' },
  { id: 'KS-112-R', num: 112, rarity: 'R', name_en: 'CHOJI AKIMICHI', name_fr: 'CHOJI AKIMICHI', title_en: 'Who are you calling fat?', title_fr: "C'est qui que tu traites de gros ?" },
  { id: 'KS-115-R', num: 115, rarity: 'R', name_en: 'Shino Aburame', name_fr: 'SHINO ABURAME', title_en: 'Insect Wall Technique', title_fr: "Technique du Mur d'Insectes" },
  { id: 'KS-115-RA', num: 115, rarity: 'RA', name_en: 'Shino Aburame', name_fr: 'SHINO ABURAME', title_en: 'Insect Wall Technique', title_fr: "Technique du Mur d'Insectes" },
  { id: 'KS-116-RA', num: 116, rarity: 'RA', name_en: 'NEJI HYUGA', name_fr: 'NEJI HYÛGA', title_en: 'Eight Trigrams Sixty-Four Palms', title_fr: 'Hakke Soixante-Quatre Paumes' },
  { id: 'KS-122-R', num: 122, rarity: 'R', name_en: 'JIROBO', name_fr: 'JIRÔBÔ', title_en: 'Arhat Fist', title_fr: "Poing d'Arhat" },
  { id: 'KS-122-RA', num: 122, rarity: 'RA', name_en: 'JIROBO', name_fr: 'JIRÔBÔ', title_en: 'Arhat Fist', title_fr: "Poing d'Arhat" },
  { id: 'KS-124-R', num: 124, rarity: 'R', name_en: 'KIDOMARU', name_fr: 'KIDÔMARU', title_en: 'Spider Bow: Fierce Rip', title_fr: "Arc d'Araignée : Déchirure Féroce" },
  { id: 'KS-124-RA', num: 124, rarity: 'RA', name_en: 'KIDOMARU', name_fr: 'KIDÔMARU', title_en: 'Spider Bow: Fierce Rip', title_fr: "Arc d'Araignée : Déchirure Féroce" },
  { id: 'KS-126-R', num: 126, rarity: 'R', name_en: 'OROCHIMARU', name_fr: 'OROCHIMARU', title_en: 'Get out of my way.', title_fr: 'Ôtez-vous de mon chemin.' },
  { id: 'KS-127-R', num: 127, rarity: 'R', name_en: 'Sakon', name_fr: 'SAKON', title_en: 'Stone Fist', title_fr: 'Le Poing de Pierre' },
  { id: 'KS-127-RA', num: 127, rarity: 'RA', name_en: 'Sakon', name_fr: 'SAKON', title_en: 'Stone Fist', title_fr: 'Le Poing de Pierre' },
  { id: 'KS-128-R', num: 128, rarity: 'R', name_en: 'ITACHI UCHIHA', name_fr: 'ITACHI UCHIWA', title_en: 'I control them all.', title_fr: 'Je les contrôle tous.' },
  { id: 'KS-129-R', num: 129, rarity: 'R', name_en: 'NINE-TAILS', name_fr: 'KYÛBI', title_en: 'Demon Fox Cloak', title_fr: 'Manteau du Démon Renard' },
  { id: 'KS-129-RA', num: 129, rarity: 'RA', name_en: 'NINE-TAILS', name_fr: 'KYÛBI', title_en: 'Demon Fox Cloak', title_fr: 'Manteau du Démon Renard' },
  { id: 'KS-130-R', num: 130, rarity: 'R', name_en: 'ONE-TAIL', name_fr: 'ICHIBI', title_en: "I hope you're ready to die!", title_fr: "J'espère que tu es prêt à mourir !" },
  { id: 'KS-134-S', num: 134, rarity: 'S', name_en: 'NINE-TAILED FOX', name_fr: 'KYÛBI', title_en: 'The Beast Awakens', title_fr: 'Destruction' },
  { id: 'KS-145-M', num: 145, rarity: 'M', name_en: 'NARUTO UZUMAKI', name_fr: 'NARUTO UZUMAKI', title_en: 'Original Team 7', title_fr: 'Équipe 7 originelle' },
  { id: 'KS-149-M', num: 149, rarity: 'M', name_en: 'KIBA INUZUKA', name_fr: 'KIBA INUZUKA', title_en: 'Fang Over Fang', title_fr: 'Crocs sur crocs' },
  { id: 'KS-151-M', num: 151, rarity: 'M', name_en: 'ROCK LEE', name_fr: 'ROCK LEE', title_en: 'Loopy Fist', title_fr: "Poing de l'ivresse" },
  { id: 'KS-152-M', num: 152, rarity: 'M', name_en: 'ITACHI UCHIHA', name_fr: 'ITACHI UCHIWA', title_en: 'Amaterasu', title_fr: 'Amaterasu' },
  { id: 'KS-153-M', num: 153, rarity: 'M', name_en: 'GAARA', name_fr: 'GAARA', title_en: 'Sand Burial', title_fr: 'Cercueil de Sable' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function titleCase(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function sanitize(s) {
  // Remove punctuation except hyphens and apostrophes
  return s.replace(/[.,!?;:'"()[\]{}]/g, '').trim();
}

const ARTICLES = ['the', 'a', 'an', 'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de'];

function stripLeadingArticles(words) {
  while (words.length > 1 && ARTICLES.includes(words[0].toLowerCase())) {
    words = words.slice(1);
  }
  return words;
}

// ─── URL Candidate Generator ─────────────────────────────────────────────────

function generateCandidates(card) {
  const urls = new Set();
  const { num, rarity } = card;

  // Number formats: raw, 2-digit padded, 3-digit padded
  const numFormats = [
    String(num),
    String(num).padStart(2, '0'),
    String(num).padStart(3, '0'),
  ];

  // Rarity formats
  const rarityFormats = [rarity];

  // ─── Name variants ───
  const nameEn = stripAccents(sanitize(card.name_en || '')).trim();
  const nameFr = stripAccents(sanitize(card.name_fr || '')).trim();

  const nameWordsEn = nameEn.split(/[\s]+/).filter(Boolean);
  const nameWordsFr = nameFr.split(/[\s]+/).filter(Boolean);

  // First word of name
  const firstNameEn = nameWordsEn[0] || '';
  const firstNameFr = nameWordsFr[0] || '';
  // Last word of name
  const lastNameEn = nameWordsEn.length > 1 ? nameWordsEn[nameWordsEn.length - 1] : '';
  // Full name joined
  const fullNameEn = nameWordsEn.join('_');
  const fullNameFr = nameWordsFr.join('_');

  // Name variants to try
  const nameVariants = new Set();
  for (const n of [firstNameEn, firstNameFr]) {
    if (!n) continue;
    nameVariants.add(titleCase(n));
    nameVariants.add(n.toUpperCase());
    nameVariants.add(n.toLowerCase());
    // Handle hyphenated names like NINE-TAILS
    if (n.includes('-')) {
      const parts = n.split('-');
      nameVariants.add(parts.map(p => titleCase(p)).join('-'));     // Nine-Tails
      nameVariants.add(titleCase(parts[0]) + '-' + parts[1].toLowerCase()); // Nine-tails
      nameVariants.add(parts.join(''));  // NineTails / ninetails
      nameVariants.add(titleCase(parts.join('')));  // Ninetails
      nameVariants.add(parts.map(p => titleCase(p)).join('_'));     // Nine_Tails
    }
  }
  // Full name underscore-joined
  for (const fn of [fullNameEn, fullNameFr]) {
    if (!fn) continue;
    nameVariants.add(fn.split('_').map(w => titleCase(w)).join('_'));
    nameVariants.add(fn.toUpperCase().replace(/ /g, '_'));
    nameVariants.add(fn.toLowerCase().replace(/ /g, '_'));
  }

  // ─── Title variants ───
  const titleEn = stripAccents(sanitize(card.title_en || '')).trim();
  const titleFr = stripAccents(sanitize(card.title_fr || '')).trim();

  const titleWordsEn = titleEn.split(/[\s]+/).filter(Boolean);
  const titleWordsFr = titleFr.split(/[\s]+/).filter(Boolean);

  // Strip articles
  const titleWordsEnStripped = stripLeadingArticles([...titleWordsEn]);
  const titleWordsFrStripped = stripLeadingArticles([...titleWordsFr]);

  // First meaningful word
  const firstTitleEn = titleWordsEnStripped[0] || '';
  const firstTitleFr = titleWordsFrStripped[0] || '';

  // First TWO meaningful words
  const firstTwoEn = titleWordsEnStripped.slice(0, 2).join('_');
  const firstTwoFr = titleWordsFrStripped.slice(0, 2).join('_');

  // Full title joined
  const fullTitleEn = titleWordsEn.join('_');
  const fullTitleFr = titleWordsFr.join('_');
  const fullTitleEnStripped = titleWordsEnStripped.join('_');

  const titleVariants = new Set();
  // First word variants (most likely pattern)
  for (const t of [firstTitleEn, firstTitleFr]) {
    if (!t) continue;
    titleVariants.add(titleCase(t));
    titleVariants.add(t.toUpperCase());
    titleVariants.add(t.toLowerCase());
    // Handle hyphens
    if (t.includes('-')) {
      const parts = t.split('-');
      titleVariants.add(parts.map(p => titleCase(p)).join('-'));
      titleVariants.add(titleCase(parts[0]) + '-' + parts[1].toLowerCase());
    }
  }
  // First two words
  for (const tt of [firstTwoEn, firstTwoFr]) {
    if (!tt) continue;
    titleVariants.add(tt.split('_').map(w => titleCase(w)).join('_'));
    titleVariants.add(tt.split('_').map(w => titleCase(w)).join('-'));
  }
  // Full title
  for (const ft of [fullTitleEn, fullTitleFr, fullTitleEnStripped]) {
    if (!ft) continue;
    const tced = ft.split('_').map(w => titleCase(w)).join('_');
    titleVariants.add(tced);
    // Replace spaces/underscores with hyphens
    titleVariants.add(ft.split('_').map(w => titleCase(w)).join('-'));
  }

  // Without article but with "The" etc. as is
  if (titleWordsEn[0] && ARTICLES.includes(titleWordsEn[0].toLowerCase()) && titleWordsEn.length > 1) {
    // Try keeping the article
    titleVariants.add(titleCase(titleWordsEn[0]) + '_' + titleCase(titleWordsEn[1]));
    // Just second word
    titleVariants.add(titleCase(titleWordsEn[1]));
  }

  // Special: for titles starting with "I " (like "I control them all"), use "I" as-is
  if (titleWordsEn[0] && titleWordsEn[0].toUpperCase() === 'I') {
    titleVariants.add('I');
  }

  // ─── Also try with NO title component ───
  titleVariants.add('');

  // ─── Width suffixes ───
  const widths = ['1920w', '960w', '640w', '1280w', '480w', '1600w', '2048w'];

  // ─── Build all combinations ───
  for (const numFmt of numFormats) {
    for (const rar of rarityFormats) {
      for (const name of nameVariants) {
        for (const title of titleVariants) {
          for (const width of widths) {
            let filename;
            if (title) {
              filename = `${numFmt}_${rar}_${name}_${title}-${width}.webp`;
            } else {
              filename = `${numFmt}_${rar}_${name}-${width}.webp`;
            }
            urls.add(filename);
          }
        }
      }
    }
  }

  // ─── Extra creative patterns ───
  // Try number_rarity_FullName format (no title)
  for (const numFmt of numFormats) {
    for (const rar of rarityFormats) {
      for (const width of widths) {
        // FullName_Title (all title case)
        if (nameWordsEn.length > 1) {
          const fn = nameWordsEn.map(w => titleCase(w)).join('_');
          const ft = titleWordsEnStripped[0] ? titleCase(titleWordsEnStripped[0]) : '';
          if (ft) urls.add(`${numFmt}_${rar}_${fn}_${ft}-${width}.webp`);
          urls.add(`${numFmt}_${rar}_${fn}-${width}.webp`);
        }
        // French name variants
        if (nameWordsFr.length > 1 && card.name_fr !== card.name_en) {
          const fn = nameWordsFr.map(w => titleCase(stripAccents(w))).join('_');
          const ft = titleWordsFrStripped[0] ? titleCase(stripAccents(titleWordsFrStripped[0])) : '';
          if (ft) urls.add(`${numFmt}_${rar}_${fn}_${ft}-${width}.webp`);
        }
      }
    }
  }

  // ─── Special cases per card ───
  // NINE-TAILS / NINE-TAILED FOX — try Kyubi variants
  if (card.name_fr.includes('KYÛBI') || card.name_fr.includes('KYUBI')) {
    for (const numFmt of numFormats) {
      for (const rar of rarityFormats) {
        for (const width of widths) {
          for (const kyubi of ['Kyubi', 'Kyuubi', 'Kyûbi', 'Nine-Tails', 'Nine_Tails', 'Ninetails', 'Nine-Tailed_Fox', 'Nine-tailed', 'Nine-Tailed']) {
            for (const title of titleVariants) {
              if (title) urls.add(`${numFmt}_${rar}_${kyubi}_${title}-${width}.webp`);
              urls.add(`${numFmt}_${rar}_${kyubi}-${width}.webp`);
            }
          }
        }
      }
    }
  }

  // ONE-TAIL / ICHIBI — try Ichibi variants
  if (card.name_fr === 'ICHIBI' || card.name_en === 'ONE-TAIL') {
    for (const numFmt of numFormats) {
      for (const rar of rarityFormats) {
        for (const width of widths) {
          for (const ichibi of ['Ichibi', 'One-Tail', 'One_Tail', 'Onetail', 'One-tail', 'Shukaku']) {
            for (const title of titleVariants) {
              if (title) urls.add(`${numFmt}_${rar}_${ichibi}_${title}-${width}.webp`);
              urls.add(`${numFmt}_${rar}_${ichibi}-${width}.webp`);
            }
          }
        }
      }
    }
  }

  // ROCK LEE — could be "Rock" or "Rock_Lee" or "Lee"
  if (card.name_en === 'ROCK LEE') {
    for (const numFmt of numFormats) {
      for (const rar of rarityFormats) {
        for (const width of widths) {
          for (const lee of ['Lee', 'Rock_Lee', 'RockLee']) {
            for (const title of titleVariants) {
              if (title) urls.add(`${numFmt}_${rar}_${lee}_${title}-${width}.webp`);
              urls.add(`${numFmt}_${rar}_${lee}-${width}.webp`);
            }
          }
        }
      }
    }
  }

  // ITACHI — try Uchiha vs Uchiwa
  if (card.name_en && card.name_en.includes('ITACHI')) {
    for (const numFmt of numFormats) {
      for (const rar of rarityFormats) {
        for (const width of widths) {
          for (const variant of ['Itachi_Uchiha', 'Itachi_Uchiwa', 'Itachi']) {
            for (const title of titleVariants) {
              if (title) urls.add(`${numFmt}_${rar}_${variant}_${title}-${width}.webp`);
              urls.add(`${numFmt}_${rar}_${variant}-${width}.webp`);
            }
          }
        }
      }
    }
  }

  return [...urls];
}

// ─── HTTP check ──────────────────────────────────────────────────────────────

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: REQUEST_TIMEOUT }, (res) => {
      resolve({ url, status: res.statusCode, size: parseInt(res.headers['content-length'] || '0', 10) });
    });
    req.on('error', () => resolve({ url, status: 0, size: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ url, status: 0, size: 0 }); });
    req.end();
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const req = https.get(url, { timeout: 30000 }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    });
    req.on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch {}
      reject(err);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Batch processor ─────────────────────────────────────────────────────────

async function processBatch(urls) {
  const results = [];
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(u => checkUrl(u)));
    results.push(...batchResults);
    if (i + CONCURRENCY < urls.length) await sleep(DELAY_MS);
  }
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Naruto Mythos TCG — Brute-Force Image Finder ===');
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Cards to find: ${MISSING_CARDS.length}\n`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const found = [];
  const notFound = [];
  let totalUrls = 0;

  for (const card of MISSING_CARDS) {
    console.log(`\n--- ${card.id}: ${card.name_en} — "${card.title_en}" (${card.rarity}) ---`);
    const candidates = generateCandidates(card);
    const fullUrls = candidates.map(c => BASE_URL + c);
    totalUrls += fullUrls.length;

    console.log(`  Generated ${fullUrls.length} URL candidates, testing...`);

    let foundOne = false;
    // Process in batches
    for (let i = 0; i < fullUrls.length; i += CONCURRENCY) {
      const batch = fullUrls.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(u => checkUrl(u)));

      for (const r of results) {
        if (r.status === 200 && r.size > 1000) { // >1KB to filter out error pages
          const filename = r.url.split('/').pop();
          console.log(`  >>> FOUND: ${filename} (${r.size} bytes)`);

          // Download
          const destPath = path.join(OUTPUT_DIR, `${card.id}.webp`);
          try {
            await downloadFile(r.url, destPath);
            console.log(`  >>> Saved to: ${destPath}`);
            found.push({ cardId: card.id, url: r.url, filename, size: r.size });
            foundOne = true;
            break; // Stop searching for this card once found
          } catch (err) {
            console.log(`  >>> Download failed: ${err.message}`);
          }
        }
      }

      if (foundOne) break;

      // Progress indicator
      if ((i / CONCURRENCY) % 50 === 0 && i > 0) {
        process.stdout.write(`  Tested ${i}/${fullUrls.length}...`);
        process.stdout.write('\r');
      }

      await sleep(DELAY_MS);
    }

    if (!foundOne) {
      console.log(`  NOT FOUND after ${fullUrls.length} attempts`);
      notFound.push(card.id);
    }
  }

  // ─── Summary ───
  console.log('\n\n========== SUMMARY ==========');
  console.log(`Total URLs tested: ${totalUrls}`);
  console.log(`Cards found: ${found.length}/${MISSING_CARDS.length}`);
  console.log(`Cards NOT found: ${notFound.length}`);

  if (found.length > 0) {
    console.log('\nFound cards:');
    for (const f of found) {
      console.log(`  ${f.cardId}: ${f.filename} (${f.size} bytes)`);
    }
  }

  if (notFound.length > 0) {
    console.log('\nNot found:');
    for (const nf of notFound) {
      console.log(`  ${nf}`);
    }
  }

  // Save results to JSON
  const resultsPath = path.join(OUTPUT_DIR, '_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({ found, notFound, totalUrlsTested: totalUrls }, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
