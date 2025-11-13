const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Página inicial
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API Download SUSEP - Fixed</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          margin: 0;
        }
        .container {
          max-width: 800px;
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { color: #28a745; font-size: 36px; margin-bottom: 10px; }
        .badge {
          display: inline-block;
          padding: 8px 20px;
          background: #28a745;
          color: white;
          border-radius: 25px;
          font-size: 14px;
          font-weight: bold;
          margin: 20px 0;
        }
        pre {
          background: #2d2d2d;
          color: #00ff00;
          padding: 20px;
          border-radius: 10px;
          overflow-x: auto;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✅ API Download SUSEP</h1>
        <div class="badge">🟢 ONLINE - v4.0 FIXED</div>
        
        <h3>📡 Endpoint</h3>
        <pre>POST /download-susep
{
  "numeroprocesso": "15414.614430/2024-02"
}</pre>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    service: 'SUSEP Download API v4.0'
  });
});

// Função para debug completo da página
async function debugPage(page) {
  console.log('\n🔍 ========== DEBUG COMPLETO DA PÁGINA ==========');
  
  // 1. Listar TODOS os links
  const allLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    return links.map((a, index) => ({
      index: index + 1,
      text: a.textContent?.trim() || '',
      href: a.href || '',
      onclick: a.getAttribute('onclick') || '',
      id: a.id || '',
      class: a.className || '',
      name: a.name || '',
      target: a.target || '',
      visible: a.offsetParent !== null
    }));
  });
  
  console.log(`\n📋 Total de links encontrados: ${allLinks.length}`);
  allLinks.forEach(link => {
    console.log(`\n[Link #${link.index}]`);
    console.log(`  Texto: "${link.text.substring(0, 80)}"`);
    console.log(`  Href: "${link.href.substring(0, 80)}"`);
    console.log(`  OnClick: "${link.onclick.substring(0, 80)}"`);
    console.log(`  ID: "${link.id}"`);
    console.log(`  Class: "${link.class}"`);
    console.log(`  Visível: ${link.visible}`);
  });
  
  // 2. Listar elementos com onclick
  const onclickElements = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('[onclick]'));
    return elements.map((el, index) => ({
      index: index + 1,
      tag: el.tagName,
      text: el.textContent?.trim() || '',
      onclick: el.getAttribute('onclick') || '',
      id: el.id || '',
      class: el.className || ''
    }));
  });
  
  console.log(`\n⚡ Elementos com onclick: ${onclickElements.length}`);
  onclickElements.forEach(el => {
    console.log(`\n[OnClick #${el.index}]`);
    console.log(`  Tag: ${el.tag}`);
    console.log(`  Texto: "${el.text.substring(0, 60)}"`);
    console.log(`  OnClick: "${el.onclick.substring(0, 100)}"`);
  });
  
  // 3. Buscar por padrões específicos
  console.log('\n🎯 Buscando padrões específicos...');
  const patterns = await page.evaluate(() => {
    const results = {
      pdfLinks: [],
      downloadLinks: [],
      anexoLinks: [],
      processoLinks: [],
      postbackLinks: []
    };
    
    document.querySelectorAll('a').forEach(a => {
      const text = a.textContent?.toLowerCase() || '';
      const href = (a.href || '').toLowerCase();
      const onclick = (a.getAttribute('onclick') || '').toLowerCase();
      
      if (href.includes('.pdf') || onclick.includes('.pdf')) {
        results.pdfLinks.push({ text: a.textContent?.trim(), href: a.href, onclick: a.getAttribute('onclick') });
      }
      if (text.includes('download') || href.includes('download')) {
        results.downloadLinks.push({ text: a.textContent?.trim(), href: a.href });
      }
      if (text.includes('anexo') || href.includes('anexo')) {
        results.anexoLinks.push({ text: a.textContent?.trim(), href: a.href });
      }
      if Takes.includes('processo') || href.includes('processo')) {
        results.processoLinks.push({ text: a.textContent?.trim(), href: a.href });
      }
      if (onclick.includes('__dopostback') || onclick.includes('postback')) {
        results.postbackLinks.push({ text: a.textContent?.trim(), onclick: a.getAttribute('onclick') });
      }
    });
    
    return results;
  });
  
  console.log('\n📊 Resultados por padrão:');
  console.log('  PDFs:', patterns.pdfLinks.length, JSON.stringify(patterns.pdfLinks, null, 2));
  console.log('  Downloads:', patterns.downloadLinks.length, JSON.stringify(patterns.downloadLinks, null, 2));
  console.log('  Anexos:', patterns.anexoLinks.length, JSON.stringify(patterns.anexoLinks, null, 2));
  console.log('  Processos:', patterns.processoLinks.length, JSON.stringify(patterns.processoLinks, null, 2));
  console.log('  Postbacks:', patterns.postbackLinks.length, JSON.stringify(patterns.postbackLinks, null, 2));
  
  // 4. Capturar HTML da página
  const html = await page.content();
  console.log('\n📄 HTML da página (primeiros 2000 chars):');
  console.log(html.substring(0, 2000));
  
  console.log('\n========== FIM DO DEBUG ==========\n');
  
  return { allLinks, onclickElements, patterns };
}

// Função AVANÇADA para encontrar o PDF
async function findPDFLinkAdvanced(page) {
  console.log('\n🔎 INICIANDO BUSCA AVANÇADA DO PDF...\n');
  
  // Aguardar página estabilizar
  await page.waitForTimeout(3000);
  
  // ESTRATÉGIA 1: Link direto com .pdf na URL
  console.log('🎯 Estratégia 1: Link direto .pdf');
  let pdfLink = await page.evaluate(() => {
    const link = document.querySelector('a[href*=".pdf"]');
    if (link) {
      console.log('✓ Link .pdf direto encontrado!');
      return link.href;
    }
    return null;
  });
  if (pdfLink) return pdfLink;
  
  // ESTRATÉGIA 2: Procurar por texto "Anexo" ou "Download"
  console.log('🎯 Estratégia 2: Texto "Anexo" ou "Download"');
  pdfLink = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    for (const link of links) {
      const text = link.textContent?.toLowerCase() || '';
      if (text.includes('anexo') || text.includes('download') || text.includes('baixar')) {
        console.log('✓ Link por texto encontrado:', link.textContent?.trim());
        return link.href;
      }
    }
    return null;
  });
  if (pdfLink) return pdfLink;
  
  // ESTRATÉGIA 3: Procurar dentro de GridView/Tabela ASP.NET
  console.log('🎯 Estratégia 3: GridView/Tabela ASP.NET');
  pdfLink = await page.evaluate(() => {
    // Procurar por GridView (comum em ASP.NET)
    const gridviews = document.querySelectorAll('[id*="GridView"], [id*="grid"], table[class*="Grid"]');
    
    for (const grid of gridviews) {
      const links = grid.querySelectorAll('a');
      for (const link of links) {
        console.log('✓ Link em grid encontrado:', link.href);
        return link.href;
      }
    }
    
    // Procurar em qualquer tabela
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const links = table.querySelectorAll('a[href]');
      if (links.length > 0) {
        console.log('✓ Link em tabela encontrado');
        return links[0].href;
      }
    }
    
    return null;
  });
  if (pdfLink) return pdfLink;
  
  // ESTRATÉGIA 4: Procurar por __doPostBack (ASP.NET postback)
  console.log('🎯 Estratégia 4: ASP.NET __doPostBack');
  const postbackInfo = await page.evaluate(() => {
    const elements = document.querySelectorAll('[onclick*="__doPostBack"]');
    
    for (const el of elements) {
      const onclick = el.getAttribute('onclick');
      const text = el.textContent?.trim() || '';
      
      console.log('PostBack encontrado:', text, onclick);
      
      // Extrair parâmetros do postback
      const match = onclick.match(/__doPostBack\('([^']+)','([^']*)'\)/);
      if (match) {
        return {
          element: el.id || el.tagName,
          eventTarget: match[1],
          eventArgument: match[2],
          text: text,
          onclick: onclick
        };
      }
    }
    
    return null;
  });
  
  if (postbackInfo) {
    console.log('✓ PostBack detectado:', JSON.stringify(postbackInfo, null, 2));
    
    // Tentar clicar no elemento com postback
    try {
      console.log('🖱️ Tentando executar postback...');
      
      await page.evaluate((info) => {
        const elements = document.querySelectorAll('[onclick]');
        for (const el of elements) {
          if (el.getAttribute('onclick') === info.onclick) {
            el.click();
            return true;
          }
        }
      }, postbackInfo);
      
      // Aguardar resposta do postback
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
        page.waitForTimeout(10000)
      ]);
      
      console.log('✓ Postback executado, verificando se há PDF...');
      
      // Verificar se agora tem um PDF disponível
      pdfLink = await page.evaluate(() => {
        const link = document.querySelector('a[href*=".pdf"]');
        return link ? link.href : null;
      });
      
      if (pdfLink) return pdfLink;
      
    } catch (e) {
      console.log('⚠️ Erro ao executar postback:', e.message);
    }
  }
  
  // ESTRATÉGIA 5: Procurar qualquer link que pareça relevante
  console.log('🎯 Estratégia 5: Qualquer link relevante');
  pdfLink = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    
    // Ordenar por relevância
    const scored = links.map(link => {
      let score = 0;
      const text = link.textContent?.toLowerCase() || '';
      const href = link.href.toLowerCase();
      
      // Pontuação por palavras-chave
      if (text.includes('anexo')) score += 10;
      if (text.includes('download')) score += 10;
      if (text.includes('pdf')) score += 10;
      if (text.includes('arquivo')) score += 5;
      if (text.includes('documento')) score += 5;
      if (href.includes('anexo')) score += 8;
      if (href.includes('download')) score += 8;
      if (href.includes('.pdf')) score += 15;
      
      // Penalizar links vazios
      if (text.trim().length === 0) score -= 5;
      
      return { link, score, text: text.substring(0, 50), href };
    });
    
    // Ordenar por score
    scored.sort((a, b) => b.score - a.score);
    
    console.log('Top 5 links por relevância:');
    scored.slice(0, 5).forEach((item, i) => {
      console.log(`  ${i + 1}. [Score: ${item.score}] ${item.text} - ${item.href.substring(0, 60)}`);
    });
    
    // Retornar o melhor se score > 0
    if (scored.length > 0 && scored[0].score > 0) {
      console.log('✓ Melhor link escolhido!');
      return scored[0].link.href;
    }
    
    return null;
  });
  if (pdfLink) return pdfLink;
  
  // ESTRATÉGIA 6: Último recurso - pegar o primeiro link disponível
  console.log('🎯 Estratégia 6: Primeiro link disponível (último recurso)');
  pdfLink = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    if (links.length > 0) {
      console.log('✓ Usando primeiro link disponível');
      return links[0].href;
    }
    return null;
  });
  if (pdfLink) return pdfLink;
  
  // Se chegou aqui, nada foi encontrado
  console.log('❌ NENHUM LINK ENCONTRADO - Executando debug completo...');
  await debugPage(page);
  
  return null;
}

// Endpoint de download
app.post('/download-susep', async (req, res) => {
  let browser = null;
  const startTime = Date.now();
  
  try {
    const { numeroprocesso } = req.body;
    
    if (!numeroprocesso) {
      return res.status(400).json({
        error: 'numeroprocesso não fornecido',
        exemplo: { numeroprocesso: '15414.614430/2024-02' }
      });
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`📥 NOVA REQUISIÇÃO - ${new Date().toISOString()}`);
    console.log(`📋 Processo: ${numeroprocesso}`);
    console.log('='.repeat(70));

    // Iniciar browser
    console.log('🌐 [1/7] Iniciando Chrome...');
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--ignore-certificate-errors',
        '--disable-web-security',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Log de erros do console
    page.on('console', msg => console.log('🔵 Browser Console:', msg.text()));
    
    console.log('✅ Chrome iniciado');

    // Acessar SUSEP
    console.log('🔍 [2/7] Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
      waitUntil: 'networkidle2',
      timeout: 90000
    });
    console.log('✅ Página SUSEP carregada');

    // Aguardar página carregar
    console.log('⏳ [3/7] Aguardando elementos...');
    await page.waitForTimeout(5000);

    // Procurar campo de busca
    console.log('✍️ [4/7] Preenchendo formulário...');
    const selectors = [
      '#txtNumeroProcesso',
      'input[name*="Processo"]',
      'input[name*="processo"]',
      'input[id*="Processo"]',
      'input[id*="processo"]',
      'input[type="text"]'
    ];

    let inputFound = false;
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click({ clickCount: 3 });
          await element.type(numeroprocesso, { delay: 100 });
          console.log(`✅ Campo preenchido: ${selector}`);
          inputFound = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!inputFound) {
      console.log('❌ Campo não encontrado. Listando todos os inputs:');
      const allInputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(input => ({
          type: input.type,
          name: input.name,
          id: input.id,
          placeholder: input.placeholder
        }));
      });
      console.log(JSON.stringify(allInputs, null, 2));
      
      await browser.close();
      return res.status(500).json({
        error: 'Campo de busca não encontrado',
        inputsDisponiveis: allInputs
      });
    }

    // Clicar em buscar
    console.log('🔎 [5/7] Clicando em Buscar...');
    const buttonSelectors = [
      '#btnConsultar',
      'input[type="submit"]',
      'button[type="submit"]',
      'input[value*="Consultar"]',
      'input[value*="Buscar"]',
      'button[id*="Consultar"]'
    ];

    let buttonClicked = false;
    for (const selector of buttonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          console.log(`✅ Botão clicado: ${selector}`);
          buttonClicked = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!buttonClicked) {
      await browser.close();
      return res.status(500).json({
        error: 'Botão de busca não encontrado'
      });
    }

    // Aguardar resultado
    console.log('⏳ [6/7] Aguardando resultado da busca...');
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.waitForTimeout(10000)
    ]);

    // Verificar mensagens de erro
    const errorMsg = await page.evaluate(() => {
      const selectors = ['.error', '.alert-danger', '.mensagem-erro', '[class*="erro"]', '[class*="Error"]'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          return el.textContent.trim();
        }
      }
      return null;
    });

    if (errorMsg) {
      console.log('⚠️ Mensagem de erro da SUSEP:', errorMsg);
    }

    // BUSCA AVANÇADA DO PDF
    console.log('📄 [7/7] Procurando PDF com método avançado...');
    const pdfLink = await findPDFLinkAdvanced(page);

    if (!pdfLink) {
      await browser.close();
      
      return res.status(404).json({
        error: 'Link de download não encontrado após todas as estratégias',
        dica: 'Verifique se o processo existe e tem PDF disponível na SUSEP',
        numeroprocesso: numeroprocesso
      });
    }

    console.log(`✅ PDF encontrado: ${pdfLink.substring(0, 100)}...`);

    // Baixar PDF
    console.log('⬇️ Baixando PDF...');
    
    try {
      const pdfResponse = await page.goto(pdfLink, {
        waitUntil: 'networkidle0',
        timeout: 90000
      });

      if (!pdfResponse) {
        throw new Error('Resposta vazia ao tentar baixar PDF');
      }

      const pdfBuffer = await pdfResponse.buffer();

      // Validar PDF
      const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
      if (!pdfHeader.includes('%PDF')) {
        console.log('⚠️ Arquivo não é PDF. Primeiros bytes:', pdfBuffer.toString('utf8', 0, 100));
        throw new Error('Arquivo baixado não é um PDF válido');
      }

      const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
      const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`✅ PDF baixado com sucesso!`);
      console.log(`📊 Tamanho: ${tamanhoKB} KB`);
      console.log(`⏱️ Tempo total: ${tempoTotal}s`);
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
      
    } catch (downloadError) {
      console.error('❌ Erro ao baixar PDF:', downloadError.message);
      throw downloadError;
    }

  } catch (error) {
    console.error(`\n❌ ERRO: ${error.message}`);
    console.error(`Stack: ${error.stack}\n`);
    
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }

    res.status(500).json({
      error: error.message,
      tipo: error.name,
      timestamp: new Date().toISOString()
    });
  }
});

// Tratamento de erros
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 API DOWNLOAD SUSEP INICIADA! v4.0 - ADVANCED SEARCH');
  console.log('='.repeat(70));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`📡 Endpoints:`);
  console.log(`   GET  / - Documentação`);
  console.log(`   GET  /health - Health check`);
  console.log(`   POST /download-susep - Download de PDFs`);
  console.log('='.repeat(70));
  console.log('✅ Pronto para receber requisições!\n');
});
