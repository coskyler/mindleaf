# MindLeaf

MindLeaf is a Chrome extension that turns a set of webpages into a single AI-generated directed graph of concepts.

Each node represents a concept found across the selected pages, and each directed edge represents a learning dependency between concepts. Traversing the graph gives the user a structured learning path through the material in the order the concepts are best understood.

## What It Does

MindLeaf transforms scattered web content into a guided learning experience.

* Extracts visible text from selected webpages.
* Uses AI to generate a directed concept graph from the page content.
* Represents each concept as a graph node with a source quote and URL.
* Uses graph traversal to create an ordered learning path.
* Lets users click graph nodes or lesson steps to jump directly to the matching quote on the source webpage.
* Highlights the relevant sentence so each concept stays grounded in the original source.
* Includes Leafy, an AI chatbot that answers questions using the current graph and source content.
* Allows Leafy to update the graph when the user asks for changes to the learning path.
* Stores graphs and conversations locally in browser storage.

## Why It Matters

Webpages are usually written for browsing, not structured learning. Articles, documentation, papers, and tutorials often assume background knowledge or introduce related ideas out of order.

MindLeaf converts that non-linear content into a dependency graph. Instead of manually deciding what to read first, users can follow a generated path that introduces concepts in a more logical sequence.

## Tech Stack

* Chrome Side Panel, Scripting, Tabs, and Storage APIs
* OpenAI Responses API
* Cytoscape.js
* Vanilla JavaScript, HTML, and CSS

## How It Works

MindLeaf collects text from the selected webpages and sends it to ChatGPT's API. The model is prompted to identify the important concepts and return them as an adjacency list.

Each node contains a concept, a supporting quote, the source URL, and outgoing edges to related concepts.

```json
{
  "nodes": {
    "Concept name": {
      "quote": "exact quote from the source page",
      "url": "https://example.com/page",
      "outgoing": ["Dependent concept"]
    }
  }
}
```

The extension renders this adjacency list as a directed graph using Cytoscape.js. The graph is also used to generate a sequential lesson path, allowing users to move through the concepts in learning order.

When a user clicks a graph node, lesson step, or chatbot citation, MindLeaf opens the matching source page, scrolls to the quote, and highlights the relevant sentence.

## Local Setup

1. Add your OpenAI API key to `config.json`:

```json
{
  "OPENAI_API_KEY": "your_api_key_here"
}
```

2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.
6. Open webpages and launch MindLeaf from the extension icon.

## Future Improvements

* Export and share learning graphs.
* Add progress tracking across learning paths.
* Improve graph editing controls.
* Add quiz generation from the lesson path.
