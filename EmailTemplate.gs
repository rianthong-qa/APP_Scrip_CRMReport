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

function buildEmailBody(sheet, rowIndex, rowData, headerMap) {
  try {
    const detailsTable = buildDetailsTable(rowData);
    const flowTrackingSection = buildFlowTrackingSection(sheet, rowIndex, rowData, headerMap);
    const headerStatusColor = getStatusColor(rowData.status);
    const headerStatusTextColor = getStatusTextColor(rowData.status);
    const headerSubject = buildJobLinkHtml(rowData.jobNo, rowData.subject, 'header-subject');
    const headerStatus = escapeHtml(rowData.status || 'STATUS');
    const jobUrl = buildJobDetailUrl(rowData.jobNo);
    const jobAction = jobUrl
      ? '<a class="action-button" href="' + escapeHtml(jobUrl) + '" target="_blank" rel="noopener noreferrer">เปิดรายละเอียดงาน&nbsp; →</a>'
      : '';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'DM Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.5;
            color: #16322F;
            background-color: #EEF6F4;
            margin: 0;
            padding: 20px 12px;
          }
          .container {
            max-width: 680px;
            margin: 0 auto;
            background-color: #F8FCFB;
            border: 1px solid #D9EAE6;
            border-radius: 16px;
            box-shadow: 0 8px 28px rgba(21,84,76,0.08);
            overflow: hidden;
          }
          .header {
            background-color: #0F766E;
            color: #FFFFFF;
            padding: 22px 24px 20px 24px;
            text-align: left;
            border-bottom: 4px solid #F2B84B;
          }
          .eyebrow {
            display: inline-block;
            background-color: rgba(255,255,255,0.14);
            border: 1px solid rgba(255,255,255,0.32);
            border-radius: 999px;
            color: #FFFFFF;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.08em;
            padding: 5px 10px;
            margin-bottom: 12px;
          }
          .header-table {
            width: 100%;
            border-collapse: collapse;
            margin: 0;
            background-color: transparent;
            border: 0;
            table-layout: fixed;
          }
          .header-table td {
            border: 0;
            padding: 0;
            vertical-align: middle;
          }
          .header-main {
            padding-right: 16px !important;
          }
          .header-status {
            width: 118px;
            text-align: right;
          }
          .job-number {
            color: rgba(255,255,255,0.76);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.04em;
            margin-bottom: 5px;
          }
          .status-pill {
            display: inline-block;
            min-width: 74px;
            max-width: 108px;
            border: 1px solid rgba(255,255,255,0.35);
            border-radius: 999px;
            padding: 7px 11px;
            font-size: 12px;
            line-height: 1;
            font-weight: 800;
            text-align: center;
          }
          .header-subject {
            display: block;
            color: #FFFFFF !important;
            font-size: 18px;
            font-weight: 800;
            line-height: 1.35;
            text-decoration: none;
          }
          a.header-subject,
          a.header-subject:link,
          a.header-subject:visited,
          a.header-subject:hover,
          a.header-subject:active {
            color: #FFFFFF !important;
            text-decoration: none !important;
          }
          .content {
            padding: 22px 24px 24px 24px;
          }
          .action-row {
            text-align: right;
            margin: 0 0 14px 0;
          }
          .action-button {
            display: inline-block;
            background-color: #0F766E;
            color: #FFFFFF !important;
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 11px;
            font-weight: 800;
            text-decoration: none;
          }
          .section {
            margin-bottom: 18px;
          }
          .section-card {
            background-color: #FFFFFF;
            border: 1px solid #D9EAE6;
            border-radius: 12px;
            padding: 16px;
          }
          .section h2 {
            font-size: 15px;
            border-bottom: 1px solid #E1ECE9;
            padding-bottom: 9px;
            margin: 0 0 12px 0;
            color: #0F766E;
          }
          table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            margin-top: 8px;
            background-color: #FFFFFF;
            border: 1px solid #D9EAE6;
            border-radius: 10px;
            overflow: hidden;
          }
          table th {
            background-color: #EFF7F5;
            padding: 9px 10px;
            text-align: left;
            font-weight: 800;
            color: #47716B;
            border-bottom: 1px solid #D9EAE6;
            font-size: 11px;
          }
          table td {
            padding: 9px 10px;
            border-bottom: 1px solid #E8F0EE;
            font-size: 12px;
            color: #16322F;
            vertical-align: top;
          }
          .detail-table {
            margin-top: 0;
            table-layout: fixed;
          }
          .detail-cell {
            width: 50%;
            padding: 11px 12px !important;
          }
          .detail-cell-left {
            border-right: 1px solid #E8F0EE;
          }
          .detail-label {
            display: block;
            color: #6B8C88;
            font-size: 10px;
            font-weight: 700;
            margin-bottom: 3px;
          }
          .detail-value {
            display: block;
            color: #16322F;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.35;
          }
          .inline-status {
            display: inline-block;
            border-radius: 999px;
            padding: 4px 8px;
            font-size: 10px;
            font-weight: 800;
          }
          .flow-latest {
            background-color: #EFF7F5;
            border: 1px solid #CFE3DE;
            border-left: 4px solid #0F766E;
            border-radius: 10px;
            padding: 12px 13px;
            margin-bottom: 10px;
          }
          .flow-latest-label {
            color: #6B8C88;
            font-size: 10px;
            font-weight: 800;
            margin-bottom: 5px;
          }
          .flow-latest-status {
            display: inline-block;
            border-radius: 999px;
            padding: 4px 8px;
            font-size: 11px;
            font-weight: 800;
            margin-bottom: 6px;
          }
          .flow-latest-people {
            color: #27433F;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.45;
          }
          .flow-latest-time {
            color: #6B8C88;
            font-size: 10px;
            margin-top: 4px;
          }
          .flow-table {
            table-layout: fixed;
          }
          .flow-no {
            width: 38px;
            text-align: center;
          }
          .flow-time {
            width: 130px;
            white-space: nowrap;
          }
          .flow-status {
            width: 72px;
          }
          .footer {
            background-color: #E5F2EF;
            padding: 12px 16px;
            font-size: 11px;
            color: #6B8C88;
            text-align: center;
            border-top: 1px solid #D9EAE6;
          }
          .footer p {
            margin: 2px 0;
          }
          .updated-time {
            color: #6B8C88;
            margin-top: 4px;
            font-size: 11px;
            text-align: right;
          }
          @media (max-width: 600px) {
            body {
              padding: 10px 8px;
            }
            .container {
              border-radius: 12px;
            }
            .header {
              padding: 18px 16px 16px 16px;
            }
            .header-main {
              padding-right: 8px !important;
            }
            .header-status {
              width: 92px;
            }
            .status-pill {
              min-width: 58px;
              font-size: 11px;
              padding: 6px 8px;
            }
            .header-subject {
              font-size: 16px;
            }
            .content {
              padding: 16px 14px 18px 14px;
            }
            table {
              font-size: 12px;
            }
            table th, table td {
              padding: 7px;
            }
            .detail-table,
            .detail-table tbody,
            .detail-table tr,
            .detail-table td {
              display: block;
              width: auto;
            }
            .detail-cell-left {
              border-right: 0;
            }
            .flow-table .flow-no,
            .flow-table .flow-time {
              display: none;
            }
            .flow-table {
              table-layout: auto;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="eyebrow">CRM JOB UPDATE</span>
            <table class="header-table" role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td class="header-main">
                  <div class="job-number">JOB ${escapeHtml(rowData.jobNo || '-')}</div>
                  ${headerSubject}
                </td>
                <td class="header-status">
                  <span class="status-pill" style="background-color:${headerStatusColor}; color:${headerStatusTextColor};">${headerStatus}</span>
                </td>
              </tr>
            </table>
          </div>
          
          <div class="content">
            ${jobAction ? '<div class="action-row">' + jobAction + '</div>' : ''}
            <!-- Job Details -->
            <div class="section section-card">
              <h2>รายละเอียดงาน</h2>
              ${detailsTable}
            </div>

            ${flowTrackingSection}
            
            <!-- Updated Time -->
            <div class="updated-time">
              อัปเดตล่าสุด: ${escapeHtml(formatThaiDate(new Date()))}
            </div>
          </div>
          
          <div class="footer">
            <p>ข้อความนี้ถูกส่งโดยระบบ CRM Report เพื่อแจ้งสถานะงานอัตโนมัติ</p>
            <p>โปรดไม่ตอบกลับอีเมลนี้</p>
          </div>
        </div>
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
    const statusSummary = buildSummaryCardsFromRows(relatedRows);
    const jobList = buildSummaryJobList(relatedRows, recipientId);
    const trackedCount = relatedRows.filter((row) => normalizeSummaryStatus(row.status)).length;
    const summaryMetrics = buildSummaryMetrics(relatedRows);
    const today = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'dd/MM/yyyy');
    const contactMap = getEmailContactMap();
    const prioritySummary = buildPrioritySummary(relatedRows);
    const recipientDisplayName = formatPersonWithName(recipientId, contactMap);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'DM Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.5;
            color: #16322F;
            background-color: #EEF6F4;
            margin: 0;
            padding: 20px 12px;
          }
          .container {
            max-width: 900px;
            margin: 0 auto;
            background-color: #F8FCFB;
            border: 1px solid #D9EAE6;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 8px 28px rgba(21, 84, 76, 0.08);
          }
          .header {
            background-color: #0F766E;
            padding: 22px 24px 20px 24px;
            border-bottom: 4px solid #F2B84B;
          }
          .eyebrow {
            display: inline-block;
            background: rgba(255,255,255,0.14);
            border: 1px solid rgba(255,255,255,0.35);
            border-radius: 999px;
            color: #FFFFFF;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.08em;
            padding: 6px 11px;
          }
          .title {
            margin: 12px 0 0 0;
            color: #FFFFFF;
            font-size: 21px;
            line-height: 1.25;
            font-weight: 800;
          }
          .subtitle {
            margin: 7px 0 0 0;
            color: rgba(255,255,255,0.82);
            font-size: 12px;
          }
          .content {
            padding: 22px 24px 24px 24px;
          }
          .section {
            margin-bottom: 24px;
          }
          .section h2 {
            font-size: 15px;
            border-bottom: 1px solid #D9EAE6;
            padding-bottom: 9px;
            margin: 0 0 12px 0;
            color: #0F766E;
          }
          .section-heading {
            display: table;
            width: 100%;
          }
          .section-heading h2,
          .section-heading .section-total {
            display: table-cell;
            vertical-align: middle;
          }
          .section-heading h2 {
            border-bottom: 0;
            padding-bottom: 0;
          }
          .section-total {
            text-align: right;
            color: #0F766E;
            font-size: 11px;
            font-weight: 800;
          }
          .kpi-grid {
            display: table;
            width: 100%;
            border-spacing: 8px 0;
            margin: 0 -8px 20px -8px;
            width: calc(100% + 16px);
          }
          .kpi-card {
            display: table-cell;
            width: 33.33%;
            background: #FFFFFF;
            border: 1px solid #D9EAE6;
            border-radius: 10px;
            padding: 11px 12px;
            vertical-align: middle;
          }
          .kpi-label {
            display: block;
            color: #6B8C88;
            font-size: 10px;
            font-weight: 700;
            margin-bottom: 4px;
          }
          .kpi-value {
            display: block;
            color: #0F766E;
            font-size: 20px;
            font-weight: 800;
            line-height: 1;
          }
          .priority-panel {
            background: #FFF9EC;
            border: 1px solid #F2D28B;
            border-left: 4px solid #F2B84B;
            border-radius: 10px;
            padding: 12px 14px;
            margin: 0 0 22px 0;
          }
          .priority-title {
            color: #8A5A00;
            font-size: 13px;
            font-weight: 800;
            margin: 0 0 8px 0;
          }
          .priority-list {
            margin: 0;
            padding-left: 18px;
          }
          .priority-list li {
            color: #5F4A1D;
            font-size: 12px;
            padding: 3px 0;
          }
          .priority-job {
            font-weight: 800;
          }
          .priority-subject {
            color: #6B5B38;
          }
          .age-badge {
            display: inline-block;
            border-radius: 999px;
            padding: 3px 7px;
            font-size: 10px;
            font-weight: 800;
            white-space: nowrap;
          }
          .age-fresh {
            background: #E7F6ED;
            color: #1B7A45;
          }
          .age-warning {
            background: #FFF3D6;
            color: #8A5A00;
          }
          .age-critical {
            background: #FDE3DE;
            color: #AA2E21;
          }
          .status-grid {
            display: table;
            width: 100%;
            border-spacing: 8px 0;
            margin: 0 -8px;
            width: calc(100% + 16px);
          }
          .status-item {
            display: table-cell;
            width: 25%;
            vertical-align: top;
            padding: 14px 10px 12px 10px;
            border-radius: 10px;
            border: 1px solid rgba(13,30,28,0.10);
            text-align: center;
          }
          .status-item strong {
            display: block;
            font-size: 27px;
            line-height: 1;
            font-weight: 800;
            margin-bottom: 7px;
          }
          .status-item span {
            display: block;
            font-size: 11px;
            font-weight: 700;
          }
          table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            margin-top: 7px;
            background-color: #FFFFFF;
            border: 1px solid #D9EAE6;
            border-radius: 10px;
            overflow: hidden;
          }
          th {
            background-color: #EFF7F5;
            padding: 9px 8px;
            text-align: left;
            font-size: 11px;
            color: #47716B;
            font-weight: 800;
          }
          td {
            padding: 9px 8px;
            border-top: 1px solid #E8F0EE;
            font-size: 12px;
            vertical-align: top;
          }
          tr:nth-child(even) td {
            background-color: #FBFDFC;
          }
          .summary-table {
            table-layout: fixed;
          }
          .summary-no {
            width: 42px;
            text-align: center;
          }
          .summary-job {
            width: 110px;
            white-space: nowrap;
          }
          .summary-assingto {
            width: 130px;
            white-space: nowrap;
          }
          .summary-date {
            width: 138px;
            white-space: nowrap;
          }
          .summary-age {
            width: 64px;
            text-align: center;
            white-space: nowrap;
          }
          .summary-subject {
            width: auto;
          }
          a {
            color: #0F766E;
            text-decoration: none;
          }
          .group-title {
            display: table;
            width: 100%;
            box-sizing: border-box;
            padding: 11px 13px;
            border-radius: 10px;
            font-size: 14px;
            line-height: 1.25;
            margin: 20px 0 10px 0;
          }
          .group-title-label,
          .group-count {
            display: table-cell;
            vertical-align: middle;
          }
          .group-title-label {
            font-weight: 800;
          }
          .group-count {
            text-align: right;
            font-size: 11px;
            font-weight: 800;
            white-space: nowrap;
          }
          .group-title-primary {
            background-color: #0F766E;
            color: #FFFFFF;
            border: 1px solid #0F766E;
          }
          .group-title-primary .group-count {
            color: #FFFFFF;
            background-color: rgba(255,255,255,0.16);
            border-radius: 999px;
            padding: 4px 8px;
          }
          .group-title-secondary {
            background-color: #EFF7F5;
            color: #35665F;
            border: 1px solid #CFE3DE;
          }
          .group-title-secondary .group-count {
            color: #0F766E;
            background-color: #FFFFFF;
            border: 1px solid #CFE3DE;
            border-radius: 999px;
            padding: 4px 8px;
          }
          .status-title {
            font-size: 12px;
            color: #16322F;
            margin: 14px 0 6px 0;
          }
          .status-text {
            font-weight: 800;
          }
          .muted {
            color: #6B8C88;
            font-size: 11px;
          }
          .footer {
            background-color: #E5F2EF;
            padding: 12px 16px;
            font-size: 11px;
            color: #6B8C88;
            text-align: center;
          }
          @media (max-width: 600px) {
            body {
              padding: 10px 8px;
            }
            .content {
              padding: 16px 14px 18px 14px;
            }
            .kpi-grid {
              display: block;
              width: 100%;
              margin: 0 0 18px 0;
            }
            .kpi-card {
              display: block;
              width: auto;
              margin: 0 0 8px 0;
            }
            .header {
              padding: 18px 16px 16px 16px;
            }
            .title {
              font-size: 18px;
            }
            .status-grid {
              display: block;
              width: 100%;
              margin: 0;
            }
            .status-item {
              display: block;
              width: auto;
              margin: 0 0 8px 0;
            }
            th, td {
              padding: 7px;
              font-size: 11px;
            }
            .summary-table {
              display: table;
              table-layout: auto;
            }
            .summary-table .summary-assingto,
            .summary-table .summary-date {
              display: none;
            }
            .summary-table .summary-no {
              width: 32px;
            }
            .summary-table .summary-job {
              width: 108px;
              white-space: normal;
              word-break: break-word;
            }
            .summary-table .summary-subject {
              width: auto;
              word-break: break-word;
            }
            .summary-table .summary-age {
              width: 62px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="eyebrow">CRM REPORT SUMMARY</span>
            <div class="title">สรุปรายงานงานที่เกี่ยวข้อง</div>
            <div class="subtitle">ผู้รับ: ${escapeHtml(recipientDisplayName)} | วันที่รายงาน: ${escapeHtml(today)}</div>
          </div>
          <div class="content">
            ${buildSummaryKpiCards(summaryMetrics)}
            ${prioritySummary}
            <div class="section">
              <div class="section-heading">
                <h2>สรุปจำนวนเคสตามสถานะ</h2>
                <span class="section-total">รวม ${escapeHtml(String(trackedCount))} รายการ</span>
              </div>
              ${statusSummary}
            </div>
            <div class="section">
              <h2>รายการงานที่ต้องติดตาม</h2>
              ${jobList}
            </div>
          </div>
          <div class="footer">
            ข้อความนี้ถูกส่งโดยระบบ CRM Report เพื่อสรุปสถานะงานอัตโนมัติ
          </div>
        </div>
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
  return `
    <div class="kpi-grid">
      <div class="kpi-card">
        <span class="kpi-label">เคสที่ต้องติดตาม</span>
        <span class="kpi-value">${escapeHtml(String(metrics.total))}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">เคสเก่าสุด (วัน)</span>
        <span class="kpi-value">${escapeHtml(String(metrics.oldest))}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">เคสที่แจ้งวันนี้</span>
        <span class="kpi-value">${escapeHtml(String(metrics.newToday))}</span>
      </div>
    </div>
  `;
}

/**
 * สร้างกลุ่มเคสที่ควรติดตามก่อน โดยเลือกจากอายุเคสมากที่สุด
 * @param {Array<Object>} rows - รายการงานที่เกี่ยวข้อง
 * @param {Object} contactMap - map รายชื่อผู้ติดต่อ
 * @return {string} HTML priority panel
 */
function buildPrioritySummary(rows) {
  const priorityRows = rows
    .filter((row) => normalizeSummaryStatus(row.status))
    .sort(compareRowsByCaseAgeDaysDesc)
    .slice(0, 3);

  if (priorityRows.length === 0) {
    return '';
  }

  let html = `
    <div class="priority-panel">
      <div class="priority-title">เคสที่ควรติดตามก่อน</div>
      <ol class="priority-list">
  `;

  priorityRows.forEach((row) => {
    const age = getCaseAgeDays(row.contactDate);
    html += `
      <li>
        <div class="priority-job">
          ${buildJobLinkHtml(row.jobNo, row.jobNo, '')}
          <span class="age-badge ${getCaseAgeClass(row.contactDate)}">${escapeHtml(age || '-')} วัน</span>
        </div>
        <div class="priority-subject">${escapeHtml(truncateText(row.subject, 110))} · ${escapeHtml(normalizeSummaryStatus(row.status))}</div>
      </li>
    `;
  });

  html += `
      </ol>
    </div>
  `;

  return html;
}

/**
 * สร้าง card สรุปสถานะ 4 สถานะหลักจากรายการงาน
 * @param {Array<Object>} rows - รายการงาน
 * @return {string} HTML card summary
 */
function buildSummaryCardsFromRows(rows) {
  const summary = {};
  const statuses = ['Open', 'Continue', 'EditErr', 'Test'];

  statuses.forEach((status) => {
    summary[status] = 0;
  });

  rows.forEach((row) => {
    const status = normalizeSummaryStatus(row.status);
    if (status) {
      summary[status]++;
    }
  });

  let html = '<div class="status-grid">';
  statuses.forEach((status) => {
    const color = getStatusColor(status);
    const textColor = getStatusTextColor(status);
    html += `
      <div class="status-item" style="background-color:${color}; color:${textColor};">
        <strong style="color:${textColor};">${summary[status]}</strong>
        <span style="color:${textColor};">${escapeHtml(status)}</span>
      </div>
    `;
  });
  html += '</div>';

  return html;
}

/**
 * สร้างตารางรายการงานสำหรับอีเมล summary
 * @param {Array<Object>} rows - รายการงาน
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
    return '<p class="muted">ไม่มีรายการในสถานะ Open, Continue, EditErr หรือ Test</p>';
  }

  let html = '<p class="muted">เรียงจากเคสที่มีอายุสูงสุด เพื่อช่วยจัดลำดับการติดตาม</p>';
  const assingtoMatchedRows = normalizedRecipientId
    ? trackedRows.filter((row) => normalizeId(row.assignto) === normalizedRecipientId)
    : [];
  const otherRelatedRows = normalizedRecipientId
    ? trackedRows.filter((row) => normalizeId(row.assignto) !== normalizedRecipientId)
    : trackedRows;

  if (assingtoMatchedRows.length > 0) {
    html += buildSummaryJobGroup('ผู้รับผิดชอบตรงกับผู้รับอีเมล', assingtoMatchedRows, statuses, contactMap, 'primary');
  }

  if (otherRelatedRows.length > 0) {
    const title = assingtoMatchedRows.length > 0 ? 'งานเกี่ยวข้องอื่น' : 'รายการงาน';
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
  const safeVariant = groupVariant === 'primary' ? 'primary' : 'secondary';
  let html = `
    <h3 class="group-title group-title-${safeVariant}">
      <span class="group-title-label">${escapeHtml(title)}</span>
      <span class="group-count">${rows.length} เคส</span>
    </h3>
  `;

  statuses.forEach((status) => {
    const statusRows = rows.filter((row) => normalizeSummaryStatus(row.status) === status);
    if (statusRows.length === 0) {
      return;
    }

    html += `
      <h3 class="status-title">${escapeHtml(status)} (${statusRows.length})</h3>
      <table class="summary-table">
        <tr>
          <th class="summary-no">ลำดับ</th>
          <th class="summary-job">Job No</th>
          <th class="summary-subject">เรื่องที่แจ้ง</th>
          <th class="summary-assingto">ผู้รับผิดชอบ</th>
          <th class="summary-date">วันที่แจ้ง</th>
          <th class="summary-age">จำนวนวัน</th>
        </tr>
    `;

    statusRows.forEach((row, index) => {
      html += `
        <tr>
          <td class="summary-no">${index + 1}</td>
          <td class="summary-job">${buildJobLinkHtml(row.jobNo, row.jobNo, '')}</td>
          <td class="summary-subject">${buildJobLinkHtml(row.jobNo, truncateText(row.subject, 90), '')}</td>
          <td class="summary-assingto">${escapeHtml(formatPersonWithName(row.assignto, contactMap) || '-')}</td>
          <td class="summary-date">${escapeHtml(formatSummaryContactDate(row.contactDate))}</td>
          <td class="summary-age"><span class="age-badge ${getCaseAgeClass(row.contactDate)}">${escapeHtml(getCaseAgeDays(row.contactDate) || '-')} วัน</span></td>
        </tr>
      `;
    });

    html += '</table>';
  });

  return html;
}

/**
 * สร้าง HTML table ของรายละเอียดงาน
 * @param {Object} rowData - ข้อมูลแถว
 * @return {string} HTML table
 */
function buildDetailsTable(rowData) {
  try {
    const contactMap = getEmailContactMap();
    const statusColor = getStatusColor(rowData.status);
    const statusTextColor = getStatusTextColor(rowData.status);
    const html = `
      <table class="detail-table" role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td class="detail-cell detail-cell-left">
            <span class="detail-label">JOB NO</span>
            <span class="detail-value">${buildJobLinkHtml(rowData.jobNo, rowData.jobNo, '')}</span>
          </td>
          <td class="detail-cell">
            <span class="detail-label">สถานะปัจจุบัน</span>
            <span class="detail-value"><span class="inline-status" style="background-color:${statusColor}; color:${statusTextColor};">${escapeHtml(rowData.status || '-')}</span></span>
          </td>
        </tr>
        <tr>
          <td class="detail-cell detail-cell-left">
            <span class="detail-label">ผู้แจ้ง</span>
            <span class="detail-value">${escapeHtml(formatPersonWithName(rowData.ownerSubjectId, contactMap) || '-')}</span>
          </td>
          <td class="detail-cell">
            <span class="detail-label">วันที่แจ้ง</span>
            <span class="detail-value">${escapeHtml(formatSummaryContactDate(rowData.contactDate) || '-')}</span>
          </td>
        </tr>
        <tr>
          <td class="detail-cell detail-cell-left">
            <span class="detail-label">ผู้รับผิดชอบ</span>
            <span class="detail-value">${escapeHtml(formatPersonWithName(rowData.assignto, contactMap) || '-')}</span>
          </td>
          <td class="detail-cell">
            <span class="detail-label">DEV</span>
            <span class="detail-value">${escapeHtml(formatPersonWithName(rowData.sysDevelop, contactMap) || '-')}</span>
          </td>
        </tr>
        <tr>
          <td class="detail-cell detail-cell-left">
            <span class="detail-label">ประเภทบริการ</span>
            <span class="detail-value">${escapeHtml(rowData.sysserViceTypeName || '-')}</span>
          </td>
          <td class="detail-cell">
            <span class="detail-label">โปรแกรม</span>
            <span class="detail-value">${escapeHtml(rowData.productName || '-')}</span>
          </td>
        </tr>
      </table>
    `;
    
    return html;
  } catch (e) {
    log('Error building details table: ' + e.message, LOG_LEVEL.ERROR);
    return '<p>Error generating details table</p>';
  }
}

/**
 * สร้างส่วน Flow Tracking สำหรับเมลแจ้งสถานะงาน
 * @param {Sheet} sheet - Sheet object
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} rowData - ข้อมูลแถว
 * @param {Object} headerMap - Header map
 * @return {string} HTML section
 */
function buildFlowTrackingSection(sheet, rowIndex, rowData, headerMap) {
  try {
    let events = getFlowTrackingEventsFromSheet(rowData && rowData.jobNo);

    if (events.length === 0) {
      const flowTrackingText = getFlowTrackingText(sheet, rowIndex, rowData, headerMap);
      events = parseFlowTrackingEvents(flowTrackingText);
    }

    if (events.length === 0) {
      return '';
    }

    const contactMap = getEmailContactMap();
    const latest = events[events.length - 1];
    const latestStatusColor = getStatusColor(latest.status);
    const latestStatusTextColor = getStatusTextColor(latest.status);
    let html = `
      <div class="section section-card">
        <h2>การติดตาม Flow งาน</h2>
        <div class="flow-latest">
          <div class="flow-latest-label">สถานะล่าสุด</div>
          <div><span class="flow-latest-status" style="background-color:${latestStatusColor}; color:${latestStatusTextColor};">${escapeHtml(latest.status || '-')}</span></div>
          <div class="flow-latest-people">
            ผู้รับผิดชอบ: ${escapeHtml(formatPersonWithName(latest.assignto, contactMap) || '-')}<br>
            DEV: ${escapeHtml(formatPersonWithName(latest.sysDevelop, contactMap) || '-')}
          </div>
          <div class="flow-latest-time">อัปเดตเมื่อ ${escapeHtml(formatFlowTrackingTimestamp(latest.timestamp))}</div>
        </div>
        <table class="flow-table">
          <tr>
            <th class="flow-no">#</th>
            <th class="flow-time">วันและเวลา</th>
            <th class="flow-status">สถานะ</th>
            <th>ผู้รับแจ้ง</th>
            <th>DEV</th>
          </tr>
    `;

    events.forEach((event, index) => {
      html += `
        <tr>
          <td class="flow-no">${index + 1}</td>
          <td class="flow-time">${escapeHtml(formatFlowTrackingTimestamp(event.timestamp))}</td>
          <td class="flow-status"><strong>${escapeHtml(event.status || '-')}</strong></td>
          <td>${escapeHtml(formatPersonWithName(event.assignto, contactMap) || '-')}</td>
          <td>${escapeHtml(formatPersonWithName(event.sysDevelop, contactMap) || '-')}</td>
        </tr>
      `;
    });

    html += `
        </table>
      </div>
    `;

    return html;
  } catch (e) {
    log('Error building flow tracking section: ' + e.message, LOG_LEVEL.WARNING);
    return '';
  }
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
 * คืน class สีตามอายุเคสสำหรับใช้เป็น badge ใน Report Summary
 * @param {*} value - วันที่แจ้ง
 * @return {string} CSS class
 */
function getCaseAgeClass(value) {
  const ageText = getCaseAgeDays(value);

  if (ageText === '') {
    return 'age-warning';
  }

  const age = Number(ageText);

  if (isNaN(age)) {
    return 'age-warning';
  }

  if (age >= 30) {
    return 'age-critical';
  }

  if (age >= 8) {
    return 'age-warning';
  }

  return 'age-fresh';
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
