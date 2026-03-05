// Helpers
const navEl = document.getElementById('shelf-nav');
const panelsEl = document.getElementById('shelf-panels');
const searchInput = document.getElementById('search');
const countEl = document.getElementById('search-count');
const totalEl = document.getElementById('search-total');

// Location format: H#S##
function locFor(shelfIdx, drawerIdx) {
    return `H${shelfIdx + 1}S${String(drawerIdx + 1).padStart(2, '0')}`;
}

// Permanently unlocked docs (survive search field being cleared)
const permanentlyUnlocked = new Set();

// Determine if a hidden doc is revealed
function isRevealed(doc, qNorm) {
    if (!doc.hidden) return true;
    if (permanentlyUnlocked.has(doc.id)) return true;
    const key = normalize(doc.reveal_on);
    return key !== '' && qNorm === key;
}

// Build an id->doc map
const docById = {};
documents.forEach(d => { docById[d.id] = d; });

// Assign locations (also used in search)
shelves.forEach((shelf, shelfIdx) => {
    shelf.drawers.forEach((docId, drawerIdx) => {
        if (!docId) return;
        const doc = docById[docId];
        if (!doc) return;
        doc.location = locFor(shelfIdx, drawerIdx);
        // include location in search text
        doc._searchText = `${doc.location} ${doc._searchText}`;
    });
});

// ── Build UI: Tabs + Panels + Catalog ──
function makeTab(label, isActive, onClick) {
    const tab = document.createElement('button');
    tab.className = 'shelf-tab' + (isActive ? ' active' : '');
    tab.textContent = label;
    tab.addEventListener('click', onClick);
    return tab;
}

function buildShelfPanel(shelf, shelfIdx) {
    const panel = document.createElement('div');
    panel.className = 'shelf-panel' + (shelfIdx === 0 ? ' active' : '');
    panel.dataset.shelfIndex = String(shelfIdx);

    const grid = document.createElement('div');
    grid.className = 'drawer-grid';

    shelf.drawers.forEach((docId, drawerIdx) => {
        const drawer = document.createElement('div');
        drawer.className = 'drawer empty';
        drawer.dataset.drawerIndex = String(drawerIdx);

        const num = document.createElement('span');
        num.className = 'drawer-number';
        num.textContent = String(drawerIdx + 1).padStart(2, '0');
        drawer.appendChild(num);

        const doc = docId ? docById[docId] : null;

        // We'll decide occupied/empty dynamically in applySearch() (because hidden docs can be locked/unlocked)
        if (doc) {
            drawer.dataset.docId = docId;

            // Wrap content in a div so hidden docs can be fully concealed
            const content = document.createElement('div');
            content.className = 'drawer-content';
            if (doc.hidden) content.style.display = 'none';

            const icon = document.createElement('span');
            icon.className = 'drawer-icon';
            icon.textContent = doc.icon;

            const label = document.createElement('span');
            label.className = 'drawer-label';
            label.textContent = doc.title;

            const loc = document.createElement('span');
            loc.className = 'drawer-loc';
            loc.textContent = doc.location;

            content.appendChild(icon);
            content.appendChild(label);
            content.appendChild(loc);
            drawer.appendChild(content);
        }

        grid.appendChild(drawer);
    });

    panel.appendChild(grid);
    return panel;
}

function buildCatalogPanel() {
    const panel = document.createElement('div');
    panel.className = 'shelf-panel';
    panel.id = 'catalog-panel';

    const wrap = document.createElement('div');
    wrap.className = 'catalog-wrap';

    const head = document.createElement('div');
    head.className = 'catalog-head';
    head.innerHTML = `
        <div class="catalog-title">KATALOGOVERSIKT</div>
        <div class="catalog-sub">Plassering · Tittel · Funnet/tilstand</div>
    `;
    wrap.appendChild(head);

    shelves.forEach((shelf, shelfIdx) => {
        const section = document.createElement('div');
        const h = document.createElement('div');
        h.className = 'catalog-shelf-title';
        h.textContent = shelf.label;
        section.appendChild(h);

        const list = document.createElement('div');
        list.className = 'catalog-list';

        shelf.drawers.forEach((docId, drawerIdx) => {
            if (!docId) return;
            const doc = docById[docId];
            if (!doc) return;

            const row = document.createElement('div');
            row.className = 'catalog-row';
            row.dataset.docId = docId;
            row.dataset.shelfIndex = String(shelfIdx);
            row.dataset.drawerIndex = String(drawerIdx);

            row.innerHTML = `
                <div class="catalog-loc">${doc.location}</div>
                <div class="catalog-main">
                    <div class="catalog-docline">
                        <span class="catalog-badge">${doc.badge}</span>
                        <span class="catalog-doctitle">${doc.title}</span>
                    </div>
                    <div class="catalog-meta">${doc.meta || ''}</div>
                </div>
            `;
            row.addEventListener('click', () => openModal(doc));
            list.appendChild(row);
        });

        if (!list.children.length) {
            const empty = document.createElement('div');
            empty.className = 'catalog-empty';
            empty.textContent = '— Ingen katalogiserte funn —';
            section.appendChild(empty);
        } else {
            section.appendChild(list);
        }

        wrap.appendChild(section);
    });

    panel.appendChild(wrap);
    return panel;
}

// Build shelf tabs + panels
const shelfPanels = [];
shelves.forEach((shelf, idx) => {
    navEl.appendChild(makeTab(shelf.label, idx === 0, () => switchShelf(idx)));
    const panel = buildShelfPanel(shelf, idx);
    shelfPanels.push(panel);
    panelsEl.appendChild(panel);
});

// Add Catalog tab + panel
const catalogTab = makeTab('Katalog', false, () => switchShelf('catalog'));
catalogTab.classList.add('catalog-tab');
navEl.appendChild(catalogTab);

const catalogPanel = buildCatalogPanel();
panelsEl.appendChild(catalogPanel);

function switchShelf(target) {
    const tabs = Array.from(document.querySelectorAll('.shelf-tab'));
    const panels = Array.from(document.querySelectorAll('.shelf-panel'));

    if (target === 'catalog') {
        tabs.forEach(t => t.classList.remove('active'));
        catalogTab.classList.add('active');
        panels.forEach(p => p.classList.remove('active'));
        catalogPanel.classList.add('active');
        return;
    }

    tabs.forEach((t, i) => t.classList.toggle('active', i === target));
    panels.forEach((p, i) => {
        if (p === catalogPanel) return;
        p.classList.toggle('active', i === target);
    });
    catalogPanel.classList.remove('active');
}

// ── Search logic ──
// Behavior:
// - Exact match to a doc's location (e.g., H2S01) => jump to shelf + flash drawer.
// - Other search => switch to Katalog and filter rows.
function applySearch() {
    const q = normalize(searchInput.value);

    // Eligible total includes unlocked hidden docs
    const eligibleTotal = documents.filter(d => isRevealed(d, q)).length;
    totalEl.textContent = String(eligibleTotal);

    // 1) Handle exact location search
    const locMatch = q.match(/^h([1-4])s(\d{1,2})$/i);
    if (locMatch) {
        const shelfIdx = parseInt(locMatch[1], 10) - 1;
        const drawerIdx = parseInt(locMatch[2], 10) - 1;

        // switch to shelf
        switchShelf(shelfIdx);

        // reveal hidden if this also equals password; (rare but harmless)
        updateShelfOccupancy(q);

        // flash the drawer if it exists
        const panel = shelfPanels[shelfIdx];
        const drawer = panel?.querySelector(`.drawer[data-drawer-index="${drawerIdx}"]`);
        if (drawer) {
            drawer.classList.remove('flash');
            // force reflow
            void drawer.offsetWidth;
            drawer.classList.add('flash');
            drawer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        countEl.textContent = String(1);
        return;
    }

    // 2) Otherwise, use catalog filtering for readability
    switchShelf('catalog');
    updateShelfOccupancy(q);

    let shown = 0;

    // Filter catalog rows (and hide locked hidden docs)
    const rows = catalogPanel.querySelectorAll('.catalog-row');
    rows.forEach(row => {
        const doc = docById[row.dataset.docId];
        const unlocked = isRevealed(doc, q);
        if (doc.hidden && !unlocked) {
            row.style.display = 'none';
            return;
        }

        const match = q === '' || doc._searchText.includes(q);
        row.style.display = match ? '' : 'none';
        if (match) shown++;
    });

    // Hide shelf headings with no visible rows (optional small nicety)
    catalogPanel.querySelectorAll('.catalog-shelf-title').forEach(titleEl => {
        const section = titleEl.parentElement;
        const visibleRows = section.querySelectorAll('.catalog-row:not([style*="display: none"])').length;
        // keep headings visible when query empty; otherwise hide empty sections
        titleEl.style.display = (q !== '' && visibleRows === 0) ? 'none' : '';
    });

    countEl.textContent = String(shown);

    // ── Popup ved opplåsning ──
    const newlyRevealed = documents.filter(d => d.hidden && isRevealed(d, q) && !permanentlyUnlocked.has(d.id));
    if (newlyRevealed.length > 0 && !previouslyRevealed) {
        newlyRevealed.forEach(d => permanentlyUnlocked.add(d.id));
        triggerFlicker();
        document.getElementById('unlock-overlay').classList.add('active');
    }
    previouslyRevealed = documents.some(d => d.hidden && permanentlyUnlocked.has(d.id));
}

// Update drawers occupancy based on whether hidden docs are unlocked.
// (Also wires click handlers only when a doc is visible.)
function updateShelfOccupancy(qNorm) {
    shelfPanels.forEach((panel, shelfIdx) => {
        const drawers = panel.querySelectorAll('.drawer');
        drawers.forEach((drawer, drawerIdx) => {
            const docId = drawer.dataset.docId;
            if (!docId) {
                drawer.classList.remove('occupied');
                drawer.classList.add('empty');
                drawer.style.pointerEvents = '';
                drawer.onclick = null;
                return;
            }
            const doc = docById[docId];
            const unlocked = isRevealed(doc, qNorm);

            if (doc.hidden && !unlocked) {
                // behave like empty when locked – also hide content wrapper
                drawer.classList.remove('occupied');
                drawer.classList.add('empty');
                drawer.style.pointerEvents = '';
                drawer.onclick = null;
                const contentEl = drawer.querySelector('.drawer-content');
                if (contentEl) contentEl.style.display = 'none';
                return;
            }

            drawer.classList.add('occupied');
            drawer.classList.remove('empty');
            drawer.style.pointerEvents = '';
            drawer.onclick = () => openModal(doc);
            const contentEl = drawer.querySelector('.drawer-content');
            if (contentEl) contentEl.style.display = '';
        });
    });
}

let previouslyRevealed = false;

// Initialize
updateShelfOccupancy(normalize(searchInput.value));
applySearch();
searchInput.addEventListener('input', applySearch);

// ── Modal logic (unchanged styling, just uses existing modal elements) ──
const overlay  = document.getElementById('modal-overlay');
const modalTitle   = document.getElementById('modal-title');
const modalBadge   = document.getElementById('modal-badge');
const modalContent = document.getElementById('modal-content');
const closeBtn = document.getElementById('modal-close');

let typewriterTimer = null;

function typewrite(el, text, speed = 38) {
    if (typewriterTimer) clearInterval(typewriterTimer);
    el.textContent = '';
    let i = 0;
    typewriterTimer = setInterval(() => {
        el.textContent += text[i++];
        if (i >= text.length) clearInterval(typewriterTimer);
    }, speed);
}

function openModal(doc) {
    modalBadge.textContent = doc.badge;
    modalContent.innerHTML = doc.content;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    typewrite(modalTitle, doc.title);
}

function closeModal() {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

closeBtn.addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ── Unlock popup close logic ──
const unlockOverlay = document.getElementById('unlock-overlay');
document.getElementById('unlock-close').addEventListener('click', () => {
    unlockOverlay.classList.remove('active');
});
unlockOverlay.addEventListener('click', e => {
    if (e.target === unlockOverlay) unlockOverlay.classList.remove('active');
});
