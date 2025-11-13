const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const CONFIG = {
  timeout: 180000, // 3 minutos
  puppeteerTimeout: 120000,
  navigationTimeout: 90000
};

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API SUSEP v7.0</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: system-ui;
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
        .badge { 
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
        <h1>📄 API SUSEP Download</h1>
        <span class="badge">v7.0 - Smart PDF Detection</span>
        
        <h3>📡 Endpoint</h3>
        <pre>POST ${req.protocol}://${req.get('host')}/download-susep

{
  "numeroprocesso": "15414.900381/2013-67"
}</pre>
      </div>
    </body>
    </html>
  `);
});

app.get('/health', async (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    version: '7.0',
    uptime: Math.floor(process.uptime()),
    memory: `${Math.round(mem.heapUsed/1024/1024)}MB`
  });
});

// Função para esperar por download via CDP
async function waitForDownload(page, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout esperando download'));
    }, timeout);

    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      
      if (contentType.includes('application/pdf') || url.includes('.pdf')) {
        clearTimeout(timer);
        try {
          const buffer = await response.buffer();
          resolve({ buffer, url, contentType });
        } catch (e) {
          reject(e);
        }
      }
    });
  });
}

// Função para encontrar e baixar PDF de forma inteligente
async function smartDownloadPDF(page) {
  console.log('\n🧠 DOWNLOAD INTELIGENTE INICIADO');
  console.log('='.repeat(70));
  
  // Aguardar elementos carregarem
  await page.waitForTimeout(4000);
  
  // ETAPA 1: Análise completa da página
  console.log('\n📊 ETAPA 1: Analisando página...');
  const pageAnalysis = await page.evaluate(() => {
    const analysis = {
      allLinks: [],
      forms: [],
      buttons: [],
      iframes: [],
      scripts: []
    };
    
    // Links
    document.querySelectorAll('a').forEach(a => {
      analysis.allLinks.push({
        text: a.textContent?.trim() || '',
        href: a.href || '',
        onclick: a.getAttribute('onclick') || '',
        target: a.target || '',
        id: a.id || '',
        className: a.className || ''
      });
    });
    
    // Forms
    document.querySelectorAll('form').forEach(form => {
      analysis.forms.push({
        action: form.action,
        method: form.method,
        id: form.id
      });
    });
    
    // Buttons
    document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(btn => {
      analysis.buttons.push({
        text: btn.textContent?.trim() || btn.value || '',
        type: btn.type,
        onclick: btn.getAttribute('onclick') || ''
      });
    });
    
    // Iframes
    document.querySelectorAll('iframe').forEach(iframe => {
      analysis.iframes.push({
        src: iframe.src,
        id: iframe.id
      });
    });
    
    return analysis;
  });
  
  console.log(`✓ Links encontrados: ${pageAnalysis.allLinks.length}`);
  console.log(`✓ Formulários: ${pageAnalysis.forms.length}`);
  console.log(`✓ Botões: ${pageAnalysis.buttons.length}`);
  console.log(`✓ Iframes: ${pageAnalysis.iframes.length}`);
  
  // ETAPA 2: Procurar link direto para PDF
  console.log('\n🎯 ETAPA 2: Procurando link direto do PDF...');
  
  const directPDFLinks = pageAnalysis.allLinks.filter(link => 
    link.href.toLowerCase().includes('.pdf')
  );
  
  if (directPDFLinks.length > 0) {
    console.log(`✅ Encontrados ${directPDFLinks.length} links diretos para PDF`);
    directPDFLinks.forEach((link, i) => {
      console.log(`  [${i+1}] ${link.text.substring(0, 40)} -> ${link.href.substring(0, 70)}`);
    });
    
    // Tentar baixar o primeiro
    for (const link of directPDFLinks) {
      try {
        console.log(`\n⬇️ Tentando baixar: ${link.href}`);
        const response = await page.goto(link.href, {
          waitUntil: 'networkidle0',
          timeout: CONFIG.navigationTimeout
        });
        
        const buffer = await response.buffer();
        const contentType = response.headers()['content-type'];
        
        if (buffer.toString('utf8', 0, 5).includes('%PDF')) {
          console.log('✅ PDF válido baixado!');
          return buffer;
        } else {
          console.log(`⚠️ Não é PDF. Content-Type: ${contentType}`);
        }
      } catch (e) {
        console.log(`❌ Erro ao baixar: ${e.message}`);
      }
    }
  }
  
  // ETAPA 3: Procurar links de anexo/download
  console.log('\n🎯 ETAPA 3: Procurando links de anexo/download...');
  
  const downloadLinks = pageAnalysis.allLinks.filter(link => {
    const text = link.text.toLowerCase();
    const href = link.href.toLowerCase();
    return (
      text.includes('anexo') || text.includes('download') || 
      text.includes('pdf') || text.includes('arquivo') ||
      href.includes('anexo') || href.includes('download') ||
      href.includes('arquivo')
    );
  });
  
  console.log(`✓ Links de download: ${downloadLinks.length}`);
  downloadLinks.forEach((link, i) => {
    console.log(`  [${i+1}] "${link.text}" -> ${link.href.substring(0, 70)}`);
  });
  
  // ETAPA 4: Tentar clicar em links e interceptar o download
  if (downloadLinks.length > 0) {
    console.log('\n🖱️ ETAPA 4: Tentando clicar nos links...');
    
    for (const link of downloadLinks.slice(0, 3)) { // Tentar os 3 primeiros
      try {
        console.log(`\n🔄 Clicando em: "${link.text}"`);
        
        // Configurar listener para capturar resposta PDF
        const downloadPromise = waitForDownload(page, 15000);
        
        // Clicar no link
        await page.evaluate((href) => {
          const link = Array.from(document.querySelectorAll('a')).find(a => a.href === href);
          if (link) {
            link.click();
            return true;
          }
          return false;
        }, link.href);
        
        // Aguardar download
        try {
          const result = await downloadPromise;
          console.log(`✅ Download capturado! Content-Type: ${result.contentType}`);
          
          if (result.buffer.toString('utf8', 0, 5).includes('%PDF')) {
            console.log('✅ PDF válido!');
            return result.buffer;
          }
        } catch (downloadError) {
          console.log(`⚠️ Timeout ou não houve download: ${downloadError.message}`);
          
          // Tentar navegar diretamente
          console.log('🔄 Tentando navegação direta...');
          const response = await page.goto(link.href, {
            waitUntil: 'networkidle0',
            timeout: 20000
          });
          
          if (response) {
            const buffer = await response.buffer();
            if (buffer.toString('utf8', 0, 5).includes('%PDF')) {
              console.log('✅ PDF obtido por navegação!');
              return buffer;
            }
          }
        }
        
      } catch (clickError) {
        console.log(`❌ Erro no clique: ${clickError.message}`);
      }
    }
  }
  
  // ETAPA 5: Procurar em iframes
  if (pageAnalysis.iframes.length > 0) {
    console.log('\n🎯 ETAPA 5: Verificando iframes...');
    
    for (const iframe of pageAnalysis.iframes) {
      if (iframe.src && iframe.src.includes('.pdf')) {
        console.log(`✅ PDF em iframe: ${iframe.src}`);
        try {
          const response = await page.goto(iframe.src, {
            waitUntil: 'networkidle0',
            timeout: CONFIG.navigationTimeout
          });
          const buffer = await response.buffer();
          
          if (buffer.toString('utf8', 0, 5).includes('%PDF')) {
            return buffer;
          }
        } catch (e) {
          console.log(`❌ Erro ao acessar iframe: ${e.message}`);
        }
      }
    }
  }
  
  // ETAPA 6: Debug completo
  console.log('\n❌ ETAPA 6: Nenhum PDF encontrado. Debug completo:');
  console.log('\n📋 TODOS OS LINKS DA PÁGINA:');
  pageAnalysis.allLinks.forEach((link, i) => {
    console.log(`[${i+1}] "${link.text.substring(0, 50)}" -> ${link.href.substring(0, 80)}`);
  });
  
  // Capturar HTML
  const html = await page.content();
  console.log('\n📄 HTML da página (2000 chars):');
  console.log(html.substring(0, 2000));
  
  throw new Error('Nenhum PDF encontrado após todas as tentativas');
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
        exemplo: { numeroprocesso: '15414.900381/2013-67' }
      });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📥 REQUISIÇÃO - ${new Date().toISOString()}`);
    console.log(`📋 Processo: ${numeroprocesso}`);
    console.log('='.repeat(80));

    console.log('\n🌐 Iniciando navegador...');
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-first-run',
        '--disable-blink-features=AutomationControlled'
      ],
      timeout: CONFIG.puppeteerTimeout
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('✅ Navegador pronto\n');

    console.log('🔍 Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
      waitUntil: 'networkidle2',
      timeout: CONFIG.navigationTimeout
    });
    
    await page.waitForTimeout(3000);
    console.log('✅ Página carregada\n');

    console.log('✍️ Preenchendo formulário...');
    
    const inputSelectors = [
      '#txtNumeroProcesso',
      'input[name*="Processo"]',
      'input[id*="Processo"]',
      'input[type="text"]'
    ];

    let filled = false;
    for (const selector of inputSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click({ clickCount: 3 });
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

    console.log('\n🔎 Submetendo busca...');
    const buttonSelectors = [
      '#btnConsultar',
      'input[type="submit"]',
      'button[type="submit"]',
      'input[value*="Consultar"]'
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

    console.log('\n⏳ Aguardando resultado...');
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {}),
      page.waitForTimeout(10000)
    ]);
    console.log('✅ Resultado carregado\n');

    // DOWNLOAD INTELIGENTE
    const pdfBuffer = await smartDownloadPDF(page);

    const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ SUCESSO!`);
    console.log(`📊 Tamanho: ${tamanhoKB} KB`);
    console.log(`⏱️  Tempo: ${tempoTotal}s`);
    console.log('='.repeat(80) + '\n');

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
    console.error(`\n${'='.repeat(80)}`);
    console.error(`❌ ERRO: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    console.error('='.repeat(80) + '\n');
    
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message,
        tipo: error.name,
        numeroprocesso: req.body.numeroprocesso,
        timestamp: new Date().toISOString(),
        dica: 'Verifique os logs para mais detalhes'
      });
    }
  }
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('SIGTERM', () => {
  console.log('🛑 Encerrando...');
  process.exit(0);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 API SUSEP v7.0 - SMART PDF DETECTION');
  console.log('='.repeat(80));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`⏱️  Timeout: ${CONFIG.timeout / 1000}s`);
  console.log('='.repeat(80));
  console.log('✅ Online!\n');
});

server.timeout = CONFIG.timeout;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
