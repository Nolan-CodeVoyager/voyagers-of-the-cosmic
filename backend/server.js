// =============================================================================
// СЕРВЕР-ПРОКСИ (Node.js + Express)
// -----------------------------------------------------------------------------
// Зачем нужен: браузер не должен знать API-ключ NVIDIA. Этот сервер:
//   1. Раздаёт статические файлы сайта из папки main/
//   2. Принимает запросы от виджета на /api/chat
//   3. Пересылает их в NVIDIA API с ключом из .env
// =============================================================================

// express — веб-фреймворк: маршруты, middleware, раздача статики
const express = require('express');
// path — склеивание путей к файлам (кроссплатформенно: Windows / Linux)
const path = require('path');
// dotenv загружает переменные из backend/.env в process.env при старте сервера
require('dotenv').config({ path: path.join(__dirname, '.env') });

// app — экземпляр Express-приложения, через него регистрируем все маршруты
const app = express();
// PORT: из .env или 3000 по умолчанию — порт, на котором слушает сервер
const PORT = process.env.PORT || 3000;

const MAX_FREE_REQUESTS = 10;
const ipLimits = {};
const redeemedByIp = {};
const unlimitedIps = new Set();
const ipBonuses = {};

// --- Настройки NVIDIA API ---------------------------------------------------
// Ключ берётся ТОЛЬКО из переменной окружения (файл backend/.env).
// Никогда не храните ключ прямо в коде!
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1/chat/completions';

// Модель по умолчанию, если клиент не передал свою
const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

// Единый системный промпт — задаёт поведение ассистента для всех запросов
const SYSTEM_PROMPT = {
  role: 'system',
  content:
    'Ты вежливый и умный AI-ассистент. Всегда отвечай чётко, грамотно и понятно на русском языке, независимо от языка вопроса. ' +
    'Все математические выражения и формулы оформляй строго в формате LaTeX: используй \\( ... \\) для формул внутри текста и \\[ ... \\] для отдельных больших формул, систем и матриц.'
};

// --- Middleware (промежуточные обработчики) -----------------------------------
// Выполняются для каждого запроса ДО маршрутов (порядок регистрации важен).

// express.json — парсит тело POST с Content-Type: application/json в req.body
// limit 20mb: картинки в base64 сильно раздувают JSON
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS: браузерный виджет (iframe) и fetch с другого origin не заблокирует ответ.
// OPTIONS → 204: preflight-запрос браузера перед POST с JSON
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const SITE_PASSWORD = process.env.SITE_PASSWORD || 'voyager123';

app.use((req, res, next) => {
  const cookieStr = req.headers.cookie || '';
  const cookieAuth = cookieStr.split(';').map(c => c.trim()).find(c => c.startsWith('site_auth='));
  const auth = req.headers['x-site-pass'] || (req.query.pass || req.body?.pass || '');
  const hasCookie = cookieAuth === 'site_auth=1';
  if (auth === SITE_PASSWORD || hasCookie) {
    if (auth === SITE_PASSWORD && !hasCookie) {
      res.setHeader('Set-Cookie', 'site_auth=1; Path=/; HttpOnly');
    }
    return next();
  }
  // Нет пароля или неверный
  if (req.path === '/' || req.path.endsWith('.html') || req.path === '') {
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Доступ ограничен</title></head><body style="background:#050014;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><form method="POST" action="/" style="background:#12082a;padding:32px;border-radius:16px;border:1px solid rgba(168,85,247,0.2);box-shadow:0 0 30px rgba(124,58,237,0.2);width:340px;box-sizing:border-box;"><h2 style="margin:0 0 16px;color:#e879f9;text-align:center;">Введите пароль</h2><input name="pass" type="password" placeholder="Пароль" style="padding:10px 14px;border-radius:8px;border:1px solid rgba(168,85,247,0.3);background:rgba(255,255,255,0.05);color:#fff;width:100%;margin-bottom:12px;outline:none;box-sizing:border-box;font-size:15px;"><button type="submit" style="padding:10px 0;border:none;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-weight:600;cursor:pointer;width:100%;font-size:15px;">Войти</button></form></body></html>`);
  }
  return res.status(403).send('Forbidden');
});

// --- Раздача статических файлов (сайт и виджет) ------------------------------
// main/ — index.html, widget.html и прочие ассеты доступны по URL без отдельных маршрутов
const mainFolder = path.join(__dirname, '..');
app.use(express.static(mainFolder));
app.use('/main', express.static(path.join(__dirname, '..', 'main')));
app.use('/img', express.static(path.join(__dirname, '..', 'img')));

// Явный маршрут / → index.html (на случай, если static не сработал)
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'index.html'));
});
app.post('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'index.html'));
});

// --- API: чат с нейросетью ---------------------------------------------------
// POST /api/chat — единственная точка входа для виджета.
// Тело запроса (JSON): { messages: [...], model?: "nvidia/..." }
//   messages — массив { role: "user"|"assistant", content: string | [...] }
//   model — опционально; если не передан, берётся DEFAULT_MODEL
app.post('/api/chat', async (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
  const ipKey = clientIp.toString().trim();
  if ((ipLimits[ipKey] || 0) >= MAX_FREE_REQUESTS) {
    return res.status(429).json({ error: 'Лимит бесплатных запросов исчерпан (10 на IP).' });
  }

  const { messages, model } = req.body;

  // Валидация: без массива сообщений API NVIDIA не вызвать
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Нет сообщений или неверный формат' });
  }

  // Без ключа сервер не может проксировать запрос — возвращаем понятную ошибку
  if (!NVIDIA_API_KEY) {
    return res.status(500).json({
      error: 'API-ключ NVIDIA не найден. Создайте файл backend/.env и добавьте NVIDIA_API_KEY=ваш_ключ'
    });
  }

  // Модель из виджета или запасной вариант по умолчанию
  const targetModel = model || DEFAULT_MODEL;

  // Убираем system-сообщения из истории клиента — используем только наш единый промпт,
  // чтобы поведение ассистента (язык, LaTeX) было одинаковым для всех пользователей
  const userMessages = messages.filter((msg) => msg.role !== 'system');
  const finalMessages = [SYSTEM_PROMPT, ...userMessages];

  // Базовые параметры запроса к NVIDIA
  const payload = {
    model: targetModel,
    messages: finalMessages,
    temperature: 0.7,
    max_tokens: 4096
  };

  // --- Настройки под конкретные модели ---------------------------------------
  // Каждая модель NVIDIA рекомендует свои параметры — подстраиваем payload.

  // Nemotron 3 Ultra — крупная модель с «рассуждением» (thinking): длинные ответы
  if (targetModel === 'nvidia/nemotron-3-ultra-550b-a55b') {
    payload.temperature = 1;       // выше креативность для развёрнутых текстов
    payload.top_p = 0.95;          // nucleus sampling — разнообразие без хаоса
    payload.max_tokens = 16384;    // лимит длины ответа
    payload.chat_template_kwargs = { enable_thinking: true }; // внутренние «размышления»
    payload.reasoning_budget = 16384; // сколько токенов выделить на thinking
  }

  // Inkling от thinkingmachines — одна из лучших моделей в мире для прогнозирования событий
  if (targetModel === "thinkingmachines/inkling"){
    payload.temperature = 1;
    payload.top_p = 0.95;
    payload.max_tokens = 8192;
    payload.seed = 42;
  }

  // Nemotron 3.5 Lightning — быстрая модель для задач, тоже с thinking
  if (targetModel === 'nvidia/nemotron-3.5-lightning-30b-a3b') {
    payload.chat_template_kwargs = { enable_thinking: true };
    payload.reasoning_budget = 16384;
    payload.max_tokens = 16384;
  }

  // Nemotron Nano VL — vision-модель (текст + картинки): низкая temperature для точности
  if (targetModel === 'nvidia/nemotron-nano-12b-v2-vl') {
    payload.temperature = 0.2;
    payload.max_tokens = 4096;
  }

  // GLM 5.2 — сторонняя модель; seed=42 даёт более воспроизводимые ответы
  if (targetModel === 'z-ai/glm-5.2') {
    payload.temperature = 1;
    payload.top_p = 1;
    payload.max_tokens = 16384;
    payload.seed = 42;
  }

  try {
    // fetch — встроенный в Node 18+ HTTP-клиент; ключ только в заголовке Authorization
    const apiRes = await fetch(NVIDIA_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NVIDIA_API_KEY.trim()}`
      },
      body: JSON.stringify(payload)
    });

    // Читаем тело как текст — так безопаснее, если API вернёт не JSON (HTML-ошибка и т.п.)
    const rawText = await apiRes.text();
    let data;

    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      // Невалидный JSON часто означает неверный ключ или сбой на стороне NVIDIA
      console.error('Ошибка ответа NVIDIA API (не JSON):', rawText);
      return res.status(500).json({
        error: `Ошибка API (статус ${apiRes.status}). Проверьте API-ключ NVIDIA.`
      });
    }

    // HTTP 4xx/5xx — пробрасываем сообщение об ошибке из ответа API в виджет
    if (!apiRes.ok) {
      const errorMessage =
        typeof data?.error === 'string'
          ? data.error
          : data?.error?.message || 'Ошибка NVIDIA API';
      return res.status(apiRes.status).json({ error: errorMessage });
    }

    // Успех: возвращаем данные. Списание запроса происходит отдельно через /api/deduct
    res.json(data);
  } catch (err) {
    // Сеть недоступна, таймаут, DNS — ошибка на уровне соединения
    console.error('Server error:', err);
    res.status(500).json({ error: 'Ошибка соединения с сервером NVIDIA' });
  }
});

// --- API: списание бесплатного запроса (вызывается клиентом после получения ответа) ---
app.post('/api/deduct', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
  const ipKey = clientIp.toString().trim();
  if (unlimitedIps.has(ipKey)) {
    return res.json({ deducted: true, used: 0, remaining: 99999, unlimited: true });
  }
  const bonus = ipBonuses[ipKey] || 0;
  const limit = MAX_FREE_REQUESTS + bonus;
  if ((ipLimits[ipKey] || 0) >= limit) {
    return res.status(429).json({ error: `Лимит исчерпан (${limit} на IP).` });
  }
  ipLimits[ipKey] = (ipLimits[ipKey] || 0) + 1;
  res.json({ deducted: true, used: ipLimits[ipKey], remaining: Math.max(0, limit - ipLimits[ipKey]) });
});

app.post('/api/redeem', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
  const ipKey = clientIp.toString().trim();
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Нет ключа' });
  if (key === process.env.UNLIMITED_KEY) {
    unlimitedIps.add(ipKey);
    return res.json({ redeemed: true, bonus: 'unlimited', remaining: 99999 });
  }
  let bonus = 0;
  const allKeys = Object.entries(process.env).filter(([k]) => k.startsWith('KEY'));
  for (const [envKey, val] of allKeys) {
    if (val === key) {
      const match = envKey.match(/KEY(\d+)_/);
      if (match) bonus = parseInt(match[1]);
    }
  }
  if (bonus === 0) return res.status(400).json({ error: 'Неверный или сгоревший ключ' });
  if (!redeemedByIp[ipKey]) redeemedByIp[ipKey] = new Set();
  if (redeemedByIp[ipKey].has(key)) return res.status(400).json({ error: 'Ключ уже использован для этого IP' });
  redeemedByIp[ipKey].add(key);
  ipBonuses[ipKey] = (ipBonuses[ipKey] || 0) + bonus;
  const used = ipLimits[ipKey] || 0;
  res.json({ redeemed: true, bonus, remaining: Math.max(0, MAX_FREE_REQUESTS + (ipBonuses[ipKey] || 0) - used) });
});

// --- API: получение остатка бесплатных запросов --------------------------------
app.get('/api/limit', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
  const ipKey = clientIp.toString().trim();
  if (unlimitedIps.has(ipKey)) {
    return res.json({ used: 0, remaining: 99999, unlimited: true });
  }
  const bonus = ipBonuses[ipKey] || 0;
  const used = ipLimits[ipKey] || 0;
  res.json({ used, remaining: Math.max(0, MAX_FREE_REQUESTS + bonus - used) });
});

// --- Запуск сервера ----------------------------------------------------------
// listen() начинает принимать HTTP-запросы на PORT
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
  // Предупреждение в консоль, если забыли создать backend/.env
  if (!NVIDIA_API_KEY) {
    console.warn('⚠️  NVIDIA_API_KEY не задан. Создайте файл backend/.env');
  }
});
