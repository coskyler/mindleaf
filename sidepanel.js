const GRAPH_STORAGE_KEY = "graphs";
const NAME_MODEL = "gpt-5.4-nano";
const GRAPH_MODEL = "gpt-5.5";
const CONVERSATION_MODEL = "gpt-5.5";
const MAX_TEXT_LENGTH = 60000;

const homeView = document.querySelector("#home-view");
const detailView = document.querySelector("#detail-view");
const newGraphButton = document.querySelector("#new-graph-button");
const backButton = document.querySelector("#back-button");
const graphList = document.querySelector("#graph-list");
const emptyState = document.querySelector("#empty-state");
const graphCount = document.querySelector("#graph-count");
const detailTitle = document.querySelector("#detail-title");
const updateGraphButton = document.querySelector("#update-graph-button");
const graphVisual = document.querySelector("#graph-visual");
const graphLoading = document.querySelector("#graph-loading");
const lessonBar = document.querySelector("#lesson-bar");
const chatMessages = document.querySelector("#chat-messages");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");

let graphs = [];
let graphView = null;
const conversations = {};
const pendingConversationSaves = new Map();

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

async function loadConversation(graphId) {
  if (conversations[graphId]) {
    return conversations[graphId];
  }

  const key = getConversationKey(graphId);
  const localMessages = parseJson(localStorage.getItem(key), []);
  const chromeItems =
    typeof chrome !== "undefined" && chrome.storage?.local
      ? await chrome.storage.local.get(key)
      : {};
  const messages = Array.isArray(chromeItems[key])
    ? chromeItems[key]
    : Array.isArray(localMessages)
      ? localMessages
      : [];

  conversations[graphId] = messages;
  return messages;
}

async function saveConversation(graphId) {
  const key = getConversationKey(graphId);
  const messages = conversations[graphId] ?? [];
  localStorage.setItem(key, JSON.stringify(messages));

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    pendingConversationSaves.set(key, (pendingConversationSaves.get(key) ?? 0) + 1);

    try {
      await chrome.storage.local.set({ [key]: messages });
    } catch (error) {
      markConversationSaveObserved(key);
      throw error;
    }
  }
}

function getConversationKey(graphId) {
  return `${graphId}_conversation`;
}

function getCurrentGraphId() {
  return decodeURIComponent(location.hash.match(/^#graph=(.+)$/)?.[1] ?? "");
}

function markConversationSaveObserved(key) {
  const pendingCount = pendingConversationSaves.get(key) ?? 0;

  if (pendingCount <= 1) {
    pendingConversationSaves.delete(key);
  } else {
    pendingConversationSaves.set(key, pendingCount - 1);
  }
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
  const id = getCurrentGraphId();
  return graphs.find((item) => item.id === id);
}

function renderRoute() {
  const id = getCurrentGraphId();
  const graph = getCurrentGraph();

  homeView.hidden = Boolean(id);
  detailView.hidden = !id;

  if (!id) {
    return;
  }

  detailTitle.textContent = graph?.name ?? "Graph not found";
  renderGraphVisual(graph?.graph.nodes ?? {});
  renderLessonBar(graph?.graph.nodes ?? {});
  renderChat(id);
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
    graphView = null;
  }

  graphVisual.replaceChildren();
  const hasNodes = Object.keys(nodes).length > 0;

  graphLoading.hidden = hasNodes;
  graphVisual.append(graphLoading);

  if (hasNodes) {
    graphView = createGraph(graphVisual, nodes, handleNodeClick, getLessonOrderByName(nodes));
  }
}

function renderLessonBar(nodes) {
  lessonBar.hidden = !Object.keys(nodes).length;
  createLessonBar(lessonBar, nodes, handleLessonClick);
}

function getLessonOrderByName(nodes) {
  return Object.fromEntries(sortLessons(nodes).map((name, index) => [name, index + 1]));
}

async function handleLessonClick(name, node) {
  if (!node) {
    return;
  }

  focusGraphNode(graphView, name);
  await handleNodeClick(node);
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

async function goToQuote(url, quote) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || normalizeUrl(tab.url) !== normalizeUrl(url)) {
    const targetTab = await openOrFocusTab(url);
    await waitForTabLoad(targetTab.id);
    await highlightQuoteInTab(targetTab.id, quote);
    return;
  }

  await highlightQuoteInTab(tab.id, quote);
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const graph = {
    id: crypto.randomUUID(),
    name: "New branch",
    last_modified: Date.now(),
    graph: { nodes: {} },
  };

  graphs = [graph, ...graphs];
  await saveGraphs();
  showGraph(graph.id);

  try {
    await chrome.runtime.sendMessage({
      type: "generateGraph",
      graphId: graph.id,
      tabId: tab?.id,
    });
  } catch (error) {
    console.error(error);
  } finally {
    newGraphButton.disabled = false;
  }
}

async function updateCurrentGraph() {
  const graphId = getCurrentGraphId();
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
    console.error(error);
  } finally {
    updateGraphButton.disabled = false;
    updateGraphButton.textContent = "Update graph";
    updateUpdateButtonVisibility(graph);
  }
}

async function renderChat(graphId) {
  const messages = graphId ? await loadConversation(graphId) : [];

  chatMessages.replaceChildren(
    ...messages.map((message) => {
      const item = document.createElement("div");
      item.className = `chat-message ${message.role}${message.loading ? " loading" : ""}`;

      if (message.loading) {
        renderChatLoadingContent(item, message.content);
      } else {
        renderChatMessageContent(item, message.content);
      }

      return item;
    }),
  );
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderChatLoadingContent(container, content) {
  const spinner = document.createElement("span");
  spinner.className = "chat-loading-spinner";
  container.append(spinner);

  if (String(content ?? "").trim()) {
    const text = document.createElement("span");
    text.textContent = content;
    container.append(text);
  }
}

function renderChatMessageContent(container, content) {
  const lines = String(content ?? "").split(/\n+/);
  let list = null;

  lines.forEach((line) => {
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);

    if (bulletMatch) {
      if (!list) {
        list = document.createElement("ul");
        container.append(list);
      }

      const item = document.createElement("li");
      renderInlineContent(item, bulletMatch[1]);
      list.append(item);
      return;
    }

    list = null;

    if (!line.trim()) {
      container.append(document.createElement("br"));
      return;
    }

    const paragraph = document.createElement("p");
    renderInlineContent(paragraph, line);
    container.append(paragraph);
  });
}

function renderInlineContent(container, content) {
  const normalizedContent = String(content ?? "");
  const linkPattern = /\[([^\]]+)\]::quote::([\s\S]*?)::url::([^:]+:\/\/[\s\S]*?)::end::/g;
  let index = 0;
  let match = linkPattern.exec(normalizedContent);

  while (match) {
    container.append(document.createTextNode(normalizedContent.slice(index, match.index)));

    const quote = match[2];
    const url = match[3];
    const link = document.createElement("button");
    link.className = "quote-link";
    link.type = "button";
    link.textContent = match[1];
    link.addEventListener("click", () => goToQuote(url, quote));
    container.append(link);

    index = linkPattern.lastIndex;
    match = linkPattern.exec(normalizedContent);
  }

  container.append(document.createTextNode(normalizedContent.slice(index)));
  formatInlineMarkdown(container);
}

function formatInlineMarkdown(container) {
  container.childNodes.forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) {
      return;
    }

    const fragment = document.createDocumentFragment();
    const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
    let index = 0;
    let match = pattern.exec(node.textContent);

    while (match) {
      fragment.append(document.createTextNode(node.textContent.slice(index, match.index)));

      const element = document.createElement(match[2] ? "strong" : "em");
      element.textContent = match[2] ?? match[3];
      fragment.append(element);

      index = pattern.lastIndex;
      match = pattern.exec(node.textContent);
    }

    fragment.append(document.createTextNode(node.textContent.slice(index)));
    node.replaceWith(fragment);
  });
}

async function sendChatMessage(event) {
  event.preventDefault();

  const graph = getCurrentGraph();
  const content = chatInput.value.trim();
  let loadingMessage = null;

  if (!graph || !content) {
    return;
  }

  chatInput.value = "";
  setChatLoading(true);
  conversations[graph.id] = [...(await loadConversation(graph.id)), { role: "user", content }];
  await saveConversation(graph.id);
  await renderChat(graph.id);

  try {
    const [apiKey, page] = await Promise.all([loadApiKey(), getVisiblePage()]);
    loadingMessage = createLoadingMessage("");
    conversations[graph.id].push(loadingMessage);
    await saveConversation(graph.id);
    await renderChat(graph.id);

    const response = await generateChatResponse(apiKey, page.text, graph, conversations[graph.id]);
    loadingMessage = getCurrentLoadingMessage(graph.id, loadingMessage);
    loadingMessage.content = addUrlToQuoteLinks(response.text, page.url);
    loadingMessage.loading = false;
    await saveConversation(graph.id);
    await renderChat(graph.id);

    if (response.modify_graph.trim()) {
      await updateGraphFromChat(apiKey, page, graph, response.modify_graph);
    }
  } catch (error) {
    if (loadingMessage) {
      loadingMessage = getCurrentLoadingMessage(graph.id, loadingMessage);
      loadingMessage.content = error.message;
      loadingMessage.loading = false;
    } else {
      conversations[graph.id].push({ role: "assistant", content: error.message });
    }

    console.error(error);
    await saveConversation(graph.id);
    await renderChat(graph.id);
  } finally {
    setChatLoading(false);
    chatInput.focus();
  }
}

function setChatLoading(isLoading) {
  chatInput.disabled = isLoading;
  chatForm.querySelector("button").disabled = isLoading;
}

async function sendIntroMessage(apiKey, pageText, graph) {
  const loadingMessage = createLoadingMessage("");
  conversations[graph.id] = [...(await loadConversation(graph.id)), loadingMessage];
  await saveConversation(graph.id);
  await renderChat(graph.id);

  const intro = await generateIntroResponse(apiKey, pageText, graph);
  const currentLoadingMessage = getCurrentLoadingMessage(graph.id, loadingMessage);
  currentLoadingMessage.content = addUrlToQuoteLinks(intro, getCurrentNodeUrl(graph));
  currentLoadingMessage.loading = false;
  await saveConversation(graph.id);
  await renderChat(graph.id);
}

function createLoadingMessage(content) {
  return {
    role: "assistant",
    content,
    loading: true,
  };
}

async function updateGraphFromChat(apiKey, page, graph, modifyGraph) {
  const loadingMessage = createLoadingMessage("Updating graph");
  conversations[graph.id] = await loadConversation(graph.id);
  conversations[graph.id].push(loadingMessage);
  await saveConversation(graph.id);
  await renderChat(graph.id);

  try {
    const generatedGraph = await generateChatGraphUpdate(apiKey, page.text, graph, modifyGraph);
    graph.graph = buildStoredGraph(generatedGraph, page.url, graph.graph.nodes);
    graph.last_modified = Date.now();
    await saveGraphs();
    getCurrentLoadingMessage(graph.id, loadingMessage).content = "Graph updated.";
  } catch (error) {
    getCurrentLoadingMessage(graph.id, loadingMessage).content = error.message;
    console.error(error);
  } finally {
    getCurrentLoadingMessage(graph.id, loadingMessage).loading = false;
    await saveConversation(graph.id);
    await renderChat(graph.id);
  }
}

function getCurrentLoadingMessage(graphId, fallback) {
  const messages = conversations[graphId] ?? [];

  return messages.includes(fallback)
    ? fallback
    : [...messages].reverse().find((message) => message.role === "assistant" && message.loading) ??
        fallback;
}

function addUrlToQuoteLinks(content, url) {
  return String(content ?? "").replace(
    /\[([^\]]+)\]::quote::([\s\S]*?)::end::/g,
    (_match, text, quote) => `[${text}]::quote::${quote}::url::${url}::end::`,
  );
}

function getCurrentNodeUrl(graph) {
  return Object.values(graph.graph.nodes).find((node) => node.url)?.url ?? "";
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
  const systemPrompt = await loadPrompt("system_prompts/graph_name.txt");

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
  const systemPrompt = await loadPrompt("system_prompts/knowledge_graph.txt");

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
  const systemPrompt = await loadPrompt("system_prompts/knowledge_graph_update.txt");

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

async function generateChatGraphUpdate(apiKey, pageText, graph, modifyGraph) {
  const systemPrompt = await loadPrompt("system_prompts/knowledge_graph_chat_update.txt");

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
          `Current graph JSON:\n${JSON.stringify(graph, null, 2)}\n\nVisible webpage text:\n${pageText}\n\nModify graph request:\n${modifyGraph}`,
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

async function generateIntroResponse(apiKey, pageText, graph) {
  const systemPrompt = await loadPrompt("system_prompts/conversation_intro.txt");
  const data = await createResponse(apiKey, {
    model: CONVERSATION_MODEL,
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
  });

  return getResponseText(data);
}

async function generateChatResponse(apiKey, pageText, graph, messages) {
  const systemPrompt = await loadPrompt("system_prompts/conversation.txt");
  const recentMessages = messages
    .filter((message) => !message.loading)
    .slice(-5)
    .map(({ role, content }) => ({ role, content }));
  const data = await createResponse(apiKey, {
    model: CONVERSATION_MODEL,
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
      ...recentMessages,
    ],
    text: {
      format: {
        type: "json_schema",
        name: "conversation_response",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            modify_graph: { type: "string" },
          },
          required: ["text", "modify_graph"],
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
  const outputText = getResponseText(response);

  if (!outputText) {
    throw new Error("OpenAI response did not include text output");
  }

  return JSON.parse(outputText);
}

function getResponseText(response) {
  return (
    response.output_text ??
    response.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === "output_text")?.text
  );
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
chatForm.addEventListener("submit", sendChatMessage);
backButton.addEventListener("click", showHome);
window.addEventListener("hashchange", renderRoute);
chrome.tabs.onActivated.addListener(refreshUpdateButtonVisibility);
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    refreshUpdateButtonVisibility();
  }
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[GRAPH_STORAGE_KEY]) {
    loadGraphs();
  }

  Object.keys(changes)
    .filter((key) => key.endsWith("_conversation"))
    .forEach((key) => {
      if (pendingConversationSaves.has(key)) {
        markConversationSaveObserved(key);
        return;
      }

      const graphId = key.replace(/_conversation$/, "");
      delete conversations[graphId];

      if (graphId === getCurrentGraphId()) {
        renderChat(graphId);
      }
    });
});

loadGraphs();
