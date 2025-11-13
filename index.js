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
      <title>API Download SUSEP</title>
      <meta charset="utf-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          max-width: 800px;
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
          color: #28a745;
          margin-bottom: 20px;
          font-size: 36px;
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .badge {
          display: inline-block;
          padding: 8px 20px;
          background: #28a745;
          color: white;
          border-radius: 25px;
          font-size: 14px;
          font-weight: bold;
        }
        .warning {
          background: #fff3cd;
          border-left: 5px solid #ffc107;
          padding: 20px;
          margin: 25px 0;
          border-radius: 8px;
        }
        pre {
          background: #2d2d2d;
          color: #f8f8f2;
          padding: 25px;
          border-radius: 10px;
          overflow-x: auto;
          font-size: 14px;
          line-height: 1.6;
        }
        .feature {
          display: flex;
          align-items: flex-start;
          gap: 15px;
          margin: 20px 0;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 10px;
          transition: transform 0.2s;
        }
        .feature:hover {
          transform: translateX(5px);
        }
        .icon {
          font-size: 32px;
          min-width: 40px;
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
        .method.get { background: #28a745; }
        h3 { margin: 30px 0 15px 0; color: #333; }
        .footer {
          text-align: center;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 2px solid #eee;
          color: #999;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>
          <span>✅</span>
          <span>API Download SUSEP</span>
        </h1>
        <div class="badge">🟢 ONLINE</div>
        
        <p style="font-size: 18px; color: #666; margin: 20px 0;">
          API automatizada para download de PDFs da SUSEP usando Puppeteer + Chrome Headless.
        </p>

        <div class="warning">
          <strong>⚠️ Importante:</strong> A primeira requisição pode demorar 20-30 segundos 
          enquanto o navegador Chrome inicializa. Requisições subsequentes são mais rápidas.
        </div>

        <div class="feature">
          <div class="icon">🤖</div>
          <div>
            <strong style="font-size: 18px;">Automação Completa</strong><br>
            <span style="color: #666;">Utiliza navegador Chrome real para contornar proteções JavaScript da SUSEP</span>
          </div>
        </div>

        <div class="feature">
          <div class="icon">⚡</div>
          <div>
            <strong style="font-size: 18px;">Download Direto</strong><br>
            <span style="color: #666;">Retorna o PDF diretamente, pronto para integração com n8n e Supabase</span>
          </div>
        </div>

        <div class="feature">
          <div class="icon">🔒</div>
          <div>
            <strong style="font-size: 18px;">Tratamento de Erros</strong><br>
            <span style="color: #666;">Sistema robusto com logs detalhados e timeouts configuráveis</span>
          </div>
        </div>

        <h3>📡 Endpoints Disponíveis</h3>
        
        <div class="endpoint">
          <span class="method get">GET</span>
          <strong>/</strong> - Página de documentação (esta página)
        </div>

        <div class="endpoint">
          <span class="method get">GET</span>
          <strong>/health</strong> - Health check da API
        </div>

        <div class="endpoint">
          <span class="method">POST</span>
          <strong>/download-susep</strong> - Download de PDF
          <pre style="margin-top: 15px;">POST /download-susep
Content-Type: application/json

{
  "numeroprocesso": "15414.614430/2024-02"
}</pre>
        </div>

        <h3>🔧 Configuração no n8n</h3>
        <pre>HTTP Request Node:
- Method: POST
- URL: ${req.protocol}://${req.get('host')}/download-susep
- Headers: Content-Type = application/json
- Body: {"numeroprocesso": "SEU_NUMERO_PROCESSO"}
- Response Format: File
- Timeout: 120000 (2 minutos)</pre>

        <div class="footer">
          <p><strong>Render.com Deployment</strong></p>
          <p style="font-size: 12px; margin-top: 10px;">
            Desenvolvido para automação n8n | Powered by Puppeteer & Express
          </p>
        </div>
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
    service: 'SUSEP Download API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'production'
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
        error: 'Parâmetro "numeroprocesso" não fornecido',
        exemplo: { numeroprocesso: '15414.614430/2024-02' }
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📥 NOVA REQUISIÇÃO - ${new Date().toISOString()}`);
    console.log(`📋 Processo: ${numeroprocesso}`);
    console.log('='.repeat(60));

    // Iniciar Puppeteer
    console.log('🌐 [1/6] Iniciando navegador Chrome...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('✅ Navegador iniciado');

    // Acessar SUSEP
    console.log('🔍 [2/6] Acessando site da SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    console.log('✅ Página SUSEP carregada');

    // Aguardar e preencher campo
    console.log('✍️ [3/6] Preenchendo número do processo...');
    await page.waitForSelector('#txtNumeroProcesso', { timeout: 20000 });
    await page.type('#txtNumeroProcesso', numeroprocesso);
    console.log('✅ Campo preenchido');

    // Buscar
    console.log('🔎 [4/6] Executando busca...');
    await Promise.all([
      page.click('#btnConsultar'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);
    
    await page.waitForTimeout(3000);
    console.log('✅ Busca executada');

    // Encontrar link
    console.log('📄 [5/6] Procurando link do PDF...');
    
    const pdfLink = await page.evaluate(() => {
      const selectors = [
        'a[href*=".pdf"]',
        'a[onclick*=".pdf"]',
        'table a'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const href = el.href || el.getAttribute('onclick');
          if (href && href.includes('.pdf')) {
            if (el.href) return el.href;
            
            const match = href.match(/'([^']+\.pdf[^']*)'/);
            if (match) return 'https://www2.susep.gov.br' + match[1];
          }
        }
      }
      
      const allLinks = Array.from(document.querySelectorAll('a'));
      for (const link of allLinks) {
        if (link.textContent.toLowerCase().includes('download')) {
          return link.href;
        }
      }
      
      return null;
    });

    if (!pdfLink) {
      const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
      await browser.close();
      
      console.log('❌ Link do PDF não encontrado');
      return res.status(404).json({
        error: 'Link de download não encontrado',
        dica: 'Verifique se o número do processo está correto e se existe PDF disponível',
        numeroprocesso: numeroprocesso
      });
    }

    console.log(`✅ Link encontrado: ${pdfLink.substring(0, 80)}...`);

    // Download
    console.log('⬇️ [6/6] Baixando PDF...');
    const pdfResponse = await page.goto(pdfLink, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    const pdfBuffer = await pdfResponse.buffer();

    if (!pdfBuffer.toString('utf8', 0, 5).includes('%PDF')) {
      await browser.close();
      console.log('❌ Arquivo baixado não é um PDF válido');
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
