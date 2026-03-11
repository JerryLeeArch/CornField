import path from 'node:path';
import { getSetting, setSetting } from './db.js';
import { scanLibrary } from './media-indexer.js';

const inputRoot = process.argv[2];
const libraryRoot = inputRoot ? path.resolve(inputRoot) : getSetting('libraryRoot');

if (!libraryRoot) {
  console.error('Cannot locate library root. Usage: npm run scan -- /absolute/path/to/videos');
  process.exit(1);
}

if (inputRoot) {
  setSetting('libraryRoot', libraryRoot);
}

scanLibrary(libraryRoot)
  .then((result) => {
    console.log(`Scanned ${result.scannedCount} files at ${result.scannedAt}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
