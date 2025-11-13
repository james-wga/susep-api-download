const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SUSEP Debug - Análise de Página</title>
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
        h1 { color: #495057; margin-bottom: 10px; }
        .badge {
          display: inline-block;
          padding: 6px 16px;
          background: #17a2b8;
          color: white;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
        }
        .info {
          background: #e7f3ff;
          border-left: 4px solid #2196F3;
          padding: 16px;
          margin: 20px 0;
          border-radius: 4px;
        }
        pre {
          background: #282c34;
          color: #61dafb;
          padding: 16px;
          border-radius: 6px;
          overflow-x: auto;
          font-size: 13px;
        }
        .endpoint {
          background: #f8f9fa;
          padding: 16px;
          margin: 12px 0;
          border-radius: 6px;
          border-left: 4px solid #28a745;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔍 SUSEP Debug Mode</h1>
        <span class="badge">Modo Análise v1.0</span>
        
        <div class="info">
          <strong>ℹ️ Este modo NÃO baixa arquivos</strong><br>
          Apenas analisa a página e retorna informações detalhadas sobre:
          <ul style="margin: 10px 0;">
            <li>Detalhes do produto encontrado</li>
            <li>Todos os links disponíveis</li>
            <li>Arquivos e anexos identificados</li>
            <li>Estrutura da página</li>
          </ul>
        </div>

        <h3>📡 Endpoint de Análise</h3>
        <div class="endpoint">
          <strong>POST /analisar-processo</strong>
          <pre>Content-Type: application/json

{
  "numeroprocesso": "15414.900381/2013-67"
}</pre>
        </div>

        <h3>💡 Resposta Esperada</h3>
        <pre>{
  "status": "sucesso",
  "processo": "15414.900381/2013-67",
  "encontrado": true,
  "detalhes": {
    "produto": "...",
    "status": "...",
    "data": "..."
  },
  "links": [...],
  "arquivos": [...],
  "totalLinks": 10
}</pre>

      </div>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: 'debug', version: '1.0' });
});

// Endpoint de análise (NÃO baixa, apenas lista)
app.post('/analisar-processo', async (req, res) => {
  let browser = null;
  const startTime = Date.now();
  
  try {
    const { numeroprocesso } = req.body;
    
    if (!numeroprocesso) {
      return res.status(400).json({
        error: 'numeroprocesso é obrigatório',
        exemplo: { numeroprocesso: '15414.900381/2013-67' }
      });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 ANÁLISE DE PROCESSO - ${new Date().toISOString()}`);
    console.log(`📋 Número: ${numeroprocesso}`);
    console.log('='.repeat(80));

    console.log('\n[1/5] 🌐 Iniciando navegador...');
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    console.log('✅ Navegador iniciado');

    console.log('\n[2/5] 🔍 Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
      waitUntil: 'networkidle2',
      timeout: 90000
    });
    await page.waitForTimeout(3000);
    console.log('✅ Página carregada');

    console.log('\n[3/5] ✍️ Preenchendo busca...');
    const inputSelectors = [
      '#txtNumeroProcesso',
      'input[name*="Processo"]',
      'input[id*="Processo"]',
      'input[type="text"]'
    ];

    let inputFilled = false;
    for (const selector of inputSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click({ clickCount: 3 });
          await element.type(numeroprocesso, { delay: 50 });
          console.log(`✅ Preenchido: ${selector}`);
          inputFilled = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!inputFilled) {
      throw new Error('Campo de busca não encontrado');
    }

    console.log('\n[4/5] 🔎 Submetendo busca...');
    const buttonSelectors = [
      '#btnConsultar',
      'input[type="submit"]',
      'button[type="submit"]'
    ];

    let buttonClicked = false;
    for (const selector of buttonSelectors) {
      try {
        await page.click(selector);
        console.log(`✅ Clicado: ${selector}`);
        buttonClicked = true;
        break;
      } catch (e) {
        continue;
      }
    }

    if (!buttonClicked) {
      throw new Error('Botão não encontrado');
    }

    console.log('\n⏳ Aguardando resultado...');
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.waitForTimeout(8000)
    ]);
    console.log('✅ Resultado carregado');

    console.log('\n[5/5] 📊 ANALISANDO PÁGINA...');
    console.log('='.repeat(80));

    // ANÁLISE COMPLETA
    const analysis = await page.evaluate(() => {
      const result = {
        url: window.location.href,
        title: document.title,
        detalhes: {},
        links: [],
        tabelas: [],
        textoVisivel: '',
        estrutura: {}
      };

      // 1. DETALHES DO PRODUTO
      console.log('\n📦 Buscando detalhes do produto...');
      
      // Procurar em spans, divs, labels com informações
      const allText = document.body.innerText;
      result.textoVisivel = allText.substring(0, 1000);
      
      // Procurar por campos específicos
      const labels = Array.from(document.querySelectorAll('label, span, td, th'));
      labels.forEach(el => {
        const text = el.textContent.trim();
        if (text.match(/produto|seguradora|modalidade|status|data|processo/i)) {
          const nextEl = el.nextElementSibling;
          if (nextEl) {
            const key = text.replace(':', '').trim();
            const value = nextEl.textContent.trim();
            if (value.length < 200) {
              result.detalhes[key] = value;
            }
          }
        }
      });

      // 2. TODOS OS LINKS
      console.log('\n🔗 Coletando links...');
      document.querySelectorAll('a').forEach((a, index) => {
        const linkInfo = {
          index: index + 1,
          text: a.textContent?.trim() || '',
          href: a.href || '',
          onclick: a.getAttribute('onclick') || '',
          id: a.id || '',
          class: a.className || '',
          title: a.title || '',
          target: a.target || '',
          visivel: a.offsetParent !== null
        };
        
        // Identificar se parece ser um arquivo
        if (linkInfo.href.includes('.pdf') || 
            linkInfo.text.toLowerCase().includes('pdf') ||
            linkInfo.text.toLowerCase().includes('anexo') ||
            linkInfo.text.toLowerCase().includes('download') ||
            linkInfo.text.toLowerCase().includes('arquivo')) {
          linkInfo.tipo = 'ARQUIVO';
        }
        
        result.links.push(linkInfo);
      });

      // 3. ANALISAR TABELAS
      console.log('\n📋 Analisando tabelas...');
      document.querySelectorAll('table').forEach((table, tIndex) => {
        const tableInfo = {
          index: tIndex + 1,
          id: table.id || '',
          class: table.className || '',
          linhas: table.rows.length,
          conteudo: []
        };
        
        // Coletar primeiras 5 linhas
        Array.from(table.rows).slice(0, 5).forEach((row, rIndex) => {
          const cells = Array.from(row.cells).map(cell => 
            cell.textContent.trim().substring(0, 100)
          );
          tableInfo.conteudo.push({
            linha: rIndex + 1,
            celulas: cells
          });
        });
        
        result.tabelas.push(tableInfo);
      });

      // 4. ESTRUTURA
      result.estrutura = {
        totalLinks: result.links.length,
        totalTabelas: result.tabelas.length,
        temFormulario: !!document.querySelector('form'),
        temGridView: !!document.querySelector('[id*="GridView"], [id*="grid"]'),
        temIframe: !!document.querySelector('iframe')
      };

      return result;
    });

    // Processar e organizar resultados
    console.log('\n📊 RESULTADOS DA ANÁLISE:');
    console.log('='.repeat(80));
    
    console.log(`\n🌐 URL Atual: ${analysis.url}`);
    console.log(`📄 Título: ${analysis.title}`);
    
    console.log(`\n📦 DETALHES ENCONTRADOS: ${Object.keys(analysis.detalhes).length}`);
    Object.entries(analysis.detalhes).forEach(([key, value]) => {
      console.log(`  • ${key}: ${value}`);
    });
    
    console.log(`\n🔗 LINKS ENCONTRADOS: ${analysis.links.length}`);
    
    // Filtrar links relevantes (arquivos)
    const arquivos = analysis.links.filter(link => link.tipo === 'ARQUIVO');
    console.log(`\n📎 ARQUIVOS IDENTIFICADOS: ${arquivos.length}`);
    arquivos.forEach(arquivo => {
      console.log(`\n  [${arquivo.index}] ${arquivo.text}`);
      console.log(`      URL: ${arquivo.href}`);
      console.log(`      OnClick: ${arquivo.onclick.substring(0, 60)}`);
      console.log(`      Visível: ${arquivo.visivel}`);
    });
    
    // Listar TODOS os links se forem poucos
    if (analysis.links.length <= 15) {
      console.log(`\n🔗 TODOS OS LINKS (${analysis.links.length}):`);
      analysis.links.forEach(link => {
        console.log(`\n  [${link.index}] "${link.text.substring(0, 50)}"`);
        console.log(`      ${link.href.substring(0, 80)}`);
      });
    }
    
    console.log(`\n📋 TABELAS: ${analysis.tabelas.length}`);
    analysis.tabelas.forEach(tabela => {
      console.log(`\n  Tabela #${tabela.index} (${tabela.linhas} linhas)`);
      console.log(`  ID: ${tabela.id}, Class: ${tabela.class}`);
      tabela.conteudo.slice(0, 2).forEach(linha => {
        console.log(`    Linha ${linha.linha}: [${linha.celulas.join(' | ')}]`);
      });
    });
    
    console.log(`\n🏗️ ESTRUTURA:`);
    console.log(`  • Total de links: ${analysis.estrutura.totalLinks}`);
    console.log(`  • Total de tabelas: ${analysis.estrutura.totalTabelas}`);
    console.log(`  • Tem formulário: ${analysis.estrutura.temFormulario}`);
    console.log(`  • Tem GridView: ${analysis.estrutura.temGridView}`);
    console.log(`  • Tem iframe: ${analysis.estrutura.temIframe}`);
    
    if (analysis.textoVisivel) {
      console.log(`\n📝 TEXTO VISÍVEL (primeiros 500 chars):`);
      console.log(analysis.textoVisivel.substring(0, 500));
    }

    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ Análise concluída em ${tempoTotal}s`);
    console.log('='.repeat(80) + '\n');

    await browser.close();

    // Resposta JSON estruturada
    res.json({
      status: 'sucesso',
      processo: numeroprocesso,
      encontrado: analysis.links.length > 0 || Object.keys(analysis.detalhes).length > 0,
      tempoAnalise: `${tempoTotal}s`,
      url: analysis.url,
      title: analysis.title,
      detalhes: analysis.detalhes,
      arquivos: arquivos,
      totalArquivos: arquivos.length,
      links: analysis.links,
      totalLinks: analysis.links.length,
      tabelas: analysis.tabelas,
      estrutura: analysis.estrutura,
      textoVisivel: analysis.textoVisivel.substring(0, 500)
    });

  } catch (error) {
    console.error(`\n❌ ERRO: ${error.message}`);
    console.error(`Stack: ${error.stack}\n`);
    
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }

    if (!res.headersSent) {
      res.status(500).json({
        status: 'erro',
        error: error.message,
        numeroprocesso: req.body.numeroprocesso
      });
    }
  }
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 SUSEP DEBUG MODE - ANÁLISE DE PÁGINA');
  console.log('='.repeat(80));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`📡 Endpoint: POST /analisar-processo`);
  console.log('='.repeat(80));
  console.log('✅ Pronto para análise!\n');
});

server.timeout = 120000;
