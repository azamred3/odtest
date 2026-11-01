/* ============================================================
   عودة للعقار — admin.js v9.0
   + تعديل/حذف كل تصنيف (حتى الافتراضي)
   + رفع صور وفيديو
   + مرافق ديناميكية
   + حالات (متاح/تم البيع/تم التأجير)
   ============================================================ */

(function () {
    'use strict';

    console.log('%c[Admin v9] LOADED ✓', 'color:#34D399;font-weight:bold');

    var STORAGE_BUCKET = 'property-media';

    var DEFAULT_CATEGORIES = [
        { id: 'd1', name: 'فلل', icon: 'fa-house', sort_order: 1 },
        { id: 'd2', name: 'وحدات سكنية', icon: 'fa-building', sort_order: 2 },
        { id: 'd3', name: 'أراضي', icon: 'fa-map-location-dot', sort_order: 3 },
        { id: 'd4', name: 'محلات تجارية', icon: 'fa-store', sort_order: 4 }
    ];

    var STATUS_LABELS = {
        available: { label: 'متاح', icon: 'fa-circle-check', color: '#34D399' },
        sold:      { label: 'تم البيع', icon: 'fa-check-double', color: '#F87171' },
        rented:    { label: 'تم التأجير', icon: 'fa-key', color: '#A855F7' }
    };

    var DEFAULT_AMENITIES = [
        { id: 'fiber', label: 'شبكة ألياف بصرية', icon: 'fa-wifi' },
        { id: 'electricity', label: 'كهرباء', icon: 'fa-bolt' },
        { id: 'water', label: 'مياه', icon: 'fa-droplet' },
        { id: 'gas', label: 'غاز مركزي', icon: 'fa-fire' },
        { id: 'sewage', label: 'صرف صحي', icon: 'fa-toilet' },
        { id: 'elevator', label: 'مصعد', icon: 'fa-elevator' },
        { id: 'parking', label: 'موقف سيارات', icon: 'fa-square-parking' },
        { id: 'pool', label: 'مسبح', icon: 'fa-water-ladder' },
        { id: 'garden', label: 'حديقة', icon: 'fa-tree' },
        { id: 'security', label: 'أمن 24/7', icon: 'fa-shield-halved' },
        { id: 'cameras', label: 'كاميرات', icon: 'fa-video' },
        { id: 'ac', label: 'مكيفات', icon: 'fa-wind' },
        { id: 'kitchen', label: 'مطبخ مجهز', icon: 'fa-kitchen-set' },
        { id: 'furnished', label: 'مفروش', icon: 'fa-couch' }
    ];

    var adminProperties = [];
    var categories = [];
    var currentPropertyId = null;
    var currentUser = null;
    var currentFilterCategory = 'all';
    var editingCategoryId = null;
    var savingProperty = false;

    var customAmenities = [];
    var selectedAmenities = [];
    var currentImages = [];
    var currentVideos = [];

    function $(id) { return document.getElementById(id); }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }

    function showAlert(msg, type) {
        try {
            var c = $('alert-container'); if (!c) return;
            var icons = { success:'fa-circle-check', error:'fa-circle-exclamation', warning:'fa-triangle-exclamation', info:'fa-circle-info' };
            var el = document.createElement('div');
            el.className = 'alert ' + (type || 'info');
            el.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i><span>' + escapeHtml(msg) + '</span>';
            c.appendChild(el);
            setTimeout(function () {
                el.style.transition = 'opacity 0.3s';
                el.style.opacity = '0';
                setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
            }, 3200);
        } catch (e) {}
    }

    function getYouTubeId(url) {
        if (!url) return null;
        var m = String(url).match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^"&?\/\s]{11})/);
        return m ? m[1] : null;
    }

    /* ============================================================
       Bootstrap
       ============================================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    async function boot() {
        console.log('[Admin v9] boot()');
        bindButtons();
        renderAmenitiesGrid();
        renderImagesGrid();
        renderVideosGrid();
        await loadCategories();
        renderCategoryChips();
        populateTypeSelect();
        await verifyAuth();
        await loadAll();
    }

    /* ============================================================
       التصنيفات
       ============================================================ */
    async function loadCategories() {
        if (!window.db) { categories = DEFAULT_CATEGORIES.slice(); return; }
        try {
            var res = await window.db.from('property_categories').select('*').order('sort_order');
            if (res.error) throw res.error;
            categories = (res.data && res.data.length) ? res.data : DEFAULT_CATEGORIES.slice();
        } catch (e) {
            console.warn('[Admin] categories fallback:', e.message);
            categories = DEFAULT_CATEGORIES.slice();
        }
    }

    function renderCategoryChips() {
        var chips = $('category-chips'); if (!chips) return;

        var counts = { all: adminProperties.length };
        categories.forEach(function (c) { counts[c.name] = 0; });
        adminProperties.forEach(function (p) {
            if (counts[p.type] !== undefined) counts[p.type]++;
        });

        var html = '<button class="category-chip' + (currentFilterCategory === 'all' ? ' active' : '') +
            '" data-cat="all"><i class="fas fa-list"></i> الكل <span class="cat-count">' +
            counts.all + '</span></button>';

        html += categories.map(function (c) {
            var count = counts[c.name] || 0;
            var isActive = currentFilterCategory === c.name;
            return '<div class="category-chip-wrap' + (isActive ? ' active' : '') + '">' +
                '<button class="category-chip' + (isActive ? ' active' : '') +
                '" data-cat="' + escapeHtml(c.name) + '">' +
                    '<i class="fas ' + (c.icon || 'fa-tag') + '"></i> ' + escapeHtml(c.name) +
                    ' <span class="cat-count">' + count + '</span>' +
                '</button>' +
                '<button class="cat-mini-btn cat-edit" data-edit-cat="' + c.id + '" title="تعديل">' +
                    '<i class="fas fa-pen"></i>' +
                '</button>' +
                '<button class="cat-mini-btn cat-del" data-del-cat="' + c.id + '" title="حذف">' +
                    '<i class="fas fa-times"></i>' +
                '</button>' +
            '</div>';
        }).join('');

        chips.innerHTML = html;
    }

    async function saveNewCategory() {
        var name = ($('new-category-name').value || '').trim();
        var icon = $('new-category-icon').value || 'fa-tag';

        if (!name) { showAlert('أدخل اسم التصنيف', 'error'); return; }
        if (name.length < 2) { showAlert('الاسم قصير', 'error'); return; }

        if (categories.some(function (c) { return c.name === name && c.id !== editingCategoryId; })) {
            showAlert('التصنيف موجود مسبقاً', 'warning'); return;
        }

        if (!window.db) { showAlert('قاعدة البيانات غير متصلة', 'error'); return; }

        try {
            if (editingCategoryId) {
                var oldCat = categories.find(function (c) { return c.id === editingCategoryId; });
                var oldName = oldCat ? oldCat.name : null;

                var res = await window.db.from('property_categories')
                    .update({ name: name, icon: icon })
                    .eq('id', editingCategoryId);

                if (res.error) { showAlert('خطأ: ' + res.error.message, 'error'); return; }

                if (oldName && oldName !== name) {
                    await window.db.from('properties').update({ type: name }).eq('type', oldName);
                }
                if (currentFilterCategory === oldName) currentFilterCategory = name;

                showAlert('تم التعديل ✓', 'success');
            } else {
                var r = await window.db.from('property_categories').insert([{
                    name: name, icon: icon, sort_order: categories.length + 10
                }]);
                if (r.error) { showAlert('خطأ: ' + r.error.message, 'error'); return; }
                showAlert('تمت الإضافة ✓', 'success');
            }

            closeCategoryModal();
            await loadCategories();
            await loadProperties();
            renderCategoryChips();
            populateTypeSelect();
        } catch (e) {
            showAlert('تعذّر: ' + e.message, 'error');
        }
    }

    async function deleteCategory(id) {
        var cat = categories.find(function (c) { return c.id === id; });
        if (!cat) return;

        var linkedCount = adminProperties.filter(function (p) { return p.type === cat.name; }).length;
        var msg = 'حذف التصنيف "' + cat.name + '"؟';
        if (linkedCount > 0) {
            msg += '\n\n⚠️ يوجد ' + linkedCount + ' عقار بهذا التصنيف.\n' +
                   'ستبقى العقارات لكنها لن تظهر في الفلاتر.\n\nهل تريد الحذف؟';
        }
        if (!confirm(msg)) return;

        if (!window.db) return;
        try {
            var res = await window.db.from('property_categories').delete().eq('id', id);
            if (res.error) { showAlert(res.error.message, 'error'); return; }
            showAlert('تم الحذف ✓', 'success');

            if (currentFilterCategory === cat.name) currentFilterCategory = 'all';

            await loadCategories();
            renderCategoryChips();
            populateTypeSelect();
            renderProperties();
        } catch (e) {
            showAlert(e.message, 'error');
        }
    }

    function populateTypeSelect() {
        var sel = $('property-type'); if (!sel) return;
        sel.innerHTML = '<option value="">اختر التصنيف</option>' +
            categories.map(function (c) {
                return '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>';
            }).join('');
    }

    function openCategoryModal() {
        editingCategoryId = null;
        var modal = $('category-modal');
        modal.querySelector('h3').textContent = 'إضافة تصنيف جديد';
        $('save-category').querySelector('span').textContent = 'إضافة';
        $('new-category-name').value = '';
        $('new-category-icon').value = 'fa-tag';
        modal.classList.add('active');
        setTimeout(function () { $('new-category-name').focus(); }, 200);
    }

    function openEditCategory(id) {
        var cat = categories.find(function (c) { return c.id === id; });
        if (!cat) return;
        editingCategoryId = id;
        var modal = $('category-modal');
        modal.querySelector('h3').textContent = 'تعديل التصنيف';
        $('save-category').querySelector('span').textContent = 'حفظ التعديل';
        $('new-category-name').value = cat.name || '';
        $('new-category-icon').value = cat.icon || 'fa-tag';
        modal.classList.add('active');
        setTimeout(function () { $('new-category-name').focus(); }, 200);
    }

    function closeCategoryModal() {
        $('category-modal').classList.remove('active');
        editingCategoryId = null;
    }

    /* ============================================================
       ربط الأزرار
       ============================================================ */
    function bindButtons() {
        function b(id, fn) {
            var el = $(id); if (!el) return;
            el.onclick = function (e) {
                e.preventDefault();
                try { fn(); } catch (err) {
                    console.error('[Admin]', id, err);
                    showAlert(err.message, 'error');
                }
            };
        }

        b('add-property-btn', openPropertyModal);
        b('close-property-modal', closePropertyModal);
        b('cancel-property', closePropertyModal);
        b('save-property', saveProperty);
        b('refresh-btn', refreshAll);
        b('logout-btn', doLogout);
        b('add-amenity-btn', addCustomAmenity);
        b('add-image-url-btn', addImageFromUrl);
        b('add-video-url-btn', addVideoFromUrl);
        b('add-category-btn', openCategoryModal);
        b('close-category-modal', closeCategoryModal);
        b('cancel-category', closeCategoryModal);
        b('save-category', saveNewCategory);

        document.querySelectorAll('.nav-item[data-section]').forEach(function (nav) {
            nav.onclick = function (e) { e.preventDefault(); switchSection(nav.dataset.section); };
        });

        document.querySelectorAll('.quick-action-btn[data-action]').forEach(function (btn) {
            btn.onclick = function (e) {
                e.preventDefault();
                var a = btn.dataset.action;
                if (a === 'add-property') { switchSection('properties'); setTimeout(openPropertyModal, 150); }
                else if (a === 'view-properties') switchSection('properties');
            };
        });

        /* ===== Event Delegation ===== */
        document.addEventListener('click', function (e) {
            var t = e.target; if (!t || !t.closest) return;

            // زر تعديل تصنيف
            var editCat = t.closest('[data-edit-cat]');
            if (editCat) {
                e.preventDefault(); e.stopPropagation();
                openEditCategory(editCat.dataset.editCat);
                return;
            }

            // زر حذف تصنيف
            var delCat = t.closest('[data-del-cat]');
            if (delCat) {
                e.preventDefault(); e.stopPropagation();
                deleteCategory(delCat.dataset.delCat);
                return;
            }

            // زر الفلترة
            var chip = t.closest('.category-chip[data-cat]');
            if (chip && !t.closest('.cat-mini-btn')) {
                e.preventDefault();
                currentFilterCategory = chip.dataset.cat;
                renderCategoryChips();
                renderProperties();
                return;
            }

            // حذف صورة
            var dImg = t.closest('[data-delete-image]');
            if (dImg) {
                e.preventDefault(); e.stopPropagation();
                currentImages = currentImages.filter(function (u) { return u !== dImg.dataset.deleteImage; });
                renderImagesGrid();
                return;
            }

            // حذف فيديو
            var dVid = t.closest('[data-delete-video]');
            if (dVid) {
                e.preventDefault(); e.stopPropagation();
                currentVideos = currentVideos.filter(function (u) { return u !== dVid.dataset.deleteVideo; });
                renderVideosGrid();
                return;
            }

            // حذف مرفق مخصص
            var dAm = t.closest('.delete-amenity');
            if (dAm) {
                e.preventDefault(); e.stopPropagation();
                deleteCustomAmenity(dAm.dataset.deleteAmenity);
                return;
            }

            // تفعيل مرفق
            var amn = t.closest('.amenity-item[data-amenity]');
            if (amn) {
                e.preventDefault();
                toggleAmenity(amn.dataset.amenity);
                return;
            }

            // تعديل عقار
            var edit = t.closest('[data-edit]');
            if (edit) { e.preventDefault(); openPropertyModal(edit.dataset.edit); return; }

            // حذف عقار
            var del = t.closest('[data-delete]');
            if (del) { e.preventDefault(); deleteProperty(del.dataset.delete); return; }
        }, true);

        var imgInput = $('image-file-input');
        if (imgInput) imgInput.onchange = function () { handleFileUpload(imgInput.files, 'image'); };

        var vidInput = $('video-file-input');
        if (vidInput) vidInput.onchange = function () { handleFileUpload(vidInput.files, 'video'); };

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { closePropertyModal(); closeCategoryModal(); }
        });

        // Enter shortcuts
        var ni = $('new-amenity-input');
        if (ni) ni.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addCustomAmenity(); } };

        var ii = $('new-image-url');
        if (ii) ii.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addImageFromUrl(); } };

        var vi = $('new-video-url');
        if (vi) vi.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addVideoFromUrl(); } };

        var ci = $('new-category-name');
        if (ci) ci.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); saveNewCategory(); } };

        var pm = $('property-modal');
        if (pm) pm.onclick = function (e) { if (e.target === pm) closePropertyModal(); };

        var cm = $('category-modal');
        if (cm) cm.onclick = function (e) { if (e.target === cm) closeCategoryModal(); };

        var s = $('properties-search');
        if (s) s.oninput = renderProperties;

        console.log('[Admin v9] buttons bound ✓');
    }

    /* ============================================================
       الصور
       ============================================================ */
    function addImageFromUrl() {
        var input = $('new-image-url'); if (!input) return;
        var url = input.value.trim();
        if (!url || !/^https?:\/\//i.test(url)) { showAlert('رابط غير صحيح', 'error'); return; }
        if (currentImages.indexOf(url) !== -1) { showAlert('موجودة', 'warning'); return; }
        currentImages.push(url); input.value = '';
        renderImagesGrid();
    }

    function renderImagesGrid() {
        var grid = $('images-grid'); if (!grid) return;
        var badge = $('images-count-badge');
        if (badge) badge.textContent = '(' + currentImages.length + ')';
        if (!currentImages.length) { grid.innerHTML = ''; return; }
        grid.innerHTML = currentImages.map(function (url, i) {
            return '<div class="media-item">' +
                '<img src="' + escapeHtml(url) + '" onerror="this.style.opacity=0.3">' +
                '<span class="media-type-badge"><i class="fas fa-image"></i> ' + (i + 1) + '</span>' +
                '<button type="button" class="media-delete" data-delete-image="' + escapeHtml(url) + '"><i class="fas fa-times"></i></button>' +
            '</div>';
        }).join('');
    }

    /* ============================================================
       الفيديوهات
       ============================================================ */
    function addVideoFromUrl() {
        var input = $('new-video-url'); if (!input) return;
        var url = input.value.trim();
        if (!url || !/^https?:\/\//i.test(url)) { showAlert('رابط غير صحيح', 'error'); return; }
        if (currentVideos.indexOf(url) !== -1) { showAlert('موجود', 'warning'); return; }
        currentVideos.push(url); input.value = '';
        renderVideosGrid();
    }

    function renderVideosGrid() {
        var grid = $('videos-grid'); if (!grid) return;
        var badge = $('videos-count-badge');
        if (badge) badge.textContent = '(' + currentVideos.length + ')';
        if (!currentVideos.length) { grid.innerHTML = ''; return; }
        grid.innerHTML = currentVideos.map(function (url, i) {
            var yt = getYouTubeId(url);
            var thumb = yt ? 'https://img.youtube.com/vi/' + yt + '/mqdefault.jpg' : null;
            var inner = thumb
                ? '<img src="' + thumb + '"><div class="media-play-overlay"><i class="fas fa-play-circle"></i></div>'
                : '<div class="media-play-overlay"><i class="fas fa-video"></i></div>';
            return '<div class="media-item">' + inner +
                '<span class="media-type-badge"><i class="fas fa-video"></i> ' + (i + 1) + '</span>' +
                '<button type="button" class="media-delete" data-delete-video="' + escapeHtml(url) + '"><i class="fas fa-times"></i></button>' +
            '</div>';
        }).join('');
    }

    /* ============================================================
       رفع الملفات
       ============================================================ */
    async function handleFileUpload(files, type) {
        if (!files || !files.length) return;
        if (!window.db) { showAlert('لا يوجد اتصال', 'error'); return; }
        if (!currentUser) { showAlert('سجّل الدخول', 'error'); return; }

        var label = type === 'image' ? $('image-upload-label') : $('video-upload-label');
        var btn = type === 'image'
            ? document.querySelector('label[for="image-file-input"]')
            : document.querySelector('label[for="video-file-input"]');
        var orig = label ? label.textContent : '';
        if (btn) btn.classList.add('uploading');

        var success = 0, failed = 0;
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (label) label.textContent = 'جاري الرفع… (' + (i + 1) + '/' + files.length + ')';
            try {
                var ext = (file.name.split('.').pop() || (type === 'image' ? 'jpg' : 'mp4')).toLowerCase();
                var fname = type + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
                var up = await window.db.storage.from(STORAGE_BUCKET).upload(fname, file, {
                    cacheControl: '3600', upsert: false, contentType: file.type
                });
                if (up.error) { failed++; continue; }
                var pub = window.db.storage.from(STORAGE_BUCKET).getPublicUrl(fname);
                var url = pub && pub.data && pub.data.publicUrl;
                if (!url) { failed++; continue; }
                if (type === 'image') currentImages.push(url);
                else currentVideos.push(url);
                success++;
            } catch (e) { failed++; }
        }
        if (btn) btn.classList.remove('uploading');
        if (label) label.textContent = orig;
        if (type === 'image') renderImagesGrid(); else renderVideosGrid();
        var inp = type === 'image' ? $('image-file-input') : $('video-file-input');
        if (inp) inp.value = '';
        if (success) showAlert('تم رفع ' + success + ' ملف ✓', 'success');
        else showAlert('فشل الرفع', 'error');
    }

    /* ============================================================
       المرافق
       ============================================================ */
    function addCustomAmenity() {
        var input = $('new-amenity-input'); if (!input) return;
        var label = input.value.trim();
        if (!label || label.length < 2) { showAlert('اسم المرفق قصير', 'error'); return; }
        if (DEFAULT_AMENITIES.some(function (a) { return a.label === label; }) ||
            customAmenities.some(function (a) { return a.label === label; })) {
            showAlert('موجود', 'warning'); return;
        }
        var id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
        customAmenities.push({ id: id, label: label, icon: 'fa-tag' });
        selectedAmenities.push(id);
        input.value = '';
        renderAmenitiesGrid();
    }

    function deleteCustomAmenity(id) {
        customAmenities = customAmenities.filter(function (a) { return a.id !== id; });
        selectedAmenities = selectedAmenities.filter(function (x) { return x !== id; });
        renderAmenitiesGrid();
    }

    function toggleAmenity(id) {
        var i = selectedAmenities.indexOf(id);
        if (i === -1) selectedAmenities.push(id);
        else selectedAmenities.splice(i, 1);
        renderAmenitiesGrid();
    }

    function renderAmenitiesGrid() {
        var grid = $('amenities-grid'); if (!grid) return;
        var all = DEFAULT_AMENITIES.concat(customAmenities);
        grid.innerHTML = all.map(function (a) {
            var isC = customAmenities.some(function (x) { return x.id === a.id; });
            var act = selectedAmenities.indexOf(a.id) !== -1;
            var h = '<button type="button" class="amenity-item' + (act ? ' active' : '') + (isC ? ' custom' : '') +
                '" data-amenity="' + a.id + '">' +
                '<i class="fas ' + a.icon + '"></i><span>' + escapeHtml(a.label) + '</span>';
            if (isC) h += '<span class="delete-amenity" data-delete-amenity="' + a.id + '"><i class="fas fa-times"></i></span>';
            return h + '</button>';
        }).join('');
    }

    function setAmenitiesFromFeatures(features) {
        selectedAmenities = []; customAmenities = [];
        if (!Array.isArray(features)) return;
        features.forEach(function (f) {
            if (typeof f !== 'string') return;
            if (f.indexOf('custom:') === 0) {
                var label = f.replace('custom:', '');
                var id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
                customAmenities.push({ id: id, label: label, icon: 'fa-tag' });
                selectedAmenities.push(id);
            } else selectedAmenities.push(f);
        });
        renderAmenitiesGrid();
    }

    function clearAmenitiesUI() {
        selectedAmenities = []; customAmenities = [];
        renderAmenitiesGrid();
    }

    /* ============================================================
       المصادقة والتحميل
       ============================================================ */
    async function verifyAuth() {
        if (!window.db) return;
        try {
            var res = await window.db.auth.getUser();
            var u = res && res.data && res.data.user;
            if (!u) return;
            currentUser = u;
            updateAccountInfo();
        } catch (e) {}
    }

    async function loadAll() {
        await loadProperties();
        renderStats();
        renderCategoryChips();
        updateAccountInfo();
    }

    async function refreshAll() {
        showAlert('جاري التحديث…', 'info');
        await loadCategories();
        populateTypeSelect();
        await loadProperties();
        renderStats();
        renderCategoryChips();
        showAlert('تم التحديث', 'success');
    }

    async function loadProperties() {
        if (!window.db) { adminProperties = []; renderProperties(); return; }
        try {
            var res = await window.db.from('properties').select('*').order('created_at', { ascending: false });
            adminProperties = res.error ? [] : (res.data || []);
        } catch (e) { adminProperties = []; }
        renderProperties();
    }

    /* ============================================================
       عرض العقارات
       ============================================================ */
    function renderProperties() {
        var grid = $('properties-grid'); if (!grid) return;
        var term = ($('properties-search') || {}).value || '';
        term = term.trim().toLowerCase();

        var filtered = adminProperties.filter(function (p) {
            if (currentFilterCategory !== 'all' && p.type !== currentFilterCategory) return false;
            if (term) {
                var hay = ((p.title || '') + ' ' + (p.code || '') + ' ' + (p.location || '')).toLowerCase();
                if (hay.indexOf(term) === -1) return false;
            }
            return true;
        });

        if (!filtered.length) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-home"></i>' +
                '<h3>لا توجد عقارات</h3>' +
                '<p>' + (currentFilterCategory !== 'all' ? 'جرّب تصنيفاً آخر' : 'أضف أول عقار') + '</p></div>';
            return;
        }

        grid.innerHTML = filtered.map(function (p) {
            var statusInfo = STATUS_LABELS[p.status] || STATUS_LABELS.available;
            var img = (p.images && p.images[0]) || 'https://via.placeholder.com/400x300';
            var isClosed = p.status === 'sold' || p.status === 'rented';
            var mediaCount = ((p.images || []).length) + ((p.videos || []).length);

            var statusOverlay = '';
            if (isClosed) {
                statusOverlay = '<div class="property-status-badge status-' + p.status + '"><span>' + statusInfo.label + '</span></div>';
            }

            return '<div class="property-card' + (isClosed ? ' is-closed' : '') + '">' +
                '<div class="property-image">' +
                    '<img src="' + escapeHtml(img) + '" alt="" loading="lazy" onerror="this.src=\'https://via.placeholder.com/400x300\'">' +
                    '<div class="property-badge">' + escapeHtml(p.type || '') + '</div>' +
                    '<div class="property-code">' + escapeHtml(p.code || '') + '</div>' +
                    statusOverlay +
                    (mediaCount > 0 ? '<div style="position:absolute;bottom:10px;left:10px;background:rgba(0,0,0,0.75);color:#fff;font-size:10px;padding:3px 8px;border-radius:6px;font-weight:800;backdrop-filter:blur(6px);z-index:6"><i class="fas fa-images"></i> ' + mediaCount + '</div>' : '') +
                '</div>' +
                '<div class="property-content">' +
                    '<div class="property-header">' +
                        '<h3 class="property-title">' + escapeHtml(p.title || '') + '</h3>' +
                        '<div class="property-price">' + escapeHtml(p.price || '') + '</div>' +
                    '</div>' +
                    '<div class="property-location"><i class="fas fa-map-marker-alt"></i><span>' + escapeHtml(p.location || '') + '</span></div>' +
                    '<div class="property-footer">' +
                        '<span class="status-badge ' + (p.category === 'للإيجار' ? 'for-rent' : 'for-sale') + '">' + escapeHtml(p.category || '') + '</span>' +
                        '<div class="property-actions">' +
                            '<button class="property-action-btn edit" data-edit="' + p.id + '"><i class="fas fa-edit"></i></button>' +
                            '<button class="property-action-btn delete" data-delete="' + p.id + '"><i class="fas fa-trash"></i></button>' +
                        '</div>' +
                    '</div>' +
                '</div></div>';
        }).join('');
    }

    /* ============================================================
       نافذة العقار
       ============================================================ */
    function openPropertyModal(id) {
        currentPropertyId = id || null;
        var form = $('property-form'); if (form) form.reset();
        var titleEl = $('property-modal-title');
        currentImages = []; currentVideos = [];

        populateTypeSelect();

        if (id) {
            if (titleEl) titleEl.textContent = 'تعديل العقار';
            var p = adminProperties.find(function (x) { return x.id === id; });
            if (p) {
                $('property-title').value = p.title || '';
                $('property-code').value = p.code || '';
                $('property-type').value = p.type || '';
                $('property-category').value = p.category || '';
                $('property-status').value = p.status || 'available';
                $('property-price').value = p.price || '';
                $('property-area').value = p.area || '';
                $('property-location').value = p.location || '';
                $('property-description').value = p.description || '';
                currentImages = Array.isArray(p.images) ? p.images.slice() : [];
                currentVideos = Array.isArray(p.videos) ? p.videos.slice() : [];
                setAmenitiesFromFeatures(p.features || []);
            }
        } else {
            if (titleEl) titleEl.textContent = 'إضافة عقار جديد';
            clearAmenitiesUI();
            $('property-status').value = 'available';
        }

        renderImagesGrid();
        renderVideosGrid();
        $('property-modal').classList.add('active');
    }

    function closePropertyModal() {
        $('property-modal').classList.remove('active');
        currentPropertyId = null;
    }

    /* ============================================================
       حفظ العقار
       ============================================================ */
    async function saveProperty() {
        if (savingProperty) return;

        var title = ($('property-title').value || '').trim();
        var code = ($('property-code').value || '').trim();
        var type = $('property-type').value;
        var category = $('property-category').value;
        var status = $('property-status').value;
        var price = ($('property-price').value || '').trim();
        var area = parseInt($('property-area').value, 10) || 0;
        var location = ($('property-location').value || '').trim();
        var description = ($('property-description').value || '').trim();

        if (!title || !code || !type || !category || !price || !area || !location) {
            showAlert('املأ الحقول المطلوبة', 'error'); return;
        }
        if (!window.db) { showAlert('لا يوجد اتصال', 'error'); return; }
        if (!currentUser) { showAlert('سجّل الدخول', 'error'); return; }

        savingProperty = true;
        try {
            var featuresToSave = selectedAmenities.map(function (id) {
                var c = customAmenities.find(function (x) { return x.id === id; });
                return c ? 'custom:' + c.label : id;
            });

            var data = {
                code: code, title: title, description: description,
                price: price, type: type, category: category,
                status: status, area: area, location: location,
                images: currentImages.slice(),
                features: featuresToSave,
                specs: []
            };

            // إضافة الفيديوهات فقط إذا كان العمود موجوداً
            if (currentVideos.length > 0 || currentPropertyId) {
                data.videos = currentVideos.slice();
            }

            var res;
            if (currentPropertyId) {
                res = await window.db.from('properties').update(data).eq('id', currentPropertyId);
            } else {
                data.created_by = currentUser.id;
                res = await window.db.from('properties').insert([data]);
            }

            // إذا فشل بسبب عمود videos، أعد المحاولة بدونه
            if (res && res.error && res.error.message && res.error.message.indexOf('videos') !== -1) {
                delete data.videos;
                if (currentPropertyId) {
                    res = await window.db.from('properties').update(data).eq('id', currentPropertyId);
                } else {
                    res = await window.db.from('properties').insert([data]);
                }
                showAlert('تم الحفظ (أضف عمود videos في Supabase)', 'warning');
            }

            if (res && res.error) {
                showAlert('خطأ: ' + res.error.message, 'error');
                return;
            }

            showAlert('تم الحفظ ✓', 'success');
            closePropertyModal();
            await loadProperties();
            renderStats();
            renderCategoryChips();
        } catch (e) {
            showAlert('تعذّر: ' + e.message, 'error');
        } finally {
            savingProperty = false;
        }
    }

    async function deleteProperty(id) {
        if (!confirm('حذف هذا العقار؟')) return;
        if (!window.db) return;
        try {
            var res = await window.db.from('properties').delete().eq('id', id);
            if (res.error) { showAlert(res.error.message, 'error'); return; }
            showAlert('تم الحذف', 'success');
            await loadProperties();
            renderStats();
            renderCategoryChips();
        } catch (e) { showAlert(e.message, 'error'); }
    }

    /* ============================================================
       التنقل والإحصائيات
       ============================================================ */
    function switchSection(section) {
        document.querySelectorAll('.app-section').forEach(function (s) {
            s.classList.toggle('active', s.dataset.section === section);
        });
        document.querySelectorAll('.nav-item').forEach(function (b) {
            b.classList.toggle('active', b.dataset.section === section);
        });
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
    }

    function renderStats() {
        animateNum('stat-properties', adminProperties.length);
        animateNum('stat-available', adminProperties.filter(function (p) { return p.status === 'available'; }).length);
        animateNum('stat-sold', adminProperties.filter(function (p) { return p.status === 'sold'; }).length);
        animateNum('stat-rented', adminProperties.filter(function (p) { return p.status === 'rented'; }).length);
    }

    function animateNum(id, to) {
        var el = $(id); if (!el) return;
        var from = parseInt(el.textContent, 10) || 0;
        if (from === to) { el.textContent = to; return; }
        var start = performance.now(), dur = 400;
        function step(now) {
            var t = Math.min((now - start) / dur, 1);
            el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
            if (t < 1) requestAnimationFrame(step); else el.textContent = to;
        }
        requestAnimationFrame(step);
    }

    function updateAccountInfo() {
        var e = $('account-email'), r = $('account-role');
        if (e) { e.textContent = (currentUser && currentUser.email) || '—'; e.setAttribute('dir', 'ltr'); }
        if (r) r.textContent = currentUser ? 'مدير' : 'غير مسجل';
    }

    function doLogout() {
        if (!confirm('تسجيل الخروج؟')) return;
        if (window.db && window.db.auth) {
            window.db.auth.signOut().finally(function () { window.location.href = 'log.html'; });
        } else window.location.href = 'log.html';
    }

    window.AdminApp = { version: '9.0' };
    console.log('[Admin v9] ready ✓');

})();