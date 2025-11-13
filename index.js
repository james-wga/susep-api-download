const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Página inicial
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API Download SUSEP - Railway</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          margin: 0;
        }
        .container {
          max-width: 800px;
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { color: #28a745; font-size: 36px; margin-bottom: 10px; }
        .badge {
          display: inline-block;
          padding: 8px 20px;
          background: #28a745;
          color: white;
          border-radius: 25px;
          font-size: 14px;
          font-weight: bold;
          margin: 20px 0;
        }
        .alert {
          background: #fff3cd;
          border-left: 5px solid #ffc107;
          padding: 20px;
          margin: 25px 0;
          border-radius: 8px;
        }
        pre {
          background: #2d2d2d;
          color: #00ff00;
          padding: 20px;
          border-radius: 10px;
          overflow-x: auto;
          font-size: 13px;
        }
        .endpoint {
          background: #e3f2fd;
          padding: 20px;
          margin: 15px 0;
          border-radius: 10px;
          border-left: 5px solid #2196F3;
        }
        .method {
          display: inline-block;
          padding: 5px 15px;
          background: #2196F3;
          color: white;
          border-radius: 5px;
          font-weight: bold;
          font-size: 12px;
          margin-right: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✅ API Download SUSEP</h1>
        <div class="badge">🟢 ONLINE via Railway</div>
        
        <p style="font-size: 18px; color: #666; margin: 20px 0;">
          API automatizada para download de PDFs da SUSEP usando Puppeteer.
        </p>

        <div class="alert">
          <strong>⚠️ Importante:</strong> A primeira requisição demora 20-30 segundos para inicializar o Chrome.
        </div>

        <h3>📡 Endpoints</h3>
        
        <div class="endpoint">
          <span class="method">POST</span>
          <strong>/download-susep</strong>
          <pre>Content-Type: application/json

{
  "numeroprocesso": "15414.614430/2024-02"
}</pre>
        </div>

        <h3>🔧 Configuração n8n</h3>
        <pre>HTTP Request Node:
- Method: POST
- URL: ${req.protocol}://${req.get('host')}/download-susep
- Body: {"numeroprocesso": "SEU_PROCESSO"}
- Response Format: File
- Timeout: 180000</pre>

        <p style="text-align: center; margin-top: 40px; color: #999; font-size: 12px;">
          Hospedado no Railway.app | Powered by Puppeteer
        </p>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    service: 'SUSEP Download API'
  });
});

// Endpoint de download
app.post('/download-susep', async (req, res) => {
  let browser = null;
  const startTime = Date.now();
  
  try {
    const { numeroprocesso } = req.body;
    
    if (!numeroprocesso) {
      return res.status(400).json({
        error: 'numeroprocesso não fornecido',
        exemplo: { numeroprocesso: '15414.614430/2024-02' }
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📥 NOVA REQUISIÇÃO - ${new Date().toISOString()}`);
    console.log(`📋 Processo: ${numeroprocesso}`);
    console.log('='.repeat(60));

    // Iniciar browser
    console.log('🌐 [1/6] Iniciando Chrome...');
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('✅ Chrome iniciado');

    // Acessar SUSEP
    console.log('🔍 [2/6] Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
      waitUntil: 'networkidle0',
      timeout: 90000
    });
    console.log('✅ Página SUSEP carregada');

    // Aguardar página carregar
    console.log('⏳ [3/6] Aguardando elementos...');
    await page.waitForTimeout(5000);

    // Procurar campo de busca
    console.log('✍️ [4/6] Preenchendo formulário...');
    const selectors = [
      '#txtNumeroProcesso',
      'input[name*="Processo"]',
      'input[type="text"]'
    ];

    let inputFound = false;
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        console.log(`✅ Campo encontrado: ${selector}`);
        await page.type(selector, numeroprocesso);
        inputFound = true;
        break;
      } catch (e) {
        console.log(`⚠️ Seletor ${selector} não encontrado`);
      }
    }

    if (!inputFound) {
      await browser.close();
      return res.status(500).json({
        error: 'Campo de busca não encontrado',
        dica: 'A SUSEP pode ter mudado a estrutura da página'
      });
    }

    // Clicar em buscar
    console.log('🔎 Clicando em Buscar...');
    const buttonSelectors = [
      '#btnConsultar',
      'input[type="submit"]',
      'button[type="submit"]'
    ];

    let buttonClicked = false;
    for (const selector of buttonSelectors) {
      try {
        await page.click(selector);
        buttonClicked = true;
        console.log(`✅ Botão clicado: ${selector}`);
        break;
      } catch (e) {
        console.log(`⚠️ Botão ${selector} não encontrado`);
      }
    }

    if (!buttonClicked) {
      await browser.close();
      return res.status(500).json({
        error: 'Botão de busca não encontrado'
      });
    }

    // Aguardar resultado
    console.log('⏳ [5/6] Aguardando resultado...');
    await page.waitForTimeout(5000);

    // Verificar mensagens de erro
    const errorMsg = await page.evaluate(() => {
      const error = document.querySelector('.error, .alert, .mensagem-erro');
      return error ? error.textContent : null;
    });

    if (errorMsg) {
      console.log('⚠️ Mensagem da SUSEP:', errorMsg);
    }

    // Listar links (debug)
    const allLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => ({
        text: a.textContent.trim().substring(0, 50),
        href: a.href
      }));
    });
    console.log('🔗 Total de links encontrados:', allLinks.length);
    console.log('🔗 Primeiros links:', JSON.stringify(allLinks.slice(0, 5), null, 2));

    // Procurar PDF de múltiplas formas
    console.log('📄 [6/6] Procurando link do PDF...');
    
    const pdfLink = await page.evaluate(() => {
      // Método 1: Link direto com .pdf
      let link = document.querySelector('a[href*=".pdf"]');
      if (link) {
        console.log('Método 1: Link direto encontrado');
        return link.href;
      }
      
      // Método 2: Link com texto "Download"
      const allLinks = Array.from(document.querySelectorAll('a'));
      for (const a of allLinks) {
        const text = a.textContent.toLowerCase();
        if (text.includes('download') || text.includes('.pdf')) {
          console.log('Método 2: Link por texto encontrado');
          return a.href;
        }
      }
      
      // Método 3: Dentro de tabela
      const tableLinks = document.querySelectorAll('table a[href]');
      for (const a of tableLinks) {
        if (a.href.includes('.pdf') || a.href.includes('Anexos')) {
          console.log('Método 3: Link em tabela encontrado');
          return a.href;
        }
      }
      
      // Método 4: Procurar por onclick
      for (const a of allLinks) {
        const onclick = a.getAttribute('onclick') || '';
        if (onclick.includes('.pdf')) {
          const match = onclick.match(/'([^']+\.pdf[^']*)'/);
          if (match) {
            console.log('Método 4: Link via onclick encontrado');
            return new URL(match[1], window.location.href).href;
          }
        }
      }
      
      return null;
    });

    if (!pdfLink) {
      const pageContent = await page.content();
      console.log('❌ PDF não encontrado');
      console.log('📄 HTML (primeiros 500 chars):');
      console.log(pageContent.substring(0, 500));
      
      await browser.close();
      
      return res.status(404).json({
        error: 'Link de download não encontrado',
        dica: 'Verifique se o processo existe e tem PDF disponível',
        numeroprocesso: numeroprocesso,
        linksEncontrados: allLinks.length
      });
    }

    console.log(`✅ PDF encontrado: ${pdfLink.substring(0, 80)}...`);

    // Baixar PDF
    console.log('⬇️ Baixando PDF...');
    const pdfResponse = await page.goto(pdfLink, {
      waitUntil: 'networkidle0',
      timeout: 90000
    });

    const pdfBuffer = await pdfResponse.buffer();

    if (!pdfBuffer.toString('utf8', 0, 5).includes('%PDF')) {
      await browser.close();
      return res.status(500).json({
        error: 'Arquivo baixado não é um PDF válido'
      });
    }

    const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ PDF baixado com sucesso!`);
    console.log(`📊 Tamanho: ${tamanhoKB} KB`);
    console.log(`⏱️ Tempo total: ${tempoTotal}s`);
    console.log('='.repeat(60) + '\n');

    await browser.close();

    const filename = `${numeroprocesso.replace(/[\/\.]/g, '_')}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
      'X-Process-Time': `${tempoTotal}s`,
      'X-File-Size': `${tamanhoKB}KB`
    });

    res.send(pdfBuffer);

  } catch (error) {
    console.error(`\n❌ ERRO: ${error.message}`);
    console.error(`Stack: ${error.stack}\n`);
    
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }

    res.status(500).json({
      error: error.message,
      tipo: error.name,
      timestamp: new Date().toISOString()
    });
  }
});

// Tratamento de erros
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 API DOWNLOAD SUSEP INICIADA!');
  console.log('='.repeat(60));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`📡 Endpoints:`);
  console.log(`   GET  / - Documentação`);
  console.log(`   GET  /health - Health check`);
  console.log(`   POST /download-susep - Download de PDFs`);
  console.log('='.repeat(60));
  console.log('✅ Pronto para receber requisições!\n');
});
