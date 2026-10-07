/**
 * Config.gs - ไฟล์ตั้งค่าค่าคงที่ทั้งหมด
 * 
 * ใช้ไฟล์นี้เพื่อควบคุมค่าของระบบจากที่เดียว
 */

// ========== Drive & Spreadsheet IDs ==========
const DRIVE_FOLDER_ID = '1aXRC4l8aepBut_mBfYtJvwikiAXbAfhQ';
const TARGET_SHEET_ID = '11Fi4uDaCmVF3IBY_wCQRNrmWOwVlwHOlbiZhfs35sdo';

// ========== Setting ==========
const EMPLOYEE_DEPARTMENTS = {
  QA: ['6101', '6619', '6610'],
  DEV: ['4208', '5636', '5640', '5834', '6620', '6529', '6305', '6318', '6137'],
  ACCOUNT: ['5433'],
  SUPPORT: ['5264', '5627', '5703', '5725', '5807', '6001', '6132', '6136', '6303', '6409', '6511', '6512', '6612', '6702', '6710', '6738', '6901', '6907', '6910']
};
const QA_ASSIGNEES = EMPLOYEE_DEPARTMENTS.QA;
const DEV_ASSIGNEES = EMPLOYEE_DEPARTMENTS.DEV;
const EMAIL_SHEET_NAME = 'EMAIL';
const EMAIL_LOG_SHEET_NAME = 'EMAIL_LOG';
const FLOW_TRACKING_SHEET_NAME = 'FLOW_TRACKING';
const DATE_TIME_FORMAT = 'dd/MM/yyyy HH:mm:ss';
const MAIN_TRIGGER_INTERVAL_MINUTES = 1;
const MAIN_TRIGGER_WORKDAYS = [1, 2, 3, 4, 5]; // 1=Monday, 5=Friday
const MAIN_TRIGGER_START_TIME = '09:00';
const MAIN_TRIGGER_END_TIME = '18:30';

// ========== Allowed Service Types ==========
const ALLOWED_SERVICE_TYPES = [
  'สอบถามปัญหาทั่วไป',
  'สอบถามเรื่องฟอร์ม&รายงาน',
  'Bug',
  'Question',
  'Feature',
  'สอบถามปัญหาทั่วไป(HD)',
  'ต้องการสั่งทำ Feature เพิ่มเติม',
  'ตรวจสอบฐานข้อมูล',
  'ติดต่อสอบถาม Form/Report',
  'เรื่องทั่วไป/ประสานงาน',
  'DB-เปลี่ยน Config ในโปรแกรม',
  'DB-เคลียร์คลาวน์(กรณีเริ่มฐานข้อมูลใหม่)',
  'DB-เปลี่ยนประเภทฐานข้อมูล H B เป็น N',
  'DB-Recovery Data',
  'DB-QA ขอตรวจสอบ',
  'ติดต่อสั่งทำแบบ Form Premium',
  'ติดต่อสั่งทำแบบ Report',
  'ติดต่อสั่งทำแบบ Form'
];

// ========== Email Configuration ==========
const EMAIL_ENABLED = true;
const SENDER_NAME = 'CRM Report System';
const EMAIL_SUBJECT_TEMPLATE = 'แจ้งเตือนสถานะงาน {jobNo} : {status}';
const EMAIL_TIMEZONE = 'GMT+7'; // ประเทศไทย
// ข้ามการส่งอีเมลแจ้งเตือนรายงาน (per-job) เมื่อ "เรื่องที่แจ้ง" ขึ้นต้นด้วย prefix เหล่านี้
const EMAIL_SKIP_SUBJECT_PREFIXES = ['PMX2'];
// ข้ามการส่งอีเมลแจ้งเตือนรายงาน (per-job) เมื่อ "โปรแกรม" ตรงกับชื่อเหล่านี้ (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
const EMAIL_SKIP_PRODUCT_NAMES = ['ProMaxx2'];

// ========== Header Mapping ==========
const REQUIRED_HEADERS = [
  { key: 'jobNo', title: 'Job No' },
  { key: 'subject', title: 'เรื่องที่แจ้ง' },
  { key: 'ownerSubjectId', title: 'ผู้แจ้ง' },
  { key: 'contactDate', title: 'วันที่แจ้ง' },
  { key: 'assignto', title: 'ผู้รับแจ้ง' },
  { key: 'originalAssignto', title: 'ผู้รับเรื่องหลัก' },
  { key: 'sysserViceTypeName', title: 'ประเภทบริการ' },
  { key: 'status', title: 'สถานะ' },
  { key: 'productName', title: 'โปรแกรม' },
  { key: 'sysDevelop', title: 'DEV' },
  { key: 'QA', title: 'QA' },
  { key: 'mailSent', title: 'mailSent' },
  { key: 'lastEmailKey', title: 'lastEmailKey' },
  { key: 'lastStatus', title: 'lastStatus' },
  { key: 'updatedAt', title: 'updatedAt' }
];

const OPTIONAL_HEADERS = [
  { key: 'flowTracking', title: 'flowTracking' }
];

const FLOW_TRACKING_HEADERS = [
  { key: 'timestamp', title: 'timestamp' },
  { key: 'jobNo', title: 'jobNo' },
  { key: 'status', title: 'status' },
  { key: 'assignto', title: 'assignto' },
  { key: 'assigntoName', title: 'assigntoName' },
  { key: 'ownerSubjectId', title: 'ownerSubjectId' },
  { key: 'ownerSubjectName', title: 'ownerSubjectName' },
  { key: 'sysDevelop', title: 'sysDevelop' },
  { key: 'sysDevelopName', title: 'sysDevelopName' },
  { key: 'eventType', title: 'eventType' },
  { key: 'sourceUpdatedAt', title: 'sourceUpdatedAt' },
  { key: 'eventKey', title: 'eventKey' }
];

const EMAIL_LOG_HEADERS = [
  { key: 'timestamp', title: 'timestamp' },
  { key: 'emailType', title: 'emailType' },
  { key: 'jobNo', title: 'jobNo' },
  { key: 'status', title: 'status' },
  { key: 'assignto', title: 'assignto' },
  { key: 'assigntoName', title: 'assigntoName' },
  { key: 'email', title: 'email' },
  { key: 'emailKey', title: 'emailKey' },
  { key: 'result', title: 'result' },
  { key: 'message', title: 'message' },
  { key: 'subject', title: 'subject' }
];

const HEADER_ALIASES = {
  assignto: ['ผูรับแจ้ง']
};

// ========== Email Status Values ==========
const EMAIL_STATUS = {
  SENT: 'sent',
  PENDING: 'pending',
  FAILED: 'failed'
};

// ========== Status Values ==========
const JOB_STATUS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  CLOSED: 'Close'
};

// ========== Logger Settings ==========
const ENABLE_LOGGING = true;
const LOG_LEVEL = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR'
};
