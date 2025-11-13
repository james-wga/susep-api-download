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
      <title>API SUSEP v12</title>
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
        <span class="badge">v12.0 - FINAL WORKING!</span>
        
        <div class="success">
          <strong>✓ Rotas Corrigidas!</strong><br>
          Consulta: /Produto.aspx/Consultar<br>
          Download: /Produto.aspx/DownloadConsultaPublica/{ID}
        </div>

        <h3>📡 Endpoint</h3>
        <pre>POST ${req.protocol}://${req.get('host')}/download-susep

{
  "numeroprocesso": "15414.900381/2013-67"
}</pre>

        <h3>📦 Resposta</h3>
        <p>Retorna o arquivo PDF (por padrão o primeiro disponível)</p>
        <p>Para escolher qual arquivo: <code>{"numeroprocesso": "...", "indiceArquivo": 2}</code></p>
      </div>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '12.0',
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
        '--disable-gpu'
      ],
      timeout: 120000
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    console.log('✅ Navegador pronto');

    console.log('\n🔍 Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx/Consultar', {
      waitUntil: 'networkidle2',
      timeout: CONFIG.navigationTimeout
    });
    await page.waitForTimeout(3000);
    console.log('✅ Página inicial carregada');

    console.log('\n✍️ Preenchendo busca...');
    const input = await page.$('#txtNumeroProcesso') || await page.$('input[type="text"]');
    if (input) {
      await input.click({ clickCount: 3 });
      await input.type(numeroprocesso, { delay: 50 });
      console.log('✅ Campo preenchido');
    } else {
      throw new Error('Campo de busca não encontrado');
    }

    console.log('\n🔎 Submetendo busca...');
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
    
    const currentUrl = page.url();
    console.log(`✅ Resultado carregado: ${currentUrl}`);

    console.log('\n📄 Buscando arquivos PDF...');
    
    // Extrair informações dos links de download
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
        
        // Extrair o path completo do onclick
        // Exemplo: location.href='/safe/menumercado/REP2/Produto.aspx/DownloadConsultaPublica/3898'
        let path = '';
        let match = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (match) {
          path = match[1];
        } else {
          match = onclick.match(/window\.location\s*=\s*['"]([^'"]+)['"]/);
          if (match) {
            path = match[1];
          }
        }
        
        if (!path) return;
        
        // Extrair o ID do download
        // Exemplo: /safe/menumercado/REP2/Produto.aspx/DownloadConsultaPublica/3898
        const idMatch = path.match(/DownloadConsultaPublica\/(\d+)/);
        const downloadId = idMatch ? idMatch[1] : null;
        
        if (!downloadId) return;
        
        // Extrair nome do arquivo da tabela
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
          downloadId: downloadId,
          path: path
        });
      });
      
      return results;
    });

    console.log(`\n📊 Encontrados ${arquivos.length} arquivos:`);
    arquivos.forEach(arq => {
      console.log(`  [${arq.index}] ${arq.nome} (ID: ${arq.downloadId})`);
    });

    if (arquivos.length === 0) {
      throw new Error('Nenhum arquivo PDF encontrado para este processo');
    }

    // Selecionar qual arquivo baixar
    let arquivoIndex = 0;
    if (indiceArquivo && indiceArquivo > 0 && indiceArquivo <= arquivos.length) {
      arquivoIndex = indiceArquivo - 1;
    }
    
    const arquivoParaBaixar = arquivos[arquivoIndex];
    console.log(`\n📎 Selecionado: [${arquivoParaBaixar.index}] ${arquivoParaBaixar.nome}`);

    // Construir URL COMPLETA do download
    const downloadUrl = `https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx/DownloadConsultaPublica/${arquivoParaBaixar.downloadId}`;
    
    console.log(`🔗 URL de download: ${downloadUrl}`);

    // Baixar o PDF navegando para a URL
    console.log('\n⬇️ Baixando PDF...');
    
    const pdfResponse = await page.goto(downloadUrl, {
      waitUntil: 'networkidle0',
      timeout: CONFIG.navigationTimeout
    });

    if (!pdfResponse) {
      throw new Error('Nenhuma resposta ao tentar baixar o PDF');
    }

    const status = pdfResponse.status();
    const contentType = pdfResponse.headers()['content-type'] || 'unknown';
    
    console.log(`📡 Status HTTP: ${status}`);
    console.log(`📋 Content-Type: ${contentType}`);

    if (status !== 200) {
      throw new Error(`Erro HTTP ${status} ao baixar o PDF`);
    }

    const pdfBuffer = await pdfResponse.buffer();
    console.log(`📦 Buffer recebido: ${pdfBuffer.length} bytes`);

    // Validar se é PDF
    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    console.log(`🔍 Header: "${pdfHeader}"`);
    
    if (!pdfHeader.includes('%PDF')) {
      console.log(`\n⚠️ CONTEÚDO RECEBIDO NÃO É PDF!`);
      const preview = pdfBuffer.toString('utf8', 0, 500);
      console.log(`📄 Preview do conteúdo:`);
      console.log(preview);
      
      if (preview.includes('<html') || preview.includes('<!DOCTYPE')) {
        throw new Error('Recebeu HTML ao invés de PDF - possível erro de sessão ou autenticação');
      }
      
      throw new Error(`Arquivo não é um PDF válido. Content-Type: ${contentType}`);
    }

    const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ DOWNLOAD CONCLUÍDO COM SUCESSO!`);
    console.log(`📊 Arquivo: ${arquivoParaBaixar.nome}`);
    console.log(`📊 Tamanho: ${tamanhoKB} KB`);
    console.log(`⏱️  Tempo total: ${tempoTotal}s`);
    console.log(`📂 Total de arquivos disponíveis: ${arquivos.length}`);
    console.log('='.repeat(80) + '\n');

    await browser.close();

    // Preparar nome do arquivo para download
    const filename = arquivoParaBaixar.nome.replace(/[^\w\.-]/g, '_');

    // Enviar PDF
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
      'X-Process-Time': `${tempoTotal}s`,
      'X-File-Size': `${tamanhoKB}KB`,
      'X-File-Name': arquivoParaBaixar.nome,
      'X-File-Index': arquivoParaBaixar.index.toString(),
      'X-Total-Files': arquivos.length.toString(),
      'X-Download-ID': arquivoParaBaixar.downloadId
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
        console.error('Erro ao fechar browser:', e.message);
      }
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message,
        tipo: error.name,
        numeroprocesso: req.body.numeroprocesso,
        timestamp: new Date().toISOString(),
        dica: 'Verifique se o processo existe na SUSEP'
      });
    }
  }
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM recebido - Encerrando gracefully...');
  process.exit(0);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 API SUSEP v12.0 - FINAL WORKING VERSION!');
  console.log('='.repeat(80));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🌐 Host: 0.0.0.0`);
  console.log(`📡 Endpoint: POST /download-susep`);
  console.log(`⏱️  Timeout: ${CONFIG.timeout / 1000}s`);
  console.log('='.repeat(80));
  console.log('✅ Pronto para receber requisições!\n');
});

server.timeout = CONFIG.timeout;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
