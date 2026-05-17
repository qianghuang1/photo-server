import PhotoSwipeLightbox from 'https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe-lightbox.esm.js';

const state = {
  dir: new URLSearchParams(window.location.search).get('dir') ?? '',
  images: [],
  selected: new Set()
};

const gallery = document.querySelector('#gallery');
const folders = document.querySelector('#folders');
const breadcrumbs = document.querySelector('#breadcrumbs');
const emptyState = document.querySelector('#emptyState');
const selectAllButton = document.querySelector('#selectAll');
const clearSelectionButton = document.querySelector('#clearSelection');
const downloadSelectedButton = document.querySelector('#downloadSelected');

let lightbox;

selectAllButton.addEventListener('click', () => {
  state.images.forEach((image) => state.selected.add(image.path));
  renderGallery();
});

clearSelectionButton.addEventListener('click', () => {
  state.selected.clear();
  renderGallery();
});

downloadSelectedButton.addEventListener('click', async () => {
  for (const image of state.images.filter((item) => state.selected.has(item.path))) {
    const anchor = document.createElement('a');
    anchor.href = `/download/${encodePathSegments(image.path)}`;
    anchor.download = image.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    await delay(150);
  }
});

window.addEventListener('popstate', () => {
  const dir = new URLSearchParams(window.location.search).get('dir') ?? '';
  loadFolder(dir, { historyMode: 'none' });
});

await loadFolder(state.dir, { historyMode: 'replace' });

async function loadFolder(dir, { historyMode = 'push' } = {}) {
  const response = await fetch(`/api/list?dir=${encodeURIComponent(dir)}`);

  if (!response.ok) {
    throw new Error(`Unable to load folder: ${response.status}`);
  }

  const data = await response.json();
  state.dir = data.dir;
  state.images = data.images;
  state.selected.clear();

  renderBreadcrumbs(data);
  renderFolders(data.folders);
  renderGallery();

  const url = data.dir ? `/?dir=${encodeURIComponent(data.dir)}` : '/';
  if (historyMode === 'push') {
    history.pushState({ dir: data.dir }, '', url);
  } else if (historyMode === 'replace') {
    history.replaceState({ dir: data.dir }, '', url);
  }
}

function renderBreadcrumbs(data) {
  breadcrumbs.replaceChildren(createFolderLink(data.root, ''));

  if (!data.dir) {
    return;
  }

  let current = '';
  for (const part of data.dir.split('/')) {
    current = current ? `${current}/${part}` : part;
    breadcrumbs.append(' / ', createFolderLink(part, current));
  }
}

function renderFolders(items) {
  folders.replaceChildren(
    ...items.map((folder) => {
      const link = createFolderLink(`📁 ${folder.name}`, folder.path);
      link.className = 'folder';
      return link;
    })
  );
}

function renderGallery() {
  gallery.replaceChildren(
    ...state.images.map((image, index) => {
      const tile = document.createElement('article');
      tile.className = 'tile';

      const link = document.createElement('a');
      link.href = image.url;
      link.dataset.pswpWidth = String(image.width);
      link.dataset.pswpHeight = String(image.height);
      link.dataset.index = String(index);

      const img = document.createElement('img');
      img.src = image.thumbnailUrl;
      img.alt = image.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      if (image.width && image.height) {
        img.style.aspectRatio = `${image.width} / ${image.height}`;
      }
      link.append(img);

      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.selected.has(image.path);
      checkbox.addEventListener('click', (event) => event.stopPropagation());
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.selected.add(image.path);
        } else {
          state.selected.delete(image.path);
        }
        updateActions();
      });

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = image.name;

      label.append(checkbox, name);
      tile.append(link, label);
      return tile;
    })
  );

  emptyState.hidden = state.images.length > 0 || folders.children.length > 0;
  updateActions();
  mountLightbox();
}

function updateActions() {
  downloadSelectedButton.disabled = state.selected.size === 0;
  downloadSelectedButton.textContent = state.selected.size
    ? `Download selected (${state.selected.size})`
    : 'Download selected';
}

function createFolderLink(text, dir) {
  const link = document.createElement('a');
  link.href = dir ? `/?dir=${encodeURIComponent(dir)}` : '/';
  link.textContent = text;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    loadFolder(dir);
  });
  return link;
}

function mountLightbox() {
  lightbox?.destroy();
  lightbox = new PhotoSwipeLightbox({
    gallery: '#gallery',
    children: 'a',
    pswpModule: () => import('https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe.esm.js')
  });
  lightbox.init();
}

function encodePathSegments(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
