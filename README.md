# SIGRE - Sistema Integrado de Gestão de Reservas Acadêmicas

Este repositório contém a stack completa do sistema de gestão de salas e reservas da UEPA, integrando um backend em FastAPI com um frontend em React.

## 🚀 Estrutura do Monorepo

O projeto está organizado da seguinte forma:

-   **/backend**: API REST desenvolvida em FastAPI (Python). [Veja mais](./backend/README.md)
-   **/frontend**: Interface administrativa desenvolvida em React + Vite.

---

## 🛠️ Começando (Docker)

A forma recomendada de executar o projeto é utilizando Docker e Docker Compose, que orquestra ambos os serviços simultaneamente.

### Pré-requisitos
- Docker e Docker Compose instalados.

### Executar o Ambiente

#### 💻 Desenvolvimento (Hot-Reload ativado)
Ideal para codificação dinâmica. O frontend roda via Vite dev server e o backend com `--reload`. 

> [!NOTE]
> Por padrão, o comando `docker compose` utiliza o arquivo de desenvolvimento via link simbólico para o `docker-compose.dev.yml`.

```bash
docker compose up --build -d
```
- **Acesso**: [http://localhost:8080](http://localhost:8080) (Ou a porta definida em `FRONTEND_PORT` no `.env`)

#### 🚀 Produção (Build otimizado)
Simula o ambiente final. O frontend é servido via Nginx e o backend roda sem hot-reload.
```bash
docker compose -f docker-compose.prod.yml up --build -d
```
- **Acesso**: [http://localhost:8080](http://localhost:8080) (Conforme definido no `.env`)

---

## 🎹 Atalhos Úteis (Makefile)

Para facilitar o dia a dia, você pode usar o `make`:

-   `make dev`: Sobe o ambiente de desenvolvimento (para automaticamente o de produção).
-   `make prod`: Sobe o ambiente de produção (para automaticamente o de desenvolvimento).
-   `make down-dev`: Para o ambiente dev.
-   `make down-prod`: Para o ambiente prod.
-   `make logs-dev`: Acompanha os logs de desenvolvimento.
-   `make clean`: Limpa volumes e imagens locais.
-   `make help`: Lista todos os comandos disponíveis.

---

#### Encerrar os serviços
```bash
# Para Dev (Padrão)
docker compose down

# Para Prod
docker compose -f docker-compose.prod.yml down
```

---

## 📖 Acesso aos Serviços

Com o ambiente rodando, você pode acessar:

-   **Frontend (Web)**: [http://localhost:8080](http://localhost:8080) (Padrão configurado no `.env`)
-   **Backend (API)**: [http://localhost:8000](http://localhost:8000)
-   **Documentação API (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## ⚙️ Variáveis de Ambiente

As configurações são centralizadas no arquivo `.env` na raiz do projeto. As principais variáveis incluem:

-   `DATABASE_URL`: Conexão com o banco de dados.
-   `JWT_SECRET`: Chave para autenticação.
-   `GOOGLE_CLIENT_ID` / `SECRET`: Credenciais para integração com Google Calendar.
-   `BACKEND_PORT` / `FRONTEND_PORT`: Portas de exposição dos serviços.

---

## 🧹 Manutenção Especial

Caso precise realizar um reset completo do ambiente (reconstruir imagens e limpar cache):

```bash
docker compose down -v --rmi local
docker compose up --build -d
```

---

## 👥 Credenciais Padrão (Ambiente de Dev)
- **Usuário**: `admin@uepa.br` (username: `admin`)
- **Senha**: `admin456`
