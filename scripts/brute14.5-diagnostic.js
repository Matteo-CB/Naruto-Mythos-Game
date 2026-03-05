#!/usr/bin/env node
/**
 * brute14.5-diagnostic.js — CDN connectivity diagnostic
 *
 * Tests ALL known good URLs from all_gallery_urls.txt (should all return 200)
 * plus a few deliberately fake URLs (should all return 404/error).
 * Verifies that our HEAD-check logic actually works.
 *
 * Usage:  node scripts/brute14.5-diagnostic.js
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const MIN_FILE_SIZE = 4000;
const TIMEOUT_MS    = 8000;

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: TIMEOUT_MS,
});

// ─── ANSI ──────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m',
};

// ─── Load known good URLs ──────────────────────────────────────────────────
const galleryFile = path.join(__dirname, '..', 'newvisual', 'all_gallery_urls.txt');
const goodUrls = fs.readFileSync(galleryFile, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l.startsWith('http'));

// ─── Fake URLs that should NOT exist ───────────────────────────────────────
const fakeUrls = [
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/999_FAKE_Card_Nothing-1920w.webp',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/00_XXXXX_Nonexistent-1920w.webp',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/zzz_totally_fake_url-1920w.webp',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/42_R_MightGuy_DOES_NOT_EXIST-1920w.webp',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/200_Legendary_FAKE-1920w.webp',
];

// ─── HEAD check (same as brute14) ──────────────────────────────────────────
function headCheck(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', agent, timeout: TIMEOUT_MS }, (res) => {
      const len = parseInt(res.headers['content-length'] || '0', 10);
      const ct = res.headers['content-type'] || '';
      res.resume();
      resolve({ status: res.statusCode, size: len, contentType: ct });
    });
    req.on('error', (err) => resolve({ status: 0, size: 0, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, size: 0, error: 'TIMEOUT' }); });
    req.end();
  });
}

// ─── Also test with GET (download first few bytes) ─────────────────────────
function getCheck(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { agent, timeout: TIMEOUT_MS }, (res) => {
      let bytes = 0;
      const ct = res.headers['content-type'] || '';
      const cl = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 1000) res.destroy(); // just need a taste
      });
      res.on('end', () => resolve({ status: res.statusCode, size: cl, bytes, contentType: ct }));
      res.on('close', () => resolve({ status: res.statusCode, size: cl, bytes, contentType: ct }));
    });
    req.on('error', (err) => resolve({ status: 0, size: 0, bytes: 0, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, size: 0, bytes: 0, error: 'TIMEOUT' }); });
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(C.bold + C.cyan + '\n  BRUTE14.5 DIAGNOSTIC — CDN Connectivity Test\n' + C.reset);
  console.log(C.dim + `  Good URLs to test: ${goodUrls.length}` + C.reset);
  console.log(C.dim + `  Fake URLs to test: ${fakeUrls.length}` + C.reset);
  console.log();

  let passCount = 0;
  let failCount = 0;

  // ── Test good URLs (should all be found) ─────────────────────────────────
  console.log(C.bold + '  === KNOWN GOOD URLs (expect: 200 + size >= 4000) ===' + C.reset);
  console.log();

  for (let i = 0; i < goodUrls.length; i++) {
    const url = goodUrls[i];
    const filename = url.split('/').pop();
    const headRes = await headCheck(url);
    const found = headRes.status === 200 && headRes.size >= MIN_FILE_SIZE;

    if (found) {
      const sizeKB = (headRes.size / 1024).toFixed(1);
      console.log(`  ${C.green}PASS${C.reset} [${String(i+1).padStart(3)}/${goodUrls.length}] ${C.dim}${sizeKB.padStart(7)}KB${C.reset}  ${filename}`);
      passCount++;
    } else {
      // Also try GET to see what's really going on
      const getRes = await getCheck(url);
      console.log(`  ${C.red}FAIL${C.reset} [${String(i+1).padStart(3)}/${goodUrls.length}]  ${filename}`);
      console.log(`        ${C.dim}HEAD: status=${headRes.status} size=${headRes.size} ct=${headRes.contentType}${headRes.error ? ' err=' + headRes.error : ''}${C.reset}`);
      console.log(`        ${C.dim} GET: status=${getRes.status} size=${getRes.size} bytes=${getRes.bytes} ct=${getRes.contentType}${getRes.error ? ' err=' + getRes.error : ''}${C.reset}`);
      failCount++;
    }
  }

  console.log();
  console.log(C.bold + '  === FAKE URLs (expect: NOT found) ===' + C.reset);
  console.log();

  // ── Test fake URLs (should all fail) ─────────────────────────────────────
  for (let i = 0; i < fakeUrls.length; i++) {
    const url = fakeUrls[i];
    const filename = url.split('/').pop();
    const headRes = await headCheck(url);
    const found = headRes.status === 200 && headRes.size >= MIN_FILE_SIZE;

    if (!found) {
      console.log(`  ${C.green}PASS${C.reset} [${String(i+1).padStart(2)}/${fakeUrls.length}] correctly rejected  ${C.dim}status=${headRes.status} size=${headRes.size}${C.reset}  ${filename}`);
      passCount++;
    } else {
      console.log(`  ${C.red}FAIL${C.reset} [${String(i+1).padStart(2)}/${fakeUrls.length}] FALSE POSITIVE!     ${C.dim}status=${headRes.status} size=${headRes.size}${C.reset}  ${filename}`);
      failCount++;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log();
  console.log(C.bold + '  === SUMMARY ===' + C.reset);
  console.log(`  ${C.green}PASS: ${passCount}${C.reset}    ${failCount > 0 ? C.red : C.dim}FAIL: ${failCount}${C.reset}`);
  console.log();

  if (failCount === 0) {
    console.log(C.bold + C.green + '  ALL TESTS PASSED — HEAD check logic works correctly!' + C.reset);
    console.log(C.dim + '  The brute force scripts should be able to detect valid images.\n' + C.reset);
  } else {
    console.log(C.bold + C.red + '  SOME TESTS FAILED — there may be a connectivity or CDN issue.' + C.reset);
    console.log(C.yellow + '  Check if the CDN blocks HEAD requests or requires specific headers.\n' + C.reset);

    // Extra: test one good URL with different methods
    console.log(C.bold + '  === EXTRA: Testing first good URL with different approaches ===' + C.reset);
    const testUrl = goodUrls[0];
    console.log(C.dim + `  URL: ${testUrl}\n` + C.reset);

    // Raw GET
    const getRes = await getCheck(testUrl);
    console.log(`  GET:  status=${getRes.status} content-length=${getRes.size} received=${getRes.bytes} ct=${getRes.contentType}`);

    // HEAD with different headers
    const headRes2 = await new Promise((resolve) => {
      const req = https.request(testUrl, {
        method: 'HEAD',
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/webp,image/*,*/*',
        },
      }, (res) => {
        const len = parseInt(res.headers['content-length'] || '0', 10);
        res.resume();
        resolve({ status: res.statusCode, size: len, headers: res.headers });
      });
      req.on('error', (err) => resolve({ status: 0, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'TIMEOUT' }); });
      req.end();
    });
    console.log(`  HEAD (with UA): status=${headRes2.status} size=${headRes2.size}`);
    if (headRes2.headers) {
      console.log(C.dim + `  Response headers: ${JSON.stringify(headRes2.headers, null, 2)}` + C.reset);
    }
    console.log();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
