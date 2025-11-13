const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const CONFIG = {
  timeout: 150000,
  puppeteerTimeout: 120000,
  navigationTimeout: 90000
};

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
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📄 API Download SUSEP</h1>
        <span class="status">✓ Online v6.0</span>
        
        <h3>📡 Endpoint</h3>
        <pre>POST ${req.protocol}://${req.get('host')}/download-susep

{
  "numeroprocesso": "15414.614430/2024-02"
}</pre>
      </div>
    </body>
    </html>
  `);
});

app.get('/health', async (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
    },
    version: '6.0'
  });
});

// Função para encontrar e validar link do PDF
async function findAndValidatePDFLink(page) {
  console.log('🔍 Procurando link do PDF...');
  
  await page.waitForTimeout(4000);
  
  // Buscar TODOS os links e analisar
  const allLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
      text: a.textContent.trim(),
      href: a.href,
      onclick: a.getAttribute('onclick') || ''
    }));
  });
  
  console.log(`📋 Total de links encontrados: ${allLinks.length}`);
  
  // Filtrar links relevantes
  const relevantLinks = allLinks.filter(link => {
    const text = link.text.toLowerCase();
    const href = link.href.toLowerCase();
    
    return (
      href.includes('.pdf') ||
      href.includes('anexo') ||
      href.includes('download') ||
      href.includes('arquivo') ||
      text.includes('anexo') ||
      text.includes('download') ||
      text.includes('pdf')
    );
  });
  
  console.log(`✓ Links relevantes: ${relevantLinks.length}`);
  relevantLinks.forEach((link, i) => {
    console.log(`  [${i+1}] ${link.text.substring(0, 40)} -> ${link.href.substring(0, 60)}`);
  });
  
  // Se tiver poucos links, listar todos para debug
  if (allLinks.length < 20) {
    console.log('\n📋 Todos os links (página tem poucos):');
    allLinks.forEach((link, i) => {
      console.log(`  [${i+1}] "${link.text.substring(0, 40)}" -> ${link.href.substring(0, 60)}`);
    });
  }
  
  // Retornar o link mais provável
  if (relevantLinks.length > 0) {
    console.log(`✅ Usando link: ${relevantLinks[0].href}`);
    return relevantLinks[0].href;
  }
  
  // Se não achou nada relevante mas tem poucos links, usar o primeiro
  if (allLinks.length > 0 && allLinks.length < 10) {
    console.log(`⚠️ Nenhum link relevante, usando primeiro disponível: ${allLinks[0].href}`);
    return allLinks[0].href;
  }
  
  return null;
}

// Função para baixar PDF via CDP (Chrome DevTools Protocol)
async function downloadPDFViaCDP(page, url) {
  console.log('📥 Tentando download via CDP...');
  
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: '/tmp'
  });
  
  // Navegar para o URL
  const response = await page.goto(url, {
    waitUntil: 'networkidle0',
    timeout: CONFIG.navigationTimeout
  });
  
  return response;
}

// Endpoint principal
app.post('/download-susep', async (req, res) => {
  let browser = null;
  const startTime = Date.now();
  
  req.setTimeout(CONFIG.timeout);
  res.setTimeout(CONFIG.timeout);
  
  try {
    const { numeroprocesso } = req.body;
    
    if (!numeroprocesso) {
      return res.status(400).json({
        error: 'numeroprocesso é obrigatório',
        exemplo: { numeroprocesso: '15414.614430/2024-02' }
      });
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`📥 [${new Date().toISOString()}] Processo: ${numeroprocesso}`);
    console.log('='.repeat(70));

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
        '--disable-blink-features=AutomationControlled'
      ],
      timeout: CONFIG.puppeteerTimeout
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    console.log('✅ Navegador pronto');

    console.log('🔍 Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
      waitUntil: 'networkidle2',
      timeout: CONFIG.navigationTimeout
    });
    
    await page.waitForTimeout(3000);
    console.log('✅ Página carregada');

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

    console.log('⏳ Aguardando resultado...');
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.waitForTimeout(8000)
    ]);

    // Procurar PDF
    const pdfLink = await findAndValidatePDFLink(page);

    if (!pdfLink) {
      // Capturar HTML para debug
      const html = await page.content();
      console.log('📄 HTML da página (primeiros 1000 chars):');
      console.log(html.substring(0, 1000));
      
      throw new Error('Link do PDF não encontrado. Verifique se o processo existe na SUSEP.');
    }

    console.log('⬇️ Baixando arquivo...');
    console.log(`🔗 URL: ${pdfLink}`);
    
    // Tentar baixar o arquivo
    let pdfBuffer = null;
    let contentType = null;
    
    try {
      // MÉTODO 1: Navegação direta
      console.log('📥 Método 1: Navegação direta');
      const response = await page.goto(pdfLink, {
        waitUntil: 'networkidle0',
        timeout: CONFIG.navigationTimeout
      });

      if (response) {
        contentType = response.headers()['content-type'];
        console.log(`📋 Content-Type: ${contentType}`);
        
        pdfBuffer = await response.buffer();
        console.log(`📦 Buffer size: ${pdfBuffer.length} bytes`);
        
        // Verificar os primeiros bytes
        const firstBytes = pdfBuffer.toString('utf8', 0, 20);
        console.log(`🔍 Primeiros bytes: ${firstBytes}`);
      }
    } catch (navError) {
      console.log(`⚠️ Método 1 falhou: ${navError.message}`);
      
      // MÉTODO 2: Tentar clicar no link e capturar download
      console.log('📥 Método 2: Clicar no link');
      
      try {
        // Configurar captura de download
        const client = await page.target().createCDPSession();
        
        // Interceptar requests
        await client.send('Network.enable');
        
        // Clicar no link
        await page.evaluate((url) => {
          const link = Array.from(document.querySelectorAll('a')).find(a => a.href === url);
          if (link) link.click();
        }, pdfLink);
        
        await page.waitForTimeout(5000);
        
        // Tentar navegar novamente
        const response2 = await page.goto(pdfLink, { 
          waitUntil: 'networkidle0',
          timeout: CONFIG.navigationTimeout 
        });
        
        if (response2) {
          pdfBuffer = await response2.buffer();
          contentType = response2.headers()['content-type'];
        }
      } catch (clickError) {
        console.log(`⚠️ Método 2 falhou: ${clickError.message}`);
      }
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Não foi possível baixar o arquivo (buffer vazio)');
    }

    // Validar se é PDF
    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    const isValidPDF = pdfHeader.includes('%PDF');
    
    console.log(`🔍 Validação PDF: ${isValidPDF}`);
    console.log(`📋 Header: "${pdfHeader}"`);
    console.log(`📋 Content-Type: ${contentType}`);
    
    if (!isValidPDF) {
      // Se não for PDF, pode ser HTML de erro ou redirect
      const contentPreview = pdfBuffer.toString('utf8', 0, 500);
      console.log('📄 Conteúdo recebido (primeiros 500 chars):');
      console.log(contentPreview);
      
      // Verificar se é HTML
      if (contentPreview.includes('<html') || contentPreview.includes('<!DOCTYPE')) {
        throw new Error('Recebeu HTML ao invés de PDF. O link pode estar incorreto ou exigir autenticação.');
      }
      
      throw new Error(`Arquivo não é PDF válido. Content-Type: ${contentType || 'desconhecido'}`);
    }

    const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ PDF baixado com sucesso!`);
    console.log(`📊 Tamanho: ${tamanhoKB} KB`);
    console.log(`⏱️  Tempo: ${tempoTotal}s`);
    console.log('='.repeat(70) + '\n');

    await browser.close();

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
    console.log('='.repeat(70) + '\n');
    
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message,
        tipo: error.name,
        numeroprocesso: req.body.numeroprocesso,
        timestamp: new Date().toISOString()
      });
    }
  }
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM - Encerrando...');
  process.exit(0);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 API SUSEP v6.0 - PDF Validation Fix');
  console.log('='.repeat(70));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`⏱️  Timeout: ${CONFIG.timeout}ms`);
  console.log('='.repeat(70));
  console.log('✅ Pronto!\n');
});

server.timeout = CONFIG.timeout;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
