const fs = require('fs');
const path = require('path');

const xmlPath = path.resolve(__dirname, 'master_data_extracted/word/document.xml');
if (!fs.existsSync(xmlPath)) {
  console.error("document.xml not found at", xmlPath);
  process.exit(1);
}

const xml = fs.readFileSync(xmlPath, 'utf8');

// Match all text inside <w:t>...</w:t> tags
const matches = xml.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
if (!matches) {
  console.log("No text nodes found.");
  process.exit(0);
}

let text = '';
for (const match of matches) {
  const clean = match.replace(/<w:t[^>]*>/, '').replace('</w:t>', '');
  text += clean + ' ';
}

// Format a bit to be more readable
// In docx, paragraphs are separated by </w:p>
const paragraphs = xml.split('</w:p>');
let output = '';
for (const p of paragraphs) {
  const tMatches = p.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
  if (tMatches) {
    let line = '';
    for (const tm of tMatches) {
      line += tm.replace(/<w:t[^>]*>/, '').replace('</w:t>', '');
    }
    output += line.trim() + '\n';
  }
}

fs.writeFileSync(path.resolve(__dirname, 'master_data_text.txt'), output, 'utf8');
console.log("Extracted text successfully to scratch/master_data_text.txt");
