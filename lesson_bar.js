function createLessonBar(container, nodes, onNodeSelect) {
  const orderedNames = sortLessons(nodes);

  container.replaceChildren(
    ...orderedNames.map((name, index) => {
      const button = document.createElement("button");
      button.className = "lesson-step";
      button.type = "button";
      button.textContent = index + 1;
      button.title = name;
      button.addEventListener("click", () => onNodeSelect(name, nodes[name]));
      return button;
    }),
  );
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
