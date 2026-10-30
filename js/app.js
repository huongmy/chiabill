    // Chuyển chế độ 1 Bữa / Sổ Quỹ và khởi động app (chạy sau cùng)
    /* ==================== UNIFIED MODE SWITCHER & MASTER BOOTSTRAP ==================== */
    const STORAGE_KEY_MODE = 'chiabill_active_mode';

    function switchAppMode(mode) {
      const tabSingle = document.getElementById('tabModeSingle');
      const tabLedger = document.getElementById('tabModeLedger');
      const secSingle = document.getElementById('sectionSingleBill');
      const secLedger = document.getElementById('sectionLedger');
      const mobileDock = document.getElementById('mobileSingleDock');
      const btnReset = document.getElementById('btnReset');
      const brandIcon = document.getElementById('headerBrandIcon');
      const badge = document.getElementById('headerModeBadge');
      const subTitle = document.getElementById('headerSubtitle');

      const mobileLedgerDock = document.getElementById('mobileLedgerDock');
      if (mode === 'ledger') {
        appStorage.setItem(STORAGE_KEY_MODE, 'ledger');
        if (secSingle) secSingle.classList.add('hidden');
        if (mobileDock) mobileDock.classList.add('hidden');
        if (mobileLedgerDock) mobileLedgerDock.classList.remove('hidden');
        // btnReset remains visible in both modes
        if (secLedger) secLedger.classList.remove('hidden');

        if (tabSingle) {
          tabSingle.className = 'px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-slate-600 hover:text-purple-700 transition flex items-center gap-1 text-[11px] sm:text-xs border border-transparent';
        }
        if (tabLedger) {
          tabLedger.className = 'px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg transition flex items-center gap-1 font-extrabold text-[11px] sm:text-xs bg-white text-purple-700 shadow-2xs border border-purple-200';
        }
        if (brandIcon) brandIcon.textContent = '📖';
        if (badge) {
          badge.textContent = 'Sổ Quỹ Nhóm';
          badge.className = 'bg-purple-100 text-purple-800 text-[9px] sm:text-[10px] font-extrabold uppercase px-1.5 sm:px-2 py-0.5 rounded-full border border-purple-200 shrink-0 hidden sm:inline';
        }
        if (subTitle) subTitle.textContent = 'Sổ chi tiêu định kỳ & Cấn trừ nợ';
        if (typeof renderApp === 'function') renderApp();
      } else {
        appStorage.setItem(STORAGE_KEY_MODE, 'single');
        if (mobileLedgerDock) mobileLedgerDock.classList.add('hidden');
        if (secLedger) secLedger.classList.add('hidden');
        if (secSingle) secSingle.classList.remove('hidden');
        if (mobileDock) mobileDock.classList.remove('hidden');
        if (btnReset) btnReset.classList.remove('hidden');

        if (tabSingle) {
          tabSingle.className = 'px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg transition flex items-center gap-1 font-extrabold text-[11px] sm:text-xs bg-white text-purple-700 shadow-2xs border border-purple-200';
        }
        if (tabLedger) {
          tabLedger.className = 'px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-slate-600 hover:text-purple-700 transition flex items-center gap-1 text-[11px] sm:text-xs border border-transparent';
        }
        if (brandIcon) brandIcon.textContent = '⚡';
        if (badge) {
          badge.textContent = '1 Bữa';
          badge.className = 'bg-purple-100 text-purple-800 text-[9px] sm:text-[10px] font-extrabold uppercase px-1.5 sm:px-2 py-0.5 rounded-full border border-purple-200 shrink-0 hidden sm:inline';
        }
        if (subTitle) subTitle.textContent = 'Tạo hóa đơn chia tiền & mã VietQR thanh toán chuẩn đẹp';
        if (typeof calculateAndRender === 'function') calculateAndRender();
      }
    }

    function initUnifiedApp() {
      // 1. Initialize Single Bill
      if (typeof initSingleBill === 'function') {
        initSingleBill();
      }

      // 2. Initialize Ledger
      if (typeof initLedger === 'function') {
        initLedger();
      }

      // 3. Tab listeners
      const btnTabSingle = document.getElementById('tabModeSingle');
      const btnTabLedger = document.getElementById('tabModeLedger');
      if (btnTabSingle) btnTabSingle.addEventListener('click', () => switchAppMode('single'));
      if (btnTabLedger) btnTabLedger.addEventListener('click', () => switchAppMode('ledger'));

      // 4. Initial Mode selection from URL or localStorage
      const urlParams = new URLSearchParams(window.location.search);
      let initialMode = 'single';
      if (urlParams.get('mode') === 'ledger' || window.location.hash === '#soquy') {
        initialMode = 'ledger';
      } else if (urlParams.get('mode') === 'single' || window.location.hash === '#single') {
        initialMode = 'single';
      } else {
        initialMode = appStorage.getItem(STORAGE_KEY_MODE) || 'single';
      }
      switchAppMode(initialMode);
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initUnifiedApp);
    } else {
      initUnifiedApp();
    }

