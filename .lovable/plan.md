# Estacas do Retiro São Joaquim direto da planta

Remover a calibração manual e embutir no app as estacas reais da planta `2024_SJOAQUIM_PE_GEO_DE_001-R01.pdf`, para todas as ruas do bairro. O app abre no mapa, mostra as estacas e destaca a estaca em que o GPS está.

## O que eu já confirmei na planta

- A planta é georreferenciada: tem malha UTM rotulada (E=715200 a E=717200, N=7481600 a N=7483600), fuso 23S. Dá para converter qualquer ponto do desenho em latitude/longitude.
- O "eixo projetado" é uma linha traço-ponto vermelha desenhada como vetor (cor #950000), com marcas de estaca ao longo dela — extraível com precisão.
- Cada rua tem sua própria numeração, não é uma numeração única do bairro. Exemplos lidos na planta: Cel. João de Magalhães 510→562, José Leandro 1248→1358, Dr. Altamir Moreira 466→473, Padre Mariano de Castro 558→562.
- Os números das estacas **não** são texto legível por máquina no PDF (a fonte do AutoCAD não tem mapeamento Unicode); eles são contornos vetoriais. Serão lidos por OCR em recortes de alta resolução do desenho.
- Não existe "Rua São Joaquim" na planta — São Joaquim é o bairro. O escopo é o bairro inteiro.

## Como vai funcionar

1. Extraio, do PDF, todos os eixos vermelhos e os converto de coordenadas do desenho para latitude/longitude.
2. Agrupo os eixos por rua e leio por OCR os rótulos de estaca ao longo de cada eixo.
3. Gero um arquivo de dados fixo no app com: nome da rua, o traçado do eixo e a numeração das estacas (primeira estaca, passo e posição de cada uma).
4. O app passa a usar só esses dados. Nada de calibrar, nada de salvar no navegador.

## Tela do app

- Mapa em satélite/híbrido, centralizado na sua posição, seguindo o GPS.
- Todos os eixos das ruas desenhados por cima do mapa.
- Cada estaca marcada com o rótulo `E-1127` (o número real da planta).
- Painel no topo: nome da rua atual, a estaca mais próxima (ex.: `E-1127 +7 m`), distância até o eixo e precisão do GPS.
- Quando você estiver longe de qualquer eixo, o painel avisa "fora da área do projeto" em vez de mostrar uma estaca errada.
- Rótulos aparecem só em zoom próximo, para o mapa não ficar poluído.

## Conferência antes de entregar

Depois de gerar os dados, comparo lado a lado alguns pontos conhecidos (esquinas com número de estaca visível na planta) contra o que o app calcula, e ajusto se houver desvio. Vou te mostrar essa conferência.

## Detalhes técnicos

- Extração: `mutool` para os vetores (filtrando stroke `#950000`), transformação afim PDF→UTM 23S ancorada nas linhas de malha, e `proj`/fórmula UTM inversa para WGS84. OCR com `pytesseract` nos recortes dos rótulos, com correção de rotação.
- Novo `src/data/streets.ts` (ou JSON importado) com `{ nome, eixo: [lat,lng][], estacas: [{ numero, lat, lng, chainage }] }`.
- `src/lib/geo.ts` mantido (projeção ponto→polilinha). `src/lib/stakes.ts` simplificado para consultar a lista fixa.
- Remoção de `src/routes/calibrar.tsx`, `src/lib/streetsStore.ts` e `src/data/defaultStreets.ts`, e dos links/estados de calibração em `src/routes/index.tsx`.
- Marcadores renderizados com um único `OverlayView`/canvas ou marcadores com `visible` por zoom, para não travar com centenas de estacas.
- `head()` da rota principal com título e descrição próprios.

## Riscos

- Se o OCR errar algum número, a numeração daquela rua sai deslocada. Mitigação: a numeração é sequencial e de passo constante, então basta um rótulo correto por trecho; valido a sequência lida contra o passo esperado e sinalizo os trechos duvidosos para você conferir.
