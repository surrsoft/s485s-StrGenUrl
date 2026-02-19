'use strict';

const DEFAULT_CONFIG_YAML = `projects:
  - name: Project Example
    description: super app
    envs:
      - name: "host"
        description: this is host
        values:
          - example.com
          - value: test.example.com
            name: Test environment
      - name: ":subscriptionId"
        values:
          - "/1"
          - "/2"
      - name: "qs1"
        values:
          - a=b
          - c=d
      - name: "qs2"
        values:
          - x=y
          - z=w
    patterns:
      - pattern: "https://{host}/base{:subscriptionId}?{qs1}&{qs2}"
        type: url
        name: subscriptions page
      - pattern: "{host}/base{:subscriptionId}"
        type: str
        name: path only
`;

// ── YAML Syntax Highlighter ──────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function colorValue(raw) {
  const t = raw.trim();
  if (!t) return esc(raw);

  // Quoted string
  if (/^["']/.test(t)) return `<span class="hl-string">${esc(raw)}</span>`;
  // Number
  if (/^-?\d+(\.\d+)?$/.test(t)) return `<span class="hl-number">${esc(raw)}</span>`;
  // Boolean
  if (/^(true|false|yes|no|on|off)$/i.test(t)) return `<span class="hl-bool">${esc(raw)}</span>`;
  // Null
  if (/^(null|~)$/i.test(t)) return `<span class="hl-null">${esc(raw)}</span>`;

  return `<span class="hl-value">${esc(raw)}</span>`;
}

function highlightYamlLine(line) {
  // Empty line
  if (!line.trim()) return esc(line);

  // Comment
  if (/^\s*#/.test(line)) {
    return `<span class="hl-comment">${esc(line)}</span>`;
  }

  // Capture leading whitespace
  const indentMatch = line.match(/^(\s*)(.*)/);
  const indent = indentMatch[1];
  const rest = indentMatch[2];

  // List item: "- value" or just "-"
  const dashMatch = rest.match(/^(-)\s*(.*)/);
  if (dashMatch) {
    const afterDash = dashMatch[2];
    // Might be a key-value after dash: "- key: value"
    const kvInDash = afterDash.match(/^([^:]+?)(\s*:\s*)(.*)$/);
    if (kvInDash && !afterDash.startsWith('"') && !afterDash.startsWith("'")) {
      return `${esc(indent)}<span class="hl-dash">-</span> <span class="hl-key">${esc(kvInDash[1])}</span><span class="hl-punct">${esc(kvInDash[2])}</span>${colorValue(kvInDash[3])}`;
    }
    return `${esc(indent)}<span class="hl-dash">-</span>${afterDash ? ' ' + colorValue(afterDash) : ''}`;
  }

  // Key: value
  // Find first colon not inside quotes
  const kvMatch = rest.match(/^([^:'"]+?)(\s*:\s?)(.*)$/);
  if (kvMatch) {
    return `${esc(indent)}<span class="hl-key">${esc(kvMatch[1])}</span><span class="hl-punct">${esc(kvMatch[2])}</span>${colorValue(kvMatch[3])}`;
  }

  return esc(line);
}

function highlightYaml(text) {
  return text.split('\n').map(highlightYamlLine).join('\n');
}

// ── Editor Setup ─────────────────────────────────────────────────────────────

const textarea = document.getElementById('editorTextarea');
const pre = document.getElementById('editorPre');
const editorWrapper = document.getElementById('editorWrapper');

function updateHighlight() {
  // Trailing newline: pre needs a blank line to stay in sync with textarea height
  pre.innerHTML = highlightYaml(textarea.value) + '\n';
  // Подстраиваем высоту под контент
  editorWrapper.style.height = Math.max(300, pre.scrollHeight) + 'px';
}

textarea.addEventListener('input', updateHighlight);

// Sync scroll
textarea.addEventListener('scroll', () => {
  pre.scrollTop = textarea.scrollTop;
  pre.scrollLeft = textarea.scrollLeft;
});

// Tab key → insert 2 spaces
textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.slice(0, s) + '  ' + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = s + 2;
    updateHighlight();
  }
});

// ── Validation ───────────────────────────────────────────────────────────────

function validateConfig(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Root must be a YAML object with a "projects" key.');
  }
  if (!Array.isArray(obj.projects)) {
    throw new Error('Missing required key: "projects" (must be an array).');
  }
  obj.projects.forEach((project, pi) => {
    const label = `projects[${pi}]`;
    if (!project.name || typeof project.name !== 'string') {
      throw new Error(`${label}: "name" is required (string).`);
    }
    if (project.envs !== undefined) {
      if (!Array.isArray(project.envs)) {
        throw new Error(`${label} ("${project.name}"): "envs" must be an array.`);
      }
      project.envs.forEach((env, ei) => {
        const elabel = `${label}.envs[${ei}]`;
        if (!env.name || typeof env.name !== 'string') {
          throw new Error(`${elabel}: "name" is required (string).`);
        }
        if (!Array.isArray(env.values) || env.values.length === 0) {
          throw new Error(`${elabel} ("${env.name}"): "values" must be a non-empty array.`);
        }
        env.values.forEach((v, vi) => {
          if (v === null || v === undefined) {
            throw new Error(`${elabel}: values[${vi}] cannot be null or undefined.`);
          }
          if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            if (!('value' in v) && !('name' in v)) {
              throw new Error(`${elabel}: values[${vi}] object must have "value" or "name"`);
            }
          }
        });
      });
    }
    if (project.patterns !== undefined) {
      if (!Array.isArray(project.patterns)) {
        throw new Error(`${label} ("${project.name}"): "patterns" must be an array.`);
      }
      project.patterns.forEach((pat, pri) => {
        const plabel = `${label}.patterns[${pri}]`;
        if (!pat.pattern || typeof pat.pattern !== 'string') {
          throw new Error(`${plabel}: "pattern" is required (string).`);
        }
        if (!['url', 'str'].includes(pat.type)) {
          throw new Error(`${plabel}: "type" must be "url" or "str" (got: ${JSON.stringify(pat.type)}).`);
        }
      });
    }
  });
}

// ── Message display ──────────────────────────────────────────────────────────

let messageTimer = null;

function showMessage(text, type) {
  const el = document.getElementById('message');
  el.textContent = text;
  el.className = `message ${type} visible`;
  clearTimeout(messageTimer);
  if (type === 'success') {
    messageTimer = setTimeout(() => {
      el.className = 'message';
    }, 2500);
  }
}

function clearMessage() {
  const el = document.getElementById('message');
  el.className = 'message';
}

// ── Save / Load ──────────────────────────────────────────────────────────────

function saveConfig() {
  const yaml = textarea.value.trim();
  if (!yaml) {
    showMessage('Config is empty.', 'error');
    return;
  }

  let parsed;
  try {
    parsed = jsyaml.load(yaml);
  } catch (e) {
    showMessage(`YAML parse error:\n${e.message}`, 'error');
    return;
  }

  try {
    validateConfig(parsed);
  } catch (e) {
    showMessage(`Validation error:\n${e.message}`, 'error');
    return;
  }

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;

  chrome.storage.sync.set({ configYaml: yaml }, () => {
    saveBtn.disabled = false;
    if (chrome.runtime.lastError) {
      showMessage(`Save failed: ${chrome.runtime.lastError.message}`, 'error');
    } else {
      showMessage('Saved!', 'success');
    }
  });
}

function loadConfig() {
  chrome.storage.sync.get(['configYaml'], ({ configYaml }) => {
    const yaml = configYaml || DEFAULT_CONFIG_YAML;
    textarea.value = yaml;
    updateHighlight();
  });
}

function resetToDefault() {
  if (confirm('Reset configuration to the built-in example? Current config will be lost.')) {
    textarea.value = DEFAULT_CONFIG_YAML;
    updateHighlight();
    clearMessage();
  }
}

// ── Font size controls ────────────────────────────────────────────────────────

const FONT_SCALES = [0.55, 0.65, 0.75, 0.85, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.65, 1.8];
const DEFAULT_FONT_INDEX = 5;

function applyFontLevel(index) {
  const page = document.querySelector('.page');
  page.style.setProperty('--sgu-scale', String(FONT_SCALES[index]));
}

function initFontControls() {
  let fontIndex = DEFAULT_FONT_INDEX;
  chrome.storage.local.get(['fontIndex'], ({ fontIndex: stored }) => {
    if (typeof stored === 'number' && stored >= 0 && stored < FONT_SCALES.length) {
      fontIndex = stored;
    }
    applyFontLevel(fontIndex);
  });

  document.getElementById('fontDecreaseBtn').addEventListener('click', () => {
    if (fontIndex > 0) {
      fontIndex--;
      applyFontLevel(fontIndex);
      chrome.storage.local.set({ fontIndex });
      updateHighlight();
    }
  });

  document.getElementById('fontIncreaseBtn').addEventListener('click', () => {
    if (fontIndex < FONT_SCALES.length - 1) {
      fontIndex++;
      applyFontLevel(fontIndex);
      chrome.storage.local.set({ fontIndex });
      updateHighlight();
    }
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.getElementById('saveBtn').addEventListener('click', saveConfig);
document.getElementById('resetBtn').addEventListener('click', resetToDefault);

initFontControls();
loadConfig();
