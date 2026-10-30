    // Sổ Quỹ: chuyển tab, tab Chốt nợ, tab Lịch sử (thẻ/bảng), tab Thành viên, sao chép dạng chữ
    // ==================== TABS & MOCKUP INTERACTIONS ====================
    let currentLedgerTab = appStorage.getItem('chiabill_ledger_active_tab') || 'settlement';
    let currentExpenseSubView = appStorage.getItem('chiabill_expense_sub_view') || 'cards';

    window.switchLedgerTab = function(tab) {
      currentLedgerTab = tab;
      appStorage.setItem('chiabill_ledger_active_tab', tab);
      
      const tabSettlement = document.getElementById('tabNavSettlement');
      const tabExpenses = document.getElementById('tabNavExpenses');
      const tabMembers = document.getElementById('tabNavMembers');
      const panelSettlement = document.getElementById('tabPanelSettlement');
      const panelExpenses = document.getElementById('tabPanelExpenses');
      const panelMembers = document.getElementById('tabPanelMembers');

      const activeClass = "flex-1 py-2 px-2.5 rounded-xl transition-all text-center cursor-pointer bg-white text-slate-900 shadow-2xs font-bold";
      const inactiveClass = "flex-1 py-2 px-2.5 rounded-xl transition-all text-center cursor-pointer text-slate-500 hover:text-slate-900 font-medium";

      if (tabSettlement) tabSettlement.className = tab === 'settlement' ? activeClass : inactiveClass;
      if (tabExpenses) tabExpenses.className = tab === 'expenses' ? activeClass : inactiveClass;
      if (tabMembers) tabMembers.className = tab === 'members' ? activeClass : inactiveClass;

      if (panelSettlement) panelSettlement.classList.toggle('hidden', tab !== 'settlement');
      if (panelExpenses) panelExpenses.classList.toggle('hidden', tab !== 'expenses');
      if (panelMembers) panelMembers.classList.toggle('hidden', tab !== 'members');
    };

    window.switchExpenseSubView = function(view) {
      currentExpenseSubView = view;
      appStorage.setItem('chiabill_expense_sub_view', view);

      const btnCards = document.getElementById('btnSubViewCards');
      const btnTable = document.getElementById('btnSubViewTable');
      const viewCards = document.getElementById('expensesCardsView');
      const viewTable = document.getElementById('expensesTableView');

      if (view === 'cards') {
        if (btnCards) btnCards.className = "px-2.5 py-1 rounded-lg bg-white text-slate-900 shadow-2xs font-bold transition flex items-center gap-1 cursor-pointer";
        if (btnTable) btnTable.className = "px-2.5 py-1 rounded-lg text-slate-500 hover:text-slate-900 transition flex items-center gap-1 cursor-pointer";
        if (viewCards) viewCards.classList.remove('hidden');
        if (viewTable) viewTable.classList.add('hidden');
      } else {
        if (btnTable) btnTable.className = "px-2.5 py-1 rounded-lg bg-white text-slate-900 shadow-2xs font-bold transition flex items-center gap-1 cursor-pointer";
        if (btnCards) btnCards.className = "px-2.5 py-1 rounded-lg text-slate-500 hover:text-slate-900 transition flex items-center gap-1 cursor-pointer";
        if (viewTable) viewTable.classList.remove('hidden');
        if (viewCards) viewCards.classList.add('hidden');
      }
    };

    window.toggleLedgerMenu = function() {
      const menu = document.getElementById('dropdownLedgerMenu');
      if (menu) menu.classList.toggle('hidden');
    };

    window.closeLedgerMenu = function() {
      const menu = document.getElementById('dropdownLedgerMenu');
      if (menu) menu.classList.add('hidden');
    };

    window.promptEditLedgerTitle = function() {
      const current = ledgerState.title || 'Sổ chi tiêu nhóm';
      const newTitle = prompt('Nhập tên sổ chi tiêu:', current);
      if (newTitle !== null) {
        ledgerState.title = newTitle.trim() || 'Sổ chi tiêu nhóm';
        saveLedger();
        renderApp();
      }
    };

    window.toggleExpenseFilterMenu = function() {
      const popover = document.getElementById('popoverExpenseFilter');
      if (popover) popover.classList.toggle('hidden');
    };

    window.handleFilterChange = function() {
      const chkPaid = document.getElementById('chkFilterHidePaid');
      const chkZero = document.getElementById('chkFilterHideZero');
      if (chkPaid) ledgerState.hidePayments = chkPaid.checked;
      if (chkZero) ledgerState.hideSettled = chkZero.checked;
      saveLedger();
      renderApp();
    };

    // Đóng dropdown khi bấm ra ngoài
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('dropdownLedgerMenu');
      const btnMenu = document.getElementById('btnLedgerMoreMenu');
      if (menu && !menu.classList.contains('hidden') && btnMenu && !btnMenu.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.add('hidden');
      }
      const filterPop = document.getElementById('popoverExpenseFilter');
      const btnFilter = document.getElementById('btnToggleExpenseFilter');
      if (filterPop && !filterPop.classList.contains('hidden') && btnFilter && !btnFilter.contains(e.target) && !filterPop.contains(e.target)) {
        filterPop.classList.add('hidden');
      }
    });

    function getLedgerDateRangeDisplay(expenses) {
      if (!expenses || expenses.length === 0) return 'Chưa có khoản chi';
      const dates = expenses.map(e => e.date).filter(Boolean).sort();
      if (dates.length === 0) return 'Tháng 10/2026';
      const first = new Date(dates[0]);
      const last = new Date(dates[dates.length - 1]);
      const fDay = first.getDate();
      const fMonth = first.getMonth() + 1;
      const lDay = last.getDate();
      const lMonth = last.getMonth() + 1;
      if (fDay === lDay && fMonth === lMonth) {
        return `${fDay}/${fMonth}`;
      }
      if (fMonth === lMonth) {
        return `${fDay}–${lDay}/${fMonth}`;
      }
      return `${fDay}/${fMonth} – ${lDay}/${lMonth}`;
    }

    function formatCompactK(num) {
      if (num === 0 || num === '0') return '—';
      const absVal = Math.abs(num);
      let formatted = '';
      if (absVal % 1000 === 0) {
        formatted = `${absVal / 1000}k`;
      } else {
        formatted = `${(absVal / 1000).toFixed(1).replace('.0', '')}k`;
      }
      if (num > 0) return formatted;
      return `-${formatted}`;
    }

    // Bấm vòng tròn tick ở tab Chốt nợ:
    //  - dòng chưa trả: mở bước xác nhận (ngày + ghi chú), rồi ghi giao dịch trả nợ thật để công nợ bù trừ ngay
    //  - dòng đã trả: hoàn tác giao dịch đó (có hộp xác nhận), khoản nợ quay lại danh sách cần chuyển
    (function bindSettlementClicks() {
      const container = document.getElementById('settlementCardsContainer');
      if (!container) return;
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-settle-action]');
        if (!btn || !container.contains(btn)) return;
        if (btn.dataset.settleAction === 'pay') {
          openConfirmPaymentModal(btn.dataset.from, btn.dataset.to, parseInt(btn.dataset.amount, 10) || 0);
        } else if (btn.dataset.settleAction === 'undo') {
          undoPayment(btn.dataset.id);
        }
      });
    })();

    // ==================== RENDER TAB 1: CHỐT NỢ (Mockup 2 & 6) ====================
    // Diễn giải số dư của một người theo từng khoản: ứng tiền + nộp quỹ ... - phần của mình
    // Cách tính số dư hiển thị. Sổ có quỹ dùng các phần tính sẵn trong splitFundAndPeer (balanceTerms).
    function fundFormulaText(stat) {
      const terms = (stat.balanceTerms || [
        ['ứng tiền', stat.expensePaid || 0],
        ['đã chuyển / nhận', (stat.settlementPaid || 0) - (stat.settlementReceived || 0)],
        ['nợ tồn', stat.carryNet || 0],
        ['phần của mình', -(stat.expenseConsumed || 0)]
      ]).filter(t => Math.round(t[1]) !== 0);
      return terms.map((t, i) => {
        const neg = t[1] < 0;
        return `${i === 0 ? (neg ? '− ' : '') : (neg ? ' − ' : ' + ')}${t[0]} ${formatMoney(Math.round(Math.abs(t[1])))}`;
      }).join('');
    }

    // Thẻ "Quỹ chung": tiền vào, tiền quỹ đã chi, còn / thiếu bao nhiêu.
    // Ở tab Chốt nợ có thêm công tắc trả lại tiền quỹ chưa dùng (tắt thì tiền nộp quỹ cứ để yên trong quỹ).
    function buildFundCard(calc, withRefund, noManage) {
      const s = getFundSummary(calc);
      const refundOn = Boolean(ledgerState.fundRefund);
      const card = document.createElement('div');
      card.className = "rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3.5 space-y-2.5 lg:col-span-2";

      const inDetail = s.sponsored > 0
        ? ` <span class="text-indigo-900/60">(thành viên đóng ${formatMoney(s.received - s.sponsored - s.topUp)} + tài trợ ${formatMoney(s.sponsored)})</span>`
        : '';
      const row = (label, value, valueClass) => `
        <div class="flex items-baseline justify-between gap-3">
          <span>${label}</span>
          <span class="font-mono font-semibold shrink-0 ${valueClass || 'text-indigo-900'}">${value}</span>
        </div>`;

      let html = `
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-indigo-900">Quỹ chung</span>
              ${noManage ? '' : '<button type="button" onclick="openFundManager()" class="px-2 py-0.5 rounded-full border border-indigo-200 bg-white text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 transition cursor-pointer" title="Thu quỹ theo đợt, tick ai đã nộp, tiền tài trợ">Quản lý</button>'}
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-mono font-bold text-sm ${s.cash < 0 ? 'text-rose-600' : 'text-indigo-900'}">${formatMoney(s.cash)} đ</div>
            <div class="text-[11px] text-indigo-900/70">${s.cash < 0 ? 'đang thiếu' : 'đang còn'}</div>
          </div>
        </div>
        <div class="space-y-0.5 text-[11px] text-indigo-900/80 leading-relaxed">
          ${row(`Tiền đóng quỹ${inDetail}`, `${formatMoney(s.received - s.topUp)} đ`)}
          ${row('Quỹ đã chi cho các khoản chung', `${formatMoney(s.spent)} đ`)}
          ${s.topUp > 0 ? row('Các bạn đã bù phần quỹ chi vượt', `${formatMoney(s.topUp)} đ`) : ''}
          ${s.refunded > 0 ? row('Quỹ đã hoàn lại cho các bạn', `${formatMoney(s.refunded)} đ`) : ''}
          ${s.sponsorLeft > 0 ? row('Tiền tài trợ chưa dùng', `${formatMoney(s.sponsorLeft)} đ`) : ''}
        </div>
        ${s.cash < 0 ? `<p class="text-[11px] leading-relaxed text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5">Quỹ đã chi nhiều hơn số tiền đang có ${formatMoney(-s.cash)} đ. Phần thiếu này nằm trong số các bạn cần nộp vào quỹ.</p>` : ''}`;

      if (withRefund) {
        if (calc.fundHeld.length > 0 || refundOn) {
          html += `
            <div class="flex items-center justify-between gap-3 pt-2 border-t border-indigo-100">
              <div class="min-w-0">
                <div class="text-xs font-semibold text-indigo-900">Trả lại tiền quỹ chưa dùng</div>
                <div class="text-[11px] text-indigo-900/60 leading-relaxed">Tắt thì tiền nộp quỹ cứ để yên trong quỹ. Bật khi muốn trả lại (ví dụ lúc giải tán quỹ): mỗi người thành một dòng ở trên để tick khi đã chuyển.</div>
              </div>
              <button type="button" role="switch" aria-checked="${refundOn}" aria-label="Trả lại tiền quỹ chưa dùng" onclick="setFundRefund(${!refundOn})" class="relative w-10 h-6 rounded-full shrink-0 transition cursor-pointer ${refundOn ? 'bg-indigo-600' : 'bg-slate-300'}">
                <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${refundOn ? 'translate-x-4' : ''}"></span>
              </button>
            </div>`;
        }
      }
      card.innerHTML = html;
      return card;
    }

    function renderSettlementTab(calc) {
      const container = document.getElementById('settlementCardsContainer');
      const counterEl = document.getElementById('settlementPaidCounter');
      const progressBar = document.getElementById('settlementProgressBar');
      if (!container) return;
      container.innerHTML = '';

      // Sổ dùng quỹ: mọi khoản đi qua quỹ, nói rõ ngay dưới tiêu đề để khỏi rối
      const settlementHint = document.getElementById('settlementHint');
      if (settlementHint) {
        settlementHint.textContent = calc.fundActive
          ? 'Ai nợ người đã ứng tiền thì chuyển thẳng cho người đó; ai còn thiếu với quỹ thì nộp vào quỹ. Chạm vòng tròn khi đã chuyển.'
          : 'Chạm vào vòng tròn khi người đó đã chuyển tiền.';
      }

      if (calc.expenseBreakdowns.length === 0) {
        container.innerHTML = `
          <div class="p-6 bg-white rounded-2xl border border-slate-200 text-center space-y-2 lg:col-span-2">
            <p class="text-xs font-semibold text-slate-600">Chưa có khoản chi nào để tính toán chốt nợ.</p>
            <button onclick="document.getElementById('btnDockAddExpense').click()" class="px-3.5 py-1.5 bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer">
              + Ghi khoản chi đầu tiên
            </button>
          </div>
        `;
        if (counterEl) counterEl.textContent = '0/0 đã trả';
        if (progressBar) progressBar.style.width = '0%';
        return;
      }

      // Giao dịch trả nợ đã ghi nhận (isPayment) vẫn hiện ở đây dưới dạng dòng đã trả
      // Tiền nộp quỹ ban đầu là gửi tiền chứ không phải trả nợ nên không xuất hiện ở đây (chỉ ở Lịch sử)
      // Một lượt trả ở Chốt nợ có thể tách thành nộp đợt thu + trả phần nợ quỹ (cùng settleId): gộp lại thành một dòng
      const paymentRows = [];
      const settleRows = {};
      calc.expenseBreakdowns.filter(e => e.isPayment && (!e.isFundDeposit || e.settleId)).forEach(e => {
        if (!e.settleId) { paymentRows.push(e); return; }
        const depositPart = e.isFundDeposit ? e.amount : 0;
        if (settleRows[e.settleId]) {
          settleRows[e.settleId].amount += e.amount;
          settleRows[e.settleId].depositPart += depositPart;
          return;
        }
        settleRows[e.settleId] = { ...e, depositPart };
        paymentRows.push(settleRows[e.settleId]);
      });

      if (calc.transfers.length === 0 && paymentRows.length === 0) {
        container.innerHTML = `
          <div class="p-6 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-1 lg:col-span-2">
            <div class="text-sm font-bold text-emerald-900">Chi tiêu đã cân bằng hoàn hảo!</div>
            <p class="text-xs text-emerald-700">${calc.fundActive ? 'Không ai cần chuyển thêm cho ai hay nộp thêm vào quỹ.' : 'Mọi người đã chia đều tiền, không ai nợ ai.'}</p>
          </div>
        `;
        if (calc.fundActive) container.appendChild(buildFundCard(calc, true));
        if (counterEl) counterEl.textContent = '0/0 đã trả';
        if (progressBar) progressBar.style.width = '100%';
        return;
      }

      // Gom theo người nhận: các khoản còn phải chuyển (tính từ số dư) + các giao dịch trả nợ đã ghi nhận
      const recipientGroups = {};
      let totalTransfersCount = 0;
      let totalPaidCount = 0;

      const ensureGroup = (name) => {
        if (!recipientGroups[name]) {
          recipientGroups[name] = {
            recipient: name,
            totalAmount: 0,
            remainingAmount: 0,
            items: []
          };
        }
        return recipientGroups[name];
      };

      calc.transfers.forEach((t) => {
        totalTransfersCount++;
        const group = ensureGroup(t.to);
        group.totalAmount += t.amount;
        group.remainingAmount += t.amount;
        group.items.push({ ...t, isPaid: false });
      });

      paymentRows.forEach((p) => {
        const recipient = p.recipient || (Array.isArray(p.participants) ? p.participants[0] : '');
        if (!recipient) return;
        totalTransfersCount++;
        totalPaidCount++;
        const group = ensureGroup(recipient);
        group.totalAmount += p.amount;
        group.items.push({ from: p.payer, to: recipient, amount: p.amount, isPaid: true, paymentId: p.id, date: p.date, note: p.name, depositPart: p.depositPart || 0 });
      });

      // Vì sao phải chuyển số tiền này. Nộp quỹ: phần đóng các đợt thu chưa nộp + phần bù khi quỹ chi vượt số đang có.
      function transferReason(item) {
        const money = v => `${formatMoney(Math.round(v))} đ`;
        if (item.to === FUND_NAME) {
          const stat = calc.memberStats[item.from] || {};
          const pledge = item.isPaid ? item.depositPart : Math.min(item.amount, Math.round(stat.fundUnpaid || 0));
          const rest = item.amount - pledge;
          const roundNames = (ledgerState.fundRounds || [])
            .filter(r => item.isPaid || !ledgerState.expenses.some(e => e.isFundDeposit && e.payer === item.from && e.roundId === r.id))
            .map(r => escapeAttr(r.name));
          const parts = [];
          if (pledge > 0) parts.push(`${money(pledge)} đóng quỹ${!item.isPaid && roundNames.length ? ' ' + roundNames.join(', ') : ''}`);
          if (rest > 0) parts.push(`${money(rest)} bù phần quỹ chi vượt`);
          if (parts.length === 1) return pledge > 0 ? `Tiền đóng quỹ${!item.isPaid && roundNames.length ? ' ' + roundNames.join(', ') : ''}` : 'Bù phần quỹ chi vượt (quỹ không đủ tiền trả các khoản chung)';
          return parts.join(' + ');
        }
        if (item.from === FUND_NAME) return 'Quỹ trả lại tiền chưa dùng';
        return `Trả phần ${escapeAttr(item.to)} đã ứng`;
      }

      // Trong mỗi người nhận: dòng chưa trả lên trước, dòng đã trả xuống sau
      Object.values(recipientGroups).forEach((g) => {
        g.items.sort((a, b) => Number(a.isPaid) - Number(b.isPaid));
      });

      // Update counter and progress bar
      if (counterEl) counterEl.textContent = `${totalPaidCount}/${totalTransfersCount} đã trả`;
      if (progressBar) {
        const percent = totalTransfersCount > 0 ? Math.round((totalPaidCount / totalTransfersCount) * 100) : 0;
        progressBar.style.width = `${percent}%`;
      }

      // Render Recipient Cards (Mockup 2 & Mockup 6)
      // Màn rộng chia 2 cột; chỉ có một người nhận thì thẻ trải hết chiều ngang, không lệch sang trái
      const recipientCount = Object.keys(recipientGroups).length;
      Object.values(recipientGroups).forEach((group) => {
        const card = document.createElement('div');
        card.className = "bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 space-y-2.5" + (recipientCount === 1 ? " lg:col-span-2" : "");

        const initialLetter = group.recipient.charAt(0).toUpperCase();
        const unpaidItems = group.items.filter(item => !item.isPaid);
        const allPaid = unpaidItems.length === 0;

        let subtitleHtml = '';
        if (allPaid) {
          subtitleHtml = `<span class="text-xs text-emerald-600 font-semibold">Đã nhận đủ</span>`;
        } else if (unpaidItems.length < group.items.length) {
          subtitleHtml = `<span class="text-xs text-slate-500">còn <strong class="text-slate-800 font-mono">${formatMoney(group.remainingAmount)} đ</strong> từ ${unpaidItems.length} người</span>`;
        } else {
          subtitleHtml = `<span class="text-xs text-slate-500">từ ${group.items.length} người</span>`;
        }

        // Header
        const headerHtml = `
          <div class="flex items-center justify-between gap-2.5">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center justify-center shrink-0">
                ${initialLetter}
              </span>
              <div class="min-w-0">
                <div class="font-bold text-slate-900 text-sm truncate">
                  ${group.recipient === FUND_NAME ? 'Nộp vào Quỹ chung' : `${group.recipient} nhận`} ${formatMoney(group.totalAmount)} đ
                </div>
                <div>${subtitleHtml}</div>
              </div>
            </div>

            <button type="button" onclick="openQrModal('${group.recipient}', 'nhóm', 0)" class="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-full border border-slate-200 shadow-2xs flex items-center gap-1 shrink-0 transition cursor-pointer">
              <span>Quét QR</span>
            </button>
          </div>
        `;

        // Sub-rows
        let rowsHtml = '<div class="divide-y divide-slate-100 pt-1">';
        group.items.forEach((item) => {
          const debtorInitial = item.from.charAt(0).toUpperCase();
          const nameClass = item.isPaid ? "line-through text-slate-400 font-normal text-xs sm:text-sm" : "font-semibold text-slate-800 text-xs sm:text-sm";
          const amountClass = item.isPaid ? "line-through text-slate-400 font-mono text-xs sm:text-sm" : "font-bold text-slate-900 font-mono text-xs sm:text-sm";
          const checkBtnHtml = item.isPaid
            ? `<button type="button" data-settle-action="undo" data-id="${escapeAttr(item.paymentId)}" class="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold transition shadow-2xs cursor-pointer" title="Đã trả (bấm để hoàn tác giao dịch)">✓</button>`
            : `<button type="button" data-settle-action="pay" data-from="${escapeAttr(item.from)}" data-to="${escapeAttr(item.to)}" data-amount="${item.amount}" class="w-6 h-6 rounded-full border-2 border-slate-300 hover:border-slate-400 flex items-center justify-center transition cursor-pointer" title="Xác nhận đã chuyển tiền"></button>`;

          // Dòng đã trả: hiện ngày chuyển và ghi chú (nếu người dùng có sửa ghi chú mặc định). Kèm lý do của số tiền (chữ mờ).
          const defaultNote = defaultPaymentNote(item.from, item.to);
          const reason = transferReason(item);
          const paidMetaHtml = item.isPaid
            ? `<div class="text-[10px] text-slate-400 font-normal truncate">${formatDateDisplay(item.date)}${item.note && item.note !== defaultNote ? ' · ' + escapeAttr(item.note) : ''}${reason ? ' · ' + reason : ''}</div>`
            : (reason ? `<div class="text-[10px] text-slate-400 font-normal leading-snug">${reason}</div>` : '');

          rowsHtml += `
            <div class="py-2.5 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                  ${debtorInitial}
                </span>
                <div class="min-w-0">
                  <span class="${nameClass} truncate block">${item.from}</span>
                  ${paidMetaHtml}
                </div>
              </div>

              <div class="flex items-center gap-3 shrink-0">
                <span class="${amountClass}">${formatMoney(item.amount)} đ</span>
                ${checkBtnHtml}
              </div>
            </div>
          `;
        });
        rowsHtml += '</div>';

        card.innerHTML = headerHtml + rowsHtml;
        container.appendChild(card);
      });

      // Mọi khoản nợ đã được bù trừ xong
      if (calc.transfers.length === 0) {
        const doneEl = document.createElement('div');
        doneEl.className = "p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-0.5 lg:col-span-2";
        doneEl.innerHTML = `
          <div class="text-sm font-bold text-emerald-900">Cả nhóm đã tất toán!</div>
          <p class="text-xs text-emerald-700">${calc.fundActive ? 'Không còn ai cần chuyển thêm hay nộp thêm vào quỹ.' : 'Không còn ai nợ ai.'} Bạn có thể đóng kỳ ở menu ⋯ để sang kỳ mới.</p>
        `;
        container.appendChild(doneEl);
      }

      if (calc.fundActive) container.appendChild(buildFundCard(calc, true));
    }

    // ==================== RENDER TAB 2: KHOẢN CHI (Mockup 3 & 5) ====================
    // Thẻ "Nợ tồn kỳ trước": gom mọi khoản nợ mang sang từ kỳ trước, thu gọn sẵn
    let carryCardOpen = false;
    function buildCarryOverCard(rows) {
      const total = rows.reduce((s, r) => s + r.amount, 0);
      const card = document.createElement('details');
      if (carryCardOpen) card.open = true;
      card.className = "rounded-2xl border border-amber-200 bg-amber-50/60";
      card.innerHTML = `
        <summary class="px-3.5 py-2.5 cursor-pointer select-none flex items-center justify-between gap-3">
          <span class="min-w-0">
            <span class="block text-xs font-bold text-amber-900">Nợ tồn kỳ trước</span>
            <span class="block text-[11px] text-amber-800/70">${rows.length} khoản mang sang, chưa tính vào tổng chi</span>
          </span>
          <span class="font-mono font-bold text-xs text-amber-900 shrink-0">${formatMoney(total)} đ</span>
        </summary>
        <div class="px-3.5 pb-2.5 divide-y divide-amber-100">
          ${rows.map(r => `
            <div class="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span class="text-amber-950 truncate">${escapeAttr(carryPairLabel((r.participants || [])[0] || '', r.payer))}</span>
              <span class="font-mono font-semibold text-amber-900 shrink-0">${formatMoney(r.amount)} đ</span>
            </div>`).join('')}
        </div>`;
      card.addEventListener('toggle', () => { carryCardOpen = card.open; });
      return card;
    }

    // Dòng lượt trả nợ gọn nhẹ: nhỏ hơn thẻ khoản chi, nền xanh nhạt, không có avatar hay chân thẻ
    function buildPaymentSlimRow(exp) {
      const recipient = exp.recipient || (exp.participants || [])[0] || '';
      const note = exp.name && exp.name !== defaultPaymentNote(exp.payer, recipient) ? exp.name : '';
      const row = document.createElement('div');
      row.className = "flex items-center justify-between gap-3 rounded-xl bg-emerald-50/60 border border-emerald-100 px-3 py-2";
      row.innerHTML = `
        <div class="min-w-0">
          <div class="text-xs font-semibold text-emerald-900 truncate">${escapeAttr(exp.payer)} ➔ ${escapeAttr(recipient)} <span class="font-normal text-emerald-700/70">· ${paymentKindLabel(exp)}</span></div>
          ${note ? `<div class="text-[10px] text-emerald-700/70 truncate">${escapeAttr(note)}</div>` : ''}
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="font-mono font-bold text-xs text-emerald-800">${formatMoney(exp.amount)} đ</span>
          <button type="button" onclick="undoPayment('${exp.id}')" class="text-[11px] font-semibold text-emerald-700/80 hover:text-emerald-900 hover:bg-emerald-100 px-2 py-1 rounded-lg transition cursor-pointer" title="Hoàn tác giao dịch trả nợ này">Hoàn tác</button>
        </div>`;
      return row;
    }

    function renderExpensesCards(calc) {
      const container = document.getElementById('expensesCardsView');
      if (!container) return;
      container.innerHTML = '';

      const expensesToRender = ledgerState.hidePayments
        ? calc.expenseBreakdowns.filter(e => !e.isPayment)
        : calc.expenseBreakdowns;

      if (expensesToRender.length === 0) {
        container.innerHTML = `
          <div class="p-6 bg-white rounded-2xl border border-slate-200 text-center space-y-2">
            <p class="text-xs font-semibold text-slate-500">Chưa có khoản chi nào trong kỳ này.</p>
            <button onclick="document.getElementById('btnDockAddExpense').click()" class="px-3.5 py-1.5 bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer">
              + Thêm khoản chi đầu tiên
            </button>
          </div>
        `;
        return;
      }

      // Số lượt trả nợ đang khóa việc xóa khoản chi
      const paymentCount = countLockingPayments(ledgerState.expenses);

      // Nợ tồn kỳ trước gom thành một thẻ riêng, không xen vào danh sách khoản chi
      const carryRows = expensesToRender.filter(e => e.isCarryOver);

      // Group by date (newest first)
      const dateGroups = {};
      expensesToRender.filter(e => !e.isCarryOver).forEach(exp => {
        const dateKey = exp.date;
        if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
        dateGroups[dateKey].push(exp);
      });

      const sortedDates = Object.keys(dateGroups).sort((a, b) => new Date(b) - new Date(a));

      // Hướng dẫn chỉnh sửa khoản chi
      const ruleHint = document.createElement('div');
      ruleHint.className = "text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 leading-relaxed";
      ruleHint.textContent = 'Chạm vào khoản chi hoặc bấm "Sửa" để chỉnh sửa tên, số tiền, người trả và người chia.';
      container.appendChild(ruleHint);

      if (carryRows.length > 0) {
        container.appendChild(buildCarryOverCard(carryRows));
        if (Object.keys(dateGroups).length === 0) {
          const none = document.createElement('div');
          none.className = "text-xs text-slate-400 text-center py-3";
          none.textContent = 'Kỳ mới chưa có khoản chi nào.';
          container.appendChild(none);
        }
      }

      sortedDates.forEach(dateKey => {
        const exps = dateGroups[dateKey];
        const weekday = exps[0].weekdayInfo?.fullName || 'Ngày';
        const dateLabel = `${weekday}, ${formatDateDisplay(dateKey)}`;

        const groupDiv = document.createElement('div');
        groupDiv.className = "space-y-1.5";

        const labelEl = document.createElement('div');
        labelEl.className = "text-xs font-semibold text-slate-500 pt-2 px-1";
        labelEl.textContent = dateLabel;
        groupDiv.appendChild(labelEl);

        // Màn rộng: thẻ khoản chi trong ngày chia 2 cột, lượt trả nợ cũng 2 cột ở khối riêng bên dưới
        const cardsWrap = document.createElement('div');
        cardsWrap.className = "space-y-1.5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-2";
        const paymentsWrap = document.createElement('div');
        paymentsWrap.className = "space-y-1.5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-2";

        // Trong một ngày: khoản chi lên trước, lượt trả nợ xuống sau và gọn nhẹ hơn để lịch sử tập trung vào các khoản chi
        exps.slice().sort((a, b) => Number(Boolean(a.isPayment)) - Number(Boolean(b.isPayment))).forEach(exp => {
          if (exp.isPayment) {
            paymentsWrap.appendChild(buildPaymentSlimRow(exp));
            return;
          }
          const card = document.createElement('div');
          card.className = "bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs space-y-2 hover:border-slate-300 transition cursor-pointer";
          card.onclick = (e) => {
            if (!e.target.closest('button')) openEditExpenseModal(exp.id);
          };

          const participantCount = exp.participants ? exp.participants.length : 0;
          const share = exp.sharePerPerson || Math.round(exp.amount / (participantCount || 1));
          const payRecipient = exp.recipient || (exp.participants || [])[0] || '';
          // "Chia đều" so với số người thật của nhóm (không tính quỹ)
          const peopleCount = calc.allMembers.filter(m => !isPseudoMember(m)).length;
          const fixedCount = exp.fixedPeople ? exp.fixedPeople.length : 0;
          const subsidyText = exp.subsidy > 0 ? ` (tài trợ ${formatMoney(exp.subsidy)} đ)` : '';
          const payerText = exp.payer === FUND_NAME
            ? `Quỹ chung trả${subsidyText}`
            : (exp.fundPart > 0
              ? `${exp.payer} trả ${formatMoney(exp.payerPart)} đ, quỹ trả ${formatMoney(exp.fundPart)} đ${subsidyText}`
              : `${exp.payer} trả`);
          const splitText = fixedCount > 0
            ? `chia ${participantCount} người, ${fixedCount} người cố định`
            : (participantCount === peopleCount ? `chia đều ${participantCount} người` : `chia ${participantCount} người`);
          const subText = exp.isPayment
            ? `${exp.payer} ➔ ${payRecipient} · trả nợ bù trừ`
            : `${payerText} · ${splitText}`;

          const avatarNames = exp.isPayment
            ? [exp.payer, payRecipient].filter(Boolean)
            : (exp.participants || []);
          const avatarsHtml = avatarNames.map(p => {
            const initial = p.charAt(0).toUpperCase();
            // Người có phần cố định: avatar màu hổ phách, rê chuột / chạm giữ để xem số tiền
            const isFixed = Array.isArray(exp.fixedPeople) && exp.fixedPeople.includes(p);
            const tone = isFixed ? 'bg-amber-100 text-amber-800' : 'bg-indigo-50 text-indigo-700';
            const tip = isFixed ? `${p} · cố định ${formatMoney(exp.rowShares[p] || 0)} đ` : p;
            return `<span class="w-6 h-6 rounded-full ${tone} font-bold text-xs inline-flex items-center justify-center mr-1" title="${tip}">${initial}</span>`;
          }).join('');

          // Nút thao tác: Sửa luôn khả dụng; Xóa / Hoàn tác
          const editBtnHtml = `<button type="button" onclick="openEditExpenseModal('${exp.id}')" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg transition cursor-pointer" title="Sửa khoản chi này">Sửa</button>`;
          let actionBtnHtml;
          if (exp.isPayment) {
            actionBtnHtml = `${editBtnHtml} <button type="button" onclick="undoPayment('${exp.id}')" class="text-xs font-semibold text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg transition cursor-pointer" title="Hoàn tác giao dịch trả nợ này">Hoàn tác</button>`;
          } else if (paymentCount > 0) {
            actionBtnHtml = `${editBtnHtml} <button type="button" onclick="deleteExpense('${exp.id}')" class="text-xs font-semibold text-slate-300 px-2 py-1 rounded-lg cursor-help" title="Đã có lượt trả nợ nên không xóa được (vẫn sửa được)">Đã khóa</button>`;
          } else {
            actionBtnHtml = `${editBtnHtml} <button type="button" onclick="deleteExpense('${exp.id}')" class="text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition cursor-pointer" title="Xóa khoản chi">Xóa</button>`;
          }

          card.innerHTML = `
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-bold text-slate-900 text-sm truncate">${exp.name}</div>
                <div class="text-xs text-slate-500 mt-0.5">${subText}</div>
              </div>
              <div class="flex items-center gap-1 font-mono font-bold text-slate-900 text-sm shrink-0">
                <span>${formatMoney(exp.amount)} đ</span>
                <span class="text-xs text-slate-400">⌄</span>
              </div>
            </div>

            <div class="border-t border-slate-100 pt-2 flex items-center justify-between gap-2">
              <div class="flex items-center flex-wrap min-w-0">
                ${avatarsHtml}
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs font-semibold text-slate-600 font-mono">
                  ${exp.isPayment ? 'Trả nợ bù trừ' : `Phần mỗi người ${formatMoney(share)} đ`}
                </span>
                ${actionBtnHtml}
              </div>
            </div>
          `;
          cardsWrap.appendChild(card);
        });

        if (cardsWrap.children.length) groupDiv.appendChild(cardsWrap);
        if (paymentsWrap.children.length) groupDiv.appendChild(paymentsWrap);
        container.appendChild(groupDiv);
      });
    }

    // Mục "Lượt trả nợ" dưới bảng có đang mở hay không (giữ nguyên khi vẽ lại)
    let matrixPaymentsOpen = false;

    // Danh sách lượt trả nợ nằm riêng dưới bảng, thu gọn sẵn, để bảng chỉ tập trung vào các khoản chi
    function renderMatrixPaymentsList(calc) {
      const box = document.getElementById('matrixPaymentsList');
      if (!box) return;
      const payments = calc.expenseBreakdowns.filter(e => e.isPayment);
      const fundLine = calc.fundActive
        ? `<div class="px-3 py-2 text-xs text-indigo-900 bg-indigo-50/60 font-semibold">${fundCashText(calc.fundCash)} <span class="font-normal text-indigo-900/70">· tiền vào ${formatMoney(getFundSummary(calc).received)} đ · quỹ đã chi ${formatMoney(getFundSummary(calc).spent)} đ</span></div>`
        : '';
      if (payments.length === 0 || ledgerState.hidePayments) {
        box.innerHTML = fundLine;
        return;
      }
      const rows = payments.map(p => {
        const recipient = p.recipient || (p.participants || [])[0] || '';
        const note = p.name && p.name !== defaultPaymentNote(p.payer, recipient) ? ` · ${escapeAttr(p.name)}` : '';
        const kind = paymentKindLabel(p);
        const kindText = kind === 'trả nợ' ? '' : ` · ${kind}`;
        return `
          <div class="flex items-center justify-between gap-3 py-2">
            <div class="min-w-0 text-xs text-slate-700 truncate">
              <span class="text-slate-400">${getWeekdayInfo(p.date).shortName} ${formatDateDisplay(p.date)}</span> · <span class="font-semibold">${escapeAttr(p.payer)} ➔ ${escapeAttr(recipient)}</span><span class="text-slate-400">${kindText}${note}</span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="font-mono font-bold text-xs text-slate-800">${formatMoney(p.amount)} đ</span>
              <button type="button" onclick="undoPayment('${p.id}')" class="text-[11px] font-semibold text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg transition cursor-pointer" title="Hoàn tác giao dịch trả nợ này">Hoàn tác</button>
            </div>
          </div>`;
      }).join('');
      box.innerHTML = fundLine + `
        <details ${matrixPaymentsOpen ? 'open' : ''}>
          <summary class="px-3 py-2.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">${calc.fundActive ? 'Lượt trả nợ và nộp quỹ' : 'Lượt trả nợ'} (${payments.length})</summary>
          <div class="px-3 pb-1.5 divide-y divide-slate-100">${rows}</div>
        </details>`;
      const details = box.querySelector('details');
      if (details) details.addEventListener('toggle', () => { matrixPaymentsOpen = details.open; });
    }

    function renderExpensesTable(calc) {
      const table = document.getElementById('matrixTable');
      if (!table) return;
      table.innerHTML = '';

      // Bảng chỉ có các khoản chi thật; lượt trả nợ không xen vào đây mà nằm ở mục riêng bên dưới
      const expensesToRender = calc.expenseBreakdowns.filter(e => !e.isPayment && !e.isCarryOver);

      // Table Header: Khoản chi + Avatar columns (Mockup 3)
      let headerHtml = `
        <thead>
          <tr class="text-slate-700 font-bold text-xs">
            <th class="p-2 sm:p-2.5 text-left w-[130px] min-w-[130px] border-r border-slate-200 bg-slate-100 sticky left-0 top-0 z-30" style="box-shadow: 2px 0 4px -2px rgba(15,23,42,.15), 0 1px 0 0 #cbd5e1;">
              Khoản chi
            </th>
      `;
      calc.displayMembers.forEach(m => {
        const initial = m.charAt(0).toUpperCase();
        headerHtml += `
          <th class="p-1.5 sm:p-2 text-center min-w-[68px] max-w-[85px] border-r border-slate-100 bg-slate-100 sticky top-0 z-20" style="box-shadow: 0 1px 0 0 #cbd5e1;">
            <div class="flex flex-col items-center justify-center gap-0.5">
              <span class="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] inline-flex items-center justify-center shrink-0">
                ${initial}
              </span>
              <span class="text-[11px] font-bold text-slate-800 leading-tight block truncate max-w-[65px]" title="${escapeAttr(m)}">
                ${escapeAttr(m)}
              </span>
            </div>
          </th>
        `;
      });
      headerHtml += `</tr></thead>`;

      // Table Body
      let bodyHtml = `<tbody class="divide-y divide-slate-100 font-medium text-slate-800 text-xs">`;
      expensesToRender.forEach(exp => {
        const dateStr = formatDateDisplay(exp.date);
        const wkInfo = getWeekdayInfo(exp.date);
        const wkTag = wkInfo.shortName ? `[${wkInfo.shortName}] ` : '';
        const payerSub = exp.payer === FUND_NAME
          ? `quỹ trả ${formatCompactK(exp.amount)}`
          : (exp.fundPart > 0
            ? `${exp.payer} trả ${formatCompactK(exp.payerPart)} + quỹ ${formatCompactK(exp.fundPart)}`
            : `${exp.payer} trả ${formatCompactK(exp.amount)}`);
        const sub = `${wkTag}${dateStr} · ${payerSub}`;

        bodyHtml += `
          <tr class="hover:bg-indigo-50/50 transition cursor-pointer" onclick="openEditExpenseModal('${exp.id}')" title="Bấm để sửa khoản chi">
            <td class="p-2 sm:p-2.5 border-r border-slate-200 bg-white sticky left-0 z-10 shadow-sticky-r">
              <div class="font-bold text-slate-900 truncate max-w-[125px]">${exp.name}</div>
              <div class="text-[10px] text-slate-500 font-medium truncate">${sub}</div>
            </td>
        `;

        calc.displayMembers.forEach(m => {
          const share = exp.rowShares[m] || 0;
          const displayVal = formatCompactK(share);
          // Phần cố định tô nền hổ phách để thấy ngay ai chịu số tiền riêng
          const isFixedCell = Array.isArray(exp.fixedPeople) && exp.fixedPeople.includes(m);
          bodyHtml += `
            <td class="p-2 sm:p-2.5 text-center font-mono ${isFixedCell ? 'text-amber-800 font-bold bg-amber-50' : 'text-slate-700'} border-r border-slate-100">
              ${displayVal}
            </td>
          `;
        });

        bodyHtml += `</tr>`;
      });
      bodyHtml += `</tbody>`;

      // Table Footer: Cần chi / Đã ứng chỉ tính khoản chi thật; lượt trả nợ tách riêng ở hàng "Đã chuyển / nhận" rồi mới ra Số dư
      // Nộp quỹ / quỹ hoàn có hàng riêng ("Đã nộp quỹ"), hàng này chỉ cho các lượt chuyển trực tiếp giữa người với người
      const hasPayments = calc.expenseBreakdowns.some(e => e.isPayment && e.recipient !== FUND_NAME && e.payer !== FUND_NAME);
      let footHtml = `<tfoot class="font-bold text-xs sticky bottom-0 z-20">`;

      // Row 1: Cần chi
      footHtml += `
        <tr>
          <td class="p-2 sm:p-2.5 font-bold text-slate-700 border-r border-slate-200 bg-slate-50 sticky left-0 z-30" style="box-shadow: 2px 0 4px -2px rgba(15,23,42,.15), 0 -1px 0 0 #cbd5e1;">
            Cần chi
          </td>
      `;
      calc.displayMembers.forEach(m => {
        // Ghi dấu − (phần phải chịu) để các hàng bên dưới cộng thẳng ra Số dư
        const spent = calc.memberStats[m] ? calc.memberStats[m].expenseConsumed : 0;
        footHtml += `<td class="p-2 sm:p-2.5 text-center font-mono text-slate-800 border-r border-slate-100 bg-slate-50" style="box-shadow: 0 -1px 0 0 #cbd5e1;">${formatCompactK(-spent)}</td>`;
      });
      footHtml += `</tr>`;

      // Row 2: Đã ứng
      footHtml += `
        <tr>
          <td class="p-2 sm:p-2.5 font-bold text-slate-700 border-r border-slate-200 bg-slate-50 sticky left-0 z-30 shadow-sticky-r">
            Đã ứng
          </td>
      `;
      calc.displayMembers.forEach(m => {
        const paid = calc.memberStats[m] ? calc.memberStats[m].expensePaid : 0;
        footHtml += `<td class="p-2 sm:p-2.5 text-center font-mono text-slate-800 border-r border-slate-100 bg-slate-50">${paid > 0 ? '+' : ''}${formatCompactK(paid)}</td>`;
      });
      footHtml += `</tr>`;

      // Hàng "Nợ tồn kỳ trước" (chỉ khi kỳ này có mang nợ từ kỳ trước): + là được nhận, - là còn nợ
      if (calc.expenseBreakdowns.some(e => e.isCarryOver)) {
        footHtml += `
          <tr>
            <td class="p-2 sm:p-2.5 font-bold text-slate-700 border-r border-slate-200 bg-slate-50 sticky left-0 z-30 shadow-sticky-r">
              Nợ tồn kỳ trước
            </td>
        `;
        calc.displayMembers.forEach(m => {
          const carry = calc.memberStats[m] ? calc.memberStats[m].carryNet : 0;
          footHtml += `<td class="p-2 sm:p-2.5 text-center font-mono text-slate-600 border-r border-slate-100 bg-slate-50">${carry > 0 ? '+' : ''}${formatCompactK(carry)}</td>`;
        });
        footHtml += `</tr>`;
      }

      // Row 3 (chỉ khi đã có lượt trả nợ): Đã chuyển / nhận = số đã chuyển trừ số đã nhận
      if (hasPayments) {
        footHtml += `
          <tr>
            <td class="p-2 sm:p-2.5 font-bold text-slate-700 border-r border-slate-200 bg-slate-50 sticky left-0 z-30 shadow-sticky-r">
              Đã chuyển / nhận
            </td>
        `;
        calc.displayMembers.forEach(m => {
          const s = calc.memberStats[m] || {};
          const net = (s.settlementPaid || 0) - (s.settlementReceived || 0);
          const colorClass = 'text-slate-600'; // chỉ là dòng chảy tiền, không tô xanh/đỏ để khỏi nhầm với Số dư
          footHtml += `<td class="p-2 sm:p-2.5 text-center font-mono ${colorClass} border-r border-slate-100 bg-slate-50">${net > 0 ? '+' : ''}${formatCompactK(net)}</td>`;
        });
        footHtml += `</tr>`;
      }

      // Các hàng quỹ (khi sổ dùng quỹ): Quỹ gánh (+), Chưa đóng quỹ (−), Đã bù quỹ (+). Hàng nào cả cột đều 0 thì ẩn.
      // Cần chi (−) + Đã ứng (+) + Đã chuyển + các hàng quỹ = Số dư.
      if (calc.fundActive) {
        const fundRowOf = (m, key) => {
          const s = calc.memberStats[m] || {};
          if (!s.fundRows) return key === 'covered' ? Math.round(s.fundShown || 0) : 0;
          // Phần lệch do làm tròn dồn vào Quỹ gánh để các hàng cộng lại khớp Số dư
          if (key === 'covered') return Math.round(s.fundShown || 0) - Math.round(s.fundRows.unpaid) - Math.round(s.fundRows.direct);
          return Math.round(s.fundRows[key]);
        };
        [
          ['covered', 'Quỹ gánh', 'Phần quỹ chung trả thay cho mình'],
          ['unpaid', 'Chưa đóng quỹ', 'Tiền các đợt thu quỹ mình chưa nộp'],
          ['direct', 'Đã bù quỹ', 'Đã nộp thêm vào quỹ khi chốt nợ (bù phần quỹ chi vượt)']
        ].forEach(([key, label, hint]) => {
          if (key !== 'covered' && calc.displayMembers.every(m => fundRowOf(m, key) === 0)) return;
          footHtml += `
            <tr>
              <td class="p-2 sm:p-2.5 font-bold text-slate-700 border-r border-slate-200 bg-slate-50 sticky left-0 z-30 shadow-sticky-r" title="${hint}">
                ${label}
              </td>
          `;
          calc.displayMembers.forEach(m => {
            const v = fundRowOf(m, key);
            footHtml += `<td class="p-2 sm:p-2.5 text-center font-mono text-slate-600 border-r border-slate-100 bg-slate-50">${v > 0 ? '+' : ''}${formatCompactK(v)}</td>`;
          });
          footHtml += `</tr>`;
        });
      }

      // Row cuối: Số dư (đã gồm cả lượt trả nợ)
      footHtml += `
        <tr>
          <td class="p-2 sm:p-2.5 font-extrabold text-slate-900 border-r border-slate-200 bg-slate-100 sticky left-0 z-30 shadow-sticky-r">
            Số dư
          </td>
      `;
      calc.displayMembers.forEach(m => {
        const bal = shownBalance(calc.memberStats[m]);
        let colorClass = "text-slate-600";
        let sign = "";
        if (bal > 0) {
          colorClass = "text-emerald-700 font-extrabold";
          sign = "+";
        } else if (bal < 0) {
          colorClass = "text-rose-600 font-extrabold";
        }
        footHtml += `<td class="p-2 sm:p-2.5 text-center font-mono ${colorClass} border-r border-slate-100 bg-slate-100">${sign}${formatCompactK(bal)}</td>`;
      });
      footHtml += `</tr></tfoot>`;

      table.innerHTML = headerHtml + bodyHtml + footHtml;
      renderMatrixPaymentsList(calc);
    }

    // ==================== RENDER TAB: THÀNH VIÊN (số dư từng người) ====================
    // Danh sách hiển thị: thành viên hiện tại + thành viên cũ còn số dư khác 0 (để không sót nợ).
    // Dùng chung cho tab Thành viên, số người ở đầu trang và mức bình quân ở hero.
    function getVisiblePeople(calc) {
      return Array.from(new Set([
        ...ledgerState.members,
        ...calc.allMembers.filter(m => !isPseudoMember(m) && Math.abs(calc.memberStats[m]?.netBalance || 0) >= 1)
      ]));
    }

    function renderMembersTab(calc) {
      const container = document.getElementById('membersBalanceList');
      if (!container) return;
      container.innerHTML = '';

      const people = getVisiblePeople(calc);

      if (people.length === 0) {
        container.innerHTML = `
          <div class="p-6 bg-white rounded-2xl border border-slate-200 text-center space-y-2">
            <p class="text-xs font-semibold text-slate-500">Chưa có thành viên nào.</p>
            <button onclick="openMembersModal()" class="px-3.5 py-1.5 bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer">
              + Thêm thành viên
            </button>
          </div>
        `;
        return;
      }

      // Thanh số dư chia đôi từ vạch giữa: xanh sang phải (được nhận), đỏ sang trái (cần trả)
      let maxBalance = 1;
      people.forEach(m => {
        const b = Math.abs(shownBalance(calc.memberStats[m]));
        if (b > maxBalance) maxBalance = b;
      });

      const list = document.createElement('div');
      list.className = "bg-white rounded-2xl border border-slate-200/90 shadow-2xs px-3.5 divide-y divide-slate-100";

      people.forEach(m => {
        const stat = calc.memberStats[m] || { paidTotal: 0, consumedTotal: 0, netBalance: 0 };
        const bal = shownBalance(stat);
        const half = Math.min(50, Math.max(2, Math.round((Math.abs(bal) / maxBalance) * 50)));

        let avatarBg = "bg-indigo-50 text-indigo-700";
        let amountClass = "text-slate-500";
        let amountText = "0 đ";
        let labelClass = "text-slate-400";
        let labelText = "Cân bằng";
        let barHtml = '';

        if (bal > 0) {
          avatarBg = "bg-emerald-100 text-emerald-800";
          amountClass = "text-emerald-600";
          amountText = `+${formatMoney(bal)} đ`;
          labelClass = "text-emerald-600";
          labelText = balanceLabel(calc, stat);
          barHtml = `<div class="absolute top-0 bottom-0 left-1/2 bg-emerald-500" style="width: ${half}%;"></div>`;
        } else if (bal < 0) {
          amountClass = "text-rose-600";
          amountText = `-${formatMoney(Math.abs(bal))} đ`;
          labelClass = "text-rose-600";
          labelText = balanceLabel(calc, stat);
          barHtml = `<div class="absolute top-0 bottom-0 right-1/2 bg-rose-500" style="width: ${half}%;"></div>`;
        }

        const row = document.createElement('div');
        row.className = "py-3";
        const settleExtra = (stat.settlementPaid ? ` · Đã chuyển ${formatMoney(stat.settlementPaid)} đ` : '') +
                            (stat.settlementReceived ? ` · Đã nhận ${formatMoney(stat.settlementReceived)} đ` : '') +
                            (stat.carryNet ? ` · Nợ tồn ${stat.carryNet > 0 ? 'được nhận' : 'còn nợ'} ${formatMoney(Math.abs(stat.carryNet))} đ` : '') +
                            // Quỹ là tiền chung: ghi phần quỹ gánh cho mình, và số còn phải nộp quỹ nếu có
                            (Math.round(stat.fundCovered || 0) ? ` · Quỹ gánh ${formatMoney(Math.round(stat.fundCovered))} đ` : '') +
                            ((stat.fundBalance || 0) < 0 ? ` · Còn nộp quỹ ${formatMoney(-stat.fundBalance)} đ` : '');
        row.innerHTML = `
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-full ${avatarBg} font-bold text-xs flex items-center justify-center shrink-0">
              ${escapeAttr(m.charAt(0).toUpperCase())}
            </span>
            <div class="min-w-0 flex-1">
              <div class="font-bold text-slate-900 text-sm truncate">${escapeAttr(m)}</div>
              <div class="text-xs text-slate-500">
                Đã ứng ${formatMoney(stat.expensePaid || 0)} đ · Cần chi ${formatMoney(stat.expenseConsumed || 0)} đ${settleExtra}
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="font-mono font-bold text-sm ${amountClass}">${amountText}</div>
              <div class="text-xs font-semibold ${labelClass}">${labelText}</div>
            </div>
            <button type="button" data-name="${escapeAttr(m)}" onclick="openPersonImage('ledger', this.dataset.name)" title="Ảnh riêng của ${escapeAttr(m)} (kèm QR đúng số tiền)" class="shrink-0 px-2.5 py-1.5 rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:text-indigo-700 hover:border-indigo-200 transition cursor-pointer">Ảnh</button>
          </div>
          <div class="relative h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2.5" aria-hidden="true">
            <div class="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300"></div>
            ${barHtml}
          </div>
        `;
        list.appendChild(row);
      });

      if (calc.fundActive) container.appendChild(buildFundCard(calc, false));
      container.appendChild(list);

      // Tổng lệch của cả nhóm (do làm tròn phần chia mỗi người)
      const drift = calc.allMembers.reduce((s, m) => s + (calc.memberStats[m]?.netBalance || 0), 0);
      const note = document.createElement('p');
      note.className = "text-xs text-slate-500";
      note.textContent = `Tổng lệch của nhóm: ${formatMoney(drift)} đ${Math.abs(drift) <= 100 ? ' (cân đối hoàn hảo)' : ''}`;
      container.appendChild(note);
    }

    // ==================== COPY SETTLEMENT SUMMARY (User Point 1 & 3) ====================
    window.copySettlementSummary = function() {
      const calc = calculateLedger();
      const dateRange = getLedgerDateRangeDisplay(ledgerState.expenses);
      const actualExpenses = calc.expenseBreakdowns.filter(e => !e.isPayment && !e.isCarryOver);
      const memberCount = ledgerState.members.length || 1;
      const avgMoney = Math.round(calc.grandTotal / memberCount);

      let text = `${ledgerState.title.toUpperCase()}\n`;
      text += `Thời gian: ${dateRange} | ${memberCount} người | ${actualExpenses.length} khoản chi\n`;
      text += `Tổng chi: ${formatMoney(calc.grandTotal)} đ (Bình quân: ~${formatMoney(avgMoney)} đ/người)\n`;
      if (calc.fundActive) {
        const fsum = getFundSummary(calc);
        const fundIn = fsum.sponsored > 0
          ? `thành viên đóng ${formatMoney(fsum.received - fsum.sponsored - fsum.topUp)} đ, tài trợ ${formatMoney(fsum.sponsored)} đ`
          : `đã đóng ${formatMoney(fsum.received - fsum.topUp)} đ`;
        const topUpText = fsum.topUp > 0 ? `, các bạn bù phần chi vượt ${formatMoney(fsum.topUp)} đ` : '';
        text += `Quỹ chung: ${fsum.cash >= 0 ? 'còn' : 'thiếu'} ${formatMoney(Math.abs(fsum.cash))} đ (${fundIn}, quỹ đã chi ${formatMoney(fsum.spent)} đ${topUpText})\n`;
      }
      text += `\n`;

      text += `CÁC KHOẢN PHÁT SINH:\n`;
      actualExpenses.forEach(e => {
        const dStr = formatDateDisplay(e.date);
        const subsidyNote = e.subsidy > 0 ? ` (tài trợ ${formatMoney(e.subsidy)} đ)` : '';
        const payerNote = e.payer === FUND_NAME
          ? `Quỹ trả${subsidyNote}`
          : (e.fundPart > 0 ? `${e.payer} trả ${formatMoney(e.payerPart)} đ, quỹ trả ${formatMoney(e.fundPart)} đ${subsidyNote}` : `${e.payer} trả`);
        const fixedNote = e.fixedPeople && e.fixedPeople.length > 0
          ? `; cố định: ${e.fixedPeople.map(p => `${p} ${formatMoney(e.rowShares[p] || 0)} đ`).join(', ')}`
          : '';
        text += `- ${dStr}: ${e.name}: ${formatMoney(e.amount)} đ (${payerNote}${fixedNote})\n`;
      });

      const carryRows = calc.expenseBreakdowns.filter(e => e.isCarryOver);
      if (carryRows.length > 0) {
        text += `\nNỢ TỒN KỲ TRƯỚC:\n`;
        carryRows.forEach(c => {
          text += `- ${carryPairLabel((c.participants || [])[0] || '', c.payer)}: ${formatMoney(c.amount)} đ\n`;
        });
      }

      text += `\nDANH SÁCH CHUYỂN KHOẢN:\n`;
      if (calc.transfers.length === 0) {
        text += calc.fundActive ? `Không ai cần chuyển thêm hay nộp thêm vào quỹ.\n` : `Cân đối hoàn hảo, không ai nợ ai!\n`;
      } else {
        calc.transfers.forEach((t, i) => {
          text += `${i + 1}. ${t.to === FUND_NAME ? `${t.from} nộp quỹ` : `${t.from} chuyển cho ${t.to}`}: ${formatMoney(t.amount)} đ\n`;
          const bank = memberBanks[t.to] || {};
          const bankBin = bank.bankBin || "970422";
          const accountNo = bank.accountNo || "";
          const accountName = bank.accountName || t.to.toUpperCase();
          if (accountNo) {
            text += `   STK: ${bank.bankCode || 'Ngân hàng'} ${accountNo} (${accountName})\n`;
            const memo = encodeURIComponent(`${t.from} chuyen ${t.to}`);
            const qrUrl = `https://img.vietqr.io/image/${bankBin}-${accountNo}-compact2.png?amount=${t.amount}&accountName=${encodeURIComponent(accountName)}&addInfo=${memo}`;
            text += `   Mã QR: ${qrUrl}\n`;
          } else {
            text += `   Mã QR: (Chưa cài STK nhận cho ${t.to})\n`;
          }
        });
      }


      const finishCopy = () => {
        showToast('Đã copy danh sách chuyển khoản kèm link QR vào clipboard!', '📋');
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(finishCopy).catch(() => {
          fallbackCopy(text);
        });
      } else {
        fallbackCopy(text);
      }

      function fallbackCopy(str) {
        const ta = document.createElement('textarea');
        ta.value = str;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          finishCopy();
        } catch (err) {
          showToast('Không thể sao chép văn bản!', '⚠️');
        }
        document.body.removeChild(ta);
      }
    };

