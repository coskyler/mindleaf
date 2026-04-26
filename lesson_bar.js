function createLessonBar(container, nodes, onNodeSelect) {
  const orderedNames = sortLessons(nodes);
  let activeIndex = -1;

  const startButton = createLessonButton("Start lesson", "lesson-start");
  const previousButton = createLessonButton("<", "lesson-arrow");
  const nextButton = createLessonButton(">", "lesson-arrow");
  const steps = document.createElement("div");
  const controls = document.createElement("div");

  steps.className = "lesson-steps";
  controls.className = "lesson-controls";
  previousButton.hidden = true;
  nextButton.hidden = true;

  const stepButtons = orderedNames.map((name, index) => {
    const button = createLessonButton(index + 1, "lesson-step");
    button.title = name;
    button.addEventListener("click", () => selectStep(index));
    return button;
  });

  function selectStep(index) {
    if (!orderedNames[index]) {
      return;
    }

    showLessonControls();
    activeIndex = index;
    stepButtons.forEach((button, buttonIndex) => {
      button.classList.toggle("active", buttonIndex === activeIndex);
    });
    onNodeSelect(orderedNames[activeIndex], nodes[orderedNames[activeIndex]]);
  }

  function showLessonControls() {
    startButton.hidden = true;
    previousButton.hidden = false;
    nextButton.hidden = false;
  }

  startButton.addEventListener("click", () => {
    selectStep(0);
  });

  previousButton.addEventListener("click", () => selectStep(Math.max(0, activeIndex - 1)));
  nextButton.addEventListener("click", () =>
    selectStep(Math.min(orderedNames.length - 1, activeIndex + 1)),
  );

  steps.append(...stepButtons);
  controls.append(previousButton, steps, nextButton);
  container.replaceChildren(startButton, controls);
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
