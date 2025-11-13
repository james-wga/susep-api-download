// index.js - API SUSEP v14.0 - Estratégia com evento de download

const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

const CONFIG = {
  timeout: 180000,          // timeout total da requisição HTTP
  navigationTimeout: 90000  // timeout de navegação / download
};

// Helper para converter stream em Buffer
async function streamToBuffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API SUSEP v14.0</title>
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
        <span class="badge">v14.0 - Download Event Strategy</span>
        
        <div class="success">
          <strong>✓ Estratégia consolidada:</strong><br>
          Clica no link original, captura o evento de download e retorna o PDF em streaming.
        </div>

        <h3>📡 Endpoint</h3>
        <pre>POST ${req.protocol}://${req.get('host')}/download-susep

{
  "numeroprocesso": "15414.900381/2013-67",
  "indiceArquivo": 1
}</pre>

      </div>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '14.0',
    uptime: Math.floor(process.uptime())
  });
});

app.post('/download-susep', async (req, res) => {
  let browser = null;
  const startTime = Date.now();

  // Garantir que request/response respeitem o SLA de timeout
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
    console.log(`📥 DOWNLOAD SUSEP v14.0 - ${new Date().toISOString()}`);
    console.log(`📋 Processo: ${numeroprocesso}`);
    if (indiceArquivo) {
      console.log(`📎 Índice solicitado: ${indiceArquivo}`);
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
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list'
      ],
      ignoreHTTPSErrors: true,
      timeout: 120000
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    console.log('✅ Navegador pronto');

    console.log('\n🔍 Acessando SUSEP...');
    await page.goto(
      'https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx/Consultar',
      {
        waitUntil: 'networkidle2',
        timeout: CONFIG.navigationTimeout
      }
    );
    await page.waitForTimeout(3000);
    console.log('✅ Página de consulta carregada');

    console.log('\n✍️ Preenchendo busca...');
    const input =
      (await page.$('#txtNumeroProcesso')) ||
      (await page.$('input[type="text"]'));

    if (!input) {
      throw new Error('Campo de busca não encontrado');
    }

    await input.click({ clickCount: 3 });
    await input.type(numeroprocesso, { delay: 50 });
    console.log('✅ Campo preenchido');

    console.log('\n🔎 Submetendo busca...');
    const button =
      (await page.$('#btnConsultar')) ||
      (await page.$('input[type="submit"]'));

    if (!button) {
      throw new Error('Botão não encontrado');
    }

    await Promise.all([
      page.waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: CONFIG.navigationTimeout
      }).catch(() => {}),
      button.click()
    ]);

    await page.waitForTimeout(3000);
    console.log('✅ Resultado carregado');

    console.log('\n📄 Buscando arquivos PDF...');

    const arquivos = await page.evaluate(() => {
      const results = [];
      const links = [
        ...Array.from(document.querySelectorAll('a.linkDownloadRelatorio')),
        ...Array.from(document.querySelectorAll('a[onclick*="Download"]'))
      ];

      const uniqueLinks = [...new Set(links)];

      uniqueLinks.forEach((link) => {
        const onclick = link.getAttribute('onclick') || '';

        let path = '';
        const match = onclick.match(/location\\.href\\s*=\\s*['"]([^'"]+)['"]/);
        if (match) {
          path = match[1];
        }

        if (!path) return;

        const idMatch = path.match(/DownloadConsultaPublica\\/(\\d+)/);
        const downloadId = idMatch ? idMatch[1] : null;
        if (!downloadId) return;

        let nomeArquivo = 'documento.pdf';
        const tr = link.closest('tr');
        if (tr) {
          const firstCell = tr.querySelector('td');
          if (firstCell) {
            const texto = firstCell.textContent.trim();
            const pdfMatch = texto.match(/([^\\n]+\\.pdf)/i);
            if (pdfMatch) {
              nomeArquivo = pdfMatch[1].trim();
            }
          }
        }

        results.push({
          index: results.length + 1,
          nome: nomeArquivo,
          downloadId,
          path
        });
      });

      return results;
    });

    console.log(`\n📊 Encontrados ${arquivos.length} arquivos:`);
    arquivos.forEach((arq) => {
      console.log(`  [${arq.index}] ${arq.nome} (ID: ${arq.downloadId})`);
    });

    if (arquivos.length === 0) {
      throw new Error('Nenhum arquivo PDF encontrado');
    }

    let arquivoIndex = 0;
    if (indiceArquivo && indiceArquivo > 0 && indiceArquivo <= arquivos.length) {
      arquivoIndex = indiceArquivo - 1;
    }

    const arquivoParaBaixar = arquivos[arquivoIndex];
    console.log(`\n📎 Selecionado: [${arquivoParaBaixar.index}] ${arquivoParaBaixar.nome}`);
    console.log(`🔐 DownloadId: ${arquivoParaBaixar.downloadId}`);
    console.log(`🔗 Path interno: ${arquivoParaBaixar.path}`);

    console.log('\n⬇️ Disparando download via clique no link original...');

    // Dispara o clique no link correto e espera o evento de download
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: CONFIG.navigationTimeout }),
      page.evaluate((downloadId) => {
        const links = [
          ...Array.from(document.querySelectorAll('a.linkDownloadRelatorio')),
          ...Array.from(document.querySelectorAll('a[onclick*="Download"]'))
        ];

        const target = links.find((link) => {
          const onclick = link.getAttribute('onclick') || '';
          return onclick.includes(downloadId);
        });

        if (target) {
          target.click();
        } else {
          throw new Error('Link de download não encontrado no DOM');
        }
      }, arquivoParaBaixar.downloadId)
    ]);

    const suggestedName = download.suggestedFilename();
    console.log(`✅ Evento de download recebido. Nome sugerido: ${suggestedName}`);

    console.log('📦 Lendo stream do download...');
    const stream = await download.createReadStream();
    const pdfBuffer = await streamToBuffer(stream);

    console.log(`✓ Buffer capturado: ${pdfBuffer.length} bytes`);

    // Validação básica de header PDF
    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    console.log(`🔍 Header: "${pdfHeader}"`);

    if (!pdfHeader.includes('%PDF')) {
      console.log('\n⚠️ Conteúdo não parece ser um PDF válido');
      const preview = pdfBuffer.toString('utf8', 0, 500);
      console.log('📄 Preview (primeiros 500 chars):');
      console.log(preview);
      throw new Error('Arquivo retornado não é um PDF válido');
    }

    const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ DOWNLOAD CONCLUÍDO COM SUCESSO!');
    console.log(`📊 Arquivo: ${arquivoParaBaixar.nome}`);
    console.log(`📊 Tamanho: ${tamanhoKB} KB`);
    console.log(`⏱️  Tempo total: ${tempoTotal}s`);
    console.log('='.repeat(80) + '\n');

    await browser.close();

    const filenameSanitizado = (suggestedName || arquivoParaBaixar.nome || 'arquivo.pdf')
      .replace(/[^\w\.-]/g, '_');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filenameSanitizado}"`,
      'Content-Length': pdfBuffer.length,
      'X-Process-Time': `${tempoTotal}s`,
      'X-File-Size': `${tamanhoKB}KB`,
      'X-File-Name': suggestedName || arquivoParaBaixar.nome,
      'X-Total-Files': arquivos.length.toString()
    });

    res.send(pdfBuffer);
  } catch (error) {
    console.error(`\n${'='.repeat(80)}`);
    console.error(`❌ ERRO: ${error.message}`);
    console.error(`Tipo: ${error.name}`);
    console.error(`Stack: ${error.stack}`);
    console.error('='.repeat(80) + '\n');

    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // best-effort shutdown
      }
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message,
        tipo: error.name,
        numeroprocesso: req.body?.numeroprocesso,
        timestamp: new Date().toISOString()
      });
    }
  }
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM - Encerrando...');
  process.exit(0);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 API SUSEP v14.0 - Download Event Strategy');
  console.log('='.repeat(80));
  console.log(`📍 Porta: ${PORT}`);
  console.log('📡 Endpoint: POST /download-susep');
  console.log('='.repeat(80));
  console.log('✅ Online!\n');
});

server.timeout = CONFIG.timeout;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
