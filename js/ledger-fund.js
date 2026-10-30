    // Sổ Quỹ: màn hình quản lý quỹ, chốt kỳ, dữ liệu mẫu, popup QR từng người, initLedger
    // ==================== MÀN HÌNH QUẢN LÝ QUỸ ====================
    // Thu quỹ theo đợt: mỗi đợt có tên, mức nộp mỗi người và ngày. Tick một người = ghi luôn khoản nộp quỹ của người đó
    // (khỏi nhập tay), bỏ tick = xóa khoản đó. Tiền tài trợ từ nguồn ngoài cũng thêm ở đây.
    const modalFundManager = document.getElementById('modalFundManager');
    const fundManagerBody = document.getElementById('fundManagerBody');
    let fundMgrRoundId = '';
    let fundMgrMode = '';     // '' = xem đợt đang chọn | 'new' = tạo đợt | 'edit' = sửa đợt
    let fundMgrAmounts = {};  // tên -> số tiền đang nhập cho dòng chưa nộp (của đợt đang chọn)
    let fundMgrSeq = 0;
    let fundMgrHistoryOpen = false;

    function fundMgrNewId(prefix) {
      fundMgrSeq += 1;
      return `${prefix}-${Date.now()}-${fundMgrSeq}`;
    }

    function fundMgrParseMoney(text) {
      return parseInt(String(text || '').replace(/\D/g, ''), 10) || 0;
    }

    function fundMgrDeposit(roundId, name) {
      return ledgerState.expenses.find(e => e.isFundDeposit && e.roundId === roundId && e.payer === name) || null;
    }

    function fundMgrPushDeposit(payer, amount, date, note, roundId) {
      const entry = {
        id: fundMgrNewId('dep'),
        isPayment: true,
        isFundDeposit: true,
        date: date,
        name: note || defaultPaymentNote(payer, FUND_NAME),
        amount: amount,
        payer: payer,
        recipient: FUND_NAME,
        participants: [FUND_NAME]
      };
      if (roundId) entry.roundId = roundId;
      ledgerState.expenses.push(entry);
      ledgerState.expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
      return entry;
    }

    function renderFundManager() {
      if (!fundManagerBody) return;
      const keepScroll = fundManagerBody.scrollTop;
      // Giữ lại những gì đang gõ ở phần tài trợ khi vẽ lại
      const keepSponsor = {};
      fundManagerBody.querySelectorAll('[data-fm-sponsor]').forEach(el => { keepSponsor[el.dataset.fmSponsor] = el.value; });

      const calc = calculateLedger();
      const members = ledgerState.members;
      const rounds = ledgerState.fundRounds;
      const today = getLocalDateString();
      if (!rounds.some(r => r.id === fundMgrRoundId)) fundMgrRoundId = rounds.length > 0 ? rounds[rounds.length - 1].id : '';
      const round = rounds.find(r => r.id === fundMgrRoundId) || null;
      const mode = rounds.length === 0 ? 'new' : fundMgrMode;

      const subtitle = document.getElementById('fundManagerSubtitle');
      if (subtitle) subtitle.textContent = fundCashText(calc.fundCash);

      fundManagerBody.innerHTML = '';
      fundManagerBody.appendChild(buildFundCard(calc, false, true));

      const section = document.createElement('div');
      let html = '';

      // Nhắc cài STK thủ quỹ để có mã QR cho các bạn nộp quỹ
      const fundBank = memberBanks[FUND_NAME];
      if (!(fundBank && fundBank.accountNo)) {
        html += `
          <div class="mt-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
            <p class="text-[11px] leading-relaxed text-amber-900">Chưa cài STK thủ quỹ nên chưa có mã QR cho các bạn nộp quỹ.</p>
            <button type="button" data-fm-action="set-bank" class="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-bold text-amber-900 hover:bg-amber-100 transition cursor-pointer">Cài STK</button>
          </div>`;
      }

      // ===== Thu quỹ theo đợt =====
      const chips = rounds.slice().reverse().map(r =>
        `<button type="button" data-fm-action="pick-round" data-id="${escapeAttr(r.id)}" class="${r.id === fundMgrRoundId && mode === '' ? MODAL_CHIP_ON : MODAL_CHIP_OFF}">${escapeAttr(r.name)}</button>`
      ).join('');
      html += `
        <div class="mt-5">
          <div class="text-sm font-bold text-slate-900">Thu quỹ theo đợt</div>
          <p class="text-[11px] text-slate-500 leading-relaxed mb-2">Tạo một đợt, rồi tick từng người khi họ đã chuyển tiền: khoản nộp được ghi vào quỹ luôn, không phải nhập tay.</p>
          <div class="flex flex-wrap gap-1.5 items-center">
            ${chips}
            <button type="button" data-fm-action="new-round" class="px-3.5 py-1.5 rounded-full text-xs font-bold border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 transition cursor-pointer">+ Đợt thu mới</button>
          </div>`;

      if (mode === 'new' || (mode === 'edit' && round)) {
        const editing = mode === 'edit';
        const formName = editing ? round.name : `Đợt thu quỹ ${rounds.length + 1}`;
        const formAmount = editing ? round.amount : (rounds.length > 0 ? rounds[rounds.length - 1].amount : 0);
        const formDate = editing ? round.date : today;
        html += `
          <div class="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">Tên đợt thu</label>
              <input type="text" data-fm-field="name" autocomplete="off" value="${escapeAttr(formName)}" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:outline-none">
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="min-w-0">
                <label class="block text-[11px] font-semibold text-slate-500 mb-1">Mỗi người nộp (đ)</label>
                <input type="text" inputmode="numeric" data-fm-field="amount" autocomplete="off" value="${formAmount ? formatMoney(formAmount) : ''}" placeholder="200.000" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-indigo-600 focus:outline-none">
              </div>
              <div class="min-w-0">
                <label class="block text-[11px] font-semibold text-slate-500 mb-1">Ngày thu</label>
                <input type="date" data-fm-field="date" value="${escapeAttr(formDate)}" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-medium text-slate-900 focus:border-indigo-600 focus:outline-none">
              </div>
            </div>
            <p data-fm-err class="hidden text-[11px] text-rose-600"></p>
            <div class="flex items-center gap-2">
              <button type="button" data-fm-action="save-round" class="flex-1 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold transition cursor-pointer">${editing ? 'Lưu đợt' : 'Tạo đợt thu'}</button>
              ${rounds.length > 0 ? '<button type="button" data-fm-action="cancel-round" class="px-3.5 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">Hủy</button>' : ''}
            </div>
          </div>`;
      } else if (round) {
        // Khách mời / người không đóng quỹ không hiện trong danh sách thu (trừ khi họ đã nộp)
        const exempt = ledgerState.fundExempt;
        const roster = members.filter(m => !exempt.includes(m) || fundMgrDeposit(round.id, m));
        const paidRows = roster.map(m => fundMgrDeposit(round.id, m)).filter(Boolean);
        const paidSum = paidRows.reduce((s, d) => s + d.amount, 0);
        const percent = roster.length > 0 ? Math.round((paidRows.length / roster.length) * 100) : 0;
        const wk = getWeekdayInfo(round.date);

        const rows = roster.map(m => {
          const dep = fundMgrDeposit(round.id, m);
          const safe = escapeAttr(m);
          if (dep) {
            // Người này đóng quỹ nhiều hơn khoản của đợt này (nhập ở tab Nộp quỹ...): ghi rõ tổng để khỏi thắc mắc.
            // Tiền bù phần quỹ chi vượt không phải tiền đóng quỹ nên không cộng vào đây.
            const totalIn = ledgerState.expenses
              .filter(e => e.isFundDeposit && e.payer === m && e.recipient === FUND_NAME)
              .reduce((sum, e) => sum + e.amount, 0);
            const extra = totalIn !== dep.amount
              ? `<span class="block text-[10px] text-slate-400">Tổng đã đóng quỹ ${formatMoney(totalIn)} đ (xem Lịch sử nộp quỹ bên dưới)</span>`
              : '';
            return `
              <div class="py-2.5 flex items-center gap-2.5">
                <button type="button" data-fm-action="untick" data-name="${safe}" aria-label="Bỏ ghi ${safe} đã nộp quỹ" title="Đã nộp, bấm để bỏ ghi" class="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shadow-2xs shrink-0 cursor-pointer">✓</button>
                <span class="flex-1 min-w-0"><span class="block truncate text-sm font-semibold text-slate-900">${safe}</span>${extra}</span>
                <span class="font-mono font-bold text-sm text-emerald-700 shrink-0">${formatMoney(dep.amount)} đ</span>
              </div>`;
          }
          const amt = fundMgrAmounts[m] !== undefined ? fundMgrAmounts[m] : round.amount;
          return `
            <div class="py-2.5 flex items-center gap-2.5">
              <button type="button" data-fm-action="tick" data-name="${safe}" aria-label="Ghi ${safe} đã nộp quỹ" title="Bấm khi ${safe} đã chuyển tiền" class="w-7 h-7 rounded-full border-2 border-slate-300 hover:border-emerald-500 shrink-0 transition cursor-pointer"></button>
              <span class="w-20 shrink-0 truncate text-sm font-semibold text-slate-800" title="${safe}">${safe}</span>
              <input type="text" inputmode="numeric" autocomplete="off" data-fm-amount data-name="${safe}" value="${amt ? formatMoney(amt) : ''}" aria-label="Số tiền ${safe} nộp" class="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono text-slate-900 focus:border-indigo-600 focus:outline-none transition">
            </div>`;
        }).join('');

        html += `
          <div class="mt-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="text-sm font-bold text-slate-900 truncate">${escapeAttr(round.name)}</div>
                <div class="text-[11px] text-slate-500">${formatMoney(round.amount)} đ/người · ${wk.shortName ? wk.shortName + ' ' : ''}${formatDateDisplay(round.date)}</div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" data-fm-action="round-qr" class="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer" title="Xem mã VietQR nộp quỹ đợt này">
                  <span>📷</span> <span>Mã QR</span>
                </button>
                <button type="button" data-fm-action="edit-round" class="text-[11px] font-semibold text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded-lg transition cursor-pointer">Sửa</button>
                <button type="button" data-fm-action="delete-round" class="text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition cursor-pointer">Xóa đợt</button>
              </div>
            </div>
            <div class="mt-2 flex items-center justify-between text-xs">
              <span class="font-semibold text-slate-600">Đã thu ${paidRows.length}/${roster.length} người</span>
              <span class="font-mono font-bold text-emerald-700">${formatMoney(paidSum)} đ</span>
            </div>
            <div class="h-1.5 w-full bg-slate-200/80 rounded-full overflow-hidden mt-1.5"><div class="h-full bg-emerald-500 rounded-full transition-all duration-300" style="width: ${percent}%;"></div></div>
            ${members.length === 0
              ? '<p class="mt-3 text-xs text-slate-400">Chưa có thành viên nào. Thêm người ở "Quản lý thành viên & STK".</p>'
              : `<div class="divide-y divide-slate-100 mt-1">${rows}</div>
                 <p class="mt-1 text-[11px] text-slate-400 leading-relaxed">Số tiền từng người sửa được trước khi tick. Bỏ tick là xóa khoản nộp đó khỏi sổ.</p>
                 <div class="mt-3">
                   <div class="text-[11px] font-semibold text-slate-600 mb-1">Khách mời / không đóng quỹ</div>
                   <div class="flex flex-wrap gap-1.5">${members.map(m => `<button type="button" data-fm-action="toggle-exempt" data-name="${escapeAttr(m)}" class="${exempt.includes(m) ? 'px-3 py-1 rounded-full text-xs font-semibold border border-amber-300 bg-amber-100 text-amber-900 transition cursor-pointer' : 'px-3 py-1 rounded-full text-xs font-semibold border border-transparent bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer'}">${escapeAttr(m)}</button>`).join('')}</div>
                   <p class="mt-1 text-[10px] text-slate-400 leading-relaxed">Bấm tên người không phải đóng quỹ (khách mời...). Họ không hiện trong danh sách thu và không tính vào "Đã thu x/y người", vẫn chia tiền các khoản chung như thường.</p>
                 </div>`}
          </div>`;
      }
      html += '</div>';

      // ===== Lịch sử nộp quỹ: chỉ tiền đóng quỹ (đợt thu, tab Nộp quỹ, phần đợt thu nộp khi chốt nợ) =====
      // Tiền bù phần quỹ chi vượt là trả nợ nên không ghi ở đây, xem ở tab Chốt nợ
      const intoFund = ledgerState.expenses.filter(e => e.isFundDeposit && e.recipient === FUND_NAME && e.payer !== EXTERNAL_NAME).slice().reverse();
      if (intoFund.length > 0) {
        const sourceOf = (e) => {
          if (e.roundId) {
            const r = rounds.find(x => x.id === e.roundId);
            if (!r) return 'đợt thu đã xóa';
            return e.settleId ? `${r.name} (nộp khi chốt nợ)` : r.name;
          }
          return 'nhập ở tab Nộp quỹ';
        };
        const entryRow = (e) => `
                <div class="py-2 flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-xs font-semibold text-slate-800 truncate">${escapeAttr(e.payer)} <span class="font-normal text-slate-400">· ${escapeAttr(sourceOf(e))}</span></div>
                    <div class="text-[10px] text-slate-400">${formatDateDisplay(e.date)}</div>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span class="font-mono font-bold text-xs text-emerald-700">${formatMoney(e.amount)} đ</span>
                    <button type="button" data-fm-action="del-entry" data-id="${escapeAttr(e.id)}" class="text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition cursor-pointer" title="Xóa khoản này khỏi sổ">Hoàn tác</button>
                  </div>
                </div>`;
        const intoTotal = intoFund.reduce((sum, e) => sum + e.amount, 0);
        html += `
          <details data-fm-history class="mt-5 rounded-2xl border border-slate-200" ${fundMgrHistoryOpen ? 'open' : ''}>
            <summary class="px-3.5 py-2.5 text-xs font-bold text-slate-700 cursor-pointer select-none">Lịch sử nộp quỹ (${intoFund.length}) · <span class="font-mono">${formatMoney(intoTotal)} đ</span></summary>
            <div class="px-3.5 pb-2 divide-y divide-slate-100">${intoFund.map(entryRow).join('')}</div>
          </details>`;
      }

      // ===== Tiền tài trợ / nguồn ngoài =====
      const sponsorEntries = ledgerState.expenses.filter(e => e.isFundDeposit && e.payer === EXTERNAL_NAME).slice().reverse();
      html += `
        <div class="mt-6 pt-4 border-t border-slate-100">
          <div class="text-sm font-bold text-slate-900">Tiền tài trợ / nguồn ngoài</div>
          <p class="text-[11px] text-slate-500 leading-relaxed mb-2">Tiền không phải của thành viên nào (tài trợ, ủng hộ). Quỹ dùng tiền này trước, và phần đó không tính vào phần các bạn phải chịu.</p>
          <div class="grid grid-cols-2 gap-2">
            <input type="text" data-fm-sponsor="name" autocomplete="off" placeholder="Tên nguồn (tùy chọn)" class="min-w-0 bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none">
            <input type="text" inputmode="numeric" data-fm-sponsor="amount" autocomplete="off" placeholder="Số tiền" class="min-w-0 bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-indigo-600 focus:outline-none">
          </div>
          <div class="flex items-center gap-2 mt-2">
            <input type="date" data-fm-sponsor="date" value="${escapeAttr(today)}" class="flex-1 min-w-0 bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-medium text-slate-900 focus:border-indigo-600 focus:outline-none">
            <button type="button" data-fm-action="add-sponsor" class="shrink-0 px-4 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold transition cursor-pointer">Thêm tài trợ</button>
          </div>
          <p data-fm-sponsor-err class="hidden mt-1.5 text-[11px] text-rose-600"></p>
          ${sponsorEntries.length === 0 ? '' : `
            <div class="mt-3 divide-y divide-slate-100">
              ${sponsorEntries.map(e => `
                <div class="py-2 flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-xs font-semibold text-slate-800 truncate">${escapeAttr(e.name)}</div>
                    <div class="text-[10px] text-slate-400">${formatDateDisplay(e.date)}</div>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span class="font-mono font-bold text-xs text-indigo-800">${formatMoney(e.amount)} đ</span>
                    <button type="button" data-fm-action="del-sponsor" data-id="${escapeAttr(e.id)}" class="text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition cursor-pointer" title="Xóa khoản tài trợ này khỏi sổ">Hoàn tác</button>
                  </div>
                </div>`).join('')}
            </div>`}
        </div>`;

      section.innerHTML = html;
      fundManagerBody.appendChild(section);

      fundManagerBody.querySelectorAll('[data-fm-sponsor]').forEach(el => {
        if (keepSponsor[el.dataset.fmSponsor] !== undefined && el.dataset.fmSponsor !== 'date') el.value = keepSponsor[el.dataset.fmSponsor];
        else if (keepSponsor[el.dataset.fmSponsor] && el.dataset.fmSponsor === 'date') el.value = keepSponsor[el.dataset.fmSponsor];
      });
      const historyDetails = fundManagerBody.querySelector('[data-fm-history]');
      if (historyDetails) historyDetails.addEventListener('toggle', () => { fundMgrHistoryOpen = historyDetails.open; });
      fundManagerBody.scrollTop = keepScroll;
    }

    window.openFundManager = function() {
      fundMgrMode = '';
      fundMgrAmounts = {};
      renderFundManager();
      if (modalFundManager) modalFundManager.classList.remove('hidden');
    };

    function closeFundManager() {
      if (modalFundManager) modalFundManager.classList.add('hidden');
    }

    function fundMgrSetError(selector, text) {
      const el = fundManagerBody.querySelector(selector);
      if (!el) return;
      el.textContent = text || '';
      el.classList.toggle('hidden', !text);
    }

    if (fundManagerBody) {
      fundManagerBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-fm-action]');
        if (!btn || !fundManagerBody.contains(btn)) return;
        const action = btn.dataset.fmAction;
        const name = btn.dataset.name;
        const round = ledgerState.fundRounds.find(r => r.id === fundMgrRoundId) || null;

        if (action === 'pick-round') {
          fundMgrRoundId = btn.dataset.id;
          fundMgrMode = '';
          fundMgrAmounts = {};
          renderFundManager();
        } else if (action === 'new-round') {
          fundMgrMode = 'new';
          renderFundManager();
        } else if (action === 'edit-round') {
          fundMgrMode = 'edit';
          renderFundManager();
        } else if (action === 'cancel-round') {
          fundMgrMode = '';
          renderFundManager();
        } else if (action === 'save-round') {
          const field = (k) => fundManagerBody.querySelector(`[data-fm-field="${k}"]`);
          const roundName = (field('name').value || '').trim() || `Đợt thu quỹ ${ledgerState.fundRounds.length + 1}`;
          const amount = fundMgrParseMoney(field('amount').value);
          const date = field('date').value;
          if (amount <= 0) { fundMgrSetError('[data-fm-err]', 'Nhập số tiền mỗi người nộp.'); field('amount').focus(); return; }
          if (!date) { fundMgrSetError('[data-fm-err]', 'Chọn ngày thu.'); field('date').focus(); return; }
          if (fundMgrMode === 'edit' && round) {
            round.name = roundName;
            round.amount = amount;
            round.date = date;
          } else {
            const created = { id: fundMgrNewId('round'), name: roundName, amount: amount, date: date };
            ledgerState.fundRounds.push(created);
            fundMgrRoundId = created.id;
          }
          fundMgrMode = '';
          fundMgrAmounts = {};
          saveLedger();
          renderFundManager();
          showToast('Đã lưu đợt thu quỹ. Tick từng người khi họ đã chuyển tiền.', '🏦');
        } else if (action === 'delete-round' && round) {
          const paid = ledgerState.expenses.filter(x => x.isFundDeposit && x.roundId === round.id).length;
          const msg = paid > 0
            ? `Xóa đợt "${round.name}"?\n\n${paid} khoản đã nộp trong đợt này vẫn được giữ trong sổ (xóa riêng ở tab Lịch sử nếu cần).`
            : `Xóa đợt "${round.name}"?`;
          if (!confirm(msg)) return;
          ledgerState.fundRounds = ledgerState.fundRounds.filter(r => r.id !== round.id);
          fundMgrRoundId = '';
          saveLedger();
          renderFundManager();
        } else if (action === 'tick' && round) {
          const row = btn.closest('div');
          const input = row ? row.querySelector('[data-fm-amount]') : null;
          const amount = input ? fundMgrParseMoney(input.value) : round.amount;
          if (amount <= 0) {
            showToast(`Nhập số tiền ${name} đã nộp trước khi tick.`, '⚠️');
            if (input) input.focus();
            return;
          }
          if (fundMgrDeposit(round.id, name)) return;
          fundMgrPushDeposit(name, amount, round.date, '', round.id);
          delete fundMgrAmounts[name];
          renderApp();
          renderFundManager();
          showToast(`Đã ghi ${name} nộp quỹ ${formatMoney(amount)} đ.`, '🏦');
        } else if (action === 'untick' && round) {
          const dep = fundMgrDeposit(round.id, name);
          if (!dep) return;
          if (!confirm(`Bỏ ghi ${name} đã nộp quỹ ${formatMoney(dep.amount)} đ?\n\nKhoản này sẽ bị xóa khỏi sổ.`)) return;
          ledgerState.expenses = ledgerState.expenses.filter(x => x.id !== dep.id);
          renderApp();
          renderFundManager();
          showToast(`Đã bỏ ghi khoản nộp quỹ của ${name}.`, '↩️');
        } else if (action === 'round-qr' || action === 'qr') {
          const bank = memberBanks[FUND_NAME];
          if (!bank || !bank.accountNo) {
            showToast('Chưa cài STK thủ quỹ. Bấm "Cài STK" ở trên để có mã QR.', '⚠️');
            return;
          }
          const row = btn.closest('div');
          const input = row ? row.querySelector('[data-fm-amount]') : null;
          const targetAmount = input ? fundMgrParseMoney(input.value) : (round ? round.amount : 0);
          openQrModal(FUND_NAME, name || '', targetAmount);
        } else if (action === 'toggle-exempt') {
          const at = ledgerState.fundExempt.indexOf(name);
          if (at >= 0) ledgerState.fundExempt.splice(at, 1); else ledgerState.fundExempt.push(name);
          saveLedger();
          renderFundManager();
        } else if (action === 'del-entry') {
          const entry = ledgerState.expenses.find(x => x.id === btn.dataset.id);
          if (!entry) return;
          if (!confirm(`Hoàn tác khoản "${entry.payer} nộp quỹ ${formatMoney(entry.amount)} đ"?\n\nKhoản này sẽ bị xóa khỏi sổ.`)) return;
          ledgerState.expenses = ledgerState.expenses.filter(x => x.id !== entry.id);
          renderApp();
          renderFundManager();
        } else if (action === 'set-bank') {
          closeFundManager();
          openMembersModal();
          editingBankMember = FUND_NAME;
          renderMembersManageList();
        } else if (action === 'add-sponsor') {
          const field = (k) => fundManagerBody.querySelector(`[data-fm-sponsor="${k}"]`);
          const amount = fundMgrParseMoney(field('amount').value);
          const date = field('date').value;
          const note = (field('name').value || '').trim();
          if (amount <= 0) { fundMgrSetError('[data-fm-sponsor-err]', 'Nhập số tiền tài trợ.'); field('amount').focus(); return; }
          if (!date) { fundMgrSetError('[data-fm-sponsor-err]', 'Chọn ngày nhận tiền.'); field('date').focus(); return; }
          fundMgrPushDeposit(EXTERNAL_NAME, amount, date, note, '');
          field('amount').value = '';
          field('name').value = '';
          renderApp();
          renderFundManager();
          showToast(`Đã ghi tiền tài trợ ${formatMoney(amount)} đ vào quỹ.`, '🏦');
        } else if (action === 'del-sponsor') {
          const entry = ledgerState.expenses.find(x => x.id === btn.dataset.id);
          if (!entry) return;
          if (!confirm(`Hoàn tác khoản tài trợ "${entry.name}" (${formatMoney(entry.amount)} đ)?`)) return;
          ledgerState.expenses = ledgerState.expenses.filter(x => x.id !== entry.id);
          renderApp();
          renderFundManager();
        }
      });

      // Ô số tiền chỉ nhận chữ số, hiện dấu chấm ngăn cách nghìn
      fundManagerBody.addEventListener('input', (e) => {
        const el = e.target;
        if (!el.matches('[data-fm-amount], [data-fm-field="amount"], [data-fm-sponsor="amount"]')) return;
        const n = fundMgrParseMoney(el.value);
        el.value = n ? n.toLocaleString('vi-VN') : '';
        if (el.matches('[data-fm-amount]')) fundMgrAmounts[el.dataset.name] = n;
      });
    }

    const btnCloseFundManager = document.getElementById('btnCloseFundManager');
    if (btnCloseFundManager) btnCloseFundManager.addEventListener('click', closeFundManager);
    const btnDoneFundManager = document.getElementById('btnDoneFundManager');
    if (btnDoneFundManager) btnDoneFundManager.addEventListener('click', closeFundManager);

    // 7. KHỞI TẠO SỔ MỚI & NẠP DỮ LIỆU MẪU (GÓP Ý 4)
    // btnNewLedger replaced by unified btnReset in top header

    // 7.1. CHỐT KỲ & SANG KỲ MỚI (KẾT CHUYỂN NỢ TỒN - GIẢI PHÁP GỌN BẢNG - Góp ý 4)
    const modalArchive = document.getElementById('modalArchivePeriod');
    const summaryArchive = document.getElementById('archiveModalPeriodSummary');
    const inputNewTitle = document.getElementById('inputNewPeriodTitle');

    window.openArchiveModal = function() {
      const calc = calculateLedger();
      if (calc.expenseBreakdowns.length === 0) {
        showToast('Sổ hiện tại đang trống, chưa có khoản chi nào để chốt kỳ!', '⚠️');
        return;
      }

      let summaryHtml = `
        <div class="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1.5">
          <div class="flex justify-between font-bold text-slate-700">
            <span>Kỳ hiện tại:</span>
            <span class="text-slate-900">${ledgerState.title}</span>
          </div>
          <div class="flex justify-between font-bold text-slate-700">
            <span>Tổng tiền chi tiêu:</span>
            <span class="text-purple-800 font-mono">${formatMoney(calc.grandTotal)} đ</span>
          </div>
          <div class="flex justify-between font-bold text-slate-700">
            <span>Số khoản phát sinh:</span>
            <span>${calc.expenseBreakdowns.filter(e => !e.isPayment && !e.isCarryOver).length} bữa ăn (${countLockingPayments(calc.expenseBreakdowns)} lượt trả${calc.fundActive ? `, ${calc.expenseBreakdowns.filter(e => e.isFundDeposit).length} lượt nộp quỹ` : ''})</span>
          </div>
        </div>
      `;

      // Sổ dùng quỹ: mang sang theo từng cặp thành viên - quỹ (carryPairs), kể cả số quỹ đang giữ hộ. Sổ không quỹ thì carryPairs chính là transfers.
      if (calc.carryPairs.length === 0) {
        summaryHtml += `
          <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-emerald-900 font-semibold space-y-1">
            <div class="font-extrabold text-xs flex items-center gap-1">Tất cả đã sạch nợ (0 đ)!</div>
            <p class="text-[11px] text-emerald-700">Toàn bộ thành viên đã cân bằng công nợ. Kỳ mới sẽ bắt đầu hoàn toàn sạch sẽ không mang nợ cũ.</p>
          </div>
        `;
      } else {
        const carryLabel = (t) => `${carryPairLabel(t.from, t.to)}:`;
        let transfersListHtml = calc.carryPairs.map(t => `
          <div class="flex items-center justify-between text-xs py-1 border-b border-amber-100 last:border-none">
            <span class="font-bold text-slate-800">${carryLabel(t)}</span>
            <span class="font-mono font-black text-rose-700">${formatMoney(t.amount)} đ</span>
          </div>
        `).join('');

        summaryHtml += `
          <div class="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-amber-950 space-y-1.5">
            <div class="font-extrabold text-xs flex items-center gap-1 text-amber-900">
              Còn ${calc.carryPairs.length} khoản ${calc.fundActive ? 'sẽ mang sang kỳ mới' : 'nợ tồn chưa thanh toán'}:
            </div>
            <div class="space-y-0.5 max-h-32 overflow-y-auto">
              ${transfersListHtml}
            </div>
            <p class="text-[10.5px] text-amber-800 italic pt-1">
              Các khoản này sẽ được tự động gom thành <strong>1 dòng kết chuyển nợ tồn</strong> mở đầu kỳ mới. Những bạn đã sạch nợ (0đ) sẽ không bị ghi nợ.
            </p>
          </div>
        `;
      }

      summaryArchive.innerHTML = summaryHtml;

      // Đề xuất tên kỳ mới tự động
      const nextMonth = (new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2);
      const nextYear = (nextMonth === 1 ? new Date().getFullYear() + 1 : new Date().getFullYear());
      inputNewTitle.value = ledgerState.title ? `${ledgerState.title} (Kỳ mới)` : "Sổ Chi Tiêu Nhóm (Kỳ mới)";

      modalArchive.classList.remove('hidden');
    };

    window.closeArchiveModal = function() {
      if (modalArchive) modalArchive.classList.add('hidden');
    };

    const btnCloseArchiveEl = document.getElementById('btnCloseArchiveModal');
    if (btnCloseArchiveEl) btnCloseArchiveEl.addEventListener('click', window.closeArchiveModal);

    const btnCancelArchiveEl = document.getElementById('btnCancelArchiveModal');
    if (btnCancelArchiveEl) btnCancelArchiveEl.addEventListener('click', window.closeArchiveModal);

    document.getElementById('btnConfirmArchivePeriod').addEventListener('click', () => {
      const calc = calculateLedger();
      const newTitle = inputNewTitle.value.trim() || (ledgerState.title ? `${ledgerState.title} (Kỳ mới)` : "Sổ Chi Tiêu Nhóm (Kỳ mới)");

      // 1. Lưu kỳ cũ vào Archive Storage
      const archiveItem = {
        id: 'archive-' + Date.now(),
        closedAt: new Date().toISOString(),
        title: ledgerState.title,
        grandTotal: calc.grandTotal,
        totalSettled: calc.totalSettled,
        members: [...ledgerState.members],
        expenses: JSON.parse(JSON.stringify(ledgerState.expenses)),
        transfers: calc.carryPairs
      };

      try {
        const archives = JSON.parse(appStorage.getItem(STORAGE_ARCHIVES_KEY) || '[]');
        archives.unshift(archiveItem);
        appStorage.setItem(STORAGE_ARCHIVES_KEY, JSON.stringify(archives));
      } catch (e) {
        console.warn('Cannot save archive', e);
      }

      // 2. Kết chuyển nợ tồn sang kỳ mới
      const newExpenses = [];
      const todayStr = getLocalDateString();
      if (calc.carryPairs.length > 0) {
        calc.carryPairs.forEach((t, i) => {
          newExpenses.push({
            id: 'rollover-' + Date.now() + '-' + i,
            isCarryOver: true,
            date: todayStr,
            name: `Nợ tồn kỳ trước (${t.from} nợ ${t.to})`,
            amount: t.amount,
            payer: t.to,
            participants: [t.from]
          });
        });
      }

      // 3. Cập nhật state kỳ mới
      ledgerState.title = newTitle;
      document.getElementById('ledgerTitle').value = ledgerState.title;
      ledgerState.expenses = newExpenses;
      ledgerState.fundRefund = false; // kỳ mới: quỹ lại mặc định giữ tiền, chưa hoàn
      ledgerState.fundRounds = [];    // các đợt thu quỹ của kỳ cũ không mang sang
      window.closeArchiveModal();
      renderApp();
      showToast(`🚀 Đã chốt kỳ cũ và khởi tạo ${newTitle} thành công!`, '🎉');
    });

    window.loadDemoData = function() {
      ledgerState.title = "Sổ Chi Tiêu Nhóm";
      document.getElementById('ledgerTitle').value = ledgerState.title;
      ledgerState.members = [...DEMO_MEMBERS];
      ledgerState.expenses = JSON.parse(JSON.stringify(DEMO_EXPENSES));
      ledgerState.fundRounds = [];
      Object.assign(memberBanks, DEMO_BANKS);
      renderApp();
      showToast('Đã nạp lại dữ liệu mẫu (5 thành viên & 6 khoản chi)!', '🪄');
    };

    // 8. POPUP VIETQR CHUẨN XÁC TỪNG NGƯỜI NHẬN
    let currentQrRecipient = '';
    let currentQrAmount = 0;
    let currentQrFrom = '';

    // Cập nhật tiêu đề / số tiền hiển thị theo QR đang mở (QR nhóm hoặc QR một người chuyển)
    function updateQrAmountTexts() {
      const isGroup = currentQrFrom === 'nhóm';
      document.getElementById('qrModalTitle').textContent = currentQrAmount > 0
        ? `Chuyển ${formatMoney(currentQrAmount)} đ`
        : (isGroup ? `QR nhận tiền của ${currentQrRecipient}` : 'Quét mã chuyển tiền');
      document.getElementById('qrModalSubtitle').textContent = isGroup
        ? `Mỗi người chuyển đúng số của mình cho ${currentQrRecipient}`
        : `${currentQrFrom} ➔ Chuyển cho ${currentQrRecipient}`;
      document.getElementById('qrAmountDisplay').textContent = currentQrAmount > 0
        ? `${formatMoney(currentQrAmount)} đ`
        : 'Tự nhập khi chuyển';
    }

    // QR nhóm: liệt kê từng người đang nợ người nhận, chạm để gắn đúng số tiền của người đó vào mã
    function renderQrPersonChips(to) {
      const wrap = document.getElementById('qrPersonAmountsWrap');
      const box = document.getElementById('qrPersonAmounts');
      box.innerHTML = '';
      const rows = calculateLedger().transfers.filter(t => t.to === to);
      wrap.classList.toggle('hidden', rows.length === 0);
      rows.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.amount = String(t.amount);
        btn.textContent = `${t.from} · ${formatMoney(t.amount)} đ`;
        const paint = () => {
          const on = currentQrAmount === t.amount;
          btn.className = 'px-2.5 py-1 rounded-full border text-[11px] font-bold transition cursor-pointer ' +
            (on ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-purple-400');
        };
        btn.addEventListener('click', () => {
          currentQrAmount = currentQrAmount === t.amount ? 0 : t.amount;
          Array.from(box.children).forEach(b => b._paint && b._paint());
          updateQrAmountTexts();
          renderVietQrCode();
        });
        btn._paint = paint;
        paint();
        box.appendChild(btn);
      });
    }

    window.openQrModal = function(to, from, amount) {
      currentQrRecipient = to;
      currentQrFrom = from;
      // QR nhóm (from === 'nhóm') không gắn số tiền: tổng cả nhóm không phải số mỗi người phải chuyển
      currentQrAmount = from === 'nhóm' ? 0 : (amount > 0 ? amount : 0);

      updateQrAmountTexts();
      document.getElementById('qrRecipientName').textContent = to;
      if (from === 'nhóm') {
        renderQrPersonChips(to);
      } else {
        document.getElementById('qrPersonAmountsWrap').classList.add('hidden');
      }

      // Lấy thông tin STK của người nhận
      const bankInfo = memberBanks[to] || { bankBin: "970422", bankCode: "MBBank", accountNo: "0988123456", accountName: to.toUpperCase() };
      
      const qrBankSelect = document.getElementById('qrBankSelect');
      qrBankSelect.value = bankInfo.bankBin || "970422";
      document.getElementById('qrAccountNoInput').value = bankInfo.accountNo || "";

      renderVietQrCode();
      document.getElementById('modalQrCode').classList.remove('hidden');
    };

    function renderVietQrCode() {
      const bankBin = document.getElementById('qrBankSelect').value;
      const accountNo = document.getElementById('qrAccountNoInput').value.trim();
      const accountName = (memberBanks[currentQrRecipient] && memberBanks[currentQrRecipient].accountName) || currentQrRecipient;
      const memo = `Chot so ${currentQrRecipient}`;

      const momoHint = document.getElementById('qrMomoHint');
      momoHint.textContent = MOMO_STK_HINT;
      momoHint.classList.toggle('hidden', bankBin !== MOMO_BIN);

      if (accountNo) {
        const amountParam = currentQrAmount > 0 ? `amount=${currentQrAmount}&` : '';
        const qrUrl = `https://img.vietqr.io/image/${bankBin}-${accountNo}-compact.png?${amountParam}addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;
        document.getElementById('qrModalImage').src = qrUrl;
      } else {
        document.getElementById('qrModalImage').src = qrTextPlaceholder('Vui lòng nhập STK');
      }
    }

    // Tự động cập nhật QR khi người dùng gõ STK hoặc đổi ngân hàng
    document.getElementById('qrBankSelect').addEventListener('change', renderVietQrCode);
    document.getElementById('qrAccountNoInput').addEventListener('input', renderVietQrCode);

    // Lưu thông tin ngân hàng cho người nhận
    document.getElementById('btnSaveQrBankInfo').addEventListener('click', () => {
      const bankBin = document.getElementById('qrBankSelect').value;
      const selectEl = document.getElementById('qrBankSelect');
      const bankCode = selectEl.options[selectEl.selectedIndex].getAttribute('data-code');
      const accountNo = document.getElementById('qrAccountNoInput').value.trim();

      if (!accountNo) {
        showToast('Vui lòng nhập số tài khoản!', '⚠️');
        return;
      }

      memberBanks[currentQrRecipient] = {
        bankBin: bankBin,
        bankCode: bankCode,
        accountNo: accountNo,
        accountName: currentQrRecipient.toUpperCase()
      };
      saveLedger();

      showToast(`Đã lưu STK cho ${currentQrRecipient}! Lần sau quét QR sẽ tự động dùng số này.`, '🏦');
      renderVietQrCode();
    });

    document.getElementById('btnCloseQrModal').addEventListener('click', () => {
      document.getElementById('modalQrCode').classList.add('hidden');
    });

    // Lắng nghe sự kiện sửa tiêu đề sổ quỹ
    document.getElementById('ledgerTitle').addEventListener('input', (e) => {
      ledgerState.title = e.target.value.trim() || 'Sổ Chi Tiêu Nhóm';
      saveLedger();
    });

    function initLedger() {
      const hasSaved = loadSavedLedger();
      if (!hasSaved || !ledgerState.expenses || ledgerState.expenses.length === 0) {
        ledgerState.title = "Sổ Chi Tiêu Nhóm";
        ledgerState.members = [...DEMO_MEMBERS];
        ledgerState.expenses = JSON.parse(JSON.stringify(DEMO_EXPENSES));
      ledgerState.fundRounds = [];
        Object.assign(memberBanks, DEMO_BANKS);
        ledgerState.hideSettled = false;
        ledgerState.hidePayments = false;
      }

      const titleInput = document.getElementById('ledgerTitle');
      if (titleInput) titleInput.value = ledgerState.title;
      if (toggleHideSettled) toggleHideSettled.checked = !!ledgerState.hideSettled;
      if (toggleHideSettledMobile) toggleHideSettledMobile.checked = !!ledgerState.hideSettled;
      if (toggleHidePayments) toggleHidePayments.checked = !!ledgerState.hidePayments;
      if (toggleHidePaymentsMobile) toggleHidePaymentsMobile.checked = !!ledgerState.hidePayments;

      renderApp();
    }
  


