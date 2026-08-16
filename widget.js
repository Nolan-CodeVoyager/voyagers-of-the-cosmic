
    // =========================================================================
    // ЧАТ-ВИДЖЕТ — ОБЩАЯ СХЕМА РАБОТЫ
    // 1. Пользователь вводит текст / прикрепляет фото → sendMessage()
    // 2. Сообщение показывается в UI и добавляется в history[]
    // 3. history отправляется POST на /api/chat (локальный backend)
    // 4. Backend подставляет API-ключ и пересылает в NVIDIA API
    // 5. Ответ парсится (Markdown + LaTeX) и выводится в чат
    // =========================================================================

    // --- Ссылки на элементы интерфейса -----------------------------------------
    const chatMessages = document.getElementById('chatMessages');           // контейнер ленты сообщений
    const userInput = document.getElementById('userInput');                 // textarea для ввода
    const sendBtn = document.getElementById('sendBtn');                     // кнопка отправки
    const modelSelect = document.getElementById('modelSelect');             // выпадающий список моделей
    const clearBtn = document.getElementById('clearBtn');                   // очистка истории

    const imageInput = document.getElementById('imageInput');               // скрытый <input type="file">
    const attachBtn = document.getElementById('attachBtn');                 // кнопка 📎
    const imagePreviewContainer = document.getElementById('imagePreviewContainer'); // миниатюры до отправки

    const imageModal = document.getElementById('imageModal');               // оверлей просмотра фото
    const modalImage = document.getElementById('modalImage');               // <img> внутри модалки

    // --- Состояние приложения --------------------------------------------------
    // attachedImages — data URL (base64) картинок, ещё не отправленных в чат
    let attachedImages = [];
    // Единственная модель с поддержкой vision (текст + изображения)
    // Модели с поддержкой изображений (vision). Добавляйте новые сюда, в кавычках.
    const VISION_MODELS = [
      "nvidia/nemotron-nano-12b-v2-vl",
      "thinkingmachines/inkling",

      // 'nvidia/новая-vision-модель'
    ];


    // history — полная переписка для контекста следующих запросов.
    // Формат совместим с OpenAI Chat API: { role, content }.
    // system-промпт добавляется на сервере, здесь только user/assistant.
    let history = [];



    // --- Выбор модели и прикрепление картинок ----------------------------------
    /**
     * Включает/выключает кнопку 📎 в зависимости от модели.
     * Только Nemotron Nano VL понимает картинки; при смене на текстовую модель
     * прикреплённые, но не отправленные изображения сбрасываются.
     */
    function updateAttachButtonState() {
      const isVisionModel = VISION_MODELS.includes(modelSelect.value);
      attachBtn.disabled = !isVisionModel;

      if (!isVisionModel && attachedImages.length > 0) {
        attachedImages = [];
        imageInput.value = '';
        renderPreviews();
      }
    }

    modelSelect.addEventListener('change', updateAttachButtonState);
    updateAttachButtonState(); // вызов при загрузке — корректное начальное состояние 📎

    // Программно открываем диалог выбора файла (input скрыт для красоты UI)
    attachBtn.addEventListener('click', () => {
      if (!attachBtn.disabled) {
        imageInput.click();
      }
    });

    // После выбора файлов: читаем каждый как data URL и показываем превью
    imageInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      files.forEach(file => {
        // Игнорируем не-изображения (PDF, видео и т.д.)
        if (!file.type.startsWith('image/')) {
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          // event.target.result — строка вида "data:image/png;base64,..."
          attachedImages.push(event.target.result);
          renderPreviews();
        };
        reader.readAsDataURL(file);
      });
    });

    /**
     * Рисует миниатюры прикреплённых картинок над полем ввода.
     * У каждой миниатюры кнопка ✕ для удаления до отправки.
     */
    function renderPreviews() {
      imagePreviewContainer.innerHTML = '';
      attachedImages.forEach((src, index) => {
        const thumb = document.createElement('div');
        thumb.className = 'preview-thumb';
        thumb.innerHTML = `
          <img src="${src}" alt="Превью" />
          <button type="button" class="remove-btn" onclick="removeImage(${index})">✕</button>
        `;
        imagePreviewContainer.appendChild(thumb);
      });
    }

    /** Удаляет одну картинку из attachedImages по индексу и обновляет превью */
    function removeImage(index) {
      attachedImages.splice(index, 1);
      renderPreviews();
      if (attachedImages.length === 0) {
        imageInput.value = '';
      }
    }

    // --- Очистка переписки -----------------------------------------------------
    // Сбрасывает UI, history, вложения и снова показывает приветствие
    clearBtn.addEventListener('click', () => {
      chatMessages.innerHTML = '';
      history = [];
      attachedImages = [];
      imageInput.value = '';
      renderPreviews();
      resetTextareaHeight();
      showWelcomeMessage();
      userInput.focus();
    });

    // --- Динамическое изменение высоты поля ввода ------------------------------
    // min/max в пикселях ≈ 1 и 3 строки текста
    const TEXTAREA_MIN_HEIGHT = 24;
    const TEXTAREA_MAX_HEIGHT = 72;

    /** Подстраивает высоту textarea под содержимое (до TEXTAREA_MAX_HEIGHT) */
    function autoResizeTextarea() {
      userInput.style.height = 'auto';
      const newHeight = Math.min(
        Math.max(userInput.scrollHeight, TEXTAREA_MIN_HEIGHT),
        TEXTAREA_MAX_HEIGHT
      );
      userInput.style.height = `${newHeight}px`;
    }

    /** Возвращает поле ввода к однострочной высоте после отправки или очистки */
    function resetTextareaHeight() {
      userInput.style.height = `${TEXTAREA_MIN_HEIGHT}px`;
    }

    userInput.addEventListener('input', autoResizeTextarea);
    resetTextareaHeight();

    // --- Подготовка истории под выбранную модель -------------------------------

    /**
     * Адаптирует history[] перед отправкой на сервер.
     * Текстовые модели не принимают массив content с image_url — оставляем только текст,
     * иначе API вернёт ошибку. Vision-модель получает полный мультимодальный формат.
     *
     * @param {string} modelName — id модели из <select>
     * @returns {Array} очищенная копия history для POST /api/chat
     */
    function prepareHistoryForModel(modelName) {
      const isVisionModel = VISION_MODELS.includes(modelName);

      return history.map(item => {
        if (typeof item.content === 'string') {
          return item;
        }

        if (Array.isArray(item.content)) {
          if (!isVisionModel) {
            const textPart = item.content.find(c => c.type === 'text');
            return {
              role: item.role,
              content: textPart ? textPart.text : '[Пользователь прикреплял изображение]'
            };
          }

          return {
            role: item.role,
            content: item.content.map(part => {
              if (part.type === 'text') {
                return { type: 'text', text: part.text };
              }
              if (part.type === 'image_url') {
                return {
                  type: 'image_url',
                  image_url: { url: part.image_url.url }
                };
              }
              return part;
            })
          };
        }
        return item;
      });
    }

    // --- Отправка сообщения на сервер ------------------------------------------
    /**
     * Главная функция виджета: собирает сообщение, обновляет UI, вызывает API.
     * Вызывается по клику «Отправить» или Enter (без Shift).
     */
    async function sendMessage() {
      const text = userInput.value.trim();

      // Пустое сообщение без картинок — не отправляем
      if (!text && attachedImages.length === 0) return;

      const selectedModel = modelSelect.value;
      const currentImages = [...attachedImages]; // копия — сбросим attachedImages до ответа API

      let messageContent = text;

      // OpenAI-формат для vision: content — массив частей { type: "text" | "image_url", ... }
      if (currentImages.length > 0) {
        const contentArray = [];
        if (text) {
          contentArray.push({ type: 'text', text: text });
        }
        currentImages.forEach(base64 => {
          contentArray.push({
            type: 'image_url',
            image_url: { url: base64 } // data URL целиком уходит на backend → NVIDIA
          });
        });
        messageContent = contentArray;
      }

      // Сразу показываем сообщение пользователю (optimistic UI)
      addMessage(text, 'user', currentImages);
      history.push({ role: 'user', content: messageContent });

      // Очищаем поле ввода и вложения
      userInput.value = '';
      attachedImages = [];
      renderPreviews();
      imageInput.value = '';
      resetTextareaHeight();

      // Блокируем ввод на время запроса — защита от двойной отправки
      sendBtn.disabled = true;
      userInput.disabled = true;
      attachBtn.disabled = true;

      // Индикатор «бот печатает» — три анимированные точки
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'message bot typing-indicator';
      loadingDiv.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
      chatMessages.appendChild(loadingDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      const cleanedHistory = prepareHistoryForModel(selectedModel);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: cleanedHistory,
            model: selectedModel
          })
        });

        const data = await response.json();
        loadingDiv.remove();

        // Успешный ответ NVIDIA (формат OpenAI): choices[0].message.content
        if (response.ok && data.choices && data.choices[0]?.message?.content) {
          const reply = data.choices[0].message.content;
          addMessage(reply, 'bot');
          history.push({ role: 'assistant', content: reply });
          // Списываем запрос только после успешного отображения ответа пользователю
          fetch('/api/deduct', { method: 'POST', credentials: 'include' })
            .then(r => r.json())
            .then(d => {
              const el = window.parent ? window.parent.document.getElementById('requestCounter') : document.getElementById('requestCounter');
              if (el) el.textContent = (d.remaining || 0);
            })
            .catch(() => {});
        } else {
          const errorMsg = data.error || 'Ошибка при получении ответа от сервера';
          addMessage(`⚠️ ${errorMsg}`, 'bot error');
        }
      } catch (err) {
        // fetch упал — сервер не запущен или нет сети
        loadingDiv.remove();
        addMessage('⚠️ Не удалось связаться с сервером. Запустите: npm start', 'bot error');
      } finally {
        // Разблокируем UI независимо от успеха/ошибки
        sendBtn.disabled = false;
        userInput.disabled = false;
        updateAttachButtonState();
        userInput.focus();
        updateRequestCounter();
      }
    }

    // --- Markdown и LaTeX в ответах бота ---------------------------------------
    /**
     * Оборачивает «голые» LaTeX-окружения (matrix, pmatrix и т.д.) в \\[ ... \\],
     * чтобы KaTeX auto-render их распознал как блочные формулы.
     */
    function normalizeLatex(text) {
      if (!text) return '';
      let result = text;

      result = result.replace(/(?<!\\\[\s*|\\\(\s*)\\begin\{(pmatrix|bmatrix|matrix|aligned|equation)\}[\s\S]*?\\end\{\1\}(?!\s*\\\]|\s*\\\))/g, (match) => {
        return `\\[ ${match} \\]`;
      });

      return result;
    }

    /**
     * Превращает сырой текст ответа бота в HTML:
     * 1) нормализует LaTeX;
     * 2) временно заменяет формулы на плейсхолдеры (marked не ломает $ и \\);
     * 3) прогоняет Markdown через marked;
     * 4) возвращает формулы на место — их потом отрисует renderMathInElement.
     */
    function parseMarkdownWithMath(rawText) {
      const normalizedText = normalizeLatex(rawText);
      const mathBlocks = [];

      const mathRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;

      const safeText = normalizedText.replace(mathRegex, (match) => {
        const id = `%%MATHBLOCK${mathBlocks.length}%%`;
        mathBlocks.push(match);
        return id;
      });

      let html = typeof marked !== 'undefined' ? marked.parse(safeText) : safeText;

      mathBlocks.forEach((math, index) => {
        const id = `%%MATHBLOCK${index}%%`;
        html = html.replace(id, () => math);
      });

      return html;
    }

    // --- Отображение сообщений в чате --------------------------------------------
    /**
     * Добавляет пузырь сообщения в #chatMessages.
     * @param {string} text — текст сообщения
     * @param {string} className — "user" | "bot" | "bot error"
     * @param {string[]} [images=[]] — data URL для миниатюр (только у user)
     */
    function addMessage(text, className, images = []) {
      const msgDiv = document.createElement('div');
      msgDiv.className = `message ${className}`;

      if (images && images.length > 0) {
        const imgsDiv = document.createElement('div');
        imgsDiv.className = 'message-images';
        images.forEach(src => {
          const img = document.createElement('img');
          img.src = src;
          img.onclick = () => openImageModal(src);
          imgsDiv.appendChild(img);
        });
        msgDiv.appendChild(imgsDiv);
      }

      if (text) {
        if (className.includes('bot')) {
          // Ответ бота: Markdown + KaTeX (формулы в \\( \\), \\[ \\], $$ $$)
          msgDiv.innerHTML += parseMarkdownWithMath(text);

          if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(msgDiv, {
              delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '\\[', right: '\\]', display: true },
                { left: '\\(', right: '\\)', display: false },
                { left: '$', right: '$', display: false }
              ],
              throwOnError: false // не падать, если формула битая
            });
          }
        } else {
          // Сообщение пользователя — plain text (без HTML), защита от XSS
          const textNode = document.createElement('span');
          textNode.textContent = text;
          msgDiv.appendChild(textNode);
        }
      }

      chatMessages.appendChild(msgDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      return msgDiv;
    }

    // --- Модальное окно для просмотра картинок -----------------------------------
    /** Открывает полноэкранный просмотр изображения по клику на миниатюру */
    function openImageModal(src) {
      modalImage.src = src;
      imageModal.classList.add('active');
    }

    /** Закрывает модалку и очищает src (освобождает память) */
    function closeImageModal() {
      imageModal.classList.remove('active');
      modalImage.src = '';
    }

    // Закрытие модалки по Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && imageModal.classList.contains('active')) {
        closeImageModal();
      }
    });

    // --- Обновление счётчика запросов в родительском окне ------------------------
    async function updateRequestCounter() {
      try {
        const res = await fetch('/api/limit', { credentials: 'include' });
        const data = await res.json();
        const el = window.parent ? window.parent.document.getElementById('requestCounter') : document.getElementById('requestCounter');
        if (el) el.textContent = (data.remaining || 0);
      } catch (e) { console.error('Не удалось обновить счётчик', e); }
    }

    // --- Приветственное сообщение при открытии виджета ---------------------------
    // Показывается сразу при загрузке и снова после нажатия «Очистить»
    const WELCOME_MESSAGE =
      'Привет, космический путешественник! 🌌 Я ассистент Voyagers of the Cosmic на базе передовых AI. Задайте вопрос или прикрепите фото через скрепку 📎 — отправимся в путь!';

    /** Показывает стартовое приветствие бота (не добавляется в history — это не диалог) */
    function showWelcomeMessage() {
      addMessage(WELCOME_MESSAGE, 'bot');
    }

    // При первой загрузке страницы показываем приветствие
    showWelcomeMessage();
    updateRequestCounter();
  