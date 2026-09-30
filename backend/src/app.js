'use strict';

const path = require('node:path');
const express = require('express');
const rotasAuth = require('./routes/auth');
const { rotasSolicitacoes, TRANSICOES } = require('./routes/solicitacoes');
const { exigirAutenticacao, usuarioDaSessao } = require('./auth');

const FRONTEND_DIR = path.resolve(__dirname, '..', '..', 'frontend');

function criarApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });

  // ---------------- API ----------------
  app.use('/api/auth', rotasAuth(db));

  const autenticado = exigirAutenticacao(db);

  app.get('/api/categorias', autenticado, (req, res) => {
    res.json(db.prepare('SELECT id, nome FROM categorias WHERE ativo = 1 ORDER BY nome').all());
  });

  app.get('/api/status/transicoes', autenticado, (req, res) => res.json(TRANSICOES));

  app.use('/api/solicitacoes', autenticado, rotasSolicitacoes(db));

  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

  // ---------------- Frontend ----------------
  // A página principal só é entregue a usuários autenticados.
  app.get(['/', '/index.html'], (req, res) => {
    if (!usuarioDaSessao(db, req)) return res.redirect('/login.html');
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });
  app.get('/login.html', (req, res) => {
    if (usuarioDaSessao(db, req)) return res.redirect('/');
    res.sendFile(path.join(FRONTEND_DIR, 'login.html'));
  });
  app.use(express.static(FRONTEND_DIR, { index: false }));

  // Tratador de erros genérico: não expõe detalhes internos ao cliente.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ erro: 'JSON inválido.' });
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro interno no servidor.' });
  });

  return app;
}

module.exports = { criarApp };
