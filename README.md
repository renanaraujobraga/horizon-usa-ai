# Horizon USA AI — MVP

Interface estática com filtros de oportunidades, status de contatos e formulário de envio direto de e-mail com PDF via Gmail API.

## Status

- Interface, controle local e armazenamento do CV padrão em IndexedDB: implementados.
- Gmail OAuth e envio de e-mail com anexo PDF: **código implementado**, mas indisponível até configurar as credenciais e autorizar a conta.
- **Pesquisa real de anúncios publicados:** implementada via endpoint `GET /api/jobs`, com fontes públicas Greenhouse, Lever e Remotive. Clique em **Pesquisar** para buscar vagas dos EUA por cargo/empresa e estado; clique em **Ver anúncio e candidatar-se** para abrir o link direto, ou em **Salvar no controle** para acompanhar a oportunidade no navegador.
- A consulta usa um conjunto inicial de empresas/boards, não pesquisa todos os empregadores dos EUA. Fontes indisponíveis são identificadas, resultados são limitados e há cache temporário de 10 minutos. Dados publicados em um ATS não garantem que a vaga permanece aberta até o momento da candidatura.
- Banco multiusuário, cruzamento automático e verificado de PERM/H-1B com o DOL e identificação de patrocínio EB-3: **não implementados**.
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
- `api/jobs.js`: consulta vagas via APIs públicas de ATS Greenhouse/Lever e feed Remotive; retorna vagas com fonte e timestamp.
- `api/_gmail.js`: criptografia, tokens e validações.

Os arquivos em `api/` são Vercel Node.js Functions, sem bibliotecas externas.

## Erro: Request had insufficient authentication scopes

O Gmail só aceita o envio se o token OAuth tiver o escopo `gmail.send`. Se o Horizon exibir **Gmail conectado sem permissão de envio**, vá ao Google Cloud → Google Auth Platform → **Data access** e inclua `https://www.googleapis.com/auth/gmail.send`; depois clique em **Reconectar Gmail** no Horizon e autorize a permissão de envio no consentimento do Google. O sistema passa a validar o escopo recebido e não libera o envio quando o token está incompleto. Não são necessárias permissões `gmail.modify` ou `https://mail.google.com/`.

## Busca real — limites e interpretação

A busca não usa anúncios fictícios: cada resultado exibido vem de uma resposta recebida de uma API pública durante a consulta (sujeita a cache). Os registros iniciais do controle continuam históricos e não devem ser tratados como anúncios abertos. Não é possível afirmar disponibilidade de EB-3, PERM, H-1B ou elegibilidade de candidatos internacionais a partir de uma descrição de emprego que não declare isso expressamente. A aplicação não faz candidatura automática no site da empresa: ao clicar no link você segue para o anúncio original. As vagas retornadas podem ser de qualquer empresa presente nas fontes cobertas; nenhuma promessa de abrangência de todo o mercado dos EUA.

Exemplo de consulta: `/api/jobs?q=scrum%20master&state=TX`. A aplicação não requer nova API key para essa pesquisa. O uso de feeds de terceiros está sujeito aos termos, limites e disponibilidade de cada fornecedor.

## Mapa geográfico dos EUA

Os cards do histórico e dos anúncios consultados usam um mapa SVG responsivo com contornos reais dos 50 estados americanos e do Distrito de Columbia, destacando em verde o estado da vaga. Alaska e Havaí aparecem em posições inseridas da projeção Albers. Quando o estado não é identificado, o mapa permanece neutro. `us-map-data.js` guarda apenas os caminhos vetoriais e não depende de uma API externa.

**Crédito e licença dos contornos:** [gabidavila/react-usa-map](https://github.com/gabidavila/react-usa-map), MIT License, com adaptações de visualização e destaque no Horizon USA AI. Os mapas indicam o estado, não a localização exata da cidade.

## Posicionamento de produto (novembro de 2026)

Horizon USA AI atende pessoas que querem trabalhar legalmente nos EUA no curto prazo **ou** construir um plano de imigração para o futuro. Não é um simples agregador genérico de vagas. Busca evidências de contratação internacional, oportunidades com menção a patrocínio e histórico migratório de empregadores, preservando classificação explícita de cada evidência. A jornada contempla vias temporárias H-1B/H-2A/H-2B, possibilidades permanentes EB-3/EB-2 e, quando aplicável, EB-2 NIW sem empregador patrocinador. **O código atual ainda não oferece busca H-2A/H-2B, importação DOL, cobertura completa de EB-2/EB-3 ou aconselhamento imigratório**. A interface identifica essas integrações como futuras.

## Situação da vaga e andamento da candidatura

A plataforma mantém dois conceitos separados:

- **Situação da vaga**: `Anúncio publicado na última consulta` quando o anúncio foi retornado por um feed público há até 24 horas; `Somente histórico — vaga atual não confirmada` quando há apenas registro histórico/prospecção; e `Situação atual não verificada` quando uma vaga salva não reapareceu recentemente na consulta. Anúncio publicado não garante que o recrutamento ainda está ativo no instante do clique.
- **Andamento da candidatura**: Pendente, Contato enviado, Candidatura enviada, Resposta recebida ou Falha de entrega. Não muda automaticamente só porque o anúncio está publicado ou expirou.

O filtro `Situação da vaga` permite separar as categorias. Uma nova busca só atualiza a data de um anúncio salvo quando a mesma URL reaparece na resposta consultada. Histórico sem URL não é convertido artificialmente em vaga aberta.
