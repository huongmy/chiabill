    // Sổ Quỹ: renderApp, popup ghi khoản chi / trả nợ / nộp quỹ, xác nhận trả nợ, toast, quản lý thành viên & STK
    // ==================== MAIN RENDER APP ====================
    function renderApp() {
      saveLedger();
      const calc = calculateLedger();

      // Top title & subtitles
      const titleDisplay = document.getElementById('txtLedgerTitleDisplay');
      if (titleDisplay) titleDisplay.textContent = ledgerState.title || 'Sổ chi tiêu nhóm';

      const dateSub = document.getElementById('statDateRangeSubtitle');
      if (dateSub) dateSub.textContent = getLedgerDateRangeDisplay(calc.expenseBreakdowns);

      const memSub = document.getElementById('statMembersSubtitle');
      if (memSub) memSub.textContent = `${getVisiblePeople(calc).length} người`;

      // Hero Card
      const heroMoney = document.getElementById('heroTotalMoney');
      if (heroMoney) heroMoney.textContent = formatMoney(calc.grandTotal);

      const heroPerPerson = document.getElementById('heroPerPersonMoney');
      if (heroPerPerson) {
        const peopleCount = getVisiblePeople(calc).length;
        const avg = peopleCount > 0 ? Math.round(calc.grandTotal / peopleCount) : 0;
        heroPerPerson.textContent = `Mỗi người ~${formatMoney(avg)} đ`;
      }

      const actualExpCount = calc.expenseBreakdowns.filter(e => !e.isPayment && !e.isCarryOver).length;
      const heroExpCount = document.getElementById('heroExpenseCount');
      if (heroExpCount) heroExpCount.textContent = `${actualExpCount} khoản chi`;

      const heroFundLine = document.getElementById('heroFundLine');
      if (heroFundLine) {
        heroFundLine.classList.toggle('hidden', !calc.fundActive);
        if (calc.fundActive) heroFundLine.textContent = fundCashText(calc.fundCash);
      }
      ensureFundBank(calc);
      updateFundMenu(calc);

      // Render 3 Tabs
      renderSettlementTab(calc);
      renderExpensesCards(calc);
      renderExpensesTable(calc);
      renderMembersTab(calc);

      // Keep tab state
      switchLedgerTab(currentLedgerTab);
      switchExpenseSubView(currentExpenseSubView);
    }

    function syncHideSettled(isChecked) {
      ledgerState.hideSettled = isChecked;
      if (toggleHideSettled) toggleHideSettled.checked = isChecked;
      if (toggleHideSettledMobile) toggleHideSettledMobile.checked = isChecked;
      renderApp();
      if (isChecked) {
        showToast('👁️ Đã ẩn các bạn đã hết nợ (0đ) khỏi bảng chi tiết.');
      }
    }

    if (toggleHideSettled) toggleHideSettled.addEventListener('change', (e) => syncHideSettled(e.target.checked));
    if (toggleHideSettledMobile) toggleHideSettledMobile.addEventListener('change', (e) => syncHideSettled(e.target.checked));

    // Đồng bộ nút 'Ẩn trả nợ' giữa Desktop và Mobile (Góp ý 2)
    const toggleHidePayments = document.getElementById('toggleHidePayments');
    const toggleHidePaymentsMobile = document.getElementById('toggleHidePaymentsMobile');

    window.syncHidePayments = function(isChecked) {
      ledgerState.hidePayments = isChecked;
      if (toggleHidePayments) toggleHidePayments.checked = isChecked;
      if (toggleHidePaymentsMobile) toggleHidePaymentsMobile.checked = isChecked;
      renderApp();
      if (isChecked) {
        showToast('👁️ Đã ẩn các dòng trả nợ (bảng chỉ hiển thị các bữa ăn).', '💸');
      } else {
        showToast('👁️ Đã hiển thị lại đầy đủ các dòng trả nợ bù trừ.', '💸');
      }
    };

    if (toggleHidePayments) toggleHidePayments.addEventListener('change', (e) => syncHidePayments(e.target.checked));
    if (toggleHidePaymentsMobile) toggleHidePaymentsMobile.addEventListener('change', (e) => syncHidePayments(e.target.checked));

    // 5. MODAL GHI KHOẢN MỚI: chỉ thêm, không sửa tại chỗ.
    // Hai tab: "Chi tiêu chung" và "Trả nợ bù trừ". Ghi nhầm thì xóa khoản chi (khi sổ chưa có lượt trả nợ)
    // hoặc hoàn tác giao dịch trả nợ, rồi ghi lại. Cách này giữ số dư luôn khớp với các lượt trả nợ đã ghi.
    const modalAddExpense = document.getElementById('modalAddExpense');
    let modalMode = 'expense'; // 'expense' | 'deposit' | 'payment'
    let currentModalPayer = '';
    let currentModalRecipient = '';
    let currentModalParticipants = [];
    let modalSuggestions = [];
    let modalSplitMode = 'even'; // 'even' | 'fixed'
    let currentModalFixed = {};  // tên -> số tiền cố định (có khóa = người đó đang ở "Cố định")

    // Chip bật/tắt dùng cùng độ đậm chữ và cùng viền, nên bề rộng không đổi khi chọn hay bỏ chọn (tránh nhảy dòng)
    const MODAL_CHIP_ON = "px-3.5 py-1.5 rounded-full text-xs font-semibold border border-transparent bg-indigo-700 text-white transition cursor-pointer";
    const MODAL_CHIP_OFF = "px-3.5 py-1.5 rounded-full text-xs font-semibold border border-transparent bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer";
    const MODAL_TAB_ON = "flex-1 py-2 rounded-lg bg-white text-slate-900 shadow-2xs font-bold transition cursor-pointer";
    const MODAL_TAB_OFF = "flex-1 py-2 rounded-lg text-slate-500 hover:text-slate-900 font-medium transition cursor-pointer";
    const MODAL_ERR_CLASSES = ['border-rose-500', 'ring-2', 'ring-rose-200'];

    function modalAmountValue() {
      const el = document.getElementById('inputExpenseAmount');
      return el ? (parseInt(el.value.replace(/\D/g, ''), 10) || 0) : 0;
    }

    // Thành viên đã dính vào bất kỳ khoản nào (người trả, người chia, hoặc bên trong giao dịch trả nợ)
    function memberHasExpenses(name) {
      return ledgerState.expenses.some(e =>
        e.payer === name || e.recipient === name || (Array.isArray(e.participants) && e.participants.includes(name))
      );
    }

    // Hiện thứ trong tuần của ngày đang chọn, cạnh nhãn "Ngày"
    function updateModalWeekday() {
      const dateInput = document.getElementById('inputDate');
      const badge = document.getElementById('modalWeekday');
      if (!dateInput || !badge) return;
      if (!dateInput.value) {
        badge.className = 'ml-1';
        badge.textContent = '';
        return;
      }
      const info = getWeekdayInfo(dateInput.value);
      badge.className = `ml-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${info.colorClass}`;
      badge.textContent = `${info.fullName} (${info.shortName})`;
    }

    // Ô ghi chú đổi nhãn khi nộp từ nguồn ngoài: đó là nơi nhập tên người / đơn vị tài trợ
    function updateModalNoteField() {
      const label = document.getElementById('labelModalNote');
      const input = document.getElementById('inputPaymentNote');
      const external = modalMode === 'deposit' && currentModalPayer === EXTERNAL_NAME;
      if (label) label.textContent = external ? 'Tên nguồn tài trợ (tùy chọn)' : 'Ghi chú (tùy chọn)';
      if (input) input.placeholder = external ? 'Ví dụ: Công ty ABC tài trợ, quỹ lớp cũ...' : 'Ví dụ: Chuyển khoản MB, tiền mặt...';
    }

    function modalFundPartValue() {
      if (modalMode !== 'expense' || currentModalPayer === FUND_NAME || !isFundOn()) return 0;
      const el = document.getElementById('inputFundAmount');
      return el ? (parseInt(el.value.replace(/\D/g, ''), 10) || 0) : 0;
    }

    function fundCashAfterText(after) {
      return after >= 0 ? `quỹ còn ${formatMoney(after)} đ` : `quỹ thiếu ${formatMoney(-after)} đ`;
    }

    // Hiện / ẩn ô "Quỹ trả một phần" và gợi ý số dư quỹ
    function updateModalFundPart() {
      const section = document.getElementById('modalFundPartSection');
      if (!section) return;
      const show = modalMode === 'expense' && isFundOn() && currentModalPayer !== FUND_NAME;
      section.classList.toggle('hidden', !show);
      const hint = document.getElementById('modalFundHint');
      if (show && hint) {
        const calcNow = calculateLedger();
        const cash = calcNow.fundCash;
        hint.textContent = (cash >= 0 ? `Quỹ đang có ${formatMoney(cash)} đ` : `Quỹ đang thiếu ${formatMoney(-cash)} đ`)
          + (calcNow.sponsorLeft > 0 ? ` (trong đó tài trợ ${formatMoney(calcNow.sponsorLeft)} đ, được dùng trước)` : '')
          + '. Quỹ chỉ trả số bạn nhập, người trả ở trên ứng phần còn lại. Để trống nếu quỹ không chi khoản này.';
      }
    }

    // Tính cách chia theo form: người "Cố định" chịu đúng số đó, số còn lại chia đều cho những người còn lại
    function computeModalSplit(amount) {
      const people = currentModalParticipants;
      const fixedList = modalSplitMode === 'fixed'
        ? ledgerState.members
            .filter(m => people.includes(m) && Object.prototype.hasOwnProperty.call(currentModalFixed, m))
            .map(m => ({ name: m, amount: currentModalFixed[m] || 0 }))
        : [];
      const evenNames = people.filter(p => !fixedList.some(f => f.name === p));
      const fixedSum = fixedList.reduce((s, f) => s + f.amount, 0);
      const rest = amount - fixedSum;
      // Phần quỹ chi hộ bằng tiền tài trợ không tính vào phần các bạn chịu (xem thêm calculateLedger)
      const fundTotal = currentModalPayer === FUND_NAME ? amount : modalFundPartValue();
      const sponsorLeft = (fundTotal > 0 && isFundOn()) ? calculateLedger().sponsorLeft : 0;
      const subsidy = evenNames.length > 0 ? Math.max(0, Math.min(sponsorLeft, fundTotal, rest)) : 0;
      const perPerson = evenNames.length > 0 ? Math.round(Math.max(0, rest - subsidy) / evenNames.length) : 0;

      let error = '';
      let soft = false; // true: chỉ là nhắc nhập tiếp, chưa phải lỗi
      if (fixedList.length > 0 && amount > 0) {
        const missing = fixedList.filter(f => f.amount <= 0).map(f => f.name);
        if (missing.length > 0) {
          error = `Nhập số tiền cố định cho ${missing.join(', ')}, hoặc chuyển về "Đều".`;
          soft = true;
        } else if (fixedSum > amount) {
          error = `Tổng phần cố định (${formatMoney(fixedSum)} đ) lớn hơn khoản chi (${formatMoney(amount)} đ).`;
        } else if (evenNames.length === 0 && rest !== 0) {
          error = `Còn ${formatMoney(rest)} đ chưa có ai chịu. Cho thêm một người chia "Đều" hoặc chỉnh lại số tiền cố định.`;
        } else if (evenNames.length > 0 && rest <= 0) {
          error = 'Phần cố định đã bằng cả khoản chi nên người chia "Đều" sẽ phải trả 0 đ. Chỉnh lại số tiền cố định.';
        }
      }
      return { fixedList, evenNames, fixedSum, rest, perPerson, subsidy, error, soft };
    }

    function updateModalPreview() {
      const el = document.getElementById('modalPreviewLine');
      if (!el) return;
      const splitEl = document.getElementById('modalSplitHint');
      if (splitEl) {
        splitEl.textContent = '';
        splitEl.className = 'mt-1.5 text-[11px] text-slate-500 whitespace-pre-line min-h-[1rem]';
      }
      const amount = modalAmountValue();
      const fundWarn = document.getElementById('modalFundWarn');
      if (fundWarn) fundWarn.classList.add('hidden');

      if (modalMode === 'expense') {
        const lines = [];
        const fundOn = isFundOn();
        const cash = fundOn ? calculateLedger().fundCash : 0;
        const fundPart = modalFundPartValue();
        if (amount > 0 && currentModalPayer === FUND_NAME) {
          lines.push(`Quỹ trả cả khoản này, ${fundCashAfterText(cash - amount)}.`);
        } else if (amount > 0 && fundPart > 0) {
          const f = Math.min(fundPart, amount);
          lines.push(`Quỹ trả ${formatMoney(f)} đ, ${currentModalPayer} ứng ${formatMoney(amount - f)} đ; ${fundCashAfterText(cash - f)}.`);
        }

        // Quỹ trả nhiều hơn số tiền đang có: nói rõ hệ quả và cách ghi nếu thực tế có người ứng phần thiếu
        const fundOut = currentModalPayer === FUND_NAME ? amount : Math.min(fundPart, amount);
        const cashNow = Math.max(0, cash);
        if (fundWarn && amount > 0 && fundOut > cashNow) {
          fundWarn.textContent = (cashNow > 0
            ? `Quỹ chỉ đang có ${formatMoney(cashNow)} đ nên khoản này chi vượt ${formatMoney(fundOut - cashNow)} đ. `
            : `Quỹ đang không còn tiền nên phần quỹ trả (${formatMoney(fundOut)} đ) là chi vượt hoàn toàn. `)
            + 'Phần vượt tính vào số các bạn cần nộp vào quỹ khi chốt nợ. '
            + (cashNow > 0
              ? `Nếu thực tế đã có người ứng phần thiếu, hãy chọn người đó làm người trả và nhập "Quỹ trả một phần" = ${formatMoney(cashNow)} đ.`
              : 'Nếu thực tế đã có người ứng tiền, hãy chọn người đó làm người trả và để trống "Quỹ trả một phần".');
          fundWarn.classList.remove('hidden');
        }

        const split = computeModalSplit(amount);
        if (split.subsidy > 0) lines.push(`Tiền tài trợ ${formatMoney(split.subsidy)} đ nằm trong phần quỹ trả, không tính vào phần các bạn chịu.`);
        if (split.fixedList.length === 0) {
          const n = currentModalParticipants.length;
          if (n > 0 && amount > 0) lines.unshift(`Mỗi người ~${formatMoney(Math.round((amount - split.subsidy) / n))} đ (chia ${n} người)`);
        } else if (splitEl && amount > 0) {
          if (split.error) {
            splitEl.textContent = split.error;
            if (!split.soft) splitEl.className = 'mt-1.5 text-[11px] text-rose-600 whitespace-pre-line min-h-[1rem]';
          } else {
            const fixedText = split.fixedList.map(f => `${f.name} ${formatMoney(f.amount)} đ`).join(', ');
            splitEl.textContent = `Cố định: ${fixedText}.\n` + (split.evenNames.length > 0
              ? `Còn lại ${formatMoney(split.rest - split.subsidy)} đ${split.subsidy > 0 ? ' (sau tài trợ)' : ''} chia đều ${split.evenNames.length} người, mỗi người ~${formatMoney(split.perPerson)} đ.`
              : 'Không còn ai chia đều.');
          }
        }
        el.textContent = lines.join('\n');
        return;
      }

      if (modalMode === 'deposit') {
        if (amount > 0) {
          const cash = calculateLedger().fundCash;
          el.textContent = `Quỹ hiện có ${formatMoney(cash)} đ, sau khi nộp sẽ có ${formatMoney(cash + amount)} đ.`
            + (currentModalPayer === EXTERNAL_NAME ? ' Đây là tiền tài trợ: quỹ dùng trước, không tính vào phần các bạn chịu.' : '');
        } else {
          el.textContent = '';
        }
        return;
      }

      if (!amount || !currentModalPayer || currentModalPayer === currentModalRecipient) {
        el.textContent = '';
        return;
      }
      if (currentModalPayer === FUND_NAME) {
        const cash = calculateLedger().fundCash;
        el.textContent = `Quỹ hoàn ${formatMoney(amount)} đ cho ${currentModalRecipient}, ${fundCashAfterText(cash - amount)}.`;
        return;
      }
      const stat = calculateLedger().memberStats[currentModalPayer];
      // Theo số dư hiển thị: nộp vào quỹ chỉ bù phần còn thiếu quỹ, không trừ vào nợ với các bạn
      const current = shownBalance(stat);
      const after = stat && currentModalRecipient === FUND_NAME
        ? Math.round(stat.peerBalance + Math.min(0, stat.fundBalance + amount))
        : current + amount;
      let text = `${currentModalPayer}: ` + (after < -1
        ? `còn cần trả ${formatMoney(-after)} đ`
        : after > 1 ? `sẽ được nhận ${formatMoney(after)} đ` : 'đã cân bằng') + ' sau khi lưu.';
      if (current < -1 && amount > -current + 100) {
        text += ` Số này nhiều hơn khoản đang nợ (${formatMoney(-current)} đ).`;
      }
      if (currentModalRecipient === FUND_NAME) {
        text += ` Quỹ sẽ có ${formatMoney(calculateLedger().fundCash + amount)} đ.`;
      }
      el.textContent = text;
    }

    // Các dòng "Đều / Cố định" theo từng người đã chọn ở mục Chia cho
    function renderModalFixedRows(focusName) {
      const wrap = document.getElementById('modalFixedRows');
      const evenBtn = document.getElementById('splitModeEven');
      const fixedBtn = document.getElementById('splitModeFixed');
      if (!wrap) return;
      const isFixedMode = modalSplitMode === 'fixed';
      if (evenBtn) evenBtn.className = isFixedMode ? MODAL_TAB_OFF : MODAL_TAB_ON;
      if (fixedBtn) fixedBtn.className = isFixedMode ? MODAL_TAB_ON : MODAL_TAB_OFF;

      wrap.innerHTML = '';
      const people = ledgerState.members.filter(m => currentModalParticipants.includes(m));
      wrap.classList.toggle('hidden', !isFixedMode || people.length === 0);
      if (!isFixedMode) return;

      const SEG_ON = 'px-2.5 py-1 rounded-md bg-white text-slate-900 shadow-2xs font-semibold transition cursor-pointer';
      const SEG_OFF = 'px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-900 font-semibold transition cursor-pointer';
      people.forEach(m => {
        const isFixed = Object.prototype.hasOwnProperty.call(currentModalFixed, m);
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2';

        const nameEl = document.createElement('span');
        nameEl.className = 'w-16 shrink-0 truncate text-xs font-semibold text-slate-700';
        nameEl.textContent = m;
        nameEl.title = m;
        row.appendChild(nameEl);

        const seg = document.createElement('div');
        seg.className = 'flex bg-slate-100 rounded-lg p-0.5 text-[11px] shrink-0';
        const evenOpt = document.createElement('button');
        evenOpt.type = 'button';
        evenOpt.textContent = 'Đều';
        evenOpt.className = isFixed ? SEG_OFF : SEG_ON;
        evenOpt.onclick = () => { delete currentModalFixed[m]; renderModalFixedRows(); updateModalPreview(); };
        const fixedOpt = document.createElement('button');
        fixedOpt.type = 'button';
        fixedOpt.textContent = 'Cố định';
        fixedOpt.className = isFixed ? SEG_ON : SEG_OFF;
        fixedOpt.onclick = () => {
          if (!Object.prototype.hasOwnProperty.call(currentModalFixed, m)) currentModalFixed[m] = 0;
          renderModalFixedRows(m);
          updateModalPreview();
        };
        seg.appendChild(evenOpt);
        seg.appendChild(fixedOpt);
        row.appendChild(seg);

        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.placeholder = isFixed ? 'Số tiền' : 'Chia đều';
        input.disabled = !isFixed;
        input.setAttribute('aria-label', `Số tiền cố định của ${m}`);
        input.className = 'flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:border-indigo-600 focus:outline-none transition disabled:bg-slate-50 disabled:text-slate-300';
        input.value = isFixed && currentModalFixed[m] ? formatMoney(currentModalFixed[m]) : '';
        input.addEventListener('input', () => {
          const digits = input.value.replace(/\D/g, '');
          const n = digits ? parseInt(digits, 10) : 0;
          input.value = n ? n.toLocaleString('vi-VN') : '';
          currentModalFixed[m] = n;
          updateModalPreview();
        });
        row.appendChild(input);
        wrap.appendChild(row);
        if (focusName === m && isFixed) setTimeout(() => input.focus(), 0);
      });
    }

    window.setModalSplitMode = function(mode) {
      modalSplitMode = mode === 'fixed' ? 'fixed' : 'even';
      renderModalFixedRows();
      updateModalPreview();
    };

    // Gợi ý trả nợ: lấy từ danh sách chuyển khoản còn lại (đã bù trừ)
    function renderModalSuggestions() {
      const section = document.getElementById('modalSuggestSection');
      const box = document.getElementById('modalSuggestChips');
      if (!section || !box) return;
      const calcNow = calculateLedger();
      // Tiền quỹ chưa dùng để yên, không gợi ý quỹ hoàn lại (trừ khi đã bật trả lại tiền quỹ: lúc đó đã có trong transfers)
      const baseSuggestions = [...calcNow.transfers];
      modalSuggestions = baseSuggestions;
      section.classList.toggle('hidden', modalMode !== 'payment' || modalSuggestions.length === 0);
      box.innerHTML = '';
      modalSuggestions.forEach((t) => {
        const on = currentModalPayer === t.from && currentModalRecipient === t.to && modalAmountValue() === t.amount;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = on ? MODAL_CHIP_ON : MODAL_CHIP_OFF;
        btn.textContent = `${t.from} ➔ ${t.to} · ${formatMoney(t.amount)} đ`;
        btn.onclick = () => applyModalSuggestion(t);
        box.appendChild(btn);
      });
    }

    function applyModalSuggestion(t) {
      currentModalPayer = t.from;
      currentModalRecipient = t.to;
      const amountInput = document.getElementById('inputExpenseAmount');
      if (amountInput) {
        amountInput.value = formatMoney(t.amount);
        amountInput.classList.remove(...MODAL_ERR_CLASSES);
      }
      renderModalChips();
    }

    function renderModalChips() {
      const payerContainer = document.getElementById('payerChipsContainer');
      const recipientContainer = document.getElementById('recipientChipsContainer');
      const partContainer = document.getElementById('participantChipsContainer');
      if (!payerContainer || !recipientContainer || !partContainer) return;

      payerContainer.innerHTML = '';
      recipientContainer.innerHTML = '';
      partContainer.innerHTML = '';

      const members = ledgerState.members;
      const countEl = document.getElementById('modalSelectedCount');

      // Chip nét đứt "+ Thêm người": luôn nằm cuối hàng "Chia cho"
      const makeAddChip = () => {
        const b = document.createElement('button');
        b.type = 'button';
        b.onclick = () => toggleQuickAddInModal();
        b.className = "px-3.5 py-1.5 rounded-full text-xs font-bold border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 transition cursor-pointer";
        b.textContent = '+ Thêm người';
        return b;
      };

      if (members.length === 0) {
        const hint = '<div class="text-slate-400 italic text-xs py-1">Chưa có thành viên nào. Hãy thêm người ở mục "Chia cho" (tab Chi tiêu).</div>';
        payerContainer.innerHTML = hint;
        recipientContainer.innerHTML = hint;
        partContainer.innerHTML = '<div class="w-full text-slate-400 italic text-xs py-1">Chưa có thành viên nào. Nhập tên bên dưới để bắt đầu.</div>';
        partContainer.appendChild(makeAddChip());
        if (countEl) countEl.textContent = '';
        const removeHintEmpty = document.getElementById('modalRemoveHint');
        if (removeHintEmpty) removeHintEmpty.classList.add('hidden');
        updateModalPreview();
        return;
      }

      // "Quỹ chung" chỉ hiện khi sổ đang dùng quỹ. Không nằm trong "Chia cho", và quỹ không thể tự "nộp quỹ"
      const fundOn = isFundOn();
      const payerChoices = !fundOn ? members : (modalMode === 'deposit' ? [...members, EXTERNAL_NAME] : [...members, FUND_NAME]);
      const recipientChoices = fundOn ? [...members, FUND_NAME] : members;
      if (!payerChoices.includes(currentModalPayer)) currentModalPayer = members[0];
      if (!recipientChoices.includes(currentModalRecipient)) currentModalRecipient = members[1] || members[0];

      // Người trả (chọn 1)
      payerChoices.forEach(m => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.onclick = () => {
          currentModalPayer = m;
          renderModalChips();
        };
        btn.className = m === currentModalPayer ? MODAL_CHIP_ON : MODAL_CHIP_OFF;
        btn.textContent = m === EXTERNAL_NAME ? 'Nguồn ngoài (tài trợ)' : m;
        payerContainer.appendChild(btn);
      });

      // Người nhận (chọn 1, chỉ dùng ở tab Trả nợ)
      recipientChoices.forEach(m => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.onclick = () => {
          currentModalRecipient = m;
          renderModalChips();
        };
        btn.className = m === currentModalRecipient ? MODAL_CHIP_ON : MODAL_CHIP_OFF;
        btn.textContent = m;
        recipientContainer.appendChild(btn);
      });

      // Chia cho (chọn nhiều, có "Tất cả")
      const allSelected = members.every(m => currentModalParticipants.includes(m));
      const btnAll = document.createElement('button');
      btnAll.type = 'button';
      btnAll.onclick = () => {
        currentModalParticipants = allSelected ? [] : [...members];
        renderModalChips();
      };
      btnAll.className = allSelected ? MODAL_CHIP_ON : MODAL_CHIP_OFF;
      btnAll.textContent = `Tất cả (${members.length})`;
      partContainer.appendChild(btnAll);

      let anyRemovable = false;
      members.forEach(m => {
        const isChecked = currentModalParticipants.includes(m);
        // Người chưa dính vào khoản nào thì có nút xóa khỏi nhóm ngay trên chip
        const removable = !memberHasExpenses(m);
        const toggleMember = () => {
          currentModalParticipants = isChecked
            ? currentModalParticipants.filter(x => x !== m)
            : [...currentModalParticipants, m];
          renderModalChips();
        };

        if (!removable) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.onclick = toggleMember;
          btn.className = isChecked ? MODAL_CHIP_ON : MODAL_CHIP_OFF;
          btn.textContent = m;
          partContainer.appendChild(btn);
          return;
        }

        // Chip có nút xóa: vẫn là một viên thuốc duy nhất, nút xóa là vòng tròn nhỏ nằm trong chip, cùng tông màu
        anyRemovable = true;
        const wrap = document.createElement('span');
        wrap.className = 'inline-flex items-center rounded-full border border-transparent transition ' +
          (isChecked ? 'bg-indigo-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700');

        const label = document.createElement('button');
        label.type = 'button';
        label.onclick = toggleMember;
        label.className = 'pl-3.5 pr-1.5 py-1.5 rounded-l-full text-xs font-semibold cursor-pointer';
        label.textContent = m;
        wrap.appendChild(label);

        const x = document.createElement('button');
        x.type = 'button';
        x.title = `Xóa ${m} khỏi nhóm (chưa có khoản chi nào)`;
        x.setAttribute('aria-label', `Xóa ${m} khỏi nhóm`);
        x.className = 'mr-1.5 w-5 h-5 rounded-full inline-flex items-center justify-center transition cursor-pointer ' +
          (isChecked ? 'bg-white/20 hover:bg-white/35 text-white' : 'bg-slate-200 hover:bg-rose-100 text-slate-500 hover:text-rose-600');
        x.innerHTML = '<svg viewBox="0 0 12 12" class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';
        x.onclick = () => removeZeroExpenseMember(m);
        wrap.appendChild(x);

        partContainer.appendChild(wrap);
      });

      const removeHint = document.getElementById('modalRemoveHint');
      if (removeHint) removeHint.classList.toggle('hidden', !anyRemovable);

      partContainer.appendChild(makeAddChip());

      if (countEl) countEl.textContent = `${currentModalParticipants.length} người`;
      renderModalSuggestions();
      renderModalFixedRows();
      updateModalFundPart();
      updateModalNoteField();
      updateModalPreview();
    }

    // Xóa an toàn chỉ dành cho thành viên chưa có khoản chi nào
    window.removeZeroExpenseMember = function(name) {
      if (memberHasExpenses(name)) {
        showToast(`${name} đã có khoản chi nên không xóa được.`, '⚠️');
        return;
      }
      ledgerState.members = ledgerState.members.filter(m => m !== name);
      delete memberBanks[name];
      currentModalParticipants = currentModalParticipants.filter(x => x !== name);
      if (currentModalPayer === name) currentModalPayer = ledgerState.members[0] || '';
      if (currentModalRecipient === name) currentModalRecipient = ledgerState.members[1] || ledgerState.members[0] || '';
      saveLedger();
      renderModalChips();
      renderApp();
      showToast(`Đã xóa ${name} khỏi nhóm.`, '🗑️');
    };

    // Chuyển tab trong modal: ẩn/hiện các phần theo loại khoản
    window.switchModalMode = function(mode) {
      modalMode = mode === 'payment' ? 'payment' : (mode === 'deposit' && isFundOn() ? 'deposit' : 'expense');
      const isPay = modalMode === 'payment';
      const isDep = modalMode === 'deposit';
      const isExp = modalMode === 'expense';

      const setHidden = (id, hidden) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', hidden);
      };
      setHidden('modalNameSection', !isExp);
      setHidden('modalParticipantsSection', !isExp);
      setHidden('modalExpenseNote', !isExp);
      setHidden('modalRecipientSection', !isPay);
      setHidden('modalNoteSection', isExp);
      setHidden('modalPaymentInfo', isExp);
      setHidden('btnOpenFundManagerFromForm', !isDep);

      const infoEl = document.getElementById('modalPaymentInfo');
      if (infoEl) {
        infoEl.textContent = isDep
          ? 'Tiền vào Quỹ chung, không tính vào tổng chi của nhóm. Chọn "Nguồn ngoài" nếu tiền không phải của thành viên nào (tài trợ, ủng hộ): quỹ dùng tiền này trước và phần đó không tính vào phần các bạn phải chịu. Nộp nhầm thì hoàn tác ở tab Lịch sử.'
          : 'Khoản này giảm ngay số nợ của người trả và khoản cần nhận của người nhận. Không tính vào tổng chi của nhóm. Ghi nhầm thì hoàn tác ở tab Chốt nợ.';
      }

      const tabExpense = document.getElementById('tabModalExpense');
      const tabDeposit = document.getElementById('tabModalDeposit');
      const tabPayment = document.getElementById('tabModalPayment');
      if (tabExpense) tabExpense.className = isExp ? MODAL_TAB_ON : MODAL_TAB_OFF;
      if (tabDeposit) {
        tabDeposit.className = isDep ? MODAL_TAB_ON : MODAL_TAB_OFF;
        tabDeposit.classList.toggle('hidden', !isFundOn());
      }
      if (tabPayment) tabPayment.className = isPay ? MODAL_TAB_ON : MODAL_TAB_OFF;

      const payerLabel = document.getElementById('labelModalPayer');
      if (payerLabel) payerLabel.textContent = isPay ? 'Người trả nợ' : isDep ? 'Ai nộp / nguồn tiền' : 'Người trả';

      const submitBtn = document.getElementById('btnSaveExpenseSubmit');
      if (submitBtn) {
        submitBtn.textContent = isPay ? 'Lưu ghi nhận trả nợ' : isDep ? 'Lưu khoản nộp quỹ' : 'Lưu khoản chi';
        submitBtn.className = !isExp
          ? "w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-bold text-sm shadow-md transition cursor-pointer"
          : "w-full py-3.5 bg-indigo-700 hover:bg-indigo-800 active:scale-[0.98] text-white rounded-2xl font-bold text-sm shadow-md transition cursor-pointer";
      }

      ['inputExpenseName', 'inputExpenseAmount', 'inputFundAmount'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove(...MODAL_ERR_CLASSES);
      });

      // Vào tab Trả nợ mà chưa nhập số tiền: điền sẵn theo gợi ý đầu tiên
      if (isPay && !modalAmountValue()) {
        const first = calculateLedger().transfers[0];
        const amountInput = document.getElementById('inputExpenseAmount');
        if (first && amountInput) {
          currentModalPayer = first.from;
          currentModalRecipient = first.to;
          amountInput.value = formatMoney(first.amount);
        }
      }
      renderModalChips();
    };

    let editingExpenseId = null;

    window.openAddExpenseModal = function(mode) {
      editingExpenseId = null;
      const editInput = document.getElementById('editExpenseId');
      if (editInput) editInput.value = '';

      const titleEl = document.getElementById('modalExpenseTitle');
      if (titleEl) titleEl.textContent = 'Ghi khoản mới';
      const submitBtn = document.getElementById('btnSaveExpenseSubmit');
      if (submitBtn) submitBtn.textContent = 'Lưu khoản chi';

      const nameInput = document.getElementById('inputExpenseName');
      const amountInput = document.getElementById('inputExpenseAmount');
      const noteInput = document.getElementById('inputPaymentNote');
      const dateInput = document.getElementById('inputDate');

      if (nameInput) { nameInput.value = ''; nameInput.classList.remove(...MODAL_ERR_CLASSES); }
      if (amountInput) { amountInput.value = ''; amountInput.classList.remove(...MODAL_ERR_CLASSES); }
      if (noteInput) noteInput.value = '';
      // Ngày để trống: người dùng phải tự chọn (hoặc bấm Hôm nay / Hôm qua) để khỏi bỏ sót
      if (dateInput) { dateInput.value = ''; dateInput.classList.remove(...MODAL_ERR_CLASSES); }
      const dateErrOnOpen = document.getElementById('modalDateError');
      if (dateErrOnOpen) dateErrOnOpen.classList.add('hidden');
      updateModalWeekday();

      const members = ledgerState.members;
      currentModalPayer = members[0] || '';
      currentModalRecipient = members[1] || members[0] || '';
      currentModalParticipants = [...members];
      modalSplitMode = 'even';
      currentModalFixed = {};
      const fundInput = document.getElementById('inputFundAmount');
      if (fundInput) { fundInput.value = ''; fundInput.classList.remove(...MODAL_ERR_CLASSES); }

      // Chưa có thành viên: mở sẵn ô thêm người
      const quickRow = document.getElementById('quickAddInModalRow');
      if (quickRow) quickRow.classList.toggle('hidden', members.length > 0);
      const quickInput = document.getElementById('inputQuickAddModalName');
      if (quickInput) quickInput.value = '';
      const quickMsg = document.getElementById('quickAddInModalMsg');
      if (quickMsg) quickMsg.textContent = '';

      // Hàm này cũng được gắn làm click handler (tham số đầu là event), nên chỉ nhận đúng chuỗi 'payment'
      switchModalMode(mode === 'payment' || mode === 'deposit' ? mode : 'expense');

      if (modalAddExpense) modalAddExpense.classList.remove('hidden');
      const focusEl = dateInput || (modalMode === 'expense' ? nameInput : amountInput);
      if (focusEl) setTimeout(() => focusEl.focus(), 60);
    };

    window.openEditExpenseModal = function(id) {
      const exp = ledgerState.expenses.find(x => x.id === id);
      if (!exp) return;
      editingExpenseId = id;
      const editInput = document.getElementById('editExpenseId');
      if (editInput) editInput.value = id;

      const nameInput = document.getElementById('inputExpenseName');
      const amountInput = document.getElementById('inputExpenseAmount');
      const noteInput = document.getElementById('inputPaymentNote');
      const dateInput = document.getElementById('inputDate');
      const fundInput = document.getElementById('inputFundAmount');

      if (nameInput) { nameInput.value = exp.name || ''; nameInput.classList.remove(...MODAL_ERR_CLASSES); }
      if (amountInput) { amountInput.value = formatMoney(exp.amount || 0); amountInput.classList.remove(...MODAL_ERR_CLASSES); }
      if (dateInput) { dateInput.value = exp.date || ''; dateInput.classList.remove(...MODAL_ERR_CLASSES); }
      if (noteInput) noteInput.value = exp.name || '';

      const titleEl = document.getElementById('modalExpenseTitle');
      const submitBtn = document.getElementById('btnSaveExpenseSubmit');
      if (titleEl) titleEl.textContent = exp.isPayment ? (exp.isFundDeposit ? 'Sửa nộp quỹ' : 'Sửa trả nợ') : 'Sửa khoản chi';
      if (submitBtn) submitBtn.textContent = 'Lưu thay đổi';

      currentModalPayer = exp.payer || ledgerState.members[0] || '';
      currentModalRecipient = exp.recipient || (exp.participants || [])[0] || ledgerState.members[0] || '';
      currentModalParticipants = Array.isArray(exp.participants) && exp.participants.length > 0 ? [...exp.participants] : [...ledgerState.members];

      if (fundInput) {
        fundInput.value = exp.fundAmount ? formatMoney(exp.fundAmount) : '';
        fundInput.classList.remove(...MODAL_ERR_CLASSES);
      }

      if (exp.fixedShares && Object.keys(exp.fixedShares).length > 0) {
        modalSplitMode = 'fixed';
        currentModalFixed = { ...exp.fixedShares };
      } else {
        modalSplitMode = 'even';
        currentModalFixed = {};
      }

      const quickRow = document.getElementById('quickAddInModalRow');
      if (quickRow) quickRow.classList.add('hidden');

      if (exp.isPayment) {
        switchModalMode(exp.isFundDeposit ? 'deposit' : 'payment');
      } else {
        switchModalMode('expense');
      }

      updateModalWeekday();
      renderModalChips();
      renderModalFixedRows();
      updateModalPreview();

      if (modalAddExpense) modalAddExpense.classList.remove('hidden');
      if (nameInput) setTimeout(() => nameInput.focus(), 60);
    };

    const btnOpenAddExpenseModal = document.getElementById('btnOpenAddExpenseModal');
    if (btnOpenAddExpenseModal) {
      btnOpenAddExpenseModal.addEventListener('click', () => window.openAddExpenseModal('expense'));
    }

    // Nút chọn nhanh ngày: 0 = hôm nay, -1 = hôm qua
    window.setModalDate = function(offsetDays) {
      const dateInput = document.getElementById('inputDate');
      if (!dateInput) return;
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      dateInput.value = getLocalDateString(d);
      dateInput.classList.remove(...MODAL_ERR_CLASSES);
      const dateErr = document.getElementById('modalDateError');
      if (dateErr) dateErr.classList.add('hidden');
      updateModalWeekday();
    };

    window.closeModal = function() {
      if (modalAddExpense) modalAddExpense.classList.add('hidden');
    };

    const btnCloseModal = document.getElementById('btnCloseModal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', window.closeModal);

    window.toggleQuickAddInModal = function() {
      const row = document.getElementById('quickAddInModalRow');
      if (!row) return;
      row.classList.toggle('hidden');
      if (!row.classList.contains('hidden')) {
        const input = document.getElementById('inputQuickAddModalName');
        const msg = document.getElementById('quickAddInModalMsg');
        if (msg) msg.textContent = '';
        if (input) {
          input.value = '';
          input.focus();
        }
        row.scrollIntoView({ block: 'nearest' });
      }
    };

    // Thêm nhanh người mới ngay trong modal: nhập nhiều tên cách nhau dấu phẩy, người mới tự được chọn vào "Chia cho"
    window.submitQuickAddInModal = function() {
      const input = document.getElementById('inputQuickAddModalName');
      const msg = document.getElementById('quickAddInModalMsg');
      if (!input) return;

      const names = input.value.split(',').map(s => s.trim()).filter(Boolean);
      if (names.length === 0) {
        if (msg) msg.textContent = 'Nhập tên người cần thêm.';
        input.focus();
        return;
      }

      const added = [];
      const existed = [];
      const reserved = [];
      names.forEach(newName => {
        if (isReservedMemberName(newName)) {
          reserved.push(newName);
          return;
        }
        if (ledgerState.members.includes(newName) || added.includes(newName)) {
          existed.push(newName);
        } else {
          ledgerState.members.push(newName);
          memberBanks[newName] = { bankBin: "970422", bankCode: "MBBank", accountNo: "", accountName: newName.toUpperCase() };
          added.push(newName);
        }
        if (!currentModalParticipants.includes(newName)) {
          currentModalParticipants.push(newName);
        }
      });

      if (!currentModalPayer && ledgerState.members.length > 0) {
        currentModalPayer = ledgerState.members[0];
      }

      input.value = '';
      if (msg) {
        const parts = [];
        if (added.length) parts.push(`Đã thêm ${added.join(', ')} vào nhóm và chọn chia cho ${added.length > 1 ? 'các bạn này' : added[0]}.`);
        if (existed.length) parts.push(`Đã có sẵn: ${existed.join(', ')} (đã chọn chia).`);
        if (reserved.length) parts.push(`"${FUND_NAME}" là tên dành riêng cho quỹ, hãy đặt tên khác.`);
        msg.textContent = parts.join(' ');
      }

      saveLedger();
      renderModalChips();
      renderApp();
      if (added.length) showToast(`Đã thêm ${added.join(', ')} vào nhóm!`, '👥');
      input.focus();
    };

    const inputQuickAddModal = document.getElementById('inputQuickAddModalName');
    if (inputQuickAddModal) {
      inputQuickAddModal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitQuickAddInModal();
        }
      });
    }

    const inputExpenseAmountEl = document.getElementById('inputExpenseAmount');
    if (inputExpenseAmountEl) {
      inputExpenseAmountEl.addEventListener('input', (e) => {
        e.target.classList.remove(...MODAL_ERR_CLASSES);
        const cleanVal = e.target.value.replace(/\D/g, '');
        e.target.value = cleanVal ? parseInt(cleanVal, 10).toLocaleString('vi-VN') : '';
        updateModalPreview();
        if (modalMode === 'payment') renderModalSuggestions();
      });
    }

    const inputFundAmountEl = document.getElementById('inputFundAmount');
    if (inputFundAmountEl) {
      inputFundAmountEl.addEventListener('input', (e) => {
        e.target.classList.remove(...MODAL_ERR_CLASSES);
        const cleanVal = e.target.value.replace(/\D/g, '');
        e.target.value = cleanVal ? parseInt(cleanVal, 10).toLocaleString('vi-VN') : '';
        updateModalPreview();
      });
    }

    const inputExpenseNameEl = document.getElementById('inputExpenseName');
    if (inputExpenseNameEl) {
      inputExpenseNameEl.addEventListener('input', (e) => {
        e.target.classList.remove(...MODAL_ERR_CLASSES);
      });
    }

    const inputDateEl = document.getElementById('inputDate');
    if (inputDateEl) {
      const onModalDateChange = () => {
        updateModalWeekday();
        inputDateEl.classList.remove(...MODAL_ERR_CLASSES);
        const dateErr = document.getElementById('modalDateError');
        if (dateErr) dateErr.classList.add('hidden');
      };
      inputDateEl.addEventListener('input', onModalDateChange);
      inputDateEl.addEventListener('change', onModalDateChange);
    }

    // Lưu ý: form đã có onsubmit="handleSaveExpense(event)" trong HTML, KHÔNG gắn thêm addEventListener('submit')
    // vì sẽ chạy hai lần mỗi lần bấm lưu (ghi trùng khoản chi).
    window.handleSaveExpense = function(e) {
      if (e) e.preventDefault();

      const editId = document.getElementById('editExpenseId')?.value || editingExpenseId;
      const nameInput = document.getElementById('inputExpenseName');
      const amountInput = document.getElementById('inputExpenseAmount');
      const dateInput = document.getElementById('inputDate');

      const amount = modalAmountValue();
      const date = dateInput ? dateInput.value : '';

      if (nameInput) nameInput.classList.remove(...MODAL_ERR_CLASSES);
      if (amountInput) amountInput.classList.remove(...MODAL_ERR_CLASSES);

      // Ngày là bắt buộc (ô để trống sẵn): kiểm tra trước các ô khác vì nó đứng đầu form
      const dateErr = document.getElementById('modalDateError');
      if (dateErr) dateErr.classList.add('hidden');
      if (dateInput) dateInput.classList.remove(...MODAL_ERR_CLASSES);
      if (!date) {
        if (dateInput) {
          dateInput.classList.add(...MODAL_ERR_CLASSES);
          dateInput.focus();
        }
        if (dateErr) dateErr.classList.remove('hidden');
        showToast('Vui lòng chọn ngày của khoản này!', '⚠️');
        return;
      }

      // ===== Tab Nộp quỹ =====
      if (modalMode === 'deposit') {
        const payer = currentModalPayer;
        if (amount <= 0) {
          if (amountInput) {
            amountInput.classList.add(...MODAL_ERR_CLASSES);
            amountInput.focus();
          }
          showToast('Vui lòng nhập số tiền nộp quỹ hợp lệ!', '⚠️');
          return;
        }
        if (!payer || (payer !== EXTERNAL_NAME && !ledgerState.members.includes(payer))) {
          showToast('Vui lòng chọn người nộp quỹ!', '⚠️');
          return;
        }

        const noteInput = document.getElementById('inputPaymentNote');
        const note = (noteInput && noteInput.value.trim()) || defaultPaymentNote(payer, FUND_NAME);

        if (editId) {
          const existing = ledgerState.expenses.find(x => x.id === editId);
          if (existing) {
            existing.date = date;
            existing.name = note;
            existing.amount = amount;
            existing.payer = payer;
          }
        } else {
          ledgerState.expenses.push({
            id: 'dep-' + Date.now(),
            isPayment: true,
            isFundDeposit: true,
            date: date,
            name: note,
            amount: amount,
            payer: payer,
            recipient: FUND_NAME,
            participants: [FUND_NAME]
          });
        }

        editingExpenseId = null;
        const editEl = document.getElementById('editExpenseId'); if (editEl) editEl.value = '';
        ledgerState.expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
        saveLedger();
        closeModal();
        renderApp();
        showToast(editId ? `Đã cập nhật nộp quỹ ${formatMoney(amount)} đ.` : (payer === EXTERNAL_NAME
          ? `Đã ghi tiền tài trợ ${formatMoney(amount)} đ vào quỹ.`
          : `Đã ghi ${payer} nộp quỹ ${formatMoney(amount)} đ.`));
        return;
      }

      // ===== Tab Trả nợ bù trừ =====
      if (modalMode === 'payment') {
        const payer = currentModalPayer;
        const recipient = currentModalRecipient;

        if (amount <= 0) {
          if (amountInput) {
            amountInput.classList.add(...MODAL_ERR_CLASSES);
            amountInput.focus();
          }
          showToast('Vui lòng nhập số tiền trả nợ hợp lệ!', '⚠️');
          return;
        }

        if (!payer || !recipient || payer === recipient) {
          showToast('Người trả nợ và người nhận tiền không được trùng nhau!', '⚠️');
          return;
        }

        const noteInput = document.getElementById('inputPaymentNote');
        const note = (noteInput && noteInput.value.trim()) || defaultPaymentNote(payer, recipient);

        if (editId) {
          const existing = ledgerState.expenses.find(x => x.id === editId);
          if (existing) {
            existing.date = date;
            existing.name = note;
            existing.amount = amount;
            existing.payer = payer;
            existing.recipient = recipient;
            existing.participants = [recipient];
          }
        } else {
          ledgerState.expenses.push(...buildSettlementEntries(payer, recipient, amount, date, note));
        }

        editingExpenseId = null;
        const editEl = document.getElementById('editExpenseId'); if (editEl) editEl.value = '';
        ledgerState.expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
        saveLedger();
        closeModal();
        renderApp();
        showToast(editId ? `✅ Đã cập nhật ghi nhận trả nợ: ${payer} ➔ ${recipient} (${formatMoney(amount)} đ)!` : `✅ Đã lưu ghi nhận trả nợ: ${payer} ➔ ${recipient} (${formatMoney(amount)} đ)!`);
        return;
      }

      // ===== Tab Chi tiêu chung =====
      const name = nameInput ? nameInput.value.trim() : '';

      if (!name) {
        if (nameInput) {
          nameInput.classList.add(...MODAL_ERR_CLASSES);
          nameInput.focus();
        }
        showToast('Vui lòng nhập tên món / nội dung khoản chi!', '⚠️');
        return;
      }

      if (amount <= 0) {
        if (amountInput) {
          amountInput.classList.add(...MODAL_ERR_CLASSES);
          amountInput.focus();
        }
        showToast('Vui lòng nhập số tiền chi tiêu hợp lệ!', '⚠️');
        return;
      }

      if (ledgerState.members.length === 0) {
        showToast('Vui lòng thêm người tham gia!', '⚠️');
        const quickRow = document.getElementById('quickAddInModalRow');
        if (quickRow && quickRow.classList.contains('hidden')) toggleQuickAddInModal();
        return;
      }

      const payer = currentModalPayer || ledgerState.members[0];
      if (currentModalParticipants.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 người chia khoản này!', '⚠️');
        return;
      }

      // Quỹ trả một phần: không vượt quá khoản chi
      const fundAmount = modalFundPartValue();
      if (fundAmount > amount) {
        const fundInput = document.getElementById('inputFundAmount');
        if (fundInput) {
          fundInput.classList.add(...MODAL_ERR_CLASSES);
          fundInput.focus();
        }
        showToast('Số quỹ trả không được lớn hơn khoản chi!', '⚠️');
        return;
      }

      // Phần cố định: tổng không vượt khoản chi, và phải có người chia đều số còn lại
      const split = computeModalSplit(amount);
      if (split.error) {
        showToast(split.error, '⚠️');
        return;
      }

      if (editId) {
        const existing = ledgerState.expenses.find(x => x.id === editId);
        if (existing) {
          existing.date = date;
          existing.name = name;
          existing.amount = amount;
          existing.payer = payer;
          existing.participants = [...currentModalParticipants];
          if (fundAmount > 0) existing.fundAmount = fundAmount; else delete existing.fundAmount;
          if (split.fixedList.length > 0) {
            existing.fixedShares = {};
            split.fixedList.forEach(f => { existing.fixedShares[f.name] = f.amount; });
          } else {
            delete existing.fixedShares;
          }
        }
      } else {
        const newExpense = {
          id: 'exp-' + Date.now(),
          isPayment: false,
          date: date,
          name: name,
          amount: amount,
          payer: payer,
          participants: [...currentModalParticipants]
        };
        if (fundAmount > 0) newExpense.fundAmount = fundAmount;
        if (split.fixedList.length > 0) {
          newExpense.fixedShares = {};
          split.fixedList.forEach(f => { newExpense.fixedShares[f.name] = f.amount; });
        }
        ledgerState.expenses.push(newExpense);
      }

      editingExpenseId = null;
      const editEl = document.getElementById('editExpenseId'); if (editEl) editEl.value = '';
      ledgerState.expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
      saveLedger();
      closeModal();
      renderApp();
      showToast(editId ? `💾 Đã cập nhật khoản chi "${name}" (${formatMoney(amount)} đ)!` : `💾 Đã lưu khoản chi "${name}" (${formatMoney(amount)} đ)!`);
    };

    // Xóa khoản chi. Bị khóa khi sổ đã có giao dịch trả nợ: xóa lúc đó làm số dư của các lượt trả nợ đã ghi bị lệch.
    // Muốn xóa thì hoàn tác các lượt trả nợ trước (tab Chốt nợ, bấm ✓).
    window.deleteExpense = function(id) {
      const target = ledgerState.expenses.find(x => x.id === id);
      if (!target) return;
      if (target.isPayment) {
        undoPayment(id);
        return;
      }
      const paymentCount = countLockingPayments(ledgerState.expenses);
      if (paymentCount > 0) {
        showToast(`Sổ đã có ${paymentCount} lượt trả nợ nên không xóa được khoản chi. Hãy hoàn tác các lượt trả nợ trước (tab Chốt nợ, bấm ✓).`, '🔒');
        return;
      }
      if (confirm(`Bạn có chắc muốn xóa khoản chi "${target.name}" (${formatMoney(target.amount)} đ) không?`)) {
        ledgerState.expenses = ledgerState.expenses.filter(x => x.id !== id);
        renderApp();
        showToast('🗑️ Đã xóa khoản chi thành công.');
      }
    };

    // 6. XÁC NHẬN GHI NHẬN ĐÃ TRẢ NỢ (CÁCH 1)
    let pendingConfirmTransfer = null;

    window.openConfirmPaymentModal = function(from, to, amount) {
      pendingConfirmTransfer = { from, to, amount };
      document.getElementById('confirmPaymentPayer').textContent = from;
      document.getElementById('confirmPaymentRecipient').textContent = to;
      document.getElementById('confirmPaymentAmount').textContent = `${formatMoney(amount)} đ`;
      document.getElementById('confirmPaymentDate').value = getLocalDateString();
      document.getElementById('confirmPaymentNote').value = defaultPaymentNote(from, to);
      document.getElementById('modalConfirmPayment').classList.remove('hidden');
    };

    function closeConfirmPaymentModal() {
      document.getElementById('modalConfirmPayment').classList.add('hidden');
      pendingConfirmTransfer = null;
    }

    document.getElementById('btnCloseConfirmPaymentModal').addEventListener('click', closeConfirmPaymentModal);
    document.getElementById('btnCancelConfirmPayment').addEventListener('click', closeConfirmPaymentModal);

    document.getElementById('btnExecuteConfirmPayment').addEventListener('click', () => {
      if (!pendingConfirmTransfer) return;
      const date = document.getElementById('confirmPaymentDate').value || getLocalDateString();
      const note = document.getElementById('confirmPaymentNote').value.trim() || defaultPaymentNote(pendingConfirmTransfer.from, pendingConfirmTransfer.to);

      ledgerState.expenses.push(...buildSettlementEntries(pendingConfirmTransfer.from, pendingConfirmTransfer.to, pendingConfirmTransfer.amount, date, note));

      ledgerState.expenses.sort((a, b) => new Date(a.date) - new Date(b.date));

      const fromName = pendingConfirmTransfer.from;
      const toName = pendingConfirmTransfer.to;
      const settledAmount = pendingConfirmTransfer.amount;

      closeConfirmPaymentModal();
      renderApp();
      showToast(`🎉 Đã ghi nhận ${fromName} trả ${formatMoney(settledAmount)} đ cho ${toName}! Công nợ đã được bù trừ tức thì.`);
    });

    window.undoPayment = function(id) {
      const p = ledgerState.expenses.find(x => x.id === id);
      if (!p) return;
      // Lượt trả tách thành nhiều khoản (nộp đợt thu + trả phần nợ quỹ) thì hoàn tác cả lượt
      const group = p.settleId ? ledgerState.expenses.filter(x => x.settleId === p.settleId) : [p];
      const total = group.reduce((s, x) => s + x.amount, 0);
      if (confirm(`Bạn có muốn hoàn tác giao dịch "${p.name}" (${formatMoney(total)} đ) không? Khoản nợ sẽ được tính lại vào danh sách cần chuyển.`)) {
        ledgerState.expenses = ledgerState.expenses.filter(x => !group.includes(x));
        renderApp();
        showToast(`↩️ Đã hoàn tác giao dịch trả nợ!`);
      }
    };

    // Xóa trắng sổ quỹ: dùng chung cho nút 🧹 trên header và mục "Xóa trắng sổ này" trong menu ⋯
    window.openClearAllModal = function() {
      if (!confirm('Bạn có chắc muốn xóa trắng toàn bộ dữ liệu sổ quỹ hiện tại không?')) return;
      ledgerState.expenses = [];
      ledgerState.fundRounds = [];
      // Giữ nguyên tên sổ hiện tại (trước đây bị đặt lại thành "Quỹ Ăn Trưa & Chi Tiêu Nhóm", sai với tên mặc định của sổ)
      saveLedger();
      renderApp();
      showToast('Đã xóa trắng toàn bộ dữ liệu sổ quỹ!', '🧹');
    };

    const btnScrollSettlement = document.getElementById('btnScrollToSettlement');
    if (btnScrollSettlement) {
      btnScrollSettlement.addEventListener('click', () => {
        switchLedgerTab('settlement');
      });
    }

    // 6. QUẢN LÝ THÀNH VIÊN & STK (bottom sheet trên mobile)
    const modalManageMembers = document.getElementById('modalManageMembers');
    const membersManageList = document.getElementById('membersManageList');
    const memberCountSummary = document.getElementById('memberCountSummary');
    const memberAddMsg = document.getElementById('memberAddMsg');

    // Danh sách ngân hàng (khớp với ô chọn ở popup QR)
    const MEMBER_BANK_OPTIONS = [
      { bin: '970422', code: 'MBBank', name: 'MB Bank' },
      { bin: '970436', code: 'Vietcombank', name: 'Vietcombank' },
      { bin: '970407', code: 'Techcombank', name: 'Techcombank' },
      { bin: '970432', code: 'VPBank', name: 'VPBank' },
      { bin: '970416', code: 'ACB', name: 'ACB' },
      { bin: '970415', code: 'VietinBank', name: 'VietinBank' },
      { bin: '970418', code: 'BIDV', name: 'BIDV' },
      { bin: '970423', code: 'TPBank', name: 'TPBank' },
      { bin: '971025', code: 'momo', name: 'Ví MoMo' }
    ];

    // Thành viên đang mở ô sửa STK (null = không mở)
    let editingBankMember = null;

    function setMemberAddMsg(text, isError) {
      if (!memberAddMsg) return;
      memberAddMsg.textContent = text || '';
      memberAddMsg.className = `mt-1.5 text-[11px] min-h-[1rem] ${isError ? 'text-rose-600' : 'text-emerald-700'}`;
    }

    window.openMembersModal = function() {
      editingBankMember = null;
      setMemberAddMsg('');
      renderMembersManageList();
      modalManageMembers.classList.remove('hidden');
    };

    function closeMembersModal() {
      modalManageMembers.classList.add('hidden');
      editingBankMember = null;
    }

    // Pill Badge click listener (Idea 3: Unified single touchpoint for member management)
    const btnPillMembers = document.getElementById('btnPillManageMembers');
    if (btnPillMembers) btnPillMembers.addEventListener('click', openMembersModal);
    document.getElementById('btnCloseMembersModal').addEventListener('click', closeMembersModal);
    document.getElementById('btnDoneManageMembers').addEventListener('click', closeMembersModal);

    function memberBankLabel(bank) {
      const opt = MEMBER_BANK_OPTIONS.find(o => o.bin === bank.bankBin);
      return opt ? opt.name : (bank.bankCode || 'Ngân hàng');
    }

    function renderMembersManageList() {
      membersManageList.innerHTML = '';
      memberCountSummary.textContent = `${ledgerState.members.length} người trong nhóm`;
      const btnClearAll = document.getElementById('btnClearAllMembers');
      if (btnClearAll) {
        btnClearAll.classList.toggle('hidden', ledgerState.members.length === 0);
      }

      if (ledgerState.members.length === 0) {
        membersManageList.innerHTML = `
          <div class="py-6 px-3 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400 space-y-1">
            <div class="font-bold text-slate-600">Chưa có thành viên nào trong nhóm</div>
            <div>Nhập tên vào ô phía trên rồi bấm "Thêm" để bắt đầu.</div>
          </div>
        `;
        return;
      }
      const calc = calculateLedger();

      // Quỹ chung hiện như một dòng cuối danh sách để cài STK thủ quỹ (không xóa được)
      const rowNames = isFundOn() ? ledgerState.members.concat([FUND_NAME]) : ledgerState.members;
      rowNames.forEach(m => {
        const isFundRow = m === FUND_NAME;
        const safeName = escapeAttr(m);
        const expenseCount = ledgerState.expenses.filter(e => e.payer === m || e.recipient === m || (Array.isArray(e.participants) && e.participants.includes(m))).length;
        const bank = memberBanks[m] || {};
        const hasBank = Boolean(bank.accountNo);
        const netBal = calc.memberStats[m] ? calc.memberStats[m].netBalance : 0;
        const isSettled = Math.abs(netBal) < 1;

        let pillHtml;
        let actionHtml;
        if (isFundRow) {
          pillHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800" title="Tiền quỹ hiện có">${calc.fundCash >= 0 ? 'Còn' : 'Thiếu'} ${formatCompactK(Math.abs(calc.fundCash))}</span>`;
          actionHtml = `<span class="text-[11px] text-slate-400 font-medium italic" title="Thủ quỹ nhận tiền nộp quỹ vào STK này">Thủ quỹ nhận</span>`;
        } else if (isSettled) {
          pillHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">Sạch nợ</span>`;
          actionHtml = `
            <button type="button" data-mem-action="remove" data-name="${safeName}" aria-label="Xóa ${safeName} khỏi nhóm" class="text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-rose-200 transition cursor-pointer">
              Xóa
            </button>`;
        } else if (netBal < 0) {
          pillHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800" title="Còn nợ ${formatMoney(Math.abs(netBal))} đ">Còn nợ ${formatCompactK(netBal)}</span>`;
          actionHtml = `<span class="text-[11px] text-slate-400 font-medium italic" title="Chưa tất toán công nợ">Chưa tất toán</span>`;
        } else {
          pillHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800" title="Được nhận ${formatMoney(netBal)} đ">Cần nhận +${formatCompactK(netBal)}</span>`;
          actionHtml = `<span class="text-[11px] text-slate-400 font-medium italic" title="Chưa nhận đủ tiền">Chưa tất toán</span>`;
        }

        // Dòng STK: bấm để mở ô cài / sửa
        const bankLineHtml = hasBank
          ? `<button type="button" data-mem-action="bank-edit" data-name="${safeName}" class="mt-0.5 inline-flex items-center gap-1.5 text-[11px] py-0.5 cursor-pointer" title="Sửa STK của ${safeName}">
               <span class="text-emerald-700 font-mono">${escapeAttr(memberBankLabel(bank))}: ${escapeAttr(bank.accountNo)}</span>
               <span class="text-indigo-600 font-semibold">Sửa</span>
             </button>`
          : `<button type="button" data-mem-action="bank-edit" data-name="${safeName}" class="mt-0.5 inline-flex items-center text-[11px] py-0.5 text-indigo-600 font-semibold cursor-pointer">
               ${isFundRow ? '+ Cài STK thủ quỹ' : '+ Cài STK nhận tiền'}
             </button>`;

        // Ô cài / sửa STK (mở khi bấm dòng STK)
        let editorHtml = '';
        if (editingBankMember === m) {
          const selectedBin = bank.bankBin || MEMBER_BANK_OPTIONS[0].bin;
          const optionsHtml = MEMBER_BANK_OPTIONS.map(o =>
            `<option value="${o.bin}" ${o.bin === selectedBin ? 'selected' : ''}>${escapeAttr(o.name)}</option>`
          ).join('');
          editorHtml = `
            <div class="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div class="grid grid-cols-2 gap-2">
                <div class="min-w-0">
                  <label class="block text-[11px] font-semibold text-slate-500 mb-1">Ngân hàng</label>
                  <select data-bank-select class="w-full bg-white border border-slate-300 rounded-xl px-2 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600">${optionsHtml}</select>
                </div>
                <div class="min-w-0">
                  <label class="block text-[11px] font-semibold text-slate-500 mb-1">Số tài khoản</label>
                  <input type="text" data-bank-no inputmode="numeric" autocomplete="off" value="${escapeAttr(bank.accountNo || '')}" placeholder="0988123456" class="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600">
                </div>
              </div>
              <p data-momo-hint class="${selectedBin === MOMO_BIN ? '' : 'hidden'} text-[11px] leading-relaxed text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-2">${escapeAttr(MOMO_STK_HINT)}</p>
              <p data-bank-err class="hidden text-[11px] text-rose-600"></p>
              <div class="flex items-center gap-2">
                <button type="button" data-mem-action="bank-save" data-name="${safeName}" class="flex-1 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold transition cursor-pointer">Lưu STK</button>
                <button type="button" data-mem-action="bank-cancel" data-name="${safeName}" class="px-3.5 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">Hủy</button>
                ${hasBank ? `<button type="button" data-mem-action="bank-clear" data-name="${safeName}" class="px-3 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition cursor-pointer">Xóa STK</button>` : ''}
              </div>
            </div>`;
        }

        const row = document.createElement('div');
        row.className = "py-3 border-b border-slate-100 last:border-b-0";
        row.dataset.memberRow = m;
        row.innerHTML = `
          <div class="flex items-center gap-2.5">
            <span class="w-9 h-9 rounded-full ${isFundRow ? 'bg-amber-100 text-amber-800' : 'bg-indigo-50 text-indigo-700'} font-bold text-sm flex items-center justify-center shrink-0">
              ${escapeAttr(m.charAt(0).toUpperCase())}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-slate-900 text-sm">${safeName}</span>
                ${pillHtml}
                ${isFundRow ? '' : `<span class="text-[11px] text-slate-400">(${expenseCount} khoản)</span>`}
              </div>
              <div class="min-w-0 truncate">${bankLineHtml}</div>
            </div>
            <div class="shrink-0">${actionHtml}</div>
          </div>
          ${editorHtml}
        `;
        membersManageList.appendChild(row);
      });
    }

    // STK chỉ gồm chữ và số (STK định danh MoMo có chữ, ví dụ PSP...)
    function cleanMemberAccountNo(value) {
      return String(value || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    }

    // Lưu STK nhận tiền của một thành viên (dùng chung với popup QR: cùng dữ liệu memberBanks)
    function saveMemberBank(name, rowEl) {
      if (!rowEl) return;
      const sel = rowEl.querySelector('[data-bank-select]');
      const input = rowEl.querySelector('[data-bank-no]');
      const err = rowEl.querySelector('[data-bank-err]');
      const accountNo = input ? cleanMemberAccountNo(input.value) : '';

      if (!accountNo) {
        if (err) {
          err.textContent = 'Nhập số tài khoản (chỉ gồm chữ và số).';
          err.classList.remove('hidden');
        }
        if (input) input.focus();
        return;
      }

      const opt = MEMBER_BANK_OPTIONS.find(o => o.bin === sel.value) || MEMBER_BANK_OPTIONS[0];
      const old = memberBanks[name] || {};
      memberBanks[name] = {
        bankBin: opt.bin,
        bankCode: opt.code,
        accountNo: accountNo,
        accountName: old.accountName || name.toUpperCase()
      };
      editingBankMember = null;
      saveLedger();
      renderMembersManageList();
      showToast(`Đã lưu STK cho ${name}! Lần sau quét QR sẽ tự động dùng số này.`, '🏦');
    }

    window.removeMemberFromGroup = function(name) {
      const calc = calculateLedger();
      const netBal = calc.memberStats[name] ? calc.memberStats[name].netBalance : 0;
      if (Math.abs(netBal) >= 1) {
        const isDebtor = netBal < 0;
        showToast(`Không thể xóa ${name} vì chưa tất toán công nợ (còn ${isDebtor ? 'nợ' : 'được nhận'} ${formatMoney(Math.abs(netBal))} đ)! Vui lòng thanh toán bù trừ trước khi xóa.`, '⚠️');
        return;
      }
      const expenseCount = ledgerState.expenses.filter(e => e.payer === name || e.recipient === name || (Array.isArray(e.participants) && e.participants.includes(name))).length;
      const confirmMsg = expenseCount > 0
        ? `Bạn có chắc muốn xóa bạn "${name}" khỏi danh sách thành viên không?\n\n• Bạn này đã sạch nợ (0 đ).\n• Dữ liệu lịch sử ${expenseCount} khoản chi trước đây vẫn được lưu trữ nguyên vẹn.`
        : `Bạn có chắc muốn xóa bạn "${name}" khỏi danh sách thành viên không?`;
      if (!confirm(confirmMsg)) return;

      ledgerState.members = ledgerState.members.filter(m => m !== name);
      delete memberBanks[name];
      if (editingBankMember === name) editingBankMember = null;
      saveLedger();
      renderMembersManageList();
      renderApp();
      showToast(`Đã xóa ${name} khỏi danh sách thành viên!`, '🗑️');
    };

    // Một chỗ xử lý chung cho các nút trong danh sách (xóa, mở/lưu/hủy/xóa STK)
    membersManageList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mem-action]');
      if (!btn || !membersManageList.contains(btn)) return;
      const name = btn.dataset.name;
      const action = btn.dataset.memAction;

      if (action === 'remove') {
        removeMemberFromGroup(name);
      } else if (action === 'bank-edit') {
        editingBankMember = editingBankMember === name ? null : name;
        renderMembersManageList();
        if (editingBankMember === name) {
          const row = Array.from(membersManageList.children).find(r => r.dataset.memberRow === name);
          const input = row ? row.querySelector('[data-bank-no]') : null;
          if (input) input.focus();
        }
      } else if (action === 'bank-cancel') {
        editingBankMember = null;
        renderMembersManageList();
      } else if (action === 'bank-save') {
        saveMemberBank(name, btn.closest('[data-member-row]'));
      } else if (action === 'bank-clear') {
        const old = memberBanks[name] || {};
        memberBanks[name] = { ...old, accountNo: '' };
        editingBankMember = null;
        saveLedger();
        renderMembersManageList();
        showToast(`Đã xóa STK của ${name}.`, '🏦');
      }
    });

    // Số tài khoản chỉ nhận chữ và số, và xóa báo lỗi khi người dùng gõ lại
    membersManageList.addEventListener('input', (e) => {
      if (e.target.matches('[data-bank-no]')) {
        e.target.value = cleanMemberAccountNo(e.target.value);
        const err = e.target.closest('[data-member-row]')?.querySelector('[data-bank-err]');
        if (err) err.classList.add('hidden');
      }
    });

    // Chọn Ví MoMo thì hiện hướng dẫn lấy STK dạng PSP
    membersManageList.addEventListener('change', (e) => {
      if (e.target.matches('[data-bank-select]')) {
        const hint = e.target.closest('[data-member-row]')?.querySelector('[data-momo-hint]');
        if (hint) hint.classList.toggle('hidden', e.target.value !== MOMO_BIN);
      }
    });

    // Xóa toàn bộ thành viên trong nhóm (có kiểm tra an toàn công nợ)
    const btnClearAllMembersEl = document.getElementById('btnClearAllMembers');
    if (btnClearAllMembersEl) {
      btnClearAllMembersEl.addEventListener('click', () => {
        if (ledgerState.members.length === 0) return;
        const calc = calculateLedger();
        const unsettled = ledgerState.members.filter(m => Math.abs(calc.memberStats[m]?.netBalance || 0) >= 1);
        if (unsettled.length > 0) {
          showToast(`Không thể xóa toàn bộ vì có ${unsettled.length} bạn chưa tất toán nợ (${unsettled.join(', ')})! Cần trả hết nợ trước khi xóa.`, '⚠️');
          return;
        }

        if (!confirm(`Bạn có chắc muốn xóa TẤT CẢ ${ledgerState.members.length} thành viên khỏi danh sách không?\n\n• Các bạn đều đã sạch nợ (0 đ).\n• Lịch sử các khoản chi cũ vẫn được bảo lưu.`)) {
          return;
        }

        ledgerState.members = [];
        editingBankMember = null;
        saveLedger();
        renderMembersManageList();
        renderApp();
        showToast('Đã xóa toàn bộ thành viên khỏi nhóm!', '🗑️');
      });
    }

    // Thêm nhanh thành viên: nhiều tên cách nhau dấu phẩy, tên trùng thì bỏ qua và báo lại
    function submitQuickAddMembers() {
      const input = document.getElementById('inputQuickAddMembers');
      const names = input.value.split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (names.length === 0) {
        setMemberAddMsg('Nhập tên người cần thêm.', true);
        input.focus();
        return;
      }

      const added = [];
      const existed = [];
      const reserved = [];
      names.forEach(newName => {
        if (isReservedMemberName(newName)) {
          reserved.push(newName);
          return;
        }
        if (ledgerState.members.includes(newName) || added.includes(newName)) {
          existed.push(newName);
        } else {
          ledgerState.members.push(newName);
          memberBanks[newName] = { bankBin: "970422", bankCode: "MBBank", accountNo: "", accountName: newName.toUpperCase() };
          added.push(newName);
        }
      });

      input.value = '';
      const parts = [];
      if (added.length) parts.push(`Đã thêm ${added.join(', ')}.`);
      if (existed.length) parts.push(`Đã có sẵn: ${existed.join(', ')}.`);
      if (reserved.length) parts.push(`"${FUND_NAME}" là tên dành riêng cho quỹ, hãy đặt tên khác.`);
      setMemberAddMsg(parts.join(' '), added.length === 0);

      saveLedger();
      renderMembersManageList();
      renderApp();
      input.focus();
    }

    document.getElementById('btnSubmitQuickAddMembers').addEventListener('click', submitQuickAddMembers);
    document.getElementById('inputQuickAddMembers').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitQuickAddMembers();
      }
    });

