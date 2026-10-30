    // Chế độ 1 Bữa: bộ nhớ (appStorage), state, màu, tính tiền, form, hóa đơn xem trước, QR, xuất ảnh/chữ

    // Bộ nhớ của app. Một số nơi chặn localStorage (ví dụ xem file trong khung xem trước của app, địa chỉ data:):
    // lúc đó dùng bộ nhớ tạm để app vẫn chạy đầy đủ, chỉ là dữ liệu không được lưu lại sau khi đóng trang.
    const appStorage = (() => {
      try {
        const probe = '__chiabill_probe__';
        window.localStorage.setItem(probe, '1');
        window.localStorage.removeItem(probe);
        return window.localStorage;
      } catch (e) {
        console.warn('localStorage bị chặn ở trang này: dùng bộ nhớ tạm, dữ liệu sẽ không được lưu lại.');
        const mem = {};
        return {
          getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
          setItem: (k, v) => { mem[k] = String(v); },
          removeItem: (k) => { delete mem[k]; }
        };
      }
    })();

    const STORAGE_KEY_SINGLE = 'chia_bill_state_v9';

    // State management with 0 amount by default + MoMo information + 1 member by default
    const defaultState = {
      title: "CHIA TIỀN ĂN UỐNG",
      theme: "violet", // Màu tím mặc định lên đầu
      expenses: [
        { id: '1', name: '', amount: 0 }
      ],
      payerName: "Hương",
      rounding: "1000",
      bank: "momo",
      accountNo: "",
      accountName: "",
      memo: "Chia bill an trua",
      members: [
        { id: 'm1', name: 'Hương', isFixed: false, fixedAmount: 0 }
      ]
    };

    let state = JSON.parse(JSON.stringify(defaultState));

    // Color Theme Definitions - Violet is first and default
    const themes = {
      violet: {
        headerBg: '#6B21A8', // Vibrant Purple
        accentText: '#6B21A8',
        cardBg: '#FFFFFF',
        rowAlt: '#F5EEFC',
        divider: '#6B21A8'
      },
      maroon: {
        headerBg: '#642634',
        accentText: '#642634',
        cardBg: '#FFFFFF',
        rowAlt: '#F5EFEB',
        divider: '#642634'
      },
      navy: {
        headerBg: '#1E3A8A',
        accentText: '#1E3A8A',
        cardBg: '#FFFFFF',
        rowAlt: '#EDF2F7',
        divider: '#1E3A8A'
      },
      emerald: {
        headerBg: '#064E3B',
        accentText: '#064E3B',
        cardBg: '#FFFFFF',
        rowAlt: '#EAF3EA',
        divider: '#064E3B'
      },
      slate: {
        headerBg: '#1E293B',
        accentText: '#1E293B',
        cardBg: '#FFFFFF',
        rowAlt: '#F1F5F9',
        divider: '#1E293B'
      },
      amber: {
        headerBg: '#B45309',
        accentText: '#B45309',
        cardBg: '#FFFFFF',
        rowAlt: '#FEF3C7',
        divider: '#B45309'
      }
    };

    // Màu chủ đạo dùng chung cho cả giao diện app và hóa đơn (lưu riêng, không bị "Xóa trắng" đặt lại)
    const STORAGE_KEY_THEME = 'chiabill_theme';
    const VIOLET_PALETTE = {
      50: '250 245 255', 100: '243 232 255', 200: '233 213 255', 300: '216 180 254', 400: '192 132 252',
      500: '168 85 247', 600: '147 51 234', 700: '126 34 206', 800: '107 33 168', 900: '88 28 135', 950: '59 7 100'
    };

    // Dựng bảng sắc độ 50-950 từ màu gốc (màu gốc = sắc độ 800), pha trắng cho sáng hơn, pha đen cho đậm hơn
    function buildThemePalette(hex) {
      const base = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      const mix = (target, t) => base.map(c => Math.round(c + (target - c) * t)).join(' ');
      return {
        50: mix(255, 0.96), 100: mix(255, 0.91), 200: mix(255, 0.82), 300: mix(255, 0.70), 400: mix(255, 0.55),
        500: mix(255, 0.38), 600: mix(255, 0.22), 700: mix(255, 0.10), 800: base.join(' '),
        900: mix(0, 0.25), 950: mix(0, 0.50)
      };
    }

    function applyTheme(key) {
      const themeKey = themes[key] ? key : 'violet';
      const theme = themes[themeKey];
      const palette = themeKey === 'violet' ? VIOLET_PALETTE : buildThemePalette(theme.headerBg);
      const root = document.documentElement;
      Object.keys(palette).forEach(shade => root.style.setProperty(`--p-${shade}`, palette[shade]));

      const metaColor = document.querySelector('meta[name="theme-color"]');
      if (metaColor) metaColor.setAttribute('content', theme.headerBg);
      const dot = document.getElementById('themePickerDot');
      if (dot) dot.style.backgroundColor = theme.headerBg;
      document.querySelectorAll('#themeMenu .theme-option').forEach(btn => {
        const active = btn.dataset.theme === themeKey;
        btn.classList.toggle('bg-purple-50', active);
        const check = btn.querySelector('.theme-check');
        if (check) check.classList.toggle('hidden', !active);
      });
      try { appStorage.setItem(STORAGE_KEY_THEME, themeKey); } catch (e) {}
      return themeKey;
    }

    // Utilities
    function formatMoney(num) {
      if (isNaN(num)) return "0";
      return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }

    function parseMoney(str) {
      if (typeof str === 'number') return str;
      const clean = (str || '').replace(/[^\d]/g, '');
      return parseInt(clean, 10) || 0;
    }

    // Calculation Logic
    function calculateBill() {
      const totalExpense = state.expenses.reduce((sum, item) => sum + (item.amount || 0), 0);
      const totalMembers = state.members.length;

      // Fixed members vs evenly split members
      const fixedMembers = state.members.filter(m => m.isFixed);
      const totalFixedAmount = fixedMembers.reduce((sum, m) => sum + (m.fixedAmount || 0), 0);
      
      const evenMembers = state.members.filter(m => !m.isFixed);
      const evenCount = evenMembers.length;

      let remainingToSplit = Math.max(0, totalExpense - totalFixedAmount);
      let rawPerPerson = evenCount > 0 ? remainingToSplit / evenCount : 0;
      let roundedPerPerson = rawPerPerson;

      if (state.rounding === "1000") {
        roundedPerPerson = Math.ceil(rawPerPerson / 1000) * 1000;
      } else if (state.rounding === "5000") {
        roundedPerPerson = Math.ceil(rawPerPerson / 5000) * 5000;
      } else if (state.rounding === "10000") {
        roundedPerPerson = Math.ceil(rawPerPerson / 10000) * 10000;
      } else {
        roundedPerPerson = Math.round(rawPerPerson);
      }

      // Member amounts mapping
      const memberShares = state.members.map(m => {
        const share = m.isFixed ? m.fixedAmount : roundedPerPerson;
        const isPayer = m.name.trim().toLowerCase() === state.payerName.trim().toLowerCase();
        return {
          ...m,
          share,
          isPayer
        };
      });

      return {
        totalExpense,
        totalMembers,
        fixedMembers,
        totalFixedAmount,
        evenCount,
        remainingToSplit,
        rawPerPerson,
        roundedPerPerson,
        memberShares
      };
    }

    // Render Form Controls
    function renderExpensesForm() {
      const container = document.getElementById('expenseList');
      container.innerHTML = '';

      state.expenses.forEach((item, index) => {
        const row = document.createElement('div');
        // Điện thoại: dòng 1 = số thứ tự + tên món + nút xóa, dòng 2 = số tiền thẳng hàng với ô tên (xem .row-card). Màn rộng: cả 4 nằm một hàng.
        row.className = "row-card flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/90";
        row.innerHTML = `
          <span class="row-idx text-slate-400 text-xs px-1 font-mono shrink-0">${index + 1}</span>
          <input type="text" data-id="${item.id}" data-field="name" value="${item.name}" placeholder="Tên món/khoản chi" class="row-main flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-2.5 py-2 sm:py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:border-purple-500">
          <div class="row-sub sm:contents">
          <div class="relative w-full sm:w-36 sm:shrink-0">
            <input type="text" inputmode="numeric" data-id="${item.id}" data-field="amount" value="${item.amount > 0 ? formatMoney(item.amount) : ''}" placeholder="Số tiền" class="w-full bg-white border border-slate-300 rounded-lg pl-2.5 pr-7 py-2 sm:py-1.5 text-xs text-amber-700 font-mono text-left font-bold focus:outline-none focus:border-purple-500">
            <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none font-semibold">đ</span>
          </div>
          </div>
          <button data-id="${item.id}" class="row-del btnDeleteExpense text-slate-400 hover:text-rose-600 p-1 sm:p-1.5 rounded-lg hover:bg-rose-50 transition shrink-0" title="Xóa món">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        `;
        container.appendChild(row);
      });

      // Events for expense rows
      container.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', (e) => {
          const id = e.target.getAttribute('data-id');
          const field = e.target.getAttribute('data-field');
          const item = state.expenses.find(x => x.id === id);
          if (item) {
            if (field === 'amount') {
              item.amount = parseMoney(e.target.value);
              e.target.value = item.amount > 0 ? formatMoney(item.amount) : '';
            } else {
              item.name = e.target.value;
            }
            updateAll();
          }
        });
      });

      container.querySelectorAll('.btnDeleteExpense').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (state.expenses.length <= 1) {
            showToast('Cần ít nhất 1 khoản chi!', '⚠️');
            return;
          }
          state.expenses = state.expenses.filter(x => x.id !== id);
          renderExpensesForm();
          updateAll();
        });
      });
    }

    function renderMembersForm() {
      const container = document.getElementById('membersList');
      container.innerHTML = '';

      state.members.forEach((m, index) => {
        const row = document.createElement('div');
        const isPayer = m.name.trim().toLowerCase() === state.payerName.trim().toLowerCase();
        // Điện thoại: dòng 1 = số thứ tự + tên (huy hiệu nằm trong ô tên) + nút xóa, dòng 2 = kiểu chia (+ số tiền cố định) thẳng hàng với ô tên (xem .row-card). Màn rộng: một hàng.
        row.className = `row-card flex items-center gap-2 p-2.5 rounded-xl border text-xs ${
          isPayer ? 'bg-purple-50/60 border-purple-200' : 'bg-white border-slate-200'
        }`;
        
        let fixedAmountHtml = '';
        if (m.isFixed) {
          fixedAmountHtml = `
            <div class="relative sm:flex-none sm:w-[86px] sm:shrink-0">
              <input type="text" inputmode="numeric" data-id="${m.id}" data-field="fixedAmount" value="${formatMoney(m.fixedAmount || 0)}" placeholder="0" class="w-full bg-white border border-purple-300 rounded-lg pl-2 pr-6 py-2 sm:py-1.5 text-xs text-purple-700 font-mono text-left font-bold focus:outline-none focus:border-purple-500 shadow-2xs">
              <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">đ</span>
            </div>
          `;
        }

        const payerBadge = isPayer 
          ? `<span class="absolute right-1.5 top-1/2 -translate-y-1/2 sm:static sm:translate-y-0 bg-purple-600 text-white text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-1 rounded-md shrink-0 flex items-center gap-0.5 shadow-2xs"><span>👑</span><span class="hidden sm:inline"> Người ứng</span></span>`
          : '';

        row.innerHTML = `
          <span class="row-idx sm:w-5 text-center text-xs font-mono font-bold shrink-0 ${isPayer ? 'text-purple-700' : 'text-slate-400'}">#${index + 1}</span>
          <div class="row-main relative flex items-center gap-2 sm:flex-1 sm:min-w-0">
            <input type="text" data-id="${m.id}" data-field="name" value="${m.name}" placeholder="Tên" class="flex-1 w-full min-w-0 ${isPayer ? 'pr-10 sm:pr-2.5' : ''} bg-white border ${isPayer ? 'border-purple-300 font-bold text-purple-900' : 'border-slate-300 font-semibold text-slate-900'} rounded-lg px-2.5 py-2 sm:py-1.5 text-xs focus:outline-none focus:border-purple-500 shadow-2xs">
            ${payerBadge}
          </div>
          <div class="row-sub sm:contents">
            <select data-id="${m.id}" data-field="mode" class="sm:flex-none sm:shrink-0 bg-white border border-slate-300 rounded-lg px-2 py-2 sm:py-1.5 text-xs text-slate-700 font-medium focus:outline-none shadow-2xs">
              <option value="even" ${!m.isFixed ? 'selected' : ''}>Chia đều</option>
              <option value="fixed" ${m.isFixed ? 'selected' : ''}>Cố định</option>
            </select>
            ${fixedAmountHtml}
          </div>
          <button data-id="${m.id}" class="row-del btnDeleteMember text-slate-300 hover:text-rose-600 p-1 sm:p-1.5 rounded-lg hover:bg-rose-50 transition shrink-0" title="Xóa người">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        `;
        container.appendChild(row);
      });

      // Update prominent member count badge in Section 2 header
      const countBadge = document.getElementById('labelMemberCount');
      if (countBadge) {
        countBadge.textContent = state.members.length;
      }

      // Events
      container.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', (e) => {
          const id = e.target.getAttribute('data-id');
          const field = e.target.getAttribute('data-field');
          const m = state.members.find(x => x.id === id);
          if (m) {
            if (field === 'fixedAmount') {
              m.fixedAmount = parseMoney(e.target.value);
              e.target.value = formatMoney(m.fixedAmount);
            } else if (field === 'name') {
              // Tên trùng người khác: đánh dấu đỏ và giữ tên hợp lệ gần nhất trong danh sách, chốt lại khi rời ô nhập
              if (isDuplicateMemberName(e.target.value, id)) {
                markMemberNameInvalid(e.target, true);
                return;
              }
              markMemberNameInvalid(e.target, false);
              const oldName = m.name;
              m.name = e.target.value;
              if (state.payerName === oldName) {
                state.payerName = m.name;
              }
              populatePayerDropdown();
            }
            updateAll();
          }
        });
      });

      container.querySelectorAll('input[data-field="name"]').forEach(input => {
        input.addEventListener('change', (e) => {
          if (!e.target.hasAttribute('aria-invalid')) return;
          const m = state.members.find(x => x.id === e.target.getAttribute('data-id'));
          const dupName = e.target.value.trim();
          if (m) e.target.value = m.name;
          markMemberNameInvalid(e.target, false);
          showToast(`Tên "${dupName}" đã có trong danh sách!`, '⚠️');
        });
      });

      container.querySelectorAll('select[data-field="mode"]').forEach(select => {
        select.addEventListener('change', (e) => {
          const id = e.target.getAttribute('data-id');
          const m = state.members.find(x => x.id === id);
          if (m) {
            m.isFixed = e.target.value === 'fixed';
            if (m.isFixed && !m.fixedAmount) m.fixedAmount = 100000;
            renderMembersForm();
            updateAll();
          }
        });
      });

      container.querySelectorAll('.btnDeleteMember').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (state.members.length <= 1) {
            showToast('Cần ít nhất 1 thành viên!', '⚠️');
            return;
          }
          state.members = state.members.filter(x => x.id !== id);
          renderMembersForm();
          populatePayerDropdown();
          updateAll();
        });
      });

      populatePayerDropdown();
    }

    // Tên người tham gia không được trùng nhau (không phân biệt hoa thường); ô trống thì không tính
    function isDuplicateMemberName(name, exceptId) {
      const key = String(name || '').trim().toLowerCase();
      return key !== '' && state.members.some(m => m.id !== exceptId && (m.name || '').trim().toLowerCase() === key);
    }

    function markMemberNameInvalid(input, invalid) {
      input.style.borderColor = invalid ? '#ef4444' : '';
      input.style.backgroundColor = invalid ? '#fef2f2' : '';
      if (invalid) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }

    // Tên mặc định "Bạn A", "Bạn B"... lấy tên chưa ai dùng (xóa bớt người hoặc đổi tên vẫn không bị trùng)
    function nextPlaceholderName() {
      for (let n = state.members.length; ; n++) {
        const round = Math.floor(n / 26);
        const name = `Bạn ${String.fromCharCode(65 + (n % 26))}${round > 0 ? round + 1 : ''}`;
        if (!isDuplicateMemberName(name, null)) return name;
      }
    }

    function populatePayerDropdown() {
      const select = document.getElementById('selectPayer');
      const current = state.payerName;
      select.innerHTML = '';
      state.members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.name;
        if (m.name.trim().toLowerCase() === current.trim().toLowerCase()) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });
      if (!state.members.some(m => m.name.trim().toLowerCase() === current.trim().toLowerCase()) && state.members.length > 0) {
        state.payerName = state.members[0].name;
      }
    }

    // QR chuyển khoản: dựng ngay tại máy theo chuẩn VietQR/NAPAS (luôn hợp lệ, không cần mạng),
    // sau đó thử nâng cấp lên ảnh VietQR chính thức (có logo ngân hàng) nếu gọi được API.
    let qrDebounceTimer = null;
    let currentQrRequestId = 0;

    // ==================== VÍ MOMO ====================
    // Ví MoMo là một "ngân hàng" trên NAPAS (BIN 971025). STK nhận tiền là số điện thoại (mặc định) hoặc STK dạng PSP...,
    // người dùng chọn trong MoMo → Quét mã → QR nhận tiền. Mã QR trong app MoMo chỉ chứa link me.momo.vn, nên app
    // dựng VietQR từ STK để kèm số tiền. App MoMo quét mã chuyển tới ví MoMo từng báo "Tài khoản không hợp lệ".
    const MOMO_BIN = '971025';

    const MOMO_STK_HINT = 'Ví MoMo nhận được bằng số điện thoại hoặc STK dạng PSP... (xem trong MoMo → Quét mã → QR nhận tiền). Nếu người chuyển quét bằng app MoMo bị báo "Tài khoản không hợp lệ", hãy chuyển thẳng trong MoMo bằng số điện thoại.';

    // Ảnh giữ chỗ (SVG) khi chưa có mã QR
    function qrTextPlaceholder(text) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="1" y="1" width="198" height="198" rx="14" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 4"/><text x="100" y="105" font-family="sans-serif" font-size="13" font-weight="600" fill="#64748b" text-anchor="middle">${escapeAttr(text)}</text></svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // Tên chủ tài khoản không dấu, viết hoa (API VietQR và app ngân hàng không nhận ký tự có dấu)
    function toAsciiAccountName(text) {
      return String(text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/[^A-Za-z ]/g, ' ')
        .replace(/\s+/g, ' ').trim().toUpperCase();
    }

    // Mã BIN của ngân hàng đang chọn ở chế độ 1 Bữa
    function singleBankBin() {
      const bankOption = document.querySelector(`#bankSelect option[value="${state.bank}"]`);
      return bankOption ? bankOption.getAttribute('data-bin') : (state.bank === 'momo' ? MOMO_BIN : state.bank);
    }

    // Khung nhắc dưới ô chọn ngân hàng, chỉ hiện khi chọn Ví MoMo
    function updateMomoQrBox() {
      const box = document.getElementById('momoQrBox');
      if (!box) return;
      box.textContent = MOMO_STK_HINT;
      box.classList.toggle('hidden', singleBankBin() !== MOMO_BIN);
    }

    function updateQrCode(amount) {
      const accountNo = state.accountNo ? state.accountNo.replace(/\s+/g, '') : '';
      const vietQrImg = document.getElementById('vietQrImg');
      const localQrDiv = document.getElementById('localQrCanvas');

      if (!accountNo) {
        clearTimeout(qrDebounceTimer);
        currentQrRequestId++;
        vietQrImg.classList.add('hidden');
        localQrDiv.classList.add('hidden');
        return;
      }

      clearTimeout(qrDebounceTimer);
      qrDebounceTimer = setTimeout(async () => {
        const reqId = ++currentQrRequestId;
        const bin = singleBankBin();
        const accountName = toAsciiAccountName(state.accountName);
        const memo = toAsciiMemo(state.memo ? state.memo.trim() : '');
        const payAmount = Math.round(amount) > 0 ? Math.round(amount) : 0;

        // Bước 1: QR dựng tại máy, hiện ngay
        renderLocalQr(bin, accountNo, payAmount, memo);

        // Bước 2: nâng cấp lên ảnh VietQR chính thức (đầy đủ logo Napas/ngân hàng), lỗi thì giữ QR ở bước 1
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 4000);
          const resp = await fetch('https://api.vietqr.io/v2/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountNo: accountNo,
              accountName: accountName,
              acqId: bin,
              amount: payAmount > 0 ? payAmount : undefined,
              addInfo: memo,
              template: 'compact2'
            }),
            signal: ctrl.signal
          });
          clearTimeout(tid);

          if (reqId !== currentQrRequestId) return;

          const resData = await resp.json();
          if (resData && resData.data && resData.data.qrDataURL) {
            vietQrImg.removeAttribute('crossorigin');
            vietQrImg.src = resData.data.qrDataURL;
            vietQrImg.classList.remove('hidden');
            localQrDiv.classList.add('hidden');
          }
        } catch (apiErr) {
          console.warn('VietQR API unavailable, keeping local VietQR:', apiErr);
        }
      }, 200);
    }

    function renderLocalQr(bin, accountNo, amount, memo) {
      const vietQrImg = document.getElementById('vietQrImg');
      const localQrDiv = document.getElementById('localQrCanvas');

      vietQrImg.classList.add('hidden');
      localQrDiv.classList.remove('hidden');
      localQrDiv.innerHTML = '';

      try {
        new QRCode(localQrDiv, {
          text: buildVietQrPayload(bin, accountNo, amount, memo),
          width: 280,
          height: 280,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
        // Co vừa khung hiển thị, không bị cắt mép (QR bị cắt sẽ không quét được)
        localQrDiv.querySelectorAll('img, canvas').forEach(el => {
          el.style.width = '100%';
          el.style.height = '100%';
        });
      } catch (err) {
        console.error('Local QR render error:', err);
        localQrDiv.innerHTML = `<div class="text-xs text-slate-500 font-mono text-center p-3">STK: ${accountNo}</div>`;
      }
    }

    // Update Live Card Preview
    function updatePreview() {
      const calc = calculateBill();
      const theme = themes[state.theme] || themes.violet;

      // Card Header
      const header = document.getElementById('receiptHeader');
      header.style.backgroundColor = theme.headerBg;

      document.getElementById('previewTitle').textContent = state.title || 'CHIA TIỀN';
      const previewSubtitle = document.getElementById('previewSubtitle');
      if (previewSubtitle) {
        previewSubtitle.textContent = `Hóa đơn chia tiền · ${calc.totalMembers} người`;
      }
      const previewBadge = document.getElementById('previewTotalMembersBadge');
      if (previewBadge) {
        previewBadge.textContent = `${calc.totalMembers} NGƯỜI`;
      }

      // Top labels
      document.getElementById('labelTotalExpense').textContent = `${formatMoney(calc.totalExpense)} đ`;
      const labelMemberCount = document.getElementById('labelMemberCount');
      if (labelMemberCount) {
        labelMemberCount.textContent = calc.totalMembers;
      }

      // Expenses preview (Regular font, clean like reference image)
      const expenseItemsContainer = document.getElementById('previewExpenseItems');
      expenseItemsContainer.innerHTML = '';
      state.expenses.forEach(item => {
        const row = document.createElement('div');
        row.className = "flex justify-between items-center text-slate-800 text-[13px]";
        row.innerHTML = `
          <span>${item.name || 'Khoản chi'}</span>
          <span>${formatMoney(item.amount)}</span>
        `;
        expenseItemsContainer.appendChild(row);
      });

      // Payer summary (Regular font)
      document.getElementById('previewPayerSummary').textContent = `Tổng (${state.payerName} đã trả hết)`;
      document.getElementById('previewTotalAmount').textContent = formatMoney(calc.totalExpense);

      // Formula breakdown text
      const formula1 = document.getElementById('previewFormulaText1');
      const formula2 = document.getElementById('previewFormulaText2');

      if (calc.totalExpense === 0) {
        formula1.textContent = `${calc.totalMembers} người tham gia (chưa có chi phí)`;
        formula2.textContent = `Tổng: 0 đ · Mỗi người: 0 đ`;
      } else if (calc.fixedMembers.length > 0) {
        const fixedDescriptions = calc.fixedMembers.map(m => `${m.name} cố định ${formatMoney(m.fixedAmount)} đ`).join(', ');
        formula1.textContent = `📌 ${fixedDescriptions} · ${calc.evenCount} người còn lại chia đều:`;
        formula2.textContent = `(${formatMoney(calc.totalExpense)} - ${formatMoney(calc.totalFixedAmount)}) ÷ ${calc.evenCount} người = ${formatMoney(calc.rawPerPerson)} ≈ ${formatMoney(calc.roundedPerPerson)} đ/người`;
      } else {
        formula1.textContent = `📌 Chia đều cho ${calc.totalMembers} người tham gia:`;
        formula2.textContent = `${formatMoney(calc.totalExpense)} ÷ ${calc.totalMembers} người = ${formatMoney(calc.rawPerPerson)} ≈ ${formatMoney(calc.roundedPerPerson)} đ/người`;
      }

      // Dividers color matching theme
      const dividerColor = theme.divider || '#6B21A8';
      document.getElementById('dividerTop').style.borderColor = dividerColor;
      document.getElementById('dividerBottom').style.borderColor = dividerColor;

      // Table Title update
      const tableTitle = document.getElementById('previewTableTitle');
      if (tableTitle) {
        tableTitle.textContent = `📋 DANH SÁCH THỰC TRẢ (${calc.totalMembers} NGƯỜI):`;
      }

      // Mobile floating bar updates
      const mobilePerPerson = document.getElementById('mobilePerPerson');
      if (mobilePerPerson) {
        mobilePerPerson.textContent = `${formatMoney(calc.roundedPerPerson)} đ`;
      }
      const mobileBtnCount = document.getElementById('mobileBtnCount');
      if (mobileBtnCount) {
        mobileBtnCount.textContent = `(${calc.totalMembers} người)`;
      }

      // Members Table Preview (Alternating rows, clean flat style matching sample)
      const membersTable = document.getElementById('previewMembersTable');
      membersTable.innerHTML = '';

      calc.memberShares.forEach((m, idx) => {
        const row = document.createElement('div');
        const isOdd = idx % 2 === 1;
        const rowBg = isOdd ? (theme.rowAlt || '#F5EEFC') : 'transparent';
        
        if (m.isPayer) {
          row.className = "py-1.5 px-2.5 transition-colors";
          row.style.backgroundColor = rowBg;
          row.innerHTML = `
            <div class="flex justify-between items-center">
              <span class="text-[13px] font-normal" style="color: ${theme.accentText}">
                ${m.name} (phần của mình)
              </span>
              <span class="text-[13px] font-bold" style="color: ${theme.accentText}">
                ${formatMoney(m.share)}
              </span>
            </div>
            <div class="text-[10.5px] text-slate-500 font-normal mt-0.5">
              Đã ứng toàn bộ ➔ ${calc.totalMembers - 1} người còn lại chuyển khoản cho ${m.name}
            </div>
          `;
        } else {
          // Nút ảnh riêng của người này: không lọt vào ảnh bill chung (data-html2canvas-ignore)
          row.className = "flex justify-between items-center gap-2 py-1.5 px-2.5 transition-colors";
          row.style.backgroundColor = rowBg;
          row.innerHTML = `
            <span class="text-slate-800 text-[13px] font-normal min-w-0 break-words">${escapeAttr(m.name)}</span>
            <span class="flex items-center gap-1.5 shrink-0">
              <span class="font-bold text-slate-900 text-[13px] tracking-tight">${formatMoney(m.share)}</span>
              <button type="button" data-html2canvas-ignore="true" data-name="${escapeAttr(m.name)}" onclick="openPersonImage('single', this.dataset.name)" title="Ảnh riêng của ${escapeAttr(m.name)} (kèm QR đúng số tiền)" aria-label="Ảnh riêng của ${escapeAttr(m.name)}" class="w-7 h-7 -my-1 rounded-lg text-slate-400 hover:text-purple-700 hover:bg-white flex items-center justify-center transition cursor-pointer">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>
              </button>
            </span>
          `;
        }
        membersTable.appendChild(row);
      });

      // Bank Section
      const transferTitle = document.getElementById('previewTransferTitle');
      transferTitle.textContent = `Chuyển khoản cho ${state.payerName}`;
      transferTitle.style.color = theme.accentText;

      const bankOption = document.querySelector(`#bankSelect option[value="${state.bank}"]`);
      document.getElementById('previewBankName').textContent = bankOption ? bankOption.textContent.split('(')[0].trim() : state.bank;
      updateMomoQrBox();
      document.getElementById('previewAccountName').textContent = state.accountName;

      // STK Row: Only show if accountNo is not empty
      const accountNoRow = document.getElementById('previewAccountNoRow');
      const cleanAccNo = state.accountNo ? state.accountNo.trim() : '';
      if (cleanAccNo) {
        accountNoRow.classList.remove('hidden');
        document.getElementById('previewAccountNo').textContent = cleanAccNo;
      } else {
        accountNoRow.classList.add('hidden');
      }

      // Memo Row: Only show if memo is not empty
      const memoRow = document.getElementById('previewMemoRow');
      const cleanMemo = state.memo ? state.memo.trim() : '';
      if (cleanMemo) {
        memoRow.classList.remove('hidden');
        document.getElementById('previewMemoText').textContent = cleanMemo;
      } else {
        memoRow.classList.add('hidden');
      }

      // QR Code update & visibility
      const qrWrapper = document.getElementById('qrCodeWrapper');
      // Có người trả cố định: số tiền mỗi người khác nhau nên QR để trống số tiền
      const hasFixed = calc.fixedMembers.length > 0;
      document.getElementById('qrNoAmountNote').classList.toggle('hidden', !(cleanAccNo && hasFixed));
      if (cleanAccNo) {
        qrWrapper.classList.remove('hidden');
        updateQrCode(hasFixed ? 0 : calc.roundedPerPerson);
      } else {
        qrWrapper.classList.add('hidden');
      }
    }

    function updateAll() {
      updatePreview();
      saveToLocalStorage();
    }

    function saveToLocalStorage() {
      try {
        appStorage.setItem(STORAGE_KEY_SINGLE, JSON.stringify(state));
      } catch (e) {}
    }

    function getEffectiveDefaultState() {
      const base = JSON.parse(JSON.stringify(defaultState));
      try {
        const customDef = appStorage.getItem('CHIABILL_MY_DEFAULT_ACCOUNT');
        if (customDef) {
          const parsed = JSON.parse(customDef);
          if (parsed.bank) base.bank = parsed.bank;
          if (parsed.accountNo !== undefined) base.accountNo = parsed.accountNo;
          if (parsed.accountName) base.accountName = parsed.accountName;
          if (parsed.payerName) {
            base.payerName = parsed.payerName;
            base.members = [{ id: 'm1', name: parsed.payerName, isFixed: false, fixedAmount: 0 }];
          }
        }
      } catch (e) {}
      return base;
    }

    function loadFromLocalStorage() {
      try {
        appStorage.removeItem('chia_bill_state_v7');
        appStorage.removeItem('chia_bill_state_v8');
        
        // Bắt đầu từ tài khoản mặc định của người dùng (nếu đã lưu) hoặc mặc định hệ thống
        const effDefault = getEffectiveDefaultState();
        Object.assign(state, effDefault);

        const saved = appStorage.getItem(STORAGE_KEY_SINGLE);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.accountName && parsed.accountName.includes('Bình')) {
            parsed.accountName = effDefault.accountName;
            parsed.bank = effDefault.bank;
            parsed.accountNo = effDefault.accountNo;
            parsed.payerName = effDefault.payerName;
          }
          Object.assign(state, parsed);
        }
      } catch (e) {}
    }


    function checkDefaultAccountDirty() {
      const effDefault = getEffectiveDefaultState();
      const bankElem = document.getElementById('bankSelect');
      const accNoElem = document.getElementById('accountNo');
      const accNameElem = document.getElementById('accountName');

      const curBank = bankElem ? bankElem.value : state.bank;
      const curAccNo = (accNoElem ? accNoElem.value : (state.accountNo || '')).trim();
      const curAccName = (accNameElem ? accNameElem.value : (state.accountName || '')).trim().toUpperCase();

      const defBank = effDefault.bank;
      const defAccNo = (effDefault.accountNo || '').trim();
      const defAccName = (effDefault.accountName || '').trim().toUpperCase();

      const boxSave = document.getElementById('boxSaveCustomDefault');
      const badgeDefault = document.getElementById('badgeCurrentDefault');

      const isMatching = (curBank === defBank && curAccNo === defAccNo && curAccName === defAccName);

      if (boxSave && badgeDefault) {
        if (isMatching) {
          boxSave.classList.add('hidden');
          badgeDefault.classList.remove('hidden');
        } else if (curAccNo.length > 0) {
          boxSave.classList.remove('hidden');
          badgeDefault.classList.add('hidden');
        } else {
          boxSave.classList.add('hidden');
          badgeDefault.classList.add('hidden');
        }
      }
    }

    function syncFormFromState() {
      document.getElementById('eventTitle').value = state.title;
      applyTheme(state.theme);
      document.getElementById('roundingOption').value = state.rounding;
      document.getElementById('bankSelect').value = state.bank;
      document.getElementById('accountNo').value = state.accountNo;
      document.getElementById('accountName').value = state.accountName;
      document.getElementById('transferMemo').value = state.memo;
      checkDefaultAccountDirty();
    }

    // Export: Download as PNG image
    async function downloadReceiptImage() {
      const card = document.getElementById('billReceiptCard');
      const btn = document.getElementById('btnDownloadImage');
      const originalText = btn.innerHTML;

      try {
        btn.innerHTML = `<span>⏳</span> Đang tạo ảnh...`;
        btn.disabled = true;

        await new Promise(r => setTimeout(r, 200));

        const canvas = await html2canvas(card, {
          scale: 3, // 3x Retina resolution
          useCORS: true,
          backgroundColor: null,
          logging: false
        });

        const image = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        // Tên file tiếng Anh không dấu (tiêu đề có dấu làm tên file bị mất chữ)
        link.download = `split-bill-${getLocalDateString()}.png`;
        link.href = image;
        link.click();

        showToast('Đã tải ảnh hóa đơn về máy!', '🎉');
      } catch (err) {
        console.error(err);
        showToast('Có lỗi khi tạo ảnh. Vui lòng thử lại!', '❌');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    // Export: Copy formatted text to clipboard
    function copyFormattedText() {
      const calc = calculateBill();
      let text = `🧾 HÓA ĐƠN: ${state.title.toUpperCase()}\n`;
      text += `👥 Số lượng: ${calc.totalMembers} người\n`;
      text += `--------------------------------\n`;
      state.expenses.forEach(e => {
        text += `• ${e.name}: ${formatMoney(e.amount)} đ\n`;
      });
      text += `👉 Tổng cộng: ${formatMoney(calc.totalExpense)} đ (${state.payerName} đã trả)\n\n`;

      if (calc.fixedMembers.length > 0) {
        const fixedText = calc.fixedMembers.map(m => `${m.name} cố định ${formatMoney(m.fixedAmount)} đ`).join(', ');
        text += `📌 ${fixedText}\n`;
        text += `📌 ${calc.evenCount} người còn lại: (${formatMoney(calc.totalExpense)} - ${formatMoney(calc.totalFixedAmount)}) ÷ ${calc.evenCount} = ${formatMoney(calc.roundedPerPerson)} đ/người\n\n`;
      } else {
        text += `📌 Mỗi người: ${formatMoney(calc.roundedPerPerson)} đ\n\n`;
      }

      text += `📋 DANH SÁCH:\n`;
      calc.memberShares.forEach(m => {
        if (m.isPayer) {
          text += `✅ ${m.name}: ${formatMoney(m.share)} đ (Người ứng)\n`;
        } else {
          text += `• ${m.name}: ${formatMoney(m.share)} đ\n`;
        }
      });

      const bankOption = document.querySelector(`#bankSelect option[value="${state.bank}"]`);
      const bankLabel = bankOption ? bankOption.textContent.split('(')[0].trim() : state.bank;
      const cleanAcc = state.accountNo ? state.accountNo.trim() : '';
      const cleanMemo = state.memo ? state.memo.trim() : '';

      text += `\n💳 THÔNG TIN CHUYỂN KHOẢN:\n`;
      text += `• Ngân hàng / Ví: ${bankLabel}\n`;
      if (cleanAcc) {
        text += `• STK: ${cleanAcc}\n`;
      }
      if (state.accountName && state.accountName.trim()) {
        text += `• Chủ TK: ${state.accountName.trim()}\n`;
      }
      if (cleanMemo) {
        text += `• Nội dung: ${cleanMemo}\n`;
      }

      navigator.clipboard.writeText(text).then(() => {
        showToast('Đã sao chép nội dung chia bill!', '📋');
      }).catch(() => {
        showToast('Không thể sao chép!', '❌');
      });
    }

    // Init Event Listeners
    function initListeners() {
      document.getElementById('eventTitle').addEventListener('input', (e) => {
        state.title = e.target.value;
        updateAll();
      });

      // Chọn màu chủ đạo ở header
      const btnThemePicker = document.getElementById('btnThemePicker');
      const themeMenu = document.getElementById('themeMenu');
      const setThemeMenuOpen = (open) => {
        themeMenu.classList.toggle('hidden', !open);
        btnThemePicker.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      btnThemePicker.addEventListener('click', (e) => {
        e.stopPropagation();
        setThemeMenuOpen(themeMenu.classList.contains('hidden'));
      });
      themeMenu.addEventListener('click', (e) => {
        const option = e.target.closest('.theme-option');
        if (!option) return;
        state.theme = applyTheme(option.dataset.theme);
        updateAll();
        setThemeMenuOpen(false);
      });
      document.addEventListener('click', (e) => {
        if (!themeMenu.contains(e.target)) setThemeMenuOpen(false);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setThemeMenuOpen(false);
      });

      document.getElementById('roundingOption').addEventListener('change', (e) => {
        state.rounding = e.target.value;
        updateAll();
      });

      document.getElementById('selectPayer').addEventListener('change', (e) => {
        state.payerName = e.target.value;
        updateAll();
      });

      document.getElementById('bankSelect').addEventListener('change', (e) => {
        state.bank = e.target.value;
        updateAll();
        checkDefaultAccountDirty();
      });

      document.getElementById('accountNo').addEventListener('input', (e) => {
        state.accountNo = e.target.value;
        updateAll();
        checkDefaultAccountDirty();
      });

      document.getElementById('accountName').addEventListener('input', (e) => {
        state.accountName = e.target.value;
        updateAll();
        checkDefaultAccountDirty();
      });

      document.getElementById('transferMemo').addEventListener('input', (e) => {
        state.memo = e.target.value;
        updateAll();
      });

      document.getElementById('btnAddExpense').addEventListener('click', () => {
        state.expenses.push({
          id: 'exp_' + Date.now(),
          name: '',
          amount: 0
        });
        renderExpensesForm();
        updateAll();
      });

      document.getElementById('btnAddMember').addEventListener('click', () => {
        state.members.push({
          id: 'mem_' + Date.now(),
          name: nextPlaceholderName(),
          isFixed: false,
          fixedAmount: 0
        });
        renderMembersForm();
        updateAll();
      });

      document.getElementById('quickNamesInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('btnQuickAdd').click();
        }
      });

      document.getElementById('btnQuickAdd').addEventListener('click', () => {
        const input = document.getElementById('quickNamesInput');
        const val = input.value.trim();
        if (!val) return;

        const names = val.split(/[,\n]+/).map(n => n.trim()).filter(Boolean);
        if (names.length === 0) return;

        // Thêm vào danh sách đang có (không xóa người cũ). Các dòng "Bạn A", "Bạn B"... do nút "Thêm 1 người" tự đặt
        // và chưa chỉnh gì thì được thay bằng tên mới. Tên đã có trong danh sách (không phân biệt hoa thường) thì bỏ qua.
        const isPlaceholder = m => /^Bạn [A-Z]$/.test((m.name || '').trim()) && !m.isFixed && !m.fixedAmount;
        const kept = state.members.filter(m => !isPlaceholder(m));
        const seen = new Set(kept.map(m => m.name.trim().toLowerCase()));
        const fresh = [];
        names.forEach(name => {
          const key = name.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          fresh.push({
            id: 'mem_' + Math.random().toString(36).substr(2, 9),
            name: name,
            isFixed: false,
            fixedAmount: 0
          });
        });

        if (fresh.length === 0) {
          showToast('Các tên này đã có trong danh sách rồi!', '⚠️');
          return;
        }
        const skipped = names.length - fresh.length;
        state.members = kept.concat(fresh);

        // Tự động đồng bộ người chi ứng trước
        if (!state.members.some(m => m.name.trim().toLowerCase() === state.payerName.trim().toLowerCase())) {
          state.payerName = state.members[0].name;
        }

        input.value = '';
        populatePayerDropdown();
        renderMembersForm();
        updateAll();
        showToast(`Đã thêm ${fresh.length} người${skipped > 0 ? `, bỏ qua ${skipped} tên đã có` : ''}!`, '✨');
      });


      // Lưu tài khoản hiện tại làm mặc định của riêng người dùng
      document.getElementById('btnSaveCustomDefault').addEventListener('click', () => {
        const bank = document.getElementById('bankSelect').value;
        const accountNo = document.getElementById('accountNo').value.trim();
        const accountName = document.getElementById('accountName').value.trim().toUpperCase();

        if (!accountNo || !accountName) {
          showToast('Vui lòng nhập Số tài khoản và Tên chủ tài khoản trước khi lưu!', '⚠️');
          return;
        }

        // Tự động suy ra tên ngắn cho người trả (Ví dụ: NGUYỄN VĂN AN -> An)
        const nameParts = accountName.split(/\s+/).filter(Boolean);
        const shortName = nameParts.length > 0 
          ? (nameParts[nameParts.length - 1].charAt(0).toUpperCase() + nameParts[nameParts.length - 1].slice(1).toLowerCase())
          : state.payerName;

        const customData = {
          bank,
          accountNo,
          accountName,
          payerName: shortName
        };

        try {
          appStorage.setItem('CHIABILL_MY_DEFAULT_ACCOUNT', JSON.stringify(customData));
          state.bank = bank;
          state.accountNo = accountNo;
          state.accountName = accountName;

          if (state.members.length === 1) {
            state.members[0].name = shortName;
            state.payerName = shortName;
          }

          syncFormFromState();
          populatePayerDropdown();
          renderMembersForm();
          updateAll();
          showToast(`⭐ Đã lưu tài khoản (${accountName}) làm mặc định của bạn!`, '✅');
        } catch (e) {
          showToast('Không thể lưu vào bộ nhớ trình duyệt!', '⚠️');
        }
      });

      // Nút Xóa trắng: Thống nhất dùng chung cho cả 2 chế độ (1 Bữa & Sổ Quỹ)
      document.getElementById('btnReset').addEventListener('click', () => {
        const activeMode = appStorage.getItem('chiabill_active_mode') || 'single';
        if (activeMode === 'ledger') {
          window.openClearAllModal();
        } else {
          if (!confirm('Bạn có chắc muốn xóa trắng dữ liệu bữa ăn về mặc định không?')) return;
          const effDefault = getEffectiveDefaultState();
          effDefault.theme = state.theme; // màu chủ đạo là cài đặt giao diện, giữ nguyên khi xóa trắng
          state = effDefault;
          syncFormFromState();
          populatePayerDropdown();
          renderExpensesForm();
          renderMembersForm();
          updateAll();
          showToast(state.accountName ? `Đã xóa trắng! Tài khoản mặc định: ${state.accountName}` : 'Đã xóa trắng!', '🧹');
        }
      });

      document.getElementById('btnDownloadImage').addEventListener('click', downloadReceiptImage);
      document.getElementById('btnCopyText').addEventListener('click', copyFormattedText);

      const btnMobileScroll = document.getElementById('btnMobileScrollToBill');
      if (btnMobileScroll) {
        btnMobileScroll.addEventListener('click', () => {
          document.getElementById('billSection')?.scrollIntoView({ behavior: 'smooth' });
        });
      }
    }

    // Startup
    window.addEventListener('DOMContentLoaded', () => {
      loadFromLocalStorage();
      let savedTheme = '';
      try { savedTheme = appStorage.getItem(STORAGE_KEY_THEME) || ''; } catch (e) {}
      if (themes[savedTheme]) state.theme = savedTheme;
      syncFormFromState();
      renderExpensesForm();
      renderMembersForm();
      updateAll();
      initListeners();
    });
  


