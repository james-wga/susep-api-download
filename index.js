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
        <span class="badge">v9.0 - Enhanced Detection</span>
        
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
    version: '9.0',
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
    
    // Aguardar elementos de download carregarem
    await page.waitForTimeout(3000);
    
    console.log('✅ Resultado carregado');

    console.log('\n📄 Buscando arquivos PDF com detecção avançada...');
    
    // Extrair informações dos arquivos com múltiplas estratégias
    const arquivos = await page.evaluate(() => {
      const results = [];
      
      console.log('🔍 Estratégia 1: Procurando a.linkDownloadRelatorio');
      const links1 = document.querySelectorAll('a.linkDownloadRelatorio');
      console.log(`Encontrados: ${links1.length}`);
      
      console.log('🔍 Estratégia 2: Procurando a com onclick*=Download');
      const links2 = document.querySelectorAll('a[onclick*="Download"]');
      console.log(`Encontrados: ${links2.length}`);
      
      console.log('🔍 Estratégia 3: Procurando a com onclick*=download (minúsculo)');
      const links3 = document.querySelectorAll('a[onclick*="download"]');
      console.log(`Encontrados: ${links3.length}`);
      
      console.log('🔍 Estratégia 4: Procurando a com texto "Download"');
      const allLinks = Array.from(document.querySelectorAll('a'));
      const links4 = allLinks.filter(a => a.textContent.toLowerCase().includes('download'));
      console.log(`Encontrados: ${links4.length}`);
      
      // Combinar todos os links encontrados (sem duplicatas)
      const allDownloadLinks = new Set([
        ...Array.from(links1),
        ...Array.from(links2),
        ...Array.from(links3),
        ...links4
      ]);
      
      console.log(`Total de links únicos: ${allDownloadLinks.size}`);
      
      allDownloadLinks.forEach((link, index) => {
        const onclick = link.getAttribute('onclick') || '';
        const href = link.href || '';
        
        console.log(`\nAnalisando link ${index + 1}:`);
        console.log(`  Texto: ${link.textContent.trim()}`);
        console.log(`  OnClick: ${onclick}`);
        console.log(`  Href: ${href}`);
        
        // Tentar extrair o path do onclick
        let path = '';
        
        // Padrão 1: location.href='/path'
        let match = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (match) {
          path = match[1];
          console.log(`  ✓ Path encontrado (padrão 1): ${path}`);
        }
        
        // Padrão 2: window.location='/path'
        if (!path) {
          match = onclick.match(/window\.location\s*=\s*['"]([^'"]+)['"]/);
          if (match) {
            path = match[1];
            console.log(`  ✓ Path encontrado (padrão 2): ${path}`);
          }
        }
        
        // Padrão 3: href direto se não for javascript:
        if (!path && href && !href.includes('javascript:')) {
          path = href.replace('https://www2.susep.gov.br', '');
          console.log(`  ✓ Path do href: ${path}`);
        }
        
        if (!path) {
          console.log(`  ✗ Nenhum path encontrado`);
          return;
        }
        
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
              console.log(`  ✓ Nome do arquivo: ${nomeArquivo}`);
            }
          }
        }
        
        const url = path.startsWith('http') ? path : `https://www2.susep.gov.br${path}`;
        
        results.push({
          index: results.length + 1,
          nome: nomeArquivo,
          path: path,
          url: url
        });
        
        console.log(`  ✓ Arquivo adicionado: ${nomeArquivo}`);
      });
      
      return results;
    });

    console.log(`\n📊 RESULTADO: ${arquivos.length} arquivos encontrados`);
    
    if (arquivos.length > 0) {
      console.log('\n📎 Arquivos disponíveis:');
      arquivos.forEach(arq => {
        console.log(`  [${arq.index}] ${arq.nome}`);
        console.log(`      ${arq.url}`);
      });
    } else {
      // Se não encontrou nada, fazer debug completo
      console.log('\n❌ Nenhum arquivo encontrado. Executando debug...');
      
      const debugInfo = await page.evaluate(() => {
        return {
          url: window.location.href,
          allLinks: Array.from(document.querySelectorAll('a')).map(a => ({
            text: a.textContent.trim().substring(0, 50),
            href: a.href,
            onclick: a.getAttribute('onclick')?.substring(0, 100),
            class: a.className
          })),
          html: document.body.innerHTML.substring(0, 2000)
        };
      });
      
      console.log('\n📋 URL atual:', debugInfo.url);
      console.log('\n📋 Todos os links:');
      debugInfo.allLinks.forEach((link, i) => {
        console.log(`[${i+1}] "${link.text}" -> ${link.href}`);
        if (link.onclick) console.log(`    onClick: ${link.onclick}`);
      });
      
      console.log('\n📄 HTML (primeiros 2000 chars):');
      console.log(debugInfo.html);
      
      throw new Error('Nenhum arquivo PDF encontrado para este processo');
    }

    // Selecionar qual arquivo baixar
    let arquivoParaBaixar = arquivos[0];
    
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
  console.log('🚀 API SUSEP v9.0 - ENHANCED DETECTION');
  console.log('='.repeat(80));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`📡 Endpoint: POST /download-susep`);
  console.log('='.repeat(80));
  console.log('✅ Online!\n');
});

server.timeout = CONFIG.timeout;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
