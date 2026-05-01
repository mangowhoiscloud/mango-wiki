// /graph — knowledge graph view of the mango-wiki vault.
// Server component reads vault, builds graph, hands off to client component.

import { GraphView } from "../../components/GraphView";
import { buildGraph } from "../../lib/graph";
import { listPages } from "../../lib/vault";

export const metadata = {
  title: "Graph — mango-wiki",
  description: "Wikilink graph of the mango-wiki vault.",
};

export default function GraphPage() {
  const pages = listPages();
  const graph = buildGraph(pages);
  return <GraphView graph={graph} />;
}
