import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getGeometries } from "@/lib/stakePoints";
import { pointAtChainage, projectOnPolyline } from "@/lib/geo";
import { stakeAtChainage } from "@/lib/stakes";

export default defineTool({
  name: "find_stake",
  title: "Localizar estaca por coordenada",
  description:
    "Dada uma latitude/longitude, retorna a rua mais próxima do bairro Retiro São Joaquim e o número da estaca correspondente.",
  inputSchema: {
    lat: z.number().describe("Latitude em graus decimais (WGS84)."),
    lng: z.number().describe("Longitude em graus decimais (WGS84)."),
    maxDistanceM: z
      .number()
      .optional()
      .describe("Distância máxima do eixo da rua, em metros. Padrão: 60."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ lat, lng, maxDistanceM }) => {
    const maxDist = maxDistanceM && maxDistanceM > 0 ? maxDistanceM : 60;
    const pos = { lat, lng };
    let best: {
      street: string;
      stake: string;
      stakeNumber: number;
      offsetM: number;
      distanceFromAxisM: number;
      stakePosition: { lat: number; lng: number };
    } | null = null;

    for (const { street, length } of getGeometries()) {
      const r = projectOnPolyline(pos, street.path);
      if (!r || r.distance > maxDist) continue;
      if (best && r.distance >= best.distanceFromAxisM) continue;
      const { number, offset } = stakeAtChainage(street, r.chainage, length);
      const snapped = pointAtChainage(street.path, r.chainage) ?? pos;
      best = {
        street: street.name,
        stake: `E-${number}`,
        stakeNumber: number,
        offsetM: Math.round(offset * 10) / 10,
        distanceFromAxisM: Math.round(r.distance * 10) / 10,
        stakePosition: snapped,
      };
    }

    if (!best) {
      return {
        content: [
          {
            type: "text",
            text: `Nenhuma rua do bairro a menos de ${maxDist} m de ${lat}, ${lng}.`,
          },
        ],
        structuredContent: { found: false },
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `${best.street} — ${best.stake} (${best.offsetM >= 0 ? "+" : ""}${best.offsetM} m, ${best.distanceFromAxisM} m do eixo)`,
        },
      ],
      structuredContent: { found: true, ...best },
    };
  },
});
