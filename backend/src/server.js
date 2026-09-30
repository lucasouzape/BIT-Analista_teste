'use strict';

const path = require('node:path');
const { abrirBanco } = require('./db');
const { criarApp } = require('./app');
const { limparSessoesExpiradas } = require('./auth');

const PORT = Number(process.env.PORT || 3000);
const DB_FILE = process.env.DB_FILE || path.resolve(__dirname, '..', 'data', 'portal.db');

const db = abrirBanco(DB_FILE);
limparSessoesExpiradas(db);
setInterval(() => limparSessoesExpiradas(db), 60 * 60 * 1000).unref();

criarApp(db).listen(PORT, () => {
  console.log(`Portal de Solicitações Internas rodando em http://localhost:${PORT}`);
  console.log(`Banco de dados: ${DB_FILE}`);
});
