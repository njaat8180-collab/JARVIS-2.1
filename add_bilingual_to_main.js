const fs = require('fs');

// Read the original main.js.backup
const originalContent = fs.readFileSync('main.js.backup', 'utf8');

// Find the place to insert bilingual integration (after ConsciousnessLayer import)
const lines = originalContent.split('\n');
const modifiedLines = [];

for (let i = 0; i < lines.length; i++) {
    modifiedLines.push(lines[i]);
    
    // After the ConsciousnessLayer import, add bilingual integration
    if (lines[i].includes('const { ConsciousnessLayer } = require("./src/ai/consciousness");')) {
        modifiedLines.push('const { BilingualIntegration } = require("./BILINGUAL_INTEGRATION");');
        modifiedLines.push('');
        modifiedLines.push('/* Bilingual consciousness integration */');
        modifiedLines.push('let bilingualIntegration = null;');
    }
    
    // After app.whenReady().then(() => {, add bilingual initialization
    if (lines[i].includes('app.whenReady().then(() => {')) {
        // Look for the opening brace and add initialization after it
        let braceCount = 0;
        for (let j = i; j < lines.length; j++) {
            modifiedLines.push(lines[j]);
            if (lines[j].includes('{')) braceCount++;
            if (lines[j].includes('}')) braceCount--;
            
            // After the opening brace and some initial setup
            if (braceCount === 1 && lines[j].includes('log(')) {
                modifiedLines.push('');
                modifiedLines.push('/* Initialize bilingual consciousness */');
                modifiedLines.push('bilingualIntegration = new BilingualIntegration(app);');
                modifiedLines.push('bilingualIntegration.initialize().then(success => {');
                modifiedLines.push('    if (success) {');
                modifiedLines.push('        bilingualIntegration.registerIPCHandlers(ipcMain);');
                modifiedLines.push('    }');
                modifiedLines.push('});');
                modifiedLines.push('');
                break;
            }
        }
        // Skip the lines we already processed
        i = modifiedLines.length - 1;
        continue;
    }
    
    // Add shutdown handler before app.quit
    if (lines[i].includes('app.on("before-quit"')) {
        modifiedLines.push('    if (bilingualIntegration) {');
        modifiedLines.push('        bilingualIntegration.shutdown();');
        modifiedLines.push('    }');
    }
}

// Write the modified content
fs.writeFileSync('main.js', modifiedLines.join('\n'));
console.log('Bilingual integration added to main.js successfully');