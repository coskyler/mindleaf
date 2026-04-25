const GRAPH_STORAGE_KEY = "graphs";
const NAME_MODEL = "gpt-5.4-nano";
const GRAPH_MODEL = "gpt-5.5";
const MAX_TEXT_LENGTH = 60000;

const homeView = document.querySelector("#home-view");
const detailView = document.querySelector("#detail-view");
const newGraphButton = document.querySelector("#new-graph-button");
const backButton = document.querySelector("#back-button");
const graphList = document.querySelector("#graph-list");
const emptyState = document.querySelector("#empty-state");
const graphCount = document.querySelector("#graph-count");
const detailTitle = document.querySelector("#detail-title");
const detailStatus = document.querySelector("#detail-status");
const updateGraphButton = document.querySelector("#update-graph-button");
const graphVisual = document.querySelector("#graph-visual");
const graphJson = document.querySelector("#graph-json");

let graphs = [];
let graphView = null;

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const timeUnits = [
  ["year", 31536000000],
  ["month", 2592000000],
  ["week", 604800000],
  ["day", 86400000],
  ["hour", 3600000],
  ["minute", 60000],
  ["second", 1000],
];

function parseJson(value, fallback = null) {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function formatRelativeTime(timestamp) {
  const elapsed = timestamp - Date.now();
  const unit = timeUnits.find(([, ms]) => Math.abs(elapsed) >= ms);

  if (!unit) {
    return "just now";
  }

  return relativeTimeFormatter.format(Math.round(elapsed / unit[1]), unit[0]);
}

function normalizeGraph(graph) {
  if (!graph?.id || !graph?.name || !graph?.graph) {
    return null;
  }

  return {
    id: graph.id,
    name: graph.name,
    last_modified: graph.last_modified ?? Date.now(),
    graph: {
      nodes: cleanOutgoing(graph.graph.nodes ?? {}),
    },
  };
}

function cleanOutgoing(nodes) {
  Object.values(nodes).forEach((node) => {
    node.outgoing = [...new Set(node.outgoing)].filter((target) => nodes[target]);
  });
  return nodes;
}

function normalizeUrl(url) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = "";
    parsedUrl.search = "";
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";
    return parsedUrl.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function dedupe(graphList) {
  return [...new Map(graphList.map((graph) => [graph.id, graph])).values()];
}

async function loadGraphs() {
  const parsedLocalGraphs = parseJson(localStorage.getItem(GRAPH_STORAGE_KEY), []);
  const chromeItems =
    typeof chrome !== "undefined" && chrome.storage?.local
      ? await chrome.storage.local.get(GRAPH_STORAGE_KEY)
      : {};
  const localGraphs = Array.isArray(parsedLocalGraphs) ? parsedLocalGraphs : [];
  const chromeGraphs = Array.isArray(chromeItems[GRAPH_STORAGE_KEY])
    ? chromeItems[GRAPH_STORAGE_KEY]
    : [];

  graphs = dedupe([...localGraphs, ...chromeGraphs])
    .map(normalizeGraph)
    .filter(Boolean)
    .sort((a, b) => b.last_modified - a.last_modified);

  render();
}

async function saveGraphs() {
  graphs = dedupe(graphs).sort((a, b) => b.last_modified - a.last_modified);
  localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(graphs));

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [GRAPH_STORAGE_KEY]: graphs });
  }

  render();
}

function render() {
  renderGraphList();
  renderRoute();
}

function renderGraphList() {
  graphCount.textContent = graphs.length;
  emptyState.hidden = graphs.length > 0;
  graphList.replaceChildren(
    ...graphs.map((graph) => {
      const button = document.createElement("button");
      button.className = "graph-card";
      button.type = "button";
      button.addEventListener("click", () => showGraph(graph.id));

      const name = document.createElement("p");
      name.className = "graph-name";
      name.textContent = graph.name;

      const time = document.createElement("p");
      time.className = "graph-time";
      time.textContent = `Modified ${formatRelativeTime(graph.last_modified)}`;

      const item = document.createElement("li");
      button.append(name, time);
      item.append(button);
      return item;
    }),
  );
}

function showHome() {
  location.hash = "";
  homeView.hidden = false;
  detailView.hidden = true;
}

function showGraph(id) {
  location.hash = `graph=${encodeURIComponent(id)}`;
  renderRoute();
}

function getCurrentGraph() {
  const id = decodeURIComponent(location.hash.match(/^#graph=(.+)$/)?.[1] ?? "");
  return graphs.find((item) => item.id === id);
}

function renderRoute() {
  const id = decodeURIComponent(location.hash.match(/^#graph=(.+)$/)?.[1] ?? "");
  const graph = getCurrentGraph();

  homeView.hidden = Boolean(id);
  detailView.hidden = !id;

  if (!id) {
    return;
  }

  detailTitle.textContent = graph?.name ?? "Graph not found";
  detailStatus.textContent = graph
    ? Object.keys(graph.graph.nodes).length ? "Generated" : "Generating..."
    : "";
  graphJson.textContent = graph ? JSON.stringify(graph, null, 2) : "{}";
  renderGraphVisual(graph?.graph.nodes ?? {});
  updateUpdateButtonVisibility(graph);
}

function refreshUpdateButtonVisibility() {
  updateUpdateButtonVisibility(getCurrentGraph());
}

async function updateUpdateButtonVisibility(graph) {
  updateGraphButton.hidden = true;

  if (!graph || !Object.keys(graph.graph.nodes).length) {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentUrl = normalizeUrl(tab?.url);
  const nodeUrls = Object.values(graph.graph.nodes).map((node) => normalizeUrl(node.url));

  updateGraphButton.hidden = !currentUrl || nodeUrls.includes(currentUrl);
}

function renderGraphVisual(nodes) {
  if (graphView) {
    graphView.destroy();
  }

  graphVisual.replaceChildren();
  graphView = createGraph(graphVisual, nodes, handleNodeClick);
}

async function handleNodeClick(node) {
  if (!node.quote) {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return;
  }

  if (node.url && normalizeUrl(tab.url) !== normalizeUrl(node.url)) {
    const targetTab = await openOrFocusTab(node.url);
    await waitForTabLoad(targetTab.id);
    await highlightQuoteInTab(targetTab.id, node.quote);
    return;
  }

  await highlightQuoteInTab(tab.id, node.quote);
}

async function highlightQuoteInTab(tabId, quote) {
  if (!tabId) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    args: [quote],
    func: (targetQuote) => {
      const selection = getSelection();
      selection.removeAllRanges();

      if (!window.find(targetQuote)) {
        return;
      }

      const range = selection.rangeCount ? selection.getRangeAt(0) : null;
      const endContainer = range?.endContainer;

      if (endContainer?.nodeType === Node.TEXT_NODE) {
        const remainingText = endContainer.nodeValue.slice(range.endOffset);
        const periodIndex = remainingText.indexOf(".");
        range.setEnd(
          endContainer,
          periodIndex >= 0
            ? range.endOffset + periodIndex + 1
            : endContainer.nodeValue.length,
        );
        selection.removeAllRanges();
        selection.addRange(range);
      }

      const rect = range?.getBoundingClientRect();

      if (rect) {
        window.scrollTo({
          top: rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2,
          behavior: "smooth",
        });
      }
    },
  });
}

async function openOrFocusTab(url) {
  const tabs = await chrome.tabs.query({});
  const existingTab = tabs.find((tab) => normalizeUrl(tab.url) === normalizeUrl(url));

  if (existingTab?.id) {
    const updatedTab = await chrome.tabs.update(existingTab.id, { active: true });

    if (existingTab.windowId) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }

    return updatedTab;
  }

  return chrome.tabs.create({ url });
}

async function waitForTabLoad(tabId) {
  const tab = await chrome.tabs.get(tabId);

  if (tab.status === "complete") {
    return;
  }

  await new Promise((resolve) => {
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function createNewGraph() {
  newGraphButton.disabled = true;
  newGraphButton.textContent = "Generating...";

  const graph = {
    id: crypto.randomUUID(),
    name: "Generating graph...",
    last_modified: Date.now(),
    graph: { nodes: {} },
  };

  graphs = [graph, ...graphs];
  await saveGraphs();
  showGraph(graph.id);

  try {
    const [apiKey, page] = await Promise.all([loadApiKey(), getVisiblePage()]);

    graph.name = await generateGraphName(apiKey, page.text);
    graph.last_modified = Date.now();
    await saveGraphs();

    graph.graph = buildStoredGraph(
      await generateKnowledgeGraph(apiKey, page.text),
      page.url,
    );
    graph.last_modified = Date.now();
    await saveGraphs();
  } catch (error) {
    detailStatus.textContent = error.message;
  } finally {
    newGraphButton.disabled = false;
    newGraphButton.textContent = "New graph";
  }
}

async function updateCurrentGraph() {
  const graphId = decodeURIComponent(location.hash.match(/^#graph=(.+)$/)?.[1] ?? "");
  const graph = graphs.find((item) => item.id === graphId);

  if (!graph) {
    return;
  }

  updateGraphButton.disabled = true;
  updateGraphButton.textContent = "Updating...";

  try {
    const [apiKey, page] = await Promise.all([loadApiKey(), getVisiblePage()]);
    const generatedGraph = await generateUpdatedKnowledgeGraph(apiKey, page.text, graph);
    graph.graph = buildStoredGraph(generatedGraph, page.url, graph.graph.nodes);
    graph.last_modified = Date.now();
    await saveGraphs();
  } catch (error) {
    detailStatus.textContent = error.message;
  } finally {
    updateGraphButton.disabled = false;
    updateGraphButton.textContent = "Update graph";
    updateUpdateButtonVisibility(graph);
  }
}

async function loadApiKey() {
  const response = await fetch(chrome.runtime.getURL("config.json"));
  const config = response.ok ? await response.json() : {};

  if (!config.OPENAI_API_KEY) {
    throw new Error("config.json must include OPENAI_API_KEY");
  }

  return config.OPENAI_API_KEY;
}

async function loadPrompt(path) {
  const response = await fetch(chrome.runtime.getURL(path));

  if (!response.ok) {
    throw new Error(`Missing prompt file: ${path}`);
  }

  return response.text();
}

async function getVisiblePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error("No active tab found");
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "",
  });

  const text = String(result?.result ?? "").slice(0, MAX_TEXT_LENGTH);

  if (!text) {
    throw new Error("No visible text found on the current page");
  }

  return {
    text,
    url: normalizeUrl(tab.url),
  };
}

async function generateGraphName(apiKey, pageText) {
  const systemPrompt = await loadPrompt("prompts/graph_name_system.txt");

  const data = await createResponse(apiKey, {
    model: NAME_MODEL,
    input: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Visible webpage text:\n${pageText}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "graph_title",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        },
      },
    },
  });

  return parseResponseJson(data).name;
}

async function generateKnowledgeGraph(apiKey, pageText) {
  const systemPrompt = await loadPrompt("prompts/knowledge_graph_system.txt");

  const data = await createResponse(apiKey, {
    model: GRAPH_MODEL,
    input: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Visible webpage text:\n${pageText}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "knowledge_graph_adjacency_list",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            nodes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  quote: { type: "string" },
                  outgoing: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["name", "quote", "outgoing"],
              },
            },
          },
          required: ["nodes"],
        },
      },
    },
  });

  return parseResponseJson(data);
}

async function generateUpdatedKnowledgeGraph(apiKey, pageText, graph) {
  const systemPrompt = await loadPrompt("prompts/knowledge_graph_update_system copy.txt");

  const data = await createResponse(apiKey, {
    model: GRAPH_MODEL,
    input: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content:
          `Current graph JSON:\n${JSON.stringify(graph, null, 2)}\n\nVisible webpage text:\n${pageText}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "knowledge_graph_adjacency_list",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            nodes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  quote: { type: "string" },
                  outgoing: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["name", "quote", "outgoing"],
              },
            },
          },
          required: ["nodes"],
        },
      },
    },
  });

  return parseResponseJson(data);
}

async function createResponse(apiKey, body) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${await response.text()}`);
  }

  return response.json();
}

function parseResponseJson(response) {
  const outputText =
    response.output_text ??
    response.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === "output_text")?.text;

  if (!outputText) {
    throw new Error("OpenAI response did not include text output");
  }

  return JSON.parse(outputText);
}

function buildStoredGraph(generatedGraph, url, existingNodes = {}) {
  const nodes = Object.fromEntries(
    (generatedGraph.nodes ?? []).flatMap((node) => {
      const name = String(node.name ?? "").trim();

      if (!name) {
        return [];
      }

      return [
        [
          name,
          {
            quote: String(node.quote ?? "").trim(),
            url: existingNodes[name]?.url ?? url,
            outgoing: Array.isArray(node.outgoing)
              ? node.outgoing.map((target) => String(target).trim()).filter(Boolean)
              : [],
          },
        ],
      ];
    }),
  );

  return { nodes: cleanOutgoing(nodes) };
}

newGraphButton.addEventListener("click", createNewGraph);
updateGraphButton.addEventListener("click", updateCurrentGraph);
backButton.addEventListener("click", showHome);
window.addEventListener("hashchange", renderRoute);
chrome.tabs.onActivated.addListener(refreshUpdateButtonVisibility);
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    refreshUpdateButtonVisibility();
  }
});

loadGraphs();
