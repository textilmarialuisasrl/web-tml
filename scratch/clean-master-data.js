const fs = require('fs');
const path = require('path');

const inputPath = path.resolve(__dirname, 'master_data_text.txt');
const outputPath = path.resolve(__dirname, 'master_data_clean.txt');

if (!fs.existsSync(inputPath)) {
  console.error("Input file not found.");
  process.exit(1);
}

const content = fs.readFileSync(inputPath, 'utf8');

// Strip all XML tags
let cleaned = content.replace(/<[^>]+>/g, '');

// Clean up multiple spaces and empty lines
cleaned = cleaned.split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)
  .join('\n');

fs.writeFileSync(outputPath, cleaned, 'utf8');
console.log("Cleaned master data successfully to scratch/master_data_clean.txt");
