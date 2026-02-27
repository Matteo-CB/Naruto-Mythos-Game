const fs = require('fs');
const path = require('path');

function findHandlerFiles(dir) {
  const results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...findHandlerFiles(full));
    } else if (item.name.endsWith('.ts') && item.name !== 'index.ts') {
      results.push(full);
    }
  }
  return results;
}

const handlersDir = path.join(__dirname, '..', 'lib', 'effects', 'handlers');
const files = findHandlerFiles(handlersDir);

console.log('========================================');
console.log('NO-OP HANDLER CHECK');
console.log('========================================');
console.log('');

const noopHandlers = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const basename = path.basename(file);

  // Find all handler functions in the file
  // Pattern: registerEffect('KS-XXX', 'TYPE', async/function handler)
  // Then check if the handler body just returns { state: ctx.state } or similar no-op

  // Extract all registerEffect blocks
  const registerRegex = /registerEffect\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*(async\s*)?\(\s*ctx\s*\)\s*=>\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs;

  // Simpler approach: look for patterns that indicate no-op
  // Pattern 1: return { state: ctx.state } with only log statements before
  // Pattern 2: handler that has no state modifications

  const handlerBlocks = [];
  const blockRegex = /registerEffect\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"][\s\S]*?(?=registerEffect|export\s+function\s+register|$)/g;

  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    handlerBlocks.push({
      cardId: match[1],
      effectType: match[2],
      body: match[0]
    });
  }

  for (const block of handlerBlocks) {
    const body = block.body;
    // Check for obvious no-ops: only contains console.log/warn and return { state: ctx.state }
    // Remove comments and whitespace for analysis
    const stripped = body
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/console\.\w+\([^)]*\);?/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Check if it just returns ctx.state without modifications
    const isNoOp = (
      stripped.includes('return { state: ctx.state }') &&
      !stripped.includes('ctx.state.') &&
      !stripped.includes('newState') &&
      !stripped.includes('...ctx.state') &&
      !stripped.includes('structuredClone') &&
      !stripped.includes('JSON.parse') &&
      !stripped.includes('findMission') &&
      !stripped.includes('findCharacter') &&
      !stripped.includes('splice') &&
      !stripped.includes('push') &&
      !stripped.includes('filter') &&
      !stripped.includes('map(') &&
      !stripped.includes('powerTokens') &&
      !stripped.includes('chakra') &&
      !stripped.includes('hand') &&
      !stripped.includes('deck')
    );

    if (isNoOp) {
      noopHandlers.push({
        cardId: block.cardId,
        effectType: block.effectType,
        file: basename
      });
    }
  }
}

if (noopHandlers.length === 0) {
  console.log('No obvious no-op handlers found with simple pattern matching.');
} else {
  for (const h of noopHandlers) {
    console.log(h.cardId + ' ' + h.effectType + ' [' + h.file + '] - APPEARS TO BE NO-OP');
  }
  console.log('');
  console.log('Total potential no-ops: ' + noopHandlers.length);
}
