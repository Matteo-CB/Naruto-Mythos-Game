
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function seed() {
  const prisma = new PrismaClient();
  
  try {
    // Check if backgrounds already exist
    const count = await prisma.gameBackground.count();
    if (count > 0) {
      console.log('Backgrounds already seeded (' + count + ' found). Skipping.');
      return;
    }

    const bgDir = path.join(__dirname, '..', 'public', 'images', 'backgrounds');
    const files = fs.readdirSync(bgDir).filter(f => f.endsWith('.webp')).sort();
    
    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      const name = filename.replace('.webp', '').replace(/-/g, ' ').replace(/_/g, ' ');
      const filePath = path.join(bgDir, filename);
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      const dataUrl = 'data:image/webp;base64,' + base64;
      
      await prisma.gameBackground.create({
        data: {
          name,
          url: dataUrl,
          sortOrder: i,
        },
      });
      console.log('Seeded: ' + name);
    }
    
    console.log('Done! Seeded ' + files.length + ' backgrounds.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
