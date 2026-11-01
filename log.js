// ============================================================
// عودة للعقار — كود صفحة الدخول المربوط بـ Supabase
// ============================================================

// 1. إخفاء شاشة التحميل
function dismissLoader() {
    const loader = document.getElementById('loader');
    const auth = document.getElementById('auth');
    if(loader) loader.classList.add('hidden');
    if(auth) auth.classList.add('ready');
    document.body.classList.add('loaded');
}

window.addEventListener('load', () => {
    setTimeout(dismissLoader, 1500);
});

setTimeout(() => {
    if (!document.body.classList.contains('loaded')) dismissLoader();
}, 4000);

// ============================================================
// 2. تبديل التبويبات (دخول / حساب جديد)
// ============================================================
const tabs = document.querySelectorAll('.auth-tab');
const forms = document.querySelectorAll('.auth-form');

function switchTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    forms.forEach(f => f.classList.toggle('active', f.id === name + '-form'));
}

tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.querySelectorAll('[data-switch]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab(link.dataset.switch);
    });
});

// ============================================================
// 3. إظهار/إخفاء كلمة المرور
// ============================================================
document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const icon = btn.querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });
});

// ============================================================
// 4. تسجيل الدخول الحقيقي عبر Supabase
// ============================================================
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = e.target.querySelector('input[type="email"]').value.trim();
    const password = e.target.querySelector('input[type="password"]').value;
    const submitBtn = e.target.querySelector('.auth-submit');

    if (!email || !password) {
        showToast('يرجى تعبئة البريد وكلمة المرور', true);
        return;
    }

    submitBtn.textContent = 'جاري التحقق...';
    submitBtn.disabled = true;

    // تسجيل خروج تلقائي من أي جلسة قديمة
    await window.db.auth.signOut();

    // أمر الدخول لـ Supabase
    const { data, error } = await window.db.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        showToast('خطأ: ' + (error.message === 'Invalid login credentials' ? 'بيانات الدخول خاطئة' : error.message), true);
        submitBtn.textContent = 'تسجيل الدخول';
        submitBtn.disabled = false;
        return;
    }

    // جلب الرتبة
    const { data: profile } = await window.db
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();
    
    // إظهار تنبيه النجاح من تصميمنا
    showToast('تم تسجيل الدخول بنجاح!');

    // التوجيه الذكي
    setTimeout(() => {
        if (profile && profile.role === 'admin') {
            window.location.href = 'admin.html'; // صفحة الأدمن
        } else {
            window.location.href = 'index.html'; // صفحة المستخدم العادي
        }
    }, 1000);
});

// ============================================================
// 5. إنشاء حساب جديد حقيقي عبر Supabase
// ============================================================
document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const form = e.target;
    const fullName = form.querySelector('input[type="text"]').value.trim();
    const email = form.querySelector('input[type="email"]').value.trim();
    const passwords = form.querySelectorAll('input[type="password"]');
    const password = passwords[0].value;
    const confirmPassword = passwords[1].value;
    const termsChecked = form.querySelector('input[type="checkbox"]').checked;
    const submitBtn = form.querySelector('.auth-submit');

    if (!fullName || !email || !password) {
        showToast('يرجى تعبئة جميع الحقول', true);
        return;
    }
    if (password !== confirmPassword) {
        showToast('كلمتا المرور غير متطابقتين', true);
        return;
    }
    if (!termsChecked) {
        showToast('يجب الموافقة على الشروط', true);
        return;
    }

    submitBtn.textContent = 'جاري إنشاء الحساب...';
    submitBtn.disabled = true;

    const { data, error } = await window.db.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                full_name: fullName
            }
        }
    });

    if (error) {
        showToast('خطأ: ' + error.message, true);
        submitBtn.textContent = 'إنشاء الحساب';
        submitBtn.disabled = false;
        return;
    }

    showToast('تم إنشاء الحساب بنجاح!');
    
    setTimeout(() => {
        window.location.href = 'index.html'; 
    }, 1500);
});

// ============================================================
// 6. دالة التنبيهات (Toast) من تصميمنا
// ============================================================
let toastTimer;
function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    const text = document.getElementById('toast-text');
    const icon = toast.querySelector('i');

    if (!toast) return;

    text.textContent = msg;
    toast.classList.toggle('error', isError);
    icon.className = isError ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';

    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}