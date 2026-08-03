(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.init(root.document, root);
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const PHONE_PATTERN = /^01[016789]-?[0-9]{3,4}-?[0-9]{4}$/;
  const ERROR_MESSAGES = Object.freeze({
    phone: "연락처를 입력해 주세요.",
    phoneFormat: "국내 휴대전화 번호 형식으로 입력해 주세요.",
    lesson: "희망 수업을 선택해 주세요.",
    message: "문의 내용을 입력해 주세요.",
    privacyConsent: "개인정보 수집 및 이용에 동의해 주세요.",
  });

  function clean(value) {
    return String(value || "").trim();
  }

  function validateValues(values) {
    const errors = {};
    const phone = clean(values.phone);
    if (!phone) errors.phone = ERROR_MESSAGES.phone;
    else if (!PHONE_PATTERN.test(phone)) errors.phone = ERROR_MESSAGES.phoneFormat;
    if (!clean(values.lesson)) errors.lesson = ERROR_MESSAGES.lesson;
    if (!clean(values.message)) errors.message = ERROR_MESSAGES.message;
    if (!values.privacyConsent) errors.privacyConsent = ERROR_MESSAGES.privacyConsent;
    return errors;
  }

  function readValues(form) {
    return {
      phone: form.elements.phone.value,
      lesson: form.elements.lesson.value,
      message: form.elements.message.value,
      privacyConsent: form.elements.privacyConsent.checked,
    };
  }

  function showErrors(form, errors) {
    const names = ["phone", "lesson", "message", "privacyConsent"];
    names.forEach(function (name) {
      const field = form.elements[name];
      const error = form.querySelector('[data-error-for="' + name + '"]');
      const message = errors[name] || "";
      if (error) error.textContent = message;
      if (field) field.setAttribute("aria-invalid", message ? "true" : "false");
    });
  }

  function showFieldError(form, name, message) {
    const field = form.elements[name];
    const error = form.querySelector('[data-error-for="' + name + '"]');
    if (error) error.textContent = message || "";
    if (field) field.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function firstInvalidField(form, errors) {
    return ["phone", "lesson", "message", "privacyConsent"]
      .map(function (name) { return errors[name] ? form.elements[name] : null; })
      .find(Boolean);
  }

  function setStatus(status, type, message) {
    status.className = "form-status" + (type ? " is-" + type : "");
    status.textContent = message;
    if (message) status.focus({ preventScroll: true });
  }

  function initForm(form, runtime) {
    if (form.dataset.consultationReady === "true") return;
    form.dataset.consultationReady = "true";

    const submitButton = form.querySelector("[data-submit-button]");
    const status = form.querySelector("[data-form-status]");
    let isSubmitting = false;

    ["phone", "lesson", "message", "privacyConsent"].forEach(function (name) {
      const field = form.elements[name];
      const eventName = field.type === "checkbox" || field.tagName === "SELECT" ? "change" : "input";
      field.addEventListener(eventName, function () {
        const errors = validateValues(readValues(form));
        showFieldError(form, name, errors[name]);
      });
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (isSubmitting) return;

      const errors = validateValues(readValues(form));
      showErrors(form, errors);
      setStatus(status, "", "");
      const invalidField = firstInvalidField(form, errors);
      if (invalidField) {
        invalidField.focus();
        return;
      }

      isSubmitting = true;
      submitButton.disabled = true;
      submitButton.textContent = "전송 중...";
      form.elements.sourcePage.value = runtime.location.href;
      form.elements.submittedAt.value = new Date().toISOString();

      try {
        const values = readValues(form);
        const response = await runtime.fetch("/.netlify/functions/consultation-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: clean(values.phone), lesson: clean(values.lesson), message: clean(values.message),
            privacyConsent: values.privacyConsent ? "yes" : "", sourcePage: runtime.location.href,
            submittedAt: form.elements.submittedAt.value,
            botField: form.elements["bot-field"] ? form.elements["bot-field"].value : "",
          }),
        });
        if (!response.ok) throw new Error("Email submission failed");
        form.reset();
        showErrors(form, {});
        form.elements.sourcePage.value = runtime.location.href;
        form.elements.submittedAt.value = "";
        setStatus(
          status,
          "success",
          "상담 신청이 완료되었습니다.\n빠른 시간 내 연락드리겠습니다."
        );
      } catch {
        setStatus(
          status,
          "error",
          "상담 신청에 실패했습니다.\n잠시 후 다시 시도해주세요."
        );
      } finally {
        isSubmitting = false;
        submitButton.disabled = false;
        submitButton.textContent = "무료 상담 신청하기";
      }
    });
  }

  function init(document, runtime) {
    document.querySelectorAll("[data-consultation-form]").forEach(function (form) {
      initForm(form, runtime);
    });
  }

  return { ERROR_MESSAGES, PHONE_PATTERN, init, validateValues };
});
