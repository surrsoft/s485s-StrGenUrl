# README-dev — s485s StrGenUrl

Документация для разработчика. Описывает структуру проекта, реализацию и инструкции по установке.

---

## Структура файлов

```
027-s485s-StrGenUrl/
├── manifest.json           # Manifest V3 — конфигурация расширения
├── background.js           # Service worker — обработка сообщений
├── sidepanel.html          # Разметка боковой панели
├── sidepanel.js            # Логика боковой панели
├── sidepanel.css           # Стили боковой панели
├── settings.html           # Разметка страницы настроек
├── settings.js             # Логика страницы настроек
├── settings.css            # Стили страницы настроек
├── lib/
│   └── js-yaml.min.js      # YAML-парсер (js-yaml 4.1.0, без npm)
├── icons/
│   ├── icon16.png          # Иконка 16×16
│   ├── icon48.png          # Иконка 48×48
│   └── icon128.png         # Иконка 128×128
├── generate-icons.js       # Скрипт генерации PNG-иконок (Node.js, без зависимостей)
├── README-ai.md            # Исходное описание (техническое задание)
└── README-dev.md           # Этот файл
```

---

## Установка (режим разработчика)

1. Открыть Chrome → `chrome://extensions/`
2. Включить **Developer mode** (переключатель в правом верхнем углу)
3. Нажать **Load unpacked** → выбрать папку `027-s485s-StrGenUrl`
4. Нажать на иконку расширения в тулбаре — откроется боковая панель

Иконки уже сгенерированы. Если нужно перегенерировать:

```bash
node generate-icons.js
```

---

## Архитектура

### Технологии

- **Manifest V3** — актуальный стандарт Chrome-расширений
- **Side Panel API** (`chrome.sidePanel`) — боковая панель браузера
- **`chrome.storage.sync`** — хранение конфига, синхронизируется между устройствами
- **js-yaml 4.1.0** — YAML-парсер, подключён локально без npm/бандлера
- Чистый JS без фреймворков, без build-step

### Поток данных

```
chrome.storage.sync
       │
       ▼
  sidepanel.js          settings.js
  ─────────────         ────────────────
  loadConfig()          loadConfig()  ← читает configYaml
  jsyaml.load()         textarea ← отображает
  renderConfig()        saveConfig() → jsyaml.load() + validateConfig()
  updatePreviews()                   → chrome.storage.sync.set()
       │
       ▼
  chrome.storage.onChanged  ──→  sidepanel автообновляется
```

### background.js

Service worker обрабатывает два сообщения:

| `message.action` | Действие |
|---|---|
| `openSettings` | Открывает `settings.html` в новой вкладке |
| `openUrl` | Открывает произвольный URL в новой вкладке |

Открытие URL через background.js — намеренное решение: `chrome.tabs.create` работает надёжнее из service worker, чем напрямую из контекста side panel.

---

## Боковая панель (`sidepanel.js`)

### Генерация строки

```js
function generateResult(pattern, projectSelections) {
  return pattern.replace(/\{([^}]+)\}/g, (match, name) => {
    const val = projectSelections[name];
    return val !== undefined ? String(val) : match;
  });
}
```

Плейсхолдеры `{имя}` заменяются на выбранное значение. Если значение не выбрано — плейсхолдер остаётся и подсвечивается оранжевым в превью.

### Состояние

```js
let selections = [];  // selections[projectIndex][envName] = selectedValue
let currentConfig = null;
```

При изменении `configYaml` в storage `selections` сбрасывается и конфиг перерисовывается целиком.

### Инициализация значений

При рендере каждого проекта первое значение каждой переменной выбирается автоматически (если `selections[pi][env.name]` ещё не задан).

---

## Страница настроек (`settings.js`)

### YAML-редактор с подсветкой синтаксиса

Реализован через технику **textarea overlay**:

```html
<div class="editor-wrapper">
  <pre  class="editor-pre"      id="editorPre">      <!-- подсвеченный HTML --></pre>
  <textarea class="editor-textarea" id="editorTextarea"> <!-- прозрачный текст, видимый курсор --></textarea>
</div>
```

- `editor-textarea`: `color: transparent`, `caret-color: #cdd6f4` — пользователь видит курсор и взаимодействует с textarea
- `editor-pre`: `pointer-events: none`, positioned absolute под textarea — показывает подсвеченный HTML
- Скролл синхронизируется через `scroll`-событие textarea

Подсветка (`highlightYaml`) — собственный простой токенизатор для YAML, без внешних зависимостей. Цветовая схема: **Catppuccin Mocha**.

### Валидация конфига

`validateConfig(obj)` проверяет:

- Корень — объект с ключом `projects` (массив)
- Каждый проект: `name` обязателен (string)
- Каждый env: `name` обязателен, `values` — непустой массив
- Каждый pattern: `pattern` обязателен, `type` — `"url"` или `"str"`

При ошибке — сообщение с указанием места (`projects[0].envs[1]: ...`).

### Хранение

Конфиг хранится как YAML-строка:

```js
chrome.storage.sync.set({ configYaml: yamlString })
```

Лимит `chrome.storage.sync`: 8 КБ на ключ, 100 КБ суммарно.

---

## Генерация иконок (`generate-icons.js`)

Создаёт PNG-файлы без npm-зависимостей, используя только встроенные модули Node.js:

- `zlib` — сжатие IDAT-данных
- `fs` / `path` — запись файлов
- Реализован CRC32 и PNG-формат вручную

Иконка: индиго-градиент с белой буквой «S».

---

## Добавление нового функционала

### Новая переменная с произвольным вводом

В `sidepanel.js` в `renderConfig()` добавить `<input>` рядом с `<select>` для env'ов с флагом `allowCustom: true` (или по типу).

### История генераций

Хранить в `chrome.storage.local` (не sync — избежать лимитов) массив последних N результатов на проект.

### Быстрый поиск проектов

Добавить `<input type="search">` в header, фильтровать карточки проектов по `project.name` через `card.style.display`.
