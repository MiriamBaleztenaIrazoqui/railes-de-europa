// ============================================================
// server.js — Servidor Express + Socket.io para Raíles de Europa
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const mapData = require('./public/map.js');
const logic = require('./public/gameLogic.js');
logic.setMapData(mapData);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Estado de salas en memoria
const rooms = {};

// --- Utilidades ---
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? generateRoomCode() : code;
}

function createRoom(hostId, hostName) {
  const code = generateRoomCode();
  rooms[code] = {
    code,
    state: 'waiting', // waiting | playing | lastRound | finished
    players: [{
      id: hostId,
      name: hostName,
      color: mapData.PLAYER_COLOR_LIST[0],
      hand: [],
      tickets: [],
      trains: 45,
      stations: 3,
      placedStations: [],
      claimedRoutes: [],
      score: 0,
      connected: true,
    }],
    drawPile: [],
    discardPile: [],
    faceUpCards: [],
    ticketPile: [],
    claimedRoutes: {},
    currentPlayer: 0,
    turnPhase: null, // null | 'drewOneCard' | 'choosingTickets'
    pendingTickets: null, // billetes pendientes de elegir
    lastRoundTriggeredBy: null,
    lastRoundTurnsRemaining: null,
    log: [],
    chat: [],
  };
  return code;
}

function getRoom(code) {
  return rooms[code] || null;
}

function getPlayerInRoom(room, socketId) {
  return room.players.find(p => p.id === socketId);
}

function dealInitialCards(room) {
  room.drawPile = logic.createDrawPile();
  // Repartir 4 cartas a cada jugador
  for (const player of room.players) {
    player.hand = [];
    for (let i = 0; i < 4; i++) {
      player.hand.push(drawCard(room));
    }
  }
  // Poner 5 cartas boca arriba
  room.faceUpCards = [];
  for (let i = 0; i < 5; i++) {
    room.faceUpCards.push(drawCard(room));
  }
  checkFaceUpLocomotives(room);
}

function drawCard(room) {
  if (room.drawPile.length === 0) {
    if (room.discardPile.length === 0) return null;
    room.drawPile = logic.shuffle(room.discardPile);
    room.discardPile = [];
  }
  return room.drawPile.pop();
}

function checkFaceUpLocomotives(room) {
  // Si hay 3+ locomotoras entre las cartas boca arriba, se retiran todas y se reponen
  let locoCount = room.faceUpCards.filter(c => c === 'locomotora').length;
  let attempts = 0;
  while (locoCount >= 3 && attempts < 5) {
    room.discardPile.push(...room.faceUpCards);
    room.faceUpCards = [];
    for (let i = 0; i < 5; i++) {
      const card = drawCard(room);
      if (card) room.faceUpCards.push(card);
    }
    locoCount = room.faceUpCards.filter(c => c === 'locomotora').length;
    attempts++;
  }
}

function dealTickets(room, player, count) {
  const tickets = [];
  for (let i = 0; i < count && room.ticketPile.length > 0; i++) {
    tickets.push(room.ticketPile.pop());
  }
  return tickets;
}

function initGame(room) {
  room.state = 'playing';
  room.ticketPile = logic.shuffle([...mapData.TICKETS]);
  room.claimedRoutes = {};
  room.currentPlayer = 0;
  room.turnPhase = null;
  room.log = [];

  dealInitialCards(room);

  // Repartir 3 billetes iniciales a cada jugador (deben conservar al menos 2)
  for (const player of room.players) {
    player.tickets = [];
    player.claimedRoutes = [];
    player.trains = 45;
    player.stations = 3;
    player.placedStations = [];
    player.score = 0;
  }
}

function nextTurn(room) {
  room.turnPhase = null;
  room.pendingTickets = null;

  // Verificar fin de juego
  const currentPlayer = room.players[room.currentPlayer];
  if (room.state === 'lastRound') {
    room.lastRoundTurnsRemaining--;
    if (room.lastRoundTurnsRemaining <= 0) {
      endGame(room);
      return;
    }
  } else if (currentPlayer.trains <= 2) {
    room.state = 'lastRound';
    room.lastRoundTriggeredBy = currentPlayer.id;
    room.lastRoundTurnsRemaining = room.players.length; // una ronda completa más
    addLog(room, `¡${currentPlayer.name} tiene ${currentPlayer.trains} trenes! Última ronda.`);
  }

  room.currentPlayer = (room.currentPlayer + 1) % room.players.length;
}

function endGame(room) {
  room.state = 'finished';

  // Calcular puntuaciones finales
  const results = [];
  let maxLongest = 0;
  const longestByPlayer = {};

  for (const player of room.players) {
    const longest = logic.longestContinuousRoute(player.claimedRoutes, mapData.ROUTES);
    longestByPlayer[player.id] = longest;
    if (longest > maxLongest) maxLongest = longest;
  }

  // Bonus ruta más larga
  const longestWinners = room.players.filter(p => longestByPlayer[p.id] === maxLongest && maxLongest > 0);

  for (const player of room.players) {
    let routePoints = 0;
    for (const routeId of player.claimedRoutes) {
      const route = mapData.ROUTES.find(r => r.id === routeId);
      if (route) routePoints += logic.getRoutePoints(route.length);
    }

    let ticketPositive = 0;
    let ticketNegative = 0;
    const ticketDetails = [];
    for (const ticket of player.tickets) {
      const completed = logic.isTicketCompleted(
        ticket, player.claimedRoutes, mapData.ROUTES,
        player.id, player.placedStations, room.claimedRoutes
      );
      if (completed) {
        ticketPositive += ticket.points;
        ticketDetails.push({ ...ticket, completed: true });
      } else {
        ticketNegative += ticket.points;
        ticketDetails.push({ ...ticket, completed: false });
      }
    }

    const stationsPlaced = player.placedStations.filter(s => s.city).length;
    const stationBonus = (3 - stationsPlaced) * 4;
    const longestBonus = longestWinners.some(w => w.id === player.id) ? 10 : 0;

    const total = routePoints + ticketPositive - ticketNegative + stationBonus + longestBonus;

    results.push({
      id: player.id,
      name: player.name,
      color: player.color,
      routePoints,
      ticketPositive,
      ticketNegative,
      ticketDetails,
      stationBonus,
      stationsPlaced,
      longestRoute: longestByPlayer[player.id],
      longestBonus,
      total,
    });
  }

  results.sort((a, b) => b.total - a.total);
  room.results = results;
}

function addLog(room, message) {
  room.log.push({ time: Date.now(), message });
  if (room.log.length > 100) room.log.shift();
}

function getPublicGameState(room, forPlayerId) {
  return {
    code: room.code,
    state: room.state,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      handCount: p.hand.length,
      ticketCount: p.tickets.length,
      trains: p.trains,
      stations: p.stations,
      claimedRoutes: p.claimedRoutes,
      placedStations: p.placedStations,
      score: p.score,
      connected: p.connected,
    })),
    currentPlayer: room.currentPlayer,
    turnPhase: room.turnPhase,
    faceUpCards: room.faceUpCards,
    drawPileCount: room.drawPile.length,
    ticketPileCount: room.ticketPile.length,
    claimedRoutes: room.claimedRoutes,
    log: room.log.slice(-20),
    chat: room.chat.slice(-50),
    lastRoundTriggeredBy: room.lastRoundTriggeredBy,
    results: room.results || null,
  };
}

function getPrivatePlayerState(player) {
  return {
    hand: player.hand,
    tickets: player.tickets,
  };
}

// --- Socket.io ---
io.on('connection', (socket) => {
  let currentRoom = null;

  // Crear sala
  socket.on('createRoom', (data) => {
    const name = (data.name || 'Jugador').substring(0, 20);
    const code = createRoom(socket.id, name);
    currentRoom = code;
    socket.join(code);
    socket.emit('roomCreated', { code });
    io.to(code).emit('lobbyUpdate', getLobbyState(rooms[code]));
  });

  // Unirse a sala
  socket.on('joinRoom', (data) => {
    const code = (data.code || '').toUpperCase();
    const name = (data.name || 'Jugador').substring(0, 20);
    const room = getRoom(code);

    if (!room) return socket.emit('error', { message: 'Sala no encontrada' });
    if (room.state !== 'waiting') return socket.emit('error', { message: 'La partida ya ha empezado' });
    if (room.players.length >= 5) return socket.emit('error', { message: 'Sala llena (máx. 5)' });
    if (room.players.some(p => p.id === socket.id)) return socket.emit('error', { message: 'Ya estás en esta sala' });

    room.players.push({
      id: socket.id,
      name,
      color: mapData.PLAYER_COLOR_LIST[room.players.length],
      hand: [],
      tickets: [],
      trains: 45,
      stations: 3,
      placedStations: [],
      claimedRoutes: [],
      score: 0,
      connected: true,
    });

    currentRoom = code;
    socket.join(code);
    socket.emit('roomJoined', { code });
    io.to(code).emit('lobbyUpdate', getLobbyState(room));
  });

  // Iniciar partida
  socket.on('startGame', () => {
    const room = getRoom(currentRoom);
    if (!room) return;
    if (room.players[0].id !== socket.id) return socket.emit('error', { message: 'Solo el anfitrión puede iniciar' });
    if (room.players.length < 2) return socket.emit('error', { message: 'Se necesitan al menos 2 jugadores' });

    initGame(room);

    // Enviar billetes iniciales a cada jugador
    for (const player of room.players) {
      const tickets = dealTickets(room, player, 3);
      player.pendingInitialTickets = tickets;
    }

    // Emitir estado
    for (const player of room.players) {
      const sock = io.sockets.sockets.get(player.id);
      if (sock) {
        sock.emit('gameStarted', {
          gameState: getPublicGameState(room, player.id),
          privateState: getPrivatePlayerState(player),
          initialTickets: player.pendingInitialTickets,
        });
      }
    }
  });

  // Elegir billetes iniciales (conservar al menos 2 de 3)
  socket.on('chooseInitialTickets', (data) => {
    const room = getRoom(currentRoom);
    if (!room) return;
    const player = getPlayerInRoom(room, socket.id);
    if (!player || !player.pendingInitialTickets) return;

    const kept = data.kept || [];
    if (kept.length < 2) return socket.emit('error', { message: 'Debes conservar al menos 2 billetes' });

    // Validar que los billetes elegidos están en los pendientes
    const pending = player.pendingInitialTickets;
    const keptTickets = [];
    for (const idx of kept) {
      if (idx >= 0 && idx < pending.length) {
        keptTickets.push(pending[idx]);
      }
    }

    if (keptTickets.length < 2) return socket.emit('error', { message: 'Selección inválida' });

    // Devolver los no elegidos al mazo
    for (let i = 0; i < pending.length; i++) {
      if (!kept.includes(i)) {
        room.ticketPile.unshift(pending[i]);
      }
    }

    player.tickets = keptTickets;
    player.pendingInitialTickets = null;

    addLog(room, `${player.name} eligió ${keptTickets.length} billetes iniciales`);

    // Notificar al jugador
    socket.emit('privateUpdate', getPrivatePlayerState(player));

    // Verificar si todos eligieron
    const allChosen = room.players.every(p => !p.pendingInitialTickets);
    if (allChosen) {
      addLog(room, '¡Todos los jugadores han elegido sus billetes! Comienza la partida.');
      broadcastGameState(room);
    } else {
      // Actualizar estado público
      broadcastGameState(room);
    }
  });

  // --- Acciones de turno ---

  // Robar carta del mazo
  socket.on('drawFromDeck', () => {
    const room = getRoom(currentRoom);
    if (!room || room.state !== 'playing' && room.state !== 'lastRound') return;
    const player = getCurrentPlayer(room, socket.id);
    if (!player) return;

    // ¿Aún hay billetes pendientes iniciales?
    if (room.players.some(p => p.pendingInitialTickets)) {
      return socket.emit('error', { message: 'Esperando a que todos elijan billetes iniciales' });
    }

    if (room.turnPhase === 'choosingTickets') {
      return socket.emit('error', { message: 'Debes elegir tus billetes primero' });
    }

    const card = drawCard(room);
    if (!card) return socket.emit('error', { message: 'No hay más cartas' });

    player.hand.push(card);

    if (room.turnPhase === 'drewOneCard') {
      // Segunda carta robada → fin de turno
      addLog(room, `${player.name} robó 2 cartas del mazo`);
      nextTurn(room);
    } else {
      room.turnPhase = 'drewOneCard';
    }

    socket.emit('privateUpdate', getPrivatePlayerState(player));
    broadcastGameState(room);
  });

  // Robar carta visible
  socket.on('drawFaceUp', (data) => {
    const room = getRoom(currentRoom);
    if (!room || room.state !== 'playing' && room.state !== 'lastRound') return;
    const player = getCurrentPlayer(room, socket.id);
    if (!player) return;

    if (room.players.some(p => p.pendingInitialTickets)) {
      return socket.emit('error', { message: 'Esperando a que todos elijan billetes iniciales' });
    }

    if (room.turnPhase === 'choosingTickets') {
      return socket.emit('error', { message: 'Debes elegir tus billetes primero' });
    }

    const index = data.index;
    if (index < 0 || index >= room.faceUpCards.length) return;

    const card = room.faceUpCards[index];

    // Locomotora como segunda carta: no permitido
    if (card === 'locomotora' && room.turnPhase === 'drewOneCard') {
      return socket.emit('error', { message: 'No puedes robar locomotora como segunda carta' });
    }

    player.hand.push(card);

    // Reponer carta visible
    const replacement = drawCard(room);
    if (replacement) {
      room.faceUpCards[index] = replacement;
    } else {
      room.faceUpCards.splice(index, 1);
    }
    checkFaceUpLocomotives(room);

    if (card === 'locomotora') {
      // Locomotora visible cuenta como 2 acciones → fin de turno
      addLog(room, `${player.name} robó una locomotora visible`);
      nextTurn(room);
    } else if (room.turnPhase === 'drewOneCard') {
      addLog(room, `${player.name} robó 2 cartas`);
      nextTurn(room);
    } else {
      room.turnPhase = 'drewOneCard';
    }

    socket.emit('privateUpdate', getPrivatePlayerState(player));
    broadcastGameState(room);
  });

  // Reclamar ruta
  socket.on('claimRoute', (data) => {
    const room = getRoom(currentRoom);
    if (!room || room.state !== 'playing' && room.state !== 'lastRound') return;
    const player = getCurrentPlayer(room, socket.id);
    if (!player) return;

    if (room.turnPhase) {
      return socket.emit('error', { message: 'Ya has empezado otra acción este turno' });
    }

    if (room.players.some(p => p.pendingInitialTickets)) {
      return socket.emit('error', { message: 'Esperando a que todos elijan billetes iniciales' });
    }

    const route = mapData.ROUTES.find(r => r.id === data.routeId);
    if (!route) return socket.emit('error', { message: 'Ruta no encontrada' });

    const validation = logic.canClaimRoute(
      route, player.hand, player.trains,
      room.claimedRoutes, socket.id, room.players.length
    );

    if (!validation.valid) {
      return socket.emit('error', { message: validation.reason });
    }

    // Usar la opción de cartas indicada por el jugador, o la primera disponible
    let option = data.option;
    if (!option) {
      option = validation.options[0];
    }

    // Validar la opción
    const handCopy = [...player.hand];
    const cardsToRemove = [];

    // Locomotoras
    for (let i = 0; i < option.locomotives; i++) {
      const idx = handCopy.indexOf('locomotora');
      if (idx === -1) return socket.emit('error', { message: 'No tienes suficientes locomotoras' });
      cardsToRemove.push(handCopy.splice(idx, 1)[0]);
    }

    // Cartas de color
    if (option.color !== 'locomotora') {
      for (let i = 0; i < option.colorCards; i++) {
        const idx = handCopy.indexOf(option.color);
        if (idx === -1) return socket.emit('error', { message: `No tienes suficientes cartas ${option.color}` });
        cardsToRemove.push(handCopy.splice(idx, 1)[0]);
      }
    }

    // Túnel: robar 3 cartas extra del mazo
    if (route.type === 'tunnel') {
      const tunnelCards = [];
      for (let i = 0; i < 3; i++) {
        const c = drawCard(room);
        if (c) tunnelCards.push(c);
      }

      // Contar cartas extra necesarias (las que coinciden con el color usado o son locomotoras)
      const matchColor = option.color === 'locomotora' ? null : option.color;
      let extraNeeded = 0;
      for (const c of tunnelCards) {
        if (c === 'locomotora' || (matchColor && c === matchColor)) {
          extraNeeded++;
        }
      }

      // Las cartas de túnel van al descarte
      room.discardPile.push(...tunnelCards);

      if (extraNeeded > 0) {
        // Verificar si el jugador puede pagar extra
        let canPayExtra = true;
        const handForExtra = [...handCopy]; // mano después de pagar las cartas base
        const extraCards = [];

        for (let i = 0; i < extraNeeded; i++) {
          let idx = matchColor ? handForExtra.indexOf(matchColor) : -1;
          if (idx === -1) idx = handForExtra.indexOf('locomotora');
          if (idx === -1) {
            canPayExtra = false;
            break;
          }
          extraCards.push(handForExtra.splice(idx, 1)[0]);
        }

        if (!canPayExtra) {
          addLog(room, `${player.name} intentó reclamar túnel ${route.cities[0]}-${route.cities[1]} pero falló (+${extraNeeded} extra)`);
          // No se recoge la ruta, el turno se pierde
          nextTurn(room);
          socket.emit('privateUpdate', getPrivatePlayerState(player));
          broadcastGameState(room);
          socket.emit('tunnelFailed', { tunnelCards, extraNeeded });
          return;
        }

        // Pagar las cartas extra
        cardsToRemove.push(...extraCards);
        socket.emit('tunnelSuccess', { tunnelCards, extraNeeded });
      } else {
        socket.emit('tunnelSuccess', { tunnelCards, extraNeeded: 0 });
      }
    }

    // Aplicar: quitar cartas de la mano
    for (const card of cardsToRemove) {
      const idx = player.hand.indexOf(card);
      if (idx !== -1) {
        player.hand.splice(idx, 1);
        room.discardPile.push(card);
      }
    }

    // Reclamar la ruta
    room.claimedRoutes[route.id] = socket.id;
    player.claimedRoutes.push(route.id);
    player.trains -= route.length;
    player.score += logic.getRoutePoints(route.length);

    addLog(room, `${player.name} reclamó ${route.cities[0]}→${route.cities[1]} (${route.length} trenes, +${logic.getRoutePoints(route.length)}pt)`);

    nextTurn(room);
    socket.emit('privateUpdate', getPrivatePlayerState(player));
    broadcastGameState(room);
  });

  // Robar billetes de destino
  socket.on('drawTickets', () => {
    const room = getRoom(currentRoom);
    if (!room || room.state !== 'playing' && room.state !== 'lastRound') return;
    const player = getCurrentPlayer(room, socket.id);
    if (!player) return;

    if (room.turnPhase) {
      return socket.emit('error', { message: 'Ya has empezado otra acción este turno' });
    }

    if (room.players.some(p => p.pendingInitialTickets)) {
      return socket.emit('error', { message: 'Esperando a que todos elijan billetes iniciales' });
    }

    if (room.ticketPile.length === 0) {
      return socket.emit('error', { message: 'No hay más billetes de destino' });
    }

    const tickets = dealTickets(room, player, 3);
    room.turnPhase = 'choosingTickets';
    room.pendingTickets = { playerId: socket.id, tickets };

    socket.emit('ticketsDrawn', { tickets });
    broadcastGameState(room);
  });

  // Elegir billetes robados (conservar al menos 1)
  socket.on('chooseTickets', (data) => {
    const room = getRoom(currentRoom);
    if (!room) return;
    if (room.turnPhase !== 'choosingTickets') return;
    if (!room.pendingTickets || room.pendingTickets.playerId !== socket.id) return;

    const player = getPlayerInRoom(room, socket.id);
    if (!player) return;

    const kept = data.kept || [];
    if (kept.length < 1) return socket.emit('error', { message: 'Debes conservar al menos 1 billete' });

    const pending = room.pendingTickets.tickets;
    const keptTickets = [];
    for (const idx of kept) {
      if (idx >= 0 && idx < pending.length) {
        keptTickets.push(pending[idx]);
      }
    }

    if (keptTickets.length < 1) return socket.emit('error', { message: 'Selección inválida' });

    // Devolver los no elegidos al fondo del mazo
    for (let i = 0; i < pending.length; i++) {
      if (!kept.includes(i)) {
        room.ticketPile.unshift(pending[i]);
      }
    }

    player.tickets.push(...keptTickets);
    addLog(room, `${player.name} robó ${keptTickets.length} billetes de destino`);

    nextTurn(room);
    socket.emit('privateUpdate', getPrivatePlayerState(player));
    broadcastGameState(room);
  });

  // Colocar estación
  socket.on('placeStation', (data) => {
    const room = getRoom(currentRoom);
    if (!room || room.state !== 'playing' && room.state !== 'lastRound') return;
    const player = getCurrentPlayer(room, socket.id);
    if (!player) return;

    if (room.turnPhase) {
      return socket.emit('error', { message: 'Ya has empezado otra acción este turno' });
    }

    if (player.stations <= 0) {
      return socket.emit('error', { message: 'No te quedan estaciones' });
    }

    const city = data.city;
    if (!mapData.CITIES[city]) {
      return socket.emit('error', { message: 'Ciudad no válida' });
    }

    // Verificar que no hay estación propia ya en esa ciudad
    if (player.placedStations.some(s => s.city === city)) {
      return socket.emit('error', { message: 'Ya tienes una estación en esa ciudad' });
    }

    // Verificar que ningún otro jugador tiene estación ahí
    for (const p of room.players) {
      if (p.id !== socket.id && p.placedStations.some(s => s.city === city)) {
        return socket.emit('error', { message: 'Otro jugador ya tiene una estación ahí' });
      }
    }

    // Coste: estación 1 → 1 carta, estación 2 → 2 cartas, estación 3 → 3 cartas
    const stationIndex = 3 - player.stations; // 0, 1, 2
    const cost = logic.stationCost(stationIndex);
    const option = data.option; // { color, count } o { locomotives }

    if (!option) {
      return socket.emit('error', { message: 'Debes indicar qué cartas usar' });
    }

    // Validar y quitar cartas
    const handCopy = [...player.hand];
    const cardsToRemove = [];

    if (option.color === 'locomotora') {
      for (let i = 0; i < cost; i++) {
        const idx = handCopy.indexOf('locomotora');
        if (idx === -1) return socket.emit('error', { message: 'No tienes suficientes locomotoras' });
        cardsToRemove.push(handCopy.splice(idx, 1)[0]);
      }
    } else {
      const locos = option.locomotives || 0;
      const colorCards = cost - locos;
      for (let i = 0; i < locos; i++) {
        const idx = handCopy.indexOf('locomotora');
        if (idx === -1) return socket.emit('error', { message: 'No tienes suficientes locomotoras' });
        cardsToRemove.push(handCopy.splice(idx, 1)[0]);
      }
      for (let i = 0; i < colorCards; i++) {
        const idx = handCopy.indexOf(option.color);
        if (idx === -1) return socket.emit('error', { message: `No tienes suficientes cartas ${option.color}` });
        cardsToRemove.push(handCopy.splice(idx, 1)[0]);
      }
    }

    // Aplicar
    for (const card of cardsToRemove) {
      const idx = player.hand.indexOf(card);
      if (idx !== -1) {
        player.hand.splice(idx, 1);
        room.discardPile.push(card);
      }
    }

    player.stations--;
    player.placedStations.push({ city });
    addLog(room, `${player.name} colocó una estación en ${city}`);

    nextTurn(room);
    socket.emit('privateUpdate', getPrivatePlayerState(player));
    broadcastGameState(room);
  });

  // Chat
  socket.on('chatMessage', (data) => {
    const room = getRoom(currentRoom);
    if (!room) return;
    const player = getPlayerInRoom(room, socket.id);
    if (!player) return;
    const msg = (data.message || '').substring(0, 200);
    if (!msg) return;
    room.chat.push({ name: player.name, color: player.color, message: msg, time: Date.now() });
    io.to(currentRoom).emit('chatUpdate', room.chat.slice(-50));
  });

  // Desconexión
  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    if (!room) return;
    const player = getPlayerInRoom(room, socket.id);
    if (player) {
      player.connected = false;
      if (room.state === 'waiting') {
        // Quitar jugador de la sala
        room.players = room.players.filter(p => p.id !== socket.id);
        if (room.players.length === 0) {
          delete rooms[currentRoom];
        } else {
          io.to(currentRoom).emit('lobbyUpdate', getLobbyState(room));
        }
      } else {
        addLog(room, `${player.name} se desconectó`);
        broadcastGameState(room);
      }
    }
  });

  // --- Helpers ---
  function getCurrentPlayer(room, socketId) {
    const current = room.players[room.currentPlayer];
    if (current && current.id === socketId) return current;
    socket.emit('error', { message: 'No es tu turno' });
    return null;
  }

  function broadcastGameState(room) {
    for (const player of room.players) {
      const sock = io.sockets.sockets.get(player.id);
      if (sock) {
        sock.emit('gameState', getPublicGameState(room, player.id));
      }
    }
  }
});

function getLobbyState(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({ name: p.name, color: p.color, id: p.id })),
  };
}

// --- Arrancar servidor ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚂 Raíles de Europa corriendo en http://localhost:${PORT}`);
});
