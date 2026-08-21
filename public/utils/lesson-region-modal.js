(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.init(root.document, root);
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const EXAMS = Object.freeze([
    { label: "TOEIC", subject: "토익" },
    { label: "TOEIC Speaking", subject: "토익스피킹" },
    { label: "OPIC", subject: "오픽" },
    { label: "IELTS", subject: "아이엘츠" },
    { label: "TOEFL", subject: "토플" },
    { label: "TEPS", subject: "텝스" },
    { label: "JLPT", subject: "jlpt" },
    { label: "JPT", subject: "jpt" },
  ]);
  const LESSON_SUBJECTS = Object.freeze({
    "english-conversation": "영어회화",
    "japanese-conversation": "일본어회화",
    "business-english": "비즈니스영어",
  });

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("ko").replace(/\s+/g, "");
  }

  function matchesLesson(page, lessonType) {
    const subject = normalize(page.subject);
    if (lessonType === "exam") return EXAMS.some(function (exam) { return subject === normalize(exam.subject); });
    return subject === normalize(LESSON_SUBJECTS[lessonType]);
  }

  function availableRegions(pages, lessonType, query) {
    const needle = normalize(query);
    const seen = new Set();
    return pages
      .filter(function (page) { return page.region && matchesLesson(page, lessonType); })
      .filter(function (page) {
        const key = normalize(page.province) + "|" + normalize(page.region);
        if (seen.has(key)) return false;
        seen.add(key);
        return !needle || normalize(page.region).includes(needle) || normalize(page.province).includes(needle);
      })
      .sort(function (a, b) { return String(a.region).localeCompare(String(b.region), "ko"); });
  }

  function findPage(pages, lessonType, region) {
    return pages.find(function (page) {
      return page.region === region.region && page.province === region.province && matchesLesson(page, lessonType);
    });
  }

  function examPages(pages, region) {
    return EXAMS.map(function (exam) {
      const page = pages.find(function (item) {
        return item.region === region.region && item.province === region.province && normalize(item.subject) === normalize(exam.subject);
      });
      return page ? { label: exam.label, slug: page.slug } : null;
    }).filter(Boolean);
  }

  function init(document, runtime) {
    const modal = document.querySelector("[data-lesson-region-modal]");
    const triggers = Array.from(document.querySelectorAll("[data-lesson-region-trigger]"));
    if (!modal || !triggers.length) return;

    const input = modal.querySelector("[data-lesson-region-input]");
    const results = modal.querySelector("[data-lesson-region-results]");
    const status = modal.querySelector("[data-lesson-region-status]");
    const searchArea = modal.querySelector(".lesson-region-search");
    const examStep = modal.querySelector("[data-lesson-exam-step]");
    const examOptions = modal.querySelector("[data-lesson-exam-options]");
    const selectedRegion = modal.querySelector("[data-selected-region]");
    const closeButton = modal.querySelector("[data-lesson-region-close]");
    const backButton = modal.querySelector("[data-lesson-region-back]");
    let lessonType = "";
    let pagesPromise;
    let lastTrigger;

    function loadPages() {
      if (!pagesPromise) {
        pagesPromise = runtime.fetch("/search-index.json", { credentials: "same-origin" })
          .then(function (response) {
            if (!response.ok) throw new Error("지역 데이터를 불러오지 못했습니다.");
            return response.json();
          });
      }
      return pagesPromise;
    }

    function showMessage(message, isError) {
      status.textContent = message;
      status.classList.toggle("is-error", Boolean(isError));
    }

    function openPage(slug) {
      runtime.location.assign("/" + slug + "/");
    }

    function showExamStep(pages, region) {
      const options = examPages(pages, region);
      results.replaceChildren();
      searchArea.hidden = true;
      examStep.hidden = false;
      selectedRegion.textContent = region.region;
      examOptions.replaceChildren();
      options.forEach(function (option) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lesson-exam-option";
        button.textContent = option.label;
        button.addEventListener("click", function () { openPage(option.slug); });
        examOptions.append(button);
      });
      showMessage(options.length ? "원하는 시험을 선택해 주세요." : "이 지역에 등록된 시험 수업이 없습니다.", !options.length);
      (examOptions.querySelector("button") || backButton).focus();
    }

    function renderRegions(pages) {
      const regions = availableRegions(pages, lessonType, input.value).slice(0, 12);
      results.replaceChildren();
      regions.forEach(function (region) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lesson-region-result";
        button.setAttribute("role", "option");
        button.innerHTML = "<strong></strong><span></span>";
        button.querySelector("strong").textContent = region.region;
        button.querySelector("span").textContent = region.province;
        button.addEventListener("click", function () {
          if (lessonType === "exam") return showExamStep(pages, region);
          const page = findPage(pages, lessonType, region);
          if (page) openPage(page.slug);
        });
        results.append(button);
      });
      showMessage(regions.length ? regions.length + "개 지역을 표시했습니다." : "일치하는 지역 수업이 없습니다.", !regions.length);
    }

    function resetModal() {
      input.value = "";
      searchArea.hidden = false;
      examStep.hidden = true;
      examOptions.replaceChildren();
      results.replaceChildren();
      showMessage("지역 데이터를 불러오는 중입니다.", false);
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        lessonType = trigger.dataset.lessonRegionTrigger;
        lastTrigger = trigger;
        resetModal();
        modal.showModal();
        document.body.classList.add("has-modal-open");
        loadPages().then(function (pages) {
          renderRegions(pages);
          input.focus();
        }).catch(function (error) { showMessage(error.message, true); });
      });
    });

    input.addEventListener("input", function () {
      loadPages().then(renderRegions).catch(function (error) { showMessage(error.message, true); });
    });
    closeButton.addEventListener("click", function () { modal.close(); });
    backButton.addEventListener("click", function () {
      searchArea.hidden = false;
      examStep.hidden = true;
      loadPages().then(renderRegions);
      input.focus();
    });
    modal.addEventListener("click", function (event) {
      if (event.target === modal) modal.close();
    });
    modal.addEventListener("close", function () {
      document.body.classList.remove("has-modal-open");
      if (lastTrigger) lastTrigger.focus();
    });
  }

  return { EXAMS, availableRegions, examPages, findPage, init, matchesLesson, normalize };
});
