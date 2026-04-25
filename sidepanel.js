const graphList = document.querySelector("#graph-list");
const emptyState = document.querySelector("#empty-state");
const graphCount = document.querySelector("#graph-count");

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

const timeUnits = [
  ["year", 31536000000],
  ["month", 2592000000],
  ["week", 604800000],
  ["day", 86400000],
  ["hour", 3600000],
  ["minute", 60000],
  ["second", 1000],
];

function isGraph(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.last_modified === "number" &&
    value.graph &&
    Array.isArray(value.graph.nodes) &&
    Array.isArray(value.graph.edges)
  );
}

function formatRelativeTime(timestamp) {
  const elapsed = timestamp - Date.now();
  const absoluteElapsed = Math.abs(elapsed);
  const unit = timeUnits.find(([, milliseconds]) => absoluteElapsed >= milliseconds);

  if (!unit) {
    return "just now";
  }

  const [name, milliseconds] = unit;
  return relativeTimeFormatter.format(Math.round(elapsed / milliseconds), name);
}

function getStoredGraphs(items) {
  const graphs = Object.values(items).flatMap((value) => {
    const parsedValue = parseStoredValue(value);

    if (Array.isArray(value)) {
      return value.filter(isGraph);
    }

    if (Array.isArray(parsedValue)) {
      return parsedValue.filter(isGraph);
    }

    return isGraph(parsedValue) ? [parsedValue] : [];
  });

  return graphs.sort((a, b) => b.last_modified - a.last_modified);
}

function parseStoredValue(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getLocalStorageItems() {
  return Object.fromEntries(
    Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
  );
}

function renderGraphs(graphs) {
  graphCount.textContent = graphs.length;
  emptyState.hidden = graphs.length > 0;
  graphList.replaceChildren(
    ...graphs.map((graph) => {
      const item = document.createElement("li");
      item.className = "graph-card";

      const name = document.createElement("p");
      name.className = "graph-name";
      name.textContent = graph.name;

      const time = document.createElement("p");
      time.className = "graph-time";
      time.textContent = `Modified ${formatRelativeTime(graph.last_modified)}`;

      item.append(name, time);
      return item;
    }),
  );
}

function loadGraphs() {
  const localItems = getLocalStorageItems();

  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    renderGraphs(getStoredGraphs(localItems));
    return;
  }

  chrome.storage.local.get(null, (chromeItems) => {
    renderGraphs(getStoredGraphs({ ...localItems, ...chromeItems }));
  });
}

loadGraphs();
