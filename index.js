const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Aumentar limite de timeout do Express
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configurações otimizadas para Railway
const CONFIG = {
  timeout: 150000, // 2.5 minutos
  puppeteerTimeout: 120000,
  navigationTimeout: 90000,
  maxMemory: '512mb'
};

// Página inicial simples
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API SUSEP - Railway</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #2c3e50; }
        .status { 
          display: inline-block;
          padding: 5px 15px;
          background: #27ae60;
          color: white;
          border-radius: 20px;
          font-size: 14px;
        }
        pre {
          background: #2c3e50;
          color: #2ecc71;
          padding: 15px;
          border-radius: 5px;
          overflow-x: auto;
        }
        .info {
          background: #ecf0f1;
          padding: 15px;
          border-radius: 5px;
          margin: 15px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📄 API Download SUSEP</h1>
        <span class="status">✓ Online</span>
        
        <div class="info">
          <strong>⚠️ Importante:</strong>
          <ul>
            <li>Primeira requisição: 30-60 segundos</li>
            <li>Timeout recomendado: 180 segundos</li>
            <li>Servidor: Railway.app</li>
          </ul>
        </div>

        <h3>📡 Endpoint Principal</h3>
        <pre>POST ${req.protocol}://${req.get('host')}/download-susep

Content-Type: application/json

{
  "numeroprocesso": "15414.614430/2024-02"
}</pre>

        <h3>🔧 Health Check</h3>
        <pre>GET ${req.protocol}://${req.get('host')}/health</pre>

        <p style="margin-top: 30px; color: #7f8c8d; font-size: 14px;">
          Versão 5.0 - Otimizado para Railway
        </p>
      </div>
    </body>
    </html>
  `);
});

// Health check robusto
app.get('/health', async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
      },
      version: '5.0'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: error.message 
    });
  }
});

// Função simplificada para encontrar PDF
async function findPDFLink(page) {
  console.log('🔍 Procurando link do PDF...');
  
  // Aguardar elementos carregarem
  await page.waitForTimeout(4000);
  
  // Tentar múltiplas estratégias
  const pdfLink = await page.evaluate(() => {
    // 1. Link direto com .pdf
    let link = document.querySelector('a[href*=".pdf"]');
    if (link) return link.href;
    
    // 2. Procurar por texto "Anexo" ou "Download"
    const allLinks = Array.from(document.querySelectorAll('a'));
    for (const a of allLinks) {
      const text = a.textContent.toLowerCase();
      if (text.includes('anexo') || text.includes('download') || text.includes('arquivo')) {
        return a.href;
      }
    }
    
    // 3. Procurar em tabelas
    const tableLinks = document.querySelectorAll('table a[href]');
    if (tableLinks.length > 0) {
      return tableLinks[0].href;
    }
    
    // 4. Qualquer link que pareça relevante
    for (const a of allLinks) {
      const href = (a.href || '').toLowerCase();
      if (href.includes('anexo') || href.includes('arquivo') || href.includes('download')) {
        return a.href;
      }
    }
    
    // 5. Se tiver poucos links, pegar o primeiro disponível
    if (allLinks.length > 0 && allLinks.length < 10) {
      return allLinks[0].href;
    }
    
    return null;
  });
  
  if (pdfLink) {
    console.log('✅ Link encontrado:', pdfLink.substring(0, 80));
  } else {
    console.log('❌ Nenhum link encontrado');
    
    // Debug: listar todos os links
    const debugLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => ({
        text: a.textContent.trim().substring(0, 50),
        href: a.href.substring(0, 80)
      }));
    });
    console.log('Links disponíveis:', JSON.stringify(debugLinks, null, 2));
  }
  
  return pdfLink;
}

// Endpoint principal com timeout adequado
app.post('/download-susep', async (req, res) => {
  let browser = null;
  const startTime = Date.now();
  
  // Configurar timeout da resposta
  req.setTimeout(CONFIG.timeout);
  res.setTimeout(CONFIG.timeout);
  
  try {
    const { numeroprocesso } = req.body;
    
    // Validação
    if (!numeroprocesso) {
      return res.status(400).json({
        error: 'numeroprocesso é obrigatório',
        exemplo: { numeroprocesso: '15414.614430/2024-02' }
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📥 [${new Date().toISOString()}] Processo: ${numeroprocesso}`);
    console.log('='.repeat(60));

    // Iniciar Puppeteer
    console.log('🌐 Iniciando navegador...');
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run',
        '--mute-audio',
        '--hide-scrollbars',
        '--disable-blink-features=AutomationControlled'
      ],
      timeout: CONFIG.puppeteerTimeout
    });

    const page = await browser.newPage();
    
    // Configurações da página
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Desabilitar recursos desnecessários
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });
    
    console.log('✅ Navegador pronto');

    // Acessar SUSEP
    console.log('🔍 Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.navigationTimeout
    });
    
    await page.waitForTimeout(3000);
    console.log('✅ Página carregada');

    // Preencher formulário
    console.log('✍️ Preenchendo formulário...');
    
    const inputSelectors = [
      '#txtNumeroProcesso',
      'input[name*="Processo"]',
      'input[type="text"]'
    ];

    let filled = false;
    for (const selector of inputSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.type(numeroprocesso, { delay: 50 });
          console.log(`✅ Campo preenchido: ${selector}`);
          filled = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!filled) {
      throw new Error('Campo de busca não encontrado');
    }

    // Clicar em buscar
    console.log('🔎 Buscando...');
    const buttonSelectors = [
      '#btnConsultar',
      'input[type="submit"]',
      'button[type="submit"]'
    ];

    let clicked = false;
    for (const selector of buttonSelectors) {
      try {
        await page.click(selector);
        console.log(`✅ Botão clicado: ${selector}`);
        clicked = true;
        break;
      } catch (e) {
        continue;
      }
    }

    if (!clicked) {
      throw new Error('Botão de busca não encontrado');
    }

    // Aguardar resultado
    console.log('⏳ Aguardando resultado...');
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
      page.waitForTimeout(8000)
    ]);

    // Procurar PDF
    console.log('📄 Procurando PDF...');
    const pdfLink = await findPDFLink(page);

    if (!pdfLink) {
      throw new Error('Link do PDF não encontrado. Verifique se o processo existe na SUSEP.');
    }

    // Baixar PDF
    console.log('⬇️ Baixando PDF...');
    const pdfResponse = await page.goto(pdfLink, {
      waitUntil: 'networkidle0',
      timeout: CONFIG.navigationTimeout
    });

    if (!pdfResponse) {
      throw new Error('Falha ao acessar o PDF');
    }

    const pdfBuffer = await pdfResponse.buffer();

    // Validar PDF
    if (!pdfBuffer.toString('utf8', 0, 5).includes('%PDF')) {
      throw new Error('Arquivo baixado não é um PDF válido');
    }

    const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Sucesso! ${tamanhoKB}KB em ${tempoTotal}s`);
    console.log('='.repeat(60) + '\n');

    // Fechar browser
    await browser.close();

    // Enviar resposta
    const filename = `${numeroprocesso.replace(/[\/\.\s]/g, '_')}.pdf`;

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
    console.error('Stack:', error.stack);
    console.log('='.repeat(60) + '\n');
    
    if (browser) {
      try { 
        await browser.close(); 
      } catch (e) {
        console.error('Erro ao fechar browser:', e.message);
      }
    }

    // Garantir que a resposta não foi enviada
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message,
        tipo: error.name,
        numeroprocesso: req.body.numeroprocesso,
        timestamp: new Date().toISOString(),
        dica: 'Verifique se o processo existe na SUSEP e tente novamente'
      });
    }
  }
});

// Tratamento global de erros
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM - Encerrando gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT - Encerrando gracefully...');
  process.exit(0);
});

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 API SUSEP INICIADA - v5.0 Railway Optimized');
  console.log('='.repeat(60));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🌐 Host: 0.0.0.0`);
  console.log(`⏱️  Timeout: ${CONFIG.timeout}ms`);
  console.log('='.repeat(60));
  console.log('✅ Pronto!\n');
});

// Configurar timeouts do servidor
server.timeout = CONFIG.timeout;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
