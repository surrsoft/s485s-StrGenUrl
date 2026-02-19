'use strict';

const DEFAULT_CONFIG_YAML = `projects:
  - name: Project Example
    description: super app
    envs:
      - name: "host"
        description: this is host
        values:
          - example.com
          - test.example.com
      - name: "/:subscriptionId"
        values:
          - 1
          - 2
      - name: "qs1"
        values:
          - a=b
          - c=d
      - name: "qs2"
        values:
          - x=y
          - z=w
    patterns:
      - pattern: "https://{host}/base/{/:subscriptionId}?{qs1}&{qs2}"
        type: url
        name: subscriptions page
      - pattern: "{host}/base/{/:subscriptionId}"
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

function hasUnfilled(result, pattern) {
  return /\{[^}]+\}/.test(result);
}

function buildPreviewHtml(result) {
  // Highlight unfilled placeholders
  return result.replace(/\{([^}]+)\}/g, (match) => {
    return `<span class="placeholder-unfilled">${match}</span>`;
  });
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
        selections[pi][env.name] = env.values[0];
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

      project.envs.forEach(env => {
        const envEl = document.createElement('div');
        envEl.className = 'env';

        const labelEl = document.createElement('div');
        labelEl.className = 'env-label';
        labelEl.innerHTML = `<span class="env-name">${esc(env.name)}</span>
          ${env.description ? `<span class="env-desc">${esc(env.description)}</span>` : ''}`;
        envEl.appendChild(labelEl);

        const select = document.createElement('select');
        select.className = 'env-select';

        (env.values || []).forEach(value => {
          const opt = document.createElement('option');
          opt.value = String(value);
          opt.textContent = String(value);
          if (String(value) === String(selections[pi][env.name])) opt.selected = true;
          select.appendChild(opt);
        });

        select.addEventListener('change', () => {
          selections[pi][env.name] = select.value;
          updatePreviews(pi);
        });

        envEl.appendChild(select);
        envsEl.appendChild(envEl);
      });

      card.appendChild(envsEl);
    }

    // Patterns
    if (project.patterns?.length > 0) {
      const patternsEl = document.createElement('div');
      patternsEl.className = 'patterns';

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

        const result = generateResult(pat.pattern, selections[pi]);
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

    const result = generateResult(pat.pattern, selections[pi]);
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

// ── Init ─────────────────────────────────────────────────────────────────────

document.getElementById('settingsBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openSettings' });
});

loadConfig();
