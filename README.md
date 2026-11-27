# Horizon USA AI — MVP

Interface estática com filtros de oportunidades, status de contatos e formulário de envio direto de e-mail com PDF via Gmail API.

## Status

- Interface, controle local e armazenamento do CV padrão em IndexedDB: implementados.
- Gmail OAuth e envio de e-mail com anexo PDF: **código implementado**, mas indisponível até configurar as credenciais e autorizar a conta.
- Pesquisa externa automática, banco multiusuário e integração DOL: **não implementados**.
- O histórico inicial de empresas e salários é demonstrativo. PERM e H-1B históricos não comprovam EB-3 atual nem vaga ativa.

## Configurar o envio pelo Gmail (obrigatório, uma vez)

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto (ou selecione um existente), ative a **Gmail API** e configure a **OAuth consent screen / Google Auth Platform**.
2. Em *Audience*, use **External** e adicione sua própria conta Gmail à lista de usuários de teste enquanto o aplicativo estiver em modo Testing. Configure os escopos `https://www.googleapis.com/auth/gmail.send` e `https://www.googleapis.com/auth/userinfo.email` caso o console solicite.
3. Na **Google Auth Platform → Data access**, clique em **Add or remove scopes** e inclua o escopo `https://www.googleapis.com/auth/gmail.send` (envio de mensagens). Confirme que ele aparece na lista de escopos configurados. No consentimento do Google, marque/autorize a permissão de envio. O aplicativo não solicita permissão de leitura de e-mails.
4. Crie um **OAuth client ID**, tipo **Web application**, com o Authorized redirect URI exatamente igual a:
   `https://horizon-usa-ai.vercel.app/api/auth-callback`
5. No painel Vercel do projeto Horizon USA AI, abra **Settings → Environment Variables** e crie as variáveis abaixo para **Production**:

| Nome | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID gerado pelo Google Cloud |
| `GOOGLE_CLIENT_SECRET` | Client secret gerado pelo Google Cloud |
| `SESSION_SECRET` | Segredo aleatório forte com pelo menos 32 caracteres (gerar localmente, por exemplo com `openssl rand -hex 32`) |
| `APP_ORIGIN` | `https://horizon-usa-ai.vercel.app` |
| `ALLOWED_GMAIL_ADDRESS` | A conta Gmail autorizada para uso pessoal (recomendado) |

6. Acione um **Redeploy** na Vercel depois de salvar as variáveis. Os segredos devem permanecer **somente** na Vercel — nunca no GitHub, no HTML ou nesta conversa.
7. Abra o Horizon, clique em **Conectar Gmail** e autorize o acesso solicitado no Google. O escopo é limitado a **enviar** mensagens e consultar o endereço da conta; a aplicação não solicita leitura de caixa de entrada.
8. Selecione um currículo PDF no formulário **Preparar apresentação**, marque **Usar como padrão**, revise destinatário/assunto/mensagem e clique **Enviar e-mail com CV**. O status passa a **Contato enviado** somente quando o Gmail retornar um ID de envio.

**Limites:** PDF de até 2 MB (limite conservador por payload de Vercel Functions); armazena o arquivo padrão apenas no navegador. A sessão do Gmail é mantida em cookie HttpOnly criptografado (AES-256-GCM). Uma sessão pode expirar ou precisar ser renovada; reconecte caso necessário. Em modo Testing, os refresh tokens de aplicativos Google externos podem expirar em sete dias.

**Atenção:** conexões Gmail feitas dentro do ChatGPT não autorizam automaticamente outro site. É obrigatório autorizar a própria aplicação no Google. Evite enviar múltiplas mensagens ao mesmo contato e revise as informações de cada vaga.

## Estrutura

- `index.html`: UI cliente, filtros, status e preparo da mensagem.
- `api/auth-start.js`: início do Google OAuth com state + PKCE.
- `api/auth-callback.js`: troca do authorization code e sessão protegida.
- `api/gmail-status.js`: verifica conexão.
- `api/gmail-send.js`: envia corpo + PDF pelo `users.messages.send` do Gmail.
- `api/gmail-disconnect.js`: encerra sessão no navegador.
- `api/_gmail.js`: criptografia, tokens e validações.

Os arquivos em `api/` são Vercel Node.js Functions, sem bibliotecas externas.

## Erro: Request had insufficient authentication scopes

O Gmail só aceita o envio se o token OAuth tiver o escopo `gmail.send`. Se o Horizon exibir **Gmail conectado sem permissão de envio**, vá ao Google Cloud → Google Auth Platform → **Data access** e inclua `https://www.googleapis.com/auth/gmail.send`; depois clique em **Reconectar Gmail** no Horizon e autorize a permissão de envio no consentimento do Google. O sistema passa a validar o escopo recebido e não libera o envio quando o token está incompleto. Não são necessárias permissões `gmail.modify` ou `https://mail.google.com/`.
