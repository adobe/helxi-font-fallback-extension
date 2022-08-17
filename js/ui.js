const fonts = {};

const LOADER_PANEL = document.getElementById('loader');
const NOFONTS_PANEL = document.getElementById('nofonts');
const FONTS_PANEL = document.getElementById('fonts');
const COMPUTING_PANEL = document.getElementById('computing');
const RESULTS_PANEL = document.getElementById('results');

const COMPUTE_BUTTON = document.getElementById('compute');
const COPY_BUTTON = document.getElementById('copy');

const FONTS_GRID = document.querySelector('#fonts .grid');
const RESULTS_CODE = document.querySelector('#results pre');

const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await callback(array[index], index, array);
  }
};

const getCurrentTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const log = async (...arguments) => {
  const tab = await getCurrentTab();

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (...arguments) => {
      console.log('[from extension]', ...arguments);
    },
    args: arguments.filter(arg => typeof arg !== 'undefined'),
  });
}

const getDefaultFallbackFontSelect = (id) => {
  const select = document.createElement('select');
  select.id = `fallback-${id}`;
  select.required = true;

  [{ 
    name: 'Arial',
    cat: 'sans-serif',
  }, {
    name: 'Verdana',
    cat: 'sans-serif',
  }, {
    name: 'Helvetica',
    cat: 'sans-serif',
  }, {
    name: 'Tahoma',
    cat: 'sans-serif',
  }, {
    name: 'Trebuchet MS',
    cat: 'sans-serif',
  }, {
    name: 'Times New Roman',
    cat: 'serif', 
  }, {
    name: 'Georgia',
    cat: 'serif', 
  }, {
    name: 'Garamond',
    cat: 'serif',
  }, {
    name: 'Courier New',
    cat: 'monospace', 
  }, {
    name: 'Brush Script MT',
    cat: 'cursive'
  }].forEach((font) => {
    const option = document.createElement('option');
    option.value = font.name;
    option.innerHTML = `${font.name} (${font.cat})`;
    select.appendChild(option);
  });
  
  return select;
}

const compute = async (event) => {
  event.preventDefault();
  event.stopPropagation();

  FONTS_PANEL.classList.add('hidden');
  COMPUTING_PANEL.classList.remove('hidden');
  RESULTS_CODE.innerHTML = '';
  RESULTS_PANEL.classList.remove('hidden');

  const tab = await getCurrentTab();

  await asyncForEach(Object.keys(fonts), async (family) => {
    const weigths = fonts[family];
    const fallback = document.getElementById(`fallback-${family}`).value
    log(`Computing fallback for ${family} with fallback ${fallback}`);
    await asyncForEach(weigths, async (weight) => {
      COMPUTING_PANEL.firstChild.textContent = `Computing fallback for ${family} (${weight})...`;

      await chrome.storage.local.set({ 
        input: {
          family,
          weight,
          fallback
        }
      });

      const promise = new Promise((resolve) => {
        // check until the result is available
        const interval = window.setInterval(async () => {
          const { output } = await chrome.storage.local.get('output');
          log('Checking storage for output', output);
          if (output) {
            window.clearInterval(interval);
            await chrome.storage.local.remove('output');
            resolve(output);
          }
        }, 1000);
      });
      
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['./js/script-computefallbackfont.js'],
      });

      const { adjust, name } = await promise;
    
      RESULTS_CODE.innerHTML += `
      /* fallback font for ${family} (${weight}) */
      @font-face {
        font-family: "${name}";
        size-adjust: ${adjust}%;
        src: local("${fallback}");
      };\n`;
    });
  });
  RESULTS_CODE.innerHTML += '\n';

  COPY_BUTTON.classList.remove('hidden');
  COMPUTING_PANEL.classList.add('hidden');
  
}
const copy = async () => {
  const textarea = document.createElement('textarea');
  textarea.value = RESULTS_CODE.innerHTML;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

const load = async () => {
  const tab = await getCurrentTab();

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['./js/script-getfonts.js'],
  });

  let hasFonts = false;
  if (results && results.length > 0) {
    results[0].result.forEach((font) => {
      const { family, weight } = font;
      if (!fonts[family]) {
        fonts[family] = [];
      }
      fonts[family].push(weight);
      hasFonts = true;
    });
  }

  log('fonts', fonts);

  LOADER_PANEL.classList.add('hidden');
  if (hasFonts) {
    COMPUTE_BUTTON.addEventListener('click', compute);
    COPY_BUTTON.addEventListener('click', copy);
    for (const family in fonts) {
      const weigths = fonts[family].join(', ');
      const id = family;
      const label = document.createElement('label');
      label.for = id;
      label.innerText = `${family} (${weigths})`;

      const select = getDefaultFallbackFontSelect(id);
      label.appendChild(select);
      FONTS_GRID.append(label);
    }
    FONTS_PANEL.classList.remove('hidden');
  } else {
    log('No fonts found');
    NOFONTS_PANEL.classList.remove('hidden');
  }
};

load();