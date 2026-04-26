function createLessonBar(container, nodes, onNodeSelect) {
  container._lessonCleanup?.();

  const orderedNames = sortLessons(nodes);
  let activeIndex = -1;
  let windowStart = 0;
  let controlsVisible = false;
  let visibleCount = 1;

  const startButton = createLessonButton("▶", "lesson-start");
  const previousButton = createLessonButton("<", "lesson-arrow");
  const nextButton = createLessonButton(">", "lesson-arrow");
  const steps = document.createElement("div");
  const controls = document.createElement("div");

  steps.className = "lesson-steps";
  controls.className = "lesson-controls";
  previousButton.hidden = true;
  nextButton.hidden = true;

  function selectStep(index, shouldNotify = true) {
    if (!orderedNames[index]) {
      return;
    }

    showLessonControls();
    activeIndex = index;
    updateWindow();
    renderSteps();

    if (shouldNotify) {
      onNodeSelect(orderedNames[activeIndex], nodes[orderedNames[activeIndex]]);
    }
  }

  function showLessonControls() {
    controlsVisible = true;
    startButton.hidden = true;
  }

  function updateWindow() {
    visibleCount = getVisibleStepCount(container, orderedNames.length);
    const centeredStart = activeIndex - Math.floor(visibleCount / 2);
    windowStart = Math.max(0, Math.min(centeredStart, Math.max(0, orderedNames.length - visibleCount)));
  }

  function renderSteps() {
    if (activeIndex < 0) {
      visibleCount = getVisibleStepCount(container, orderedNames.length);
      windowStart = 0;
    }

    steps.style.width = `${visibleCount * 30 + Math.max(0, visibleCount - 1) * 8}px`;
    steps.replaceChildren(
      ...orderedNames.slice(windowStart, windowStart + visibleCount).map((name, offset) => {
        const index = windowStart + offset;
        const button = createLessonButton(index + 1, "lesson-step");
        button.title = name;
        button.classList.toggle("active", index === activeIndex);
        button.addEventListener("click", () => selectStep(index));
        return button;
      }),
    );

    previousButton.hidden = !controlsVisible || activeIndex <= 0;
    nextButton.hidden = !controlsVisible || activeIndex >= orderedNames.length - 1;
  }

  function handleKeyDown(event) {
    if (!controlsVisible) {
      return;
    }

    if (event.key === "ArrowLeft" && activeIndex > 0) {
      event.preventDefault();
      selectStep(activeIndex - 1);
    }

    if (event.key === "ArrowRight" && activeIndex < orderedNames.length - 1) {
      event.preventDefault();
      selectStep(activeIndex + 1);
    }
  }

  function handleResize() {
    updateWindow();
    renderSteps();
  }

  startButton.addEventListener("click", () => {
    selectStep(0);
  });

  previousButton.addEventListener("click", () => selectStep(Math.max(0, activeIndex - 1)));
  nextButton.addEventListener("click", () =>
    selectStep(Math.min(orderedNames.length - 1, activeIndex + 1)),
  );

  renderSteps();
  controls.append(previousButton, steps, nextButton);
  container.replaceChildren(startButton, controls);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", handleResize);
  container._lessonCleanup = () => {
    document.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("resize", handleResize);
  };

  return {
    selectNode(name) {
      selectStep(orderedNames.indexOf(name), false);
    },
  };
}

function getVisibleStepCount(container, totalSteps) {
  const availableWidth = Math.max(30, container.clientWidth - 92);
  const stepStride = 38;
  const count = Math.max(1, Math.floor((availableWidth + 8) / stepStride));
  const oddCount = count % 2 ? count : count - 1;

  return Math.max(1, Math.min(totalSteps, oddCount));
}

function createLessonButton(text, className) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = text;
  return button;
}

function sortLessons(nodes) {
  const names = Object.keys(nodes).sort((a, b) => a.localeCompare(b));
  const indegrees = Object.fromEntries(names.map((name) => [name, 0]));

  names.forEach((name) => {
    (nodes[name].outgoing ?? []).forEach((target) => {
      if (target in indegrees) {
        indegrees[target] += 1;
      }
    });
  });

  const remaining = new Set(names);
  const ordered = [];

  while (remaining.size) {
    const next = [...remaining]
      .filter((name) => indegrees[name] === 0)
      .sort((a, b) => indegrees[a] - indegrees[b] || a.localeCompare(b))[0];
    const name = next ?? [...remaining].sort((a, b) => indegrees[a] - indegrees[b] || a.localeCompare(b))[0];

    ordered.push(name);
    remaining.delete(name);

    (nodes[name].outgoing ?? []).forEach((target) => {
      if (target in indegrees) {
        indegrees[target] -= 1;
      }
    });
  }

  return ordered;
}
