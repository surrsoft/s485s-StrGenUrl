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

// selections[projectIndex][envName] = selectedValue
let selections = [];
let currentConfig = null;

// ── String generation ────────────────────────────────────────────────────────

function generateResult(pattern, projectSelections) {
  return pattern.replace(/\{([^}]+)\}/g, (match, name) => {
    const val = projectSelections[name];
    return val !== undefined ? String(val) : match;
  });
}

function normalizeUrl(url) {
  // Fix multiple consecutive slashes, but preserve protocol (://)
  url = url.replace(/([^:])\/\/+/g, '$1/');
  // Fix multiple consecutive &
  url = url.replace(/&{2,}/g, '&');
  // Remove leading & after ? (?&foo → ?foo)
  url = url.replace(/\?&+/g, '?');
  // Remove trailing &
  url = url.replace(/&+$/, '');
  // Remove trailing ?
  url = url.replace(/\?$/, '');
  return url;
}

function hasUnfilled(result, pattern) {
  return /\{[^}]+\}/.test(result);
}

function buildPreviewHtml(result) {
  // Highlight unfilled placeholders
  return result.replace(/\{([^}]+)\}/g, (match) => {
    return `<span class="placeholder-unfilled">${match}</span>`;
  });
}

function normalizeValue(item) {
  if (item === null || item === undefined) return null;
  if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
    const val = 'value' in item ? String(item.value) : ('name' in item ? String(item.name) : null);
    const name = item.name ? String(item.name) : null;
    return val !== null ? { value: val, name } : null;
  }
  return { value: String(item), name: null };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderConfig(config) {
  const content = document.getElementById('content');
  content.innerHTML = '';

  if (!config || !Array.isArray(config.projects) || config.projects.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        No projects configured.<br>
        Click <b>Settings</b> to add projects.
      </div>`;
    return;
  }

  config.projects.forEach((project, pi) => {
    if (!selections[pi]) selections[pi] = {};

    // Pre-select first value for each env
    (project.envs || []).forEach(env => {
      if (selections[pi][env.name] === undefined && env.values?.length > 0) {
        const first = normalizeValue(env.values[0]);
        if (first) selections[pi][env.name] = first.value;
      }
    });

    const card = document.createElement('div');
    card.className = 'project';
    card.dataset.pi = pi;

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'project-header';
    hdr.innerHTML = `<div class="project-name">${esc(project.name)}</div>
      ${project.description ? `<div class="project-desc">${esc(project.description)}</div>` : ''}`;
    card.appendChild(hdr);

    // Envs
    if (project.envs?.length > 0) {
      const envsEl = document.createElement('div');
      envsEl.className = 'envs';

      const envsTitleEl = document.createElement('div');
      envsTitleEl.className = 'section-title';
      envsTitleEl.textContent = 'Переменные';
      envsEl.appendChild(envsTitleEl);

      project.envs.forEach(env => {
        const envEl = document.createElement('div');
        envEl.className = 'env';

        const labelEl = document.createElement('div');
        labelEl.className = 'env-label';
        labelEl.innerHTML = `<span class="env-name">${esc(env.name)}</span>
          ${env.description ? `<span class="env-desc">${esc(env.description)}</span>` : ''}`;
        envEl.appendChild(labelEl);

        const normalizedValues = (env.values || []).map(v => normalizeValue(v)).filter(Boolean);
        const currentVal = String(selections[pi][env.name] ?? '');

        const customSelect = document.createElement('div');
        customSelect.className = 'env-custom-select';

        const trigger = document.createElement('div');
        trigger.className = 'env-custom-trigger';

        const updateTrigger = (value, name) => {
          trigger.innerHTML = '';
          const valEl = document.createElement('div');
          valEl.className = 'env-custom-trigger-value';
          valEl.textContent = value;
          trigger.appendChild(valEl);
          if (name) {
            const nameEl = document.createElement('div');
            nameEl.className = 'env-custom-trigger-name';
            nameEl.textContent = name;
            trigger.appendChild(nameEl);
          }
        };

        const dropdownEl = document.createElement('div');
        dropdownEl.className = 'env-custom-dropdown';

        normalizedValues.forEach(({ value, name }) => {
          const isSelected = value === currentVal;
          if (isSelected) updateTrigger(value, name || '');

          const optEl = document.createElement('div');
          optEl.className = 'env-custom-option' + (isSelected ? ' selected' : '');

          const valEl = document.createElement('div');
          valEl.className = 'env-custom-option-value';
          valEl.textContent = value;
          optEl.appendChild(valEl);

          if (name) {
            const nameEl = document.createElement('div');
            nameEl.className = 'env-custom-option-name';
            nameEl.textContent = name;
            optEl.appendChild(nameEl);
          }

          optEl.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownEl.querySelectorAll('.env-custom-option').forEach(o => o.classList.remove('selected'));
            optEl.classList.add('selected');
            selections[pi][env.name] = value;
            updateTrigger(value, name || '');
            customSelect.classList.remove('open');
            updatePreviews(pi);
          });

          dropdownEl.appendChild(optEl);
        });

        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.env-custom-select.open').forEach(s => {
            if (s !== customSelect) s.classList.remove('open');
          });
          customSelect.classList.toggle('open');
        });

        customSelect.appendChild(trigger);
        customSelect.appendChild(dropdownEl);
        envEl.appendChild(customSelect);
        envsEl.appendChild(envEl);
      });

      card.appendChild(envsEl);
    }

    // Patterns
    if (project.patterns?.length > 0) {
      const patternsEl = document.createElement('div');
      patternsEl.className = 'patterns';

      const patternsTitleEl = document.createElement('div');
      patternsTitleEl.className = 'section-title';
      patternsTitleEl.textContent = 'Шаблоны';
      patternsEl.appendChild(patternsTitleEl);

      project.patterns.forEach((pat, pati) => {
        const patEl = document.createElement('div');
        patEl.className = 'pattern';
        patEl.dataset.pati = pati;

        if (pat.name) {
          const nameEl = document.createElement('div');
          nameEl.className = 'pattern-name';
          nameEl.textContent = pat.name;
          patEl.appendChild(nameEl);
        }

        let result = generateResult(pat.pattern, selections[pi]);
        if (pat.type === 'url') result = normalizeUrl(result);
        const unfilled = hasUnfilled(result);

        const preview = document.createElement('div');
        preview.className = 'pattern-preview' + (unfilled ? ' has-unfilled' : '');
        preview.innerHTML = buildPreviewHtml(esc(result));
        preview.dataset.rawResult = result;
        patEl.appendChild(preview);

        const actions = document.createElement('div');
        actions.className = 'pattern-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-copy';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', () => copyToClipboard(preview.dataset.rawResult, copyBtn));
        actions.appendChild(copyBtn);

        if (pat.type === 'url') {
          const openBtn = document.createElement('button');
          openBtn.className = 'btn btn-open';
          openBtn.textContent = 'Open';
          openBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'openUrl', url: preview.dataset.rawResult });
          });
          actions.appendChild(openBtn);
        }

        patEl.appendChild(actions);

        // Collapsible "Show pattern"
        const details = document.createElement('details');
        details.className = 'pattern-details';
        const summary = document.createElement('summary');
        summary.textContent = 'Show pattern';
        const patternText = document.createElement('div');
        patternText.className = 'pattern-raw';
        patternText.innerHTML = esc(pat.pattern).replace(
          /\{([^}]+)\}/g,
          (match) => `<span class="pattern-raw-placeholder">${match}</span>`
        );
        details.appendChild(summary);
        details.appendChild(patternText);
        patEl.appendChild(details);

        patternsEl.appendChild(patEl);
      });

      card.appendChild(patternsEl);
    }

    content.appendChild(card);
  });
}

function updatePreviews(pi) {
  if (!currentConfig?.projects?.[pi]) return;
  const project = currentConfig.projects[pi];

  const card = document.querySelector(`.project[data-pi="${pi}"]`);
  if (!card) return;

  card.querySelectorAll('.pattern').forEach((patEl, pati) => {
    const pat = project.patterns?.[pati];
    if (!pat) return;

    let result = generateResult(pat.pattern, selections[pi]);
    if (pat.type === 'url') result = normalizeUrl(result);
    const unfilled = hasUnfilled(result);

    const preview = patEl.querySelector('.pattern-preview');
    preview.innerHTML = buildPreviewHtml(esc(result));
    preview.dataset.rawResult = result;
    preview.className = 'pattern-preview' + (unfilled ? ' has-unfilled' : '');
  });
}

// ── Clipboard ────────────────────────────────────────────────────────────────

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = orig;
    btn.classList.remove('copied');
  }, 1500);
}

// ── Storage ──────────────────────────────────────────────────────────────────

function loadConfig() {
  chrome.storage.sync.get(['configYaml'], ({ configYaml }) => {
    const yaml = configYaml || DEFAULT_CONFIG_YAML;
    try {
      currentConfig = jsyaml.load(yaml);
      renderConfig(currentConfig);
    } catch (e) {
      document.getElementById('content').innerHTML =
        `<div class="error-state">Config parse error: ${esc(e.message)}</div>`;
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.configYaml) {
    selections = [];
    loadConfig();
  }
});

// ── Utils ────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Font size controls ────────────────────────────────────────────────────────

const FONT_SCALES = [0.55, 0.65, 0.75, 0.85, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.65, 1.8];
const DEFAULT_FONT_INDEX = 5; // 1.0

function applyFontLevel(index) {
  const content = document.getElementById('content');
  content.style.setProperty('--sgu-scale', String(FONT_SCALES[index]));
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
    }
  });

  document.getElementById('fontIncreaseBtn').addEventListener('click', () => {
    if (fontIndex < FONT_SCALES.length - 1) {
      fontIndex++;
      applyFontLevel(fontIndex);
      chrome.storage.local.set({ fontIndex });
    }
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.getElementById('settingsBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openSettings' });
});

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(dark) {
  document.body.classList.toggle('dark', dark);
  document.getElementById('themeBtn').textContent = dark ? '◐' : '◑';
}

(function initTheme() {
  chrome.storage.local.get(['darkTheme'], ({ darkTheme }) => {
    applyTheme(!!darkTheme);
  });
  document.getElementById('themeBtn').addEventListener('click', () => {
    const dark = !document.body.classList.contains('dark');
    applyTheme(dark);
    chrome.storage.local.set({ darkTheme: dark });
  });
})();

document.addEventListener('click', () => {
  document.querySelectorAll('.env-custom-select.open').forEach(s => s.classList.remove('open'));
});

initFontControls();
loadConfig();
