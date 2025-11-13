const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3000;

// Middleware para parsear JSON
app.use(express.json());

// Página inicial
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API Download SUSEP</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 40px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          margin: 0;
        }
        .container {
          max-width: 700px;
          margin: 0 auto;
          background: white;
          padding: 40px;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        h1 {
          color: #28a745;
          margin-bottom: 10px;
          font-size: 32px;
        }
        .status-badge {
          display: inline-block;
          padding: 8px 20px;
          background: #28a745;
          color: white;
          border-radius: 25px;
          font-weight: bold;
          margin: 20px 0;
        }
        .warning {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 5px;
        }
        pre {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          border-left: 4px solid #667eea;
          overflow-x: auto;
          font-size: 14px;
        }
        .feature {
          display: flex;
          align-items: center;
          margin: 15px 0;
          padding: 10px;
          background: #f8f9fa;
          border-radius: 8px;
        }
        .feature-icon {
          font-size: 24px;
          margin-right: 15px;
        }
        .endpoints {
          margin-top: 30px;
        }
        .endpoint {
          background: #e3f2fd;
          padding: 15px;
          margin: 10px 0;
          border-radius: 8px;
          border-left: 4px solid #2196F3;
        }
        .endpoint-method {
          display: inline-block;
          padding: 4px 12px;
          background: #2196F3;
          color: white;
          border-radius: 4px;
          font-weight: bold;
          margin-right: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✅ API Download SUSEP Online!</h1>
        <div class="status-badge">🟢 Operacional</div>
        
        <p style="font-size: 16px; color: #666;">
          API automatizada para download de PDFs da SUSEP usando Puppeteer + Chrome Headless.
        </p>

        <div class="warning">
          ⚠️ <strong>Importante:</strong> A primeira requisição pode demorar 20-30 segundos 
          enquanto o navegador Chrome inicializa.
        </div>

        <div class="feature">
          <span class="feature-icon">🤖</span>
          <div>
            <strong>Automação Real</strong><br>
            <small>Usa navegador Chrome real para contornar proteções JavaScript</small>
          </div>
        </div>

        <div class="feature">
          <span class="feature-icon">⚡</span>
          <div>
            <strong>Download Direto</strong><br>
            <small>Retorna o PDF diretamente, pronto para salvar no Supabase</small>
          </div>
        </div>

        <div class="feature">
          <span class="feature-icon">🔒</span>
          <div>
            <strong>Confiável</strong><br>
            <small>Tratamento robusto de erros e timeouts configuráveis</small>
          </div>
        </div>

        <div class="endpoints">
          <h3>📡 Endpoints Disponíveis:</h3>
          
          <div class="endpoint">
            <span class="endpoint-method">GET</span>
            <strong>/</strong> - Esta página de documentação
          </div>

          <div class="endpoint">
            <span class="endpoint-method">POST</span>
            <strong>/download-susep</strong> - Download de PDFs
            <pre style="margin-top: 10px;">Content-Type: application/json

{
  "numeroprocesso": "15414.614430/2024-02"
}</pre>
          </div>

          <div class="endpoint">
            <span class="endpoint-method">GET</span>
            <strong>/health</strong> - Status da API
          </div>
        </div>

        <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
          <h3>🔧 Integração com n8n:</h3>
          <pre>HTTP Request Node:
- Method: POST
- URL: ${req.protocol}://${req.get('host')}/download-susep
- Body: {"numeroprocesso": "SEU_PROCESSO"}
- Response Format: File
- Timeout: 120000 (2 minutos)</pre>
        </div>

        <p style="text-align: center; margin-top: 30px; color: #999;">
          <small>Desenvolvido para automação n8n | Powered by Puppeteer</small>
        </p>
      </div>
    </body>
    </html>
  `);
});

// Endpoint de health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'SUSEP Download API',
    version: '1.0.0'
  });
});

// Endpoint principal de download
app.post('/download-susep', async (req, res) => {
  let browser = null;
  
  try {
    const { numeroprocesso } = req.body;
    
    // Validação
    if (!numeroprocesso) {
      return res.status(400).json({
        error: 'Parâmetro "numeroprocesso" não fornecido',
        exemplo: { numeroprocesso: '15414.614430/2024-02' }
      });
    }

    console.log(`📥 [${new Date().toISOString()}] Processando: ${numeroprocesso}`);

    // Configurar Puppeteer
    console.log('🌐 Iniciando navegador...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Configurar viewport e user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Acessar página SUSEP
    console.log('🔍 Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('✅ Página carregada');

    // Aguardar campo de busca
    console.log('⏳ Aguardando campo de busca...');
    await page.waitForSelector('#txtNumeroProcesso', { timeout: 20000 });

    // Preencher número do processo
    console.log(`✍️ Preenchendo processo: ${numeroprocesso}`);
    await page.type('#txtNumeroProcesso', numeroprocesso);

    // Clicar no botão Buscar
    console.log('🔎 Clicando em Buscar...');
    await Promise.all([
      page.click('#btnConsultar'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
        console.log('⚠️ Navigation timeout - continuando...');
      })
    ]);

    // Aguardar resultado
    console.log('⏳ Aguardando resultado...');
    await page.waitForTimeout(3000);

    // Procurar link de download
    console.log('📄 Procurando link de download...');
    
    const pdfLink = await page.evaluate(() => {
      // Tentar encontrar link do PDF de várias formas
      
      // Método 1: Link direto com .pdf
      let link = document.querySelector('a[href*=".pdf"]');
      if (link) return link.href;
      
      // Método 2: Link com texto "Download"
      const links = Array.from(document.querySelectorAll('a'));
      for (const a of links) {
        if (a.textContent.toLowerCase().includes('download') || 
            a.href.includes('.pdf')) {
          return a.href;
        }
      }
      
      // Método 3: Procurar na tabela de versões
      const tableLinks = document.querySelectorAll('table a');
      for (const a of tableLinks) {
        if (a.href.includes('.pdf')) {
          return a.href;
        }
      }
      
      return null;
    });

    if (!pdfLink) {
      // Fazer screenshot para debug
      const screenshot = await page.screenshot({ encoding: 'base64' });
      await browser.close();
      
      return res.status(404).json({
        error: 'Link de download não encontrado',
        dica: 'Verifique se o número do processo está correto',
        numeroprocesso: numeroprocesso,
        screenshot_disponivel: true
      });
    }

    console.log(`✅ Link encontrado: ${pdfLink}`);

    // Navegar para o PDF e baixar
    console.log('⬇️ Baixando PDF...');
    
    const pdfResponse = await page.goto(pdfLink, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    const pdfBuffer = await pdfResponse.buffer();

    // Verificar se é um PDF válido
    if (!pdfBuffer.toString('utf8', 0, 4).includes('%PDF')) {
      await browser.close();
      return res.status(500).json({
        error: 'Arquivo baixado não é um PDF válido'
      });
    }

    const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
    console.log(`✅ PDF baixado com sucesso! Tamanho: ${tamanhoKB} KB`);

    // Fechar navegador
    await browser.close();
    browser = null;

    // Criar nome do arquivo
    const filename = `${numeroprocesso.replace(/[\/\.]/g, '_')}.pdf`;

    // Retornar PDF
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length
    });

    res.send(pdfBuffer);

  } catch (error) {
    console.error(`❌ ERRO: ${error.message}`);
    
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Erro ao fechar navegador:', e.message);
      }
    }

    res.status(500).json({
      error: error.message,
      tipo: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('🚀 API Download SUSEP iniciada!');
  console.log(`📍 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`📡 Endpoint: POST /download-susep`);
  console.log(`💚 Health check: GET /health`);
  console.log('');
  console.log('Aguardando requisições...');
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
  console.error('
