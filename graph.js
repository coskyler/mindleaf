function createGraph(container, nodes, onNodeClick) {
  const nodeEntries = Object.entries(nodes).sort(([a], [b]) => a.localeCompare(b));
  const maxOutgoing = Math.max(
    1,
    ...nodeEntries.map(([, node]) => node.outgoing.length),
  );
  const elements = nodeEntries.flatMap(([name, node], index) => [
    {
      data: {
        id: name,
        label: name,
        quote: node.quote,
        url: node.url,
        width: Math.min(220, Math.max(96, name.length * 9 + 28 + (node.outgoing.length / maxOutgoing) * 48)),
        height: 34 + Math.ceil(name.length / 18) * 18 + (node.outgoing.length / maxOutgoing) * 20,
        fontSize: 16 + (node.outgoing.length / maxOutgoing) * 5,
      },
      position: getInitialPosition(index, nodeEntries.length),
    },
    ...node.outgoing.map((target) => ({
      data: {
        id: `${name}->${target}`,
        source: name,
        target,
      },
    })),
  ]);

  const cy = cytoscape({
    container,
    elements,
    style: [
      {
        selector: "node",
        style: {
          shape: "round-rectangle",
          "corner-radius": 14,
          "background-color": "#f2ead2",
          color: "#123321",
          width: "data(width)",
          height: "data(height)",
          label: "data(label)",
          "font-size": "data(fontSize)",
          "font-weight": 600,
          "text-valign": "center",
          "text-halign": "center",
          "text-wrap": "wrap",
          "text-max-width": "data(width)",
          padding: 1,
        },
      },
      {
        selector: "node:selected",
        style: {
          "border-width": 3,
          "border-color": "#9ed7a4",
        },
      },
      {
        selector: "edge",
        style: {
          width: 2,
          "line-color": "#a8c7a3",
          "target-arrow-color": "#a8c7a3",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
        },
      },
    ],
    layout: {
      name: "cose",
      padding: 24,
      animate: false,
      randomize: false,
      nodeDimensionsIncludeLabels: true,
      nodeOverlap: 24,
      nodeRepulsion: 14000,
      idealEdgeLength: 165,
      edgeElasticity: 75,
      gravity: 0.35,
    },
  });

  cy.on("tap", "node", (event) => {
    onNodeClick(event.target.data());
  });

  spreadHorizontally(cy);

  return cy;
}

function spreadHorizontally(cy) {
  cy.ready(() => {
    cy.nodes().forEach((node) => {
      const position = node.position();
      node.position({
        x: position.x * 1.75,
        y: position.y * 0.65,
      });
    });
    cy.fit(undefined, 28);
  });
}

function focusGraphNode(cy, nodeName) {
  const node = cy?.getElementById(nodeName);

  if (!node?.length) {
    return;
  }

  cy.elements().unselect();
  node.select();
  cy.animate(
    {
      center: { eles: node },
      zoom: Math.max(cy.zoom(), 1.15),
    },
    { duration: 220 },
  );
}

function getInitialPosition(index, total) {
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  const radius = 120;

  return {
    x: Math.cos(angle) * radius * 1.8,
    y: Math.sin(angle) * radius * 0.75,
  };
}
