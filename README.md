# Ledger API

API de carteira digital (double-entry ledger) em Node.js + TypeScript + Express + PostgreSQL (Prisma) + Redis.

## 1. O que é

Ledger API é o backend de uma carteira digital: usuários se registram, abrem contas, recebem depósitos administrativos e transferem saldo entre contas. Não é um app de exemplo com CRUD solto por cima de um banco — o projeto existe para provar correção sob concorrência: duas transferências simultâneas sobre a mesma conta nunca deixam o saldo inconsistente, um cliente que reenvia a mesma requisição (timeout, retry de rede) nunca é cobrado duas vezes, e o saldo de cada conta é sempre reconstruível a partir do histórico de lançamentos.

Não há double-entry "de mentirinha": todo movimento de dinheiro — inclusive depósito — é uma transferência real entre duas contas, com dois lançamentos (`LedgerEntry`) de igual valor e sinais opostos. `Account.balance` é um cache mantido pela mesma transação que grava os lançamentos; a fonte de verdade é a soma dos lançamentos.

## 2. Por que assim (log de decisões)

- **Double-entry.** Cada transferência gera exatamente 1 `LedgerEntry` `DEBIT` na conta de origem e 1 `CREDIT` na conta de destino, sempre no mesmo valor. `LedgerEntry` é a verdade contábil; `Account.balance` é um cache denormalizado atualizado na mesma transação — nunca a única fonte do saldo.
- **Valores em centavos, `BigInt`.** `Account.balance`, `Transfer.amount` e `LedgerEntry.amount`/`balanceAfter` são `BigInt` em centavos no banco (colunas Postgres `BIGINT`). Elimina erro de ponto flutuante em dinheiro; a API expõe esses valores como `string` no JSON (JS `number` não representa `BigInt` com segurança).
- **Lock `FOR UPDATE` por `id` ascendente.** Antes de mover saldo, `performTransfer` (`src/modules/transfers/ledger.repository.ts`) trava as duas linhas de `Account` envolvidas com `SELECT ... FOR UPDATE`, sempre na ordem lexicográfica dos dois ids. Isso serializa transferências concorrentes que tocam a mesma conta e evita deadlock: não importa a ordem em que duas transferências concorrentes (A→B e B→A) cheguem, ambas tentam travar as linhas na mesma ordem.
- **Idempotência em duas camadas.** A camada rápida é um cache de resposta no Redis por `Idempotency-Key` (mesma chave → mesmo corpo/status devolvido do cache, sem tocar o banco de novo) com um lock curto para não processar duas requisições simultâneas com a mesma chave. A camada definitiva é a constraint `@unique` em `Transfer.idempotencyKey` no Postgres: se duas requisições com a mesma chave escaparem do Redis (ex.: corrida entre duas réplicas), a segunda `INSERT` colide (`P2002`) e o serviço devolve a `Transfer` já criada em vez de duplicar o movimento. O Redis dá replay rápido; o banco dá a garantia sob corrida real.
- **Conta treasury.** Existe uma conta especial (`id = "treasury"`, ver `src/config/constants.ts`) que não passa pela checagem de saldo suficiente. Todo depósito administrativo é, por baixo, uma transferência da treasury para a conta do usuário — não existe um caminho de código separado que "cria dinheiro". Isso mantém a invariante contábil: a soma dos saldos de todas as contas de usuário é sempre igual a `-1 × saldo da treasury` (o sistema como um todo soma zero).

## 3. Arquitetura

```mermaid
flowchart LR
  C[Cliente] --> R[Express routes]
  R --> M[Middleware: auth, rate limit, idempotency]
  M --> Ctl[Controllers]
  Ctl --> S[Services]
  S --> Repo[Repositories]
  Repo --> PG[(PostgreSQL)]
  M --> RD[(Redis)]
```

Camadas: `routes` fazem parsing/validação de entrada (Zod) e amarram middleware; `controllers` traduzem HTTP ↔ chamadas de serviço; `services` contêm as regras de negócio (posse de conta, RBAC, orquestração de transferência); `repositories` são a única camada que fala com o Prisma. `LedgerRepository.performTransfer` é o núcleo transacional — todo movimento de dinheiro passa por ali, dentro de uma única transação Prisma. Redis é usado para o cache de idempotência e como store do rate limiter (`rate-limit-redis`), não para lógica de negócio.

## 4. Rodar local

O projeto foi desenvolvido com Postgres e Redis nativos na máquina (não em container) — mais rápido para iterar sem esperar `docker compose build` a cada mudança. As instruções abaixo documentam **o caminho Docker completo** (o que um leitor do repositório provavelmente vai usar) e citam a variação nativa entre parênteses.

Pré-requisitos: Docker (ou Postgres 16 + Redis 7 instalados localmente) e Node 20+.

```bash
# 1. Sobe Postgres + Redis + a própria API em containers, builda a imagem de produção
docker compose up -d --build

# entrypoint.sh do container `app` já roda `prisma migrate deploy` antes de subir o servidor.
# 2. Seed (cria a conta treasury + usuário admin@ledger.local / admin12345).
#    A imagem de runtime é buildada com `npm ci --omit=dev`, então `tsx` (usado pelo script de
#    seed) não está nela — rode o seed do host, apontando para o Postgres exposto pelo compose:
DATABASE_URL="postgresql://ledger:ledger@localhost:5432/ledger?schema=public" npm run prisma:seed

# 3. Testar
curl -fsS http://localhost:3000/health
```

Caminho nativo (o usado para construir o projeto): suba só a infra em container (`docker compose up -d postgres redis`, sem `app`), depois `npm ci`, `npm run prisma:migrate`, `npm run prisma:seed`, `npm run dev` (usa `tsx watch`, hot reload).

Variáveis de ambiente: ver `.env.example`. Em Docker Compose os hosts de `DATABASE_URL`/`REDIS_URL` do serviço `app` usam os nomes dos serviços (`postgres`, `redis`), não `localhost` — só o host roda em `localhost`.

## 5. Testes

```bash
npm run test              # suíte completa (vitest, contra ledger_test via .env.test)
npm run test -- --coverage
```

Quatro classes de cenário são o coração da suíte:

- **Unit** (`tests/unit/`) — regras puras sem I/O: `parseAmountToCents`/`centsToString` (conversão e validação de centavos) e a hierarquia `AppError`.
- **Integração** (`tests/integration/*.test.ts`) — toda a superfície HTTP via `supertest` contra `buildApp()`: auth, accounts, deposits, transfers, statement, health, error handler, rate limit, middleware de auth, schema/OpenAPI.
- **Concorrência** (`tests/integration/concurrency.test.ts`) — dispara transferências em paralelo com `Promise.allSettled` sobre a mesma conta: duas transferências que juntas excedem o saldo (uma passa, uma falha com `InsufficientFundsError`, saldo final correto); e um teste de reconciliação explícito que confere, após uma sequência de transferências concorrentes, que a soma dos `LedgerEntry` bate exatamente com `Account.balance`.
- **Idempotência** (`tests/integration/idempotency.test.ts`, mais os casos de `ledger.core.test.ts`) — mesma `Idempotency-Key` disparada 8x em paralelo processa uma única vez (as outras 7 reusam a `Transfer` já criada); chaves diferentes geram transferências diferentes; corpo e status da resposta são idênticos em replays.

## 6. Exemplos `curl`

```bash
BASE=http://localhost:3000

# Registrar
curl -s -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"supersecret1"}'
# 201 -> {"id":"clx...","email":"alice@example.com","role":"USER"}

# Login (guardar o token)
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"supersecret1"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
# resposta crua: 200 -> {"token":"eyJhbGciOi..."}

# Criar conta
ACCOUNT_ID=$(curl -s -X POST $BASE/accounts \
  -H "Authorization: Bearer $TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
# 201 -> {"id":"...","userId":"...","balance":"0","currency":"BRL","createdAt":"..."}

# Depósito (requer usuário ADMIN — o seed cria admin@ledger.local / admin12345)
ADMIN_TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ledger.local","password":"admin12345"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -s -X POST $BASE/accounts/$ACCOUNT_ID/deposits \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"amount":10000}'
# 201 -> {"id":"...","fromAccountId":"treasury","toAccountId":"...","amount":"10000","status":"COMPLETED","createdAt":"..."}

# Transferência (Idempotency-Key é obrigatório; reenviar a mesma chave devolve a mesma resposta)
curl -s -X POST $BASE/transfers \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(node -pe 'require("crypto").randomUUID()')" \
  -d "{\"fromAccountId\":\"$ACCOUNT_ID\",\"toAccountId\":\"<outra-conta>\",\"amount\":2500}"
# 201 (ou 200 se a mesma Idempotency-Key já tiver sido processada) -> DTO de Transfer

# Extrato
curl -s "$BASE/accounts/$ACCOUNT_ID/statement?limit=20" \
  -H "Authorization: Bearer $TOKEN"
# 200 -> {"entries":[{"id":"...","transferId":"...","direction":"DEBIT","amount":"2500","balanceAfter":"7500","createdAt":"..."}],"nextCursor":null}
```

Formato de erro (todo erro de domínio segue este shape; ver `src/middleware/errorHandler.ts` e `src/domain/errors.ts`):

```json
{
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Insufficient funds",
    "requestId": "a1b2c3d4"
  }
}
```

| Status | `code`                            | Quando                                                                   |
| ------ | --------------------------------- | ------------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`                | body/query inválidos (Zod)                                               |
| 401    | `AUTH_ERROR`                      | token ausente, inválido ou expirado; credenciais inválidas no login      |
| 403    | `FORBIDDEN`                       | conta/transferência de outro usuário; rota `ADMIN` com token `USER`      |
| 404    | `NOT_FOUND` / `ACCOUNT_NOT_FOUND` | recurso inexistente                                                      |
| 409    | `CONFLICT`                        | e-mail já registrado; requisição com a mesma `Idempotency-Key` já em voo |
| 422    | `INSUFFICIENT_FUNDS`              | saldo insuficiente para a transferência                                  |
| 429    | `RATE_LIMITED`                    | limite de requisições excedido (`/auth/*` e `POST /transfers`)           |
| 500    | `INTERNAL`                        | erro não mapeado                                                         |

## 7. Docs e demo

- Swagger UI: `GET /docs` (spec servida também em `GET /openapi.yaml`).
- Demo ao vivo: `<preencher após o deploy — ver Apêndice do plano>`.

## 8. Limitações conhecidas

- **Paginação por cursor não é estritamente cronológica.** `GET /accounts/:id/statement` pagina por `id` (cuid) decrescente, não por `createdAt`. cuids são ordenáveis lexicograficamente por ordem de geração, o que garante paginação estável (sem duplicatas nem gaps entre páginas mesmo com inserções concorrentes), mas não é uma garantia cronológica exata — ver comentário em `src/modules/accounts/accounts.repository.ts`.
- **Moeda única por conta, sem conversão.** `Account.currency` existe no schema mas hoje é sempre `"BRL"`; não há taxa de câmbio nem transferência entre moedas.
- **Sem refresh token.** `POST /auth/login` emite um único JWT com expiração fixa (`JWT_EXPIRES_IN`, padrão 1h); expirado, o cliente precisa logar de novo — não há endpoint de refresh nem revogação de token.
- **Redis free do Render hiberna.** Se o Redis do deploy usar o free tier (Render ou Upstash), ele pode hibernar por inatividade; a primeira requisição após um período ocioso pode ser mais lenta ou falhar até o Redis acordar (afeta o rate limiter e o cache de idempotência, não a integridade dos dados — a constraint `@unique` no banco continua garantindo idempotência mesmo se o Redis estiver fora do ar).
- **Seed da imagem Docker exige `tsx` do host.** A imagem de runtime é buildada com `npm ci --omit=dev`; `tsx` (dependência de desenvolvimento usada pelo script de seed) não está nela. Ver seção 4 para o workaround (rodar o seed do host contra o Postgres exposto).
- **`entrypoint.sh` depende de rede no boot do container.** O CLI `prisma` (usado por `npx prisma migrate deploy`) também é `devDependency`, então na imagem de runtime (`npm ci --omit=dev`) o `npx` baixa o pacote do registro do npm a cada start do container em vez de usar um binário já instalado — precisa de acesso à internet de saída no ambiente de deploy e adiciona latência ao boot. Funciona nos provedores usuais (Render, Fly.io têm egress liberado), mas é um ponto de atenção para deploy em rede restrita.
