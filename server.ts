import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Gemini Formula Assistant API
  app.post('/api/ai/suggest-formula', async (req, res) => {
    try {
      const { prompt, sheetContext, selectedCell } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      if (!apiKey) {
        return res.status(200).json({
          fallback: true,
          message: 'GEMINI_API_KEY is not set on the server. Falling back to local NLP formula generator.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = `You are an expert spreadsheet formula assistant for NexusSheet.
The spreadsheet supports Excel-style formulas and relational column bracket references.
Supported syntax:
1. Column name references in brackets: e.g. [Quantity] * [UnitPrice] * (1 - [DiscountPercent] / 100)
2. Cell references: e.g. F2 * G2, A1 + B1
3. Common functions:
   - SUM(range or col): =SUM(F1:F10), =SUM([TotalAmount])
   - AVG(range or col): =AVG(G1:G10), =AVG([UnitPrice])
   - COUNT(range or col): =COUNT(A1:A15), =COUNT([OrderID])
   - MIN(range), MAX(range)
   - IF(condition, value_if_true, value_if_false): =IF([Quantity] > 10, "Grosir", "Retail")
   - ROUND(val, decimals), CEILING, FLOOR, ABS
   - CONCAT(a, b)

Return a single JSON object with these exact fields:
- formula: the exact spreadsheet formula starting with '=' (e.g. "=[Quantity] * [UnitPrice]")
- explanation: a concise 1-2 sentence explanation in Indonesian of what the formula computes
- functionUsed: the primary function or operation name (e.g. "ARITHMETIC_MULTIPLY", "SUM", "AVG", "IF", "MAX")
- confidence: number between 0.8 and 1.0`;

      const userContent = `User Request: "${prompt}"
Context:
Active Sheet: ${sheetContext?.sheetName || 'Sheet'}
Columns: ${JSON.stringify(sheetContext?.columns || [])}
Selected Cell: ${JSON.stringify(selectedCell || {})}

Generate the best formula for NexusSheet.`;

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI request timeout')), 6000)
      );

      const generatePromise = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: userContent,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        },
      });

      const response: any = await Promise.race([generatePromise, timeoutPromise]);

      const text = response?.text || '{}';
      const parsed = JSON.parse(text);
      return res.json(parsed);
    } catch (err: any) {
      console.warn('Gemini formula generation error, returning fallback signal:', err.message);
      return res.status(200).json({
        fallback: true,
        error: err.message,
      });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'NexusSheet AI Studio' });
  });

  // Development vs Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
