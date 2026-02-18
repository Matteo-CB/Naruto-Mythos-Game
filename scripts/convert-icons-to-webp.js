const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function convertToWebP(inputPath, outputPath) {
  const inputStats = fs.statSync(inputPath);
  await sharp(inputPath)
    .webp({ quality: 85 })
    .toFile(outputPath);
  const outputStats = fs.statSync(outputPath);
  
  const savings = ((1 - outputStats.size / inputStats.size) * 100).toFixed(1);
  return {
    input: path.basename(inputPath),
    output: path.basename(outputPath),
    inputSize: inputStats.size,
    outputSize: outputStats.size,
    savings: savings
  };
}

async function main() {
  const results = [];
  let totalInputSize = 0;
  let totalOutputSize = 0;

  const iconsDir = path.join(process.cwd(), 'public', 'images', 'icons');
  const iconFiles = fs.readdirSync(iconsDir).filter(f => f.endsWith('.png'));
  
  console.log('Found ' + iconFiles.length + ' PNG files in public/images/icons/');
  console.log('');

  for (const file of iconFiles) {
    const inputPath = path.join(iconsDir, file);
    const outputPath = path.join(iconsDir, file.replace('.png', '.webp'));
    try {
      const result = await convertToWebP(inputPath, outputPath);
      results.push(result);
      totalInputSize += result.inputSize;
      totalOutputSize += result.outputSize;
      console.log('  ' + result.input + ' (' + (result.inputSize / 1024).toFixed(1) + ' KB) -> ' + result.output + ' (' + (result.outputSize / 1024).toFixed(1) + ' KB) | ' + result.savings + '% savings');
    } catch (err) {
      console.log('  FAILED: ' + file + ' - ' + err.message);
    }
  }

  const cardBackInput = path.join(process.cwd(), 'public', 'images', 'card-back.png');
  const cardBackOutput = path.join(process.cwd(), 'public', 'images', 'card-back.webp');
  
  console.log('');
  console.log('Converting card-back.png...');
  
  try {
    const result = await convertToWebP(cardBackInput, cardBackOutput);
    results.push(result);
    totalInputSize += result.inputSize;
    totalOutputSize += result.outputSize;
    console.log('  ' + result.input + ' (' + (result.inputSize / 1024).toFixed(1) + ' KB) -> ' + result.output + ' (' + (result.outputSize / 1024).toFixed(1) + ' KB) | ' + result.savings + '% savings');
  } catch (err) {
    console.log('  FAILED: card-back.png - ' + err.message);
  }

  console.log('');
  console.log('=== SUMMARY ===');
  console.log('Files converted: ' + results.length);
  console.log('Total input size:  ' + (totalInputSize / 1024).toFixed(1) + ' KB');
  console.log('Total output size: ' + (totalOutputSize / 1024).toFixed(1) + ' KB');
  console.log('Total savings:     ' + ((1 - totalOutputSize / totalInputSize) * 100).toFixed(1) + '% (' + ((totalInputSize - totalOutputSize) / 1024).toFixed(1) + ' KB saved)');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
