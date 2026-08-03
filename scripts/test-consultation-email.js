"use strict";

const assert = require("node:assert/strict");
const { handler, _private } = require("../netlify/functions/consultation-email");

async function run() {
  const valid = {
    phone: "010-2568-6630",
    lesson: "영어회화",
    message: "기초 회화 상담을 받고 싶습니다.",
    privacyConsent: "yes",
    sourcePage: "https://kimsenglish.co.kr/anyang-english-conversation/",
    botField: "",
  };

  assert.equal(_private.validate(valid), "");
  assert.match(_private.validate({ ...valid, phone: "123" }), /연락처/);
  assert.equal((await handler({ httpMethod: "GET", headers: {} })).statusCode, 405);

  const previousFetch = global.fetch;
  const previousEnvironment = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CONTACT_EMAIL: process.env.CONTACT_EMAIL,
    CONTACT_FROM_EMAIL: process.env.CONTACT_FROM_EMAIL,
  };
  let request;

  try {
    process.env.RESEND_API_KEY = "test-key-not-a-real-secret";
    process.env.CONTACT_EMAIL = "owner@gmail.com";
    process.env.CONTACT_FROM_EMAIL = "Kim's English <consultation@kimsenglish.co.kr>";
    global.fetch = async function (url, options) {
      request = { url, options };
      return { ok: true, status: 200, text: async function () { return "{}"; } };
    };

    const result = await handler({
      httpMethod: "POST",
      headers: { origin: "https://kimsenglish.co.kr", "user-agent": "Test Browser" },
      body: JSON.stringify(valid),
    });
    assert.equal(result.statusCode, 200);
    assert.equal(request.url, "https://api.resend.com/emails");

    const email = JSON.parse(request.options.body);
    assert.deepEqual(email.to, ["owner@gmail.com"]);
    assert.equal(email.subject, "[Kim's English] 새로운 상담 신청");
    assert.equal("cc" in email, false);
    assert.equal("bcc" in email, false);
    assert.equal("reply_to" in email, false);
    assert.match(email.text, /010-2568-6630/);
    assert.match(email.text, /Test Browser/);
    assert.match(email.text, /anyang-english-conversation/);

    request = null;
    const spam = await handler({
      httpMethod: "POST",
      headers: { origin: "https://kimsenglish.co.kr" },
      body: JSON.stringify({ ...valid, botField: "spam" }),
    });
    assert.equal(spam.statusCode, 200);
    assert.equal(request, null);
  } finally {
    global.fetch = previousFetch;
    Object.keys(previousEnvironment).forEach(function (name) {
      if (previousEnvironment[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnvironment[name];
    });
  }

  console.log("Consultation email tests passed.");
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
