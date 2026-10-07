/**
 * DataProcessor.gs - ประมวลผลข้อมูลและลงใน Google Sheet
 * 
 * ฟังก์ชันสำหรับ:
 * - ประมวลผลข้อมูลแต่ละแถว
 * - ตรวจสอบ jobNo ซ้ำ
 * - อัปเดตข้อมูลเดิมหรือเพิ่มข้อมูลใหม่
 */

/**
 * ประมวลผลข้อมูลแต่ละแถว - append หรือ update
 * @param {Sheet} sheet - Sheet object
 * @param {Object} rowData - ข้อมูลแถวที่จัดรูปแบบแล้ว
 * @param {Object} headerMap - Header map
 */
function processRow(sheet, rowData, headerMap) {
  try {
    // ถ้าไม่มี jobNo ให้ข้ามแถวนี้
    if (!rowData.jobNo) {
      log('Skipping row with empty jobNo', LOG_LEVEL.WARNING);
      return;
    }
    
    // หาตำแหน่งแถวของ jobNo เดิม
    const existingRowIndex = findRowByJobNo(sheet, rowData.jobNo, headerMap);
    const flowSheet = getFlowTrackingSheet(sheet.getParent());
    const flowHeaderMap = buildFlowTrackingHeaderMap(flowSheet);
    const existingFlowEventKeys = buildFlowEventKeyIndex(flowSheet, flowHeaderMap);
    const contactMap = getEmailContactMap();
    
    // สร้างข้อมูลสำหรับอัปเดต
    const updateData = buildUpdateData(rowData, headerMap);
    
    if (existingRowIndex) {
      // jobNo เดิม - ตรวจสอบว่าต้องอัปเดตหรือไม่
      const existingStatus = String(getCellValue(sheet, existingRowIndex, headerMap.lastStatus) || '').trim();
      const existingAssignto = String(getCellValue(sheet, existingRowIndex, headerMap.assignto) || '').trim();
      const existingSysDevelop = String(headerMap.sysDevelop ? getCellValue(sheet, existingRowIndex, headerMap.sysDevelop) || '' : '').trim();
      const existingOriginalAssignto = getExistingOriginalAssigntoFromSheet(sheet, existingRowIndex, headerMap);
      const existingEmailKey = getLastEmailKeyFromSheet(sheet, existingRowIndex, headerMap);
      const currentEmailKey = buildEmailNotificationKey(rowData);
      applyOriginalAssigntoToUpdateData(updateData, headerMap, rowData, existingOriginalAssignto, existingAssignto);
      
      const hasStatusChanged = existingStatus !== String(rowData.status).trim();
      const hasAssigntoChanged = existingAssignto !== String(rowData.assignto).trim();
      const hasSysDevelopChanged = existingSysDevelop !== String(rowData.sysDevelop || '').trim();
      const shouldNotify = shouldProcessForEmail(rowData.status, '') && existingEmailKey !== currentEmailKey && !isEmailSkippedForRow(rowData);
      const shouldBackfillOriginalAssignto = headerMap.originalAssignto && !existingOriginalAssignto && !!updateData[headerMap.originalAssignto];
      const shouldAddFlowEvent = hasStatusChanged || hasAssigntoChanged || hasSysDevelopChanged;
      if (shouldAddFlowEvent) {
        appendFlowTrackingEventIfNeeded(flowSheet, flowHeaderMap, existingFlowEventKeys, rowData, 'update', contactMap);
      }

      if (hasStatusChanged || hasAssigntoChanged || hasSysDevelopChanged || shouldBackfillOriginalAssignto) {
        // มีการเปลี่ยนแปลง - ให้อัปเดต
        setRowValues(sheet, existingRowIndex, updateData);
        log('Updated existing row: ' + rowData.jobNo, LOG_LEVEL.INFO);

        // ทำเครื่องหมาย email ต้องส่งอีกครั้ง
        if (hasStatusChanged || hasAssigntoChanged) {
          setCellValue(sheet, existingRowIndex, headerMap.mailSent, '');
        }

        // เพิ่มตัวอักษร email handler ให้ส่งอีเมล
        return { rowIndex: existingRowIndex, isNew: false, shouldNotify: shouldNotify };
      } else {
        // แม้ข้อมูลไม่เปลี่ยน ต้องคืน shouldNotify เพื่อ retry เมลที่ยังส่งไม่สำเร็จ
        // หรือส่งรอบใหม่เมื่อสถานะวนกลับมาคีย์เดิมในอดีต
        log('No data changes for jobNo: ' + rowData.jobNo + ', shouldNotify: ' + shouldNotify, LOG_LEVEL.DEBUG);
        return { rowIndex: existingRowIndex, isNew: false, shouldNotify: shouldNotify };
      }
    } else {
      // jobNo ใหม่ - ให้เพิ่มแถวใหม่
      const newRowIndex = sheet.getLastRow() + 1;
      applyOriginalAssigntoToUpdateData(updateData, headerMap, rowData, '', '');
      appendFlowTrackingEventIfNeeded(flowSheet, flowHeaderMap, existingFlowEventKeys, rowData, 'create', contactMap);
      setRowValues(sheet, newRowIndex, updateData);
      log('Added new row: ' + rowData.jobNo, LOG_LEVEL.INFO);
      
      return { rowIndex: newRowIndex, isNew: true, shouldNotify: shouldProcessForEmail(rowData.status, '') && !isEmailSkippedForRow(rowData) };
    }
  } catch (e) {
    log('Error processing row: ' + e.message, LOG_LEVEL.ERROR);
    return null;
  }
}

/**
 * สร้างข้อมูลสำหรับอัปเดต (update data object)
 * @param {Object} rowData - ข้อมูลแถวที่จัดรูปแบบแล้ว
 * @param {Object} headerMap - Header map
 * @return {Object} Object ที่มี colNumber: value
 */
function buildUpdateData(rowData, headerMap, updatedAtText) {
  try {
    const update = {};
    
    // เก็บค่าของแต่ละฟิลด์ตามที่กำหนดใน header map
    Object.keys(headerMap).forEach((key) => {
      if (rowData[key] !== undefined && rowData[key] !== null) {
        update[headerMap[key]] = rowData[key];
      }
    });
    
    // บันทึก status ปัจจุบันไปที่ lastStatus
    if (headerMap.lastStatus && rowData.status) {
      update[headerMap.lastStatus] = rowData.status;
    }
    
    // บันทึกเวลา update
    if (headerMap.updatedAt) {
      update[headerMap.updatedAt] = updatedAtText || formatThaiDateFast(new Date());
    }
    
    return update;
  } catch (e) {
    log('Error building update data: ' + e.message, LOG_LEVEL.ERROR);
    return {};
  }
}

/**
 * ใส่ค่า originalAssignto เฉพาะตอนสร้างงานใหม่ หรือเติมแถวเดิมที่ยังว่าง
 * @param {Object} updateData - update data object
 * @param {Object} headerMap - Header map
 * @param {Object} rowData - ข้อมูลแถวใหม่
 * @param {string} existingOriginalAssignto - originalAssignto เดิม
 * @param {string} existingAssignto - assignto เดิมในชีท
 */
function applyOriginalAssigntoToUpdateData(updateData, headerMap, rowData, existingOriginalAssignto, existingAssignto) {
  if (!headerMap.originalAssignto || existingOriginalAssignto) {
    return;
  }

  if (!isOriginalAssigntoCaptureStatus(rowData && rowData.status)) {
    return;
  }

  updateData[headerMap.originalAssignto] = String((rowData && rowData.assignto) || '').trim();
}

/**
 * ตรวจสอบสถานะที่ควรบันทึก originalAssignto ครั้งแรก
 * @param {*} status - สถานะงาน
 * @return {boolean} true ถ้าเป็น Continue
 */
function isOriginalAssigntoCaptureStatus(status) {
  return String(status || '').trim().toLowerCase() === 'continue';
}

/**
 * สร้าง index eventKey ที่มีอยู่ในชีท FLOW_TRACKING
 * @param {Sheet} flowSheet - FLOW_TRACKING sheet
 * @param {Object} flowHeaderMap - Header map ของ FLOW_TRACKING
 * @return {Object} map eventKey: true
 */
function buildFlowEventKeyIndex(flowSheet, flowHeaderMap) {
  const index = {};

  if (!flowSheet || !flowHeaderMap || !flowHeaderMap.eventKey || flowSheet.getLastRow() <= 1) {
    return index;
  }

  const values = flowSheet
    .getRange(2, flowHeaderMap.eventKey, flowSheet.getLastRow() - 1, 1)
    .getValues();

  values.forEach((row) => {
    const eventKey = String(row[0] || '').trim();
    if (eventKey) {
      index[eventKey] = true;
    }
  });

  return index;
}

/**
 * สร้าง eventKey ของ flow เพื่อกันบันทึกซ้ำ
 * @param {Object} rowData - ข้อมูลแถว
 * @return {string} event key
 */
function buildFlowEventKey(rowData) {
  const jobNo = String((rowData && rowData.jobNo) || '').trim();
  const status = String((rowData && rowData.status) || '').trim().toLowerCase();
  const assignto = String((rowData && rowData.assignto) || '').trim();
  const sysDevelop = String((rowData && rowData.sysDevelop) || '').trim();

  return [jobNo, status, assignto, sysDevelop].join('|');
}

/**
 * ต่อ event ลง queue ถ้ายังไม่เคยบันทึก
 * @param {Array<Array>} flowRowsToAppend - queue row ที่จะ append
 * @param {Object} flowHeaderMap - Header map ของ FLOW_TRACKING
 * @param {Object} existingFlowEventKeys - index eventKey ที่มีแล้ว
 * @param {Object} rowData - ข้อมูลแถว
 * @param {string} eventType - create/update
 * @param {Object} contactMap - map ชื่อจาก EMAIL
 */
function queueFlowTrackingEventIfNeeded(flowRowsToAppend, flowHeaderMap, existingFlowEventKeys, rowData, eventType, contactMap, timestampText) {
  const eventKey = buildFlowEventKey(rowData);

  if (!eventKey || existingFlowEventKeys[eventKey]) {
    return;
  }

  flowRowsToAppend.push(buildFlowTrackingSheetRow(rowData, eventType, contactMap, flowHeaderMap, timestampText));
  existingFlowEventKeys[eventKey] = true;
}

/**
 * Append event ลง FLOW_TRACKING ทันที สำหรับ processRow แบบเดี่ยว
 * @param {Sheet} flowSheet - FLOW_TRACKING sheet
 * @param {Object} flowHeaderMap - Header map ของ FLOW_TRACKING
 * @param {Object} existingFlowEventKeys - index eventKey ที่มีแล้ว
 * @param {Object} rowData - ข้อมูลแถว
 * @param {string} eventType - create/update
 * @param {Object} contactMap - map ชื่อจาก EMAIL
 */
function appendFlowTrackingEventIfNeeded(flowSheet, flowHeaderMap, existingFlowEventKeys, rowData, eventType, contactMap) {
  const rows = [];
  queueFlowTrackingEventIfNeeded(rows, flowHeaderMap, existingFlowEventKeys, rowData, eventType, contactMap);

  if (rows.length > 0) {
    appendBatchRows(flowSheet, flowSheet.getLastRow(), rows, getMaxHeaderColumn(flowHeaderMap));
  }
}

/**
 * สร้าง row สำหรับชีท FLOW_TRACKING
 * @param {Object} rowData - ข้อมูลแถว
 * @param {string} eventType - create/update
 * @param {Object} contactMap - map ชื่อจาก EMAIL
 * @param {Object} flowHeaderMap - Header map ของ FLOW_TRACKING
 * @return {Array} row values
 */
function buildFlowTrackingSheetRow(rowData, eventType, contactMap, flowHeaderMap, timestampText) {
  const maxCol = getMaxHeaderColumn(flowHeaderMap);
  const row = [];
  const assignto = String((rowData && rowData.assignto) || '').trim();
  const ownerSubjectId = String((rowData && rowData.ownerSubjectId) || '').trim();
  const sysDevelop = String((rowData && rowData.sysDevelop) || '').trim();
  const nowText = timestampText || formatThaiDateFast(new Date());
  const valuesByKey = {
    timestamp: nowText,
    jobNo: String((rowData && rowData.jobNo) || '').trim(),
    status: String((rowData && rowData.status) || '').trim(),
    assignto: assignto,
    assigntoName: getContactNameFromMap(assignto, contactMap),
    ownerSubjectId: ownerSubjectId,
    ownerSubjectName: getContactNameFromMap(ownerSubjectId, contactMap),
    sysDevelop: sysDevelop,
    sysDevelopName: getContactNameFromMap(sysDevelop, contactMap),
    eventType: eventType || '',
    sourceUpdatedAt: nowText,
    eventKey: buildFlowEventKey(rowData)
  };

  for (let i = 0; i < maxCol; i++) {
    row[i] = '';
  }

  Object.keys(valuesByKey).forEach((key) => {
    if (flowHeaderMap[key]) {
      row[flowHeaderMap[key] - 1] = valuesByKey[key];
    }
  });

  return row;
}

/**
 * ดึงชื่อจาก contactMap
 * @param {string} id - assignto id
 * @param {Object} contactMap - map ชื่อจาก EMAIL
 * @return {string} ชื่อ
 */
function getContactNameFromMap(id, contactMap) {
  const normalizedId = String(id || '').trim();
  const contact = contactMap && contactMap[normalizedId];

  return contact ? String(contact.name || '').trim() : '';
}

/**
 * อ่าน originalAssignto จาก row values
 * @param {Array} row - ข้อมูลหนึ่งแถวจากชีท
 * @param {Object} headerMap - Header map
 * @return {string} originalAssignto
 */
function getExistingOriginalAssigntoFromRow(row, headerMap) {
  if (!headerMap.originalAssignto) return '';
  return String((row && row[headerMap.originalAssignto - 1]) || '').trim();
}

/**
 * อ่าน originalAssignto จากชีท
 * @param {Sheet} sheet - Sheet object
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} headerMap - Header map
 * @return {string} originalAssignto
 */
function getExistingOriginalAssigntoFromSheet(sheet, rowIndex, headerMap) {
  if (!headerMap.originalAssignto) return '';
  return String(getCellValue(sheet, rowIndex, headerMap.originalAssignto) || '').trim();
}

/**
 * ประมวลผลข้อมูลทั้งหมดและลงลงใน Sheet
 * @param {Sheet} sheet - Sheet object
 * @param {Array} dataRows - Array ของข้อมูล
 * @param {Object} headerMap - Header map
 * @return {Array} Array ของ rows ที่ต้องส่ง email
 */
function processAllRows(sheet, dataRows, headerMap) {
  try {
    const processStartedAt = Date.now();
    let rowsToNotify = [];
    const maxCol = getMaxHeaderColumn(headerMap);
    const flowSheet = getFlowTrackingSheet(sheet.getParent());
    const flowHeaderMap = buildFlowTrackingHeaderMap(flowSheet);
    const flowMaxCol = getMaxHeaderColumn(flowHeaderMap);
    const existingFlowEventKeys = buildFlowEventKeyIndex(flowSheet, flowHeaderMap);
    const contactMap = getEmailContactMap();
    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), maxCol);
    const existingValues = lastRow > 0
      ? sheet.getRange(1, 1, lastRow, lastCol).getValues()
      : [];
    logStep9Timing('Loaded target and tracking data', processStartedAt);
    const jobNoIndex = buildJobNoIndex(existingValues, headerMap);
    const updates = [];
    const appendRows = [];
    const flowRowsToAppend = [];
    const batchTimestamp = formatThaiDateFast(new Date());
    let skippedEmptyJobNo = 0;
    let skippedServiceType = 0;
    let skippedNoChange = 0;
    const normalizedRows = [];
    
    const normalizeStartedAt = Date.now();
    dataRows.forEach((rawRow) => {
      // จัดรูปแบบข้อมูล
      const rowData = normalizeRow(rawRow);
      
      if (rowData) {
        if (!rowData.jobNo) {
          skippedEmptyJobNo++;
          return;
        }

        if (!isAllowedServiceType(rowData.sysserViceTypeName)) {
          skippedServiceType++;
          return;
        }

        normalizedRows.push(rowData);
      }
    });
    logStep9Timing('Normalized and filtered ' + dataRows.length + ' source rows', normalizeStartedAt);

    const normalizedSortStartedAt = Date.now();
    normalizedRows.sort(compareRowDataByContactDate);
    logStep9Timing('Sorted ' + normalizedRows.length + ' normalized rows in memory', normalizedSortStartedAt);
    const rowProcessingStartedAt = Date.now();

    normalizedRows.forEach((rowData) => {
        const jobNoKey = String(rowData.jobNo).trim();
        const existingRowIndex = jobNoIndex[jobNoKey];
        const updateData = buildUpdateData(rowData, headerMap, batchTimestamp);

        if (existingRowIndex) {
          const existingRow = existingValues[existingRowIndex - 1] || [];
          const existingStatus = String(existingRow[headerMap.lastStatus - 1] || '').trim();
          const existingAssignto = String(existingRow[headerMap.assignto - 1] || '').trim();
          const existingSysDevelop = String(headerMap.sysDevelop ? existingRow[headerMap.sysDevelop - 1] || '' : '').trim();
          const existingOriginalAssignto = getExistingOriginalAssigntoFromRow(existingRow, headerMap);
          const existingEmailKey = getLastEmailKeyFromRow(existingRow, headerMap);
          const currentEmailKey = buildEmailNotificationKey(rowData);
          applyOriginalAssigntoToUpdateData(updateData, headerMap, rowData, existingOriginalAssignto, existingAssignto);
          const hasStatusChanged = existingStatus !== String(rowData.status).trim();
          const hasAssigntoChanged = existingAssignto !== String(rowData.assignto).trim();
          const hasSysDevelopChanged = existingSysDevelop !== String(rowData.sysDevelop || '').trim();
          const shouldNotify = shouldProcessForEmail(rowData.status, '') && existingEmailKey !== currentEmailKey && !isEmailSkippedForRow(rowData);
          const shouldBackfillOriginalAssignto = headerMap.originalAssignto && !existingOriginalAssignto && !!updateData[headerMap.originalAssignto];
          const shouldAddFlowEvent = hasStatusChanged || hasAssigntoChanged || hasSysDevelopChanged;
          if (shouldAddFlowEvent) {
            queueFlowTrackingEventIfNeeded(flowRowsToAppend, flowHeaderMap, existingFlowEventKeys, rowData, 'update', contactMap, batchTimestamp);
          }

          if (hasStatusChanged || hasAssigntoChanged || hasSysDevelopChanged || shouldBackfillOriginalAssignto) {
            if (hasStatusChanged || hasAssigntoChanged) {
              updateData[headerMap.mailSent] = '';
            }
            updates.push({
              rowIndex: existingRowIndex,
              values: buildSheetRowValues(existingRow, updateData, maxCol)
            });

          } else {
            skippedNoChange++;
          }

          // แยกการเข้าคิวเมลออกจากเงื่อนไขการอัปเดตข้อมูล เพื่อให้:
          // 1) retry งานที่ส่งเมลล้มเหลวในรอบก่อน
          // 2) ส่งเมื่อสถานะ/ผู้รับวนกลับมาค่าเดิมที่เคยเกิดในอดีต
          if (shouldNotify) {
            rowsToNotify.push({
              rowIndex: existingRowIndex,
              rowData: rowData,
              isNew: false
            });
          }
        } else {
          const newRowIndex = lastRow + appendRows.length + 1;
          applyOriginalAssigntoToUpdateData(updateData, headerMap, rowData, '', '');
          queueFlowTrackingEventIfNeeded(flowRowsToAppend, flowHeaderMap, existingFlowEventKeys, rowData, 'create', contactMap, batchTimestamp);
          appendRows.push(buildSheetRowValues([], updateData, maxCol));
          jobNoIndex[jobNoKey] = newRowIndex;

          if (shouldProcessForEmail(rowData.status, '') && !isEmailSkippedForRow(rowData)) {
            rowsToNotify.push({
              rowIndex: newRowIndex,
              rowData: rowData,
              isNew: true
            });
          }
        }
    });
    logStep9Timing('Compared ' + normalizedRows.length + ' eligible rows', rowProcessingStartedAt);

    const shouldSort = shouldSortAfterBatch(existingValues, updates, appendRows, headerMap);
    const writeStartedAt = Date.now();
    writeBatchUpdates(sheet, updates, maxCol, existingValues);
    appendBatchRows(sheet, lastRow, appendRows, maxCol);
    appendBatchRows(flowSheet, flowSheet.getLastRow(), flowRowsToAppend, flowMaxCol);
    logStep9Timing(
      'Wrote ' + updates.length + ' updates, ' + appendRows.length +
      ' new rows and ' + flowRowsToAppend.length + ' tracking rows',
      writeStartedAt
    );
    if (shouldSort) {
      const sortStartedAt = Date.now();
      sortSheetByContactDate(sheet, headerMap);
      rowsToNotify = refreshRowsToNotifyIndexes(sheet, rowsToNotify, headerMap);
      logStep9Timing('Sorted target sheet and refreshed notification indexes', sortStartedAt);
    } else {
      log('Skipped full sheet sort because contactDate order is already valid', LOG_LEVEL.INFO);
    }
    
    log('Processed ' + dataRows.length + ' rows', LOG_LEVEL.INFO);
    log('Rows updated: ' + updates.length, LOG_LEVEL.INFO);
    log('Rows appended: ' + appendRows.length, LOG_LEVEL.INFO);
    log('Flow tracking events appended: ' + flowRowsToAppend.length, LOG_LEVEL.INFO);
    log('Rows skipped empty jobNo: ' + skippedEmptyJobNo, LOG_LEVEL.INFO);
    log('Rows skipped service type: ' + skippedServiceType, LOG_LEVEL.INFO);
    log('Rows skipped no change: ' + skippedNoChange, LOG_LEVEL.INFO);
    log('Rows to notify: ' + rowsToNotify.length, LOG_LEVEL.INFO);
    logStep9Timing('Completed Step 9', processStartedAt);
    
    return rowsToNotify;
  } catch (e) {
    log('Error processing all rows: ' + e.message, LOG_LEVEL.ERROR);
    return [];
  }
}

function logStep9Timing(label, startedAt) {
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  log('Step 9 timing - ' + label + ': ' + elapsedSeconds.toFixed(2) + ' seconds', LOG_LEVEL.INFO);
}

function getMaxHeaderColumn(headerMap) {
  return Object.keys(headerMap).reduce((max, key) => {
    return Math.max(max, headerMap[key]);
  }, 0);
}

function buildJobNoIndex(values, headerMap) {
  const index = {};
  const jobNoCol = headerMap.jobNo - 1;

  for (let r = 1; r < values.length; r++) {
    const jobNo = String(values[r][jobNoCol] || '').trim();
    if (jobNo && !index[jobNo]) {
      index[jobNo] = r + 1;
    }
  }

  return index;
}

function compareRowDataByContactDate(a, b) {
  if (a && b && a._contactDateTime !== undefined && b._contactDateTime !== undefined) {
    if (a._contactDateTime === null && b._contactDateTime === null) return 0;
    if (a._contactDateTime === null) return 1;
    if (b._contactDateTime === null) return -1;
    return a._contactDateTime - b._contactDateTime;
  }

  return compareDateValues(a.contactDate, b.contactDate);
}

function compareDateValues(a, b) {
  const dateA = parseContactDateValue(a);
  const dateB = parseContactDateValue(b);

  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;

  return dateA.getTime() - dateB.getTime();
}

function parseContactDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value).trim();
  const thaiFormat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
  const thaiMatch = thaiFormat.exec(text);

  if (thaiMatch) {
    return new Date(
      parseInt(thaiMatch[3], 10),
      parseInt(thaiMatch[2], 10) - 1,
      parseInt(thaiMatch[1], 10),
      parseInt(thaiMatch[4] || '0', 10),
      parseInt(thaiMatch[5] || '0', 10),
      parseInt(thaiMatch[6] || '0', 10)
    );
  }

  return parseDate(value);
}

function shouldSortAfterBatch(existingValues, updates, appendRows, headerMap) {
  if (!headerMap.contactDate) return false;

  const values = existingValues.map((row) => row.slice());

  updates.forEach((item) => {
    values[item.rowIndex - 1] = item.values;
  });

  appendRows.forEach((row) => {
    values.push(row);
  });

  return isContactDateOrderDirty(values, headerMap);
}

function isContactDateOrderDirty(values, headerMap) {
  const contactDateCol = headerMap.contactDate - 1;
  let previousDate = null;

  for (let r = 1; r < values.length; r++) {
    const currentDate = parseContactDateValue(values[r][contactDateCol]);
    if (!currentDate) continue;

    if (previousDate && previousDate.getTime() > currentDate.getTime()) {
      return true;
    }

    previousDate = currentDate;
  }

  return false;
}

function refreshRowsToNotifyIndexes(sheet, rowsToNotify, headerMap) {
  if (!rowsToNotify.length) return rowsToNotify;

  const values = sheet.getDataRange().getValues();
  const jobNoIndex = buildJobNoIndex(values, headerMap);

  return rowsToNotify.map((item) => {
    const jobNo = String(item.rowData.jobNo || '').trim();
    return {
      rowIndex: jobNoIndex[jobNo] || item.rowIndex,
      rowData: item.rowData,
      isNew: item.isNew
    };
  });
}

function buildSheetRowValues(existingRow, updateData, maxCol) {
  const row = [];

  for (let i = 0; i < maxCol; i++) {
    row[i] = existingRow[i] !== undefined ? existingRow[i] : '';
  }

  Object.keys(updateData).forEach((colIndex) => {
    row[parseInt(colIndex, 10) - 1] = updateData[colIndex];
  });

  return row;
}

function writeBatchUpdates(sheet, updates, maxCol, existingValues) {
  if (!updates.length) return;

  updates.sort((a, b) => a.rowIndex - b.rowIndex);
  const firstRow = updates[0].rowIndex;
  const lastRow = updates[updates.length - 1].rowIndex;
  const rowCount = lastRow - firstRow + 1;
  const updateByRow = {};
  const existingFormulas = sheet.getRange(firstRow, 1, rowCount, maxCol).getFormulas();

  updates.forEach((item) => {
    updateByRow[item.rowIndex] = item.values;
  });

  const values = [];
  for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex++) {
    if (updateByRow[rowIndex]) {
      values.push(updateByRow[rowIndex]);
      continue;
    }

    const existingRow = (existingValues && existingValues[rowIndex - 1]) || [];
    const formulaRow = existingFormulas[rowIndex - firstRow] || [];
    const preservedRow = [];
    for (let col = 0; col < maxCol; col++) {
      preservedRow[col] = formulaRow[col] || (existingRow[col] !== undefined ? existingRow[col] : '');
    }
    values.push(preservedRow);
  }

  sheet.getRange(firstRow, 1, values.length, maxCol).setValues(values);
}

function appendBatchRows(sheet, lastRow, appendRows, maxCol) {
  if (!appendRows.length) return;

  sheet.getRange(lastRow + 1, 1, appendRows.length, maxCol).setValues(appendRows);
}

/**
 * ทำเครื่องหมายแถวเก่าที่ยังไม่ได้ลง mailSent ให้ถือว่าส่งแล้ววันนี้
 * ใช้ครั้งเดียวตอนเริ่มเปิด trigger เพื่อกันส่งเมลย้อนหลังจากข้อมูลเก่า
 * @return {Object} ผลลัพธ์การ backfill
 */
function markUnsentEmailRowsAsSentToday() {
  try {
    const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
    const sheets = ss.getSheets().filter((sheet) => isYearSheetName(sheet.getName()));
    const markedAt = formatThaiDate(new Date());
    let totalMarked = 0;
    let totalSkipped = 0;

    sheets.forEach((sheet) => {
      const result = markUnsentEmailRowsAsSentTodayInSheet(sheet, markedAt);
      totalMarked += result.marked;
      totalSkipped += result.skipped;
    });

    const summary = {
      marked: totalMarked,
      skipped: totalSkipped,
      markedAt: markedAt
    };

    log('Mark unsent email rows as sent today result: ' + JSON.stringify(summary), LOG_LEVEL.INFO);
    return summary;
  } catch (e) {
    log('Error marking unsent email rows as sent today: ' + e.message, LOG_LEVEL.ERROR);
    throw e;
  }
}

/**
 * ทำเครื่องหมายแถวในชีทเดียวที่ยังไม่ได้ส่งเมลให้เป็น sent
 * @param {Sheet} sheet - Sheet ปี
 * @param {string} markedAt - วันที่เวลาที่ backfill
 * @return {Object} ผลลัพธ์ของชีทนี้
 */
function markUnsentEmailRowsAsSentTodayInSheet(sheet, markedAt) {
  const headerMap = buildHeaderMap(sheet);
  const maxCol = getMaxHeaderColumn(headerMap);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1 || !headerMap.mailSent || !headerMap.lastEmailKey) {
    return {
      marked: 0,
      skipped: 0
    };
  }

  const values = sheet.getRange(1, 1, lastRow, Math.max(sheet.getLastColumn(), maxCol)).getValues();
  const updates = [];
  let marked = 0;
  let skipped = 0;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const mailSent = String(row[headerMap.mailSent - 1] || '').trim().toLowerCase();
    const rowData = buildRowDataFromSheetRow(row, headerMap);

    if (mailSent || !shouldProcessForEmail(rowData.status, '')) {
      skipped++;
      continue;
    }

    const updateData = {};
    updateData[headerMap.mailSent] = EMAIL_STATUS.SENT;
    updateData[headerMap.lastEmailKey] = buildEmailNotificationKey(rowData);

    if (headerMap.updatedAt) {
      updateData[headerMap.updatedAt] = markedAt;
    }

    updates.push({
      rowIndex: r + 1,
      values: buildSheetRowValues(row, updateData, maxCol)
    });
    marked++;
  }

  writeBatchUpdates(sheet, updates, maxCol, values);
  log('Marked unsent email rows in sheet ' + sheet.getName() + ': ' + marked, LOG_LEVEL.INFO);

  return {
    marked: marked,
    skipped: skipped
  };
}

/**
 * ตรวจว่าชื่อชีทเป็นปี เช่น 2026
 * @param {string} sheetName - ชื่อชีท
 * @return {boolean} true ถ้าเป็นชีทปี
 */
function isYearSheetName(sheetName) {
  return /^\d{4}$/.test(String(sheetName || '').trim());
}

/**
 * สร้าง rowData จากข้อมูลในชีทเป้าหมาย
 * @param {Array} row - row values
 * @param {Object} headerMap - Header map
 * @return {Object} rowData
 */
function buildRowDataFromSheetRow(row, headerMap) {
  const rowData = {};

  Object.keys(headerMap).forEach((key) => {
    rowData[key] = row[headerMap[key] - 1];
  });

  return rowData;
}

/**
 * เรียงข้อมูลทั้งชีทตาม contactDate จากน้อยไปมาก
 * @param {Sheet} sheet - Sheet object
 * @param {Object} headerMap - Header map
 */
function sortSheetByContactDate(sheet, headerMap) {
  try {
    if (!headerMap.contactDate) return;

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow <= 2) {
      return;
    }

    const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const values = range.getValues();
    const contactDateCol = headerMap.contactDate - 1;

    values.sort((a, b) => {
      return compareDateValues(a[contactDateCol], b[contactDateCol]);
    });

    range.setValues(values);

    log('Sorted sheet by contactDate ascending', LOG_LEVEL.INFO);
  } catch (e) {
    log('Error sorting sheet by contactDate: ' + e.message, LOG_LEVEL.WARNING);
  }
}

/**
 * ตรวจสอบประเภทบริการที่อนุญาตให้นำเข้าชีท
 * @param {string} serviceTypeName - ชื่อประเภทบริการ
 * @return {boolean} true ถ้าเป็นประเภทที่อนุญาต
 */
function isAllowedServiceType(serviceTypeName) {
  const serviceType = String(serviceTypeName || '').trim();

  if (!serviceType) {
    return false;
  }

  return ALLOWED_SERVICE_TYPES.indexOf(serviceType) !== -1;
}

/**
 * ตรวจสอบว่าควรส่ง email หรือไม่
 * @param {string} status - Status ปัจจุบัน
 * @param {string} existingStatus - Status เดิม
 * @return {boolean} true ถ้าต้องส่ง
 */
function shouldProcessForEmail(status, existingStatus) {
  try {
    const statusTrim = String(status || '').trim().toLowerCase();
    const existingStatusTrim = String(existingStatus || '').trim().toLowerCase();
    
    // ไม่ส่ง ถ้า status เป็น Open หรือ Close
    if (statusTrim === 'open' || statusTrim === 'close' || statusTrim === 'closed') {
      return false;
    }
    
    if (!statusTrim) {
      return false;
    }
    
    // ส่ง ถ้า status เปลี่ยนจากเดิม
    if (statusTrim !== existingStatusTrim) {
      return true;
    }
    
    return false;
  } catch (e) {
    log('Error checking if should process for email: ' + e.message, LOG_LEVEL.WARNING);
    return false;
  }
}

/**
 * ตรวจสอบว่างานนี้ต้องข้ามการส่งอีเมลแจ้งเตือนรายงานหรือไม่
 * (subject ขึ้นต้นด้วย prefix ใน EMAIL_SKIP_SUBJECT_PREFIXES หรือโปรแกรมอยู่ใน EMAIL_SKIP_PRODUCT_NAMES)
 * @param {Object} rowData - ข้อมูลแถว
 * @return {boolean} true ถ้าต้องข้ามการส่งอีเมล
 */
function isEmailSkippedForRow(rowData) {
  return isEmailSkippedBySubject(rowData && rowData.subject) || isEmailSkippedByProductName(rowData && rowData.productName);
}

/**
 * ตรวจสอบว่า "โปรแกรม" (productName) ต้องข้ามการส่งอีเมลแจ้งเตือนรายงานหรือไม่
 * @param {string} productName - โปรแกรม
 * @return {boolean} true ถ้าต้องข้ามการส่งอีเมล
 */
function isEmailSkippedByProductName(productName) {
  const productTrim = String(productName || '')
    .replace(/[​-‍﻿]/g, '')
    .trim()
    .toUpperCase();

  if (!productTrim) {
    return false;
  }

  return EMAIL_SKIP_PRODUCT_NAMES.some((name) => productTrim === String(name).trim().toUpperCase());
}

/**
 * ตรวจสอบว่า "เรื่องที่แจ้ง" (subject) ต้องข้ามการส่งอีเมลแจ้งเตือนรายงานหรือไม่
 * (เช่น subject ที่ขึ้นต้นด้วย PMX2 เป็นงานที่ไม่ต้องแจ้งเตือนทางอีเมล)
 * @param {string} subject - เรื่องที่แจ้ง
 * @return {boolean} true ถ้าต้องข้ามการส่งอีเมล
 */
function isEmailSkippedBySubject(subject) {
  // ตัดอักขระที่มองไม่เห็น (zero-width space, BOM ฯลฯ) ที่อาจติดมาจากการ copy ข้อมูล
  // ก่อน trim ปกติ เพื่อไม่ให้ prefix เทียบไม่ติดทั้งที่ตาเห็นว่าขึ้นต้นตรงกัน
  const subjectTrim = String(subject || '')
    .replace(/^[\s​-‍﻿ ]+/, '')
    .trim()
    .toUpperCase();

  if (!subjectTrim) {
    return false;
  }

  return EMAIL_SKIP_SUBJECT_PREFIXES.some((prefix) => subjectTrim.startsWith(String(prefix).toUpperCase()));
}

/**
 * สร้างคีย์สำหรับกันส่งอีเมลซ้ำในสถานะเดิมของงานเดิม
 * @param {Object} rowData - ข้อมูลแถว
 * @return {string} Email notification key
 */
function buildEmailNotificationKey(rowData) {
  const jobNo = String((rowData && rowData.jobNo) || '').trim();
  const status = String((rowData && rowData.status) || '').trim().toLowerCase();
  const assignto = String((rowData && rowData.assignto) || '').trim();

  return [jobNo, status, assignto].join('|');
}

/**
 * อ่าน lastEmailKey จาก row values
 * @param {Array} row - ข้อมูลหนึ่งแถวจากชีท
 * @param {Object} headerMap - Header map
 * @return {string} lastEmailKey
 */
function getLastEmailKeyFromRow(row, headerMap) {
  if (!headerMap.lastEmailKey) return '';
  return String((row && row[headerMap.lastEmailKey - 1]) || '').trim();
}

/**
 * อ่าน lastEmailKey จากชีท
 * @param {Sheet} sheet - Sheet object
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} headerMap - Header map
 * @return {string} lastEmailKey
 */
function getLastEmailKeyFromSheet(sheet, rowIndex, headerMap) {
  if (!headerMap.lastEmailKey) return '';
  return String(getCellValue(sheet, rowIndex, headerMap.lastEmailKey) || '').trim();
}

/**
 * ตรวจสอบว่า key นี้เคยส่งแล้วหรือยัง
 * @param {Sheet} sheet - Sheet object
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} headerMap - Header map
 * @param {Object} rowData - ข้อมูลแถว
 * @return {boolean} true ถ้าเคยส่ง key นี้แล้ว
 */
function hasEmailKeyBeenSent(sheet, rowIndex, headerMap, rowData) {
  const currentEmailKey = buildEmailNotificationKey(rowData);
  const lastEmailKey = getLastEmailKeyFromSheet(sheet, rowIndex, headerMap);

  // ใช้เฉพาะคีย์ล่าสุดของแถวเป็น state ปัจจุบัน
  // ห้ามใช้ EMAIL_LOG ทั้งประวัติมาบล็อก เพราะงานอาจวนกลับมาสถานะ/ผู้รับเดิม
  return !!currentEmailKey && lastEmailKey === currentEmailKey;
}

/**
 * ตรวจสอบว่าเคย send email ลงแล้วหรือไม่
 * @param {Sheet} sheet - Sheet object
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} headerMap - Header map
 * @return {boolean} true ถ้าเคย send แล้ว
 */
function hasEmailBeenSent(sheet, rowIndex, headerMap) {
  try {
    if (!headerMap.mailSent) return false;
    
    const mailSentValue = String(getCellValue(sheet, rowIndex, headerMap.mailSent) || '').trim().toLowerCase();
    return mailSentValue === EMAIL_STATUS.SENT;
  } catch (e) {
    log('Error checking if email has been sent: ' + e.message, LOG_LEVEL.WARNING);
    return false;
  }
}

/**
 * ทำเครื่องหมายว่า email ถูกส่งแล้ว
 * @param {Sheet} sheet - Sheet object
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} headerMap - Header map
 */
function markEmailAsSent(sheet, rowIndex, headerMap) {
  try {
    if (headerMap.mailSent) {
      setCellValue(sheet, rowIndex, headerMap.mailSent, EMAIL_STATUS.SENT);
      log('Marked email as sent for row: ' + rowIndex, LOG_LEVEL.DEBUG);
    }
  } catch (e) {
    log('Error marking email as sent: ' + e.message, LOG_LEVEL.WARNING);
  }
}

/**
 * ทำเครื่องหมายว่า email key ปัจจุบันถูกส่งแล้ว
 * @param {Sheet} sheet - Sheet object
 * @param {number} rowIndex - หมายเลขแถว
 * @param {Object} headerMap - Header map
 * @param {Object} rowData - ข้อมูลแถว
 */
function markEmailKeyAsSent(sheet, rowIndex, headerMap, rowData) {
  try {
    if (headerMap.lastEmailKey) {
      setCellValue(sheet, rowIndex, headerMap.lastEmailKey, buildEmailNotificationKey(rowData));
      log('Marked email key as sent for row: ' + rowIndex, LOG_LEVEL.DEBUG);
    }
  } catch (e) {
    log('Error marking email key as sent: ' + e.message, LOG_LEVEL.WARNING);
  }
}
