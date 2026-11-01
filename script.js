/* ============================================================
   عودة للعقار — script.js v6.2
   + شريط ترحيب + زر الشعار يغلق المعاينة بدون تأكيد
   ============================================================ */

(function () {
    'use strict';

    var LS_FAV = 'awda_favorites_v1';
    var MAX_COMPARE = 3;

    var STATUS_LABELS = {
        available: { label: 'متاح', color: '#34D399' },
        sold: { label: 'تم البيع', color: '#F87171' },
        rented: { label: 'تم التأجير', color: '#A855F7' }
    };

    var DEFAULT_AMENITIES = {
        fiber: 'شبكة ألياف بصرية', electricity: 'كهرباء', water: 'مياه',
        gas: 'غاز مركزي', sewage: 'صرف صحي', elevator: 'مصعد',
        parking: 'موقف سيارات', pool: 'مسبح', garden: 'حديقة',
        security: 'أمن 24/7', cameras: 'كاميرات', ac: 'مكيفات',
        kitchen: 'مطبخ مجهز', laundry: 'غسيل ملابس', furnished: 'مفروش', balcony: 'بلكونة'
    };

    var state = {
        properties: [],
        categories: [],
        filtered: [],
        filters: { category: 'all', transaction: '', minPrice: 0, maxPrice: 0, minArea: 0, maxArea: 0, term: '' },
        sort: 'newest',
        view: 'grid',
        favorites: [],
        compare: [],
        map: null,
        mapMarkers: []
    };

    function $(id) { return document.getElementById(id); }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }

    function toast(msg, type) {
        var el = $('app-toast');
        if (!el) return;
        el.textContent = msg;
        el.className = 'app-toast show ' + (type || '');
        clearTimeout(toast._t);
        toast._t = setTimeout(function () { el.className = 'app-toast ' + (type || ''); }, 2800);
    }

    function extractNumber(s) {
        if (!s) return 0;
        return parseInt(String(s).replace(/[^\d]/g, '')) || 0;
    }

    function getAmenityLabel(f) {
        if (typeof f !== 'string') return String(f);
        if (f.indexOf('custom:') === 0) return f.replace('custom:', '');
        return DEFAULT_AMENITIES[f] || f;
    }

    function getYouTubeId(url) {
        if (!url) return null;
        var m = String(url).match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^"&?\/\s]{11})/);
        return m ? m[1] : null;
    }

    function getMapQuery(p) {
        var lat = parseFloat(p.latitude);
        var lng = parseFloat(p.longitude);
        if (!isNaN(lat) && !isNaN(lng) && lat && lng) {
            if (Math.abs(lat - 24.7136) > 0.01 || Math.abs(lng - 46.6753) > 0.01) {
                return lat + ',' + lng;
            }
        }
        if (p.location) return encodeURIComponent(p.location);
        return null;
    }

    function getGoogleMapsEmbedUrl(query) {
        return 'https://maps.google.com/maps?q=' + query + '&z=15&output=embed&hl=ar';
    }

    function getGoogleMapsLinkUrl(query) {
        return 'https://www.google.com/maps/search/?api=1&query=' + query;
    }

    function getGoogleMapsDirectionsUrl(query) {
        return 'https://www.google.com/maps/dir/?api=1&destination=' + query;
    }

    function loadLocal() {
        try { state.favorites = JSON.parse(localStorage.getItem(LS_FAV) || '[]'); } catch (e) { state.favorites = []; }
    }
    function saveFav() { try { localStorage.setItem(LS_FAV, JSON.stringify(state.favorites)); } catch (e) {} }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else init();

    async function init() {
        console.log('[Client v6.2] init');
        loadLocal();
        bindStaticEvents();
        bindHomeLogo();
        await Promise.all([loadCategories(), loadProperties()]);
        applyFilters();
        renderFavoritesCount();
        loadWelcome();
    }

    async function loadCategories() {
        if (!window.db) { state.categories = []; return; }
        try {
            var res = await window.db.from('property_categories').select('*').order('sort_order');
            state.categories = (res.data && res.data.length) ? res.data : [];
        } catch (e) { state.categories = []; }
    }

    async function loadProperties() {
        if (!window.db) { state.properties = []; return; }
        try {
            var res = await window.db.from('properties').select('*').order('created_at', { ascending: false });
            if (res.error) throw res.error;
            state.properties = (res.data || []).map(function (row) {
                return {
                    id: row.id,
                    code: row.code || 'غير محدد',
                    title: row.title || '',
                    description: row.description || '',
                    price: row.price || '',
                    type: row.type || '',
                    category: row.category || '',
                    status: row.status || 'available',
                    area: parseInt(row.area) || 0,
                    location: row.location || '',
                    latitude: row.latitude || null,
                    longitude: row.longitude || null,
                    specs: row.specs || [],
                    features: row.features || [],
                    images: (row.images && row.images.length > 0) ? row.images : ['https://via.placeholder.com/800x600?text=No+Image'],
                    videos: row.videos || [],
                    views: row.views || 0,
                    agent: { name: row.agent_name || 'الوكيل', phone: row.agent_phone || '966500000000' },
                    date: row.created_at
                };
            });
        } catch (e) { state.properties = []; }
    }

    /* ============================================================
       زر الشعار — يغلق المعاينة بدون تأكيد
       ============================================================ */
    function bindHomeLogo() {
        var logo = document.getElementById('home-logo-btn');
        if (!logo) return;

        function handleActivate(e) {
            // 1. إذا كانت المعاينة مفتوحة → أغلقها فوراً بدون تأكيد
            var preview = document.getElementById('preview-overlay');
            if (preview && (preview.style.display === 'block' || preview.classList.contains('open'))) {
                if (e) { e.preventDefault(); e.stopPropagation(); }
                closePreview();
                try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e2) { window.scrollTo(0, 0); }
                return;
            }

            // 2. أغلق أي نافذة مفتوحة أخرى
            var anyOpen = false;

            var compareModal = document.getElementById('compare-modal');
            if (compareModal && compareModal.classList.contains('open')) {
                compareModal.classList.remove('open');
                anyOpen = true;
            }

            var favDrawer = document.getElementById('favorites-drawer');
            if (favDrawer && favDrawer.classList.contains('open')) {
                favDrawer.classList.remove('open');
                anyOpen = true;
            }
            var favBackdrop = document.getElementById('fav-backdrop');
            if (favBackdrop) favBackdrop.classList.remove('show');

            var filterSheet = document.getElementById('filter-sheet');
            if (filterSheet && filterSheet.classList.contains('open')) {
                filterSheet.classList.remove('open');
                anyOpen = true;
            }
            var filterBackdrop = document.getElementById('filter-sheet-backdrop');
            if (filterBackdrop) filterBackdrop.classList.remove('show');

            var inquiryModal = document.getElementById('inquiry-modal');
            if (inquiryModal && inquiryModal.classList.contains('open')) {
                inquiryModal.classList.remove('open');
                anyOpen = true;
            }

            var shareModal = document.getElementById('share-modal');
            if (shareModal && shareModal.style.display === 'block') {
                shareModal.style.display = 'none';
                anyOpen = true;
            }

            if (anyOpen) {
                if (e) { e.preventDefault(); e.stopPropagation(); }
                document.body.style.overflow = '';
                return;
            }

            // 3. لا شيء مفتوح → تصرف كزر رئيسية (تصفح لأعلى)
            if (e) e.preventDefault();
            try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e2) { window.scrollTo(0, 0); }
        }

        logo.addEventListener('click', handleActivate, true);
        logo.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivate(e);
            }
        });
    }

    /* ============================================================
       شريط الترحيب
       ============================================================ */
    async function loadWelcome() {
        var bar = document.getElementById('welcome-bar');
        var nameEl = document.getElementById('welcome-name');
        if (!bar || !nameEl) return;

        // تحقق إذا سبق إغلاقه
        var dismissed = false;
        try { dismissed = sessionStorage.getItem('awda_welcome_dismissed') === '1'; } catch (e) {}
        if (dismissed) return;

        var displayName = null;

        if (window.db && window.db.auth) {
            try {
                var res = await window.db.auth.getUser();
                var user = res && res.data && res.data.user;
                if (user) {
                    displayName = (user.user_metadata && user.user_metadata.full_name)
                        || (user.email ? user.email.split('@')[0] : null);
                }
            } catch (e) {}
        }

        if (!displayName) displayName = 'زائر';
        displayName = String(displayName).trim().split(' ')[0];
        if (displayName.length > 20) displayName = displayName.substring(0, 20);

        nameEl.textContent = displayName;
        bar.hidden = false;
        requestAnimationFrame(function () { bar.classList.add('show'); });

        var closeBtn = document.getElementById('welcome-close');
        if (closeBtn) {
            closeBtn.onclick = function () {
                bar.classList.remove('show');
                setTimeout(function () { bar.hidden = true; }, 300);
                try { sessionStorage.setItem('awda_welcome_dismissed', '1'); } catch (e) {}
            };
        }

        setTimeout(function () {
            if (!bar.hidden) {
                bar.classList.remove('show');
                setTimeout(function () { bar.hidden = true; }, 300);
            }
        }, 8000);
    }

    /* ============================================================
       ربط الأحداث الثابتة
       ============================================================ */
    function bindStaticEvents() {
        var searchInput = $('search-input');
        if (searchInput) { searchInput.oninput = onSearchInput; searchInput.onfocus = onSearchInput; }
        var searchClear = $('search-clear');
        if (searchClear) searchClear.onclick = clearSearch;

        var favBtn = $('favorites-btn'); if (favBtn) favBtn.onclick = openFavorites;
        var favClose = $('favorites-close'); if (favClose) favClose.onclick = closeFavorites;
        var favBackdrop = $('fav-backdrop'); if (favBackdrop) favBackdrop.onclick = closeFavorites;

        var filterToggle = $('filter-toggle-btn'); if (filterToggle) filterToggle.onclick = openFilters;
        var filterClose = $('filter-sheet-close'); if (filterClose) filterClose.onclick = closeFilters;
        var filterApply = $('filter-apply-btn'); if (filterApply) filterApply.onclick = applyFiltersFromSheet;
        var filterReset = $('filter-reset-btn'); if (filterReset) filterReset.onclick = resetFilters;
        var filterBackdrop = $('filter-sheet-backdrop'); if (filterBackdrop) filterBackdrop.onclick = closeFilters;

        var sortBtn = $('sort-btn'); if (sortBtn) sortBtn.onclick = toggleSortMenu;
        document.querySelectorAll('#sort-menu button').forEach(function (b) {
            b.onclick = function () { setSort(b.dataset.sort); };
        });
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.sort-dropdown')) {
                var m = $('sort-menu'); if (m) m.classList.remove('open');
            }
        });

        document.querySelectorAll('.view-btn').forEach(function (b) {
            b.onclick = function () { setView(b.dataset.view); };
        });

        var compareOpen = $('compare-open-btn'); if (compareOpen) compareOpen.onclick = openCompare;
        var compareClear = $('compare-clear-btn'); if (compareClear) compareClear.onclick = clearCompare;
        var compareClose = $('compare-close'); if (compareClose) compareClose.onclick = closeCompare;
        var compareModal = $('compare-modal');
        if (compareModal) compareModal.onclick = function (e) { if (e.target === compareModal) closeCompare(); };

        var previewClose = $('preview-close'); if (previewClose) previewClose.onclick = closePreview;

        var shareClose = $('share-close'); if (shareClose) shareClose.onclick = closeShare;
        var shareModal = $('share-modal');
        if (shareModal) shareModal.onclick = function (e) { if (e.target === shareModal) closeShare(); };
        document.querySelectorAll('.share-option').forEach(function (b) {
            b.onclick = function () { doShare(b.dataset.type); };
        });

        var inquiryClose = $('inquiry-close'); if (inquiryClose) inquiryClose.onclick = closeInquiry;
        var inquiryCancel = $('inquiry-cancel'); if (inquiryCancel) inquiryCancel.onclick = closeInquiry;
        var inquirySubmit = $('inquiry-submit'); if (inquirySubmit) inquirySubmit.onclick = submitInquiry;
        var inquiryModal = $('inquiry-modal');
        if (inquiryModal) inquiryModal.onclick = function (e) { if (e.target === inquiryModal) closeInquiry(); };

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closePreview(); closeCompare(); closeFavorites();
                closeFilters(); closeShare(); closeInquiry();
            }
        });

        document.addEventListener('click', handleGlobalClick, true);
    }

    function handleGlobalClick(e) {
        var t = e.target;
        if (!t || !t.closest) return;

        var detailsBtn = t.closest('.view-details-btn');
        if (detailsBtn) {
            e.preventDefault(); e.stopPropagation();
            var card = detailsBtn.closest('.property-card[data-id]');
            if (card) openPreview(card.dataset.id);
            return;
        }

        var mapBtn = t.closest('[data-map]');
        if (mapBtn) {
            e.preventDefault(); e.stopPropagation();
            var p = state.properties.find(function (x) { return x.id === mapBtn.dataset.map; });
            if (p) {
                var q = getMapQuery(p);
                if (q) window.open(getGoogleMapsLinkUrl(q), '_blank');
                else toast('لا يوجد موقع محدد لهذا العقار', 'error');
            }
            return;
        }

        var favBtn = t.closest('[data-fav]');
        if (favBtn) { e.preventDefault(); e.stopPropagation(); toggleFavorite(favBtn.dataset.fav); return; }

        var cmpBtn = t.closest('[data-compare]');
        if (cmpBtn) { e.preventDefault(); e.stopPropagation(); toggleCompare(cmpBtn.dataset.compare); return; }

        var shrBtn = t.closest('[data-share]');
        if (shrBtn) { e.preventDefault(); e.stopPropagation(); openShare(shrBtn.dataset.share); return; }

        var inqBtn = t.closest('[data-inquiry]');
        if (inqBtn) { e.preventDefault(); e.stopPropagation(); openInquiry(inqBtn.dataset.inquiry); return; }

        var mapViewBtn = t.closest('[data-open-map]');
        if (mapViewBtn) {
            e.preventDefault(); e.stopPropagation();
            var pid = mapViewBtn.dataset.openMap;
            var prop = state.properties.find(function (x) { return x.id === pid; });
            if (prop) {
                var qq = getMapQuery(prop);
                if (qq) window.open(getGoogleMapsLinkUrl(qq), '_blank');
            }
            return;
        }

        var mapDirBtn = t.closest('[data-directions]');
        if (mapDirBtn) {
            e.preventDefault(); e.stopPropagation();
            var pid2 = mapDirBtn.dataset.directions;
            var prop2 = state.properties.find(function (x) { return x.id === pid2; });
            if (prop2) {
                var qq2 = getMapQuery(prop2);
                if (qq2) window.open(getGoogleMapsDirectionsUrl(qq2), '_blank');
            }
            return;
        }

        var chip = t.closest('.chip-option[data-val]');
        if (chip) { e.preventDefault(); chip.classList.toggle('active'); return; }

        var filterChip = t.closest('.quick-filter-chip[data-cat]');
        if (filterChip) {
            e.preventDefault();
            state.filters.category = filterChip.dataset.cat;
            applyFilters();
            return;
        }

        var card2 = t.closest('.property-card[data-id]');
        if (card2 && !t.closest('button') && !t.closest('[data-fav]') && !t.closest('[data-compare]') && !t.closest('[data-share]') && !t.closest('[data-map]')) {
            e.preventDefault();
            openPreview(card2.dataset.id);
            return;
        }
    }

    function onSearchInput() {
        var v = $('search-input').value;
        state.filters.term = v.trim();
        var clearBtn = $('search-clear');
        if (clearBtn) clearBtn.classList.toggle('active', v.length > 0);
        showSuggestions(v);
        applyFilters();
    }

    function showSuggestions(term) {
        var box = $('search-suggestions');
        if (!box) return;
        term = term.trim().toLowerCase();
        if (term.length < 2) { box.classList.remove('show'); box.innerHTML = ''; return; }

        var matches = state.properties.filter(function (p) {
            return (p.title || '').toLowerCase().indexOf(term) !== -1 ||
                   (p.location || '').toLowerCase().indexOf(term) !== -1 ||
                   (p.code || '').toLowerCase().indexOf(term) !== -1;
        }).slice(0, 5);

        if (!matches.length) { box.classList.remove('show'); return; }

        box.innerHTML = matches.map(function (p) {
            return '<button class="suggestion-item" data-suggest="' + p.id + '">' +
                '<i class="fas fa-home"></i>' +
                '<div class="suggestion-text"><b>' + escapeHtml(p.title) + '</b><small>' + escapeHtml(p.location) + '</small></div>' +
            '</button>';
        }).join('');
        box.classList.add('show');
        box.querySelectorAll('[data-suggest]').forEach(function (b) {
            b.onclick = function () { openPreview(b.dataset.suggest); box.classList.remove('show'); };
        });
    }

    function clearSearch() {
        $('search-input').value = '';
        state.filters.term = '';
        $('search-clear').classList.remove('active');
        $('search-suggestions').classList.remove('show');
        applyFilters();
    }

    function applyFilters() {
        var f = state.filters;
        var result = state.properties.filter(function (p) {
            if (f.category !== 'all' && p.type !== f.category) return false;
            if (f.transaction && p.category !== f.transaction) return false;
            var price = extractNumber(p.price);
            if (f.minPrice && price < f.minPrice) return false;
            if (f.maxPrice && price > f.maxPrice) return false;
            if (f.minArea && p.area < f.minArea) return false;
            if (f.maxArea && p.area > f.maxArea) return false;
            if (f.term) {
                var hay = (p.title + ' ' + p.location + ' ' + p.code + ' ' + p.description).toLowerCase();
                if (hay.indexOf(f.term.toLowerCase()) === -1) return false;
            }
            return true;
        });

        result.sort(function (a, b) {
            switch (state.sort) {
                case 'price-asc': return extractNumber(a.price) - extractNumber(b.price);
                case 'price-desc': return extractNumber(b.price) - extractNumber(a.price);
                case 'area-asc': return a.area - b.area;
                case 'area-desc': return b.area - a.area;
                default: return new Date(b.date || 0) - new Date(a.date || 0);
            }
        });

        state.filtered = result;
        renderChips();
        renderResults();
        updateActiveFiltersCount();
    }

    function applyFiltersFromSheet() {
        state.filters.minPrice = parseInt($('filter-min-price').value, 10) || 0;
        state.filters.maxPrice = parseInt($('filter-max-price').value, 10) || 0;
        state.filters.minArea = parseInt($('filter-min-area').value, 10) || 0;
        state.filters.maxArea = parseInt($('filter-max-area').value, 10) || 0;

        var selectedTrans = document.querySelector('#filter-transactions .chip-option.active');
        state.filters.transaction = selectedTrans ? selectedTrans.dataset.val : '';

        var selectedCat = document.querySelector('#filter-categories .chip-option.active');
        state.filters.category = selectedCat ? selectedCat.dataset.val : 'all';

        applyFilters();
        closeFilters();
        toast('تم تطبيق الفلاتر ✓', 'success');
    }

    function resetFilters() {
        state.filters = { category: 'all', transaction: '', minPrice: 0, maxPrice: 0, minArea: 0, maxArea: 0, term: state.filters.term };
        $('filter-min-price').value = ''; $('filter-max-price').value = '';
        $('filter-min-area').value = ''; $('filter-max-area').value = '';
        document.querySelectorAll('#filter-transactions .chip-option').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('#filter-categories .chip-option').forEach(function (b) {
            b.classList.toggle('active', b.dataset.val === 'all');
        });
        applyFilters();
        toast('تم إعادة التعيين');
    }

    function updateActiveFiltersCount() {
        var count = 0;
        var f = state.filters;
        if (f.category !== 'all') count++;
        if (f.transaction) count++;
        if (f.minPrice || f.maxPrice) count++;
        if (f.minArea || f.maxArea) count++;
        var el = $('active-filters-count');
        if (el) { el.textContent = count; el.hidden = count === 0; }
        var filterBtn = $('filter-toggle-btn');
        if (filterBtn) filterBtn.classList.toggle('has-active', count > 0);
    }

    function openFilters() {
        renderFilterCategories();
        document.querySelectorAll('#filter-transactions .chip-option').forEach(function (b) {
            b.classList.toggle('active', b.dataset.val === state.filters.transaction);
        });
        $('filter-min-price').value = state.filters.minPrice || '';
        $('filter-max-price').value = state.filters.maxPrice || '';
        $('filter-min-area').value = state.filters.minArea || '';
        $('filter-max-area').value = state.filters.maxArea || '';
        $('filter-sheet').classList.add('open');
        $('filter-sheet-backdrop').classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function closeFilters() {
        $('filter-sheet').classList.remove('open');
        $('filter-sheet-backdrop').classList.remove('show');
        document.body.style.overflow = '';
    }

    function renderFilterCategories() {
        var box = $('filter-categories');
        if (!box) return;
        var html = '<button class="chip-option' + (state.filters.category === 'all' ? ' active' : '') + '" data-val="all">الكل</button>';
        html += state.categories.map(function (c) {
            return '<button class="chip-option' + (state.filters.category === c.name ? ' active' : '') + '" data-val="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</button>';
        }).join('');
        box.innerHTML = html;
    }

    function toggleSortMenu() {
        var m = $('sort-menu'); if (m) m.classList.toggle('open');
    }

    function setSort(mode) {
        state.sort = mode;
        var labels = { 'newest': 'الأحدث', 'price-asc': 'السعر ↑', 'price-desc': 'السعر ↓', 'area-asc': 'المساحة ↑', 'area-desc': 'المساحة ↓' };
        var lbl = $('sort-label'); if (lbl) lbl.textContent = labels[mode] || 'الأحدث';
        document.querySelectorAll('#sort-menu button').forEach(function (b) {
            b.classList.toggle('active', b.dataset.sort === mode);
        });
        $('sort-menu').classList.remove('open');
        applyFilters();
    }

    function setView(mode) {
        state.view = mode;
        document.querySelectorAll('.view-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.view === mode);
        });
        if (mode === 'map') {
            $('properties-container').style.display = 'none';
            $('properties-map').style.display = 'block';
            renderMap();
        } else {
            $('properties-container').style.display = '';
            $('properties-map').style.display = 'none';
        }
    }

    function renderResults() {
        var count = $('results-count');
        if (count) count.textContent = state.filtered.length + ' عقار';
        if (state.view === 'map') { renderMap(); return; }

        var container = $('properties-container');
        if (!container) return;

        if (state.filtered.length === 0) {
            container.innerHTML = '<div class="empty-results"><i class="fas fa-search"></i>' +
                '<h3>لا توجد نتائج</h3><p>جرّب تعديل الفلاتر</p>' +
                '<button class="btn-reset" onclick="document.getElementById(\'filter-reset-btn\').click()">إعادة تعيين</button></div>';
            return;
        }

        container.innerHTML = state.filtered.map(createCard).join('');
    }

    function createCard(p) {
        var isFav = state.favorites.indexOf(p.id) !== -1;
        var inCompare = state.compare.indexOf(p.id) !== -1;
        var isClosed = p.status === 'sold' || p.status === 'rented';
        var statusInfo = STATUS_LABELS[p.status] || STATUS_LABELS.available;
        var mediaCount = (p.images || []).length + (p.videos || []).length;

        var statusOverlay = isClosed ? '<div class="property-status-badge status-' + p.status + '"><span>' + statusInfo.label + '</span></div>' : '';

        return '<article class="property-card' + (isClosed ? ' is-closed' : '') + '" data-id="' + p.id + '">' +
            '<div class="property-image">' +
                '<img src="' + escapeHtml(p.images[0]) + '" alt="" loading="lazy" onerror="this.src=\'https://via.placeholder.com/400x300\'">' +
                '<div class="property-badge">' + escapeHtml(p.type) + '</div>' +
                '<div class="property-code">' + escapeHtml(p.code) + '</div>' +
                statusOverlay +
                (mediaCount > 1 ? '<div class="media-count-badge"><i class="fas fa-images"></i> ' + mediaCount + '</div>' : '') +
                '<div class="property-card-actions">' +
                    '<button class="card-action-btn' + (isFav ? ' active-fav' : '') + '" data-fav="' + p.id + '" title="المفضلة"><i class="' + (isFav ? 'fas' : 'far') + ' fa-heart"></i></button>' +
                    '<button class="card-action-btn' + (inCompare ? ' active-compare' : '') + '" data-compare="' + p.id + '" title="مقارنة"><i class="fas fa-balance-scale"></i></button>' +
                    '<button class="card-action-btn card-map-btn" data-map="' + p.id + '" title="الموقع"><i class="fas fa-map-marker-alt"></i></button>' +
                    '<button class="card-action-btn" data-share="' + p.id + '" title="مشاركة"><i class="fas fa-share-alt"></i></button>' +
                '</div>' +
            '</div>' +
            '<div class="property-content">' +
                '<div class="property-header">' +
                    '<h3 class="property-title">' + escapeHtml(p.title) + '</h3>' +
                    '<div class="property-price">' + escapeHtml(p.price) + '</div>' +
                '</div>' +
                '<div class="property-location"><i class="fas fa-map-marker-alt"></i> <span>' + escapeHtml(p.location) + '</span></div>' +
                (p.features && p.features.length ? '<div class="property-amenities-preview">' + p.features.slice(0, 3).map(function (f) {
                    return '<span class="amenity-mini">' + escapeHtml(getAmenityLabel(f)) + '</span>';
                }).join('') + '</div>' : '') +
                '<div class="property-footer">' +
                    '<span class="status-badge ' + (p.category === 'للإيجار' ? 'for-rent' : 'for-sale') + '">' + escapeHtml(p.category) + '</span>' +
                    '<button class="view-details-btn" type="button"><i class="fas fa-eye"></i> التفاصيل</button>' +
                '</div>' +
            '</div>' +
        '</article>';
    }

    function renderChips() {
        var box = $('filter-chips');
        if (!box) return;

        var counts = { all: state.properties.length };
        state.categories.forEach(function (c) { counts[c.name] = 0; });
        state.properties.forEach(function (p) { if (counts[p.type] !== undefined) counts[p.type]++; });

        var html = '<button class="quick-filter-chip' + (state.filters.category === 'all' ? ' active' : '') + '" data-cat="all">الكل <span>(' + counts.all + ')</span></button>';
        html += state.categories.map(function (c) {
            return '<button class="quick-filter-chip' + (state.filters.category === c.name ? ' active' : '') + '" data-cat="' + escapeHtml(c.name) + '">' +
                '<i class="fas ' + (c.icon || 'fa-tag') + '"></i> ' + escapeHtml(c.name) +
                ' <span>(' + (counts[c.name] || 0) + ')</span>' +
            '</button>';
        }).join('');
        box.innerHTML = html;
    }

    function toggleFavorite(id) {
        var idx = state.favorites.indexOf(id);
        if (idx === -1) { state.favorites.push(id); toast('أضيف للمفضلة ❤️', 'success'); }
        else { state.favorites.splice(idx, 1); toast('أُزيل من المفضلة'); }
        saveFav();
        renderFavoritesCount();
        renderResults();
        renderFavoritesDrawer();
    }

    function renderFavoritesCount() {
        var el = $('fav-count');
        if (!el) return;
        var count = state.favorites.length;
        el.textContent = count;
        el.hidden = count === 0;
    }

    function openFavorites() {
        renderFavoritesDrawer();
        $('favorites-drawer').classList.add('open');
        $('fav-backdrop').classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function closeFavorites() {
        $('favorites-drawer').classList.remove('open');
        $('fav-backdrop').classList.remove('show');
        document.body.style.overflow = '';
    }

    function renderFavoritesDrawer() {
        var body = $('favorites-body');
        if (!body) return;
        var favProps = state.properties.filter(function (p) { return state.favorites.indexOf(p.id) !== -1; });

        if (favProps.length === 0) {
            body.innerHTML = '<div class="drawer-empty"><i class="fas fa-heart"></i><p>لا توجد عقارات في المفضلة بعد</p><small>اضغط ❤️ على أي عقار</small></div>';
            return;
        }

        body.innerHTML = favProps.map(function (p) {
            var img = (p.images && p.images[0]) || 'https://via.placeholder.com/100';
            return '<div class="fav-item" data-id="' + p.id + '">' +
                '<img src="' + escapeHtml(img) + '" alt="">' +
                '<div class="fav-info">' +
                    '<div class="fav-title">' + escapeHtml(p.title) + '</div>' +
                    '<div class="fav-price">' + escapeHtml(p.price) + '</div>' +
                '</div>' +
                '<button class="fav-remove" data-fav="' + p.id + '"><i class="fas fa-heart-broken"></i></button>' +
            '</div>';
        }).join('');

        body.querySelectorAll('.fav-item').forEach(function (el) {
            el.onclick = function (e) {
                if (e.target.closest('[data-fav]')) return;
                closeFavorites();
                openPreview(el.dataset.id);
            };
        });
    }

    function toggleCompare(id) {
        var idx = state.compare.indexOf(id);
        if (idx !== -1) { state.compare.splice(idx, 1); toast('أُزيل من المقارنة'); }
        else {
            if (state.compare.length >= MAX_COMPARE) { toast('الحد الأقصى 3 عقارات', 'error'); return; }
            state.compare.push(id);
            toast('أضيف للمقارنة', 'success');
        }
        renderCompareBar();
        renderResults();
    }

    function renderCompareBar() {
        var bar = $('compare-bar');
        if (!bar) return;
        if (state.compare.length === 0) { bar.hidden = true; return; }
        bar.hidden = false;

        var thumbs = $('compare-thumbs');
        if (thumbs) {
            thumbs.innerHTML = state.compare.map(function (id) {
                var p = state.properties.find(function (x) { return x.id === id; });
                var img = (p && p.images && p.images[0]) || '';
                return '<img src="' + escapeHtml(img) + '" title="' + escapeHtml(p ? p.title : '') + '">';
            }).join('');
        }
    }

    function clearCompare() {
        state.compare = [];
        renderCompareBar();
        renderResults();
        toast('تم مسح المقارنة');
    }

    function openCompare() {
        if (state.compare.length === 0) { toast('أضف عقارات للمقارنة', 'error'); return; }

        var grid = $('compare-grid');
        var props = state.compare.map(function (id) {
            return state.properties.find(function (p) { return p.id === id; });
        }).filter(Boolean);

        var rows = [
            { key: 'image', label: 'الصورة', render: function (p) { return '<img src="' + escapeHtml(p.images[0]) + '" alt="">'; } },
            { key: 'price', label: 'السعر', render: function (p) { return '<strong>' + escapeHtml(p.price) + '</strong>'; } },
            { key: 'code', label: 'الرمز', render: function (p) { return escapeHtml(p.code); } },
            { key: 'type', label: 'التصنيف', render: function (p) { return escapeHtml(p.type); } },
            { key: 'category', label: 'العملية', render: function (p) { return escapeHtml(p.category); } },
            { key: 'area', label: 'المساحة', render: function (p) { return p.area + ' م²'; } },
            { key: 'location', label: 'الموقع', render: function (p) { return escapeHtml(p.location); } },
            { key: 'status', label: 'الحالة', render: function (p) { return STATUS_LABELS[p.status] ? STATUS_LABELS[p.status].label : 'متاح'; } },
            { key: 'amenities', label: 'المرافق', render: function (p) {
                return (p.features || []).map(function (f) { return '<span class="compare-amenity">' + escapeHtml(getAmenityLabel(f)) + '</span>'; }).join('') || '—';
            } }
        ];

        var html = '<table class="compare-table"><thead><tr><th></th>';
        props.forEach(function (p) {
            html += '<th><div class="compare-col-head"><h4>' + escapeHtml(p.title) + '</h4>' +
                '<button class="compare-remove-btn" data-compare="' + p.id + '"><i class="fas fa-times"></i></button></div></th>';
        });
        html += '</tr></thead><tbody>';
        rows.forEach(function (r) {
            html += '<tr><td class="compare-label">' + r.label + '</td>';
            props.forEach(function (p) { html += '<td>' + r.render(p) + '</td>'; });
            html += '</tr>';
        });
        html += '</tbody></table>';

        grid.innerHTML = html;
        $('compare-modal').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeCompare() {
        $('compare-modal').classList.remove('open');
        document.body.style.overflow = '';
    }

    function openPreview(id) {
        var p = state.properties.find(function (x) { return x.id === id; });
        if (!p) return;

        incrementViews(id);

        var isFav = state.favorites.indexOf(id) !== -1;
        var inCompare = state.compare.indexOf(id) !== -1;
        var isClosed = p.status === 'sold' || p.status === 'rented';

        var statusBanner = isClosed
            ? '<div class="preview-status-banner status-' + p.status + '">' + STATUS_LABELS[p.status].label + '</div>'
            : '';

        var amenitiesHtml = (p.features && p.features.length)
            ? '<div class="preview-features"><h3><i class="fas fa-check-circle"></i> المرافق والخدمات</h3><div class="preview-features-list">' +
              p.features.map(function (f) { return '<div class="preview-feature">' + escapeHtml(getAmenityLabel(f)) + '</div>'; }).join('') +
              '</div></div>'
            : '';

        var mapQuery = getMapQuery(p);
        var mapHtml = '';
        if (mapQuery) {
            mapHtml = '<div class="preview-map-section">' +
                '<h3><i class="fas fa-location-dot"></i> موقع العقار</h3>' +
                '<div class="preview-map-container">' +
                    '<iframe src="' + getGoogleMapsEmbedUrl(mapQuery) + '" frameborder="0" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
                '</div>' +
                '<div class="preview-map-actions">' +
                    '<button type="button" class="btn-map-action btn-map-view" data-open-map="' + p.id + '">' +
                        '<i class="fas fa-map-location-dot"></i> افتح الخريطة' +
                    '</button>' +
                    '<button type="button" class="btn-map-action btn-map-directions" data-directions="' + p.id + '">' +
                        '<i class="fas fa-route"></i> الاتجاهات' +
                    '</button>' +
                '</div>' +
            '</div>';
        }

        var videosHtml = '';
        if (p.videos && p.videos.length) {
            videosHtml = '<div class="preview-videos"><h3><i class="fas fa-video"></i> فيديوهات العقار</h3><div class="preview-videos-list">' +
                p.videos.map(function (url) {
                    var yt = getYouTubeId(url);
                    if (yt) return '<div class="preview-video-embed"><iframe src="https://www.youtube.com/embed/' + yt + '" frameborder="0" allowfullscreen loading="lazy"></iframe></div>';
                    return '<div class="preview-video-embed"><video src="' + escapeHtml(url) + '" controls preload="metadata" playsinline></video></div>';
                }).join('') +
            '</div></div>';
        }

        var html =
            '<div class="preview-gallery">' +
                '<div class="gallery-slider" id="gallery-slider">' +
                    p.images.map(function (img) { return '<div class="gallery-slide"><img src="' + escapeHtml(img) + '" loading="lazy"></div>'; }).join('') +
                '</div>' +
                (p.images.length > 1 ?
                    '<div class="gallery-nav"><button class="gallery-nav-btn" data-gallery="-1"><i class="fas fa-chevron-right"></i></button>' +
                    '<button class="gallery-nav-btn" data-gallery="1"><i class="fas fa-chevron-left"></i></button></div>' +
                    '<div class="gallery-indicators">' +
                        p.images.map(function (_, i) { return '<button class="gallery-indicator' + (i === 0 ? ' active' : '') + '" data-slide="' + i + '"></button>'; }).join('') +
                    '</div>' : '') +
            '</div>' +
            '<div class="preview-details">' +
                statusBanner +
                '<div class="preview-header-info">' +
                    '<div class="preview-title-block">' +
                        '<h2 class="preview-name">' + escapeHtml(p.title) + '</h2>' +
                        '<div class="preview-location"><i class="fas fa-map-marker-alt"></i> ' + escapeHtml(p.location) + '</div>' +
                    '</div>' +
                    '<div class="preview-price">' + escapeHtml(p.price) + '</div>' +
                '</div>' +
                '<div class="preview-meta-chips">' +
                    '<span class="meta-chip"><i class="fas fa-tag"></i> ' + escapeHtml(p.type) + '</span>' +
                    '<span class="meta-chip"><i class="fas fa-key"></i> ' + escapeHtml(p.category) + '</span>' +
                    '<span class="meta-chip"><i class="fas fa-ruler-combined"></i> ' + p.area + ' م²</span>' +
                    '<span class="meta-chip"><i class="fas fa-hashtag"></i> ' + escapeHtml(p.code) + '</span>' +
                    (p.views ? '<span class="meta-chip"><i class="fas fa-eye"></i> ' + p.views + '</span>' : '') +
                '</div>' +
                (p.description ? '<div class="preview-description"><p>' + escapeHtml(p.description) + '</p></div>' : '') +
                amenitiesHtml +
                mapHtml +
                videosHtml +
            '</div>';

        var contentEl = document.querySelector('.preview-content');
        if (contentEl) contentEl.innerHTML = html;

        var preview = document.querySelector('.property-preview');
        var oldBar = preview.querySelector('.preview-contact-actions');
        if (oldBar) oldBar.remove();

        var contactBar = document.createElement('div');
        contactBar.className = 'preview-contact-actions';
        contactBar.innerHTML =
            '<button class="contact-btn contact-whatsapp-btn" data-inquiry="' + p.id + '">' +
                '<i class="fab fa-whatsapp"></i> تواصل مع الوكيل' +
            '</button>' +
            '<button class="contact-btn contact-call-btn" data-share="' + p.id + '" title="مشاركة">' +
                '<i class="fas fa-share-alt"></i>' +
            '</button>';
        preview.appendChild(contactBar);

        var favB = $('preview-favorite-btn');
        if (favB) {
            favB.classList.toggle('active', isFav);
            favB.querySelector('i').className = (isFav ? 'fas' : 'far') + ' fa-heart';
            favB.onclick = function () {
                toggleFavorite(p.id);
                var nowFav = state.favorites.indexOf(p.id) !== -1;
                favB.classList.toggle('active', nowFav);
                favB.querySelector('i').className = (nowFav ? 'fas' : 'far') + ' fa-heart';
            };
        }

        var cmpB = $('preview-compare-btn');
        if (cmpB) {
            cmpB.classList.toggle('active', inCompare);
            cmpB.onclick = function () {
                toggleCompare(p.id);
                cmpB.classList.toggle('active', state.compare.indexOf(p.id) !== -1);
            };
        }

        var shrB = $('preview-share-btn');
        if (shrB) shrB.onclick = function () { openShare(p.id); };

        var slider = document.getElementById('gallery-slider');
        var currentIdx = 0;
        function updateGallery() {
            slider.style.transform = 'translateX(-' + (currentIdx * 100) + '%)';
            document.querySelectorAll('.gallery-indicator').forEach(function (ind, i) {
                ind.classList.toggle('active', i === currentIdx);
            });
        }
        document.querySelectorAll('[data-gallery]').forEach(function (b) {
            b.onclick = function () {
                currentIdx = (currentIdx + parseInt(b.dataset.gallery, 10) + p.images.length) % p.images.length;
                updateGallery();
            };
        });
        document.querySelectorAll('[data-slide]').forEach(function (b) {
            b.onclick = function () { currentIdx = parseInt(b.dataset.slide, 10); updateGallery(); };
        });

        if (contentEl) contentEl.scrollTop = 0;

        $('preview-overlay').style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function closePreview() {
        $('preview-overlay').style.display = 'none';
        document.body.style.overflow = '';
        var preview = document.querySelector('.property-preview');
        if (preview) {
            var oldBar = preview.querySelector('.preview-contact-actions');
            if (oldBar) oldBar.remove();
        }
    }

    async function incrementViews(id) {
        if (!window.db) return;
        try {
            var p = state.properties.find(function (x) { return x.id === id; });
            if (!p) return;
            p.views = (p.views || 0) + 1;
            await window.db.from('properties').update({ views: p.views }).eq('id', id);
        } catch (e) {}
    }

    var sharePropertyId = null;

    function openShare(id) {
        sharePropertyId = id;
        $('share-modal').style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function closeShare() {
        $('share-modal').style.display = 'none';
        document.body.style.overflow = '';
        sharePropertyId = null;
    }

    function doShare(type) {
        var p = state.properties.find(function (x) { return x.id === sharePropertyId; });
        if (!p) return;
        var url = window.location.href.split('?')[0] + '?property=' + p.id;
        var text = 'شاهد هذا العقار: ' + p.title + ' - ' + p.price;

        if (type === 'whatsapp') window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank');
        else if (type === 'telegram') window.open('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text), '_blank');
        else if (type === 'link') {
            if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('تم نسخ الرابط', 'success'); });
        }
        closeShare();
    }

    var inquiryPropertyId = null;

    function openInquiry(id) {
        var p = state.properties.find(function (x) { return x.id === id; });
        if (!p) return;
        inquiryPropertyId = id;
        $('inquiry-property-title').textContent = p.title;
        $('inquiry-name').value = '';
        $('inquiry-phone').value = '';
        $('inquiry-message').value = 'أنا مهتم بهذا العقار، يرجى التواصل معي.';
        $('inquiry-modal').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeInquiry() {
        $('inquiry-modal').classList.remove('open');
        document.body.style.overflow = '';
        inquiryPropertyId = null;
    }

    async function submitInquiry() {
        var name = $('inquiry-name').value.trim();
        var phone = $('inquiry-phone').value.trim();
        var message = $('inquiry-message').value.trim();

        if (!name) { toast('أدخل اسمك', 'error'); return; }
        if (!phone || phone.length < 9) { toast('أدخل رقم جوال صحيح', 'error'); return; }

        var p = state.properties.find(function (x) { return x.id === inquiryPropertyId; });
        if (!p) return;

        if (window.db) {
            try {
                await window.db.from('inquiries').insert([{
                    property_id: p.id, property_title: p.title,
                    name: name, phone: phone, message: message
                }]);
            } catch (e) {}
        }

        var agentPhone = p.agent.phone || '966500000000';
        var waMsg = 'مرحباً، أنا ' + name + ' (' + phone + ')\n\n' +
                    'أرغب بالاستفسار عن العقار: ' + p.title + ' (' + p.code + ')\n' +
                    'السعر: ' + p.price + '\n\n' + message;
        window.open('https://wa.me/' + agentPhone + '?text=' + encodeURIComponent(waMsg), '_blank');
        toast('تم الإرسال ✓', 'success');
        closeInquiry();
    }

    function renderMap() {
        var mapEl = $('properties-map');
        if (!mapEl) return;

        if (!state.map) {
            state.map = L.map('properties-map').setView([24.7136, 46.6753], 6);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CartoDB',
                subdomains: 'abcd', maxZoom: 20
            }).addTo(state.map);
        }

        state.mapMarkers.forEach(function (m) { state.map.removeLayer(m); });
        state.mapMarkers = [];

        if (state.filtered.length === 0) return;

        var bounds = [];
        state.filtered.forEach(function (p) {
            var lat = parseFloat(p.latitude);
            var lng = parseFloat(p.longitude);
            if (isNaN(lat) || isNaN(lng) || !lat || !lng) return;

            var marker = L.marker([lat, lng]).addTo(state.map);
            var img = (p.images && p.images[0]) || '';
            var isClosed = p.status === 'sold' || p.status === 'rented';
            marker.bindPopup(
                '<div class="map-popup">' +
                    '<img src="' + escapeHtml(img) + '" style="width:150px;height:100px;object-fit:cover;border-radius:8px">' +
                    '<h3 style="margin:8px 0 4px;font-size:13px;font-weight:700">' + escapeHtml(p.title) + '</h3>' +
                    '<p style="margin:0;color:#60A5FA;font-weight:800">' + escapeHtml(p.price) + '</p>' +
                    (isClosed ? '<p style="margin:4px 0;color:#F87171;font-size:11px">' + STATUS_LABELS[p.status].label + '</p>' : '') +
                    '<button onclick="window.__awdaOpen(\'' + p.id + '\')" style="margin-top:6px;background:#2563EB;color:#fff;border:none;padding:6px 12px;border-radius:999px;cursor:pointer;width:100%;font-size:12px;font-family:Tajawal;font-weight:700">التفاصيل</button>' +
                '</div>'
            );
            state.mapMarkers.push(marker);
            bounds.push([lat, lng]);
        });

        if (bounds.length > 0) {
            try { state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 }); } catch (e) {}
        }
    }

    window.__awdaOpen = function (id) {
        if (state.map) state.map.closePopup();
        openPreview(id);
    };

    window.addEventListener('load', function () {
        var params = new URLSearchParams(window.location.search);
        var pid = params.get('property');
        if (pid) {
            setTimeout(function () {
                var p = state.properties.find(function (x) { return x.id === pid; });
                if (p) openPreview(pid);
            }, 800);
        }
    });

    console.log('[Client v6.2] ready ✓');
})();