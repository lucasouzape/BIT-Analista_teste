'use strict';

const ROTULOS_STATUS = {
  ABERTO: 'Aberto',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};
const ROTULOS_ACAO = { CRIACAO: 'Criada', EDICAO: 'Editada', STATUS: 'Status alterado' };

const estado = { usuario: null, categorias: [], transicoes: {}, solicitacoes: [], editandoId: null, detalheId: null };
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- utilidades

async function api(metodo, rota, corpo) {
  const resp = await fetch(rota, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (resp.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Sessão expirada.');
  }
  const dados = resp.status === 204 ? null : await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(dados?.erro || `Erro ${resp.status}`);
  return dados;
}

// Datas do SQLite estão em UTC no formato "AAAA-MM-DD HH:MM:SS".
function formatarData(valor) {
  if (!valor) return '—';
  return new Date(valor.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', {
    dateStyle: 'short', timeStyle: 'short',
  });
}

function el(tag, props = {}, ...filhos) {
  const elemento = document.createElement(tag);
  Object.assign(elemento, props);
  for (const filho of filhos) if (filho != null) elemento.append(filho);
  return elemento;
}

function selo(status) {
  return el('span', { className: `selo selo-${status.toLowerCase()}`, textContent: ROTULOS_STATUS[status] });
}

function avisar(mensagem, tipo = 'ok') {
  const aviso = $('aviso');
  aviso.textContent = mensagem;
  aviso.className = `aviso aviso-${tipo}`;
  aviso.hidden = false;
  clearTimeout(avisar.timer);
  avisar.timer = setTimeout(() => { aviso.hidden = true; }, 3500);
}

const ehAtendente = () => estado.usuario?.perfil === 'ATENDENTE';
const podeAlterar = (s) => s.status === 'ABERTO' && s.usuario_id === estado.usuario.id;

// ---------------------------------------------------------------- listagem

async function carregarLista() {
  const params = new URLSearchParams();
  if ($('filtro-busca').value.trim()) params.set('busca', $('filtro-busca').value.trim());
  if ($('filtro-status').value) params.set('status', $('filtro-status').value);
  if ($('filtro-categoria').value) params.set('categoria_id', $('filtro-categoria').value);

  estado.solicitacoes = await api('GET', `/api/solicitacoes?${params}`);
  renderizarLista();
}

function renderizarResumo(todas) {
  const resumo = $('resumo');
  resumo.replaceChildren(...Object.keys(ROTULOS_STATUS).map((status) =>
    el('div', { className: `card-resumo borda-${status.toLowerCase()}` },
      el('span', { className: 'numero', textContent: todas.filter((s) => s.status === status).length }),
      el('span', { textContent: ROTULOS_STATUS[status] }))));
}

function renderizarLista() {
  const corpo = $('lista');
  corpo.replaceChildren(...estado.solicitacoes.map((s) => {
    const acoes = el('td', { className: 'acoes' },
      el('button', { className: 'btn pequeno', textContent: 'Ver', onclick: () => abrirDetalhe(s.id) }));
    if (podeAlterar(s)) {
      acoes.append(
        el('button', { className: 'btn pequeno', textContent: 'Editar', onclick: () => abrirFormulario(s) }),
        el('button', { className: 'btn pequeno perigo', textContent: 'Excluir', onclick: () => excluir(s) }));
    }
    return el('tr', {},
      el('td', { textContent: s.id }),
      el('td', { textContent: s.titulo }),
      el('td', { textContent: s.categoria }),
      el('td', { className: 'col-solicitante', textContent: s.solicitante }),
      el('td', {}, selo(s.status)),
      el('td', { textContent: formatarData(s.criado_em) }),
      acoes);
  }));
  $('vazio').hidden = estado.solicitacoes.length > 0;
}

async function atualizarTudo() {
  const [todas] = await Promise.all([api('GET', '/api/solicitacoes'), carregarLista()]);
  renderizarResumo(todas);
}

// ---------------------------------------------------------------- formulário

function abrirFormulario(solicitacao = null) {
  estado.editandoId = solicitacao?.id ?? null;
  $('form-titulo').textContent = solicitacao ? `Editar solicitação #${solicitacao.id}` : 'Nova solicitação';
  $('f-titulo').value = solicitacao?.titulo ?? '';
  $('f-descricao').value = solicitacao?.descricao ?? '';
  $('f-categoria').value = solicitacao?.categoria_id ?? '';
  $('erro-form').hidden = true;
  $('dlg-form').showModal();
}

async function salvar(evento) {
  evento.preventDefault();
  const dados = {
    titulo: $('f-titulo').value.trim(),
    descricao: $('f-descricao').value.trim(),
    categoria_id: Number($('f-categoria').value),
  };
  const erro = $('erro-form');
  if (!dados.titulo || !dados.descricao || !dados.categoria_id) {
    erro.textContent = 'Preencha título, categoria e descrição.';
    erro.hidden = false;
    return;
  }
  try {
    if (estado.editandoId) {
      await api('PUT', `/api/solicitacoes/${estado.editandoId}`, dados);
      avisar('Solicitação atualizada.');
    } else {
      const criada = await api('POST', '/api/solicitacoes', dados);
      avisar(`Solicitação #${criada.id} criada.`);
    }
    $('dlg-form').close();
    await atualizarTudo();
  } catch (e) {
    erro.textContent = e.message;
    erro.hidden = false;
  }
}

async function excluir(s) {
  if (!confirm(`Excluir a solicitação #${s.id} - "${s.titulo}"?`)) return;
  try {
    await api('DELETE', `/api/solicitacoes/${s.id}`);
    avisar('Solicitação excluída.');
    await atualizarTudo();
  } catch (e) {
    avisar(e.message, 'erro');
  }
}

// ---------------------------------------------------------------- detalhe

async function abrirDetalhe(id) {
  let s;
  try {
    s = await api('GET', `/api/solicitacoes/${id}`);
  } catch (e) {
    return avisar(e.message, 'erro');
  }
  estado.detalheId = id;

  const campo = (rotulo, valor) => el('div', { className: 'campo' },
    el('span', { className: 'rotulo', textContent: rotulo }),
    typeof valor === 'string' ? el('span', { textContent: valor }) : valor);

  const historico = el('ol', { className: 'linha-tempo' }, ...s.historico.map((h) => el('li', {},
    el('strong', { textContent: ROTULOS_ACAO[h.acao] }),
    h.acao === 'STATUS' ? `: ${ROTULOS_STATUS[h.status_anterior]} → ${ROTULOS_STATUS[h.status_novo]}` : '',
    el('div', { className: 'meta', textContent: `${formatarData(h.criado_em)} · ${h.usuario}` }),
    h.comentario ? el('div', { className: 'comentario', textContent: h.comentario }) : null)));

  $('detalhe-conteudo').replaceChildren(
    el('h2', { textContent: `#${s.id} · ${s.titulo}` }),
    el('div', { className: 'grade' },
      campo('Status', selo(s.status)),
      campo('Categoria', s.categoria),
      campo('Solicitante', s.solicitante),
      campo('Criada em', formatarData(s.criado_em)),
      campo('Atualizada em', formatarData(s.atualizado_em)),
      campo('Concluída em', formatarData(s.concluido_em))),
    el('p', { className: 'descricao', textContent: s.descricao }),
    el('h3', { textContent: 'Acompanhamento' }),
    historico);

  const proximos = estado.transicoes[s.status] || [];
  const formStatus = $('form-status');
  formStatus.hidden = !(ehAtendente() && proximos.length);
  $('s-status').replaceChildren(...proximos.map((st) => el('option', { value: st, textContent: ROTULOS_STATUS[st] })));
  $('s-comentario').value = '';
  $('erro-status').hidden = true;

  const dlg = $('dlg-detalhe');
  if (!dlg.open) dlg.showModal();
}

async function alterarStatus(evento) {
  evento.preventDefault();
  try {
    await api('PATCH', `/api/solicitacoes/${estado.detalheId}/status`, {
      status: $('s-status').value,
      comentario: $('s-comentario').value.trim(),
    });
    avisar('Status atualizado.');
    await Promise.all([abrirDetalhe(estado.detalheId), atualizarTudo()]);
  } catch (e) {
    $('erro-status').textContent = e.message;
    $('erro-status').hidden = false;
  }
}

// ---------------------------------------------------------------- inicialização

async function iniciar() {
  estado.usuario = await api('GET', '/api/auth/me');
  [estado.categorias, estado.transicoes] = await Promise.all([
    api('GET', '/api/categorias'),
    api('GET', '/api/status/transicoes'),
  ]);

  $('nome-usuario').textContent = estado.usuario.nome;
  $('perfil-usuario').textContent = ehAtendente() ? 'Atendente' : 'Solicitante';
  if (ehAtendente()) {
    $('titulo-lista').textContent = 'Todas as solicitações';
    document.body.classList.add('perfil-atendente');
  }

  const opcoesCategoria = () => estado.categorias.map((c) => el('option', { value: c.id, textContent: c.nome }));
  $('f-categoria').replaceChildren(el('option', { value: '', textContent: 'Selecione...' }), ...opcoesCategoria());
  $('filtro-categoria').append(...opcoesCategoria());
  $('filtro-status').append(...Object.entries(ROTULOS_STATUS).map(([v, t]) => el('option', { value: v, textContent: t })));

  $('btn-nova').onclick = () => abrirFormulario();
  $('form-solicitacao').onsubmit = salvar;
  $('form-status').onsubmit = alterarStatus;
  $('btn-sair').onclick = async () => {
    await api('POST', '/api/auth/logout');
    window.location.href = '/login.html';
  };
  document.querySelectorAll('[data-fechar]').forEach((b) => { b.onclick = () => b.closest('dialog').close(); });

  let atraso;
  $('filtro-busca').oninput = () => { clearTimeout(atraso); atraso = setTimeout(carregarLista, 300); };
  $('filtro-status').onchange = carregarLista;
  $('filtro-categoria').onchange = carregarLista;

  await atualizarTudo();
}

iniciar().catch((e) => avisar(e.message, 'erro'));
