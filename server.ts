import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '1mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'NexusSheet AI Studio' });
  });

  // Server-side Gemini cell analysis endpoint for =AI() spreadsheet formula
  app.post('/api/ai/analyze-cell', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(500).json({
          error: 'GEMINI_API_KEY belum dikonfigurasi di server.',
        });
      }

      const {
        prompt,
        formula,
        cellRef,
        sheetName,
        columnName,
        targets,
        rowContext,
      } = req.body || {};

      const targetList = Array.isArray(targets) ? targets : [];
      const rowCtxList = Array.isArray(rowContext) ? rowContext : [];

      const formattedTargets =
        targetList.length > 0
          ? targetList
              .map((t: { label?: string; value?: unknown }) => {
                const valStr =
                  typeof t.value === 'object' && t.value !== null
                    ? JSON.stringify(t.value)
                    : String(t.value ?? '(kosong)');
                return `- ${t.label || 'Nilai'}: ${valStr}`;
              })
              .join('\n')
          : '(Tidak ada sel target spesifik; gunakan konteks baris)';

      const formattedRowContext =
        rowCtxList.length > 0
          ? rowCtxList
              .map(
                (c: { columnName?: string; value?: unknown }) =>
                  `- ${c.columnName || 'Kolom'}: ${String(c.value ?? '(kosong)')}`
              )
              .join('\n')
          : '';

      const userInstruction =
        typeof prompt === 'string' && prompt.trim().length > 0
          ? prompt.trim()
          : 'Analisis nilai sel ini secara ringkas: identifikasi makna utama, pola, kategori, atau anomali penting.';

      const userContent = [
        `Sheet: ${sheetName || 'Spreadsheet'}`,
        cellRef ? `Sel Formula: ${cellRef}${columnName ? ` (${columnName})` : ''}` : '',
        formula ? `Rumus: ${formula}` : '',
        '',
        `Instruksi Analisis:\n${userInstruction}`,
        '',
        `Data Sel / Rentang yang Dianalisis:\n${formattedTargets}`,
        formattedRowContext ? `\nKonteks Baris Terkait:\n${formattedRowContext}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const timeoutMs = 45000;
      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: userContent,
          config: {
            systemInstruction:
              'Anda adalah analis data spreadsheet profesional. Berikan hasil analisis singkat, akurat, dan langsung pada inti agar pas ditampilkan di dalam sel spreadsheet (maksimal 1-3 kalimat ringkas, atau satu label/klasifikasi jelas jika diminta). Gunakan teks biasa tanpa format markdown (**bold**, # header, atau bullet list) dan tanpa kalimat pembuka/penutup. Gunakan bahasa yang sama dengan instruksi pengguna (default Bahasa Indonesia).',
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.LOW,
            },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            const err: any = new Error('Waktu tunggu analisis Gemini AI habis (timeout).');
            err.status = 504;
            reject(err);
          }, timeoutMs)
        ),
      ]);

      const resultText = (response.text || '').trim();
      if (!resultText) {
        return res.status(502).json({
          error: 'Model tidak mengembalikan hasil teks analisis.',
        });
      }

      return res.json({ result: resultText });
    } catch (err: any) {
      const status =
        typeof err?.status === 'number'
          ? err.status
          : typeof err?.statusCode === 'number'
          ? err.statusCode
          : 500;
      const message =
        err?.message || 'Terjadi kesalahan saat menganalisis sel dengan Gemini API.';
      console.error('[/api/ai/analyze-cell] Error:', message);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: message,
      });
    }
  });

  // Development vs Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
