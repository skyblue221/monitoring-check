# 모니터링단 접근성 기록함

`index.html`을 브라우저로 열면 바로 사용할 수 있습니다.

## 할 수 있는 일

- 점자메뉴판, 경사로, 직원 응대, 후속 조치 필요 여부를 모니터링 기록으로 저장
- 점자메뉴판 또는 경사로 보급이 필요한 장소를 신청 기록으로 저장
- 전체 기록 검색, 유형별 필터, 상태별 필터
- CSV 내보내기로 엑셀/스프레드시트에서 후속 정리
- Apps Script 웹앱 URL을 저장해 새 기록을 구글시트에도 전송

기록은 현재 브라우저에 저장됩니다. `시트 연결` 화면에 Apps Script 웹앱 URL을 저장하면 새 기록이 구글시트에도 전송됩니다.

## 구글시트 연결 코드

구글시트에서 `확장 프로그램 > Apps Script`를 열고 아래 코드를 붙여넣은 뒤 웹 앱으로 배포하세요.

```javascript
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);

  sheet.appendRow([
    new Date(),
    data.kind || "",
    data.place || "",
    data.location || "",
    data.status || "",
    (data.tags || []).join(", "),
    data.kind === "request" ? data.reason || "" : [data.good, data.issue].filter(Boolean).join(" / "),
    data.owner || "",
    data.contact || ""
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```
