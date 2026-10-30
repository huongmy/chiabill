    // Sổ Quỹ: dữ liệu mẫu, ledgerState, lưu/đọc, tiện ích chung (tiền, ngày, escapeAttr), quỹ chung, calculateLedger
    // Dữ liệu mẫu ban đầu để demo (có thể nạp lại bất kỳ lúc nào)
    const DEMO_MEMBERS = ["An", "Bình", "Cường", "Dũng", "Hoa"];
    const DEMO_BANKS = {
      "An": { bankBin: "970422", bankCode: "MBBank", accountNo: "0988123456", accountName: "TRAN VAN AN" },
      "Bình": { bankBin: "970407", bankCode: "Techcombank", accountNo: "1903456789", accountName: "LE VAN BINH" },
      "Cường": { bankBin: "970422", bankCode: "MBBank", accountNo: "0988654321", accountName: "NGUYEN VAN CUONG" },
      "Dũng": { bankBin: "970432", bankCode: "VPBank", accountNo: "0934567890", accountName: "HOANG VAN DUNG" },
      "Hoa": { bankBin: "971025", bankCode: "MoMo", accountNo: "0912345678", accountName: "LE THI HOA" }
    };
    const DEMO_EXPENSES = [
      {
        id: 'exp-1',
        date: '2026-10-23',
        name: 'Lẩu liên hoan cuối tuần',
        amount: 900000,
        payer: 'An',
        participants: ['An', 'Bình', 'Cường', 'Dũng', 'Hoa']
      },
      {
        id: 'exp-2',
        date: '2026-10-24',
        name: 'Cafe sáng tán gẫu',
        amount: 120000,
        payer: 'An',
        participants: ['An', 'Cường', 'Dũng']
      },
      {
        id: 'exp-3',
        date: '2026-10-24',
        name: 'Ăn trưa',
        amount: 600000,
        payer: 'Dũng',
        participants: ['An', 'Bình', 'Dũng', 'Hoa']
      }
    ];

    const STORAGE_KEY_LEDGER = 'chiabill_ledger_data_v2';
    const STORAGE_BANKS_KEY = 'chiabill_member_banks_v2';
    const STORAGE_ARCHIVES_KEY = 'chiabill_ledger_archives_v2';

    const ledgerState = {
      title: "Sổ Chi Tiêu Nhóm",
      members: [],
      expenses: [],
      hideSettled: false,
      hidePayments: false,
      fundEnabled: false, // bật quỹ chung: hiện nút nộp quỹ, người trả "Quỹ chung"...
      fundRefund: false,  // chốt nợ: hiện cả các khoản quỹ hoàn lại cho từng người
      fundRounds: [],     // các đợt thu quỹ: { id, name, amount (mỗi người), date }
      fundExempt: []      // khách mời / người không phải đóng quỹ (không hiện trong danh sách thu)
    };

    // Danh bạ ngân hàng thực tế của từng thành viên
    const memberBanks = {};

    function saveLedger() {
      try {
        appStorage.setItem(STORAGE_KEY_LEDGER, JSON.stringify(ledgerState));
        appStorage.setItem(STORAGE_BANKS_KEY, JSON.stringify(memberBanks));
      } catch (e) {
        console.warn('Không thể lưu vào localStorage', e);
      }
    }

    function loadSavedLedger() {
      try {
        const raw = appStorage.getItem(STORAGE_KEY_LEDGER);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.members) && Array.isArray(parsed.expenses)) {
            // Tên cũ do lỗi "Xóa trắng" tự đặt vào thì đổi về tên mặc định
            ledgerState.title = (parsed.title && parsed.title !== 'Quỹ Ăn Trưa & Chi Tiêu Nhóm') ? parsed.title : "Sổ Chi Tiêu Nhóm";
            ledgerState.members = parsed.members;
            ledgerState.expenses = parsed.expenses;
            ledgerState.hideSettled = Boolean(parsed.hideSettled);
            ledgerState.hidePayments = Boolean(parsed.hidePayments);
            ledgerState.fundEnabled = Boolean(parsed.fundEnabled);
            ledgerState.fundRefund = Boolean(parsed.fundRefund);
            ledgerState.fundRounds = Array.isArray(parsed.fundRounds) ? parsed.fundRounds : [];
            ledgerState.fundExempt = Array.isArray(parsed.fundExempt) ? parsed.fundExempt : [];
            
            const rawBanks = appStorage.getItem(STORAGE_BANKS_KEY);
            if (rawBanks) {
              const parsedBanks = JSON.parse(rawBanks);
              if (parsedBanks && typeof parsedBanks === 'object') {
                Object.assign(memberBanks, parsedBanks);
              }
            }
            return true;
          }
        }
      } catch (e) {
        console.warn('Không thể nạp từ localStorage', e);
      }
      return false;
    }

    // Escape giá trị đưa vào thuộc tính HTML (data-*), tránh vỡ markup khi tên có dấu nháy
    function escapeAttr(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    // Ngày theo giờ máy, định dạng YYYY-MM-DD. Không dùng toISOString() vì nó trả về ngày UTC,
    // nên từ 0h đến 7h sáng ở Việt Nam sẽ ra ngày hôm qua.
    function getLocalDateString(d = new Date()) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    function formatMoney(num) {
      return (num || 0).toLocaleString('vi-VN');
    }

    // Toast thông báo tức thì (dùng chung cho cả 1 Bữa và Sổ Quỹ)
    let toastTimer = null;
    function showToast(message, icon = '') {
      const toast = document.getElementById('appToast');
      const msgEl = document.getElementById('appToastMessage');
      const iconEl = document.getElementById('appToastIcon');
      if (!toast || !msgEl) return;

      if (toastTimer) clearTimeout(toastTimer);
      // Bỏ emoji đầu câu cho gọn; chấm màu báo loại thông báo: xanh = xong, vàng = cảnh báo / bị chặn, đỏ = lỗi
      msgEl.textContent = String(message).replace(/^[\p{Extended_Pictographic}\uFE0F\u200d\s]+/u, '');
      if (iconEl) {
        const warn = icon === '⚠️' || icon === '🔒';
        const fail = icon === '❌';
        iconEl.className = 'w-2 h-2 rounded-full shrink-0 ' + (fail ? 'bg-rose-400' : warn ? 'bg-amber-400' : 'bg-emerald-400');
      }

      // Toast chỉ để đọc, luôn giữ pointer-events-none để không chặn bấm các nút phía sau
      toast.classList.remove('opacity-0', '-translate-y-4');
      toast.classList.add('opacity-100', 'translate-y-0');

      toastTimer = setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', '-translate-y-4', 'pointer-events-none');
        toastTimer = null;
      }, 3500);
    }

    function getWeekdayInfo(dateString) {
      if (!dateString) return { shortName: '', fullName: '', isWeekend: false, colorClass: '' };
      
      const parts = dateString.split('-');
      const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      const day = date.getDay();

      const map = {
        0: { shortName: 'CN', fullName: 'Chủ Nhật', isWeekend: true, colorClass: 'bg-rose-100 text-rose-700 border-rose-200' },
        1: { shortName: 'T2', fullName: 'Thứ Hai', isWeekend: false, colorClass: 'bg-slate-100 text-slate-700 border-slate-200' },
        2: { shortName: 'T3', fullName: 'Thứ Ba', isWeekend: false, colorClass: 'bg-slate-100 text-slate-700 border-slate-200' },
        3: { shortName: 'T4', fullName: 'Thứ Tư', isWeekend: false, colorClass: 'bg-slate-100 text-slate-700 border-slate-200' },
        4: { shortName: 'T5', fullName: 'Thứ Năm', isWeekend: false, colorClass: 'bg-slate-100 text-slate-700 border-slate-200' },
        5: { shortName: 'T6', fullName: 'Thứ Sáu', isWeekend: false, colorClass: 'bg-purple-100 text-purple-800 border-purple-200' },
        6: { shortName: 'T7', fullName: 'Thứ Bảy', isWeekend: true, colorClass: 'bg-amber-100 text-amber-800 border-amber-200' },
      };

      return map[day] || { shortName: 'T?', fullName: 'Không rõ', isWeekend: false, colorClass: 'bg-slate-100 text-slate-700 border-slate-200' };
    }

    function formatDateDisplay(dateString) {
      if (!dateString) return '';
      const parts = dateString.split('-');
      return `${parts[2]}/${parts[1]}`;
    }

    // ===== QUỸ CHUNG (tùy chọn, lúc có lúc không) =====
    // Quỹ là một "người" đặc biệt giữ hộ tiền. Quỹ không nằm trong ledgerState.members và không bao giờ có trong "Chia cho".
    // Sổ không dùng quỹ thì mọi thứ chạy y như cũ.
    const FUND_NAME = 'Quỹ chung';

    // Nguồn tiền ngoài (tài trợ, ủng hộ...) cũng là một "người" đặc biệt: không phải thành viên, không có phần để chia hay đòi nợ.
    // Tiền này được quỹ dùng trước; phần quỹ chi hộ bằng tiền tài trợ không tính vào phần các bạn phải chịu.
    const EXTERNAL_NAME = 'Nguồn ngoài';
    function isPseudoMember(name) {
      return name === FUND_NAME || name === EXTERNAL_NAME;
    }

    // Nhãn cho các khoản mang sang kỳ mới (nợ giữa người với người, hoặc giữa thành viên với quỹ)
    function carryPairLabel(from, to) {
      if (from === FUND_NAME && to === EXTERNAL_NAME) return 'Quỹ còn giữ tiền tài trợ';
      if (to === FUND_NAME) return `${from} còn phải nộp quỹ`;
      if (from === FUND_NAME) return `Quỹ phải trả lại ${to}`;
      return `${from} nợ ${to}`;
    }

    // Số lượt trả nợ khiến khoản chi bị khóa. Tiền NỘP QUỸ ban đầu (isFundDeposit) không phụ thuộc khoản chi nào nên không khóa.
    function countLockingPayments(expenses) {
      return new Set(expenses.filter(e => e.isPayment && (!e.isFundDeposit || e.settleId)).map(e => e.settleId || e.id)).size;
    }

    // Quỹ đang dùng: người dùng đã bật, hoặc sổ đã có hoạt động quỹ (dữ liệu có quỹ vẫn hiển thị đủ dù đã tắt)
    function isFundOn() {
      return Boolean(ledgerState.fundEnabled) || calculateLedger().fundActive;
    }

    // "Quỹ chung" là tên dành riêng, không dùng làm tên thành viên
    function isReservedMemberName(name) {
      const n = String(name).trim().replace(/\s+/g, ' ').toLowerCase();
      return n === FUND_NAME.toLowerCase() || n === EXTERNAL_NAME.toLowerCase();
    }

    // Ghi chú mặc định và nhãn cho các lượt chuyển tiền (trả nợ, nộp quỹ, quỹ hoàn lại)
    function defaultPaymentNote(from, to) {
      if (from === EXTERNAL_NAME) return 'Tài trợ cho quỹ';
      if (to === FUND_NAME) return `${from} nộp quỹ`;
      if (from === FUND_NAME) return `Quỹ hoàn lại cho ${to}`;
      return `${from} chuyển trả nợ cho ${to}`;
    }

    // Ghi một lượt trả ở Chốt nợ. Nộp vào quỹ thì phần bù cho đợt thu người đó chưa nộp được ghi luôn là nộp đợt đó
    // (đợt thu tự tick, khỏi tick lại rồi bị tính 2 lần); phần còn lại là trả phần còn nợ quỹ.
    // Các khoản tách ra dùng chung settleId để hiện và hoàn tác như một lượt.
    function buildSettlementEntries(payer, recipient, amount, date, note) {
      const settleId = 'pay-' + Date.now();
      const base = { isPayment: true, date, name: note, payer, recipient, participants: [recipient], settleId };
      const entries = [];
      let rest = amount;
      const owesRounds = recipient === FUND_NAME && ledgerState.members.includes(payer) && !(ledgerState.fundExempt || []).includes(payer);
      if (owesRounds) {
        const rounds = ledgerState.fundRounds || [];
        const deposits = ledgerState.expenses.filter(e => e.isFundDeposit && e.payer === payer);
        const roundsTotal = rounds.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        let unpaid = Math.max(0, roundsTotal - deposits.reduce((s, e) => s + e.amount, 0));
        rounds.forEach((r, i) => {
          if (rest <= 0 || unpaid <= 0 || deposits.some(e => e.roundId === r.id)) return;
          const part = Math.min(rest, unpaid, Number(r.amount) || 0);
          if (part <= 0) return;
          entries.push({ ...base, id: `${settleId}-r${i}`, isFundDeposit: true, roundId: r.id, amount: part });
          rest -= part;
          unpaid -= part;
        });
      }
      if (rest > 0) entries.push({ ...base, id: settleId, amount: rest });
      return entries;
    }

    function paymentKindLabel(exp) {
      const recipient = exp.recipient || (exp.participants || [])[0] || '';
      if (exp.payer === EXTERNAL_NAME) return 'tài trợ';
      if (exp.isFundDeposit || recipient === FUND_NAME) return 'nộp quỹ';
      if (exp.payer === FUND_NAME) return 'quỹ hoàn';
      return 'trả nợ';
    }

    // Tóm tắt quỹ: đã nhận (nộp + các lượt nộp khi chốt nợ), đã hoàn lại, đã chi hộ, còn lại.
    // Tiền vào quỹ tách 2 phần: đóng quỹ (đợt thu, tab Nộp quỹ) và bù phần quỹ chi vượt (nộp khi chốt nợ ngoài đợt thu).
    function getFundSummary(calc) {
      const s = calc.memberStats[FUND_NAME];
      const topUp = calc.expenseBreakdowns
        .filter(e => e.isPayment && !e.isFundDeposit && e.recipient === FUND_NAME && e.payer !== EXTERNAL_NAME)
        .reduce((sum, e) => sum + e.amount, 0);
      return {
        topUp,
        received: s ? s.settlementReceived : 0,
        refunded: s ? s.settlementPaid : 0,
        spent: s ? s.expensePaid : 0,
        cash: calc.fundCash,
        // Tiền tài trợ: tổng đã nhận và số còn lại (chưa chi hộ)
        sponsored: calc.memberStats[EXTERNAL_NAME] ? calc.memberStats[EXTERNAL_NAME].fundIn : 0,
        sponsorLeft: calc.sponsorLeft || 0
      };
    }

    function fundCashText(cash) {
      return cash >= 0 ? `Quỹ còn ${formatMoney(cash)} đ` : `Quỹ thiếu ${formatMoney(-cash)} đ`;
    }

    // Số dư hiển thị của một người (tiền nộp quỹ chưa dùng không tính), làm tròn
    function shownBalance(stat) {
      return Math.round((stat && (stat.displayBalance ?? stat.netBalance)) || 0);
    }

    // Nhãn số dư một người: chỉ còn thiếu với quỹ thì "Cần nộp quỹ", còn lại "Được nhận" / "Cần trả"
    function balanceLabel(calc, stat) {
      const bal = shownBalance(stat);
      if (Math.abs(bal) < 1) return 'Cân bằng';
      if (bal > 0) return 'Được nhận';
      const fundOnly = calc.fundActive && Math.round(stat.peerBalance || 0) >= -100;
      return fundOnly ? 'Cần nộp quỹ' : 'Cần trả';
    }

    // Thủ quỹ cài STK như một thành viên: cần sẵn mục ngân hàng rỗng để ô QR không dùng số mẫu
    function ensureFundBank(calc) {
      if ((calc.fundActive || ledgerState.fundEnabled) && !memberBanks[FUND_NAME]) {
        memberBanks[FUND_NAME] = { bankBin: "970422", bankCode: "MBBank", accountNo: "", accountName: FUND_NAME.toUpperCase() };
      }
    }

    // Bật / tắt dùng quỹ. Quỹ đã có giao dịch thì không tắt được (tắt sẽ làm mất tab Nộp quỹ nhưng số dư vẫn còn)
    window.toggleFundEnabled = function() {
      const calc = calculateLedger();
      if (calc.fundActive) {
        showToast('Quỹ đang có giao dịch nên chưa tắt được. Muốn tắt, hãy xóa hoặc hoàn tác các khoản nộp quỹ và khoản chi từ quỹ trước.', '⚠️');
        return;
      }
      ledgerState.fundEnabled = !ledgerState.fundEnabled;
      renderApp();
      showToast(ledgerState.fundEnabled
        ? 'Đã bật Quỹ chung. Khi ghi khoản sẽ có tab Nộp quỹ và người trả "Quỹ chung". Ai không nộp quỹ vẫn chia tiền như thường.'
        : 'Đã tắt Quỹ chung.', '🏦');
    };

    window.setFundRefund = function(on) {
      ledgerState.fundRefund = Boolean(on);
      renderApp();
    };

    function updateFundMenu(calc) {
      const state = document.getElementById('menuFundState');
      if (!state) return;
      const on = Boolean(ledgerState.fundEnabled) || calc.fundActive;
      state.textContent = on ? 'Bật' : 'Tắt';
      state.className = 'px-1.5 py-0.5 rounded-full text-[10px] font-bold ' + (on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500');
      const manage = document.getElementById('btnMenuFundManage');
      if (manage) manage.classList.toggle('hidden', !on);
    }

    // Sổ có quỹ: quỹ là tiền chung.
    //  - Khoản do một bạn ứng: những người được chia trả thẳng cho bạn đó (peerBalance).
    //  - Mỗi người trong danh sách đóng quỹ góp đủ tiền các đợt thu, nộp hay chưa đều tính vào tiền quỹ; chưa nộp thì còn nợ quỹ.
    //  - Khoản quỹ trả: quỹ gánh bằng tiền chung theo thứ tự trong sổ. Quỹ không đủ thì phần thiếu chia cho người tham gia
    //    khoản đó theo tỉ lệ phần của họ (kể cả khách không đóng quỹ).
    //  - Quỹ còn dư là tiền chung: chỉ khi bật trả lại tiền quỹ mới chia lại theo tỉ lệ đóng góp (fundBalance dương).
    // Ghi kết quả vào memberStats: peerBalance, fundBalance và các phần để giải thích (balanceTerms, fundCovered).
    function splitFundAndPeer(breakdowns, memberStats, people) {
      const isPerson = m => people.includes(m);
      const zero = () => Object.fromEntries(people.map(m => [m, 0]));
      const peer = zero(), settle = zero(), carryPeer = zero(), peerConsumed = zero();
      const fundDirect = zero(), deposits = zero(), carried = zero(), covered = zero(), uncovered = zero();
      const fundItems = [];

      breakdowns.forEach(e => {
        if (e.isPayment) {
          const from = e.payer;
          const to = e.recipient;
          if (to === FUND_NAME && isPerson(from)) {
            // Nộp quỹ (đợt thu, tab Nộp quỹ) là tiền góp vào quỹ; nộp khi chốt nợ là trả phần còn nợ quỹ
            if (e.isFundDeposit) deposits[from] += e.amount;
            else fundDirect[from] += e.amount;
          } else if (from === FUND_NAME && isPerson(to)) {
            fundDirect[to] -= e.amount;
          } else if (isPerson(from) && isPerson(to)) {
            peer[from] += e.amount; settle[from] += e.amount;
            peer[to] -= e.amount; settle[to] -= e.amount;
          }
          return;
        }

        const parts = e.participants || [];
        const shareSum = parts.reduce((s, p) => s + (e.rowShares[p] || 0), 0);
        if (shareSum <= 0) return;
        const fundBorne = (e.payer === FUND_NAME ? e.amount : e.fundPart) - (e.subsidy || 0);
        const payerBorne = e.payer === FUND_NAME ? 0 : e.payerPart;
        const item = { total: fundBorne, shares: {} };
        parts.forEach(p => {
          const s = e.rowShares[p] || 0;
          if (!s) return;
          const toPayer = s * payerBorne / shareSum;
          const toFund = s * fundBorne / shareSum;
          if (toPayer > 0 && isPerson(e.payer)) {
            if (isPerson(p)) {
              peer[e.payer] += toPayer;
              peer[p] -= toPayer;
              if (e.isCarryOver) { carryPeer[e.payer] += toPayer; carryPeer[p] -= toPayer; }
              else peerConsumed[p] += toPayer;
            } else if (p === FUND_NAME) {
              // Nợ tồn "quỹ phải trả lại": tiền của người đó còn trong quỹ, tính như tiền góp quỹ
              carried[e.payer] += toPayer;
            }
          }
          if (toFund > 0 && isPerson(p)) {
            if (e.isCarryOver) fundDirect[p] -= toFund; // nợ tồn "còn phải nộp quỹ"
            else item.shares[p] = (item.shares[p] || 0) + toFund;
          }
        });
        if (!e.isCarryOver && fundBorne > 0) fundItems.push(item);
      });

      // Tiền quỹ = tiền góp của từng người: đủ số các đợt thu (dù chưa nộp) hoặc số đã nộp nếu nhiều hơn, cộng tiền mang từ kỳ trước
      const roundsTotal = (ledgerState.fundRounds || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const exempt = ledgerState.fundExempt || [];
      const obligation = zero();
      ledgerState.members.forEach(m => { if (isPerson(m) && !exempt.includes(m)) obligation[m] = roundsTotal; });
      const contrib = zero();
      let pool = 0;
      people.forEach(m => { contrib[m] = Math.max(obligation[m], deposits[m]) + carried[m]; pool += contrib[m]; });
      const totalContrib = pool;

      // Quỹ gánh từng khoản theo thứ tự; phần vượt quá tiền quỹ còn lại chia cho người tham gia khoản đó
      fundItems.forEach(it => {
        const cov = Math.min(pool, it.total);
        pool -= cov;
        const coveredRatio = it.total > 0 ? cov / it.total : 1;
        Object.entries(it.shares).forEach(([p, v]) => {
          covered[p] += v * coveredRatio;
          uncovered[p] += v * (1 - coveredRatio);
        });
      });

      people.forEach(m => {
        const s = memberStats[m];
        const unpaid = Math.max(0, obligation[m] - deposits[m]);
        const leftover = totalContrib > 0 ? pool * contrib[m] / totalContrib : 0;
        s.peerBalance = Math.round(peer[m]);
        s.fundBalance = Math.round(fundDirect[m] - unpaid - uncovered[m] + leftover);
        s.fundCovered = covered[m];
        s.fundUnpaid = unpaid;
        // Các hàng của bảng: chưa đóng quỹ, đã bù quỹ khi chốt. Hàng Quỹ gánh là phần còn lại để cộng đúng Số dư.
        s.fundRows = { unpaid: -unpaid, direct: fundDirect[m] };
        // Các phần cộng lại thành số dư hiển thị (phần với quỹ chỉ ghi khi còn nợ quỹ)
        s.balanceTerms = [
          ['ứng tiền', s.expensePaid || 0],
          ['đã chuyển / nhận', settle[m]],
          ['nợ tồn', carryPeer[m]],
          ['phần của mình', -peerConsumed[m]]
        ].concat(s.fundBalance < 0 ? [
          ['chưa nộp quỹ', -unpaid],
          ['phần quỹ thiếu', -uncovered[m]],
          ['đã nộp quỹ khi chốt', fundDirect[m]],
          ['phần quỹ dư', leftover]
        ] : []);
      });
    }

    // 2. TÍNH TOÁN CÔNG NỢ & BÙ TRỪ NỢ LIÊN TỤC (CÁCH 1)
    // Khoản "nợ tồn kỳ trước" do chức năng Đóng kỳ tạo ra (cũng nhận ra các dòng cũ có id bắt đầu bằng rollover-)
    function isCarryOverEntry(e) {
      return Boolean(e && (e.isCarryOver || (typeof e.id === 'string' && e.id.indexOf('rollover-') === 0)));
    }

    function calculateLedger() {
      // Tập hợp tất cả thành viên: thành viên hiện tại + thành viên cũ từng có giao dịch
      const historicalMembersSet = new Set();
      ledgerState.expenses.forEach(e => {
        if (e.payer) historicalMembersSet.add(e.payer);
        if (e.recipient) historicalMembersSet.add(e.recipient);
        if (!e.isPayment && Number(e.fundAmount) > 0) historicalMembersSet.add(FUND_NAME);
        if (Array.isArray(e.participants)) {
          e.participants.forEach(p => historicalMembersSet.add(p));
        }
      });
      // allMembers dùng nội bộ cho tính toán chia tiền và cân đối nợ
      const allMembers = Array.from(new Set([...ledgerState.members, ...historicalMembersSet]));

      const memberStats = {};
      allMembers.forEach(m => {
        memberStats[m] = {
          name: m,
          paidTotal: 0,
          consumedTotal: 0,
          expensePaid: 0,
          expenseConsumed: 0,
          settlementPaid: 0,
          settlementReceived: 0,
          fundIn: 0,
          fundOut: 0,
          carryNet: 0,
          netBalance: 0
        };
      });

      let grandTotal = 0;
      let totalSettled = 0;

      // Tiền tài trợ dùng được: toàn bộ khoản tài trợ đã ghi (và số mang sang từ kỳ trước), KHÔNG phụ thuộc ngày ghi,
      // để ghi tài trợ sau khoản chi vẫn tính đúng. Các khoản quỹ chi dùng dần theo thứ tự trong sổ.
      let sponsorPool = ledgerState.expenses
        .filter(e => e.payer === EXTERNAL_NAME && (e.isPayment ? e.isFundDeposit : isCarryOverEntry(e)))
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);

      const expenseBreakdowns = ledgerState.expenses.map(exp => {
        const isPayment = Boolean(exp.isPayment);

        if (isPayment) {
          totalSettled += exp.amount;

          // Nộp quỹ / quỹ hoàn lại tính riêng (fundIn / fundOut), các lượt trả nợ còn lại giữ nguyên
          if (memberStats[exp.payer]) {
            memberStats[exp.payer].paidTotal += exp.amount;
            if (exp.recipient === FUND_NAME) memberStats[exp.payer].fundIn += exp.amount;
            else memberStats[exp.payer].settlementPaid += exp.amount;
          }
          if (memberStats[exp.recipient]) {
            memberStats[exp.recipient].consumedTotal += exp.amount;
            if (exp.payer === FUND_NAME) memberStats[exp.recipient].fundOut += exp.amount;
            else memberStats[exp.recipient].settlementReceived += exp.amount;
          }

          const rowShares = {};
          allMembers.forEach(m => {
            if (m === exp.payer) {
              rowShares[m] = exp.amount;
            } else if (m === exp.recipient) {
              rowShares[m] = -exp.amount;
            } else {
              rowShares[m] = 0;
            }
          });

          return {
            ...exp,
            isPayment: true,
            weekdayInfo: getWeekdayInfo(exp.date),
            sharePerPerson: 0,
            rowShares
          };
        } else {
          // Nợ tồn kỳ trước: tính vào số dư nhưng KHÔNG tính vào tổng chi, "đã ứng", "cần chi" của kỳ này
          const isCarry = isCarryOverEntry(exp);
          if (!isCarry) grandTotal += exp.amount;

          // Quỹ trả một phần (fundAmount); phần còn lại do người trả ứng. Người trả là quỹ chung thì quỹ trả hết.
          const fundPart = exp.payer === FUND_NAME ? 0 : Math.min(Math.max(0, Number(exp.fundAmount) || 0), exp.amount);
          const payerPart = exp.amount - fundPart;

          if (memberStats[exp.payer]) {
            memberStats[exp.payer].paidTotal += payerPart;
            if (isCarry) memberStats[exp.payer].carryNet += payerPart;
            else memberStats[exp.payer].expensePaid += payerPart;
          }
          if (fundPart > 0 && memberStats[FUND_NAME]) {
            memberStats[FUND_NAME].paidTotal += fundPart;
            memberStats[FUND_NAME].expensePaid += fundPart;
          }

          // Phần cố định: người có phần cố định chịu đúng số đó, số còn lại chia đều cho những người còn lại
          const participants = Array.isArray(exp.participants) ? exp.participants : [];
          const fixedMap = (!isCarry && exp.fixedShares && typeof exp.fixedShares === 'object') ? exp.fixedShares : {};
          const fixedPeople = participants.filter(p => Number(fixedMap[p]) > 0);
          const evenPeople = participants.filter(p => !fixedPeople.includes(p));
          const fixedSum = fixedPeople.reduce((s, p) => s + Number(fixedMap[p]), 0);
          const restAmount = Math.max(0, exp.amount - fixedSum);
          // Phần quỹ chi hộ bằng tiền tài trợ thì không tính vào phần các bạn chịu: chỉ giảm phần chia đều
          const fundTotal = exp.payer === FUND_NAME ? exp.amount : fundPart;
          const subsidy = (!isCarry && evenPeople.length > 0) ? Math.max(0, Math.min(sponsorPool, fundTotal, restAmount)) : 0;
          if (subsidy > 0) {
            sponsorPool -= subsidy;
            if (memberStats[EXTERNAL_NAME]) {
              memberStats[EXTERNAL_NAME].consumedTotal += subsidy;
              memberStats[EXTERNAL_NAME].expenseConsumed += subsidy;
            }
          }
          const sharePerPerson = evenPeople.length > 0 ? Math.round((restAmount - subsidy) / evenPeople.length) : 0;

          const rowShares = {};
          allMembers.forEach(m => {
            if (participants.includes(m)) {
              const share = fixedPeople.includes(m) ? Number(fixedMap[m]) : sharePerPerson;
              rowShares[m] = share;
              memberStats[m].consumedTotal += share;
              if (isCarry) memberStats[m].carryNet -= share;
              else memberStats[m].expenseConsumed += share;
            } else {
              rowShares[m] = 0;
            }
          });

          return {
            ...exp,
            isPayment: false,
            isCarryOver: isCarry,
            weekdayInfo: getWeekdayInfo(exp.date),
            sharePerPerson,
            fundPart,
            payerPart,
            subsidy,
            fixedPeople,
            evenCount: evenPeople.length,
            rowShares
          };
        }
      });

      allMembers.forEach(m => {
        memberStats[m].netBalance = memberStats[m].paidTotal - memberStats[m].consumedTotal;
      });

      // Lọc thành viên hiển thị trên các cột bảng Matrix:
      // 1. Luôn hiển thị các thành viên trong ledgerState.members
      // 2. Nếu thành viên cũ KHÔNG còn trong ledgerState.members nhưng VẪN CÒN NỢ (|netBalance| >= 1),
      //    thì vẫn phải hiển thị cột để tránh sót nợ!
      // 3. Thành viên cũ đã sạch nợ (|netBalance| < 1) và đã bị xóa khỏi ledgerState.members sẽ KHÔNG hiện cột.
      // 4. Nếu bật 'Ẩn người hết nợ 0đ' (ledgerState.hideSettled), ẩn thêm các cột có netBalance = 0.
      const displaySet = new Set(ledgerState.members);
      allMembers.forEach(m => {
        if (!isPseudoMember(m) && Math.abs(memberStats[m].netBalance) >= 1) {
          displaySet.add(m);
        }
      });
      let displayMembers = Array.from(displaySet);
      if (ledgerState.hideSettled) {
        const unsettled = displayMembers.filter(m => Math.abs(memberStats[m].netBalance) >= 1);
        if (unsettled.length > 0) {
          displayMembers = unsettled;
        }
      }

      // Ghép người nợ lớn nhất với người được nhận lớn nhất (bỏ qua chênh lệch dưới 100 đ)
      const matchTransfers = (names, balanceOf = m => memberStats[m].netBalance) => {
        const debtors = [];
        const creditors = [];
        names.forEach(m => {
          const bal = balanceOf(m);
          if (bal < -100) {
            debtors.push({ name: m, amount: Math.abs(bal) });
          } else if (bal > 100) {
            creditors.push({ name: m, amount: bal });
          }
        });

        debtors.sort((a, b) => b.amount - a.amount);
        creditors.sort((a, b) => b.amount - a.amount);

        const out = [];
        let dIdx = 0;
        let cIdx = 0;

        while (dIdx < debtors.length && cIdx < creditors.length) {
          const debtor = debtors[dIdx];
          const creditor = creditors[cIdx];
          const settleAmount = Math.min(debtor.amount, creditor.amount);

          if (settleAmount > 0) {
            out.push({
              from: debtor.name,
              to: creditor.name,
              amount: Math.round(settleAmount)
            });
          }

          debtor.amount -= settleAmount;
          creditor.amount -= settleAmount;

          if (debtor.amount <= 100) dIdx++;
          if (creditor.amount <= 100) cIdx++;
        }
        return out;
      };

      // Sổ có hoạt động quỹ: nợ giữa các bạn (khoản do một bạn ứng) trả thẳng cho người đã ứng, quỹ không đụng tới.
      // Riêng số dư với quỹ: âm thì nộp quỹ; dương thì quỹ giữ hộ (bật ledgerState.fundRefund thì hiện các khoản quỹ hoàn lại).
      const fundActive = allMembers.includes(FUND_NAME);

      // Tách số dư mỗi người: peerBalance (với các bạn) và fundBalance (với quỹ: âm là còn phải nộp, dương là phần quỹ dư).
      // Số dư hiển thị không tính phần quỹ dư: tiền quỹ chưa dùng là tiền chung, để yên.
      // fundShown: phần quỹ trong số dư hiển thị (hàng "Phần quỹ" ở bảng), để các hàng cộng lại đúng Số dư.
      if (fundActive) {
        splitFundAndPeer(expenseBreakdowns, memberStats, allMembers.filter(m => !isPseudoMember(m)));
      }
      allMembers.forEach(m => {
        const s = memberStats[m];
        if (!fundActive || isPseudoMember(m)) {
          s.peerBalance = s.netBalance;
          s.fundBalance = 0;
        }
        s.displayBalance = fundActive && !isPseudoMember(m) ? s.peerBalance + Math.min(0, s.fundBalance) : s.netBalance;
        s.fundShown = s.displayBalance - (s.expensePaid + (s.settlementPaid - s.settlementReceived) + s.carryNet - s.expenseConsumed);
      });
      // Tiền tài trợ còn lại trong quỹ (số dư của "Nguồn ngoài"), không thuộc về thành viên nào
      const sponsorStat = memberStats[EXTERNAL_NAME];
      const sponsorLeft = sponsorStat && sponsorStat.netBalance > 100 ? Math.round(sponsorStat.netBalance) : 0;
      let transfers;
      let carryPairs;
      let fundHeld = [];

      if (!fundActive) {
        transfers = matchTransfers(allMembers);
        carryPairs = transfers;
      } else {
        const people = allMembers.filter(m => !isPseudoMember(m));
        const peerTransfers = matchTransfers(people, m => memberStats[m].peerBalance);
        const toFund = [];
        const fromFund = [];
        people.forEach(m => {
          const bal = memberStats[m].fundBalance;
          if (bal < -100) toFund.push({ from: m, to: FUND_NAME, amount: Math.round(-bal) });
          else if (bal > 100) fromFund.push({ from: FUND_NAME, to: m, amount: Math.round(bal) });
        });
        toFund.sort((a, b) => b.amount - a.amount);
        fromFund.sort((a, b) => b.amount - a.amount);
        carryPairs = peerTransfers.concat(toFund, fromFund);
        // Tiền tài trợ còn lại cũng mang sang kỳ mới để số quỹ không bị mất
        if (sponsorLeft > 0) carryPairs.push({ from: FUND_NAME, to: EXTERNAL_NAME, amount: sponsorLeft });
        fundHeld = fromFund.map(t => ({ name: t.to, amount: t.amount }));
        transfers = peerTransfers.concat(toFund, ledgerState.fundRefund ? fromFund : []);
      }
      const fundStat = memberStats[FUND_NAME];
      const fundCash = fundStat ? (0 - fundStat.netBalance) || 0 : 0;

      return {
        allMembers,
        displayMembers,
        grandTotal,
        totalSettled,
        expenseBreakdowns,
        memberStats,
        transfers,
        carryPairs,
        fundActive,
        fundHeld,
        fundCash,
        sponsorLeft
      };
    }

    // 3. RENDER GIAO DIỆN
