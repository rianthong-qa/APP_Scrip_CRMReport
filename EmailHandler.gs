/**
 * EmailHandler.gs - ส่งการแจ้งเตือนทางอีเมล
 * 
 * ฟังก์ชันสำหรับ:
 * - หา email address จาก assignto ID
 * - ตรวจสอบเงื่อนไขการส่ง email
 * - ส่ง email แจ้งเตือน
 */

/**
 * หา email address จาก assignto ID โดยค้นหาใน EMAIL sheet
 * @param {string} assignto - Assignto ID
 * @return {string|null} Email address หรือ null ถ้าไม่เจอ
 */
let EMAIL_CONTACT_MAP_CACHE = null;
let EMAIL_LOG_SENT_KEY_CACHE = null;

function getEmailForAssignto(assignto) {
  try {
    if (!assignto) {
      log('No assignto provided for email lookup', LOG_LEVEL.WARNING);
      return null;
    }

    const cachedContact = getEmailContactMap()[String(assignto).trim()];
    if (cachedContact && cachedContact.email) {
      log('Found email for assignto ' + assignto + ': ' + cachedContact.email, LOG_LEVEL.DEBUG);
      return cachedContact.email;
    }

    log('No email found for assignto: ' + assignto, LOG_LEVEL.WARNING);
    return null;
    
    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const sheet = ss.getSheetByName(EMAIL_SHEET_NAME);
    
    if (!sheet) {
      log('EMAIL sheet not found', LOG_LEVEL.WARNING);
      return null;
    }
    
    const rows = sheet.getDataRange().getValues();
    const header = rows[0].map((value) => String(value || '').trim().toLowerCase());
    
    const assigntoCol = header.indexOf('assignto');
    const emailCol = header.indexOf('email');
    
    if (assigntoCol === -1 || emailCol === -1) {
      log('EMAIL sheet missing assignto or email column', LOG_LEVEL.WARNING);
      return null;
    }
    
    // หา email ที่ตรงกับ assignto
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][assigntoCol]).trim() === String(assignto).trim()) {
        const email = String(rows[i][emailCol]).trim();
        log('Found email for assignto ' + assignto + ': ' + email, LOG_LEVEL.DEBUG);
        return email;
      }
    }
    
    log('No email found for assignto: ' + assignto, LOG_LEVEL.WARNING);
    return null;
  } catch (e) {
    log('Error getting email for assignto: ' + e.message, LOG_LEVEL.ERROR);
    return null;
  }
}

/**
 * ส่ง email แจ้งเตือน
 * @param {Sheet} sheet - Sheet object (เพื่ออ่านข้อมูล)
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} rowData - ข้อมูลแถว
 * @param {Object} headerMap - Header map
 * @return {boolean} true ถ้าส่งสำเร็จ
 */
function sendNotificationEmail(sheet, rowIndex, rowData, headerMap) {
  const emailKey = buildEmailNotificationKey(rowData);
  let email = '';
  let subject = '';

  try {
    if (!EMAIL_ENABLED) {
      log('Email sending is disabled. Skipped jobNo: ' + rowData.jobNo, LOG_LEVEL.WARNING);
      return false;
    }

    // ตรวจสอบเงื่อนไขการส่ง
    if (!shouldProcessForEmail(rowData.status, '')) {
      log('Status does not require email notification: ' + rowData.status, LOG_LEVEL.DEBUG);
      return false;
    }

    // ข้ามการส่ง ถ้าเรื่องที่แจ้งขึ้นต้นด้วย prefix ที่กำหนดไว้ (เช่น PMX2) หรือโปรแกรมเป็น ProMaxx2
    if (isEmailSkippedForRow(rowData)) {
      log('Subject/product matches skip rule, skip email notification: ' + rowData.jobNo + ' - ' + rowData.subject + ' - ' + rowData.productName, LOG_LEVEL.INFO);
      return false;
    }

    if (hasEmailKeyBeenSent(sheet, rowIndex, headerMap, rowData)) {
      log('Email already sent for notification key: ' + emailKey, LOG_LEVEL.INFO);
      return false;
    }
    
    // หา email address
    email = getEmailForAssignto(rowData.assignto);
    if (!email) {
      log('No email found for assignto: ' + rowData.assignto, LOG_LEVEL.WARNING);
      appendEmailLogEntry({
        emailType: 'notification',
        rowData: rowData,
        email: '',
        emailKey: emailKey,
        result: EMAIL_STATUS.FAILED,
        message: 'No email found for assignto: ' + rowData.assignto,
        subject: ''
      });
      return false;
    }
    
    // สร้างหัวเรื่องอีเมล
    subject = EMAIL_SUBJECT_TEMPLATE
      .replace('{jobNo}', rowData.jobNo)
      .replace('{status}', rowData.status);
    
    // สร้างเนื้อหาอีเมล
    const htmlBody = buildEmailBody(sheet, rowIndex, rowData, headerMap);
    
    // ส่ง email
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });
    
    // ทำเครื่องหมายว่าเคยส่งแล้ว
    markEmailAsSent(sheet, rowIndex, headerMap);
    markEmailKeyAsSent(sheet, rowIndex, headerMap, rowData);
    appendEmailLogEntry({
      emailType: 'notification',
      rowData: rowData,
      email: email,
      emailKey: emailKey,
      result: EMAIL_STATUS.SENT,
      message: 'Email sent',
      subject: subject
    });
    
    log('Email sent to: ' + email + ' for jobNo: ' + rowData.jobNo, LOG_LEVEL.INFO);
    return true;
  } catch (e) {
    log('Error sending email: ' + e.message, LOG_LEVEL.ERROR);
    appendEmailLogEntry({
      emailType: 'notification',
      rowData: rowData,
      email: email,
      emailKey: emailKey,
      result: EMAIL_STATUS.FAILED,
      message: e.message,
      subject: subject
    });
    return false;
  }
}

/**
 * ส่ง email แจ้งเตือนสำหรับหลายแถว
 * @param {Sheet} sheet - Sheet object
 * @param {Array} rowsToNotify - Array ของ rows ที่ต้องส่ง
 * @param {Object} headerMap - Header map
 */
function sendNotificationEmails(sheet, rowsToNotify, headerMap) {
  try {
    let sentCount = 0;
    let failedCount = 0;
    
    rowsToNotify.forEach((item) => {
      const success = sendNotificationEmail(sheet, item.rowIndex, item.rowData, headerMap);
      if (success) {
        sentCount++;
      } else {
        failedCount++;
      }
    });
    
    log('Email notification summary - Sent: ' + sentCount + ', Failed: ' + failedCount, LOG_LEVEL.INFO);
    return {
      sent: sentCount,
      failed: failedCount
    };
  } catch (e) {
    log('Error sending notification emails: ' + e.message, LOG_LEVEL.ERROR);
    return {
      sent: 0,
      failed: rowsToNotify ? rowsToNotify.length : 0
    };
  }
}

/**
 * ส่งอีเมลแจ้งเตือนเฉพาะ Job No โดยอ่านข้อมูลล่าสุดจากชีทปี
 * ใช้สำหรับส่งชดเชยเป็นรายเคสโดยไม่ต้องรัน main() ทั้งชุด
 * @param {string} jobNo - เลขที่งาน
 * @return {boolean} true ถ้าส่งสำเร็จ
 */
function sendNotificationEmailForJobNo(jobNo) {
  const normalizedJobNo = String(jobNo || '').trim();

  if (!normalizedJobNo) {
    throw new Error('Job No is required');
  }

  const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
  const yearSheets = ss.getSheets().filter((sheet) => isYearSheetName(sheet.getName()));

  for (let i = 0; i < yearSheets.length; i++) {
    const sheet = yearSheets[i];
    const headerMap = buildHeaderMap(sheet);
    const rowIndex = findRowByJobNo(sheet, normalizedJobNo, headerMap);

    if (!rowIndex) {
      continue;
    }

    const maxCol = Math.max(sheet.getLastColumn(), getMaxHeaderColumn(headerMap));
    const row = sheet.getRange(rowIndex, 1, 1, maxCol).getValues()[0];
    const rowData = buildRowDataFromSheetRow(row, headerMap);

    log('Manual notification requested for jobNo: ' + normalizedJobNo, LOG_LEVEL.INFO);
    return sendNotificationEmail(sheet, rowIndex, rowData, headerMap);
  }

  throw new Error('Job No not found: ' + normalizedJobNo);
}

/**
 * ดึง map ข้อมูลผู้ใช้จากชีท EMAIL โดยใช้ assignto เป็น key
 * @return {Object} map รูปแบบ { assignto: {email, name} }
 */
function getEmailContactMap() {
  try {
    if (EMAIL_CONTACT_MAP_CACHE) {
      return EMAIL_CONTACT_MAP_CACHE;
    }

    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const sheet = ss.getSheetByName(EMAIL_SHEET_NAME);

    if (!sheet) {
      log('EMAIL sheet not found', LOG_LEVEL.WARNING);
      return {};
    }

    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      return {};
    }

    const header = rows[0].map((value) => String(value || '').trim().toLowerCase());
    const assigntoCol = header.indexOf('assignto');
    const emailCol = header.indexOf('email');
    const nameCol = header.indexOf('name');

    if (assigntoCol === -1) {
      log('EMAIL sheet missing assignto column', LOG_LEVEL.WARNING);
      return {};
    }

    const contactMap = {};
    for (let i = 1; i < rows.length; i++) {
      const assignto = String(rows[i][assigntoCol] || '').trim();

      if (!assignto || contactMap[assignto]) {
        continue;
      }

      contactMap[assignto] = {
        email: emailCol !== -1 ? String(rows[i][emailCol] || '').trim() : '',
        name: nameCol !== -1 ? String(rows[i][nameCol] || '').trim() : ''
      };
    }

    EMAIL_CONTACT_MAP_CACHE = contactMap;
    return EMAIL_CONTACT_MAP_CACHE;
  } catch (e) {
    log('Error getting email contact map: ' + e.message, LOG_LEVEL.ERROR);
    return {};
  }
}

/**
 * ดึงรายชื่อผู้รับ summary จากชีท EMAIL
 * @return {Array<Object>} รายการ {assignto, email}
 */
function getEmailRecipients() {
  try {
    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const sheet = ss.getSheetByName(EMAIL_SHEET_NAME);

    if (!sheet) {
      log('EMAIL sheet not found', LOG_LEVEL.WARNING);
      return [];
    }

    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      return [];
    }

    const header = rows[0].map((value) => String(value || '').trim().toLowerCase());
    const assigntoCol = header.indexOf('assignto');
    const emailCol = header.indexOf('email');

    if (assigntoCol === -1 || emailCol === -1) {
      log('EMAIL sheet missing assignto or email column', LOG_LEVEL.WARNING);
      return [];
    }

    const recipients = [];
    const seen = {};
    for (let i = 1; i < rows.length; i++) {
      const assignto = String(rows[i][assigntoCol] || '').trim();
      const email = String(rows[i][emailCol] || '').trim();
      const key = assignto + '|' + email.toLowerCase();

      if (!assignto || !email || seen[key]) {
        continue;
      }

      seen[key] = true;
      recipients.push({
        assignto: assignto,
        email: email
      });
    }

    return recipients;
  } catch (e) {
    log('Error getting email recipients: ' + e.message, LOG_LEVEL.ERROR);
    return [];
  }
}

/**
 * ส่งอีเมลรายงานสรุปแยกจากเมลแจ้งเตือนราย Job
 * ใช้รันด้วยมือหรือผูก Trigger รายวัน/รายสัปดาห์
 * @return {Object} summary ผลการส่ง
 */
function sendDailySummaryEmails() {
  try {
    return sendDailySummaryEmailsForRecipients(getEmailRecipients(), 'all');
  } catch (e) {
    log('Error sending daily summary emails: ' + e.message, LOG_LEVEL.ERROR);
    return {
      sent: 0,
      skipped: 0,
      failed: 0
    };
  }
}

/**
 * ส่งอีเมลรายงานสรุปเฉพาะกลุ่ม QA
 * @return {Object} summary ผลการส่ง
 */
function sendDailySummaryEmailsToQA() {
  try {
    return sendDailySummaryEmailsToDepartment('QA');
  } catch (e) {
    log('Error sending QA daily summary emails: ' + e.message, LOG_LEVEL.ERROR);
    return {
      sent: 0,
      skipped: 0,
      failed: 0
    };
  }
}

/**
 * ส่งอีเมลรายงานสรุปเฉพาะกลุ่ม DEV
 * @return {Object} summary ผลการส่ง
 */
function sendDailySummaryEmailsToDEV() {
  try {
    return sendDailySummaryEmailsToDepartment('DEV');
  } catch (e) {
    log('Error sending DEV daily summary emails: ' + e.message, LOG_LEVEL.ERROR);
    return {
      sent: 0,
      skipped: 0,
      failed: 0
    };
  }
}

/**
 * ส่งอีเมลรายงานสรุปเฉพาะกลุ่ม Account
 * @return {Object} summary ผลการส่ง
 */
function sendDailySummaryEmailsToAccount() {
  try {
    return sendDailySummaryEmailsToDepartment('ACCOUNT');
  } catch (e) {
    log('Error sending Account daily summary emails: ' + e.message, LOG_LEVEL.ERROR);
    return {
      sent: 0,
      skipped: 0,
      failed: 0
    };
  }
}

/**
 * ส่งอีเมลรายงานสรุปเฉพาะกลุ่ม Support
 * @return {Object} summary ผลการส่ง
 */
function sendDailySummaryEmailsToSupport() {
  try {
    return sendDailySummaryEmailsToDepartment('SUPPORT');
  } catch (e) {
    log('Error sending Support daily summary emails: ' + e.message, LOG_LEVEL.ERROR);
    return {
      sent: 0,
      skipped: 0,
      failed: 0
    };
  }
}

/**
 * ส่งอีเมลรายงานสรุปเฉพาะแผนก
 * @param {string} department - ชื่อแผนกใน EMPLOYEE_DEPARTMENTS
 * @return {Object} summary ผลการส่ง
 */
function sendDailySummaryEmailsToDepartment(department) {
  const normalizedDepartment = String(department || '').trim().toUpperCase();
  const assignees = EMPLOYEE_DEPARTMENTS[normalizedDepartment] || [];
  const recipients = getEmailRecipients().filter((recipient) => {
    return assignees.indexOf(String(recipient.assignto || '').trim()) !== -1;
  });

  return sendDailySummaryEmailsForRecipients(recipients, normalizedDepartment.toLowerCase());
}

/**
 * ส่งอีเมลรายงานสรุปตามรายชื่อผู้รับที่กำหนด
 * @param {Array<Object>} recipients - รายการ {assignto, email}
 * @param {string} recipientGroup - กลุ่มผู้รับ เช่น all, qa
 * @return {Object} summary ผลการส่ง
 */
function sendDailySummaryEmailsForRecipients(recipients, recipientGroup) {
  try {
    if (!EMAIL_ENABLED) {
      log('Email sending is disabled. Skipped daily summary group: ' + recipientGroup, LOG_LEVEL.WARNING);
      return { sent: 0, skipped: (recipients || []).length, failed: 0 };
    }

    if (isSummaryWeekend(new Date())) {
      log('Daily summary skipped on weekend for group: ' + recipientGroup, LOG_LEVEL.INFO);
      return { sent: 0, skipped: (recipients || []).length, failed: 0 };
    }

    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const year = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'yyyy');
    const sheet = getSheetByYear(ss, year);
    const headerMap = buildHeaderMap(sheet);
    const reportDate = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'dd/MM/yyyy');
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    log('Daily summary recipients found for group ' + recipientGroup + ': ' + recipients.length, LOG_LEVEL.INFO);

    recipients.forEach((recipient) => {
      try {
        const relatedRows = getRelatedJobRowsForRecipient(sheet, headerMap, recipient.assignto);
        const trackedRows = relatedRows.filter((row) => normalizeSummaryStatus(row.status));

        if (trackedRows.length === 0) {
          skippedCount++;
          log('Daily summary skipped: no tracked rows for assignto ' + recipient.assignto, LOG_LEVEL.INFO);
          return;
        }

        // DEV: ส่งเฉพาะเมื่อมีงานที่ Assingto ตรงกับผู้รับอีเมล
        if (isDevAssignee(recipient.assignto)) {
          const recipientId = normalizeId(recipient.assignto);
          const hasAssignedRows = trackedRows.some((row) => normalizeId(row.assignto) === recipientId);
          if (!hasAssignedRows) {
            skippedCount++;
            log('Daily summary skipped: no Assingto-matched rows for DEV assignto ' + recipient.assignto, LOG_LEVEL.INFO);
            return;
          }
        }

        const htmlBody = buildDailySummaryEmailBody(recipient.assignto, trackedRows);
        const subject = 'CRM Report Summary ' + reportDate + ' - ' + recipient.assignto;
        MailApp.sendEmail({
          to: recipient.email,
          subject: subject,
          htmlBody: htmlBody,
          name: SENDER_NAME
        });
        appendEmailLogEntry({
          emailType: buildSummaryEmailType(recipientGroup),
          rowData: {
            assignto: recipient.assignto,
            status: 'summary'
          },
          email: recipient.email,
          emailKey: buildSummaryEmailKey(recipient.assignto, reportDate),
          result: EMAIL_STATUS.SENT,
          message: 'Summary sent. Tracked rows: ' + trackedRows.length,
          subject: subject
        });

        sentCount++;
        log('Daily summary email sent to: ' + recipient.email + ' for assignto: ' + recipient.assignto + ', tracked rows: ' + trackedRows.length + ', related rows: ' + relatedRows.length, LOG_LEVEL.INFO);
      } catch (sendError) {
        failedCount++;
        appendEmailLogEntry({
          emailType: buildSummaryEmailType(recipientGroup),
          rowData: {
            assignto: recipient.assignto,
            status: 'summary'
          },
          email: recipient.email,
          emailKey: buildSummaryEmailKey(recipient.assignto, reportDate),
          result: EMAIL_STATUS.FAILED,
          message: sendError.message,
          subject: 'CRM Report Summary ' + reportDate + ' - ' + recipient.assignto
        });
        log('Error sending daily summary to ' + recipient.email + ': ' + sendError.message, LOG_LEVEL.ERROR);
      }
    });

    log('Daily summary email result - Sent: ' + sentCount + ', Skipped: ' + skippedCount + ', Failed: ' + failedCount, LOG_LEVEL.INFO);
    return {
      sent: sentCount,
      skipped: skippedCount,
      failed: failedCount
    };
  } catch (e) {
    log('Error sending daily summary emails for group ' + recipientGroup + ': ' + e.message, LOG_LEVEL.ERROR);
    return {
      sent: 0,
      skipped: 0,
      failed: 0
    };
  }
}

/**
 * ตรวจสอบว่าวันที่เป็นวันเสาร์หรืออาทิตย์ (ตามเวลา EMAIL_TIMEZONE)
 * @param {Date} date - วันที่
 * @return {boolean} true ถ้าเป็นวันเสาร์/อาทิตย์
 */
function isSummaryWeekend(date) {
  const dayOfWeek = Utilities.formatDate(date, EMAIL_TIMEZONE, 'u'); // 1=Monday ... 7=Sunday
  return dayOfWeek === '6' || dayOfWeek === '7';
}

/**
 * ตรวจสอบว่าทำไมผู้รับได้/ไม่ได้รับ Report Summary โดยไม่ส่งอีเมล
 * ใช้รันด้วยมือจาก Apps Script UI แล้วดูผลใน Execution log
 * @param {string} assignto - รหัสผู้รับ เช่น 6305
 */
function debugDailySummaryForAssignto(assignto) {
  const recipientId = normalizeId(assignto || '6305');
  const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
  const year = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'yyyy');
  const sheet = getSheetByYear(ss, year);
  const headerMap = buildHeaderMap(sheet);
  const relatedRows = getRelatedJobRowsForRecipient(sheet, headerMap, recipientId);
  const trackedRows = relatedRows.filter((row) => normalizeSummaryStatus(row.status));
  const assignedRows = trackedRows.filter((row) => normalizeId(row.assignto) === recipientId);

  Logger.log('assignto: ' + recipientId + ', department: ' + (getEmployeeDepartment(recipientId) || '-'));
  Logger.log('email: ' + (getEmailForAssignto(recipientId) || 'ไม่พบในชีท EMAIL'));
  Logger.log('weekend: ' + isSummaryWeekend(new Date()) + ', sheet: ' + sheet.getName());
  Logger.log('related rows: ' + relatedRows.length + ', tracked rows: ' + trackedRows.length + ', Assingto-matched rows: ' + assignedRows.length);
  relatedRows.forEach((row) => {
    Logger.log([row.jobNo, 'status=' + row.status, 'assignto=' + row.assignto, 'originalAssignto=' + row.originalAssignto, 'sysDevelop=' + row.sysDevelop].join(' | '));
  });
}

/**
 * ทดสอบส่งอีเมลรายงานสรุปหา assignto 6101 หนึ่งฉบับ
 * ใช้รันด้วยมือจาก Apps Script UI โดยไม่แก้ค่า mailSent ในชีทงาน
 * @return {boolean} true ถ้าส่งสำเร็จ
 */
function testSendDailySummaryTo6101() {
  try {
    if (!EMAIL_ENABLED) {
      log('Email sending is disabled. Skipped test summary.', LOG_LEVEL.WARNING);
      return false;
    }

    const assignto = '6101';
    const email = getEmailForAssignto(assignto);

    if (!email) {
      log('Test daily summary failed: no email found for assignto ' + assignto, LOG_LEVEL.ERROR);
      return false;
    }

    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const year = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'yyyy');
    const sheet = getSheetByYear(ss, year);
    const headerMap = buildHeaderMap(sheet);
    let relatedRows = getRelatedJobRowsForRecipient(sheet, headerMap, assignto);
    const trackedRows = relatedRows.filter((row) => normalizeSummaryStatus(row.status));

    if (trackedRows.length === 0) {
      relatedRows = buildTestSummaryRowsFor6101();
      log('No tracked rows found for test summary. Using sample rows for layout test.', LOG_LEVEL.INFO);
    }

    const htmlBody = buildDailySummaryEmailBody(assignto, relatedRows);
    const reportDate = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'dd/MM/yyyy');

    MailApp.sendEmail({
      to: email,
      subject: '[TEST] CRM Report Summary ' + reportDate + ' - ' + assignto,
      htmlBody: htmlBody,
      name: SENDER_NAME
    });
    appendEmailLogEntry({
      emailType: 'test_summary',
      rowData: {
        assignto: assignto,
        status: 'summary'
      },
      email: email,
      emailKey: buildSummaryEmailKey(assignto, reportDate) + '|test',
      result: EMAIL_STATUS.SENT,
      message: 'Test summary sent. Related rows: ' + relatedRows.length,
      subject: '[TEST] CRM Report Summary ' + reportDate + ' - ' + assignto
    });

    log('Test daily summary email sent to: ' + email + ' for assignto: ' + assignto + ', related rows: ' + relatedRows.length, LOG_LEVEL.INFO);
    return true;
  } catch (e) {
    log('Error sending test daily summary to 6101: ' + e.message, LOG_LEVEL.ERROR);
    return false;
  }
}

/**
 * สร้างข้อมูลตัวอย่างสำหรับทดสอบ Report Summary 6101
 * @return {Array<Object>} test rows
 */
function buildTestSummaryRowsFor6101() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000));
  const fiveDaysAgo = new Date(now.getTime() - (5 * 24 * 60 * 60 * 1000));

  return [
    {
      jobNo: 'BHD-TEST-SUMMARY-6101-003',
      subject: 'ทดสอบรายการล่าสุดสำหรับ Report Summary',
      ownerSubjectId: '6101',
      contactDate: formatThaiDate(now),
      assignto: '6101',
      originalAssignto: '6101',
      sysserViceTypeName: 'Bug',
      status: 'Test',
      productName: 'CRM Report',
      sysDevelop: '6101'
    },
    {
      jobNo: 'BFR-TEST-SUMMARY-6101-002',
      subject: 'ทดสอบจำนวนวันที่ส่งเคสมา',
      ownerSubjectId: '6101',
      contactDate: formatThaiDate(oneDayAgo),
      assignto: '6101',
      originalAssignto: '6101',
      sysserViceTypeName: 'ติดต่อสอบถาม Form/Report',
      status: 'Continue',
      productName: 'CRM Report',
      sysDevelop: '6101'
    },
    {
      jobNo: 'BHD-TEST-SUMMARY-6101-001',
      subject: 'ทดสอบการเรียงวันที่จากมากไปน้อย',
      ownerSubjectId: '6101',
      contactDate: formatThaiDate(fiveDaysAgo),
      assignto: '6101',
      originalAssignto: '6101',
      sysserViceTypeName: 'Question',
      status: 'Open',
      productName: 'CRM Report',
      sysDevelop: '6101'
    }
  ];
}

/**
 * ทดสอบส่งอีเมลรายงานสรุปหา assignto 6305 หนึ่งฉบับ
 * ใช้รันด้วยมือจาก Apps Script UI โดยไม่แก้ค่า mailSent ในชีทงาน
 * @return {boolean} true ถ้าส่งสำเร็จ
 */
function testSendDailySummaryTo6305() {
  try {
    if (!EMAIL_ENABLED) {
      log('Email sending is disabled. Skipped test summary.', LOG_LEVEL.WARNING);
      return false;
    }

    const assignto = '6305';
    const email = getEmailForAssignto(assignto);

    if (!email) {
      log('Test daily summary failed: no email found for assignto ' + assignto, LOG_LEVEL.ERROR);
      return false;
    }

    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const year = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'yyyy');
    const sheet = getSheetByYear(ss, year);
    const headerMap = buildHeaderMap(sheet);
    let relatedRows = getRelatedJobRowsForRecipient(sheet, headerMap, assignto);
    const trackedRows = relatedRows.filter((row) => normalizeSummaryStatus(row.status));

    if (trackedRows.length === 0) {
      relatedRows = buildTestSummaryRowsForDEV('6305');
      log('No tracked rows found for test summary. Using sample rows for layout test.', LOG_LEVEL.INFO);
    }

    const htmlBody = buildDailySummaryEmailBody(assignto, relatedRows);
    const reportDate = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'dd/MM/yyyy');

    MailApp.sendEmail({
      to: email,
      subject: '[TEST] CRM Report Summary ' + reportDate + ' - ' + assignto,
      htmlBody: htmlBody,
      name: SENDER_NAME
    });
    appendEmailLogEntry({
      emailType: 'test_summary',
      rowData: {
        assignto: assignto,
        status: 'summary'
      },
      email: email,
      emailKey: buildSummaryEmailKey(assignto, reportDate) + '|test',
      result: EMAIL_STATUS.SENT,
      message: 'Test summary sent. Related rows: ' + relatedRows.length,
      subject: '[TEST] CRM Report Summary ' + reportDate + ' - ' + assignto
    });

    log('Test daily summary email sent to: ' + email + ' for assignto: ' + assignto + ', related rows: ' + relatedRows.length, LOG_LEVEL.INFO);
    return true;
  } catch (e) {
    log('Error sending test daily summary to 6305: ' + e.message, LOG_LEVEL.ERROR);
    return false;
  }
}

/**
 * สร้างข้อมูลตัวอย่างสำหรับทดสอบ Report Summary ของ DEV
 * มีทั้งงานที่ Assingto ตรงกับผู้รับ และงานเกี่ยวข้องอื่น (sysDevelop ตรงกับผู้รับ)
 * @param {string} devId - รหัส DEV (ไม่ระบุจะใช้คนแรกใน DEV_ASSIGNEES)
 * @return {Array<Object>} test rows
 */
function buildTestSummaryRowsForDEV(devId) {
  const assignto = String(devId || DEV_ASSIGNEES[0]).trim();
  const otherAssignto = QA_ASSIGNEES[0];
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));
  const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

  return [
    {
      jobNo: 'BHD-TEST-SUMMARY-DEV-003',
      subject: 'ทดสอบงาน DEV ที่ Assingto ตรงกับผู้รับ (Open)',
      ownerSubjectId: otherAssignto,
      contactDate: formatThaiDate(now),
      assignto: assignto,
      originalAssignto: assignto,
      sysserViceTypeName: 'Bug',
      status: 'Open',
      productName: 'CRM Report',
      sysDevelop: assignto
    },
    {
      jobNo: 'BHD-TEST-SUMMARY-DEV-002',
      subject: 'ทดสอบงาน DEV ที่ Assingto ตรงกับผู้รับ (EditErr)',
      ownerSubjectId: otherAssignto,
      contactDate: formatThaiDate(twoDaysAgo),
      assignto: assignto,
      originalAssignto: assignto,
      sysserViceTypeName: 'Bug',
      status: 'EditErr',
      productName: 'CRM Report',
      sysDevelop: assignto
    },
    {
      jobNo: 'BFR-TEST-SUMMARY-DEV-001',
      subject: 'ทดสอบงานเกี่ยวข้องอื่น (DEV ตรงกับผู้รับ แต่ Assingto เป็น QA)',
      ownerSubjectId: otherAssignto,
      contactDate: formatThaiDate(sevenDaysAgo),
      assignto: otherAssignto,
      originalAssignto: otherAssignto,
      sysserViceTypeName: 'Feature',
      status: 'Test',
      productName: 'CRM Report',
      sysDevelop: assignto
    }
  ];
}

/**
 * ทดสอบส่งอีเมลหา assignto 6101 หนึ่งฉบับ โดยไม่แก้ค่า mailSent ในชีทงาน
 * ใช้รันด้วยมือจาก Apps Script UI
 */
function testSendEmailTo6101() {
  try {
    if (!EMAIL_ENABLED) {
      log('Email sending is disabled. Skipped test notification.', LOG_LEVEL.WARNING);
      return false;
    }

    const assignto = '6101';
    const email = getEmailForAssignto(assignto);

    if (!email) {
      log('Test email failed: no email found for assignto ' + assignto, LOG_LEVEL.ERROR);
      return false;
    }

    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const year = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'yyyy');
    const sheet = getSheetByYear(ss, year);
    const headerMap = buildHeaderMap(sheet);
    const rowData = {
      jobNo: 'BHD-TEST-EMAIL-6101',
      subject: 'ทดสอบส่งอีเมลแจ้งเตือนสถานะพร้อมลิงก์รายละเอียดงาน',
      ownerSubjectId: '6101',
      contactDate: formatThaiDate(new Date()),
      assignto: assignto,
      sysserViceTypeName: 'Bug',
      status: 'Continue',
      productName: 'CRM Report',
      sysDevelop: '6101',
      QA: 'QA',
      flowTracking: buildTestFlowTrackingFor6101()
    };

    const subject = '[TEST] ' + EMAIL_SUBJECT_TEMPLATE
      .replace('{jobNo}', rowData.jobNo)
      .replace('{status}', rowData.status);
    const htmlBody = buildEmailBody(sheet, 0, rowData, headerMap);

    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });
    appendEmailLogEntry({
      emailType: 'test_notification',
      rowData: rowData,
      email: email,
      emailKey: buildEmailNotificationKey(rowData) + '|test',
      result: EMAIL_STATUS.SENT,
      message: 'Test notification sent',
      subject: subject
    });

    log('Test email sent to: ' + email + ' for assignto: ' + assignto, LOG_LEVEL.INFO);
    return true;
  } catch (e) {
    log('Error sending test email to 6101: ' + e.message, LOG_LEVEL.ERROR);
    return false;
  }
}

/**
 * สร้าง flow tracking ตัวอย่างสำหรับทดสอบเมลแจ้งสถานะงาน
 * @return {string} flowTracking text
 */
function buildTestFlowTrackingFor6101() {
  const now = new Date();
  const openTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
  const continueTime = new Date(now.getTime() - (2 * 60 * 60 * 1000));
  const devTime = new Date(now.getTime() - (1 * 60 * 60 * 1000));

  return [
    [formatThaiDate(openTime), 'Open', '6501', ''].join('\t'),
    [formatThaiDate(continueTime), 'Continue', '6101', ''].join('\t'),
    [formatThaiDate(devTime), 'Continue', '6701', '6701'].join('\t'),
    [formatThaiDate(now), 'Test', '6101', '6701'].join('\t')
  ].join('\n');
}

/**
 * ตรวจสอบว่า emailKey เคยส่งสำเร็จใน EMAIL_LOG แล้วหรือไม่
 * @param {string} emailType - ประเภทอีเมล
 * @param {string} emailKey - key กันส่งซ้ำ
 * @return {boolean} true ถ้าเคย sent แล้ว
 */
function getEmailLogSentKeyCache() {
  if (EMAIL_LOG_SENT_KEY_CACHE) {
    return EMAIL_LOG_SENT_KEY_CACHE;
  }

  EMAIL_LOG_SENT_KEY_CACHE = {};

  try {
    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const sheet = getEmailLogSheet(ss);
    const headerMap = buildEmailLogHeaderMap(sheet);

    if (sheet.getLastRow() <= 1) {
      return EMAIL_LOG_SENT_KEY_CACHE;
    }

    const maxCol = getMaxHeaderColumn(headerMap);
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, maxCol).getValues();

    rows.forEach((row) => {
      const rowEmailKey = String(row[headerMap.emailKey - 1] || '').trim();
      const rowEmailType = String(row[headerMap.emailType - 1] || '').trim();
      const rowResult = String(row[headerMap.result - 1] || '').trim().toLowerCase();

      if (rowEmailKey && rowEmailType && rowResult === EMAIL_STATUS.SENT) {
        EMAIL_LOG_SENT_KEY_CACHE[rowEmailType + '|' + rowEmailKey] = true;
      }
    });
  } catch (e) {
    log('Error building EMAIL_LOG cache: ' + e.message, LOG_LEVEL.WARNING);
  }

  return EMAIL_LOG_SENT_KEY_CACHE;
}

function hasEmailLogKeySent(emailType, emailKey) {
  try {
    const normalizedEmailKey = String(emailKey || '').trim();
    const normalizedEmailType = String(emailType || '').trim();

    if (!normalizedEmailKey) {
      return false;
    }

    const sentKeyCache = getEmailLogSentKeyCache();
    return !!sentKeyCache[normalizedEmailType + '|' + normalizedEmailKey];

    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const sheet = getEmailLogSheet(ss);
    const headerMap = buildEmailLogHeaderMap(sheet);

    if (sheet.getLastRow() <= 1) {
      return false;
    }

    const maxCol = getMaxHeaderColumn(headerMap);
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, maxCol).getValues();

    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const rowEmailKey = String(row[headerMap.emailKey - 1] || '').trim();
      const rowEmailType = String(row[headerMap.emailType - 1] || '').trim();
      const rowResult = String(row[headerMap.result - 1] || '').trim().toLowerCase();

      if (rowEmailKey === normalizedEmailKey &&
          rowEmailType === normalizedEmailType &&
          rowResult === EMAIL_STATUS.SENT) {
        return true;
      }
    }

    return false;
  } catch (e) {
    log('Error checking EMAIL_LOG key: ' + e.message, LOG_LEVEL.WARNING);
    return false;
  }
}

/**
 * บันทึกประวัติการส่งอีเมลลงชีท EMAIL_LOG
 * @param {Object} params - ข้อมูล log
 */
function appendEmailLogEntry(params) {
  try {
    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const sheet = getEmailLogSheet(ss);
    const headerMap = buildEmailLogHeaderMap(sheet);
    const row = buildEmailLogRow(params, headerMap);

    appendBatchRows(sheet, sheet.getLastRow(), [row], getMaxHeaderColumn(headerMap));
    if (String((params && params.result) || '').trim().toLowerCase() === EMAIL_STATUS.SENT) {
      const emailType = String((params && params.emailType) || '').trim();
      const emailKey = String((params && params.emailKey) || '').trim();
      if (emailType && emailKey) {
        getEmailLogSentKeyCache()[emailType + '|' + emailKey] = true;
      }
    }
  } catch (e) {
    log('Error appending EMAIL_LOG entry: ' + e.message, LOG_LEVEL.WARNING);
  }
}

/**
 * สร้าง row สำหรับ EMAIL_LOG
 * @param {Object} params - ข้อมูล log
 * @param {Object} headerMap - Header map ของ EMAIL_LOG
 * @return {Array} row values
 */
function buildEmailLogRow(params, headerMap) {
  const rowData = (params && params.rowData) || {};
  const contactMap = getEmailContactMap();
  const assignto = String(rowData.assignto || '').trim();
  const valuesByKey = {
    timestamp: formatThaiDate(new Date()),
    emailType: String((params && params.emailType) || '').trim(),
    jobNo: String(rowData.jobNo || '').trim(),
    status: String(rowData.status || '').trim(),
    assignto: assignto,
    assigntoName: getContactNameFromMap(assignto, contactMap),
    email: String((params && params.email) || '').trim(),
    emailKey: String((params && params.emailKey) || '').trim(),
    result: String((params && params.result) || '').trim(),
    message: String((params && params.message) || '').trim(),
    subject: String((params && params.subject) || '').trim()
  };
  const maxCol = getMaxHeaderColumn(headerMap);
  const row = [];

  for (let i = 0; i < maxCol; i++) {
    row[i] = '';
  }

  Object.keys(valuesByKey).forEach((key) => {
    if (headerMap[key]) {
      row[headerMap[key] - 1] = valuesByKey[key];
    }
  });

  return row;
}

/**
 * สร้าง key ของเมล Summary ตามผู้รับและวันที่รายงาน
 * @param {string} assignto - รหัสผู้รับ
 * @param {string} reportDate - วันที่รายงาน
 * @return {string} Summary email key
 */
function buildSummaryEmailKey(assignto, reportDate) {
  return ['summary', String(reportDate || '').trim(), String(assignto || '').trim()].join('|');
}

/**
 * สร้าง emailType สำหรับ EMAIL_LOG ของ Summary
 * @param {string} recipientGroup - กลุ่มผู้รับ เช่น all, qa, dev
 * @return {string} emailType
 */
function buildSummaryEmailType(recipientGroup) {
  const group = String(recipientGroup || '').trim().toLowerCase();

  if (!group || group === 'all') {
    return 'summary';
  }

  return 'summary_' + group;
}

/**
 * ตรวจสอบว่าเคย send email ให้แถวนี้แล้วหรือไม่ สำหรับ status เดิม
 * @param {Sheet} sheet - Sheet object
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} headerMap - Header map
 * @param {string} currentStatus - Status ปัจจุบัน
 * @return {boolean} true ถ้า status เปลี่ยนและต้องส่ง email ใหม่
 */
function hasStatusChangedForEmail(sheet, rowIndex, headerMap, currentStatus) {
  try {
    if (!headerMap.lastStatus) return false;
    
    const lastStatus = String(getCellValue(sheet, rowIndex, headerMap.lastStatus) || '').trim();
    const current = String(currentStatus || '').trim();
    
    return lastStatus !== current;
  } catch (e) {
    log('Error checking status change for email: ' + e.message, LOG_LEVEL.WARNING);
    return false;
  }
}
