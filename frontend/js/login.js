'use strict';

document.getElementById('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const erro = document.getElementById('erro-login');
  const botao = evento.target.querySelector('button');
  const usuario = document.getElementById('usuario').value.trim();
  const senha = document.getElementById('senha').value;

  erro.hidden = true;
  if (!usuario || !senha) {
    erro.textContent = 'Informe usuário e senha.';
    erro.hidden = false;
    return;
  }

  botao.disabled = true;
  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha }),
    });
    if (resp.ok) {
      window.location.href = '/';
      return;
    }
    const corpo = await resp.json().catch(() => ({}));
    erro.textContent = corpo.erro || 'Não foi possível entrar.';
    erro.hidden = false;
  } catch {
    erro.textContent = 'Falha de comunicação com o servidor.';
    erro.hidden = false;
  } finally {
    botao.disabled = false;
  }
});
