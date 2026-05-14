const fs = require('fs');
const path = require('path');
const { createSampleDb } = require('./sample-data');

const dbPath = path.join(__dirname, '..', 'crm-data.json');
fs.writeFileSync(dbPath, JSON.stringify(createSampleDb(), null, 2), 'utf8');
console.log('Datos locales de prueba generados en crm-data.json');
