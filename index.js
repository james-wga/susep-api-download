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
      <title>API SUSEP v15</title>
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
        <h1>API SUSEP v15.0</h1>
        <h3>Endpoint</h3>
        <pre>POST /download-susep
{ "numeroprocesso": "15414.900381/2013-67" }</pre>
      </div>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '15.0' });
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
        error: 'numeroprocesso obrigatorio',
        exemplo: { numeroprocesso: '15414.900381/2013-67' }
      });
    }

    console.log('Processo:', numeroprocesso);

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--ignore-certificate-errors'
      ],
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    console.log('Acessando SUSEP...');
    await page.goto('https://www2.susep.gov.br/safe/menumercado/REP2/Produto.aspx/Consultar', {
      waitUntil: 'networkidle2',
      timeout: CONFIG.navigationTimeout
    });
    await page.waitForTimeout(3000);

    console.log('Preenchendo...');
    const input = await page.$('#txtNumeroProcesso') || await page.$('input[type="text"]');
    if (input) {
      await input.click({ clickCount: 3 });
      await input.type(numeroprocesso, { delay: 50 });
    } else {
      throw new Error('Campo nao encontrado');
    }

    console.log('Submetendo...');
    const button = await page.$('#btnConsultar') || await page.$('input[type="submit"]');
    if (button) {
      await button.click();
    } else {
      throw new Error('Botao nao encontrado');
    }

    console.log('Aguardando resultado...');
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {}),
      page.waitForTimeout(10000)
    ]);
    await page.waitForTimeout(3000);

    console.log('Buscando arquivos e informacoes...');

    const dadosPagina = await page.evaluate(() => {
      const resultado = {
        seguradora: '',
        arquivos: []
      };

      // Extrair nome da seguradora
      // Procurar por label/span que contenha "Seguradora" ou "Sociedade"
      const labels = Array.from(document.querySelectorAll('label, span, td, th'));
      for (const label of labels) {
        const texto = label.textContent.trim();
        if (texto.match(/seguradora|sociedade/i)) {
          // Pegar o próximo elemento ou valor após dois pontos
          let valorSeguradora = '';
          
          // Tentar pegar valor depois de ":"
          if (texto.includes(':')) {
            valorSeguradora = texto.split(':')[1].trim();
          } else {
            // Tentar pegar próximo sibling ou célula
            const next = label.nextElementSibling || label.nextSibling;
            if (next) {
              valorSeguradora = next.textContent.trim();
            }
          }
          
          if (valorSeguradora && valorSeguradora.length > 3) {
            resultado.seguradora = valorSeguradora;
            break;
          }
        }
      }

      // Extrair arquivos com suas datas
      const links = [
        ...Array.from(document.querySelectorAll('a.linkDownloadRelatorio')),
        ...Array.from(document.querySelectorAll('a[onclick*="Download"]'))
      ];

      const uniqueLinks = [...new Set(links)];

      uniqueLinks.forEach((link) => {
        const onclick = link.getAttribute('onclick') || '';
        const match = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
        
        if (!match) return;
        
        const path = match[1];
        const idMatch = path.match(/DownloadConsultaPublica\/(\d+)/);
        
        if (!idMatch) return;

        let nomeArquivo = 'documento.pdf';
        let dataFim = '';
        
        const tr = link.closest('tr');
        if (tr) {
          const cells = tr.querySelectorAll('td');
          
          // Primeira célula: nome do arquivo
          if (cells[0]) {
            const texto = cells[0].textContent.trim();
            const pdfMatch = texto.match(/([^\n]+\.pdf)/i);
            if (pdfMatch) {
              nomeArquivo = pdfMatch[1].trim();
            }
          }
          
          // Terceira célula: data de fim de comercialização
          // (considerando: Arquivo | Data Início | Data Fim)
          if (cells[2]) {
            dataFim = cells[2].textContent.trim();
          }
        }

        resultado.arquivos.push({
          index: resultado.arquivos.length + 1,
          nome: nomeArquivo,
          downloadId: idMatch[1],
          path: path,
          dataFim: dataFim
        });
      });

      return resultado;
    });

    const arquivos = dadosPagina.arquivos;
    const seguradora = dadosPagina.seguradora;

    console.log('Seguradora:', seguradora || 'Nao identificada');
    console.log('Arquivos encontrados:', arquivos.length);

    console.log('Arquivos encontrados:', arquivos.length);

    if (arquivos.length === 0) {
      throw new Error('Nenhum arquivo encontrado');
    }

    // Mostrar lista de arquivos com suas informações
    arquivos.forEach((arq) => {
      const status = arq.dataFim ? arq.dataFim : 'VIGENTE';
      console.log('  [' + arq.index + '] ' + arq.nome + ' - ' + status);
    });

    let arquivoIndex = 0;
    if (indiceArquivo && indiceArquivo > 0 && indiceArquivo <= arquivos.length) {
      arquivoIndex = indiceArquivo - 1;
    }

    const arquivoParaBaixar = arquivos[arquivoIndex];
    console.log('Selecionado:', arquivoParaBaixar.nome);
    console.log('Data Fim:', arquivoParaBaixar.dataFim || 'VIGENTE');

    const downloadUrl = 'https://www2.susep.gov.br' + arquivoParaBaixar.path;
    console.log('URL:', downloadUrl);

    console.log('Baixando PDF via Fetch API...');
    
    // Baixar usando fetch DENTRO do contexto da página (mantém todos os cookies e headers)
    const pdfBase64 = await page.evaluate(async (url) => {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Fetch falhou: ' + response.status);
      }
      
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      // Converter para base64
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      
      return btoa(binary);
    }, downloadUrl);

    console.log('PDF capturado via Fetch, decodificando...');
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    console.log('Buffer:', pdfBuffer.length, 'bytes');

    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    if (!pdfHeader.includes('%PDF')) {
      throw new Error('Nao e PDF');
    }

    const tamanhoKB = (pdfBuffer.length / 1024).toFixed(2);
    const tempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('Sucesso!', tamanhoKB, 'KB em', tempoTotal, 's');

    await browser.close();

    // Construir nome do arquivo: [PROCESSO]_[SEGURADORA]_[NOME_ARQUIVO]_[STATUS].pdf
    let filename = '';
    
    // 1. Adicionar número do processo
    const processoLimpo = numeroprocesso.replace(/[^\w]/g, '_');
    filename += processoLimpo + '_';
    
    // 2. Adicionar seguradora se encontrada
    if (seguradora) {
      const seguradoraLimpa = seguradora.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
      filename += seguradoraLimpa + '_';
    }
    
    // 3. Adicionar nome original do arquivo (sem extensão)
    const nomeBase = arquivoParaBaixar.nome.replace('.pdf', '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    filename += nomeBase + '_';
    
    // 4. Adicionar status (data fim ou VIGENTE)
    if (arquivoParaBaixar.dataFim && arquivoParaBaixar.dataFim.trim().length > 0) {
      // Tem data de fim - formatar a data
      const dataFormatada = arquivoParaBaixar.dataFim.replace(/\//g, '-').replace(/\s+/g, '');
      filename += dataFormatada;
    } else {
      // Sem data de fim - está vigente
      filename += 'VIGENTE';
    }
    
    filename += '.pdf';
    
    console.log('Nome do arquivo final:', filename);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Content-Length': pdfBuffer.length,
      'X-Process-Time': tempoTotal + 's',
      'X-File-Size': tamanhoKB + 'KB',
      'X-Processo-SUSEP': numeroprocesso,
      'X-Seguradora': seguradora || 'N/A',
      'X-Status': arquivoParaBaixar.dataFim || 'VIGENTE'
    });

    res.send(pdfBuffer);

  } catch (error) {
    console.error('ERRO:', error.message);

    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // ignore
      }
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message,
        processo: req.body.numeroprocesso
      });
    }
  }
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM');
  process.exit(0);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('API SUSEP v15.0');
  console.log('Porta:', PORT);
  console.log('Online!');
});

server.timeout = CONFIG.timeout;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
