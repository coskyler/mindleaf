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
        size: 34 + (node.outgoing.length / maxOutgoing) * 34,
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
          "background-color": "#5f9560",
          color: "#24382c",
          width: "data(size)",
          height: "data(size)",
          label: "data(label)",
          "font-size": 11,
          "text-valign": "center",
          "text-halign": "center",
          "text-wrap": "wrap",
          "text-max-width": 78,
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
      nodeRepulsion: 7000,
      idealEdgeLength: 84,
      edgeElasticity: 120,
    },
  });

  cy.on("tap", "node", (event) => {
    onNodeClick(event.target.data());
  });

  return cy;
}

function getInitialPosition(index, total) {
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  const radius = 120;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}
