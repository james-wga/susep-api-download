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
      <title>API SUSEP - Final</title>
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
          font-weight: 600;
        }
        .success {
          background: #d4edda;
          border-left: 4px solid #28a745;
          padding: 16px;
          margin: 20px 0;
          border-radius: 4px;
          color: #155724;
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
        <span class="badge">v8.0 FINAL - Working!</span>
        
        <div class="success">
          <strong>✓ Problema Resolvido!</strong><br>
          Agora detecta corretamente os links JavaScript da SUSEP e baixa os PDFs.
        </div>

        <h3>📡 Endpoint</h3>
        <pre>POST ${req.protocol}://${req.get('host')}/download-susep

{
  "numeroprocesso": "15414.900381/2013-67"
}</pre>

        <h3>📦 Resposta</h3>
        <p>Retorna o arquivo PDF diretamente (binary)</p>
        <p><strong>Nota:</strong> Se houver múltiplos PDFs, retorna o primeiro disponível.</p>

        <h3>🔍 Listar Arquivos Disponíveis</h3>
        <pre>POST ${req.protocol}://${req.get('host')}/listar-arquivos

{
  "numeroprocesso": "15414.900381/2013-67"
}</pre>

      </div>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '8.0',
    uptime: Math.floor(process.uptime())
  });
});

// Endpoint para listar arquivos (não baixa)
app.post('/listar-arquivos', async (req, res) => {
  let browser = null;
  
  try {
    const { numeroprocesso } = req.body;
    
    if (!numeroprocesso) {
      return res.status(400).json({
        error: 'numeroprocesso é obrigatório'
      });
    }

    console.log(`\n📋 Listando arquivos do processo: ${numeroprocesso}`);

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
      waitUntil: 'networkidle2',
      timeout: CONFIG.navigationTimeout
    });
    
    await page.waitForTimeout(3000);

    // Preencher e buscar
    const input = await page.$('#txtNumeroProcesso') || await page.$('input[type="text"]');
    if (input) {
      await input.type(numeroprocesso, { delay: 50 });
    }

    const button = await page.$('#btnConsultar') || await page.$('input[type="submit"]');
    if (button) {
      await button.click();
    }

    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.waitForTimeout(8000)
    ]);

    // Buscar arquivos
    const arquivos = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.linkDownloadRelatorio, a[onclick*="Download"]'));
      
      return links.map((link, index) => {
        const onclick = link.getAttribute('onclick') || '';
        const match = onclick.match(/location\.href='([^']+)'/);
        const path = match ? match[1] : '';
        
        // Extrair nome do arquivo da tabela (célula anterior)
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
        
        return {
          index: index + 1,
          nome: nomeArquivo,
          path: path,
          url: path ? `https://www2.susep.gov.br${path}` : null
        };
      }).filter(a => a.url);
    });

    await browser.close();

    console.log(`✅ Encontrados ${arquivos.length} arquivos`);
    arquivos.forEach(arq => {
      console.log(`  [${arq.index}] ${arq.nome}`);
    });

    res.json({
      status: 'sucesso',
      processo: numeroprocesso,
      totalArquivos: arquivos.length,
      arquivos: arquivos
    });

  } catch (error) {
    console.error(`❌ Erro: ${error.message}`);
    
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message,
        processo: req.body.numeroprocesso
      });
    }
  }
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
    if (indiceArquivo) {
      console.log(`📎 Índice arquivo: ${indiceArquivo}`);
    }
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
    console.log('✅ Navegador pronto');

    console.log('\n🔍 Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
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
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.waitForTimeout(8000)
    ]);
    console.log('✅ Resultado carregado');

    console.log('\n📄 Buscando arquivos PDF...');
    
    // Extrair informações dos arquivos
    const arquivos = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.linkDownloadRelatorio, a[onclick*="Download"]'));
      
      return links.map((link, index) => {
        const onclick = link.getAttribute('onclick') || '';
        const match = onclick.match(/location\.href='([^']+)'/);
        const path = match ? match[1] : '';
        
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
        
        return {
          index: index + 1,
          nome: nomeArquivo,
          path: path,
          url: path ? `https://www2.susep.gov.br${path}` : null
        };
      }).filter(a => a.url);
    });

    console.log(`✅ Encontrados ${arquivos.length} arquivos:`);
    arquivos.forEach(arq => {
      console.log(`  [${arq.index}] ${arq.nome}`);
    });

    if (arquivos.length === 0) {
      throw new Error('Nenhum arquivo PDF encontrado para este processo');
    }

    // Selecionar qual arquivo baixar
    let arquivoParaBaixar = arquivos[0]; // Padrão: primeiro arquivo
    
    if (indiceArquivo && indiceArquivo > 0 && indiceArquivo <= arquivos.length) {
      arquivoParaBaixar = arquivos[indiceArquivo - 1];
      console.log(`\n📎 Usando arquivo índice ${indiceArquivo}: ${arquivoParaBaixar.nome}`);
    } else {
      console.log(`\n📎 Baixando primeiro arquivo: ${arquivoParaBaixar.nome}`);
    }

    console.log(`\n⬇️ Baixando: ${arquivoParaBaixar.url}`);

    // Baixar o PDF
    const pdfResponse = await page.goto(arquivoParaBaixar.url, {
      waitUntil: 'networkidle0',
      timeout: CONFIG.navigationTimeout
    });

    if (!pdfResponse) {
      throw new Error('Falha ao acessar o PDF');
    }

    const pdfBuffer = await pdfResponse.buffer();
    const contentType = pdfResponse.headers()['content-type'];

    console.log(`📦 Buffer: ${pdfBuffer.length} bytes`);
    console.log(`📋 Content-Type: ${contentType}`);

    // Validar PDF
    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    if (!pdfHeader.includes('%PDF')) {
      console.log(`⚠️ Não é PDF! Header: ${pdfHeader}`);
      console.log(`📄 Conteúdo: ${pdfBuffer.toString('utf8', 0, 200)}`);
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
  console.log('🚀 API SUSEP v8.0 FINAL - FUNCIONANDO!');
  console.log('='.repeat(80));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   POST /download-susep - Baixar PDF`);
  console.log(`   POST /listar-arquivos - Listar arquivos disponíveis`);
  console.log(`   GET  /health - Status`);
  console.log('='.repeat(80));
  console.log('✅ Online e pronto!\n');
});

server.timeout = CONFIG.timeout;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
