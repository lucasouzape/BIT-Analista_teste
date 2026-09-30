# MEMORIAL TÉCNICO DE DESENVOLVIMENTO

**Projeto:** Portal de Solicitações Internas
**Autor:** Lucas de Souza Pegoretti
**Versão:** 1.0.0

---

## 1. Objetivo

Disponibilizar um portal web onde colaboradores registram demandas internas (TI, RH, Compras,
Financeiro, Infraestrutura) e acompanham sua evolução até a conclusão, com autenticação,
controle de sessão e persistência em banco de dados SQL.

## 2. Escopo atendido

| # | Requisito | Situação |
|---|---|---|
| 1 | Login com usuário e senha | Atendido |
| 1 | Controle de sessão | Atendido (token no banco + expiração) |
| 1 | Logout | Atendido |
| 1 | Somente autenticados acessam o sistema | Atendido (API e páginas) |
| 2 | Criar solicitação (Título, Descrição, Categoria) | Atendido |
| 2 | Campos automáticos: data de criação, solicitante, status = Aberto | Atendido (definidos no servidor) |
| 2 | Editar solicitação aberta | Atendido |
| 2 | Excluir solicitação aberta | Atendido |
| — | Acompanhamento até a conclusão | Atendido (fluxo de status + histórico) |
| — | Entregáveis: código, instruções, scripts SQL, dicionário, memorial, README, evidências | Atendido |

## 3. Arquitetura

Arquitetura cliente-servidor em três camadas, entregue como uma única aplicação Node.js:

```
┌──────────────────────┐   HTTP/JSON (cookie de sessão)   ┌─────────────────────────┐   SQL   ┌──────────┐
│ Frontend (navegador) │ ───────────────────────────────▶ │ Backend Express (API)    │ ──────▶ │ SQLite   │
│ HTML + CSS + JS puro │ ◀─────────────────────────────── │ rotas → regras → queries │ ◀────── │ portal.db│
└──────────────────────┘                                  └─────────────────────────┘         └──────────┘
```

- **Frontend** (`frontend/`): duas páginas — `login.html` e `index.html` — e scripts sem
  framework nem etapa de build. Toda a comunicação é via `fetch` na API REST.
- **Backend** (`backend/src/`): Express 5 organizado por responsabilidade:
  - `server.js` — inicialização (porta, arquivo do banco, limpeza periódica de sessões).
  - `app.js` — montagem da aplicação (middlewares, rotas, arquivos estáticos, tratamento de erros).
    Recebe a conexão do banco por parâmetro, o que permite testes com banco em memória.
  - `auth.js` — criação/validação/encerramento de sessões e middlewares `exigirAutenticacao` e `exigirPerfil`.
  - `senha.js` — hash e verificação de senha.
  - `routes/auth.js` e `routes/solicitacoes.js` — endpoints e regras de negócio.
  - `db.js` — abertura do banco, execução do `schema.sql`/`seed.sql` e helper de transação.
- **Banco** (`database/`): scripts SQL versionados; o backend os aplica na inicialização
  (`CREATE TABLE IF NOT EXISTS`, portanto idempotente).

## 4. Decisões técnicas e justificativas

| Decisão | Justificativa |
|---|---|
| **Node.js + Express** | Stack amplamente conhecida, simples de executar e avaliar; uma única linguagem no front e no back. |
| **SQLite (`node:sqlite`)** | Banco SQL real, sem necessidade de instalar/configurar um servidor para avaliar o projeto. O módulo é nativo do Node 22, então não há compilação de dependências nativas (problema comum no Windows). Os scripts usam SQL padrão (tipos `VARCHAR`, `CHECK`, `FOREIGN KEY`) e podem ser portados para PostgreSQL/SQL Server com poucas alterações (`AUTOINCREMENT` → `SERIAL`/`IDENTITY`). |
| **Frontend sem framework** | O escopo é pequeno; evita toolchain de build e mantém a execução em um único comando (`npm start`). |
| **Sessão no servidor (tabela `sessoes`)** em vez de JWT | Permite logout real (a sessão é invalidada no banco), expiração controlada e revogação. O cookie `HttpOnly` impede leitura por JavaScript (mitiga roubo via XSS). |
| **scrypt** para senhas | Algoritmo de derivação resistente a força bruta disponível no módulo `crypto` nativo, com salt por usuário e comparação em tempo constante (`timingSafeEqual`). |
| **Perfis Solicitante/Atendente** | O requisito pede acompanhamento "até a conclusão"; alguém precisa mover o status. O perfil Atendente representa a área que atende a demanda. |
| **Tabela de histórico** | Dá rastreabilidade (quem fez o quê e quando) e alimenta a linha do tempo exibida ao solicitante. |
| **Status como `VARCHAR` + `CHECK`** | Domínio pequeno e fixo; legível em consultas e garantido pelo banco. |
| **Transações** em criação/edição/mudança de status | A solicitação e o registro de histórico são gravados atomicamente. |

## 5. Regras de negócio

1. Apenas usuários autenticados acessam a API e a página principal (sem sessão → `401` na API
   e redirecionamento para `/login.html` nas páginas).
2. Na criação, o servidor define `criado_em`, `usuario_id` (usuário logado) e `status = 'ABERTO'`.
   Quaisquer valores desses campos enviados pelo cliente são ignorados.
3. Título (até 150 caracteres), descrição (até 4000) e categoria ativa são obrigatórios.
4. **Solicitante** visualiza somente as próprias solicitações; **Atendente** visualiza todas.
   Solicitações de outros usuários retornam `404` (não revela sua existência).
5. Editar e excluir: somente o **dono** da solicitação e somente com status **Aberto** (`409` caso contrário).
6. Mudança de status (somente Atendente), seguindo o fluxo:

   ```
   ABERTO ──▶ EM_ANDAMENTO ──▶ CONCLUIDO
     │             │
     └──────┬──────┘
            ▼
        CANCELADO
   ```

   Ao concluir, `concluido_em` é preenchido. `CONCLUIDO` e `CANCELADO` são finais.
7. Toda criação, edição e mudança de status gera um registro em `historico_solicitacoes`.

## 6. Modelo de dados

Cinco tabelas: `usuarios`, `sessoes`, `categorias`, `solicitacoes`, `historico_solicitacoes`.
O detalhamento de cada coluna, restrições, índices e o diagrama ER estão no
[Dicionário de Dados](../database/DICIONARIO_DE_DADOS.md). O script de criação está em
[`database/schema.sql`](../database/schema.sql).

## 7. Segurança

- Senhas com hash **scrypt** + salt aleatório; nunca retornadas pela API.
- Token de sessão com 256 bits de entropia (`crypto.randomBytes`), expiração configurável
  (padrão 8 h) e limpeza periódica de sessões expiradas.
- Cookie `HttpOnly`, `SameSite=Strict` (mitiga CSRF) e `Secure` opcional (`COOKIE_SECURE=true` sob HTTPS).
- **SQL Injection:** todas as consultas usam *prepared statements* com parâmetros.
- **XSS:** o frontend monta o DOM com `textContent` (nunca `innerHTML` com dados do usuário).
- Autorização verificada no servidor em toda operação (dono, perfil e status), não apenas escondida na interface.
- Cabeçalhos `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`; `x-powered-by` desabilitado.
- Limite de 100 KB no corpo das requisições; erros internos não expõem detalhes ao cliente.
- Mensagem de login genérica ("Usuário ou senha inválidos"), sem revelar se o usuário existe.

## 8. Testes e qualidade

- Testes de integração em `backend/test/api.test.js` (`npm test`), usando banco em memória:
  - rejeição de credenciais inválidas e de acesso sem sessão;
  - redirecionamento da página principal para o login;
  - login → sessão → logout (sessão invalidada);
  - CRUD completo com campos automáticos (inclusive tentativa de forçar `status`/`usuario_id`);
  - isolamento entre usuários, permissão de perfil, fluxo de status e bloqueio de edição fora de Aberto;
  - histórico registrado corretamente.
- Testes manuais de ponta a ponta no navegador (Chromium), documentados nas evidências em `docs/evidencias/`.

## 9. Execução

Resumo (detalhes no [README](../README.md)):

```bash
cd backend
npm install
npm start          # http://localhost:3000
npm test           # testes automatizados
```

Requer Node.js ≥ 22.5. Usuários de teste: `maria/senha123`, `joao/senha123` (solicitantes) e `admin/admin123` (atendente).

## 10. Limitações e melhorias futuras

- Cadastro/gestão de usuários e categorias pela interface (hoje via banco/seed).
- Bloqueio temporário após várias tentativas de login (rate limiting).
- Paginação na listagem para grandes volumes.
- Notificações (e-mail) nas mudanças de status e anexos nas solicitações.
- Atribuição de responsável e SLA por categoria.
- Para produção com múltiplos acessos simultâneos: migrar para PostgreSQL/SQL Server e
  executar atrás de HTTPS com `COOKIE_SECURE=true`.
