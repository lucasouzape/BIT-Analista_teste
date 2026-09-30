'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATABASE_DIR = path.resolve(__dirname, '..', '..', 'database');

function abrirBanco(arquivo) {
  if (arquivo !== ':memory:') {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  }
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(DATABASE_DIR, 'schema.sql'), 'utf8'));

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
  if (total === 0) {
    db.exec(fs.readFileSync(path.join(DATABASE_DIR, 'seed.sql'), 'utf8'));
  }
  return db;
}

// Executa fn dentro de uma transação, fazendo rollback em caso de erro.
function transacao(db, fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { abrirBanco, transacao };
