// ============================================================
// gameLogic.js — Lógica compartida: puntuación, validación, pathfinding
// ============================================================

(function (exports) {
  'use strict';

  // Referencia a datos del mapa (se inyectan en servidor o vienen del global)
  let mapData;
  function setMapData(data) {
    mapData = data;
  }

  // --- Puntuación por longitud de ruta ---
  const ROUTE_POINTS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 };

  function getRoutePoints(length) {
    return ROUTE_POINTS[length] || 0;
  }

  // --- Validar si un jugador puede reclamar una ruta ---
  function canClaimRoute(route, playerHand, playerTrains, claimedRoutes, playerId, playerCount) {
    // ¿Ya reclamada?
    if (claimedRoutes[route.id]) return { valid: false, reason: 'Ruta ya reclamada' };

    // Rutas dobles: en partidas de <4 jugadores, si una ruta doble está reclamada,
    // la otra del mismo par no se puede reclamar
    if (playerCount < 4) {
      const parallelRoutes = getParallelRoutes(route);
      for (const pr of parallelRoutes) {
        if (claimedRoutes[pr.id]) {
          return { valid: false, reason: 'Ruta paralela ya reclamada (menos de 4 jugadores)' };
        }
      }
    }

    // Un jugador no puede reclamar ambas rutas dobles del mismo par
    const parallelRoutes = getParallelRoutes(route);
    for (const pr of parallelRoutes) {
      if (claimedRoutes[pr.id] === playerId) {
        return { valid: false, reason: 'Ya tienes la ruta paralela' };
      }
    }

    // ¿Suficientes trenes?
    if (playerTrains < route.length) {
      return { valid: false, reason: 'No tienes suficientes trenes' };
    }

    // Verificar cartas necesarias
    const options = getClaimOptions(route, playerHand);
    if (options.length === 0) {
      return { valid: false, reason: 'No tienes las cartas necesarias' };
    }

    return { valid: true, options };
  }

  // Obtener rutas paralelas (mismo par de ciudades)
  function getParallelRoutes(route) {
    if (!mapData) return [];
    return mapData.ROUTES.filter(r =>
      r.id !== route.id &&
      ((r.cities[0] === route.cities[0] && r.cities[1] === route.cities[1]) ||
       (r.cities[0] === route.cities[1] && r.cities[1] === route.cities[0]))
    );
  }

  // Calcular las opciones de cartas para reclamar una ruta
  function getClaimOptions(route, hand) {
    const options = [];
    const ferryCount = route.ferryCount || 0;
    const isFerry = route.type === 'ferry';

    // Contar cartas en mano
    const counts = {};
    for (const card of hand) {
      counts[card] = (counts[card] || 0) + 1;
    }
    const locos = counts['locomotora'] || 0;

    if (route.color === 'gris') {
      // Ruta gris: se puede usar cualquier color
      const colors = ['rojo', 'azul', 'verde', 'amarillo', 'negro', 'blanco', 'naranja', 'rosa'];
      for (const color of colors) {
        const colorCount = counts[color] || 0;
        // Para ferry, necesitamos al menos ferryCount locomotoras
        for (let numLocos = ferryCount; numLocos <= Math.min(locos, route.length); numLocos++) {
          const needed = route.length - numLocos;
          if (colorCount >= needed) {
            options.push({ color, locomotives: numLocos, colorCards: needed });
          }
        }
        // También opción con solo locomotoras
        if (locos >= route.length && ferryCount <= locos) {
          // Ya cubierto arriba cuando needed=0
        }
      }
      // Opción de solo locomotoras
      if (locos >= route.length && locos >= ferryCount) {
        options.push({ color: 'locomotora', locomotives: route.length, colorCards: 0 });
      }
    } else {
      // Ruta de color específico
      const colorCount = counts[route.color] || 0;
      for (let numLocos = ferryCount; numLocos <= Math.min(locos, route.length); numLocos++) {
        const needed = route.length - numLocos;
        if (colorCount >= needed) {
          options.push({ color: route.color, locomotives: numLocos, colorCards: needed });
        }
      }
      // Solo locomotoras
      if (locos >= route.length && locos >= ferryCount) {
        options.push({ color: 'locomotora', locomotives: route.length, colorCards: 0 });
      }
    }

    // Eliminar duplicados
    const unique = [];
    const seen = new Set();
    for (const opt of options) {
      const key = `${opt.color}-${opt.locomotives}-${opt.colorCards}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(opt);
      }
    }
    return unique;
  }

  // --- Verificar si un billete está completado ---
  function isTicketCompleted(ticket, playerRoutes, allRoutes, playerId, stations, claimedRoutes) {
    // Construir grafo de conexiones del jugador
    const graph = buildPlayerGraph(playerRoutes, allRoutes, playerId, stations, claimedRoutes);
    return hasPath(graph, ticket.from, ticket.to);
  }

  // Construir grafo de adyacencia del jugador (incluye estaciones)
  function buildPlayerGraph(playerRouteIds, allRoutes, playerId, stations, claimedRoutes) {
    const graph = {};

    // Añadir rutas propias
    for (const routeId of playerRouteIds) {
      const route = allRoutes.find(r => r.id === routeId);
      if (!route) continue;
      const [a, b] = route.cities;
      if (!graph[a]) graph[a] = new Set();
      if (!graph[b]) graph[b] = new Set();
      graph[a].add(b);
      graph[b].add(a);
    }

    // Estaciones: cada estación colocada en una ciudad permite usar UNA ruta
    // adyacente de otro jugador
    if (stations) {
      for (const station of stations) {
        if (!station.city) continue;
        // Buscar rutas adyacentes de otros jugadores
        const adjacentRoutes = allRoutes.filter(r =>
          (r.cities[0] === station.city || r.cities[1] === station.city) &&
          claimedRoutes[r.id] && claimedRoutes[r.id] !== playerId
        );
        // Usar la primera ruta útil (simplificación; en el juego real se elige)
        for (const route of adjacentRoutes) {
          const [a, b] = route.cities;
          if (!graph[a]) graph[a] = new Set();
          if (!graph[b]) graph[b] = new Set();
          graph[a].add(b);
          graph[b].add(a);
        }
      }
    }

    return graph;
  }

  // BFS para encontrar camino entre dos ciudades
  function hasPath(graph, start, end) {
    if (start === end) return true;
    if (!graph[start]) return false;

    const visited = new Set();
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === end) return true;

      const neighbors = graph[current];
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    return false;
  }

  // --- Calcular la ruta continua más larga de un jugador ---
  function longestContinuousRoute(playerRouteIds, allRoutes) {
    // Construir grafo con aristas (cada ruta es una arista con peso = longitud)
    const edges = [];
    const adjacency = {};

    for (const routeId of playerRouteIds) {
      const route = allRoutes.find(r => r.id === routeId);
      if (!route) continue;
      const [a, b] = route.cities;
      const edge = { id: routeId, from: a, to: b, length: route.length };
      edges.push(edge);

      if (!adjacency[a]) adjacency[a] = [];
      if (!adjacency[b]) adjacency[b] = [];
      adjacency[a].push(edge);
      adjacency[b].push(edge);
    }

    if (edges.length === 0) return 0;

    // DFS para encontrar el camino más largo (sin repetir aristas)
    let maxLength = 0;
    const cities = Object.keys(adjacency);

    function dfs(city, usedEdges, currentLength) {
      if (currentLength > maxLength) maxLength = currentLength;

      const cityEdges = adjacency[city] || [];
      for (const edge of cityEdges) {
        if (usedEdges.has(edge.id)) continue;
        const nextCity = edge.from === city ? edge.to : edge.from;
        usedEdges.add(edge.id);
        dfs(nextCity, usedEdges, currentLength + edge.length);
        usedEdges.delete(edge.id);
      }
    }

    for (const city of cities) {
      dfs(city, new Set(), 0);
    }

    return maxLength;
  }

  // --- Calcular puntuación final de un jugador ---
  function calculateFinalScore(player, allRoutes, claimedRoutes) {
    let score = 0;

    // Puntos por rutas reclamadas
    for (const routeId of player.claimedRoutes) {
      const route = allRoutes.find(r => r.id === routeId);
      if (route) score += getRoutePoints(route.length);
    }

    // Billetes completados / no completados
    for (const ticket of player.tickets) {
      const completed = isTicketCompleted(
        ticket, player.claimedRoutes, allRoutes,
        player.id, player.placedStations, claimedRoutes
      );
      if (completed) {
        score += ticket.points;
      } else {
        score -= ticket.points;
      }
    }

    // Estaciones no usadas: +4 por cada estación que NO se colocó
    const stationsPlaced = player.placedStations ? player.placedStations.filter(s => s.city).length : 0;
    score += (3 - stationsPlaced) * 4;

    return score;
  }

  // --- Crear mazo de cartas de vagón ---
  function createDrawPile() {
    const pile = [];
    const colors = ['rojo', 'azul', 'verde', 'amarillo', 'negro', 'blanco', 'naranja', 'rosa'];
    // 12 cartas de cada color
    for (const color of colors) {
      for (let i = 0; i < 12; i++) {
        pile.push(color);
      }
    }
    // 14 locomotoras
    for (let i = 0; i < 14; i++) {
      pile.push('locomotora');
    }
    return shuffle(pile);
  }

  // --- Barajar array (Fisher-Yates) ---
  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // --- Coste de estación ---
  function stationCost(stationIndex) {
    // 1ª estación: 1 carta, 2ª: 2 cartas, 3ª: 3 cartas
    return stationIndex + 1;
  }

  // --- Exportar ---
  exports.setMapData = setMapData;
  exports.getRoutePoints = getRoutePoints;
  exports.canClaimRoute = canClaimRoute;
  exports.getClaimOptions = getClaimOptions;
  exports.isTicketCompleted = isTicketCompleted;
  exports.longestContinuousRoute = longestContinuousRoute;
  exports.calculateFinalScore = calculateFinalScore;
  exports.createDrawPile = createDrawPile;
  exports.shuffle = shuffle;
  exports.stationCost = stationCost;
  exports.buildPlayerGraph = buildPlayerGraph;
  exports.hasPath = hasPath;
  exports.getParallelRoutes = getParallelRoutes;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.GameLogic = {}));
