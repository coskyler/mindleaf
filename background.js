const GRAPH_STORAGE_KEY = "graphs";
const NAME_MODEL = "gpt-5.4-nano";
const GRAPH_MODEL = "gpt-5.5";
const CONVERSATION_MODEL = "gpt-5.5";
const MAX_TEXT_LENGTH = 60000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "generateGraph") {
    return false;
  }

  generateGraphInBackground(message.graphId, message.tabId)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function generateGraphInBackground(graphId, tabId) {
  try {
    const [apiKey, page] = await Promise.all([loadApiKey(), getVisiblePage(tabId)]);
    const graph = await getGraph(graphId);

    if (!graph) {
      return;
    }

    graph.name = await generateGraphName(apiKey, page.text);
    graph.last_modified = Date.now();
    await saveGraph(graph);

    graph.graph = buildStoredGraph(await generateKnowledgeGraph(apiKey, page.text), page.url);
    graph.last_modified = Date.now();
    await saveGraph(graph);

    await sendIntroMessage(apiKey, page.text, graph);
  } catch (error) {
    const graph = await getGraph(graphId);

    if (graph) {
      graph.name = "Graph generation failed";
      graph.last_modified = Date.now();
      await saveGraph(graph);
      await saveConversation(graph.id, [{ role: "assistant", content: error.message }]);
    }
  }
}

async function getGraph(graphId) {
  const { [GRAPH_STORAGE_KEY]: graphs = [] } = await chrome.storage.local.get(GRAPH_STORAGE_KEY);
  return graphs.find((graph) => graph.id === graphId);
}

async function saveGraph(graph) {
  const { [GRAPH_STORAGE_KEY]: graphs = [] } = await chrome.storage.local.get(GRAPH_STORAGE_KEY);
  const nextGraphs = [graph, ...graphs.filter((item) => item.id !== graph.id)]
    .sort((a, b) => b.last_modified - a.last_modified);
  await chrome.storage.local.set({ [GRAPH_STORAGE_KEY]: nextGraphs });
}

async function saveConversation(graphId, messages) {
  await chrome.storage.local.set({ [`${graphId}_conversation`]: messages });
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

async function getVisiblePage(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
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

async function generateGraphName(apiKey, pageText) {
  const systemPrompt = await loadPrompt("system_prompts/graph_name.txt");
  const data = await createResponse(apiKey, {
    model: NAME_MODEL,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Visible webpage text:\n${pageText}` },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "graph_title",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { name: { type: "string" } },
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
      { role: "system", content: systemPrompt },
      { role: "user", content: `Visible webpage text:\n${pageText}` },
    ],
    text: { format: knowledgeGraphFormat() },
  });

  return parseResponseJson(data);
}

async function sendIntroMessage(apiKey, pageText, graph) {
  const systemPrompt = await loadPrompt("system_prompts/conversation_intro.txt");
  const data = await createResponse(apiKey, {
    model: CONVERSATION_MODEL,
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          `Current graph JSON:\n${JSON.stringify(graph, null, 2)}\n\nVisible webpage text:\n${pageText}`,
      },
    ],
  });

  await saveConversation(graph.id, [{ role: "assistant", content: getResponseText(data) }]);
}

function knowledgeGraphFormat() {
  return {
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
  };
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

function buildStoredGraph(generatedGraph, url) {
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
            url,
            outgoing: Array.isArray(node.outgoing)
              ? node.outgoing.map((target) => String(target).trim()).filter(Boolean)
              : [],
          },
        ],
      ];
    }),
  );

  Object.values(nodes).forEach((node) => {
    node.outgoing = [...new Set(node.outgoing)].filter((target) => nodes[target]);
  });

  return { nodes };
}
