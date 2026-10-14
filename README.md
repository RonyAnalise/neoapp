# NeoApp — Gestão de Energia, Consumo, Economia e Faturas

Sistema web completo desenvolvido para a empresa **Neo Energia**, com controle de clientes, leituras acumuladas de consumo de energia elétrica, cálculos automáticos de valores e economia, geração de faturas em PDF de alta resolução, gestão de boletos com expurgo automático após pagamento, auditoria imutável e PWA instalável.

---

## ⚡ Principais Funcionalidades

1. **Autenticação & RBAC (Administrador e Operador)**:
   - Login com Google e e-mail/senha integrado ao Firebase Authentication.
   - Proteção de rotas e validação de permissões administrativas no Firestore.
   - Primeiro administrador provisionado automaticamente para `ronycvcsales@gmail.com`.

2. **Cadastro Completo de Clientes & Consulta de CEP**:
   - Integração com a API ViaCEP para preenchimento automático do endereço.
   - Identificação do código do cliente na rede da Coelba e unidade consumidora.
   - Inativação segura mantendo histórico financeiro inalterado.

3. **Regra Fundamental: Leitura Inicial Cadastrada Uma Única Vez**:
   - O operador informa a leitura inicial apenas no primeiro mês do medidor.
   - Nos meses seguintes, o sistema localiza a leitura válida anterior automaticamente.
   - Bloqueio de leituras atuais menores que anteriores (com módulo dedicado para Troca de Medidor).

4. **Cálculos Automáticos e Precisão Monetária**:
   - Consumo = Leitura atual − Leitura anterior.
   - Valor Neo = Consumo × Tarifa Neo Energia.
   - Valor Coelba = Consumo × Tarifa de referência Coelba.
   - Economia = Valor Coelba − Valor Neo.
   - Percentual de Economia = (Economia ÷ Valor Coelba) × 100.

5. **Fidelidade Visual Rigorosa da Fatura**:
   - 12 blocos visuais correspondendo à identidade da Neo Energia.
   - Fundo verde externo com cantos arredondados e quadros internos brancos, verdes e laranjas.
   - Geração de PDF e impressão nativa com proporção A4.

6. **Gestão de Boletos & Expurgo Obrigatório**:
   - Anexo de boletos bancários em PDF armazenados no Firebase Storage.
   - Ao confirmar o pagamento da fatura, o PDF do boleto é excluído do Storage e a referência limpa do documento, preservando o histórico financeiro.

7. **Trilha de Auditoria Imutável**:
   - Registro de todas as operações críticas (criação, leitura, faturamento, pagamento, cancelamento e alteração de tarifas).

8. **PWA Instalável (Android, iOS e Desktop)**:
   - Manifest configurado, service worker com autoUpdate e ícones nas dimensões oficiais.

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos
- Node.js 20+ ou 22+
- npm ou bun

### 2. Instalação das dependências
```bash
npm install
```

### 3. Execução em desenvolvimento
```bash
npm run dev
```
Acesse `http://localhost:3000`.

---

## 📦 Publicação no GitHub e Vercel

### 1. Versionamento no GitHub
```bash
git init
git add .
git commit -m "feat: NeoApp producao completa"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/neoapp.git
git push -u origin main
```

### 2. Hospedagem na Vercel
1. Acesse o painel da [Vercel](https://vercel.com) e clique em **Add New Project**.
2. Importe o repositório do GitHub.
3. O Vite será detectado automaticamente:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Clique em **Deploy**.

---

## 🔒 Regras de Segurança do Firebase (`firestore.rules`)
As regras foram aplicadas e implementam:
- Bloqueio padrão para todas as coleções.
- Permissão de escrita administrativa para administradores em `/admins/{uid}`.
- Criação e consulta de faturas e clientes autenticados.
- Imutabilidade na coleção `/auditoria`.
