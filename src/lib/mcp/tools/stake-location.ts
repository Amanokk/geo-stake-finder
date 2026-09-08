import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getGeometries } from "@/lib/stakePoints";

export default defineTool({
  name: "stake_location",
  title: "Coordenada de uma estaca",
  description:
    "Retorna a latitude/longitude de uma estaca específica de uma rua do bairro Retiro São Joaquim.",
  inputSchema: {
    street: z.string().describe("Nome da rua (aceita parte do nome, ex.: 'Ângelo Buriche')."),
    stake: z.number().describe("Número da estaca, ex.: 1127."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ street, stake }) => {
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
    const point = g.stakes.find((s) => s.number === stake);
    if (!point) {
      throw new ToolError(
        `A estaca ${stake} não existe na ${g.street.name} (faixa ${g.street.stakeStart}–${g.street.stakeEnd}).`,
      );
    }
    const result = {
      street: g.street.name,
      stake: `E-${point.number}`,
      lat: point.pos.lat,
      lng: point.pos.lng,
    };
    return {
      content: [
        { type: "text", text: `${result.street} — ${result.stake}: ${result.lat}, ${result.lng}` },
      ],
      structuredContent: result,
    };
  },
});
