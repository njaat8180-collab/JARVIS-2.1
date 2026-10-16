const fs = require('fs');

const content = fs.readFileSync('main.js', 'utf8');
const uncommented = content.replace(/^\/\/\s*/gm, '');
fs.writeFileSync('main.js', uncommented);
console.log('File uncommented successfully');