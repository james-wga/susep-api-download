const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

const CONFIG = {
  timeout: 180000,
  navigationTimeout: 90000
};

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API SUSEP v10</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: system-ui;
          max-width: 900px;
          margin: 40px auto;
          padding: 20px;
          background: #f8f9fa;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 { color: #28a745; }
        .badge {
          padding: 6px 16px;
          background: #28a745;
          color: white;
          border-radius: 20px;
          font-size: 13px;
        }
        pre {
          background: #282c34;
          color: #61dafb;
          padding: 16px;
          border-radius: 6px;
          overflow-x: auto;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✅ API SUSEP Download</h1>
        <span class="badge">v10.0 - Click Method</span>
        
        <h3>📡 Endpoint</h3>
        <pre>POST ${req.protocol}://${req.get('host')}/download-susep

{
  "numeroprocesso": "15414.900381/2013-67"
}</pre>

        <p style="margin-top: 20px; color: #6c757d;">
          Agora clica no link ao invés de navegar diretamente, mantendo a sessão da SUSEP.
        </p>
      </div>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '10.0',
    uptime: Math.floor(process.uptime())
  });
});

// Endpoint principal de download
app.post('/download-susep', async (req, res) => {
  let browser = null;
  const startTime = Date.now();
  
  req.setTimeout(CONFIG.timeout);
  res.setTimeout(CONFIG.timeout);
  
  try {
    const { numeroprocesso, indiceArquivo } = req.body;
    
    if (!numeroprocesso) {
      return res.status(400).json({
        error: 'numeroprocesso é obrigatório',
        exemplo: { numeroprocesso: '15414.900381/2013-67' }
      });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📥 DOWNLOAD SUSEP - ${new Date().toISOString()}`);
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
        '--no-first-run'
      ],
      timeout: 120000
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Habilitar cookies e cache
    await page.setCacheEnabled(true);
    
    console.log('✅ Navegador pronto');

    console.log('\n🔍 Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx/Consultar', {
      waitUntil: 'networkidle2',
      timeout: CONFIG.navigationTimeout
    });
    await page.waitForTimeout(3000);
    console.log('✅ Página carregada');

    console.log('\n✍️ Preenchendo busca...');
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
          await element.click({ clickCount: 3 });
          await element.type(numeroprocesso, { delay: 50 });
          console.log(`✅ Preenchido: ${selector}`);
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

    console.log('\n🔎 Submetendo...');
    const buttonSelectors = [
      '#btnConsultar',
      'input[type="submit"]',
      'button[type="submit"]'
    ];

    let clicked = false;
    for (const selector of buttonSelectors) {
      try {
        await page.click(selector);
        console.log(`✅ Clicado: ${selector}`);
        clicked = true;
        break;
      } catch (e) {
        continue;
      }
    }

    if (!clicked) {
      throw new Error('Botão não encontrado');
    }

    console.log('\n⏳ Aguardando resultado...');
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {}),
      page.waitForTimeout(10000)
    ]);
    
    await page.waitForTimeout(3000);
    console.log('✅ Resultado carregado');

    console.log('\n📄 Buscando arquivos PDF...');
    
    // Encontrar links de download
    const arquivos = await page.evaluate(() => {
      const results = [];
      const allDownloadLinks = new Set([
        ...Array.from(document.querySelectorAll('a.linkDownloadRelatorio')),
        ...Array.from(document.querySelectorAll('a[onclick*="Download"]')),
        ...Array.from(document.querySelectorAll('a[onclick*="download"]'))
      ]);
      
      allDownloadLinks.forEach((link) => {
        const onclick = link.getAttribute('onclick') || '';
        
        // Extrair path do onclick
        let path = '';
        let match = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (match) {
          path = match[1];
        }
        
        if (!path) {
          match = onclick.match(/window\.location\s*=\s*['"]([^'"]+)['"]/);
          if (match) {
            path = match[1];
          }
        }
        
        if (!path) return;
        
        // Extrair nome do arquivo
        let nomeArquivo = 'documento.pdf';
        const tr = link.closest('tr');
        if (tr) {
          const firstCell = tr.querySelector('td');
          if (firstCell) {
            const texto = firstCell.textContent.trim();
            const pdfMatch = texto.match(/([^\n]+\.pdf)/i);
            if (pdfMatch) {
              nomeArquivo = pdfMatch[1].trim();
            }
          }
        }
        
        results.push({
          index: results.length + 1,
          nome: nomeArquivo,
          path: path,
          onclick: onclick,
          element: link.outerHTML
        });
      });
      
      return results;
    });

    console.log(`✅ Encontrados ${arquivos.length} arquivos:`);
    arquivos.forEach(arq => {
      console.log(`  [${arq.index}] ${arq.nome}`);
    });

    if (arquivos.length === 0) {
      throw new Error('Nenhum arquivo PDF encontrado para este processo');
    }

    // Selecionar arquivo
    let arquivoIndex = 0;
    if (indiceArquivo && indiceArquivo > 0 && indiceArquivo <= arquivos.length) {
      arquivoIndex = indiceArquivo - 1;
    }
    
    const arquivoParaBaixar = arquivos[arquivoIndex];
    console.log(`\n📎 Baixando: [${arquivoParaBaixar.index}] ${arquivoParaBaixar.nome}`);

    // MÉTODO 1: Clicar no link usando JavaScript (mantém sessão)
    console.log('\n🖱️ MÉTODO 1: Clicando no link via JavaScript...');
    
    let pdfBuffer = null;
    
    try {
      // Configurar listener para capturar o download
      const downloadPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout esperando PDF'));
        }, 30000);

        page.on('response', async (response) => {
          try {
            const url = response.url();
            const contentType = response.headers()['content-type'] || '';
            
            console.log(`📡 Response: ${url.substring(0, 80)}`);
            console.log(`   Content-Type: ${contentType}`);
            
            if (contentType.includes('pdf') || 
                url.includes('DownloadConsultaPublica') ||
                url.includes('.pdf')) {
              
              console.log('✓ PDF detectado, capturando buffer...');
              const buffer = await response.buffer();
              
              clearTimeout(timeout);
              resolve(buffer);
            }
          } catch (e) {
            console.log(`⚠️ Erro ao processar response: ${e.message}`);
          }
        });
      });

      // Clicar no link
      console.log('🖱️ Executando clique...');
      await page.evaluate((onclick) => {
        eval(onclick);
      }, arquivoParaBaixar.onclick);
      
      console.log('⏳ Aguardando PDF...');
      pdfBuffer = await downloadPromise;
      console.log('✅ PDF capturado!');
      
    } catch (clickError) {
      console.log(`⚠️ Método 1 falhou: ${clickError.message}`);
      
      // MÉTODO 2: Usar CDP para baixar
      console.log('\n🔄 MÉTODO 2: Tentando via CDP...');
      
      try {
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: '/tmp'
        });
        
        // Executar o clique novamente
        await page.evaluate((onclick) => {
          eval(onclick);
        }, arquivoParaBaixar.onclick);
        
        await page.waitForTimeout(5000);
        
        // Tentar pegar o PDF da última navegação
        const currentUrl = page.url();
        if (currentUrl.includes('DownloadConsultaPublica')) {
          const response = await page.goto(currentUrl, {
            waitUntil: 'networkidle0',
            timeout: CONFIG.navigationTimeout
          });
          
          if (response) {
            pdfBuffer = await response.buffer();
          }
        }
      } catch (cdpError) {
        console.log(`⚠️ Método 2 falhou: ${cdpError.message}`);
      }
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Não foi possível capturar o PDF após múltiplas tentativas');
    }

    // Validar PDF
    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    if (!pdfHeader.includes('%PDF')) {
      console.log(`⚠️ Conteúdo recebido não é PDF`);
      console.log(`Header: ${pdfHeader}`);
      console.log(`Preview: ${pdfBuffer.toString('utf8', 0, 200)}`);
      throw new Error('Arquivo baixado não é um PDF válido');
    }

    const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ SUCESSO!`);
    console.log(`📊 Arquivo: ${arquivoParaBaixar.nome}`);
    console.log(`📊 Tamanho: ${tamanhoKB} KB`);
    console.log(`⏱️  Tempo: ${tempoTotal}s`);
    console.log('='.repeat(80) + '\n');

    await browser.close();

    // Enviar PDF
    const filename = arquivoParaBaixar.nome.replace(/[^\w\.-]/g, '_');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
      'X-Process-Time': `${tempoTotal}s`,
      'X-File-Size': `${tamanhoKB}KB`,
      'X-File-Name': arquivoParaBaixar.nome,
      'X-Total-Files': arquivos.length.toString()
    });

    res.send(pdfBuffer);

  } catch (error) {
    console.error(`\n❌ ERRO: ${error.message}`);
    console.error(`Stack: ${error.stack}\n`);
    
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
  console.error('Unhandled Rejection:', error);
});

process.on('SIGTERM', () => {
  console.log('🛑 Encerrando...');
  process.exit(0);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 API SUSEP v10.0 - CLICK METHOD');
  console.log('='.repeat(80));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`📡 Endpoint: POST /download-susep`);
  console.log('='.repeat(80));
  console.log('✅ Online!\n');
});

server.timeout = CONFIG.timeout;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
