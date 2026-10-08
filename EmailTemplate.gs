/**
 * EmailTemplate.gs - เทมเพลตและการสร้างเนื้อหาอีเมล
 * 
 * ฟังก์ชันสำหรับ:
 * - สร้างเนื้อหา email HTML
 * - สรุปสถานะงาน
 * - ป้องกัน HTML injection
 */

/**
 * สร้างเนื้อหาอีเมล HTML
 * @param {Sheet} sheet - Sheet object (เพื่อดึงข้อมูล summary)
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} rowData - ข้อมูลแถว
 * @param {Object} headerMap - Header map
 * @return {string} HTML content ของ email
 */
let FLOW_TRACKING_EVENTS_CACHE = null;

const EMAIL_FONT_STACK = "'Kanit','Sarabun','Leelawadee UI','Segoe UI',Tahoma,Arial,sans-serif";
const EMAIL_FLOW_MAX_EVENTS = 10;

function buildEmailBody(sheet, rowIndex, rowData, headerMap) {
  try {
    const contactMap = getEmailContactMap();
    const events = getFlowTrackingEventsForEmail(sheet, rowIndex, rowData, headerMap);
    const status = String(rowData.status || '').trim() || '-';
    const accentColor = getStatusAccentColor(status);
    const previousStatus = getPreviousFlowStatus(events, status);
    const statusHint = getStatusHint(status);
    const jobUrl = buildJobDetailUrl(rowData.jobNo);
    const jobNo = escapeHtml(rowData.jobNo || '-');
    const subjectText = escapeHtml(rowData.subject || '(ไม่มีหัวเรื่อง)');
    const subjectHtml = jobUrl
      ? '<a href="' + escapeHtml(jobUrl) + '" target="_blank" rel="noopener noreferrer" style="color:#0F172A; text-decoration:none;">' + subjectText + '</a>'
      : subjectText;
    const statusChangeHtml = previousStatus
      ? buildStatusBadgeHtml(previousStatus, true) +
        '<span style="display:inline-block; padding:0 10px; color:#94A3B8; font-size:16px; font-weight:700; vertical-align:middle;">&rarr;</span>' +
        buildStatusBadgeHtml(status, false)
      : buildStatusBadgeHtml(status, false);
    const preheader = 'JOB ' + (rowData.jobNo || '-') + ' · สถานะ ' + status + ' · ' + (rowData.subject || '');
    const actionButton = jobUrl
      ? `
          <tr>
            <td class="px" align="center" style="padding:24px 28px 0 28px;">
              <a href="${escapeHtml(jobUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; background-color:#0F766E; color:#FFFFFF; font-family:${EMAIL_FONT_STACK}; font-size:14px; font-weight:700; line-height:1; text-decoration:none; padding:13px 28px; border-radius:8px;">เปิดรายละเอียดงานใน Bluesea &rarr;</a>
            </td>
          </tr>`
      : '';

    const html = `
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light">
        <meta name="supported-color-schemes" content="light">
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap');
          @media (max-width: 600px) {
            .px { padding-left: 18px !important; padding-right: 18px !important; }
            .stack { display: block !important; width: 100% !important; box-sizing: border-box; }
            .stack-right { border-left: 0 !important; border-top: 1px solid #F1F5F9 !important; }
            .subject { font-size: 18px !important; }
          }
        </style>
      </head>
      <body style="margin:0; padding:0; background-color:#F1F5F4; font-family:${EMAIL_FONT_STACK}; color:#0F172A;">
        <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(preheader)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F4;">
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px; background-color:#FFFFFF; border:1px solid #E2E8F0; border-radius:14px; border-collapse:separate; overflow:hidden;">
                <tr>
                  <td style="height:6px; line-height:6px; font-size:0; background-color:${accentColor};">&nbsp;</td>
                </tr>

                <!-- Header -->
                <tr>
                  <td class="px" style="padding:22px 28px 0 28px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:${EMAIL_FONT_STACK}; font-size:12px; font-weight:700; color:#0F766E; letter-spacing:0.04em;">CRM REPORT &middot; แจ้งเตือนสถานะงาน</td>
                        <td align="right" style="font-family:${EMAIL_FONT_STACK}; font-size:12px; color:#94A3B8; white-space:nowrap;">${escapeHtml(formatThaiDate(new Date()))}</td>
                      </tr>
                    </table>
                    <div style="margin-top:16px; font-family:${EMAIL_FONT_STACK}; font-size:13px; font-weight:700; color:#64748B; letter-spacing:0.02em;">JOB ${jobNo}</div>
                    <div class="subject" style="margin-top:4px; font-family:${EMAIL_FONT_STACK}; font-size:20px; line-height:1.45; font-weight:700; color:#0F172A;">${subjectHtml}</div>
                  </td>
                </tr>

                <!-- Status -->
                <tr>
                  <td class="px" style="padding:18px 28px 0 28px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC; border:1px solid #E2E8F0; border-left:4px solid ${accentColor}; border-radius:10px; border-collapse:separate;">
                      <tr>
                        <td style="padding:14px 16px; font-family:${EMAIL_FONT_STACK};">
                          <div style="font-size:12px; font-weight:600; color:#64748B; margin-bottom:8px;">${previousStatus ? 'สถานะเปลี่ยนเป็น' : 'สถานะปัจจุบัน'}</div>
                          <div>${statusChangeHtml}</div>
                          ${statusHint ? '<div style="margin-top:8px; font-size:13px; color:#334155;">' + escapeHtml(statusHint) + '</div>' : ''}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Job Details -->
                <tr>
                  <td class="px" style="padding:24px 28px 0 28px;">
                    ${buildEmailSectionTitle('รายละเอียดงาน', '')}
                    ${buildDetailsTable(rowData, contactMap)}
                  </td>
                </tr>

                ${actionButton}

                ${buildFlowTrackingSection(events, contactMap)}

                <tr>
                  <td style="height:28px; line-height:28px; font-size:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Footer -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;">
                <tr>
                  <td align="center" style="padding:16px 12px 0 12px; font-family:${EMAIL_FONT_STACK}; font-size:12px; line-height:1.6; color:#94A3B8;">
                    อีเมลนี้ส่งอัตโนมัติจากระบบ CRM Report เพื่อแจ้งสถานะงาน<br>โปรดอย่าตอบกลับอีเมลนี้
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return html;
  } catch (e) {
    log('Error building email body: ' + e.message, LOG_LEVEL.ERROR);
    return '<p>Error generating email body</p>';
  }
}

/**
 * สรุปจำนวนเคสตามสถานะ
 * @param {Sheet} sheet - Sheet object
 * @param {Object} headerMap - Header map
 * @param {string} recipientAssignto - assignto ของผู้รับอีเมล
 * @return {string} HTML content ของ summary
 */
function buildStatusSummary(sheet, headerMap, recipientAssignto) {
  try {
    const rows = getRelatedJobRowsForRecipient(sheet, headerMap, recipientAssignto);
    return buildSummaryCardsFromRows(rows);
  } catch (e) {
    log('Error building status summary: ' + e.message, LOG_LEVEL.WARNING);
    return '<p>ไม่สามารถสรุปสถานะได้</p>';
  }
}

/**
 * สร้างเนื้อหาอีเมลรายงานสรุปแยกจากเมลแจ้งเตือนราย Job
 * @param {string} recipientId - ID ผู้รับรายงาน
 * @param {Array<Object>} relatedRows - รายการงานที่เกี่ยวข้องกับผู้รับ
 * @return {string} HTML content ของ summary email
 */
function buildDailySummaryEmailBody(recipientId, relatedRows) {
  try {
    const contactMap = getEmailContactMap();
    const summaryMetrics = buildSummaryMetrics(relatedRows);
    const today = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'dd/MM/yyyy');
    const recipientContact = contactMap[normalizeId(recipientId)];
    const recipientName = recipientContact && String(recipientContact.name || '').trim()
      ? String(recipientContact.name).trim()
      : normalizeId(recipientId);
    const preheader = 'สรุปงานวันที่ ' + today + ' · ต้องติดตาม ' + summaryMetrics.total + ' เคส';

    const html = `
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light">
        <meta name="supported-color-schemes" content="light">
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap');
          @media (max-width: 600px) {
            .px { padding-left: 16px !important; padding-right: 16px !important; }
            .stack { display: block !important; width: 100% !important; box-sizing: border-box; }
            .stack-gap { padding: 0 0 10px 0 !important; }
            .hide-sm { display: none !important; }
            .title { font-size: 20px !important; }
          }
        </style>
      </head>
      <body style="margin:0; padding:0; background-color:#F1F5F4; font-family:${EMAIL_FONT_STACK}; color:#0F172A;">
        <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(preheader)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F4;">
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:760px; background-color:#FFFFFF; border:1px solid #E2E8F0; border-radius:14px; border-collapse:separate; overflow:hidden;">
                <tr>
                  <td style="height:6px; line-height:6px; font-size:0; background-color:#0F766E;">&nbsp;</td>
                </tr>

                <!-- Header -->
                <tr>
                  <td class="px" style="padding:22px 28px 0 28px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:${EMAIL_FONT_STACK}; font-size:12px; font-weight:700; color:#0F766E; letter-spacing:0.04em;">CRM REPORT SUMMARY</td>
                        <td align="right" style="font-family:${EMAIL_FONT_STACK};">
                          <span style="display:inline-block; padding:4px 12px; border-radius:999px; background-color:#F0FDFA; border:1px solid #CCFBF1; color:#0F766E; font-size:12px; font-weight:600; white-space:nowrap;">${escapeHtml(today)}</span>
                        </td>
                      </tr>
                    </table>
                    <div class="title" style="margin-top:14px; font-family:${EMAIL_FONT_STACK}; font-size:24px; line-height:1.35; font-weight:700; color:#0F172A;">สรุปงานที่ต้องติดตาม</div>
                    <div style="margin-top:4px; font-family:${EMAIL_FONT_STACK}; font-size:14px; color:#64748B;">สวัสดีคุณ ${escapeHtml(recipientName)} นี่คือภาพรวมงานที่เกี่ยวข้องกับคุณวันนี้</div>
                  </td>
                </tr>

                <!-- KPI -->
                <tr>
                  <td class="px" style="padding:20px 28px 0 28px;">
                    ${buildSummaryKpiCards(summaryMetrics)}
                  </td>
                </tr>

                <!-- Status breakdown -->
                <tr>
                  <td class="px" style="padding:26px 28px 0 28px;">
                    ${buildEmailSectionTitle('สรุปตามสถานะ', 'รวม ' + summaryMetrics.total + ' เคส')}
                    ${buildSummaryCardsFromRows(relatedRows)}
                  </td>
                </tr>

                ${buildPrioritySummary(relatedRows)}

                <!-- Job list -->
                <tr>
                  <td class="px" style="padding:26px 28px 0 28px;">
                    ${buildEmailSectionTitle('รายการงานที่ต้องติดตาม', 'เรียงจากเคสที่ค้างนานที่สุด')}
                    ${buildSummaryJobList(relatedRows, recipientId)}
                  </td>
                </tr>

                <tr>
                  <td style="height:28px; line-height:28px; font-size:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Footer -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:760px;">
                <tr>
                  <td align="center" style="padding:16px 12px 0 12px; font-family:${EMAIL_FONT_STACK}; font-size:12px; line-height:1.6; color:#94A3B8;">
                    อีเมลนี้ส่งอัตโนมัติจากระบบ CRM Report เพื่อสรุปสถานะงานประจำวัน<br>โปรดอย่าตอบกลับอีเมลนี้
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return html;
  } catch (e) {
    log('Error building daily summary email body: ' + e.message, LOG_LEVEL.ERROR);
    return '<p>Error generating summary email body</p>';
  }
}

/**
 * ดึงงานที่เกี่ยวข้องกับผู้รับ โดยนับ originalAssignto/ownerSubjectId และถ้าผู้รับเป็น DEV ให้นับ sysDevelop และ assignto เพิ่ม โดยไม่ซ้ำ jobNo
 * @param {Sheet} sheet - Sheet object
 * @param {Object} headerMap - Header map
 * @param {string} recipientId - ID ผู้รับรายงาน
 * @return {Array<Object>} รายการงานที่เกี่ยวข้อง
 */
function getRelatedJobRowsForRecipient(sheet, headerMap, recipientId, includeQaRows) {
  const values = sheet.getDataRange().getValues();
  const normalizedRecipientId = normalizeId(recipientId);
  const relatedRows = [];
  const countedJobNo = {};
  const shouldIncludeDevWork = isDevAssignee(normalizedRecipientId);

  if (!normalizedRecipientId || values.length <= 1) {
    return relatedRows;
  }

  const indexes = {
    jobNo: headerMap.jobNo - 1,
    subject: headerMap.subject - 1,
    ownerSubjectId: headerMap.ownerSubjectId - 1,
    contactDate: headerMap.contactDate - 1,
    assignto: headerMap.assignto - 1,
    originalAssignto: headerMap.originalAssignto ? headerMap.originalAssignto - 1 : -1,
    sysserViceTypeName: headerMap.sysserViceTypeName - 1,
    status: headerMap.status - 1,
    productName: headerMap.productName - 1,
    sysDevelop: headerMap.sysDevelop - 1
  };

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const assignto = normalizeId(row[indexes.assignto]);
    const originalAssignto = indexes.originalAssignto !== -1
      ? normalizeId(row[indexes.originalAssignto])
      : '';
    const primaryAssignto = originalAssignto || assignto;
    const ownerSubjectId = normalizeId(row[indexes.ownerSubjectId]);
    const sysDevelop = normalizeId(row[indexes.sysDevelop]);
    const isRelatedToRecipient =
      primaryAssignto === normalizedRecipientId ||
      ownerSubjectId === normalizedRecipientId ||
      (shouldIncludeDevWork && (sysDevelop === normalizedRecipientId || assignto === normalizedRecipientId));

    if (!isRelatedToRecipient) {
      continue;
    }

    const jobNo = String(row[indexes.jobNo] || '').trim();
    const countKey = jobNo || ('row-' + i);
    if (countedJobNo[countKey]) {
      continue;
    }

    countedJobNo[countKey] = true;
    relatedRows.push({
      jobNo: jobNo,
      subject: row[indexes.subject],
      ownerSubjectId: row[indexes.ownerSubjectId],
      contactDate: row[indexes.contactDate],
      assignto: row[indexes.assignto],
      originalAssignto: indexes.originalAssignto !== -1 ? row[indexes.originalAssignto] : '',
      sysserViceTypeName: row[indexes.sysserViceTypeName],
      status: row[indexes.status],
      productName: row[indexes.productName],
      sysDevelop: row[indexes.sysDevelop]
    });
  }

  return relatedRows;
}

/**
 * ตรวจสอบว่ารหัสผู้รับเป็นพนักงาน DEV หรือไม่
 * @param {*} assigntoId - รหัสพนักงาน
 * @return {boolean} true ถ้าเป็น DEV
 */
function isDevAssignee(assigntoId) {
  return getEmployeeDepartment(assigntoId) === 'DEV';
}

/**
 * หาแผนกของพนักงานจากรหัส
 * @param {*} assigntoId - รหัสพนักงาน
 * @return {string} ชื่อแผนก หรือค่าว่างถ้าไม่พบ
 */
function getEmployeeDepartment(assigntoId) {
  const normalizedId = normalizeId(assigntoId);
  const departments = Object.keys(EMPLOYEE_DEPARTMENTS);

  for (let i = 0; i < departments.length; i++) {
    const department = departments[i];
    if (EMPLOYEE_DEPARTMENTS[department].indexOf(normalizedId) !== -1) {
      return department;
    }
  }

  return '';
}

/**
 * สร้างตัวเลข KPI สำหรับส่วนบนของ Report Summary
 * @param {Array<Object>} rows - รายการงานที่เกี่ยวข้อง
 * @return {Object} ค่า KPI ที่จัดรูปแบบแล้ว
 */
function buildSummaryMetrics(rows) {
  const trackedRows = rows.filter((row) => normalizeSummaryStatus(row.status));
  const ages = trackedRows
    .map((row) => getCaseAgeDays(row.contactDate))
    .filter((age) => age !== '' && !isNaN(Number(age)))
    .map((age) => Number(age));
  const todayKey = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'dd/MM/yyyy');
  const newToday = trackedRows.filter((row) => {
    const date = parseContactDateValue(row.contactDate);
    return date && Utilities.formatDate(date, EMAIL_TIMEZONE, 'dd/MM/yyyy') === todayKey;
  }).length;

  return {
    total: trackedRows.length,
    oldest: ages.length > 0 ? Math.max.apply(null, ages) : '-',
    newToday: newToday
  };
}

/**
 * สร้าง KPI cards สำหรับอีเมล Report Summary
 * @param {Object} metrics - ค่า KPI
 * @return {string} HTML KPI cards
 */
function buildSummaryKpiCards(metrics) {
  const oldestColor = metrics.oldest === '-'
    ? '#0F172A'
    : getCaseAgeColors(Number(metrics.oldest)).text;
  const cards = [
    { label: 'เคสที่ต้องติดตาม', value: metrics.total, unit: 'เคส', color: '#0F766E' },
    { label: 'เคสค้างนานสุด', value: metrics.oldest, unit: metrics.oldest === '-' ? '' : 'วัน', color: oldestColor },
    { label: 'เคสที่แจ้งวันนี้', value: metrics.newToday, unit: 'เคส', color: '#2563EB' }
  ];
  let cellsHtml = '';

  cards.forEach((card, index) => {
    const gap = index < cards.length - 1 ? 'padding-right:10px;' : '';
    cellsHtml += `
      <td class="stack stack-gap" width="33%" valign="top" style="${gap}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; border-collapse:separate;">
          <tr>
            <td style="padding:14px 16px; font-family:${EMAIL_FONT_STACK};">
              <div style="font-size:12px; color:#64748B;">${escapeHtml(card.label)}</div>
              <div style="margin-top:4px; font-size:28px; line-height:1.15; font-weight:700; color:${card.color};">${escapeHtml(String(card.value))}<span style="font-size:13px; font-weight:500; color:#64748B;"> ${escapeHtml(card.unit)}</span></div>
            </td>
          </tr>
        </table>
      </td>
    `;
  });

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${cellsHtml}</tr>
    </table>
  `;
}

/**
 * สร้างกลุ่มเคสที่ควรติดตามก่อน โดยเลือกจากอายุเคสมากที่สุด
 * @param {Array<Object>} rows - รายการงานที่เกี่ยวข้อง
 * @return {string} HTML table row หรือค่าว่างถ้าไม่มีเคส
 */
function buildPrioritySummary(rows) {
  const priorityRows = rows
    .filter((row) => normalizeSummaryStatus(row.status))
    .sort(compareRowsByCaseAgeDaysDesc)
    .slice(0, 3);

  if (priorityRows.length === 0) {
    return '';
  }

  let itemsHtml = '';

  priorityRows.forEach((row, index) => {
    const rowBorder = index > 0 ? 'border-top:1px solid #FDE68A;' : '';
    itemsHtml += `
      <tr>
        <td width="34" valign="top" style="padding:12px 0 12px 16px; ${rowBorder}">
          <div style="width:24px; height:24px; border-radius:12px; background-color:#D97706; color:#FFFFFF; font-family:${EMAIL_FONT_STACK}; font-size:12px; font-weight:700; line-height:24px; text-align:center;">${index + 1}</div>
        </td>
        <td valign="top" style="padding:12px 10px; ${rowBorder} font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:14px; font-weight:700; color:#0F172A;">${buildJobLinkHtml(row.jobNo, row.jobNo, '')}</div>
          <div style="margin-top:2px; font-size:13px; line-height:1.5; color:#475569;">${escapeHtml(truncateText(row.subject, 110))}</div>
        </td>
        <td width="1" align="right" valign="top" style="padding:12px 16px 12px 0; ${rowBorder} white-space:nowrap;">
          ${buildStatusBadgeHtml(normalizeSummaryStatus(row.status), false)}
          <div style="margin-top:6px;">${buildCaseAgeBadgeHtml(row.contactDate)}</div>
        </td>
      </tr>
    `;
  });

  return `
    <tr>
      <td class="px" style="padding:26px 28px 0 28px;">
        ${buildEmailSectionTitle('เคสที่ควรติดตามก่อน', 'ค้างนานที่สุด ' + priorityRows.length + ' อันดับ')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFBEB; border:1px solid #FDE68A; border-radius:10px; border-collapse:separate;">
          ${itemsHtml}
        </table>
      </td>
    </tr>
  `;
}

/**
 * สร้าง card สรุปสถานะ 4 สถานะหลักจากรายการงาน พร้อมแถบสัดส่วน
 * @param {Array<Object>} rows - รายการงาน
 * @return {string} HTML card summary
 */
function buildSummaryCardsFromRows(rows) {
  const summary = {};
  const statuses = ['Open', 'Continue', 'EditErr', 'Test'];
  let total = 0;

  statuses.forEach((status) => {
    summary[status] = 0;
  });

  rows.forEach((row) => {
    const status = normalizeSummaryStatus(row.status);
    if (status) {
      summary[status]++;
      total++;
    }
  });

  let barHtml = '';
  if (total > 0) {
    statuses.forEach((status) => {
      if (summary[status] > 0) {
        const percent = Math.max(1, Math.round((summary[status] / total) * 100));
        barHtml += '<td width="' + percent + '%" style="height:8px; line-height:8px; font-size:0; background-color:' + getStatusAccentColor(status) + ';">&nbsp;</td>';
      }
    });
  } else {
    barHtml = '<td style="height:8px; line-height:8px; font-size:0; background-color:#E2E8F0;">&nbsp;</td>';
  }

  let cellsHtml = '';
  statuses.forEach((status, index) => {
    const gap = index < statuses.length - 1 ? 'padding-right:10px;' : '';
    const isEmpty = summary[status] === 0;
    cellsHtml += `
      <td class="stack stack-gap" width="25%" valign="top" style="${gap}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${getStatusColor(status)}; border-radius:10px; border-collapse:separate; ${isEmpty ? 'opacity:0.6;' : ''}">
          <tr>
            <td style="padding:12px 14px; border-left:4px solid ${getStatusAccentColor(status)}; border-radius:10px; font-family:${EMAIL_FONT_STACK};">
              <div style="font-size:26px; line-height:1.15; font-weight:700; color:${getStatusTextColor(status)};">${summary[status]}</div>
              <div style="margin-top:2px; font-size:13px; font-weight:600; color:${getStatusTextColor(status)};">${escapeHtml(status)}</div>
            </td>
          </tr>
        </table>
      </td>
    `;
  });

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:999px; border-collapse:separate; overflow:hidden; margin-bottom:12px;">
      <tr>${barHtml}</tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${cellsHtml}</tr>
    </table>
  `;
}

/**
 * สร้างตารางรายการงานสำหรับอีเมล summary
 * @param {Array<Object>} rows - รายการงาน
 * @param {string} recipientId - ID ผู้รับรายงาน
 * @return {string} HTML table
 */
function buildSummaryJobList(rows, recipientId) {
  const trackedRows = rows
    .filter((row) => normalizeSummaryStatus(row.status))
    .sort(compareRowsByCaseAgeDaysDesc);
  const statuses = ['Open', 'Continue', 'EditErr', 'Test'];
  const contactMap = getEmailContactMap();
  const normalizedRecipientId = normalizeId(recipientId);

  if (trackedRows.length === 0) {
    return '<div style="padding:24px 16px; border:1px dashed #CBD5E1; border-radius:10px; text-align:center; font-family:' + EMAIL_FONT_STACK + '; font-size:14px; color:#64748B;">ไม่มีงานในสถานะ Open, Continue, EditErr หรือ Test</div>';
  }

  let html = '';
  const assingtoMatchedRows = normalizedRecipientId
    ? trackedRows.filter((row) => normalizeId(row.assignto) === normalizedRecipientId)
    : [];
  const otherRelatedRows = normalizedRecipientId
    ? trackedRows.filter((row) => normalizeId(row.assignto) !== normalizedRecipientId)
    : trackedRows;

  if (assingtoMatchedRows.length > 0) {
    html += buildSummaryJobGroup('งานที่คุณเป็นผู้รับผิดชอบ', assingtoMatchedRows, statuses, contactMap, 'primary');
  }

  if (otherRelatedRows.length > 0) {
    const title = assingtoMatchedRows.length > 0 ? 'งานอื่นที่เกี่ยวข้อง' : 'รายการงาน';
    html += buildSummaryJobGroup(title, otherRelatedRows, statuses, contactMap, 'secondary');
  }

  return html;
}

/**
 * สร้างกลุ่มรายการงานใน Report Summary โดยแยกตามสถานะ
 * @param {string} title - ชื่อกลุ่ม
 * @param {Array<Object>} rows - รายการงาน
 * @param {Array<string>} statuses - สถานะที่ต้องแสดง
 * @param {Object} contactMap - map จาก getEmailContactMap
 * @param {string} groupVariant - รูปแบบหัวกลุ่ม primary หรือ secondary
 * @return {string} HTML table/card group
 */
function buildSummaryJobGroup(title, rows, statuses, contactMap, groupVariant) {
  const isPrimary = groupVariant === 'primary';
  const headerBackground = isPrimary ? '#0F766E' : '#F1F5F9';
  const headerColor = isPrimary ? '#FFFFFF' : '#334155';
  const countBackground = isPrimary ? '#115E59' : '#FFFFFF';
  const countColor = isPrimary ? '#FFFFFF' : '#0F766E';
  let html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px 0; background-color:${headerBackground}; border-radius:10px; border-collapse:separate;">
      <tr>
        <td style="padding:11px 16px; font-family:${EMAIL_FONT_STACK}; font-size:15px; font-weight:700; color:${headerColor};">${escapeHtml(title)}</td>
        <td align="right" style="padding:11px 16px; font-family:${EMAIL_FONT_STACK};">
          <span style="display:inline-block; padding:3px 10px; border-radius:999px; background-color:${countBackground}; color:${countColor}; font-size:12px; font-weight:700; white-space:nowrap;">${rows.length} เคส</span>
        </td>
      </tr>
    </table>
  `;

  statuses.forEach((status) => {
    const statusRows = rows.filter((row) => normalizeSummaryStatus(row.status) === status);
    if (statusRows.length === 0) {
      return;
    }

    html += `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
        <tr>
          <td style="padding:0 0 8px 2px; font-family:${EMAIL_FONT_STACK}; font-size:13px; font-weight:700; color:#334155;">
            <span style="display:inline-block; width:8px; height:8px; border-radius:4px; background-color:${getStatusAccentColor(status)}; margin-right:6px; vertical-align:middle;"></span>${escapeHtml(status)}
            <span style="font-weight:400; color:#94A3B8;">&nbsp;· ${statusRows.length} เคส</span>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0; border-radius:10px; border-collapse:separate; overflow:hidden;">
        <tr>
          <th align="left" style="padding:9px 14px; background-color:#F8FAFC; border-bottom:1px solid #E2E8F0; font-family:${EMAIL_FONT_STACK}; font-size:12px; font-weight:600; color:#64748B;">งาน</th>
          <th class="hide-sm" width="150" align="left" style="padding:9px 10px; background-color:#F8FAFC; border-bottom:1px solid #E2E8F0; font-family:${EMAIL_FONT_STACK}; font-size:12px; font-weight:600; color:#64748B; white-space:nowrap;">ผู้รับผิดชอบ</th>
          <th class="hide-sm" width="130" align="left" style="padding:9px 10px; background-color:#F8FAFC; border-bottom:1px solid #E2E8F0; font-family:${EMAIL_FONT_STACK}; font-size:12px; font-weight:600; color:#64748B; white-space:nowrap;">วันที่แจ้ง</th>
          <th width="70" align="right" style="padding:9px 14px; background-color:#F8FAFC; border-bottom:1px solid #E2E8F0; font-family:${EMAIL_FONT_STACK}; font-size:12px; font-weight:600; color:#64748B; white-space:nowrap;">ค้างมา</th>
        </tr>
    `;

    statusRows.forEach((row, index) => {
      const rowBorder = index > 0 ? 'border-top:1px solid #F1F5F9;' : '';
      html += `
        <tr>
          <td valign="top" style="padding:11px 14px; ${rowBorder} font-family:${EMAIL_FONT_STACK};">
            <div style="font-size:13px; font-weight:700; color:#0F172A;">${buildJobLinkHtml(row.jobNo, row.jobNo, '')}</div>
            <div style="margin-top:2px; font-size:13px; line-height:1.5; color:#475569;">${escapeHtml(truncateText(row.subject, 90))}</div>
          </td>
          <td class="hide-sm" valign="top" style="padding:11px 10px; ${rowBorder} font-family:${EMAIL_FONT_STACK}; font-size:13px; color:#334155;">${buildPersonHtml(row.assignto, contactMap)}</td>
          <td class="hide-sm" valign="top" style="padding:11px 10px; ${rowBorder} font-family:${EMAIL_FONT_STACK}; font-size:12px; color:#64748B; white-space:nowrap;">${escapeHtml(formatSummaryContactDate(row.contactDate) || '-')}</td>
          <td align="right" valign="top" style="padding:11px 14px; ${rowBorder} white-space:nowrap;">${buildCaseAgeBadgeHtml(row.contactDate)}</td>
        </tr>
      `;
    });

    html += '</table>';
  });

  return html;
}

/**
 * สีของ badge อายุเคส
 * @param {number} age - จำนวนวัน
 * @return {Object} { background, text }
 */
function getCaseAgeColors(age) {
  if (isNaN(age) || age >= 8 && age < 30) {
    return { background: '#FEF3C7', text: '#B45309' };
  }

  if (age >= 30) {
    return { background: '#FEE2E2', text: '#B91C1C' };
  }

  return { background: '#DCFCE7', text: '#15803D' };
}

/**
 * สร้าง badge แสดงจำนวนวันที่เคสค้าง
 * @param {*} contactDate - วันที่แจ้ง
 * @return {string} HTML
 */
function buildCaseAgeBadgeHtml(contactDate) {
  const ageText = getCaseAgeDays(contactDate);
  const colors = getCaseAgeColors(ageText === '' ? NaN : Number(ageText));

  return '<span style="display:inline-block; padding:3px 10px; border-radius:999px; background-color:' + colors.background + '; color:' + colors.text + '; font-family:' + EMAIL_FONT_STACK + '; font-size:12px; font-weight:700; white-space:nowrap;">' + escapeHtml(ageText || '-') + ' วัน</span>';
}

/**
 * สร้าง HTML table ของรายละเอียดงาน
 * @param {Object} rowData - ข้อมูลแถว
 * @param {Object} contactMap - map รหัสพนักงาน -> ข้อมูลติดต่อ (ถ้าไม่ส่งจะดึงเอง)
 * @return {string} HTML table
 */
function buildDetailsTable(rowData, contactMap) {
  try {
    const contacts = contactMap || getEmailContactMap();
    const fields = [
      ['ผู้แจ้ง', buildPersonHtml(rowData.ownerSubjectId, contacts)],
      ['วันที่แจ้ง', escapeHtml(formatSummaryContactDate(rowData.contactDate) || '-')],
      ['ผู้รับผิดชอบ', buildPersonHtml(rowData.assignto, contacts)],
      ['DEV', buildPersonHtml(rowData.sysDevelop, contacts)],
      ['ประเภทบริการ', escapeHtml(rowData.sysserViceTypeName || '-')],
      ['โปรแกรม', escapeHtml(rowData.productName || '-')]
    ];
    let rowsHtml = '';

    for (let i = 0; i < fields.length; i += 2) {
      const rowBorder = i > 0 ? 'border-top:1px solid #F1F5F9;' : '';
      rowsHtml += `
        <tr>
          <td class="stack" width="50%" valign="top" style="padding:12px 16px; ${rowBorder} font-family:${EMAIL_FONT_STACK};">
            <div style="font-size:12px; color:#64748B; margin-bottom:3px;">${fields[i][0]}</div>
            <div style="font-size:14px; font-weight:600; line-height:1.45; color:#0F172A;">${fields[i][1]}</div>
          </td>
          <td class="stack stack-right" width="50%" valign="top" style="padding:12px 16px; ${rowBorder} border-left:1px solid #F1F5F9; font-family:${EMAIL_FONT_STACK};">
            <div style="font-size:12px; color:#64748B; margin-bottom:3px;">${fields[i + 1][0]}</div>
            <div style="font-size:14px; font-weight:600; line-height:1.45; color:#0F172A;">${fields[i + 1][1]}</div>
          </td>
        </tr>
      `;
    }

    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0; border-radius:10px; border-collapse:separate;">
        ${rowsHtml}
      </table>
    `;
  } catch (e) {
    log('Error building details table: ' + e.message, LOG_LEVEL.ERROR);
    return '<p>Error generating details table</p>';
  }
}

/**
 * สร้างส่วนประวัติการเปลี่ยนสถานะ (Flow Tracking) สำหรับเมลแจ้งสถานะงาน
 * แสดงรายการล่าสุดก่อน และจำกัดจำนวนตาม EMAIL_FLOW_MAX_EVENTS
 * @param {Array} events - รายการ flow tracking เรียงจากเก่าไปใหม่
 * @param {Object} contactMap - map รหัสพนักงาน -> ข้อมูลติดต่อ
 * @return {string} HTML table rows หรือค่าว่างถ้าไม่มีข้อมูล
 */
function buildFlowTrackingSection(events, contactMap) {
  try {
    if (!events || events.length === 0) {
      return '';
    }

    const recentEvents = events.slice(-EMAIL_FLOW_MAX_EVENTS).reverse();
    const countLabel = events.length > recentEvents.length
      ? 'แสดง ' + recentEvents.length + ' จาก ' + events.length + ' รายการ'
      : events.length + ' รายการ';
    let rowsHtml = '';

    recentEvents.forEach((event, index) => {
      const isLatest = index === 0;
      const rowBorder = index > 0 ? 'border-top:1px solid #F1F5F9;' : '';
      const rowBackground = isLatest ? 'background-color:#F8FAFC;' : '';
      const latestTag = isLatest
        ? '<span style="display:inline-block; margin-left:6px; padding:2px 8px; border-radius:999px; background-color:#0F766E; color:#FFFFFF; font-size:11px; font-weight:700; vertical-align:middle;">ล่าสุด</span>'
        : '';

      rowsHtml += `
        <tr>
          <td width="28" valign="top" style="padding:16px 0 14px 16px; ${rowBorder} ${rowBackground}">
            <div style="width:10px; height:10px; border-radius:5px; background-color:${getStatusAccentColor(event.status)}; font-size:0; line-height:0;">&nbsp;</div>
          </td>
          <td valign="top" style="padding:12px 16px 12px 6px; ${rowBorder} ${rowBackground} font-family:${EMAIL_FONT_STACK};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${EMAIL_FONT_STACK};">${buildStatusBadgeHtml(event.status || '-', !isLatest)}${latestTag}</td>
                <td align="right" style="font-family:${EMAIL_FONT_STACK}; font-size:12px; color:#94A3B8; white-space:nowrap;">${escapeHtml(formatFlowTrackingTimestamp(event.timestamp))}</td>
              </tr>
            </table>
            <div style="margin-top:6px; font-size:13px; line-height:1.55; color:#475569;">
              ผู้รับผิดชอบ: ${buildPersonHtml(event.assignto, contactMap)}<br>
              DEV: ${buildPersonHtml(event.sysDevelop, contactMap)}
            </div>
          </td>
        </tr>
      `;
    });

    return `
      <tr>
        <td class="px" style="padding:28px 28px 0 28px;">
          ${buildEmailSectionTitle('ประวัติการเปลี่ยนสถานะ', countLabel)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0; border-radius:10px; border-collapse:separate; overflow:hidden;">
            ${rowsHtml}
          </table>
        </td>
      </tr>
    `;
  } catch (e) {
    log('Error building flow tracking section: ' + e.message, LOG_LEVEL.WARNING);
    return '';
  }
}

/**
 * ดึงรายการ Flow Tracking ของงาน จากชีต FLOW_TRACKING ก่อน แล้วค่อย fallback เป็นคอลัมน์ flowTracking เดิม
 * @param {Sheet} sheet - Sheet object
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} rowData - ข้อมูลแถว
 * @param {Object} headerMap - Header map
 * @return {Array} รายการ event เรียงจากเก่าไปใหม่
 */
function getFlowTrackingEventsForEmail(sheet, rowIndex, rowData, headerMap) {
  try {
    const events = getFlowTrackingEventsFromSheet(rowData && rowData.jobNo);

    if (events.length > 0) {
      return events;
    }

    return parseFlowTrackingEvents(getFlowTrackingText(sheet, rowIndex, rowData, headerMap));
  } catch (e) {
    log('Error getting flow tracking events: ' + e.message, LOG_LEVEL.WARNING);
    return [];
  }
}

/**
 * หาสถานะก่อนหน้าที่ต่างจากสถานะปัจจุบัน เพื่อแสดงการเปลี่ยนสถานะ
 * @param {Array} events - รายการ flow tracking เรียงจากเก่าไปใหม่
 * @param {string} currentStatus - สถานะปัจจุบัน
 * @return {string} สถานะก่อนหน้า หรือค่าว่างถ้าไม่มี
 */
function getPreviousFlowStatus(events, currentStatus) {
  const current = String(currentStatus || '').trim().toLowerCase();

  for (let i = (events || []).length - 1; i >= 0; i--) {
    const status = String(events[i].status || '').trim();

    if (status && status.toLowerCase() !== current) {
      return status;
    }
  }

  return '';
}

/**
 * สร้างหัวข้อ section ของเมลแจ้งสถานะงาน
 * @param {string} title - ชื่อหัวข้อ
 * @param {string} note - ข้อความเสริมด้านขวา
 * @return {string} HTML
 */
function buildEmailSectionTitle(title, note) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
      <tr>
        <td style="font-family:${EMAIL_FONT_STACK}; font-size:15px; font-weight:700; color:#0F172A;">${escapeHtml(title)}</td>
        <td align="right" style="font-family:${EMAIL_FONT_STACK}; font-size:12px; color:#94A3B8;">${escapeHtml(note || '')}</td>
      </tr>
    </table>
  `;
}

/**
 * สร้าง badge สถานะแบบ inline style
 * @param {string} status - สถานะ
 * @param {boolean} muted - true เพื่อแสดงแบบจาง (สถานะเดิม)
 * @return {string} HTML
 */
function buildStatusBadgeHtml(status, muted) {
  const background = getStatusColor(status);
  const border = background === '#FFFFFF' ? '#CBD5E1' : background;
  const opacity = muted ? 'opacity:0.7;' : '';

  return '<span style="display:inline-block; padding:5px 12px; border-radius:999px; border:1px solid ' + border + '; background-color:' + background + '; color:' + getStatusTextColor(status) + '; font-family:' + EMAIL_FONT_STACK + '; font-size:13px; font-weight:700; line-height:1.2; vertical-align:middle; ' + opacity + '">' + escapeHtml(status || '-') + '</span>';
}

/**
 * แสดงชื่อพนักงานพร้อมรหัสแบบจาง เช่น สมชาย (6101)
 * @param {*} personId - รหัสพนักงาน
 * @param {Object} contactMap - map รหัสพนักงาน -> ข้อมูลติดต่อ
 * @return {string} HTML ที่ escape แล้ว
 */
function buildPersonHtml(personId, contactMap) {
  const id = String(personId || '').trim();

  if (!id) {
    return '<span style="color:#94A3B8; font-weight:400;">-</span>';
  }

  const contact = contactMap && contactMap[id];
  const name = contact ? String(contact.name || '').trim() : '';

  return name
    ? escapeHtml(name) + ' <span style="color:#94A3B8; font-weight:400;">(' + escapeHtml(id) + ')</span>'
    : escapeHtml(id);
}

/**
 * สีหลักของแต่ละสถานะ ใช้กับแถบด้านบน เส้นขอบ และจุดใน timeline
 * @param {string} status - สถานะ
 * @return {string} CSS color
 */
function getStatusAccentColor(status) {
  const accentMap = {
    'open': '#64748B',
    'continue': '#D97706',
    'editerr': '#DC2626',
    'test': '#2563EB'
  };

  return accentMap[String(status || '').trim().toLowerCase()] || '#0F766E';
}

/**
 * คำอธิบายสั้นๆ ของแต่ละสถานะ
 * @param {string} status - สถานะ
 * @return {string} ข้อความ หรือค่าว่างถ้าไม่มี
 */
function getStatusHint(status) {
  const hintMap = {
    'open': 'งานใหม่เข้าระบบ รอดำเนินการ',
    'continue': 'งานอยู่ระหว่างดำเนินการ',
    'editerr': 'งานถูกส่งกลับให้แก้ไข',
    'test': 'งานพร้อมให้ทดสอบ'
  };

  return hintMap[String(status || '').trim().toLowerCase()] || '';
}

/**
 * แสดงเวลา Flow Tracking เป็น dd/MM/yyyy HH:mm:ss เวลาไทย
 * @param {*} value - timestamp จาก FLOW_TRACKING หรือ flowTracking เดิม
 * @return {string} วันที่เวลาที่จัดรูปแบบแล้ว
 */
function formatFlowTrackingTimestamp(value) {
  const date = parseContactDateValue(value);

  if (!date) {
    return String(value || '').trim();
  }

  return Utilities.formatDate(date, EMAIL_TIMEZONE, DATE_TIME_FORMAT);
}

/**
 * อ่าน flow events จากชีท FLOW_TRACKING ตาม jobNo
 * @param {*} jobNo - Job No
 * @return {Array<Object>} events
 */
function getFlowTrackingEventsIndex() {
  if (FLOW_TRACKING_EVENTS_CACHE) {
    return FLOW_TRACKING_EVENTS_CACHE;
  }

  FLOW_TRACKING_EVENTS_CACHE = {};

  try {
    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const flowSheet = ss.getSheetByName(FLOW_TRACKING_SHEET_NAME);

    if (!flowSheet || flowSheet.getLastRow() <= 1) {
      return FLOW_TRACKING_EVENTS_CACHE;
    }

    const flowHeaderMap = buildFlowTrackingHeaderMap(flowSheet);
    const maxCol = getMaxHeaderColumn(flowHeaderMap);
    const rows = flowSheet.getRange(2, 1, flowSheet.getLastRow() - 1, maxCol).getValues();

    rows.forEach((row) => {
      const rowJobNo = String(row[flowHeaderMap.jobNo - 1] || '').trim();
      if (!rowJobNo) return;

      if (!FLOW_TRACKING_EVENTS_CACHE[rowJobNo]) {
        FLOW_TRACKING_EVENTS_CACHE[rowJobNo] = [];
      }

      FLOW_TRACKING_EVENTS_CACHE[rowJobNo].push({
        timestamp: row[flowHeaderMap.timestamp - 1],
        status: row[flowHeaderMap.status - 1],
        assignto: row[flowHeaderMap.assignto - 1],
        assigntoName: flowHeaderMap.assigntoName ? row[flowHeaderMap.assigntoName - 1] : '',
        sysDevelop: row[flowHeaderMap.sysDevelop - 1],
        sysDevelopName: flowHeaderMap.sysDevelopName ? row[flowHeaderMap.sysDevelopName - 1] : '',
        eventType: flowHeaderMap.eventType ? row[flowHeaderMap.eventType - 1] : ''
      });
    });

    Object.keys(FLOW_TRACKING_EVENTS_CACHE).forEach((key) => {
      FLOW_TRACKING_EVENTS_CACHE[key].sort(compareFlowTrackingEventsByTimestamp);
    });
  } catch (e) {
    log('Error reading flow tracking sheet: ' + e.message, LOG_LEVEL.WARNING);
  }

  return FLOW_TRACKING_EVENTS_CACHE;
}

function getFlowTrackingEventsFromSheet(jobNo) {
  try {
    const normalizedJobNo = String(jobNo || '').trim();

    if (!normalizedJobNo) {
      return [];
    }

    const eventsIndex = getFlowTrackingEventsIndex();
    return eventsIndex[normalizedJobNo] ? eventsIndex[normalizedJobNo].slice() : [];

    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const flowSheet = ss.getSheetByName(FLOW_TRACKING_SHEET_NAME);

    if (!flowSheet || flowSheet.getLastRow() <= 1) {
      return [];
    }

    const flowHeaderMap = buildFlowTrackingHeaderMap(flowSheet);
    const maxCol = getMaxHeaderColumn(flowHeaderMap);
    const rows = flowSheet.getRange(2, 1, flowSheet.getLastRow() - 1, maxCol).getValues();
    const events = [];

    rows.forEach((row) => {
      const rowJobNo = String(row[flowHeaderMap.jobNo - 1] || '').trim();

      if (rowJobNo !== normalizedJobNo) {
        return;
      }

      events.push({
        timestamp: row[flowHeaderMap.timestamp - 1],
        status: row[flowHeaderMap.status - 1],
        assignto: row[flowHeaderMap.assignto - 1],
        assigntoName: flowHeaderMap.assigntoName ? row[flowHeaderMap.assigntoName - 1] : '',
        sysDevelop: row[flowHeaderMap.sysDevelop - 1],
        sysDevelopName: flowHeaderMap.sysDevelopName ? row[flowHeaderMap.sysDevelopName - 1] : '',
        eventType: flowHeaderMap.eventType ? row[flowHeaderMap.eventType - 1] : ''
      });
    });

    events.sort(compareFlowTrackingEventsByTimestamp);
    return events;
  } catch (e) {
    log('Error reading flow tracking sheet: ' + e.message, LOG_LEVEL.WARNING);
    return [];
  }
}

/**
 * เรียง flow events ตาม timestamp จากเก่าไปใหม่
 * @param {Object} a - event แรก
 * @param {Object} b - event ที่สอง
 * @return {number} sort order
 */
function compareFlowTrackingEventsByTimestamp(a, b) {
  const dateA = parseContactDateValue(a && a.timestamp);
  const dateB = parseContactDateValue(b && b.timestamp);

  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;

  return dateA.getTime() - dateB.getTime();
}

/**
 * อ่าน flowTracking จาก rowData หรือจากชีท ถ้าไม่มีให้สร้างจากสถานะปัจจุบัน
 * @param {Sheet} sheet - Sheet object
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} rowData - ข้อมูลแถว
 * @param {Object} headerMap - Header map
 * @return {string} flowTracking
 */
function getFlowTrackingText(sheet, rowIndex, rowData, headerMap) {
  if (rowData && rowData.flowTracking) {
    return String(rowData.flowTracking || '').trim();
  }

  if (sheet && rowIndex > 0 && headerMap && headerMap.flowTracking) {
    const value = getCellValue(sheet, rowIndex, headerMap.flowTracking);
    if (value) {
      return String(value || '').trim();
    }
  }

  return [
    formatThaiDate(new Date()),
    String((rowData && rowData.status) || '').trim(),
    String((rowData && rowData.assignto) || '').trim(),
    String((rowData && rowData.sysDevelop) || '').trim()
  ].join('\t');
}

/**
 * แปลง flowTracking text เป็น event objects
 * @param {string} flowTrackingText - flowTracking text
 * @return {Array<Object>} events
 */
function parseFlowTrackingEvents(flowTrackingText) {
  const text = String(flowTrackingText || '').trim();

  if (!text) {
    return [];
  }

  return text.split('\n').map((line) => {
    const parts = String(line || '').split('\t');
    return {
      timestamp: parts[0] || '',
      status: parts[1] || '',
      assignto: parts[2] || '',
      sysDevelop: parts[3] || ''
    };
  }).filter((event) => event.timestamp || event.status || event.assignto || event.sysDevelop);
}

/**
 * แสดงรหัสต่อด้วยชื่อจากชีท EMAIL เช่น 6101 เหรียญทอง
 * @param {*} personId - รหัสผู้ใช้
 * @param {Object} contactMap - map จาก getEmailContactMap
 * @return {string} ข้อความสำหรับแสดงในอีเมล
 */
function formatPersonWithName(personId, contactMap) {
  const id = String(personId || '').trim();

  if (!id) {
    return '';
  }

  const contact = contactMap && contactMap[id];
  const name = contact ? String(contact.name || '').trim() : '';

  return name ? id + ' ' + name : id;
}

/**
 * ป้องกัน HTML Injection โดยเขียน HTML characters
 * @param {string} text - ข้อความที่ต้องป้องกัน
 * @return {string} ข้อความที่ป้องกันแล้ว
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * สร้าง URL หน้า Job Details ตาม prefix ของ Job No
 * @param {*} jobNo - Job No
 * @return {string} URL หรือค่าว่างถ้าไม่รองรับ
 */
function buildJobDetailUrl(jobNo) {
  const value = String(jobNo || '').trim();
  const upperValue = value.toUpperCase();
  const encodedJobNo = encodeURIComponent(value);

  if (upperValue.indexOf('BHD') === 0) {
    return 'https://bluesea.seniorsoft.com/bluesea/BookLicence/MA/Support/JobDetailsHD?JobNo=' + encodedJobNo + '&JobType=HD';
  }

  if (upperValue.indexOf('BFR') === 0) {
    return 'https://bluesea.seniorsoft.com/bluesea/BookLicence/MA/Support/JobDetailsFR?JobNo=' + encodedJobNo + '&JobType=FR';
  }

  return '';
}

/**
 * สร้าง HTML link สำหรับ Job No หรือ Subject ถ้า Job No รองรับลิงก์
 * @param {*} jobNo - Job No
 * @param {*} text - ข้อความที่จะแสดง
 * @param {string} className - CSS class สำหรับ tag
 * @return {string} HTML text/link ที่ escape แล้ว
 */
function buildJobLinkHtml(jobNo, text, className) {
  const url = buildJobDetailUrl(jobNo);
  const safeText = escapeHtml(text);
  const safeClassName = String(className || '').trim();
  const classAttribute = safeClassName ? ' class="' + escapeHtml(safeClassName) + '"' : '';
  const inlineStyle = safeClassName === 'header-subject'
    ? ' style="display:block; color:#FFFFFF !important; font-weight:800; line-height:1.35; text-decoration:none !important;"'
    : (safeClassName ? '' : ' style="color:#0F766E; font-weight:700; text-decoration:none;"');

  if (!url) {
    return safeClassName ? '<span' + classAttribute + inlineStyle + '>' + safeText + '</span>' : safeText;
  }

  return '<a href="' + escapeHtml(url) + '"' + classAttribute + inlineStyle + ' target="_blank" rel="noopener noreferrer">' + safeText + '</a>';
}

/**
 * หา card color ที่เหมาะสมสำหรับแต่ละสถานะ
 * @param {string} status - สถานะ
 * @return {string} CSS color
 */
function getStatusColor(status) {
  const statusLower = String(status || '').trim().toLowerCase();
  
  const colorMap = {
    'open': '#E9EEF0',
    'continue': '#FFF3D6',
    'editerr': '#FDE3DE',
    'test': '#E5ECFF'
  };
  
  return colorMap[statusLower] || '#FFFFFF';
}

/**
 * แปลง status เป็นชื่อมาตรฐานสำหรับ summary เฉพาะ 4 สถานะ
 * @param {string} status - สถานะ
 * @return {string} Open, Continue, EditErr, Test หรือ ''
 */
function normalizeSummaryStatus(status) {
  const statusLower = String(status || '').trim().toLowerCase();

  const statusMap = {
    'open': 'Open',
    'continue': 'Continue',
    'editerr': 'EditErr',
    'test': 'Test'
  };

  return statusMap[statusLower] || '';
}

/**
 * ตัดข้อความให้สั้นลงสำหรับแสดงในอีเมล
 * @param {*} value - ข้อความต้นทาง
 * @param {number} maxLength - จำนวนตัวอักษรสูงสุด
 * @return {string} ข้อความที่ตัดแล้ว
 */
function truncateText(value, maxLength) {
  const text = String(value || '').trim();

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - 3) + '...';
}

/**
 * แสดงวันที่แจ้งใน Report Summary เป็น dd/MM/yyyy HH:mm:ss เวลาไทย
 * @param {*} value - วันที่แจ้ง
 * @return {string} วันที่ที่จัดรูปแบบแล้ว
 */
function formatSummaryContactDate(value) {
  const date = parseContactDateValue(value);

  if (!date) {
    return String(value || '').trim();
  }

  return Utilities.formatDate(date, EMAIL_TIMEZONE, DATE_TIME_FORMAT);
}

/**
 * คำนวณจำนวนวันที่ส่งเคสมา นับจาก contactDate ถึงเวลาปัจจุบัน
 * @param {*} value - วันที่แจ้ง
 * @return {string} จำนวนวัน
 */
function getCaseAgeDays(value) {
  const date = parseContactDateValue(value);

  if (!date) {
    return '';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs <= 0) {
    return '0';
  }

  return String(Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

/**
 * เรียงรายการ Report Summary ตามจำนวนวันจากมากไปน้อย
 * @param {Object} a - row แรก
 * @param {Object} b - row ที่สอง
 * @return {number} sort order
 */
function compareRowsByCaseAgeDaysDesc(a, b) {
  const dateA = parseContactDateValue(a.contactDate);
  const dateB = parseContactDateValue(b.contactDate);
  const ageA = getCaseAgeDaysNumber(dateA);
  const ageB = getCaseAgeDaysNumber(dateB);

  if (ageA !== ageB) {
    return ageB - ageA;
  }

  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;

  return dateA.getTime() - dateB.getTime();
}

/**
 * คืนจำนวนวันเป็นตัวเลขสำหรับใช้ sort
 * @param {Date|null} date - วันที่แจ้ง
 * @return {number} จำนวนวัน
 */
function getCaseAgeDaysNumber(date) {
  if (!date) {
    return -1;
  }

  const diffMs = new Date().getTime() - date.getTime();

  if (diffMs <= 0) {
    return 0;
  }

  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Normalize ID สำหรับเทียบ assignto/ownerSubjectId
 * @param {*} value - ค่า ID
 * @return {string} ID ที่ trim แล้ว
 */
function normalizeId(value) {
  return String(value || '').trim();
}

/**
 * หา text color สำหรับ status card
 * @param {string} status - สถานะ
 * @return {string} CSS color
 */
function getStatusTextColor(status) {
  const statusLower = String(status || '').trim().toLowerCase();

  const textColorMap = {
    'open': '#27433F',
    'continue': '#8A5A00',
    'editerr': '#AA2E21',
    'test': '#2A55B8'
  };

  return textColorMap[statusLower] || '#16322F';
}
