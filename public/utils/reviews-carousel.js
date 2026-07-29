(() => {
  "use strict";

  const AUTOPLAY_DELAY = 5000;
  const MANUAL_PAUSE = 8000;
  const DRAG_THRESHOLD = 50;

  const visibleCountForWidth = () => {
    if (window.innerWidth >= 1024) return 3;
    if (window.innerWidth >= 600) return 2;
    return 1;
  };

  document.querySelectorAll("[data-review-carousel]").forEach((carousel) => {
    const viewport = carousel.querySelector(".review-carousel-viewport");
    const track = carousel.querySelector("[data-review-track]");
    const previousButton = carousel.querySelector("[data-review-prev]");
    const nextButton = carousel.querySelector("[data-review-next]");
    const dotsContainer = carousel.querySelector("[data-review-dots]");
    const status = carousel.querySelector("[data-review-status]");
    if (!viewport || !track || !previousButton || !nextButton || !dotsContainer) return;

    const originalSlides = [...track.querySelectorAll("[data-review-slide]")];
    const total = originalSlides.length;
    if (!total) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visibleCount = visibleCountForWidth();
    let cloneCount = Math.min(visibleCount, total);
    let currentIndex = 0;
    let position = cloneCount;
    let stepSize = 0;
    let isVisible = false;
    let isHovered = false;
    let hasFocus = false;
    let isDragging = false;
    let dragStartX = 0;
    let dragOffset = 0;
    let autoplayTimer = 0;
    let resumeTimer = 0;
    let resizeTimer = 0;

    const dots = originalSlides.map((slide, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "review-dot";
      dot.setAttribute("aria-label", `${index + 1}번째 후기 보기`);
      dot.addEventListener("click", () => {
        pauseAfterManualAction();
        goToIndex(index, true);
      });
      dotsContainer.append(dot);
      return dot;
    });

    const readStepSize = () => {
      const slides = [...track.children];
      if (slides.length > 1) return slides[1].offsetLeft - slides[0].offsetLeft;
      return viewport.clientWidth;
    };

    const setTransition = (enabled) => {
      track.style.transition = enabled && !reducedMotion.matches
        ? "transform 0.35s cubic-bezier(.22,.61,.36,1)"
        : "none";
    };

    const updateA11y = () => {
      const visibleIndexes = new Set();
      for (let offset = 0; offset < visibleCount; offset += 1) {
        visibleIndexes.add((currentIndex + offset) % total);
      }
      originalSlides.forEach((slide, index) => {
        slide.setAttribute("aria-hidden", String(!visibleIndexes.has(index)));
      });
      dots.forEach((dot, index) => {
        const active = index === currentIndex;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-current", active ? "true" : "false");
      });
    };

    const announce = () => {
      if (!status) return;
      const end = Math.min(currentIndex + visibleCount, total);
      status.textContent = visibleCount === 1
        ? `${currentIndex + 1}번째 후기 표시 중`
        : `${currentIndex + 1}번째부터 ${end}번째 후기 표시 중`;
    };

    const renderPosition = (animate = true, extraOffset = 0) => {
      stepSize = readStepSize();
      setTransition(animate);
      track.style.transform = `translate3d(${(-position * stepSize) + extraOffset}px, 0, 0)`;
      updateA11y();
    };

    const normalizePosition = () => {
      if (position >= cloneCount + total) position -= total;
      if (position < cloneCount) position += total;
      currentIndex = ((position - cloneCount) % total + total) % total;
      renderPosition(false);
    };

    const goToIndex = (index, shouldAnnounce = false) => {
      currentIndex = ((index % total) + total) % total;
      position = cloneCount + currentIndex;
      renderPosition(true);
      if (shouldAnnounce) announce();
    };

    const move = (direction, shouldAnnounce = false) => {
      position += direction;
      currentIndex = ((position - cloneCount) % total + total) % total;
      renderPosition(true);
      if (shouldAnnounce) announce();
    };

    const stopAutoplay = () => {
      window.clearInterval(autoplayTimer);
      autoplayTimer = 0;
    };

    const startAutoplay = () => {
      stopAutoplay();
      if (!isVisible || isHovered || hasFocus || isDragging || reducedMotion.matches || total <= visibleCount) return;
      autoplayTimer = window.setInterval(() => move(1, false), AUTOPLAY_DELAY);
    };

    function pauseAfterManualAction() {
      stopAutoplay();
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(startAutoplay, MANUAL_PAUSE);
    }

    const rebuild = () => {
      const nextVisibleCount = visibleCountForWidth();
      visibleCount = Math.min(nextVisibleCount, total);
      cloneCount = visibleCount;
      carousel.style.setProperty("--review-visible", String(visibleCount));

      const before = originalSlides.slice(-cloneCount).map((slide) => {
        const clone = slide.cloneNode(true);
        clone.removeAttribute("data-review-slide");
        clone.setAttribute("aria-hidden", "true");
        clone.dataset.reviewClone = "true";
        return clone;
      });
      const after = originalSlides.slice(0, cloneCount).map((slide) => {
        const clone = slide.cloneNode(true);
        clone.removeAttribute("data-review-slide");
        clone.setAttribute("aria-hidden", "true");
        clone.dataset.reviewClone = "true";
        return clone;
      });

      track.replaceChildren(...before, ...originalSlides, ...after);
      position = cloneCount + currentIndex;
      requestAnimationFrame(() => renderPosition(false));
      startAutoplay();
    };

    previousButton.addEventListener("click", () => {
      pauseAfterManualAction();
      move(-1, true);
    });
    nextButton.addEventListener("click", () => {
      pauseAfterManualAction();
      move(1, true);
    });

    viewport.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      pauseAfterManualAction();
      if (event.key === "ArrowLeft") move(-1, true);
      if (event.key === "ArrowRight") move(1, true);
      if (event.key === "Home") goToIndex(0, true);
      if (event.key === "End") goToIndex(total - 1, true);
    });

    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      isDragging = true;
      dragStartX = event.clientX;
      dragOffset = 0;
      viewport.classList.add("is-dragging");
      viewport.setPointerCapture(event.pointerId);
      pauseAfterManualAction();
      setTransition(false);
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!isDragging) return;
      dragOffset = event.clientX - dragStartX;
      renderPosition(false, dragOffset);
    });

    const finishDrag = (event) => {
      if (!isDragging) return;
      isDragging = false;
      viewport.classList.remove("is-dragging");
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      const threshold = Math.min(DRAG_THRESHOLD, viewport.clientWidth * 0.12);
      if (Math.abs(dragOffset) >= threshold) move(dragOffset < 0 ? 1 : -1, true);
      else renderPosition(true);
      dragOffset = 0;
    };
    viewport.addEventListener("pointerup", finishDrag);
    viewport.addEventListener("pointercancel", finishDrag);

    track.addEventListener("transitionend", normalizePosition);
    carousel.addEventListener("mouseenter", () => {
      isHovered = true;
      stopAutoplay();
    });
    carousel.addEventListener("mouseleave", () => {
      isHovered = false;
      startAutoplay();
    });
    carousel.addEventListener("focusin", () => {
      hasFocus = true;
      stopAutoplay();
    });
    carousel.addEventListener("focusout", (event) => {
      if (carousel.contains(event.relatedTarget)) return;
      hasFocus = false;
      startAutoplay();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAutoplay();
      else startAutoplay();
    });
    reducedMotion.addEventListener("change", startAutoplay);
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (visibleCount !== visibleCountForWidth()) rebuild();
        else renderPosition(false);
      }, 150);
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        isVisible = entries[0].isIntersecting;
        if (isVisible) startAutoplay();
        else stopAutoplay();
      }, { threshold: 0.25 });
      observer.observe(carousel);
    } else {
      isVisible = true;
    }

    rebuild();
  });
})();
