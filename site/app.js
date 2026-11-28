(function () {
  "use strict";

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 4.0;
  const ZOOM_STEP = 1.25;
  const STAGE_PADDING = 28;

  const state = {
    manifest: null,
    mode: "all", // "all" | "focus"
    query: "",
    activeIndex: 0,
    filtered: [],
    controllers: new Map(),
    lightboxController: null,
    lightboxDiagram: null,
  };

  const els = {
    chapterRail: document.getElementById("chapter-rail"),
    drawerBackdrop: document.getElementById("drawer-backdrop"),
    mobileMenuBtn: document.getElementById("mobile-menu-btn"),
    mobileThemeBtn: document.getElementById("mobile-theme-btn"),
    desktopThemeBtn: document.getElementById("desktop-theme-btn"),
    themeLabel: document.getElementById("theme-label"),
    railCount: document.getElementById("rail-count"),
    filterStatus: document.getElementById("filter-status"),
    chapterList: document.getElementById("chapter-list"),
    searchInput: document.getElementById("diagram-search"),
    docMeta: document.getElementById("doc-meta"),
    buildTimestamp: document.getElementById("build-timestamp"),
    modeAllBtn: document.getElementById("mode-all-btn"),
    modeFocusBtn: document.getElementById("mode-focus-btn"),
    diagramStream: document.getElementById("diagram-stream"),
    emptyState: document.getElementById("empty-state"),
    emptyStateText: document.getElementById("empty-state-text"),
    clearSearchBtn: document.getElementById("clear-search-btn"),
    readerPager: document.getElementById("reader-pager"),
    pagerPrevBtn: document.getElementById("pager-prev-btn"),
    pagerNextBtn: document.getElementById("pager-next-btn"),
    pagerStatus: document.getElementById("pager-status"),
    lightbox: document.getElementById("lightbox"),
    lightboxIndex: document.getElementById("lightbox-index"),
    lightboxTitle: document.getElementById("lightbox-title"),
    lightboxStage: document.getElementById("lightbox-stage"),
    lightboxCanvas: document.getElementById("lightbox-canvas"),
    lightboxImg: document.getElementById("lightbox-img"),
    lbZoomOut: document.getElementById("lb-zoom-out"),
    lbZoomIn: document.getElementById("lb-zoom-in"),
    lbZoomVal: document.getElementById("lb-zoom-val"),
    lbZoomFit: document.getElementById("lb-zoom-fit"),
    lbCopyBtn: document.getElementById("lb-copy-btn"),
    lbDownloadBtn: document.getElementById("lb-download-btn"),
    lbCloseBtn: document.getElementById("lb-close-btn"),
  };

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function createPanZoomController(stageEl, canvasEl, imgEl, readoutEl, options) {
    const opts = Object.assign(
      {
        wheelWithoutModifier: false,
        inlineReadableFit: false,
        naturalWidth: 1000,
        naturalHeight: 700,
      },
      options
    );

    const ctrl = {
      zoom: 1,
      fitZoom: 1,
      tx: 0,
      ty: 0,
      naturalWidth: opts.naturalWidth || 1000,
      naturalHeight: opts.naturalHeight || 700,
      dragging: false,
      startX: 0,
      startY: 0,
      originTx: 0,
      originTy: 0,
    };

    function applyTransform() {
      const renderedWidth = Math.max(80, Math.round(ctrl.naturalWidth * ctrl.zoom));
      imgEl.style.width = renderedWidth + "px";
      canvasEl.style.transform = `translate3d(${Math.round(ctrl.tx)}px, ${Math.round(ctrl.ty)}px, 0)`;
      if (readoutEl) {
        readoutEl.textContent = Math.round(ctrl.zoom * 100) + "%";
      }
    }

    function fit() {
      const rect = stageEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const availW = Math.max(120, rect.width - STAGE_PADDING * 2);
      const availH = Math.max(120, rect.height - STAGE_PADDING * 2);
      const scaleW = availW / ctrl.naturalWidth;
      const scaleH = availH / ctrl.naturalHeight;
      const fitBoth = Math.min(scaleW, scaleH, 1.15);

      let targetScale = clamp(fitBoth, MIN_ZOOM, MAX_ZOOM);
      let alignTop = false;

      if (opts.inlineReadableFit && fitBoth < 0.58) {
        const readableFloor = Math.min(0.58, scaleW);
        targetScale = clamp(Math.min(scaleW, 0.8), Math.min(MIN_ZOOM, readableFloor), 1.0);
        alignTop = true;
      }

      ctrl.fitZoom = targetScale;
      ctrl.zoom = targetScale;
      const contentW = ctrl.naturalWidth * ctrl.zoom + STAGE_PADDING * 2;
      const contentH = ctrl.naturalHeight * ctrl.zoom + STAGE_PADDING * 2;
      ctrl.tx = (rect.width - contentW) / 2;
      ctrl.ty = alignTop ? 0 : Math.max(0, (rect.height - contentH) / 2);
      applyTransform();
    }

    function zoomAround(nextZoom, clientX, clientY) {
      const rect = stageEl.getBoundingClientRect();
      const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(clamped - ctrl.zoom) < 0.001) {
        return;
      }
      const px = (clientX !== undefined ? clientX - rect.left : rect.width / 2);
      const py = (clientY !== undefined ? clientY - rect.top : rect.height / 2);

      const ratio = clamped / ctrl.zoom;
      ctrl.tx = px - (px - ctrl.tx) * ratio;
      ctrl.ty = py - (py - ctrl.ty) * ratio;
      ctrl.zoom = clamped;
      applyTransform();
    }

    stageEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) {
        return;
      }
      ctrl.dragging = true;
      ctrl.startX = e.clientX;
      ctrl.startY = e.clientY;
      ctrl.originTx = ctrl.tx;
      ctrl.originTy = ctrl.ty;
      stageEl.classList.add("is-dragging");
      stageEl.setPointerCapture(e.pointerId);
    });

    stageEl.addEventListener("pointermove", (e) => {
      if (!ctrl.dragging) {
        return;
      }
      ctrl.tx = ctrl.originTx + (e.clientX - ctrl.startX);
      ctrl.ty = ctrl.originTy + (e.clientY - ctrl.startY);
      applyTransform();
    });

    function stopDrag(e) {
      if (!ctrl.dragging) {
        return;
      }
      ctrl.dragging = false;
      stageEl.classList.remove("is-dragging");
      if (stageEl.hasPointerCapture(e.pointerId)) {
        stageEl.releasePointerCapture(e.pointerId);
      }
    }

    stageEl.addEventListener("pointerup", stopDrag);
    stageEl.addEventListener("pointercancel", stopDrag);

    stageEl.addEventListener(
      "wheel",
      (e) => {
        if (!opts.wheelWithoutModifier && !e.ctrlKey && !e.metaKey) {
          return;
        }
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
        zoomAround(ctrl.zoom * factor, e.clientX, e.clientY);
      },
      { passive: false }
    );

    stageEl.addEventListener("dblclick", (e) => {
      if (Math.abs(ctrl.zoom - ctrl.fitZoom) < 0.08) {
        zoomAround(clamp(ctrl.fitZoom * 1.75, MIN_ZOOM, MAX_ZOOM), e.clientX, e.clientY);
      } else {
        fit();
      }
    });

    return {
      fit,
      zoomIn: () => zoomAround(ctrl.zoom * ZOOM_STEP),
      zoomOut: () => zoomAround(ctrl.zoom / ZOOM_STEP),
      setDimensions: (w, h) => {
        ctrl.naturalWidth = w || 1000;
        ctrl.naturalHeight = h || 700;
      },
    };
  }

  async function copyText(text, buttonEl) {
    const original = buttonEl.textContent;
    try {
      await navigator.clipboard.writeText(text);
      buttonEl.textContent = "Copied";
      buttonEl.classList.add("is-active");
    } catch (_) {
      buttonEl.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      buttonEl.textContent = original;
      buttonEl.classList.remove("is-active");
    }, 1500);
  }

  function updateThemeUI() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    els.themeLabel.textContent = isDark ? "Light" : "Dark";
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const next = isDark ? "light" : "dark";
    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("hydro-usv-theme", next);
    } catch (_) {}
    updateThemeUI();
  }

  function setDrawerOpen(open) {
    els.chapterRail.classList.toggle("is-open", open);
    els.drawerBackdrop.classList.toggle("is-open", open);
    els.mobileMenuBtn.setAttribute("aria-expanded", String(open));
  }

  function openLightbox(diagram) {
    state.lightboxDiagram = diagram;
    els.lightboxIndex.textContent = diagram.number;
    els.lightboxTitle.textContent = diagram.title;
    els.lightboxImg.src = diagram.svgPath;
    els.lightboxImg.alt = `${diagram.title} architecture diagram`;
    els.lbDownloadBtn.href = diagram.svgPath;
    els.lbDownloadBtn.setAttribute("download", `${diagram.slug}.svg`);

    if (!state.lightboxController) {
      state.lightboxController = createPanZoomController(
        els.lightboxStage,
        els.lightboxCanvas,
        els.lightboxImg,
        els.lbZoomVal,
        {
          wheelWithoutModifier: true,
          naturalWidth: diagram.width,
          naturalHeight: diagram.height,
        }
      );
    } else {
      state.lightboxController.setDimensions(diagram.width, diagram.height);
    }

    els.lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => state.lightboxController.fit());
    els.lbCloseBtn.focus();
  }

  function closeLightbox() {
    if (els.lightbox.hidden) {
      return;
    }
    els.lightbox.hidden = true;
    document.body.style.overflow = "";
    state.lightboxDiagram = null;
  }

  function buildPlateElement(diagram) {
    const article = document.createElement("article");
    article.className = "plate";
    article.id = diagram.slug;
    article.dataset.slug = diagram.slug;

    const subgraphSummary =
      diagram.subgraphs && diagram.subgraphs.length > 0
        ? `${diagram.subgraphs.length} groups`
        : "single flow";

    article.innerHTML = `
      <header class="plate__head">
        <div class="plate__title-group">
          <div class="plate__heading-row">
            <span class="plate__index">${diagram.number}</span>
            <h2 class="plate__title"></h2>
          </div>
          <p class="plate__meta">
            <span>${diagram.diagramType}</span>
            <span>·</span>
            <span>${diagram.edgeCount} transitions</span>
            <span>·</span>
            <span>${subgraphSummary}</span>
          </p>
        </div>
        <div class="plate__actions">
          <div class="zoom-group" role="group" aria-label="Zoom controls for ${diagram.title}">
            <button type="button" class="btn btn--icon" data-action="zoom-out" aria-label="Zoom out">−</button>
            <span class="zoom-readout" data-role="zoom-val">100%</span>
            <button type="button" class="btn btn--icon" data-action="zoom-in" aria-label="Zoom in">+</button>
            <button type="button" class="btn" data-action="zoom-fit">Fit</button>
          </div>
          <button type="button" class="btn" data-action="inspect">Inspect</button>
          <button type="button" class="btn" data-action="source" aria-expanded="false">Source</button>
          <button type="button" class="btn" data-action="copy">Copy</button>
          <a class="btn" href="${diagram.svgPath}" download="${diagram.slug}.svg">SVG</a>
        </div>
      </header>
      <div class="plate__stage" data-role="stage">
        <div class="plate__canvas" data-role="canvas">
          <img
            class="plate__img"
            src="${diagram.svgPath}"
            alt="${diagram.title} Mermaid diagram"
            loading="eager"
            draggable="false"
            data-role="img"
          />
        </div>
      </div>
      <div class="plate__foot">
        <span>Drag to pan · Ctrl+Scroll to zoom · Double-click to zoom</span>
        <span>${diagram.width} × ${diagram.height} px vector</span>
      </div>
      <div class="plate__source" data-role="source-panel" hidden>
        <div class="plate__source-bar">
          <span>${diagram.mmdPath}</span>
          <span>${diagram.lineCount} lines</span>
        </div>
        <pre class="plate__pre"><code data-role="source-code"></code></pre>
      </div>
    `;

    article.querySelector(".plate__title").textContent = diagram.title;
    article.querySelector('[data-role="source-code"]').textContent = diagram.source;

    const stageEl = article.querySelector('[data-role="stage"]');
    const canvasEl = article.querySelector('[data-role="canvas"]');
    const imgEl = article.querySelector('[data-role="img"]');
    const zoomValEl = article.querySelector('[data-role="zoom-val"]');
    const sourcePanel = article.querySelector('[data-role="source-panel"]');

    const controller = createPanZoomController(stageEl, canvasEl, imgEl, zoomValEl, {
      wheelWithoutModifier: false,
      inlineReadableFit: true,
      naturalWidth: diagram.width,
      naturalHeight: diagram.height,
    });
    state.controllers.set(diagram.slug, controller);

    article.querySelector('[data-action="zoom-in"]').addEventListener("click", () => controller.zoomIn());
    article.querySelector('[data-action="zoom-out"]').addEventListener("click", () => controller.zoomOut());
    article.querySelector('[data-action="zoom-fit"]').addEventListener("click", () => controller.fit());
    article.querySelector('[data-action="inspect"]').addEventListener("click", () => openLightbox(diagram));

    const sourceBtn = article.querySelector('[data-action="source"]');
    sourceBtn.addEventListener("click", () => {
      const opening = sourcePanel.hidden;
      sourcePanel.hidden = !opening;
      sourceBtn.classList.toggle("is-active", opening);
      sourceBtn.setAttribute("aria-expanded", String(opening));
    });

    const copyBtn = article.querySelector('[data-action="copy"]');
    copyBtn.addEventListener("click", () => copyText(diagram.source, copyBtn));

    return article;
  }

  function updateActiveChapterHighlight(activeSlug) {
    const buttons = els.chapterList.querySelectorAll(".chapter-link");
    buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.slug === activeSlug);
    });
  }

  function renderChapters() {
    const matchedSlugs = new Set(state.filtered.map((d) => d.slug));
    els.chapterList.innerHTML = "";

    state.manifest.diagrams.forEach((diagram) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chapter-link";
      btn.dataset.slug = diagram.slug;

      if (state.query && !matchedSlugs.has(diagram.slug)) {
        btn.classList.add("is-dimmed");
      }

      const numSpan = document.createElement("span");
      numSpan.className = "chapter-link__num";
      numSpan.textContent = diagram.number;

      const titleSpan = document.createElement("span");
      titleSpan.textContent = diagram.title;

      btn.appendChild(numSpan);
      btn.appendChild(titleSpan);

      btn.addEventListener("click", () => {
        if (state.query && !matchedSlugs.has(diagram.slug)) {
          state.query = "";
          els.searchInput.value = "";
          applyFilterAndRender(diagram.slug);
        } else {
          jumpToDiagram(diagram.slug);
        }
        setDrawerOpen(false);
      });

      li.appendChild(btn);
      els.chapterList.appendChild(li);
    });

    els.filterStatus.textContent = state.query
      ? `${state.filtered.length}/${state.manifest.diagrams.length}`
      : `${state.manifest.diagrams.length}`;
  }

  function jumpToDiagram(slug) {
    const idx = state.filtered.findIndex((d) => d.slug === slug);
    if (idx === -1) {
      return;
    }
    state.activeIndex = idx;
    if (state.mode === "focus") {
      renderStream();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const target = document.getElementById(slug);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      updateActiveChapterHighlight(slug);
    }
    history.replaceState(null, "", `#${slug}`);
  }

  let observer = null;

  function attachScrollSpy() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (state.mode !== "all" || !("IntersectionObserver" in window)) {
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          const slug = visible[0].target.dataset.slug;
          updateActiveChapterHighlight(slug);
        }
      },
      { rootMargin: "-15% 0px -65% 0px", threshold: [0.1, 0.35, 0.6] }
    );

    els.diagramStream.querySelectorAll(".plate").forEach((el) => observer.observe(el));
  }

  function renderStream() {
    state.controllers.clear();
    els.diagramStream.innerHTML = "";

    if (state.filtered.length === 0) {
      els.emptyState.hidden = false;
      els.emptyStateText.textContent = `No diagrams matched "${state.query}". Try CUDA, COLREGS, EKF, MBES, LiDAR, MAVLink, or Battery.`;
      els.readerPager.hidden = true;
      return;
    }

    els.emptyState.hidden = true;
    state.activeIndex = clamp(state.activeIndex, 0, state.filtered.length - 1);

    const visibleDiagrams =
      state.mode === "focus"
        ? [state.filtered[state.activeIndex]]
        : state.filtered;

    const fragment = document.createDocumentFragment();
    visibleDiagrams.forEach((diagram) => {
      fragment.appendChild(buildPlateElement(diagram));
    });
    els.diagramStream.appendChild(fragment);

    requestAnimationFrame(() => {
      state.controllers.forEach((ctrl) => ctrl.fit());
    });

    if (state.mode === "focus") {
      els.readerPager.hidden = false;
      els.pagerPrevBtn.disabled = state.activeIndex === 0;
      els.pagerNextBtn.disabled = state.activeIndex === state.filtered.length - 1;
      els.pagerStatus.textContent = `${state.activeIndex + 1} / ${state.filtered.length} · ${visibleDiagrams[0].title}`;
      updateActiveChapterHighlight(visibleDiagrams[0].slug);
    } else {
      els.readerPager.hidden = true;
      updateActiveChapterHighlight(state.filtered[state.activeIndex].slug);
      attachScrollSpy();
    }
  }

  function applyFilterAndRender(targetSlug) {
    const q = state.query.trim().toLowerCase();
    state.filtered = q
      ? state.manifest.diagrams.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.searchText.includes(q) ||
            d.number === q
        )
      : state.manifest.diagrams.slice();

    if (targetSlug) {
      const idx = state.filtered.findIndex((d) => d.slug === targetSlug);
      if (idx !== -1) {
        state.activeIndex = idx;
      }
    }

    renderChapters();
    renderStream();
  }

  function setMode(nextMode) {
    state.mode = nextMode;
    els.modeAllBtn.setAttribute("aria-pressed", String(nextMode === "all"));
    els.modeFocusBtn.setAttribute("aria-pressed", String(nextMode === "focus"));
    renderStream();
  }

  function bindGlobalEvents() {
    els.mobileMenuBtn.addEventListener("click", () => {
      setDrawerOpen(!els.chapterRail.classList.contains("is-open"));
    });
    els.drawerBackdrop.addEventListener("click", () => setDrawerOpen(false));
    els.mobileThemeBtn.addEventListener("click", toggleTheme);
    els.desktopThemeBtn.addEventListener("click", toggleTheme);

    els.modeAllBtn.addEventListener("click", () => setMode("all"));
    els.modeFocusBtn.addEventListener("click", () => setMode("focus"));

    els.searchInput.addEventListener("input", () => {
      state.query = els.searchInput.value;
      state.activeIndex = 0;
      applyFilterAndRender();
    });

    els.clearSearchBtn.addEventListener("click", () => {
      state.query = "";
      els.searchInput.value = "";
      applyFilterAndRender();
      els.searchInput.focus();
    });

    els.pagerPrevBtn.addEventListener("click", () => {
      if (state.activeIndex > 0) {
        state.activeIndex -= 1;
        renderStream();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    els.pagerNextBtn.addEventListener("click", () => {
      if (state.activeIndex < state.filtered.length - 1) {
        state.activeIndex += 1;
        renderStream();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    els.lbZoomIn.addEventListener("click", () => state.lightboxController?.zoomIn());
    els.lbZoomOut.addEventListener("click", () => state.lightboxController?.zoomOut());
    els.lbZoomFit.addEventListener("click", () => state.lightboxController?.fit());
    els.lbCloseBtn.addEventListener("click", closeLightbox);
    els.lbCopyBtn.addEventListener("click", () => {
      if (state.lightboxDiagram) {
        copyText(state.lightboxDiagram.source, els.lbCopyBtn);
      }
    });

    window.addEventListener("resize", () => {
      state.controllers.forEach((ctrl) => ctrl.fit());
      if (!els.lightbox.hidden) {
        state.lightboxController?.fit();
      }
    });

    document.addEventListener("keydown", (e) => {
      const targetTag = (e.target && e.target.tagName) || "";
      const isTyping = targetTag === "INPUT" || targetTag === "TEXTAREA";

      if (e.key === "Escape") {
        if (!els.lightbox.hidden) {
          closeLightbox();
          return;
        }
        if (els.chapterRail.classList.contains("is-open")) {
          setDrawerOpen(false);
          return;
        }
        if (document.activeElement === els.searchInput && els.searchInput.value) {
          state.query = "";
          els.searchInput.value = "";
          applyFilterAndRender();
        }
        return;
      }

      if (!els.lightbox.hidden) {
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          state.lightboxController?.zoomIn();
        } else if (e.key === "-") {
          e.preventDefault();
          state.lightboxController?.zoomOut();
        } else if (e.key === "0") {
          e.preventDefault();
          state.lightboxController?.fit();
        }
        return;
      }

      if (isTyping) {
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        els.searchInput.focus();
        return;
      }

      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        const targetDiagram = state.manifest.diagrams[idx];
        if (targetDiagram) {
          jumpToDiagram(targetDiagram.slug);
        }
        return;
      }

      if (state.mode === "focus" && e.key === "ArrowLeft" && state.activeIndex > 0) {
        state.activeIndex -= 1;
        renderStream();
      } else if (
        state.mode === "focus" &&
        e.key === "ArrowRight" &&
        state.activeIndex < state.filtered.length - 1
      ) {
        state.activeIndex += 1;
        renderStream();
      }
    });
  }

  async function init() {
    updateThemeUI();

    const manifestEl = document.getElementById("diagram-manifest");
    if (manifestEl && manifestEl.textContent.trim().startsWith("{")) {
      state.manifest = JSON.parse(manifestEl.textContent);
    } else {
      const res = await fetch("diagrams/manifest.json");
      state.manifest = await res.json();
    }

    const count = state.manifest.diagrams.length;
    els.railCount.textContent = `${count} Architecture Plates`;
    els.docMeta.textContent = `${count} SVG diagrams · Single source: README.md`;

    if (state.manifest.generatedAt) {
      const dt = new Date(state.manifest.generatedAt);
      if (!Number.isNaN(dt.getTime())) {
        els.buildTimestamp.textContent = `Built ${dt.toISOString().slice(0, 10)}`;
      }
    }

    bindGlobalEvents();

    const initialHash = window.location.hash.replace(/^#/, "");
    applyFilterAndRender(initialHash || undefined);

    if (initialHash) {
      requestAnimationFrame(() => jumpToDiagram(initialHash));
    }
  }

  init().catch((err) => {
    console.error("Failed to initialize Architecture Atlas:", err);
  });
})();
