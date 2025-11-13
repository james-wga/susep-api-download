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
      <title>API SUSEP v11</title>
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
        <span class="badge">v11.0 - Navigation Method</span>
        
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

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '11.0',
    uptime: Math.floor(process.uptime())
  });
});

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
        '--disable-gpu'
      ],
      timeout: 120000
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    console.log('✅ Navegador pronto');

    console.log('\n🔍 Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx/Consultar', {
      waitUntil: 'networkidle2',
      timeout: CONFIG.navigationTimeout
    });
    await page.waitForTimeout(3000);
    console.log('✅ Página carregada');

    console.log('\n✍️ Preenchendo busca...');
    const input = await page.$('#txtNumeroProcesso') || await page.$('input[type="text"]');
    if (input) {
      await input.click({ clickCount: 3 });
      await input.type(numeroprocesso, { delay: 50 });
      console.log('✅ Campo preenchido');
    } else {
      throw new Error('Campo de busca não encontrado');
    }

    console.log('\n🔎 Submetendo...');
    const button = await page.$('#btnConsultar') || await page.$('input[type="submit"]');
    if (button) {
      await button.click();
      console.log('✅ Botão clicado');
    } else {
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
    
    const arquivos = await page.evaluate(() => {
      const results = [];
      const links = [
        ...Array.from(document.querySelectorAll('a.linkDownloadRelatorio')),
        ...Array.from(document.querySelectorAll('a[onclick*="Download"]')),
        ...Array.from(document.querySelectorAll('a[onclick*="download"]'))
      ];
      
      const uniqueLinks = [...new Set(links)];
      
      uniqueLinks.forEach((link) => {
        const onclick = link.getAttribute('onclick') || '';
        
        let path = '';
        let match = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (match) {
          path = match[1];
        }
        
        if (!path) {
          match = onclick.match(/window\.location\s*=\s*['"]([^'"]+)['"]/);
          if (match) path = match[1];
        }
        
        if (!path) return;
        
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
        
        const fullUrl = path.startsWith('http') ? path : `https://www2.susep.gov.br${path}`;
        
        results.push({
          index: results.length + 1,
          nome: nomeArquivo,
          path: path,
          url: fullUrl
        });
      });
      
      return results;
    });

    console.log(`✅ Encontrados ${arquivos.length} arquivos:`);
    arquivos.forEach(arq => {
      console.log(`  [${arq.index}] ${arq.nome}`);
    });

    if (arquivos.length === 0) {
      throw new Error('Nenhum arquivo PDF encontrado');
    }

    let arquivoIndex = 0;
    if (indiceArquivo && indiceArquivo > 0 && indiceArquivo <= arquivos.length) {
      arquivoIndex = indiceArquivo - 1;
    }
    
    const arquivoParaBaixar = arquivos[arquivoIndex];
    console.log(`\n📎 Baixando: [${arquivoParaBaixar.index}] ${arquivoParaBaixar.nome}`);
    console.log(`🔗 URL: ${arquivoParaBaixar.url}`);

    // Método simples: Navegar diretamente para o URL completo
    console.log('\n⬇️ Navegando para o PDF...');
    
    const pdfResponse = await page.goto(arquivoParaBaixar.url, {
      waitUntil: 'networkidle0',
      timeout: CONFIG.navigationTimeout
    });

    if (!pdfResponse) {
      throw new Error('Nenhuma resposta ao acessar o PDF');
    }

    console.log(`📡 Status: ${pdfResponse.status()}`);
    console.log(`📋 Content-Type: ${pdfResponse.headers()['content-type']}`);

    const pdfBuffer = await pdfResponse.buffer();
    console.log(`📦 Buffer recebido: ${pdfBuffer.length} bytes`);

    // Validar PDF
    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    console.log(`🔍 Header: "${pdfHeader}"`);
    
    if (!pdfHeader.includes('%PDF')) {
      console.log(`\n⚠️ NÃO É PDF!`);
      console.log(`📄 Conteúdo (primeiros 300 chars):`);
      console.log(pdfBuffer.toString('utf8', 0, 300));
      
      // Verificar se é HTML de erro
      const content = pdfBuffer.toString('utf8', 0, 500);
      if (content.includes('<html') || content.includes('<!DOCTYPE')) {
        throw new Error('Recebeu HTML ao invés de PDF - possível erro de autenticação ou sessão expirada');
      }
      
      throw new Error('Arquivo baixado não é um PDF válido');
    }

    const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ SUCESSO!`);
    console.log(`📊 Arquivo: ${arquivoParaBaixar.nome}`);
    console.log(`📊 Tamanho: ${tamanhoKB} KB`);
    console.log(`⏱️  Tempo: ${tempoTotal}s`);
    console.log('='.repeat(80) + '\n');

    await browser.close();

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
  console.log('🚀 API SUSEP v11.0 - NAVIGATION METHOD');
  console.log('='.repeat(80));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`📡 Endpoint: POST /download-susep`);
  console.log('='.repeat(80));
  console.log('✅ Online!\n');
});

server.timeout = CONFIG.timeout;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
