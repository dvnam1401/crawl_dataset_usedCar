const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

for (const [key, value] of Object.entries(pkg.scripts)) {
    if (value.startsWith('ts-node src/')) {
        pkg.scripts[key] = value.replace('ts-node src/', 'node dist/').replace('.ts', '.js');
    }
}

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2), 'utf8');
console.log('✅ package.json updated for production!');
