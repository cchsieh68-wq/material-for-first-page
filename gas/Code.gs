const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/";
const DEFAULT_MODEL = "gemini-2.5-flash";

function doGet() {
  return jsonResponse({
    ok: true,
    service: "meeting-summarizer",
    message: "GAS proxy is ready."
  });
}

function doPost(e) {
  try {
    const payload = parsePayload(e);
    const transcript = String(payload.transcript || "").trim();
    const language = String(payload.language || "繁體中文").trim();
    const format = String(payload.format || "executive").trim();

    if (!transcript) {
      return jsonResponse({ ok: false, error: "缺少會議內容。" }, 400);
    }

    const key = PropertiesService.getScriptProperties().getProperty("GEMINI_KEY");
    if (!key) {
      return jsonResponse({ ok: false, error: "GEMINI_KEY 尚未設定。" }, 500);
    }

    const model = PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL") || DEFAULT_MODEL;
    const summary = callGemini(key, model, buildPrompt(transcript, language, format));
    return jsonResponse({ ok: true, summary });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) }, 500);
  }
}

function setupGeminiKey(value) {
  if (!value || String(value).indexOf("AIza") !== 0) {
    throw new Error("請提供完整 Gemini API key。");
  }
  PropertiesService.getScriptProperties().setProperty("GEMINI_KEY", String(value));
  return "GEMINI_KEY is set.";
}

function parsePayload(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function buildPrompt(transcript, language, format) {
  const formatNames = {
    executive: "主管摘要",
    project: "專案追蹤",
    sales: "客戶會議",
    class: "課程討論"
  };

  return [
    "你是嚴謹的會議摘要助理。",
    "請用" + language + "輸出，格式偏向：" + (formatNames[format] || formatNames.executive) + "。",
    "請產生以下段落：",
    "1. 會議一句話結論",
    "2. 重點摘要",
    "3. 已決議事項",
    "4. 待辦清單：負責人 / 任務 / 期限 / 狀態",
    "5. 風險與需追問事項",
    "6. 可直接寄出的追蹤郵件草稿",
    "若逐字稿沒有明確資訊，請標示「未提及」，不要編造。",
    "",
    "會議內容：",
    transcript
  ].join("\n");
}

function callGemini(key, model, prompt) {
  const url = GEMINI_ENDPOINT + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 2048
      }
    })
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  const data = JSON.parse(body);

  if (status < 200 || status >= 300) {
    const message = data.error && data.error.message ? data.error.message : "Gemini API error";
    throw new Error(message);
  }

  const text = data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  if (!text) {
    throw new Error("Gemini 沒有回傳摘要內容。");
  }

  return text;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
