const path = require('path');
const { existsSync } = require('fs');

const DB_ROOT = path.join(process.cwd(), 'image-pipeline', 'dasaram_diagram_db');
const filepath = 'images\\science\\밀착문제_비상교육_(Ⅰ-2.자연의 구성 물질)\\BIN0002_enhanced.png';

const normalized = path.normalize(filepath.replace(/\\/g, '/')).replace(/\.\./g, '');
const absPath = path.join(DB_ROOT, normalized);

console.log('DB_ROOT:', DB_ROOT);
console.log('filepath:', filepath);
console.log('normalized:', normalized);
console.log('absPath:', absPath);
console.log('exists:', existsSync(absPath));
console.log('startsWith:', absPath.startsWith(DB_ROOT));
