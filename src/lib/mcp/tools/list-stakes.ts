import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getGeometries } from "@/lib/stakePoints";

export default defineTool({
  name: "list_stakes",
  title: "Listar estacas de uma rua",
  description:
    "Lista todas as estacas de uma rua do bairro Retiro São Joaquim com suas coordenadas.",
  inputSchema: {
    street: z.string().describe("Nome da rua (aceita parte do nome)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ street }) => {
    const q = street.trim().toLowerCase();
    const geoms = getGeometries();
    const g =
      geoms.find((x) => x.street.name.toLowerCase() === q) ??
      geoms.find((x) => x.street.name.toLowerCase().includes(q));
    if (!g) {
      throw new ToolError(
        `Rua não encontrada: "${street}". Use list_streets para ver os nomes disponíveis.`,
      );
    }
    const stakes = g.stakes.map((s) => ({
      stake: `E-${s.number}`,
      number: s.number,
      lat: s.pos.lat,
      lng: s.pos.lng,
    }));
    return {
      content: [
        { type: "text", text: JSON.stringify({ street: g.street.name, stakes }, null, 2) },
      ],
      structuredContent: { street: g.street.name, stakes },
    };
  },
});
