import { defineTool } from "@lovable.dev/mcp-js";
import { STREETS } from "@/data/streets";
import { polylineLength } from "@/lib/geo";

export default defineTool({
  name: "list_streets",
  title: "Listar ruas",
  description:
    "Lista todas as ruas do bairro Retiro São Joaquim (Itaboraí-RJ) com a faixa de estacas e o comprimento aproximado do eixo.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const streets = STREETS.map((s) => ({
      name: s.name,
      stakeStart: s.stakeStart,
      stakeEnd: s.stakeEnd,
      lengthM: Math.round(polylineLength(s.path)),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(streets, null, 2) }],
      structuredContent: { streets },
    };
  },
});
