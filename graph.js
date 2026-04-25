function createGraph(container, nodes, onNodeClick) {
  const maxOutgoing = Math.max(
    1,
    ...Object.values(nodes).map((node) => node.outgoing.length),
  );
  const elements = Object.entries(nodes).flatMap(([name, node]) => [
    {
      data: {
        id: name,
        label: name,
        quote: node.quote,
        size: 34 + (node.outgoing.length / maxOutgoing) * 34,
      },
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
      nodeRepulsion: 7000,
      idealEdgeLength: 84,
      edgeElasticity: 120,
    },
  });

  cy.on("tap", "node", (event) => {
    onNodeClick(event.target.data("quote"));
  });

  return cy;
}
