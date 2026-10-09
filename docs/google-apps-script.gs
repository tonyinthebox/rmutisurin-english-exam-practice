/**
 * รับคะแนนจากเว็บฝึกทำข้อสอบ แล้วบันทึกลง Google Sheets
 * วางโค้ดนี้ใน Extensions → Apps Script ของ Google Sheet ที่ต้องการเก็บคะแนน
 * (ดูขั้นตอนใน docs/google-sheets-setup.md)
 */
const SHEET_NAME = "Results";

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    const sectionNames = Object.keys(data.sections || {});
    const answerIds = Object.keys(data.answers || {});
    const header = ["Timestamp", "Name", "Student ID", "Test ID", "Test", "Mode", "Score", "Total", "Percent", "Minutes"]
      .concat(sectionNames)
      .concat(answerIds);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(header);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, header.length).setFontWeight("bold");
    }

    // match columns by header name so different tests can share one sheet
    let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    header.forEach((h) => {
      if (headers.indexOf(h) === -1) {
        sheet.getRange(1, headers.length + 1).setValue(h).setFontWeight("bold");
        headers.push(h);
      }
    });

    const values = {
      "Timestamp": new Date(data.timestamp),
      "Name": data.name,
      "Student ID": data.studentId,
      "Test ID": data.testId,
      "Test": data.testTitle,
      "Mode": data.mode === "practice" ? "ฝึก" : "สอบ",
      "Score": data.score,
      "Total": data.total,
      "Percent": data.total ? Math.round((data.score / data.total) * 100) : "",
      "Minutes": data.minutes
    };
    sectionNames.forEach((s) => (values[s] = "'" + data.sections[s]));
    answerIds.forEach((q) => (values[q] = data.answers[q]));

    sheet.appendRow(headers.map((h) => (h in values ? values[h] : "")));
    return ContentService.createTextOutput("ok");
  } finally {
    lock.releaseLock();
  }
}
