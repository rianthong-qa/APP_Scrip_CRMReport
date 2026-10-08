/**
 * FileHandler.gs - จัดการไฟล์ Excel จาก Google Drive
 * 
 * ฟังก์ชันสำหรับ:
 * - หาไฟล์ Excel ในโฟลเดอร์
 * - เลือกไฟล์ล่าสุด
 * - ย้ายไฟล์เก่าไปถังขยะ
 * - แปลงไฟล์ Excel เป็น Google Sheets
 */

/**
 * หา Excel files ทั้งหมดในโฟลเดอร์
 * @param {string} folderId - Drive Folder ID
 * @return {Array} Array ของ File objects
 */
function getExcelFilesInFolder(folderId) {
  const files = [];
  try {
    const folder = DriveApp.getFolderById(folderId);
    const iterator = folder.getFiles();
    
    while (iterator.hasNext()) {
      const file = iterator.next();
      const mimeType = file.getMimeType();
      
      // ตรวจสอบว่าเป็นไฟล์ Excel หรือไม่
      if (mimeType === MimeType.MICROSOFT_EXCEL || 
          mimeType === MimeType.MICROSOFT_EXCEL_LEGACY) {
        files.push(file);
      }
    }
    
    log('Found ' + files.length + ' Excel files in folder', LOG_LEVEL.INFO);
    return files;
  } catch (e) {
    log('Error getting Excel files: ' + e.message, LOG_LEVEL.ERROR);
    return [];
  }
}

/**
 * หาไฟล์ Excel ล่าสุดในโฟลเดอร์
 * @param {string} folderId - Drive Folder ID
 * @return {File|null} ไฟล์ล่าสุด หรือ null ถ้าไม่มี
 */
function getLatestExcelFileInFolder(folderId) {
  try {
    const files = getExcelFilesInFolder(folderId);
    return getLatestExcelFileFromFiles(files);
  } catch (e) {
    log('Error getting latest Excel file: ' + e.message, LOG_LEVEL.ERROR);
    return null;
  }
}

function getLatestExcelFileFromFiles(files) {
  try {
    
    if (!files || files.length === 0) {
      log('No Excel files found in folder', LOG_LEVEL.WARNING);
      return null;
    }
    
    // เรียงลำดับตามวันที่อัปเดตล่าสุด (ล่าสุดก่อน)
    files.sort((a, b) => b.getLastUpdated() - a.getLastUpdated());
    
    const latestFile = files[0];
    log('Latest file: ' + latestFile.getName() + ' (Updated: ' + latestFile.getLastUpdated() + ')', LOG_LEVEL.INFO);
    
    return latestFile;
  } catch (e) {
    log('Error selecting latest Excel file: ' + e.message, LOG_LEVEL.ERROR);
    return null;
  }
}

/**
 * ย้ายไฟล์อื่นไปถังขยะ เก็บไฟล์ที่ระบุไว้เท่านั้น
 * @param {Array} files - Array ของไฟล์ที่ต้องเช็ค
 * @param {File} keepFile - ไฟล์ที่ต้องเก็บ
 */
function moveOtherFilesToTrash(files, keepFile) {
  try {
    let movedCount = 0;
    
    files.forEach((file) => {
      if (file.getId() !== keepFile.getId()) {
        file.setTrashed(true);
        log('Moved to trash: ' + file.getName(), LOG_LEVEL.INFO);
        movedCount++;
      }
    });
    
    log('Total files moved to trash: ' + movedCount, LOG_LEVEL.INFO);
  } catch (e) {
    log('Error moving files to trash: ' + e.message, LOG_LEVEL.ERROR);
  }
}

/**
 * ย้ายไฟล์ Excel ที่ประมวลผลเสร็จแล้วไปถังขยะ
 * @param {File} file - ไฟล์ที่ประมวลผลแล้ว
 */
function moveProcessedFileToTrash(file) {
  try {
    if (!file) {
      return;
    }

    file.setTrashed(true);
    log('Moved processed file to trash: ' + file.getName(), LOG_LEVEL.INFO);
  } catch (e) {
    log('Error moving processed file to trash: ' + e.message, LOG_LEVEL.WARNING);
  }
}

/**
 * แปลงไฟล์ Excel เป็น Google Spreadsheet
 * @param {File} file - ไฟล์ Excel ที่ต้องแปลง
 * @return {Spreadsheet|null} Spreadsheet object หรือ null ถ้าแปลงไม่ได้
 */
function convertExcelToSpreadsheet(file) {
  try {
    // ตรวจสอบว่า Advanced Drive service พร้อมใช้งานหรือไม่
    if (typeof Drive === 'undefined' || !Drive.Files) {
      log('Advanced Drive service is not available. Enable Drive API in Advanced Google services and Google Cloud Console.', LOG_LEVEL.ERROR);
      throw new Error('Advanced Drive service not enabled. Please enable Drive API in Advanced Google services and Google Cloud Console.');
    }

    // Drive API v3 ใช้ Files.create + name และแปลงไฟล์จาก mimeType ปลายทาง
    // Drive API v2 ใช้ Files.insert + title และต้องส่ง { convert: true }
    const isDriveV3 = typeof Drive.Files.create === 'function';
    const convertedName = file.getName() + '_converted_' + Date.now();
    const resource = isDriveV3
      ? { name: convertedName, mimeType: MimeType.GOOGLE_SHEETS }
      : { title: convertedName, mimeType: MimeType.GOOGLE_SHEETS };
    const convertOptions = isDriveV3 ? {} : { convert: true };

    log('Converting file: ' + file.getName() + ' | MIME: ' + file.getMimeType() + ' | Size: ' + file.getSize() + ' | Drive API: ' + (isDriveV3 ? 'v3' : 'v2'), LOG_LEVEL.INFO);

    // วิธีหลัก: copy-convert จากไฟล์ที่อยู่บน Drive โดยตรง
    let convertedFile = null;
    let copyError = null;
    try {
      if (typeof Drive.Files.copy === 'function') {
        convertedFile = Drive.Files.copy(resource, file.getId(), convertOptions);
      }
    } catch (e) {
      copyError = e;
      log('Drive.Files.copy conversion failed: ' + e.message, LOG_LEVEL.WARNING);
    }

    // วิธีสำรอง: upload blob แล้ว convert
    if (!convertedFile || !convertedFile.id) {
      try {
        const blob = normalizeExcelBlob(file);
        if (isDriveV3) {
          convertedFile = Drive.Files.create(resource, blob);
        } else if (typeof Drive.Files.insert === 'function') {
          convertedFile = Drive.Files.insert(resource, blob, convertOptions);
        } else {
          throw new Error('Neither Drive.Files.create nor Drive.Files.insert is available.');
        }
      } catch (e) {
        log('Drive upload conversion failed: ' + e.message, LOG_LEVEL.ERROR);
        if (copyError) {
          log('Primary conversion error was: ' + copyError.message, LOG_LEVEL.ERROR);
        }
        throw e;
      }
    }

    // ตรวจสอบผลลัพธ์การแปลง
    if (!convertedFile || !convertedFile.id) {
      log('Drive conversion returned no file or missing id', LOG_LEVEL.ERROR);
      return null;
    }

    // เปิด Spreadsheet ที่แปลงแล้ว
    const spreadsheet = SpreadsheetApp.openById(convertedFile.id);
    
    log('File converted successfully: ' + convertedFile.id, LOG_LEVEL.INFO);
    
    // เก็บ ID ของไฟล์ชั่วคราวเพื่อลบทีหลัง
    PropertiesService.getUserProperties().setProperty('TEMP_SPREADSHEET_ID', convertedFile.id);
    
    return spreadsheet;
  } catch (e) {
    log('Error converting Excel to Spreadsheet: ' + e.message, LOG_LEVEL.ERROR);
    return null;
  }
}

/**
 * ปรับ MIME type ของ blob ให้ตรงกับนามสกุล Excel ก่อนส่งให้ Drive API convert
 * @param {File} file - ไฟล์ Excel
 * @return {Blob} Blob ที่ตั้ง content type แล้ว
 */
function normalizeExcelBlob(file) {
  const blob = file.getBlob();
  const fileName = String(file.getName() || '').toLowerCase();

  if (fileName.endsWith('.xlsx')) {
    return blob.setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  if (fileName.endsWith('.xls')) {
    return blob.setContentType('application/vnd.ms-excel');
  }

  if (fileName.endsWith('.xlsm')) {
    return blob.setContentType('application/vnd.ms-excel.sheet.macroEnabled.12');
  }

  return blob;
}

/**
 * ลบไฟล์ Spreadsheet ชั่วคราว
 */
function deleteTempSpreadsheet() {
  try {
    const tempId = PropertiesService.getUserProperties().getProperty('TEMP_SPREADSHEET_ID');
    
    if (tempId) {
      deleteTempSpreadsheetById(tempId);
      PropertiesService.getUserProperties().deleteProperty('TEMP_SPREADSHEET_ID');
    }
  } catch (e) {
    log('Error deleting temporary spreadsheet: ' + e.message, LOG_LEVEL.WARNING);
  }
}

/**
 * ล้างไฟล์ชั่วคราวจากการ convert ทั้งจาก ID โดยตรงและจากชื่อไฟล์
 * @param {string} tempSpreadsheetId - ID ของ Spreadsheet ชั่วคราว
 * @param {string} sourceFileName - ชื่อไฟล์ Excel ต้นทาง
 */
function cleanupTemporaryFiles(tempSpreadsheetId, sourceFileName) {
  const userProperties = PropertiesService.getUserProperties();
  const storedTempSpreadsheetId = userProperties.getProperty('TEMP_SPREADSHEET_ID');
  const tempIds = {};

  [tempSpreadsheetId, storedTempSpreadsheetId].forEach((fileId) => {
    const normalizedId = String(fileId || '').trim();
    if (normalizedId) {
      tempIds[normalizedId] = true;
    }
  });

  Object.keys(tempIds).forEach((fileId) => {
    deleteTempSpreadsheetById(fileId);
  });

  if (storedTempSpreadsheetId) {
    userProperties.deleteProperty('TEMP_SPREADSHEET_ID');
  }

  deleteConvertedFilesBySourceName(sourceFileName);
}

/**
 * ลบไฟล์ Spreadsheet ชั่วคราวด้วย ID โดยตรง
 * @param {string} fileId - Drive file ID
 */
function deleteTempSpreadsheetById(fileId) {
  try {
    if (!fileId) return;

    const tempFile = DriveApp.getFileById(fileId);
    if (tempFile.isTrashed()) {
      log('Temporary spreadsheet already in trash: ' + fileId, LOG_LEVEL.DEBUG);
      return;
    }

    tempFile.setTrashed(true);
    log('Deleted temporary spreadsheet by id: ' + fileId, LOG_LEVEL.INFO);
  } catch (e) {
    log('Error deleting temporary spreadsheet by id: ' + e.message, LOG_LEVEL.WARNING);
  }
}

/**
 * กวาดไฟล์แปลงชั่วคราวที่ชื่อขึ้นต้นจากไฟล์ต้นทางและมี _converted_
 * @param {string} sourceFileName - ชื่อไฟล์ Excel ต้นทาง
 */
function deleteConvertedFilesBySourceName(sourceFileName) {
  try {
    if (!sourceFileName) return;

    const query = "title contains '" + escapeDriveQueryValue(sourceFileName) + "_converted_' and trashed = false";
    const files = DriveApp.searchFiles(query);
    let deletedCount = 0;

    while (files.hasNext()) {
      const file = files.next();
      file.setTrashed(true);
      deletedCount++;
      log('Deleted converted temporary file: ' + file.getName(), LOG_LEVEL.INFO);
    }

    if (deletedCount > 0) {
      log('Deleted converted temporary files count: ' + deletedCount, LOG_LEVEL.INFO);
    }
  } catch (e) {
    log('Error deleting converted files by source name: ' + e.message, LOG_LEVEL.WARNING);
  }
}

/**
 * กวาดไฟล์ชั่วคราวจากการ convert ทั้งหมดที่ยังค้างใน Drive
 * ใช้รันด้วยมือได้หากมีไฟล์ *_converted_* ค้างจากรอบก่อนหน้า
 */
function cleanupAllConvertedTempFiles() {
  try {
    const files = DriveApp.searchFiles("title contains '_converted_' and trashed = false");
    let deletedCount = 0;

    while (files.hasNext()) {
      const file = files.next();
      file.setTrashed(true);
      deletedCount++;
      log('Deleted converted temporary file: ' + file.getName(), LOG_LEVEL.INFO);
    }

    log('Cleanup all converted temporary files completed. Deleted: ' + deletedCount, LOG_LEVEL.INFO);
  } catch (e) {
    log('Error cleaning all converted temporary files: ' + e.message, LOG_LEVEL.ERROR);
  }
}

function escapeDriveQueryValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * ฟังก์ชัน Log ทั่วไป
 * @param {string} message - ข้อความ log
 * @param {string} level - ระดับ log (DEBUG, INFO, WARNING, ERROR)
 */
function log(message, level = LOG_LEVEL.INFO) {
  if (!ENABLE_LOGGING) return;
  
  const timestamp = Utilities.formatDate(new Date(), EMAIL_TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  const logMessage = '[' + timestamp + '] [' + level + '] ' + message;
  Logger.log(logMessage);
}
