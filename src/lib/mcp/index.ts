import { defineMcp } from "@lovable.dev/mcp-js";
import listStreets from "./tools/list-streets";
import listStakes from "./tools/list-stakes";
import findStake from "./tools/find-stake";
import stakeLocation from "./tools/stake-location";

export default defineMcp({
  name: "joaquim-map-finder",
  title: "Joaquim Map Finder",
  version: "0.1.0",
  instructions:
    "Ferramentas das estacas do bairro Retiro São Joaquim (Itaboraí-RJ). Use `list_streets` para ver as ruas, `find_stake` para descobrir a estaca de uma coordenada GPS, `stake_location` para a coordenada de uma estaca e `list_stakes` para todas as estacas de uma rua.",
  tools: [listStreets, listStakes, findStake, stakeLocation],
});
