const GRAPH_STORAGE_KEY = "graphs";
const NAME_MODEL = "gpt-5.4-nano";
const GRAPH_MODEL = "gpt-5.5";
const MAX_DOM_LENGTH = 100000;

const homeView = document.querySelector("#home-view");
const detailView = document.querySelector("#detail-view");
const newGraphButton = document.querySelector("#new-graph-button");
const backButton = document.querySelector("#back-button");
const graphList = document.querySelector("#graph-list");
const emptyState = document.querySelector("#empty-state");
const graphCount = document.querySelector("#graph-count");
const detailTitle = document.querySelector("#detail-title");
const detailStatus = document.querySelector("#detail-status");
const graphJson = document.querySelector("#graph-json");

let graphs = [];

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

  if (Array.isArray(graph.graph.nodes) && Array.isArray(graph.graph.edges)) {
    return normalizeEdgeListGraph(graph);
  }

  return {
    id: graph.id,
    name: graph.name,
    last_modified: graph.last_modified ?? Date.now(),
    graph: {
      nodes: normalizeNodeMap(graph.graph.nodes ?? {}),
    },
  };
}

function normalizeEdgeListGraph(graph) {
  const nodes = Object.fromEntries(
    graph.graph.nodes.map((node) => [
      node.name,
      {
        selector: node.selector ?? "",
        outgoing: [],
      },
    ]),
  );

  graph.graph.edges.forEach((edge) => {
    if (nodes[edge.from] && nodes[edge.to]) {
      nodes[edge.from].outgoing.push(edge.to);
    }
  });

  return {
    id: graph.id,
    name: graph.name,
    last_modified: graph.last_modified ?? Date.now(),
    graph: { nodes: cleanOutgoing(nodes) },
  };
}

function normalizeNodeMap(nodes) {
  const normalized = Object.fromEntries(
    Object.entries(nodes).flatMap(([key, node]) => {
      const name = String(node.name ?? key).trim();

      if (!name) {
        return [];
      }

      return [
        [
          name,
          {
            selector: String(node.selector ?? "").trim(),
            outgoing: Array.isArray(node.outgoing)
              ? node.outgoing.map((target) => String(target).trim()).filter(Boolean)
              : [],
          },
        ],
      ];
    }),
  );

  return cleanOutgoing(normalized);
}

function cleanOutgoing(nodes) {
  Object.values(nodes).forEach((node) => {
    node.outgoing = [...new Set(node.outgoing)].filter((target) => nodes[target]);
  });
  return nodes;
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

function renderRoute() {
  const id = decodeURIComponent(location.hash.match(/^#graph=(.+)$/)?.[1] ?? "");
  const graph = graphs.find((item) => item.id === id);

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
    const [apiKey, pageDom] = await Promise.all([loadApiKey(), getPageDom()]);

    graph.name = await generateGraphName(apiKey, pageDom);
    graph.last_modified = Date.now();
    await saveGraphs();

    graph.graph = buildStoredGraph(await generateKnowledgeGraph(apiKey, pageDom));
    graph.last_modified = Date.now();
    await saveGraphs();
  } catch (error) {
    detailStatus.textContent = error.message;
  } finally {
    newGraphButton.disabled = false;
    newGraphButton.textContent = "New graph";
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

async function getPageDom() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error("No active tab found");
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const selectorAttribute = "data-mindleaf-selector";
      const elements = [...document.documentElement.querySelectorAll("*")];

      function escapeSelectorPart(value) {
        return window.CSS?.escape
          ? CSS.escape(value)
          : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
      }

      function getSelector(element) {
        if (element.id) {
          return `#${escapeSelectorPart(element.id)}`;
        }

        const parts = [];
        let current = element;

        while (current && current !== document.documentElement) {
          const siblings = [...current.parentElement.children].filter(
            (sibling) => sibling.tagName === current.tagName,
          );
          parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`);
          current = current.parentElement;
        }

        return parts.join(" > ");
      }

      try {
        elements.forEach((element) => {
          element.setAttribute(selectorAttribute, getSelector(element));
        });

        const clone = document.documentElement.cloneNode(true);
        clone.querySelectorAll("script, style, noscript, template").forEach((element) => element.remove());
        clone.querySelectorAll("*").forEach((element) => {
          [...element.attributes].forEach((attribute) => {
            if (
              attribute.name.startsWith("on") ||
              attribute.name === "srcset" ||
              attribute.name === "style"
            ) {
              element.removeAttribute(attribute.name);
            }
          });
        });

        return clone.outerHTML.replace(/\s+/g, " ").trim();
      } finally {
        elements.forEach((element) => element.removeAttribute(selectorAttribute));
      }
    },
  });

  const dom = String(result?.result ?? "").slice(0, MAX_DOM_LENGTH);

  if (!dom) {
    throw new Error("No DOM found on the current page");
  }

  return dom;
}

async function generateGraphName(apiKey, pageDom) {
  const data = await createResponse(apiKey, {
    model: NAME_MODEL,
    input: [
      {
        role: "system",
        content:
          "Create a concise title for a knowledge graph generated from a webpage DOM snapshot. Return JSON only.",
      },
      {
        role: "user",
        content: `Webpage DOM snapshot:\n${pageDom}\n\nReturn a short specific title, 3 to 7 words.`,
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

async function generateKnowledgeGraph(apiKey, pageDom) {
  const data = await createResponse(apiKey, {
    model: GRAPH_MODEL,
    reasoning: { effort: "high" },
    input: [
      {
        role: "system",
        content:
          "Extract a compact knowledge graph from a webpage DOM snapshot. Use only facts stated in visible page content. Return JSON only.",
      },
      {
        role: "user",
        content:
          `Webpage DOM snapshot:\n${pageDom}\n\nEach element includes data-mindleaf-selector with a CSS selector for the original page. Return nodes as an array. Node names must be unique. Do not create node IDs. The selector must be the data-mindleaf-selector value for the element where the node's supporting text appears. Outgoing contains related target node names only. Do not include explanations.`,
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
                  selector: { type: "string" },
                  outgoing: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["name", "selector", "outgoing"],
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

function buildStoredGraph(generatedGraph) {
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
            selector: String(node.selector ?? "").trim(),
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
backButton.addEventListener("click", showHome);
window.addEventListener("hashchange", renderRoute);

loadGraphs();
