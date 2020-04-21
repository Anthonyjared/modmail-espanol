// Verify NodeJS version
const nodeMajorVersion = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajorVersion < 10) {
  console.error('Versión de NodeJS no soportada! Por favor instala NodeJS 10 o superior.');
  process.exit(1);
}

// Verify node modules have been installed
const fs = require('fs');
const path = require('path');

try {
  fs.accessSync(path.join(__dirname, '..', 'node_modules'));
} catch (e) {
  console.error('Por favor, ejecuta "npm install" antes de iniciar el BOT');
  process.exit(1);
}

// Error handling
process.on('uncaughtException', err => {
  // Unknown message types (nitro boosting messages at the time) should be safe to ignore
  if (err && err.message && err.message.startsWith('Unhandled MESSAGE_CREATE type')) {
    return;
  }

  // For everything else, crash with the error
  console.error(err);
  process.exit(1);
});

let testedPackage = '';
try {
  const packageJson = require('../package.json');
  const modules = Object.keys(packageJson.dependencies);
  modules.forEach(mod => {
    testedPackage = mod;
    fs.accessSync(path.join(__dirname, '..', 'node_modules', mod))
  });
} catch (e) {
  console.error(`Por favor, ejecuta "npm install" de nuevo! El paquete "${testedPackage}" falta.`);
  process.exit(1);
}

const config = require('./config');
const utils = require('./utils');
const main = require('./main');
const knex = require('./knex');
const legacyMigrator = require('./legacy/legacyMigrator');

// Force crash on unhandled rejections (use something like forever/pm2 to restart)
process.on('unhandledRejection', err => {
  if (err instanceof utils.BotError || (err && err.code)) {
    // We ignore stack traces for BotErrors (the message has enough info) and network errors from Eris (their stack traces are unreadably long)
    console.error(`Error: ${err.message}`);
  } else {
    console.error(err);
  }

  process.exit(1);
});

(async function() {
  // Make sure the database is up to date
  await knex.migrate.latest();

  // Migrate legacy data if we need to
  if (await legacyMigrator.shouldMigrate()) {
    console.log('=== Migrando datos hereditarios ===');
    console.log('No cierres el BOT!');
    console.log('');

    await legacyMigrator.migrate();

    const relativeDbDir = (path.isAbsolute(config.dbDir) ? config.dbDir : path.resolve(process.cwd(), config.dbDir));
    const relativeLogDir = (path.isAbsolute(config.logDir) ? config.logDir : path.resolve(process.cwd(), config.logDir));

    console.log('');
    console.log('=== Migración de datos hereditarios completada ===');
    console.log('');
    console.log('IMPORTANTE: Lugo de un reinicio del BOT, verifica que todo está correctamente funcionando.');
    console.log('Una vez hecho esto, los siguientes archivos/directorios ya no son necesarios. Sin embargo, recomendaría mantener una copia de seguridad de ellos.');
    console.log('');
    console.log('ARCHIVO: ' + path.resolve(relativeDbDir, 'threads.json'));
    console.log('ARCHIVO: ' + path.resolve(relativeDbDir, 'blocked.json'));
    console.log('ARCHIVO: ' + path.resolve(relativeDbDir, 'snippets.json'));
    console.log('DIRECTORIO: ' + relativeLogDir);
    console.log('');
    console.log('Iniciando el BOT...');
  }

  // Start the bot
  main.start();
})();
