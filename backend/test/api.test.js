'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { abrirBanco } = require('../src/db');
const { criarApp } = require('../src/app');

let servidor;
let base;

before(async () => {
  const db = abrirBanco(':memory:');
  servidor = criarApp(db).listen(0);
  await new Promise((resolve) => servidor.once('listening', resolve));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

// Cliente HTTP simples que guarda o cookie de sessão.
function cliente() {
  let cookie = '';
  return async (metodo, rota, corpo) => {
    const resp = await fetch(base + rota, {
      method: metodo,
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const setCookie = resp.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const texto = await resp.text();
    return { status: resp.status, corpo: texto ? JSON.parse(texto) : null, headers: resp.headers };
  };
}

async function logado(usuario, senha) {
  const api = cliente();
  const r = await api('POST', '/api/auth/login', { usuario, senha });
  assert.equal(r.status, 200);
  return api;
}

test('login rejeita credenciais inválidas e API exige autenticação', async () => {
  const api = cliente();
  assert.equal((await api('POST', '/api/auth/login', { usuario: 'maria', senha: 'errada' })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', {})).status, 400);
  assert.equal((await api('GET', '/api/solicitacoes')).status, 401);
  assert.equal((await api('GET', '/api/auth/me')).status, 401);
});

test('página principal redireciona para login sem sessão', async () => {
  const resp = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(resp.status, 302);
  assert.equal(resp.headers.get('location'), '/login.html');
});

test('login, sessão e logout', async () => {
  const api = await logado('maria', 'senha123');
  const me = await api('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.corpo.usuario, 'maria');
  assert.equal(me.corpo.senha_hash, undefined);

  assert.equal((await api('POST', '/api/auth/logout')).status, 204);
  assert.equal((await api('GET', '/api/auth/me')).status, 401);
});

test('CRUD de solicitação aberta com campos automáticos', async () => {
  const api = await logado('maria', 'senha123');
  const categorias = (await api('GET', '/api/categorias')).corpo;
  assert.deepEqual(categorias.map((c) => c.nome).sort(),
    ['Compras', 'Financeiro', 'Infraestrutura', 'RH', 'TI']);
  const ti = categorias.find((c) => c.nome === 'TI');

  const invalida = await api('POST', '/api/solicitacoes', { titulo: '', descricao: '', categoria_id: 999 });
  assert.equal(invalida.status, 400);

  const criada = await api('POST', '/api/solicitacoes', {
    titulo: 'Notebook não liga', descricao: 'Não liga desde ontem.', categoria_id: ti.id,
    status: 'CONCLUIDO', usuario_id: 999,
  });
  assert.equal(criada.status, 201);
  assert.equal(criada.corpo.status, 'ABERTO');
  assert.equal(criada.corpo.solicitante_usuario, 'maria');
  assert.ok(criada.corpo.criado_em);

  const id = criada.corpo.id;
  const editada = await api('PUT', `/api/solicitacoes/${id}`, {
    titulo: 'Notebook não liga (urgente)', descricao: 'Não liga desde ontem.', categoria_id: ti.id,
  });
  assert.equal(editada.status, 200);
  assert.equal(editada.corpo.titulo, 'Notebook não liga (urgente)');

  const detalhe = await api('GET', `/api/solicitacoes/${id}`);
  assert.deepEqual(detalhe.corpo.historico.map((h) => h.acao), ['CRIACAO', 'EDICAO']);

  assert.equal((await api('DELETE', `/api/solicitacoes/${id}`)).status, 204);
  assert.equal((await api('GET', `/api/solicitacoes/${id}`)).status, 404);
});

test('isolamento entre usuários e regras de status', async () => {
  const maria = await logado('maria', 'senha123');
  const joao = await logado('joao', 'senha123');
  const admin = await logado('admin', 'admin123');

  const { corpo: s } = await maria('POST', '/api/solicitacoes', {
    titulo: 'Reembolso', descricao: 'Reembolso de viagem.', categoria_id: 4,
  });

  // João não vê nem altera a solicitação da Maria.
  assert.equal((await joao('GET', `/api/solicitacoes/${s.id}`)).status, 404);
  assert.equal((await joao('DELETE', `/api/solicitacoes/${s.id}`)).status, 404);
  assert.ok(!(await joao('GET', '/api/solicitacoes')).corpo.some((x) => x.id === s.id));

  // Somente atendente altera status, respeitando o fluxo.
  assert.equal((await maria('PATCH', `/api/solicitacoes/${s.id}/status`, { status: 'EM_ANDAMENTO' })).status, 403);
  assert.equal((await admin('PATCH', `/api/solicitacoes/${s.id}/status`, { status: 'CONCLUIDO' })).status, 409);
  assert.equal((await admin('PATCH', `/api/solicitacoes/${s.id}/status`, {
    status: 'EM_ANDAMENTO', comentario: 'Em análise',
  })).status, 200);

  // Fora do status Aberto não pode mais editar/excluir.
  assert.equal((await maria('PUT', `/api/solicitacoes/${s.id}`, {
    titulo: 'x', descricao: 'y', categoria_id: 4,
  })).status, 409);
  assert.equal((await maria('DELETE', `/api/solicitacoes/${s.id}`)).status, 409);

  const concluida = await admin('PATCH', `/api/solicitacoes/${s.id}/status`, { status: 'CONCLUIDO' });
  assert.equal(concluida.corpo.status, 'CONCLUIDO');
  assert.ok(concluida.corpo.concluido_em);

  const detalhe = await maria('GET', `/api/solicitacoes/${s.id}`);
  assert.deepEqual(detalhe.corpo.historico.map((h) => h.status_novo), ['ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO']);
});
