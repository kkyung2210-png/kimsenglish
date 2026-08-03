"use strict";

const PHONE_PATTERN = /^01[016789]-?[0-9]{3,4}-?[0-9]{4}$/;
const ALLOWED_ORIGIN = /^https:\/\/(?:www\.)?kimsenglish\.co\.kr$/i;
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.netlify\.app$/i;
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
    body: JSON.stringify(body),
  };
}

function clean(value, maximumLength = 500) {
  return String(value == null ? "" : value).trim().slice(0, maximumLength);
}

function escapeHtml(value) {
  return clean(value, 5000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGIN.test(origin) || PREVIEW_ORIGIN.test(origin) || LOCAL_ORIGIN.test(origin);
}

function readPayload(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return null;
  }
}

function validate(payload) {
  if (!payload) return "요청 내용을 읽을 수 없습니다.";
  if (!PHONE_PATTERN.test(clean(payload.phone, 20))) return "연락처 형식을 확인해 주세요.";
  if (!clean(payload.lesson, 100)) return "희망 수업을 선택해 주세요.";
  if (!clean(payload.message, 3000)) return "문의 내용을 입력해 주세요.";
  if (payload.privacyConsent !== "yes") return "개인정보 수집 및 이용에 동의해 주세요.";
  return "";
}

function makeMail(payload, event) {
  const phone = clean(payload.phone, 20);
  const lesson = clean(payload.lesson, 100);
  const message = clean(payload.message, 3000);
  const sourcePage = clean(payload.sourcePage, 1000) || "확인 불가";
  const submittedAt = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(new Date());
  const userAgent = clean((event.headers || {})["user-agent"], 1000) || "확인 불가";
  const lines = [
    "새로운 상담 신청이 접수되었습니다.",
    "",
    "──────────────────────",
    "",
    "연락처: " + phone,
    "희망 수업: " + lesson,
    "문의 내용: " + message,
    "신청 시간: " + submittedAt,
    "방문 페이지(URL): " + sourcePage,
    "사용자 브라우저(User Agent): " + userAgent,
    "",
    "──────────────────────",
  ];

  return {
    text: lines.join("\n"),
    html: [
      "<h2>새로운 상담 신청이 접수되었습니다.</h2>",
      "<hr>",
      "<p><strong>연락처</strong><br>" + escapeHtml(phone) + "</p>",
      "<p><strong>희망 수업</strong><br>" + escapeHtml(lesson) + "</p>",
      "<p><strong>문의 내용</strong><br>" + escapeHtml(message).replace(/\r?\n/g, "<br>") + "</p>",
      "<p><strong>신청 시간</strong><br>" + escapeHtml(submittedAt) + "</p>",
      "<p><strong>방문 페이지(URL)</strong><br>" + escapeHtml(sourcePage) + "</p>",
      "<p><strong>사용자 브라우저(User Agent)</strong><br>" + escapeHtml(userAgent) + "</p>",
      "<hr>",
    ].join("\n"),
  };
}

async function handler(event) {
  if (event.httpMethod !== "POST") return jsonResponse(405, { message: "허용되지 않은 요청입니다." });

  const origin = (event.headers || {}).origin || "";
  if (!isAllowedOrigin(origin)) return jsonResponse(403, { message: "허용되지 않은 출처입니다." });

  const payload = readPayload(event);
  if (payload && clean(payload.botField, 200)) return jsonResponse(200, { ok: true });

  const validationError = validate(payload);
  if (validationError) return jsonResponse(400, { message: validationError });

  const apiKey = clean(process.env.RESEND_API_KEY, 500);
  const contactEmail = clean(process.env.CONTACT_EMAIL, 320);
  const fromEmail = clean(process.env.CONTACT_FROM_EMAIL, 320);
  if (!apiKey || !contactEmail || !fromEmail) {
    console.error("Consultation email environment variables are missing.");
    return jsonResponse(503, { message: "메일 전송 설정이 완료되지 않았습니다." });
  }

  const mail = makeMail(payload, event);
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [contactEmail],
        subject: "[Kim's English] 새로운 상담 신청",
        text: mail.text,
        html: mail.html,
      }),
    });

    if (!result.ok) {
      console.error("Resend rejected consultation email:", result.status, await result.text());
      return jsonResponse(502, { message: "메일을 전송하지 못했습니다." });
    }
    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error("Consultation email request failed:", error);
    return jsonResponse(502, { message: "메일을 전송하지 못했습니다." });
  }
}

module.exports = {
  handler,
  _private: { isAllowedOrigin, makeMail, readPayload, validate },
};
