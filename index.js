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
  
  try {
    const { numeroprocesso } = req.body;
    
    if (!numeroprocesso) {
      return res.status(400).json({
        error: 'numeroprocesso não fornecido',
        exemplo: { numeroprocesso: '15414.614430/2024-02' }
      });
    }

    console.log(`\n📥 Processando: ${numeroprocesso}`);

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--ignore-certificate-errors',
        '--disable-web-security'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    console.log('🔍 Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.waitForTimeout(3000);

    // Preencher campo
    console.log('✍️ Preenchendo...');
    await page.waitForSelector('#txtNumeroProcesso', { timeout: 20000 });
    await page.type('#txtNumeroProcesso', numeroprocesso);

    // Clicar
    console.log('🔎 Buscando...');
    await page.click('#btnConsultar');
    await page.waitForTimeout(5000);

    // CAPTURAR TUDO DA PÁGINA
    console.log('📸 Capturando informações da página...');
    
    const pageInfo = await page.evaluate(() => {
      const info = {
        title: document.title,
        url: window.location.href,
        allText: document.body.innerText.substring(0, 2000),
        allLinks: [],
        tables: [],
        buttons: [],
        scripts: []
      };

      // Todos os links
      document.querySelectorAll('a').forEach((a, i) => {
        info.allLinks.push({
          index: i,
          text: a.innerText.trim(),
          href: a.href,
          onclick: a.getAttribute('onclick'),
          id: a.id,
          class: a.className
        });
      });

      // Conteúdo de tabelas
      document.querySelectorAll('table').forEach((table, i) => {
        const rows = [];
        table.querySelectorAll('tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('td, th').forEach(cell => {
            cells.push(cell.innerText.trim());
          });
          if (cells.length > 0) rows.push(cells);
        });
        info.tables.push({ index: i, rows: rows.slice(0, 10) });
      });

      // Botões
      document.querySelectorAll('button, input[type="button"]').forEach((btn, i) => {
        info.buttons.push({
          index: i,
          text: btn.innerText || btn.value,
          onclick: btn.getAttribute('onclick')
        });
      });

      return info;
    });

    console.log('\n=== INFORMAÇÕES DA PÁGINA ===');
    console.log('Title:', pageInfo.title);
    console.log('URL:', pageInfo.url);
    console.log('\n--- TEXTO DA PÁGINA (primeiros 500 chars) ---');
    console.log(pageInfo.allText.substring(0, 500));
    console.log('\n--- TODOS OS LINKS ---');
    pageInfo.allLinks.forEach(link => {
      console.log(`\nLink ${link.index}:`);
      console.log(`  Texto: ${link.text}`);
      console.log(`  Href: ${link.href}`);
      if (link.onclick) console.log(`  Onclick: ${link.onclick}`);
    });
    console.log('\n--- TABELAS ---');
    console.log(JSON.stringify(pageInfo.tables, null, 2));
    console.log('\n--- BOTÕES ---');
    console.log(JSON.stringify(pageInfo.buttons, null, 2));
    console.log('\n=== FIM DAS INFORMAÇÕES ===\n');

    await browser.close();

    // Retornar todas as informações para análise
    return res.json({
      success: false,
      message: 'Modo debug - informações capturadas',
      numeroprocesso: numeroprocesso,
      pageInfo: pageInfo
    });

  } catch (error) {
    console.error(`❌ Erro: ${error.message}`);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    res.status(500).json({ error: error.message });
  }
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
