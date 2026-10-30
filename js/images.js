    // Ảnh: dựng QR VietQR, ảnh chốt nợ cả nhóm, ảnh riêng từng người (1 Bữa và Sổ Quỹ), popup tải/chia sẻ
    // ==================== ẢNH CHỐT NỢ (kèm mã QR từng khoản) ====================
    // Mã QR dựng ngay trên máy theo chuẩn VietQR (NAPAS 247), không cần mạng. Nội dung đã đối chiếu
    // từng ký tự với API VietQR cho cùng dữ liệu, kể cả mã kiểm tra CRC.
    function vietQrCrc16(str) {
      let crc = 0xFFFF;
      for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
          crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
        }
      }
      return crc.toString(16).toUpperCase().padStart(4, '0');
    }

    function vietQrField(id, value) {
      return id + String(value.length).padStart(2, '0') + value;
    }

    // Chuỗi nội dung QR chuyển khoản nhanh tới số tài khoản (kèm số tiền và nội dung nếu có)
    function buildVietQrPayload(bin, accountNo, amount, memo) {
      const bankInfo = vietQrField('00', bin) + vietQrField('01', accountNo);
      const merchant = vietQrField('38',
        vietQrField('00', 'A000000727') + vietQrField('01', bankInfo) + vietQrField('02', 'QRIBFTTA'));
      let payload = vietQrField('00', '01') + vietQrField('01', amount > 0 ? '12' : '11') + merchant + vietQrField('53', '704');
      if (amount > 0) payload += vietQrField('54', String(amount));
      payload += vietQrField('58', 'VN');
      if (memo) payload += vietQrField('62', vietQrField('08', memo));
      payload += '6304';
      return payload + vietQrCrc16(payload);
    }

    // Nội dung chuyển khoản không dấu, tối đa 25 ký tự (app ngân hàng hay cắt hoặc từ chối ký tự lạ)
    function toAsciiMemo(text) {
      return String(text)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/[^A-Za-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ').trim()
        .slice(0, 25).trim();
    }

    // Vẽ QR bằng qrcodejs rồi lấy ảnh PNG dạng data URL (không dính CORS khi chụp ảnh)
    function makeQrDataUrl(text, size) {
      if (typeof QRCode === 'undefined' || !text) return '';
      const holder = document.createElement('div');
      holder.style.cssText = 'position:absolute;left:-9999px;top:0;width:300px;height:300px;opacity:0;pointer-events:none;';
      document.body.appendChild(holder);
      try {
        new QRCode(holder, {
          text: text,
          width: size || 280,
          height: size || 280,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel ? QRCode.CorrectLevel.L : 1
        });
        const canvas = holder.querySelector('canvas');
        if (canvas) return canvas.toDataURL('image/png');
        const img = holder.querySelector('img');
        if (img && img.src && img.src.startsWith('data:')) return img.src;
        return '';
      } catch (err) {
        console.warn('QR local render error:', err);
        return '';
      } finally {
        holder.remove();
      }
    }

    // Bộ đệm ảnh VietQR chính thức (chuẩn Napas 24/7 như ảnh mẫu, 0 CORS)
    const vietQrDataCache = {};
    async function getRecipientVietQrUrl(bank, memo, amount = 0) {
      if (!bank || !bank.accountNo) return '';
      const bankId = bank.bankBin || (bank.bankCode === 'MoMo' ? '971025' : '970422');
      const accountNo = String(bank.accountNo).trim();
      const accountName = String(bank.accountName || '').trim();
      const cacheKey = `${bankId}_${accountNo}_${amount}_${memo}`;
      if (vietQrDataCache[cacheKey]) return vietQrDataCache[cacheKey];

      // Tier 1: Gọi API VietQR chính thức trả về PNG base64 (đầy đủ logo Napas, ngân hàng y như bill mẫu)
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 2200);
        const resp = await fetch('https://api.vietqr.io/v2/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountNo: accountNo,
            accountName: accountName,
            acqId: bankId,
            amount: amount > 0 ? amount : undefined,
            addInfo: memo,
            template: 'compact2'
          }),
          signal: ctrl.signal
        });
        clearTimeout(tid);
        const resData = await resp.json();
        if (resData && resData.data && resData.data.qrDataURL) {
          vietQrDataCache[cacheKey] = resData.data.qrDataURL;
          return vietQrDataCache[cacheKey];
        }
      } catch (err) {
        console.warn('VietQR API unavailable or timed out, trying local fallback:', err);
      }

      // Tier 2: Vẽ bằng thư viện QRCode nội bộ (hoạt động 100% offline không cần mạng)
      try {
        const payload = buildVietQrPayload(bankId, accountNo, amount, memo);
        const local = makeQrDataUrl(payload, 280);
        if (local) {
          vietQrDataCache[cacheKey] = local;
          return local;
        }
      } catch (err2) {
        console.warn('Local QR generator fallback error:', err2);
      }

      return '';
    }

    // Dựng khối "hóa đơn chốt nợ" (ẩn ngoài màn hình) để chụp thành ảnh. Hai kiểu:
    //  - 'compact': mỗi NGƯỜI NHẬN một mã QR (không kèm số tiền), bên dưới liệt kê ai chuyển bao nhiêu
    //  - 'detail' : thêm bảng các khoản chi, chi tiết từng người, nợ tồn, lượt trả nợ; rồi mới đến mã QR
    // Mọi hàng căn lề bằng <table> (html2canvas vẽ chắc hơn flexbox, tránh chữ bị lệch dòng).
    let settlementImageMode = 'compact';

    // Phần chi tiết từng khoản chi trong ảnh chốt nợ: tạm ẩn theo yêu cầu người dùng. Đổi thành true để hiện lại
    // (muốn chọn kiểu Gọn / Chi tiết thì bỏ comment thêm khối nút "Kiểu ảnh" trong popup ở index.html).
    const SETTLEMENT_IMAGE_SHOW_EXPENSES = false;

    function billCircle(name, size) {
      const s = size || 28;
      return `<div style="width:${s}px;height:${s}px;border-radius:${s / 2}px;background:rgb(var(--p-50));color:rgb(var(--p-700));font-size:12px;font-weight:800;line-height:${s}px;text-align:center;">${escapeAttr(String(name).charAt(0).toUpperCase())}</div>`;
    }

    function billSectionTitle(text) {
      return `<div style="font-size:11px;font-weight:900;letter-spacing:.06em;color:rgb(var(--p-800));text-transform:uppercase;margin:18px 0 6px;">${text}</div>`;
    }

    // Số tiền chuyển làm tròn đến nghìn đồng cho dễ nhập (số dưới 1.000 đ giữ nguyên). Sổ vẫn ghi số chính xác.
    function roundTransferAmount(amount) {
      return amount < 1000 ? amount : Math.round(amount / 1000) * 1000;
    }

    // Phần "chuyển khoản": mỗi người nhận một thẻ gồm mã QR căn giữa + thông tin STK + danh sách ai chuyển bao nhiêu (chuẩn giao diện hóa đơn tím)
    function buildBillTransfersHtml(calc, qrDataUrlsMap = {}) {
      const groups = [];
      const byRecipient = {};
      calc.transfers.forEach(t => {
        if (!byRecipient[t.to]) {
          byRecipient[t.to] = { to: t.to, total: 0, items: [] };
          groups.push(byRecipient[t.to]);
        }
        const rounded = roundTransferAmount(t.amount);
        byRecipient[t.to].total += rounded;
        byRecipient[t.to].items.push({ ...t, amount: rounded });
      });
      groups.sort((a, b) => b.total - a.total);
      groups.forEach(g => g.items.sort((a, b) => b.amount - a.amount));

      // Nội dung chuyển khoản chung cho cả nhóm (không dấu), người chuyển có thể thêm tên mình
      const memo = toAsciiMemo(`Chot no ${ledgerState.title || ''}`);

      const qrPlaceholder = (text) =>
        `<div style="width:140px;height:140px;margin:0 auto;border:1.5px dashed #cbd5e1;border-radius:14px;color:#94a3b8;font-size:11px;line-height:1.4;padding:12px;box-sizing:border-box;display:table;"><div style="display:table-cell;vertical-align:middle;text-align:center;">${escapeAttr(text)}</div></div>`;

      const html = groups.length === 0
        ? `<div style="margin-top:12px;padding:18px 16px;border-radius:16px;background:#ecfdf5;border:1px solid #a7f3d0;text-align:center;color:#065f46;font-weight:700;font-size:13px;">Cả nhóm đã tất toán, không còn khoản nào cần chuyển.</div>`
        : groups.map(g => {
            const bank = memberBanks[g.to] || {};
            const bankBin = bank.bankBin || (bank.bankCode === 'MoMo' ? '971025' : '970422');
            const preloadedQr = qrDataUrlsMap && qrDataUrlsMap[g.to];

            let qrHtml;
            if (preloadedQr) {
              qrHtml = `
                <div style="display:inline-block;padding:8px;border:1px solid #e2e8f0;border-radius:16px;box-sizing:border-box;">
                  <img src="${preloadedQr}" alt="VietQR" style="width:144px;height:auto;max-height:180px;display:block;margin:0 auto;">
                </div>
                <div style="font-size:10px;color:#64748b;text-align:center;margin-top:6px;font-weight:600;">Tự nhập đúng số tiền của mình</div>`;
            } else if (bank.accountNo) {
              const payload = buildVietQrPayload(bankBin, bank.accountNo, 0, memo);
              const src = makeQrDataUrl(payload, 280);
              qrHtml = src
                ? `<div style="display:inline-block;padding:8px;border:1px solid #e2e8f0;border-radius:16px;box-sizing:border-box;">
                     <img src="${src}" alt="QR" style="width:140px;height:140px;display:block;margin:0 auto;">
                   </div>
                   <div style="font-size:10px;color:#64748b;text-align:center;margin-top:6px;font-weight:600;">Tự nhập đúng số tiền của mình</div>`
                : qrPlaceholder('Không tạo được mã QR');
            } else {
              qrHtml = qrPlaceholder(g.to === FUND_NAME ? 'Chưa cài STK thủ quỹ' : `Chưa có STK của ${g.to}`);
            }

            const bankDetailsHtml = bank.accountNo
              ? `<div style="font-size:12px;font-weight:700;color:#0f172a;margin-top:8px;">${escapeAttr(memberBankLabel(bank))}</div>
                 <div style="font-size:11px;font-weight:600;color:#475569;margin-top:1px;text-transform:uppercase;">${escapeAttr(bank.accountName || g.to.toUpperCase())}</div>
                 <div style="font-size:12px;font-family:monospace;font-weight:700;color:#0f172a;margin-top:3px;">STK: <span style="letter-spacing:0.04em;">${escapeAttr(bank.accountNo)}</span></div>
                 ${memo ? `<div style="font-size:11px;font-family:monospace;font-style:italic;color:#64748b;margin-top:2px;">Nội dung: ${escapeAttr(memo)}</div>` : ''}`
              : `<div style="font-size:11px;color:#94a3b8;margin-top:8px;">Chưa cài số tài khoản</div>`;

            const payerRows = g.items.map((t, idx) => `
              <tr style="background:${idx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
                <td style="width:34px;padding:8px 0 8px 10px;border-top:1px solid #f1f5f9;vertical-align:middle;">${billCircle(t.from, 24)}</td>
                <td style="padding:8px 8px 8px 0;border-top:1px solid #f1f5f9;vertical-align:middle;font-size:13px;font-weight:700;line-height:20px;color:#0f172a;word-break:break-word;">${escapeAttr(t.from)}</td>
                <td style="padding:8px 10px 8px 0;border-top:1px solid #f1f5f9;vertical-align:middle;text-align:right;font-size:14px;font-weight:800;line-height:20px;color:rgb(var(--p-800));white-space:nowrap;">${formatMoney(t.amount)} đ</td>
              </tr>`).join('');

            return `
              <div style="border:1px solid #e2e8f0;border-radius:20px;margin-top:14px;overflow:hidden;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="padding:16px 14px 12px;text-align:center;background:rgb(var(--p-50));border-bottom:1px solid rgb(var(--p-100));">
                  <h3 style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:rgb(var(--p-800));margin:0 0 10px;">
                    ${g.to === FUND_NAME ? 'CHUYỂN KHOẢN CHO THỦ QUỸ' : `CHUYỂN KHOẢN CHO ${escapeAttr(g.to.toUpperCase())}`}
                  </h3>
                  ${qrHtml}
                  <div style="margin-top:4px;">
                    ${bankDetailsHtml}
                  </div>
                </div>
                <div style="padding:10px 12px 8px;">
                  <table style="width:100%;border-collapse:collapse;"><tbody><tr>
                    <td style="padding:2px 4px 6px;font-size:10.5px;font-weight:800;color:#64748b;letter-spacing:.04em;text-transform:uppercase;">${g.to === FUND_NAME ? 'Ai nộp quỹ bao nhiêu' : 'Ai chuyển bao nhiêu'}</td>
                    <td style="padding:2px 4px 6px;text-align:right;font-size:11px;font-weight:800;color:#0f172a;white-space:nowrap;">Tổng nhận: <span style="color:rgb(var(--p-800));font-weight:900;">${formatMoney(g.total)} đ</span></td>
                  </tr></tbody></table>
                  <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;border-radius:10px;overflow:hidden;"><tbody>${payerRows}</tbody></table>
                </div>
              </div>`;
          }).join('');

      return { html, groupCount: groups.length };
    }

    // ===== Ảnh hóa đơn: các khối dùng chung cho kiểu Gọn và Chi tiết =====
    // Mọi hàng căn lề bằng <table> (html2canvas vẽ chắc hơn flexbox). Số tiền dùng chữ thường (không monospace) cho nét và dễ đọc.

    // Dòng giải thích một khoản chi: ngày, ai trả, chia cho mấy người (kèm quỹ, tài trợ, phần cố định)
    function billExpenseInfo(e) {
      const n = (e.participants || []).length;
      const wk = e.weekdayInfo && e.weekdayInfo.shortName ? `${e.weekdayInfo.shortName} ` : '';
      const subsidyText = e.subsidy > 0 ? ` (tài trợ ${formatMoney(e.subsidy)} đ)` : '';
      const payerText = e.payer === FUND_NAME
        ? `Quỹ trả${subsidyText}`
        : (e.fundPart > 0 ? `${e.payer} trả ${formatMoney(e.payerPart)} đ, quỹ trả ${formatMoney(e.fundPart)} đ${subsidyText}` : `${e.payer} trả`);
      const fixed = e.fixedPeople || [];
      // Ghi luôn tên những người được chia, như hóa đơn mẫu: "(An, Bình, Cường)". Đông quá (hơn 8 người) thì ghi số người.
      const names = e.participants || [];
      return {
        line: `${wk}${formatDateDisplay(e.date)} · ${payerText}`,
        splitLine: `${fixed.length > 0 ? 'Chia' : 'Chia đều'} ${names.length <= 8 ? `(${names.join(', ')})` : `(${n} người)`}`,
        fixedLine: fixed.length > 0 ? `Cố định: ${fixed.map(p => `${p} ${formatMoney(e.rowShares[p] || 0)} đ`).join(', ')}` : '',
        perPerson: e.evenCount > 0 ? `${formatMoney(e.sharePerPerson)} đ/người` : ''
      };
    }

    // Bảng "Khoản chi": tên, ai trả, chia thế nào, số tiền; dòng Tổng ở cuối
    function billExpensesHtml(calc, expenses, limit) {
      const shown = limit ? expenses.slice(0, limit) : expenses;
      const rest = expenses.length - shown.length;
      const rows = shown.map(e => {
        const info = billExpenseInfo(e);
        return `
          <tr>
            <td style="padding:8px 0;border-top:1px solid #f1f5f9;vertical-align:top;">
              <div style="font-size:14px;font-weight:700;color:#0f172a;line-height:20px;word-break:break-word;">${escapeAttr(e.name)}</div>
              <div style="font-size:11px;color:#64748b;margin-top:1px;line-height:16px;">${escapeAttr(info.line)}</div>
              <div style="font-size:11px;color:#64748b;line-height:16px;word-break:break-word;">${escapeAttr(info.splitLine)}</div>
              ${info.fixedLine ? `<div style="font-size:11px;color:#b45309;line-height:16px;word-break:break-word;">${escapeAttr(info.fixedLine)}</div>` : ''}
            </td>
            <td style="padding:8px 0 8px 12px;border-top:1px solid #f1f5f9;vertical-align:top;text-align:right;white-space:nowrap;">
              <div style="font-size:14px;font-weight:800;color:#0f172a;line-height:20px;">${formatMoney(e.amount)} đ</div>
              ${info.perPerson ? `<div style="font-size:11px;color:#64748b;margin-top:1px;line-height:16px;">${info.perPerson}</div>` : ''}
            </td>
          </tr>`;
      }).join('');

      // Một người trả hết thì ghi luôn bên cạnh chữ Tổng
      const payers = Array.from(new Set(expenses.map(e => e.payer))).filter(Boolean);
      const totalLabel = payers.length === 1
        ? (payers[0] === FUND_NAME ? 'Tổng chi (Quỹ trả hết)' : `Tổng chi (${payers[0]} đã trả hết)`)
        : 'Tổng chi';

      return `
        <table style="width:100%;border-collapse:collapse;"><tbody>
          <tr>
            <td style="padding:0 0 5px;font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:.03em;">Khoản chi</td>
            <td style="padding:0 0 5px;font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:.03em;text-align:right;">Số tiền</td>
          </tr>
          ${rows}
          ${rest > 0 ? `<tr><td colspan="2" style="padding:6px 0 0;border-top:1px solid #f1f5f9;font-size:11px;color:#64748b;font-style:italic;">... và ${rest} khoản chi khác (xem bản Chi tiết từng khoản)</td></tr>` : ''}
          <tr>
            <td style="padding:10px 0 2px;border-top:2px solid rgb(var(--p-200));font-size:14px;font-weight:800;color:#0f172a;">${escapeAttr(totalLabel)}</td>
            <td style="padding:10px 0 2px;border-top:2px solid rgb(var(--p-200));text-align:right;font-size:16px;font-weight:900;color:rgb(var(--p-800));white-space:nowrap;">${formatMoney(calc.grandTotal)} đ</td>
          </tr>
        </tbody></table>`;
    }

    // Bảng "Khoản chi" gọn giống hóa đơn 1 Bữa: tên và số tiền, dòng Tổng gạch đứt ở cuối
    function billSimpleExpensesHtml(calc, expenses, limit) {
      const shown = limit ? expenses.slice(0, limit) : expenses;
      const rest = expenses.length - shown.length;
      const cell = 'padding:2px 0;font-size:13px;line-height:19px;color:#1e293b;';
      const payers = Array.from(new Set(expenses.map(e => e.payer))).filter(Boolean);
      const totalLabel = payers.length === 1
        ? (payers[0] === FUND_NAME ? 'Tổng (Quỹ trả hết)' : `Tổng (${payers[0]} đã trả hết)`)
        : 'Tổng';
      return `
        <table style="width:100%;border-collapse:collapse;"><tbody>
          <tr>
            <td style="padding:0 0 4px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:600;color:#64748b;">Khoản chi <span style="font-weight:400;color:#94a3b8;">· ${escapeAttr(getLedgerDateRangeDisplay(ledgerState.expenses))}</span></td>
            <td style="padding:0 0 4px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:600;color:#64748b;text-align:right;">Số tiền</td>
          </tr>
          ${shown.map((e, i) => `
            <tr>
              <td style="${cell}${i === 0 ? 'padding-top:5px;' : ''}word-break:break-word;">${escapeAttr(e.name)}</td>
              <td style="${cell}${i === 0 ? 'padding-top:5px;' : ''}text-align:right;white-space:nowrap;padding-left:12px;">${formatMoney(e.amount)}</td>
            </tr>`).join('')}
          ${rest > 0 ? `<tr><td colspan="2" style="${cell}color:#64748b;font-style:italic;">... và ${rest} khoản chi khác</td></tr>` : ''}
          <tr>
            <td style="padding:7px 0 0;border-top:1px dashed #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">${escapeAttr(totalLabel)}</td>
            <td style="padding:7px 0 0;border-top:1px dashed #e2e8f0;text-align:right;font-size:16px;font-weight:900;color:rgb(var(--p-700));white-space:nowrap;">${formatMoney(calc.grandTotal)}</td>
          </tr>
        </tbody></table>`;
    }

    // Khung "Chia thế nào": mọi khoản chia đều cho cả nhóm thì ghi công thức; còn lại thì nói rõ quy tắc, kèm tình trạng quỹ
    function billSplitBoxHtml(calc, expenses, people) {
      if (expenses.length === 0) return '';
      const allEven = expenses.every(e =>
        (e.participants || []).length === people.length &&
        !(e.fixedPeople && e.fixedPeople.length) && !(e.subsidy > 0) && !(e.fundPart > 0) && e.payer !== FUND_NAME);
      const hasFixed = expenses.some(e => e.fixedPeople && e.fixedPeople.length > 0);
      const hasSubsidy = expenses.some(e => e.subsidy > 0);

      const lines = [];
      if (allEven && people.length > 0) {
        const avg = Math.round(calc.grandTotal / people.length);
        lines.push(`<div style="font-size:12px;font-weight:800;color:#3b0764;">📌 Chia đều cho ${people.length} người tham gia:</div>`);
        lines.push(`<div style="font-size:11.5px;color:rgb(var(--p-800));margin-top:3px;font-weight:600;">${formatMoney(calc.grandTotal)} đ ÷ ${people.length} người = ~${formatMoney(avg)} đ/người</div>`);
      } else {
        lines.push(`<div style="font-size:12px;font-weight:800;color:#3b0764;">📌 Cách chia</div>`);
        lines.push(`<div style="font-size:11.5px;color:rgb(var(--p-800));margin-top:3px;line-height:1.45;">Mỗi khoản chia cho những người có tên trong khoản đó${hasFixed ? '; ai có phần cố định chịu đúng số ghi, số còn lại chia đều' : ''}.${hasSubsidy ? ' Tiền tài trợ trừ vào phần chia đều.' : ''}</div>`);
      }
      if (calc.fundActive) {
        lines.push(`<div style="font-size:11.5px;font-weight:800;color:#7e22ce;margin-top:5px;">${escapeAttr(fundCashText(calc.fundCash))}</div>`);
      }
      return `<div style="background-color:rgb(var(--p-50));padding:12px 14px;border-radius:14px;border:1px solid rgb(var(--p-200));margin-top:14px;box-sizing:border-box;">${lines.join('')}</div>`;
    }

    // "Phần của từng người", gom những người có cùng các khoản và cùng số tiền thành một nhóm
    function billGroupedSharesHtml(calc, expenses, people) {
      const groups = {};
      people.forEach(m => {
        const parts = [];
        let total = 0;
        expenses.forEach((e, i) => {
          const v = e.rowShares[m] || 0;
          if (v > 0) { parts.push(`${i}:${v}`); total += v; }
        });
        if (parts.length === 0) return;
        const key = parts.join('|');
        if (!groups[key]) groups[key] = { idxs: parts.map(p => Number(p.split(':')[0])), members: [], total };
        groups[key].members.push(m);
      });
      const list = Object.values(groups).sort((a, b) => b.members.length - a.members.length || b.total - a.total);
      if (list.length === 0) return '';

      const fixedNames = new Set();
      expenses.forEach(e => (e.fixedPeople || []).forEach(p => fixedNames.add(p)));

      // Hai khoản trùng tên (vd: "cơm trưa" ở hai ngày) thì thêm ngày để phân biệt
      const nameCount = {};
      expenses.forEach(e => { nameCount[e.name] = (nameCount[e.name] || 0) + 1; });
      const shortName = (e) => nameCount[e.name] > 1 ? `${e.name} ${formatDateDisplay(e.date)}` : e.name;

      const blocks = list.map(g => {
        const label = g.idxs.length === expenses.length ? 'Tất cả khoản chi' : g.idxs.map(i => shortName(expenses[i])).join(' + ');
        const rows = g.members.map((m, idx) => `
          <tr style="background:${idx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
            <td style="padding:6px 8px;font-size:13px;line-height:20px;font-weight:600;color:#1e293b;word-break:break-word;">${escapeAttr(m)}${fixedNames.has(m) ? ' <span style="font-size:10px;font-weight:700;color:#b45309;">cố định</span>' : ''}</td>
            <td style="padding:6px 8px;font-size:13px;line-height:20px;font-weight:700;color:#0f172a;text-align:right;white-space:nowrap;">${formatMoney(g.total)}</td>
          </tr>`).join('');
        return `
          <div style="margin-top:8px;">
            <div style="font-size:11px;font-weight:700;color:#7e22ce;padding:0 2px 3px;line-height:1.35;word-break:break-word;">${escapeAttr(label)}</div>
            <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;"><tbody>${rows}</tbody></table>
          </div>`;
      }).join('');

      return `
        ${billSectionTitle('Phần của từng người')}
        <div style="font-size:10.5px;color:#94a3b8;margin:-2px 0 2px;">Tổng phần chi của mỗi người, chưa trừ tiền đã ứng${calc.fundActive ? ' hoặc đã nộp quỹ' : ''}.</div>
        ${blocks}`;
    }

    // "Danh sách thực trả": mỗi người cần trả hoặc được nhận bao nhiêu, kèm cách tính (ứng tiền, nộp quỹ... trừ phần của mình)
    function billNetListHtml(calc, people) {
      const rows = people.map((m, idx) => {
        const s = calc.memberStats[m] || {};
        const bal = shownBalance(s);
        const settled = Math.abs(bal) < 1;
        const color = settled ? '#64748b' : bal > 0 ? '#047857' : '#dc2626';
        const label = balanceLabel(calc, s);
        const formula = fundFormulaText(s);
        return `
          <tr style="background:${idx % 2 === 1 ? 'rgb(var(--p-50))' : '#ffffff'};">
            <td style="padding:7px 10px;vertical-align:middle;">
              <div style="font-size:13.5px;font-weight:700;color:#1e293b;line-height:20px;word-break:break-word;">${escapeAttr(m)}</div>
              ${formula ? `<div style="font-size:10.5px;color:#64748b;margin-top:1px;line-height:15px;">${escapeAttr(formula)}</div>` : ''}
            </td>
            <td style="padding:7px 10px;vertical-align:middle;text-align:right;white-space:nowrap;">
              <div style="font-size:14px;font-weight:800;color:${color};line-height:20px;">${settled ? '0' : (bal > 0 ? '+' : '') + formatMoney(Math.abs(bal))} đ</div>
              <div style="font-size:10px;font-weight:700;color:${color};margin-top:1px;line-height:14px;">${label}</div>
            </td>
          </tr>`;
      }).join('');

      return `
        <table style="width:100%;border-collapse:collapse;margin-bottom:6px;"><tbody><tr>
          <td style="font-size:11.5px;font-weight:900;color:#0f172a;letter-spacing:.02em;">📋 DANH SÁCH THỰC TRẢ (${people.length} NGƯỜI)</td>
          <td style="font-size:10px;color:#94a3b8;text-align:right;white-space:nowrap;">Đã tính phần ứng</td>
        </tr></tbody></table>
        <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;"><tbody>${rows}</tbody></table>`;
    }


    // Khối "Quỹ chung" trong hóa đơn chi tiết: tiền vào, quỹ đã chi, đã hoàn, còn lại
    function buildBillFundHtml(calc) {
      if (!calc.fundActive) return '';
      const s = getFundSummary(calc);
      const row = (label, value, strong) => `
        <tr>
          <td style="padding:6px 0;border-top:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${label}</td>
          <td style="padding:6px 0;border-top:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:${strong ? 900 : 700};color:${strong ? 'rgb(var(--p-800))' : '#0f172a'};white-space:nowrap;">${value}</td>
        </tr>`;
      return `
        ${billSectionTitle('Quỹ chung')}
        <table style="width:100%;border-collapse:collapse;"><tbody>
          ${s.sponsored > 0
            ? row('Thành viên đóng', formatMoney(s.received - s.sponsored - s.topUp) + ' đ') + row('Tài trợ', formatMoney(s.sponsored) + ' đ')
            : row('Tiền đóng quỹ', formatMoney(s.received - s.topUp) + ' đ')}
          ${row('Quỹ đã chi', formatMoney(s.spent) + ' đ')}
          ${s.topUp > 0 ? row('Bù phần chi vượt', formatMoney(s.topUp) + ' đ') : ''}
          ${s.refunded > 0 ? row('Đã hoàn lại', formatMoney(s.refunded) + ' đ') : ''}
          ${row(s.cash < 0 ? 'Đang thiếu' : 'Còn lại', formatMoney(Math.abs(s.cash)) + ' đ', true)}
        </tbody></table>`;
    }

    // Phần thêm của kiểu Chi tiết: quỹ, phần của từng người, nợ tồn kỳ trước, lượt trả nợ đã ghi
    function buildBillDetailHtml(calc) {
      const expenses = calc.expenseBreakdowns.filter(e => !e.isPayment && !e.isCarryOver);
      const carries = calc.expenseBreakdowns.filter(e => e.isCarryOver);
      const payments = calc.expenseBreakdowns.filter(e => e.isPayment);
      const people = getVisiblePeople(calc);

      const carryHtml = carries.length === 0 ? '' : `
        ${billSectionTitle('Nợ tồn kỳ trước')}
        <div style="font-size:10.5px;color:#94a3b8;margin:-2px 0 3px;">Mang từ kỳ trước sang, không tính vào tổng chi.</div>
        <table style="width:100%;border-collapse:collapse;"><tbody>${carries.map(c => `
          <tr>
            <td style="padding:6px 0;border-top:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${escapeAttr(carryPairLabel((c.participants || [])[0] || '', c.payer))}</td>
            <td style="padding:6px 0;border-top:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:700;color:#0f172a;white-space:nowrap;">${formatMoney(c.amount)} đ</td>
          </tr>`).join('')}</tbody></table>`;

      const paymentHtml = payments.length === 0 ? '' : `
        ${billSectionTitle(calc.fundActive ? 'Đã trả nợ và nộp quỹ' : 'Đã trả nợ')}
        <table style="width:100%;border-collapse:collapse;"><tbody>${payments.map(p => {
          const to = p.recipient || (p.participants || [])[0] || '';
          const wk = p.weekdayInfo && p.weekdayInfo.shortName ? `${p.weekdayInfo.shortName} ` : '';
          const kind = paymentKindLabel(p);
          const kindText = kind === 'trả nợ' ? '' : `${kind} · `;
          return `
          <tr>
            <td style="padding:6px 0;border-top:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${escapeAttr(p.payer)} ➔ ${escapeAttr(to)} <span style="font-size:11px;color:#94a3b8;">· ${kindText}${wk}${formatDateDisplay(p.date)}</span></td>
            <td style="padding:6px 0;border-top:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:700;color:#047857;white-space:nowrap;">${formatMoney(p.amount)} đ</td>
          </tr>`;
        }).join('')}</tbody></table>`;

      return `
        ${buildBillFundHtml(calc)}
        ${billGroupedSharesHtml(calc, expenses, people)}
        ${carryHtml}
        ${paymentHtml}`;
    }

    // Hai kiểu ảnh:
    //  - Gọn: khoản chi (ghi rõ ai trả, chia thế nào), danh sách thực trả, rồi mã QR từng người nhận
    //  - Chi tiết: thêm quỹ, phần của từng người (gom nhóm), nợ tồn kỳ trước và các lượt trả nợ đã ghi
    function buildSettlementBillElement(calc, mode, qrDataUrlsMap = {}) {
      const detail = mode === 'detail';
      const people = getVisiblePeople(calc);
      const actualExpenses = calc.expenseBreakdowns.filter(e => !e.isPayment && !e.isCarryOver);
      const transfers = buildBillTransfersHtml(calc, qrDataUrlsMap);

      // Mặc định: bảng khoản chi gọn như hóa đơn 1 Bữa. Bật SETTLEMENT_IMAGE_SHOW_EXPENSES thì dùng bảng chi tiết.
      const expensesHtml = !SETTLEMENT_IMAGE_SHOW_EXPENSES
        ? (actualExpenses.length === 0 ? '' : `
          ${billSimpleExpensesHtml(calc, actualExpenses, 10)}
          <div style="border-top:1px solid #e2e8f0;margin:16px 0;"></div>`)
        : `
        ${actualExpenses.length === 0
          ? '<div style="font-size:12px;color:#94a3b8;padding:6px 0;">Chưa có khoản chi nào trong kỳ này.</div>'
          : billExpensesHtml(calc, actualExpenses, detail ? 0 : 8)}
        ${billSplitBoxHtml(calc, actualExpenses, people)}
        ${detail ? buildBillDetailHtml(calc) : ''}
        <div style="border-top:1px solid #e2e8f0;margin:16px 0;"></div>`;

      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:absolute;left:-9999px;top:0;width:420px;background:#ffffff;box-sizing:border-box;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums;';
      wrap.innerHTML = `
        <div style="background:#ffffff;color:#0f172a;overflow:hidden;">

          <!-- Banner giống hóa đơn 1 Bữa: tiêu đề bên trái, huy hiệu trắng "TỔNG CỘNG x NGƯỜI" bên phải -->
          <div style="background-color:rgb(var(--p-800));padding:16px 20px;color:#ffffff;box-sizing:border-box;">
            <table style="width:100%;border-collapse:collapse;"><tbody><tr>
              <td style="vertical-align:middle;">
                <span style="font-size:10px;line-height:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:rgb(var(--p-200));display:block;margin:0;padding:0;">${detail ? 'HÓA ĐƠN CHI TIẾT' : 'HÓA ĐƠN CHIA TIỀN'}</span>
                <h2 style="font-size:20px;font-weight:900;letter-spacing:-0.025em;margin:2px 0 0;padding:0;line-height:25px;color:#ffffff;text-transform:uppercase;word-break:break-word;">${escapeAttr(ledgerState.title || 'SỔ CHI TIÊU NHÓM')}</h2>
              </td>
              <td style="width:100px;vertical-align:middle;text-align:right;white-space:nowrap;padding-left:12px;">
                <div style="background:#ffffff;padding:6px 10px;border-radius:16px;border:2px solid rgb(var(--p-200));text-align:center;display:block;white-space:nowrap;box-sizing:border-box;">
                  <span style="font-size:8.5px;text-transform:uppercase;letter-spacing:.05em;color:rgb(var(--p-600));font-weight:900;display:block;line-height:11px;margin:0;padding:0;white-space:nowrap;">TỔNG CỘNG</span>
                  <span style="font-size:18px;font-weight:900;color:rgb(var(--p-950));line-height:23px;display:block;margin:0;padding:0;white-space:nowrap;">${people.length} NGƯỜI</span>
                </div>
              </td>
            </tr></tbody></table>
          </div>

          <div style="padding:18px 20px 14px;box-sizing:border-box;">
            ${expensesHtml}
            ${billNetListHtml(calc, people)}

            <div style="border-top:1px solid #e2e8f0;margin:16px 0 6px;"></div>
            ${transfers.html}

            <div style="margin-top:14px;font-size:10.5px;color:#94a3b8;line-height:1.45;text-align:center;">
              Quét mã QR của người nhận, rồi tự nhập đúng số tiền của mình trong danh sách (đã làm tròn đến nghìn đồng).<br>ChiaBill Pro
            </div>
          </div>

          <div style="background:#f8fafc;padding:8px 0;text-align:center;font-size:10.5px;color:#94a3b8;font-weight:600;border-top:1px solid #f1f5f9;">
            Hóa đơn tạo bởi ChiaBill Pro
          </div>

        </div>`;
      return wrap;
    }

    function waitForImages(root) {
      const imgs = Array.from(root.querySelectorAll('img'));
      return Promise.all(imgs.map(img => {
        if (typeof img.decode === 'function') {
          return img.decode().catch(() => {});
        }
        return img.complete ? Promise.resolve() : new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));
    }

    let settlementImageBlob = null;
    let settlementImageUrl = '';
    let settlementImageBusy = false;

    // Ảnh đang mở trong popup: { title, subtitle, fileName(), shareTitle, showCopy, build() trả về khối HTML để chụp }
    let shareImageJob = null;

    function settlementImageFileName() {
      return shareImageJob.fileName();
    }

    // Ảnh chốt nợ cả nhóm: tải trước ảnh VietQR chuẩn Napas 24/7 (hoặc mã QR nội bộ) cho từng người nhận
    const settlementImageJob = {
      title: 'Ảnh chốt nợ',
      subtitle: 'Mỗi người nhận một mã QR, người chuyển tự nhập số tiền của mình',
      showCopy: true,
      fileName: () => `${settlementImageMode === 'detail' ? 'settlement-detail' : 'settlement'}-${getLocalDateString()}.png`,
      shareTitle: () => ledgerState.title || 'Chốt nợ',
      build: async () => {
        const calc = calculateLedger();
        const memo = toAsciiMemo(`Chot no ${ledgerState.title || ''}`);
        const recipients = Array.from(new Set((calc.transfers || []).map(t => t.to))).filter(Boolean);
        const qrDataUrlsMap = {};
        await Promise.all(recipients.map(async recipient => {
          const bank = memberBanks[recipient];
          if (bank && bank.accountNo) {
            try {
              const qrUrl = await getRecipientVietQrUrl(bank, memo, 0);
              if (qrUrl) qrDataUrlsMap[recipient] = qrUrl;
            } catch (err) {
              console.warn('Failed to prefetch VietQR for', recipient, err);
            }
          }
        }));
        return buildSettlementBillElement(calc, settlementImageMode, qrDataUrlsMap);
      }
    };

    // Mở popup ảnh với nội dung của shareImageJob
    function openShareImageModal() {
      const modal = document.getElementById('modalSettlementImage');
      if (!modal) return;
      document.getElementById('shareImageTitle').textContent = shareImageJob.title;
      document.getElementById('shareImageSubtitle').textContent = shareImageJob.subtitle;
      document.getElementById('btnShareImageCopyText').classList.toggle('hidden', !shareImageJob.showCopy);
      modal.classList.remove('hidden');
      renderSettlementImage();
    }

    function updateSettlementModeButtons() {
      const on = "flex-1 py-2 rounded-lg bg-white text-slate-900 shadow-2xs font-bold transition cursor-pointer";
      const off = "flex-1 py-2 rounded-lg text-slate-500 hover:text-slate-900 font-medium transition cursor-pointer";
      const btnCompact = document.getElementById('btnBillModeCompact');
      const btnDetail = document.getElementById('btnBillModeDetail');
      if (btnCompact) btnCompact.className = settlementImageMode === 'compact' ? on : off;
      if (btnDetail) btnDetail.className = settlementImageMode === 'detail' ? on : off;
    }

    // Vẽ lại ảnh theo kiểu đang chọn và hiện trong khung xem trước
    async function renderSettlementImage() {
      if (settlementImageBusy || !shareImageJob) return;
      const status = document.getElementById('settlementImageStatus');
      const preview = document.getElementById('settlementImagePreview');
      const btnShare = document.getElementById('btnShareSettlementImage');
      const btnDownload = document.getElementById('btnDownloadSettlementImage');
      if (!status || !preview) return;

      if (settlementImageUrl) URL.revokeObjectURL(settlementImageUrl);
      settlementImageUrl = '';
      settlementImageBlob = null;
      preview.classList.add('hidden');
      status.textContent = 'Đang tạo ảnh...';
      status.classList.remove('hidden');
      btnShare.classList.add('hidden');
      settlementImageBusy = true;

      let bill = null;
      try {
        if (typeof html2canvas !== 'function' || typeof QRCode === 'undefined') {
          throw new Error('Thiếu thư viện tạo ảnh / mã QR (kiểm tra kết nối mạng rồi tải lại trang).');
        }

        bill = await shareImageJob.build();
        document.body.appendChild(bill);
        await waitForImages(bill);
        await new Promise(resolve => setTimeout(resolve, 120)); // chờ Tailwind áp xong kiểu

        // Ảnh càng dài thì giảm độ phân giải để canvas không quá lớn (điện thoại giới hạn ~16 triệu điểm ảnh)
        const height = bill.offsetHeight || 1000;
        let scale = 3;
        if (height * scale > 9000) scale = Math.max(1.5, Math.round((9000 / height) * 10) / 10);

        const canvas = await html2canvas(bill, {
          scale: scale,
          scrollX: 0,
          scrollY: 0,
          backgroundColor: null, // góc bo của ảnh trong suốt, không thành góc trắng vuông
          useCORS: true,
          logging: false
        });
        settlementImageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!settlementImageBlob) throw new Error('Không xuất được ảnh.');

        settlementImageUrl = URL.createObjectURL(settlementImageBlob);
        preview.src = settlementImageUrl;
        preview.classList.remove('hidden');
        status.classList.add('hidden');

        // Có Web Share (điện thoại) thì ưu tiên "Chia sẻ ảnh", còn lại là "Tải ảnh"
        const probe = new File([settlementImageBlob], 'chot-no.png', { type: 'image/png' });
        const canShare = Boolean(navigator.canShare && navigator.canShare({ files: [probe] }));
        const primary = "flex-1 py-3 bg-indigo-700 hover:bg-indigo-800 active:scale-[0.98] text-white rounded-2xl text-sm font-bold transition cursor-pointer";
        const secondary = "flex-1 py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-2xl text-sm font-bold transition cursor-pointer";
        btnShare.classList.toggle('hidden', !canShare);
        btnShare.className = (canShare ? '' : 'hidden ') + primary;
        btnDownload.className = canShare ? secondary : primary;
      } catch (err) {
        console.error(err);
        status.textContent = 'Không tạo được ảnh. Bạn thử lại, hoặc dùng "Sao chép dạng chữ" bên dưới.';
        status.classList.remove('hidden');
      } finally {
        if (bill) bill.remove();
        settlementImageBusy = false;
      }
    }

    window.openSettlementImage = function() {
      if (settlementImageBusy) return;
      const calc = calculateLedger();
      if (calc.expenseBreakdowns.length === 0) {
        showToast('Sổ đang trống, chưa có gì để tạo ảnh.', '⚠️');
        return;
      }
      shareImageJob = settlementImageJob;
      updateSettlementModeButtons();
      openShareImageModal();
    };

    // Đổi kiểu ảnh: Gọn (chỉ chốt nợ + QR) hoặc Chi tiết (thêm các khoản chi và từng người)
    window.setSettlementImageMode = function(mode) {
      const next = mode === 'detail' ? 'detail' : 'compact';
      if (next === settlementImageMode || settlementImageBusy) return;
      settlementImageMode = next;
      updateSettlementModeButtons();
      renderSettlementImage();
    };

    window.closeSettlementImage = function() {
      const modal = document.getElementById('modalSettlementImage');
      if (modal) modal.classList.add('hidden');
    };

    window.downloadSettlementImage = function() {
      if (!settlementImageBlob || !settlementImageUrl) return;
      const link = document.createElement('a');
      link.href = settlementImageUrl;
      link.download = settlementImageFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Đã tải ảnh về máy.');
    };

    window.shareSettlementImage = async function() {
      if (!settlementImageBlob) return;
      const file = new File([settlementImageBlob], settlementImageFileName(), { type: 'image/png' });
      try {
        await navigator.share({ files: [file], title: shareImageJob.shareTitle() });
      } catch (err) {
        // Người dùng tự đóng hộp chia sẻ thì không báo lỗi
        if (err && err.name !== 'AbortError') {
          showToast('Không chia sẻ được, hãy bấm Tải ảnh.', '⚠️');
        }
      }
    };

    // ==================== ẢNH RIÊNG MỘT NGƯỜI (1 Bữa và Sổ Quỹ) ====================
    // Chỉ gồm phần của người đó và mã QR kèm đúng số tiền cần chuyển, để gửi riêng cho từng người.

    // Khung ảnh: banner màu, thân, chân trang (cùng kiểu với ảnh chốt nợ)
    function personBillShell(color, kicker, title, sub, bodyHtml) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:absolute;left:-9999px;top:0;width:420px;background:#ffffff;box-sizing:border-box;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums;';
      wrap.innerHTML = `
        <div style="background:#ffffff;color:#0f172a;overflow:hidden;">
          <div style="background-color:${color};padding:16px 20px;color:#ffffff;box-sizing:border-box;">
            <span style="font-size:10px;line-height:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.75);display:block;">${escapeAttr(kicker)}</span>
            <h2 style="font-size:18px;font-weight:900;letter-spacing:-0.02em;margin:3px 0 0;line-height:22px;color:#ffffff;text-transform:uppercase;word-break:break-word;">${escapeAttr(title)}</h2>
            ${sub ? `<div style="font-size:11px;line-height:14px;color:rgba(255,255,255,0.8);margin-top:3px;">${escapeAttr(sub)}</div>` : ''}
          </div>
          <div style="padding:18px 20px 14px;box-sizing:border-box;">${bodyHtml}</div>
          <div style="background:#f8fafc;padding:8px 0;text-align:center;font-size:10.5px;color:#94a3b8;font-weight:600;border-top:1px solid #f1f5f9;">
            Hóa đơn tạo bởi ChiaBill Pro
          </div>
        </div>`;
      return wrap;
    }

    // Bảng các dòng [tên, phụ chú, số tiền] kèm dòng tổng
    function personRowsHtml(rows, totalLabel, total, color) {
      return `
        <table style="width:100%;border-collapse:collapse;"><tbody>
          ${rows.map(r => `
            <tr>
              <td style="padding:7px 0;border-top:1px solid #f1f5f9;vertical-align:top;">
                <div style="font-size:13.5px;font-weight:700;color:#0f172a;line-height:19px;word-break:break-word;">${escapeAttr(r.name)}</div>
                ${r.sub ? `<div style="font-size:11px;color:#64748b;line-height:15px;margin-top:1px;">${escapeAttr(r.sub)}</div>` : ''}
              </td>
              <td style="padding:7px 0 7px 12px;border-top:1px solid #f1f5f9;vertical-align:top;text-align:right;white-space:nowrap;font-size:13.5px;font-weight:800;color:#0f172a;line-height:19px;">${formatMoney(r.amount)} đ</td>
            </tr>`).join('')}
          <tr>
            <td style="padding:9px 0 2px;border-top:2px solid #e2e8f0;font-size:13.5px;font-weight:800;color:#0f172a;">${escapeAttr(totalLabel)}</td>
            <td style="padding:9px 0 2px;border-top:2px solid #e2e8f0;text-align:right;font-size:15px;font-weight:900;color:${color};white-space:nowrap;">${formatMoney(total)} đ</td>
          </tr>
        </tbody></table>`;
    }

    // Thẻ chuyển khoản: số tiền nổi bật + mã QR kèm số tiền + thông tin STK
    function personPayCardHtml(color, heading, amount, qrSrc, bankLine, accountName, accountNo, memo, missingText) {
      const qrHtml = qrSrc
        ? `<div style="display:inline-block;padding:8px;border:1px solid #e2e8f0;border-radius:16px;">
             <img src="${qrSrc}" alt="VietQR" style="width:170px;height:auto;max-height:210px;display:block;margin:0 auto;">
           </div>
           <div style="font-size:10.5px;color:#64748b;margin-top:6px;font-weight:600;">Quét mã là có sẵn số tiền, chỉ cần xác nhận</div>`
        : `<div style="font-size:11.5px;color:#94a3b8;padding:10px 0;">${escapeAttr(missingText)}</div>`;
      return `
        <div style="border:1px solid #e2e8f0;border-radius:20px;margin-top:14px;overflow:hidden;background:#ffffff;">
          <div style="padding:14px 14px 12px;text-align:center;background:#f8fafc;">
            <div style="font-size:11.5px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:${color};">${escapeAttr(heading)}</div>
            <div style="font-size:26px;font-weight:900;color:${color};margin:4px 0 10px;line-height:30px;">${formatMoney(amount)} đ</div>
            ${qrHtml}
            ${accountNo ? `
              <div style="font-size:12px;font-weight:700;color:#0f172a;margin-top:8px;">${escapeAttr(bankLine)}</div>
              ${accountName ? `<div style="font-size:11px;font-weight:600;color:#475569;margin-top:1px;text-transform:uppercase;">${escapeAttr(accountName)}</div>` : ''}
              <div style="font-size:12px;font-family:monospace;font-weight:700;color:#0f172a;margin-top:3px;">STK: ${escapeAttr(accountNo)}</div>
              ${memo ? `<div style="font-size:11px;font-family:monospace;font-style:italic;color:#64748b;margin-top:2px;">Nội dung: ${escapeAttr(memo)}</div>` : ''}` : ''}
          </div>
        </div>`;
    }

    // Tên file ảnh: bill-for-<tên không dấu>-<ngày>.png
    function personImageFileName(name) {
      const slug = toAsciiMemo(name).toLowerCase().replace(/\s+/g, '-') || 'member';
      return `bill-for-${slug}-${getLocalDateString()}.png`;
    }

    // 1 Bữa: các món, cách tính phần của người này, QR chuyển cho người ứng kèm đúng số tiền
    async function buildSinglePersonBill(name) {
      const calc = calculateBill();
      const m = calc.memberShares.find(x => x.name === name);
      if (!m) throw new Error('Không tìm thấy người này trong danh sách.');
      const theme = themes[state.theme] || themes.violet;
      const color = theme.headerBg;
      const amount = Math.round(m.share || 0);

      const howText = m.isFixed
        ? `${name} trả phần cố định ${formatMoney(amount)} đ`
        : (calc.fixedMembers.length > 0
          ? `(${formatMoney(calc.totalExpense)} - ${formatMoney(calc.totalFixedAmount)} cố định) ÷ ${calc.evenCount} người ≈ ${formatMoney(amount)} đ`
          : `${formatMoney(calc.totalExpense)} ÷ ${calc.totalMembers} người ≈ ${formatMoney(amount)} đ`);

      const rows = state.expenses.filter(e => (e.amount || 0) > 0).map(e => ({ name: e.name || 'Khoản chi', amount: e.amount }));
      const accountNo = (state.accountNo || '').replace(/\s+/g, '');
      const accountName = toAsciiAccountName(state.accountName);
      const memo = toAsciiMemo(`${name} ${state.memo || ''}`);
      const bankOption = document.querySelector(`#bankSelect option[value="${state.bank}"]`);
      const bankLine = bankOption ? bankOption.textContent.split('(')[0].trim() : state.bank;
      const qrSrc = accountNo && amount > 0
        ? await getRecipientVietQrUrl({ bankBin: singleBankBin(), accountNo, accountName }, memo, amount)
        : '';

      const body = `
        ${personRowsHtml(rows, `Tổng (${state.payerName} đã trả hết)`, calc.totalExpense, color)}
        <div style="background:#f8fafc;padding:10px 12px;border-radius:14px;border:1px solid #e2e8f0;margin-top:12px;">
          <div style="font-size:12px;font-weight:800;color:#0f172a;">📌 Phần của ${escapeAttr(name)}</div>
          <div style="font-size:11.5px;color:#475569;margin-top:3px;">${escapeAttr(howText)}</div>
        </div>
        ${personPayCardHtml(color, `Chuyển khoản cho ${state.payerName}`, amount, qrSrc, bankLine, accountName, accountNo, memo,
          accountNo ? 'Không tạo được mã QR' : `Hỏi ${state.payerName} số tài khoản để chuyển`)}`;

      return personBillShell(color, `Hóa đơn của ${name}`, state.title || 'Chia tiền', `${calc.totalMembers} người tham gia · Tổng ${formatMoney(calc.totalExpense)} đ`, body);
    }

    // Sổ Quỹ: các khoản người này tham gia, số dư, rồi từng khoản cần chuyển (QR kèm số tiền) hoặc sẽ được nhận
    async function buildLedgerPersonBill(name) {
      const calc = calculateLedger();
      const color = 'rgb(var(--p-800))';
      const stat = calc.memberStats[name] || {};
      const items = calc.expenseBreakdowns.filter(e => !e.isPayment && !e.isCarryOver && (e.rowShares[name] || 0) > 0);
      const rows = items.map(e => {
        const wk = e.weekdayInfo && e.weekdayInfo.shortName ? `${e.weekdayInfo.shortName} ` : '';
        const fixed = (e.fixedPeople || []).includes(name) ? ' · cố định' : '';
        return { name: e.name, sub: `${wk}${formatDateDisplay(e.date)} · ${e.payer === FUND_NAME ? 'Quỹ' : e.payer} trả ${formatMoney(e.amount)} đ${fixed}`, amount: Math.round(e.rowShares[name]) };
      });
      const myTotal = rows.reduce((s, r) => s + r.amount, 0);

      const bal = shownBalance(stat);
      const formula = fundFormulaText(stat);
      const balColor = Math.abs(bal) < 1 ? '#64748b' : bal > 0 ? '#047857' : '#dc2626';
      const balLabel = balanceLabel(calc, stat);

      const memo = toAsciiMemo(`${name} chot no ${ledgerState.title || ''}`);
      const outs = calc.transfers.filter(t => t.from === name);
      const ins = calc.transfers.filter(t => t.to === name);
      const cards = await Promise.all(outs.map(async t => {
        const amount = roundTransferAmount(t.amount);
        const bank = memberBanks[t.to] || {};
        const qrSrc = bank.accountNo ? await getRecipientVietQrUrl(bank, memo, amount) : '';
        const to = t.to === FUND_NAME ? 'thủ quỹ' : t.to;
        return personPayCardHtml(color, `Chuyển khoản cho ${to}`, amount, qrSrc, memberBankLabel(bank), bank.accountName || '', bank.accountNo || '', memo,
          `Chưa có STK của ${to}`);
      }));

      // Không phải chuyển: ghi ai sẽ chuyển cho mình (tiền nộp quỹ chưa dùng thì để yên, không nhắc)
      let receiveHtml = '';
      if (outs.length === 0) {
        const lines = ins.map(t => `${t.from === FUND_NAME ? 'Quỹ chung' : t.from} sẽ chuyển cho bạn ${formatMoney(roundTransferAmount(t.amount))} đ`);
        receiveHtml = `
          <div style="margin-top:14px;padding:14px;border-radius:16px;background:${bal > 0 ? '#ecfdf5' : '#f8fafc'};border:1px solid ${bal > 0 ? '#a7f3d0' : '#e2e8f0'};text-align:center;">
            <div style="font-size:13px;font-weight:800;color:${balColor};">${lines.length ? 'Bạn không cần chuyển khoản' : 'Bạn đã cân bằng, không cần chuyển khoản'}</div>
            ${lines.map(l => `<div style="font-size:12px;color:#334155;margin-top:4px;">${escapeAttr(l)}</div>`).join('')}
          </div>`;
      }

      const body = `
        ${rows.length
          ? personRowsHtml(rows, `Phần của ${name}`, myTotal, color)
          : `<div style="font-size:12px;color:#94a3b8;padding:4px 0;">${escapeAttr(name)} chưa tham gia khoản chi nào trong kỳ này.</div>`}
        <table style="width:100%;border-collapse:collapse;margin-top:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;"><tbody><tr>
          <td style="padding:10px 12px;vertical-align:middle;">
            <div style="font-size:12px;font-weight:800;color:#0f172a;">Số dư</div>
            ${formula ? `<div style="font-size:10.5px;color:#64748b;margin-top:2px;line-height:15px;">${escapeAttr(formula)}</div>` : ''}
          </td>
          <td style="padding:10px 12px;vertical-align:middle;text-align:right;white-space:nowrap;">
            <div style="font-size:15px;font-weight:900;color:${balColor};">${Math.abs(bal) < 1 ? '0' : (bal > 0 ? '+' : '-') + formatMoney(Math.abs(bal))} đ</div>
            <div style="font-size:10px;font-weight:700;color:${balColor};">${balLabel}</div>
          </td>
        </tr></tbody></table>
        ${cards.join('')}
        ${receiveHtml}`;

      return personBillShell(color, `Phiếu của ${name}`, ledgerState.title || 'Sổ chi tiêu nhóm',
        `${getLedgerDateRangeDisplay(ledgerState.expenses)} · Tổng chi nhóm ${formatMoney(calc.grandTotal)} đ`, body);
    }

    // kind: 'single' (1 Bữa) hoặc 'ledger' (Sổ Quỹ)
    window.openPersonImage = function(kind, name) {
      if (settlementImageBusy || !name) return;
      const single = kind === 'single';
      shareImageJob = {
        title: `Ảnh của ${name}`,
        subtitle: single
          ? `Phần của ${name} và mã QR kèm đúng số tiền cần chuyển`
          : `Các khoản ${name} tham gia, số dư và mã QR kèm đúng số tiền`,
        showCopy: false,
        fileName: () => personImageFileName(name),
        shareTitle: () => `${single ? (state.title || 'Chia tiền') : (ledgerState.title || 'Sổ chi tiêu')} - ${name}`,
        build: () => single ? buildSinglePersonBill(name) : buildLedgerPersonBill(name)
      };
      openShareImageModal();
    };

