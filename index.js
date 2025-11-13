const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações
const CONFIG = {
  timeout: 120000,
  maxRetries: 2,
  waitBetweenRetries: 3000,
  maxConcurrent: 3
};

// Controle de requisições simultâneas
let activeRequests = 0;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de rate limiting simples
const requestQueue = [];
const processQueue = async () => {
  while (requestQueue.length > 0 && activeRequests < CONFIG.maxConcurrent) {
    const next = requestQueue.shift();
    next();
  }
};

// Página inicial com design melhorado
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <title>API Download SUSEP</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          max-width: 900px;
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { color: #28a745; font-size: 32px; margin-bottom: 10px; }
        h3 { color: #333; margin: 30px 0 15px; font-size: 20px; }
        .badge {
          display: inline-block;
          padding: 8px 20px;
          background: #28a745;
          color: white;
          border-radius: 25px;
          font-size: 14px;
          font-weight: bold;
          margin: 15px 0;
        }
        .alert {
          background: #fff3cd;
          border-left: 5px solid #ffc107;
          padding: 20px;
          margin: 20px 0;
          border-radius: 8px;
          font-size: 14px;
        }
        .info-box {
          background: #e7f3ff;
          border-left: 5px solid #2196F3;
          padding: 20px;
          margin: 20px 0;
          border-radius: 8px;
          font-size: 14px;
        }
        pre {
          background: #2d2d2d;
          color: #00ff00;
          padding: 20px;
          border-radius: 10px;
          overflow-x: auto;
          font-size: 13px;
          line-height: 1.5;
        }
        .endpoint {
          background: #f5f5f5;
          padding: 20px;
          margin: 15px 0;
          border-radius: 10px;
          border-left: 5px solid #2196F3;
        }
        .method {
          display: inline-block;
          padding: 5px 15px;
          background: #2196F3;
          color: white;
          border-radius: 5px;
          font-weight: bold;
          font-size: 12px;
          margin-right: 10px;
        }
        .method.get { background: #4CAF50; }
        .feature-list {
          list-style: none;
          padding-left: 0;
        }
        .feature-list li {
          padding: 8px 0 8px 30px;
          position: relative;
        }
        .feature-list li:before {
          content: "✓";
          position: absolute;
          left: 0;
          color: #28a745;
          font-weight: bold;
          font-size: 18px;
        }
        .footer {
          text-align: center;
          margin-top: 40px;
          color: #999;
          font-size: 12px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }
        code {
          background: #f4f4f4;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📄 API Download SUSEP</h1>
        <div class="badge">🟢 ONLINE</div>
        
        <p style="font-size: 16px; color: #666; margin: 20px 0;">
          API automatizada para download de documentos PDF da SUSEP (Superintendência de Seguros Privados).
        </p>

        <div class="alert">
          <strong>⚠️ Tempo de Resposta:</strong> A primeira requisição pode levar 20-30 segundos para inicializar o navegador. Requisições subsequentes são mais rápidas.
        </div>

        <h3>✨ Recursos</h3>
        <ul class="feature-list">
          <li>Download automático de PDFs da SUSEP</li>
          <li>Retry automático em caso de falhas</li>
          <li>Controle de requisições simultâneas</li>
          <li>Logs detalhados de cada operação</li>
          <li>Validação de PDFs baixados</li>
        </ul>

        <h3>📡 Endpoints Disponíveis</h3>
        
        <div class="endpoint">
          <span class="method get">GET</span>
          <strong>/health</strong>
          <p style="margin-top: 10px; color: #666;">Verificação de saúde da API</p>
        </div>

        <div class="endpoint">
          <span class="method">POST</span>
          <strong>/download-susep</strong>
          <p style="margin: 10px 0; color: #666;">Baixa o PDF de um processo SUSEP</p>
          <pre>Content-Type: application/json

{
  "numeroprocesso": "15414.614430/2024-02"
}</pre>
        </div>

        <div class="info-box">
          <strong>💡 Dica:</strong> Use <code>timeout: 180000</code> (3 minutos) em suas requisições HTTP para evitar timeouts prematuros.
        </div>

        <h3>🔧 Exemplo de Uso com cURL</h3>
        <pre>curl -X POST ${req.protocol}://${req.get('host')}/download-susep \\
  -H "Content-Type: application/json" \\
  -d '{"numeroprocesso":"15414.614430/2024-02"}' \\
  --output processo.pdf</pre>

        <h3>🔌 Configuração para n8n</h3>
        <pre>Nó HTTP Request:
- Method: POST
- URL: ${req.protocol}://${req.get('host')}/download-susep
- Body Content Type: JSON
- Body: {"numeroprocesso": "{{$json.processo}}"}
- Response Format: File
- Timeout: 180000 (3 minutos)
- Download Binary Data: ✓</pre>

        <h3>📝 Resposta de Erro</h3>
        <pre>{
  "error": "Descrição do erro",
  "tipo": "Tipo do erro",
  "numeroprocesso": "15414.614430/2024-02",
  "timestamp": "2024-11-13T10:30:00.000Z"
}</pre>

        <div class="footer">
          <p>Hospedado no Railway.app | Powered by Puppeteer</p>
          <p style="margin-top: 5px;">⚡ Desenvolvido para automação de processos SUSEP</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Health check aprimorado
app.get('/health', (req, res) => {
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    uptimeFormatted: formatUptime(process.uptime()),
    service: 'SUSEP Download API',
    version: '2.0.0',
    activeRequests: activeRequests,
    queuedRequests: requestQueue.length,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    }
  };
  res.json(healthData);
});

// Função auxiliar para formatar uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  
  return parts.join(' ');
}

// Função para tentar baixar o PDF com retry
async function downloadPDFWithRetry(numeroprocesso, maxRetries = CONFIG.maxRetries) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Tentativa ${attempt}/${maxRetries}`);
      const result = await downloadPDF(numeroprocesso);
      return result;
    } catch (error) {
      lastError = error;
      console.log(`❌ Tentativa ${attempt} falhou: ${error.message}`);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Aguardando ${CONFIG.waitBetweenRetries}ms antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.waitBetweenRetries));
      }
    }
  }
  
  throw lastError;
}

// Função principal de download
async function downloadPDF(numeroprocesso) {
  let browser = null;
  
  try {
    console.log('🌐 Iniciando Chrome...');
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
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ],
      timeout: CONFIG.timeout
    });

    const page = await browser.newPage();
    
    // Configurar página
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Interceptar erros de console
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('🔴 Erro no console do navegador:', msg.text());
      }
    });
    
    console.log('✅ Chrome iniciado');

    // Acessar SUSEP
    console.log('🔍 Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx', {
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeout
    });
    console.log('✅ Página SUSEP carregada');

    // Aguardar elementos carregarem
    console.log('⏳ Aguardando carregamento...');
    await page.waitForTimeout(3000);

    // Procurar e preencher campo
    console.log('✍️ Preenchendo formulário...');
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
          await element.click({ clickCount: 3 }); // Selecionar tudo
          await element.type(numeroprocesso, { delay: 50 });
          console.log(`✅ Campo preenchido: ${selector}`);
          inputFilled = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!inputFilled) {
      throw new Error('Campo de busca não encontrado na página');
    }

    // Clicar em buscar
    console.log('🔎 Submetendo busca...');
    const buttonSelectors = [
      '#btnConsultar',
      'input[type="submit"]',
      'button[type="submit"]',
      'input[value*="Consultar"]'
    ];

    let buttonClicked = false;
    for (const selector of buttonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          buttonClicked = true;
          console.log(`✅ Botão clicado: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!buttonClicked) {
      throw new Error('Botão de busca não encontrado');
    }

    // Aguardar navegação ou resultado
    console.log('⏳ Aguardando resultado...');
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
      page.waitForTimeout(8000)
    ]);

    // Verificar mensagens de erro
    const errorMsg = await page.evaluate(() => {
      const selectors = ['.error', '.alert-danger', '.mensagem-erro', '[class*="erro"]'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          return el.textContent.trim();
        }
      }
      return null;
    });

    if (errorMsg) {
      throw new Error(`Erro da SUSEP: ${errorMsg}`);
    }

    // Procurar link do PDF
    console.log('📄 Procurando PDF...');
    
    const pdfLink = await page.evaluate(() => {
      // Estratégia 1: Link direto .pdf
      let link = document.querySelector('a[href*=".pdf"]');
      if (link) return link.href;
      
      // Estratégia 2: Texto "download" ou "pdf"
      const allLinks = Array.from(document.querySelectorAll('a'));
      for (const a of allLinks) {
        const text = a.textContent.toLowerCase();
        const href = (a.href || '').toLowerCase();
        if (text.includes('download') || text.includes('pdf') || href.includes('pdf')) {
          return a.href;
        }
      }
      
      // Estratégia 3: Dentro de tabelas
      const tableLinks = document.querySelectorAll('table a[href]');
      for (const a of tableLinks) {
        if (a.href.includes('.pdf') || a.href.includes('Anexos')) {
          return a.href;
        }
      }
      
      // Estratégia 4: onclick com PDF
      for (const a of allLinks) {
        const onclick = a.getAttribute('onclick') || '';
        if (onclick.includes('.pdf')) {
          const match = onclick.match(/'([^']+\.pdf[^']*)'/);
          if (match) {
            return new URL(match[1], window.location.href).href;
          }
        }
      }
      
      return null;
    });

    if (!pdfLink) {
      // Capturar screenshot para debug
      const screenshot = await page.screenshot({ encoding: 'base64' });
      console.log('📸 Screenshot capturado para debug');
      
      throw new Error('Link de download do PDF não encontrado');
    }

    console.log(`✅ PDF encontrado: ${pdfLink.substring(0, 100)}...`);

    // Baixar PDF
    console.log('⬇️ Baixando PDF...');
    const pdfResponse = await page.goto(pdfLink, {
      waitUntil: 'networkidle0',
      timeout: CONFIG.timeout
    });

    if (!pdfResponse || !pdfResponse.ok()) {
      throw new Error(`Falha ao baixar PDF: Status ${pdfResponse?.status()}`);
    }

    const pdfBuffer = await pdfResponse.buffer();

    // Validar PDF
    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    if (!pdfHeader.includes('%PDF')) {
      throw new Error('Arquivo baixado não é um PDF válido');
    }

    const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
    console.log(`✅ PDF baixado com sucesso! Tamanho: ${tamanhoKB} KB`);

    await browser.close();
    
    return {
      buffer: pdfBuffer,
      tamanho: tamanhoKB,
      filename: `${numeroprocesso.replace(/[\/\.\s]/g, '_')}.pdf`
    };

  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    throw error;
  }
}

// Endpoint principal com fila
app.post('/download-susep', async (req, res) => {
  const startTime = Date.now();
  
  // Validação de entrada
  const { numeroprocesso } = req.body;
  
  if (!numeroprocesso) {
    return res.status(400).json({
      error: 'Parâmetro "numeroprocesso" é obrigatório',
      exemplo: { numeroprocesso: '15414.614430/2024-02' }
    });
  }

  if (typeof numeroprocesso !== 'string' || numeroprocesso.trim().length === 0) {
    return res.status(400).json({
      error: 'Número de processo inválido',
      numeroprocesso: numeroprocesso
    });
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📥 NOVA REQUISIÇÃO - ${new Date().toISOString()}`);
  console.log(`📋 Processo: ${numeroprocesso}`);
  console.log(`🔢 Requisições ativas: ${activeRequests}/${CONFIG.maxConcurrent}`);
  console.log('='.repeat(70));

  // Adicionar à fila se necessário
  if (activeRequests >= CONFIG.maxConcurrent) {
    console.log('⏸️ Fila cheia, aguardando...');
    await new Promise((resolve) => {
      requestQueue.push(resolve);
    });
  }

  activeRequests++;

  try {
    const result = await downloadPDFWithRetry(numeroprocesso);
    
    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Sucesso! Tempo total: ${tempoTotal}s`);
    console.log('='.repeat(70) + '\n');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': result.buffer.length,
      'X-Process-Time': `${tempoTotal}s`,
      'X-File-Size': `${result.tamanho}KB`,
      'X-Process-Number': numeroprocesso
    });

    res.send(result.buffer);

  } catch (error) {
    console.error(`\n❌ ERRO FINAL: ${error.message}`);
    console.error('='.repeat(70) + '\n');
    
    res.status(500).json({
      error: error.message,
      tipo: error.name,
      numeroprocesso: numeroprocesso,
      timestamp: new Date().toISOString(),
      dica: 'Verifique se o processo existe e tem PDF disponível na SUSEP'
    });
  } finally {
    activeRequests--;
    processQueue();
  }
});

// Tratamento global de erros
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM recebido, encerrando...');
  process.exit(0);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 API DOWNLOAD SUSEP INICIADA!');
  console.log('='.repeat(70));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`⚙️ Max requisições simultâneas: ${CONFIG.maxConcurrent}`);
  console.log(`🔄 Max retries: ${CONFIG.maxRetries}`);
  console.log(`📡 Endpoints:`);
  console.log(`   GET  / - Documentação`);
  console.log(`   GET  /health - Health check`);
  console.log(`   POST /download-susep - Download de PDFs`);
  console.log('='.repeat(70));
  console.log('✅ Pronto para receber requisições!\n');
});
