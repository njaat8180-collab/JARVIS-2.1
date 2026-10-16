const fs = require('fs');

// Read the backup file
const backupContent = fs.readFileSync('main.js.backup', 'utf8');

// Split by the duplicate part and keep only the first half
const lines = backupContent.split('\n');
const cleanLines = [];

let inDuplicateSection = false;
let seenAppDeclaration = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if we're hitting the duplicate section
    if (line.includes('MAIN.JS V14.1.1 — PART 5/5 END')) {
        inDuplicateSection = true;
        continue;
    }
    
    // Skip lines in duplicate section
    if (inDuplicateSection) {
        if (line.includes('app.whenReady()')) {
            // Found the start of the actual code we want to keep
            inDuplicateSection = false;
            cleanLines.push(line);
        }
        continue;
    }
    
    // Skip duplicate app declarations
    if (line.includes('const { app,') && seenAppDeclaration) {
        continue;
    }
    
    if (line.includes('const { app,')) {
        seenAppDeclaration = true;
    }
    
    cleanLines.push(line);
}

// Write the cleaned content
fs.writeFileSync('main.js', cleanLines.join('\n'));
console.log('Clean main.js created successfully');