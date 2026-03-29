// ============================================================
// game.js — Cliente del juego: renderizado SVG, Socket.io, UI
// ============================================================

(function () {
  'use strict';

  const socket = io();

  // --- Estado local ---
  let gameState = null;
  let privateState = { hand: [], tickets: [] };
  let myId = null;
  let mapRendered = false;

  // Colores visuales de jugadores
  const PLAYER_COLORS_VIS = {
    'rojo': '#e74c3c', 'azul': '#3498db', 'verde': '#2ecc71',
    'amarillo': '#f39c12', 'negro': '#34495e'
  };

  // Colores de cartas (para renderizado)
  const CARD_COLORS_VIS = {
    'rojo': '#dc3545', 'azul': '#2980b9', 'verde': '#27ae60',
    'amarillo': '#f1c40f', 'negro': '#2c3e50', 'blanco': '#bdc3c7',
    'naranja': '#e67e22', 'rosa': '#e84393', 'gris': '#7f8c8d',
    'locomotora': '#8e44ad'
  };

  // Flag para mostrar ayuda automática la primera vez que sea tu turno
  let helpShownOnce = false;

  // --- Inicialización ---
  socket.on('connect', () => {
    myId = socket.id;
    console.log('[CLIENT] Conectado con socket.id:', myId);

    // Recuperar info de rejoin de sessionStorage
    const roomCode = sessionStorage.getItem('roomCode');
    const playerName = sessionStorage.getItem('playerName');

    if (roomCode && playerName) {
      // Emitir rejoin para que el servidor actualice nuestro socket.id
      console.log(`[CLIENT] Enviando rejoin: sala=${roomCode}, nombre=${playerName}`);
      socket.emit('rejoinGame', { code: roomCode, name: playerName });
    }
  });

  // Respuesta de rejoin exitoso: el servidor nos envía estado fresco
  socket.on('rejoinComplete', (data) => {
    console.log('[CLIENT] Rejoin completado, recibido estado');
    gameState = data.gameState;
    privateState = data.privateState;

    renderMap();
    updateUI();

    // Si hay billetes iniciales pendientes, mostrar modal
    if (data.initialTickets && data.initialTickets.length > 0) {
      showInitialTicketModal(data.initialTickets);
    }
  });

  // --- Eventos del servidor ---
  socket.on('gameState', (state) => {
    gameState = state;
    if (!mapRendered) renderMap();
    updateUI();

    if (state.state === 'finished' && state.results) {
      showResults(state.results);
    }
  });

  socket.on('privateUpdate', (state) => {
    privateState = state;
    updateHandUI();
    updateTicketsUI();
  });

  socket.on('gameStarted', (data) => {
    gameState = data.gameState;
    privateState = data.privateState;
    renderMap();
    updateUI();
    if (data.initialTickets && data.initialTickets.length > 0) {
      showInitialTicketModal(data.initialTickets);
    }
  });

  socket.on('ticketsDrawn', (data) => {
    showTicketChoiceModal(data.tickets, 1);
  });

  socket.on('tunnelFailed', (data) => {
    showInfoModal(
      'Túnel fallido',
      `Se revelaron ${data.tunnelCards.length} cartas: ${data.tunnelCards.join(', ')}. Necesitabas ${data.extraNeeded} carta(s) extra que no tenías. Pierdes el turno.`
    );
  });

  socket.on('tunnelSuccess', (data) => {
    if (data.extraNeeded > 0) {
      showInfoModal(
        'Túnel superado',
        `Se revelaron cartas de túnel. Pagaste ${data.extraNeeded} carta(s) extra.`
      );
    }
  });

  socket.on('chatUpdate', (chat) => {
    if (gameState) gameState.chat = chat;
    updateChatUI();
  });

  socket.on('error', (data) => {
    showToast(data.message);
  });

  // --- Renderizado del mapa SVG ---
  function renderMap() {
    if (mapRendered) { updateMapClaims(); return; }
    mapRendered = true;

    const svg = document.getElementById('mapSvg');
    svg.innerHTML = '';

    // --- Fondo cartográfico estilo mapa antiguo ---
    const defs = createSVG('defs', {});

    // Gradiente para el océano
    const oceanGrad = createSVG('radialGradient', {
      id: 'oceanGradient', cx: '40%', cy: '40%', r: '70%'
    });
    const stop1 = createSVG('stop', { offset: '0%', 'stop-color': '#d6eef8' });
    const stop2 = createSVG('stop', { offset: '100%', 'stop-color': '#b4d8ec' });
    oceanGrad.appendChild(stop1);
    oceanGrad.appendChild(stop2);
    defs.appendChild(oceanGrad);

    // Patrón sutil de cuadrícula cartográfica
    const gridPat = createSVG('pattern', {
      id: 'gridPattern', width: 40, height: 40, patternUnits: 'userSpaceOnUse'
    });
    const gridLine1 = createSVG('line', {
      x1: 0, y1: 0, x2: 40, y2: 0,
      stroke: '#c2dce8', 'stroke-width': 0.3, opacity: 0.5
    });
    const gridLine2 = createSVG('line', {
      x1: 0, y1: 0, x2: 0, y2: 40,
      stroke: '#c2dce8', 'stroke-width': 0.3, opacity: 0.5
    });
    gridPat.appendChild(gridLine1);
    gridPat.appendChild(gridLine2);
    defs.appendChild(gridPat);
    svg.appendChild(defs);

    // Océano de fondo
    const bg = createSVG('rect', {
      x: 0, y: 0, width: 900, height: 650,
      fill: 'url(#oceanGradient)'
    });
    svg.appendChild(bg);

    // Cuadrícula cartográfica sobre el mar
    const grid = createSVG('rect', {
      x: 0, y: 0, width: 900, height: 650,
      fill: 'url(#gridPattern)'
    });
    svg.appendChild(grid);

    // Masas de tierra — polígonos de Europa simplificados
    const landGroup = createSVG('g', { id: 'landMasses' });

    // Escandinavia / Norte
    const scandinavia = createSVG('path', {
      d: `M430,20 L460,25 Q490,30 510,55 L520,80 Q525,100 510,120
          L490,130 Q470,105 455,80 Q440,55 430,20 Z`,
      fill: '#e8dcc8', stroke: '#d4c4a8', 'stroke-width': 0.8, opacity: 0.7
    });
    landGroup.appendChild(scandinavia);

    // Islas Británicas
    const britain = createSVG('path', {
      d: `M165,95 Q175,85 195,90 L210,105 Q225,115 230,140
          L240,170 Q250,195 245,215 L235,230 Q220,240 205,235
          L190,220 Q180,200 175,175 Q170,150 168,125 L165,95 Z`,
      fill: '#e8dcc8', stroke: '#d4c4a8', 'stroke-width': 0.8, opacity: 0.7
    });
    landGroup.appendChild(britain);

    // Irlanda
    const ireland = createSVG('path', {
      d: `M140,145 Q150,135 165,140 L170,160 Q172,175 165,185
          L155,190 Q142,185 138,170 L140,145 Z`,
      fill: '#e8dcc8', stroke: '#d4c4a8', 'stroke-width': 0.8, opacity: 0.7
    });
    landGroup.appendChild(ireland);

    // Europa continental principal
    const continental = createSVG('path', {
      d: `M230,220 Q260,210 290,205 L340,195 Q380,185 420,190
          L480,185 Q530,175 580,165 L640,145 Q680,130 720,115
          L760,105 Q800,100 840,115 L870,140 Q880,170 870,210
          L860,260 Q850,300 840,340 L830,380 Q825,410 840,440
          L850,470 Q845,500 820,510 L790,500 Q760,490 740,470
          L720,460 Q700,455 680,460 L660,470 Q640,490 620,510
          L600,530 Q580,540 560,535 L540,520 Q520,500 500,490
          L480,480 Q460,475 440,480 L420,490 Q400,500 380,495
          L360,480 Q340,470 320,460 L300,450 Q280,440 260,430
          L240,420 Q220,400 210,375 L200,345 Q195,315 200,285
          L210,260 Q220,240 230,220 Z`,
      fill: '#e8dcc8', stroke: '#d4c4a8', 'stroke-width': 0.8, opacity: 0.7
    });
    landGroup.appendChild(continental);

    // Península Ibérica
    const iberia = createSVG('path', {
      d: `M50,430 Q60,400 80,380 L110,370 Q140,365 170,370
          L210,380 Q240,385 265,400 L285,420 Q295,440 290,465
          L280,490 Q270,515 250,530 L220,540 Q190,550 160,545
          L130,535 Q100,525 80,510 L60,490 Q45,465 50,430 Z`,
      fill: '#e8dcc8', stroke: '#d4c4a8', 'stroke-width': 0.8, opacity: 0.7
    });
    landGroup.appendChild(iberia);

    // Italia
    const italy = createSVG('path', {
      d: `M380,390 Q390,400 400,420 L410,445 Q420,470 430,490
          L440,515 Q445,535 440,555 L435,570 Q425,580 415,575
          L405,560 Q400,540 405,520 L400,500 Q390,480 380,460
          L370,435 Q365,415 370,400 L380,390 Z`,
      fill: '#e8dcc8', stroke: '#d4c4a8', 'stroke-width': 0.8, opacity: 0.7
    });
    landGroup.appendChild(italy);

    // Sicilia
    const sicily = createSVG('path', {
      d: `M400,580 Q415,570 430,575 L440,585 Q435,600 420,605
          L405,600 Q395,590 400,580 Z`,
      fill: '#e8dcc8', stroke: '#d4c4a8', 'stroke-width': 0.8, opacity: 0.7
    });
    landGroup.appendChild(sicily);

    // Grecia / Balcanes sur
    const greece = createSVG('path', {
      d: `M580,470 Q590,480 600,500 L610,520 Q615,540 605,555
          L595,560 Q585,550 580,535 L575,510 Q572,490 580,470 Z`,
      fill: '#e8dcc8', stroke: '#d4c4a8', 'stroke-width': 0.8, opacity: 0.7
    });
    landGroup.appendChild(greece);

    // Turquía / Anatolia
    const turkey = createSVG('path', {
      d: `M680,410 Q710,405 740,410 L780,420 Q810,430 840,445
          L860,460 Q870,475 860,490 L840,500 Q810,510 780,505
          L750,500 Q720,495 700,485 L680,470 Q670,450 680,410 Z`,
      fill: '#e8dcc8', stroke: '#d4c4a8', 'stroke-width': 0.8, opacity: 0.7
    });
    landGroup.appendChild(turkey);

    // Rusia (parte visible)
    const russia = createSVG('path', {
      d: `M620,30 Q660,20 700,25 L750,40 Q800,55 840,80
          L870,110 Q890,140 880,180 L870,210 Q860,180 840,160
          L810,140 Q780,130 750,125 L710,120 Q680,118 650,110
          L630,95 Q615,75 620,50 L620,30 Z`,
      fill: '#e8dcc8', stroke: '#d4c4a8', 'stroke-width': 0.8, opacity: 0.7
    });
    landGroup.appendChild(russia);

    // Norte de África (decorativo, borde inferior)
    const africa = createSVG('path', {
      d: `M0,620 Q50,600 120,610 L200,615 Q300,610 400,620
          L500,625 Q600,620 700,630 L800,635 Q870,630 900,640
          L900,650 L0,650 Z`,
      fill: '#e8dcc8', stroke: '#d4c4a8', 'stroke-width': 0.8, opacity: 0.5
    });
    landGroup.appendChild(africa);

    svg.appendChild(landGroup);

    // Líneas de latitud/longitud decorativas (más visibles sobre tierra)
    const decoGroup = createSVG('g', { opacity: 0.15 });
    for (let lat = 100; lat < 650; lat += 100) {
      const latLine = createSVG('line', {
        x1: 0, y1: lat, x2: 900, y2: lat,
        stroke: '#8ba59a', 'stroke-width': 0.4, 'stroke-dasharray': '8 4'
      });
      decoGroup.appendChild(latLine);
    }
    for (let lon = 100; lon < 900; lon += 100) {
      const lonLine = createSVG('line', {
        x1: lon, y1: 0, x2: lon, y2: 650,
        stroke: '#8ba59a', 'stroke-width': 0.4, 'stroke-dasharray': '8 4'
      });
      decoGroup.appendChild(lonLine);
    }
    svg.appendChild(decoGroup);

    // Rosa de los vientos decorativa (esquina inferior izquierda)
    const compass = createSVG('text', {
      x: 30, y: 635, 'font-size': '14px', fill: '#b8a88c',
      'font-family': 'serif', 'font-style': 'italic', opacity: 0.6
    });
    compass.textContent = '🧭 N';
    svg.appendChild(compass);

    // Grupo de rutas (debajo de ciudades)
    const routeGroup = createSVG('g', { id: 'routeGroup' });
    svg.appendChild(routeGroup);

    // Grupo de estaciones
    const stationGroup = createSVG('g', { id: 'stationGroup' });
    svg.appendChild(stationGroup);

    // Grupo de ciudades (encima)
    const cityGroup = createSVG('g', { id: 'cityGroup' });
    svg.appendChild(cityGroup);

    // Dibujar rutas
    for (const route of ROUTES) {
      drawRoute(routeGroup, route);
    }

    // Dibujar ciudades
    for (const [name, pos] of Object.entries(CITIES)) {
      drawCity(cityGroup, name, pos);
    }

    updateMapClaims();
  }

  function drawRoute(group, route) {
    const c1 = CITIES[route.cities[0]];
    const c2 = CITIES[route.cities[1]];
    if (!c1 || !c2) return;

    // Offset para rutas dobles
    let offsetX = 0, offsetY = 0;
    if (route.double) {
      const dx = c2.x - c1.x;
      const dy = c2.y - c1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len;
      const ny = dx / len;
      offsetX = nx * 5;
      offsetY = ny * 5;
    } else {
      // Verificar si tiene paralela y mover esta también
      const hasDouble = ROUTES.some(r =>
        r.id !== route.id && r.double &&
        ((r.cities[0] === route.cities[0] && r.cities[1] === route.cities[1]) ||
         (r.cities[0] === route.cities[1] && r.cities[1] === route.cities[0]))
      );
      if (hasDouble) {
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len;
        const ny = dx / len;
        offsetX = -nx * 5;
        offsetY = -ny * 5;
      }
    }

    const x1 = c1.x + offsetX;
    const y1 = c1.y + offsetY;
    const x2 = c2.x + offsetX;
    const y2 = c2.y + offsetY;

    // Dibujar segmentos de vagón a lo largo de la ruta
    const dx = x2 - x1;
    const dy = y2 - y1;
    const totalLen = Math.sqrt(dx * dx + dy * dy);
    const segLen = totalLen / route.length;
    const ux = dx / totalLen;
    const uy = dy / totalLen;

    const routeColor = CARD_COLORS_VIS[route.color] || '#7f8c8d';

    // Grupo de la ruta completa
    const routeG = createSVG('g', {
      id: `route-${route.id}`,
      class: 'route-group',
      'data-route-id': route.id,
      cursor: 'pointer',
    });

    // Línea de fondo (para clickeo más fácil)
    const bgLine = createSVG('line', {
      x1, y1, x2, y2,
      stroke: 'transparent',
      'stroke-width': 16,
      class: 'route-hitarea',
    });
    routeG.appendChild(bgLine);

    // Segmentos de vagón
    for (let i = 0; i < route.length; i++) {
      const startX = x1 + ux * (i * segLen + 2);
      const startY = y1 + uy * (i * segLen + 2);
      const endX = x1 + ux * ((i + 1) * segLen - 2);
      const endY = y1 + uy * ((i + 1) * segLen - 2);

      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const wLen = segLen - 4;
      const wHeight = 7;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;

      const wagon = createSVG('rect', {
        x: midX - wLen / 2,
        y: midY - wHeight / 2,
        width: wLen,
        height: wHeight,
        rx: 3, ry: 3,
        fill: routeColor,
        stroke: 'rgba(0,0,0,0.2)',
        'stroke-width': 1,
        opacity: 0.5,
        transform: `rotate(${angle} ${midX} ${midY})`,
        class: 'route-wagon',
        'data-route-id': route.id,
        'data-segment': i,
      });
      routeG.appendChild(wagon);
    }

    // Marcador de tipo (túnel/ferry)
    if (route.type === 'tunnel' || route.type === 'ferry') {
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const label = route.type === 'tunnel' ? '⛰' : '⚓';
      const marker = createSVG('text', {
        x: midX,
        y: midY - 8,
        class: route.type === 'tunnel' ? 'tunnel-marker' : 'ferry-marker',
        'font-size': '9px',
        'text-anchor': 'middle',
      });
      marker.textContent = label;
      routeG.appendChild(marker);
    }

    // Evento click en ruta
    routeG.addEventListener('click', () => onRouteClick(route));

    group.appendChild(routeG);
  }

  function drawCity(group, name, pos) {
    // Círculo de la ciudad
    const dot = createSVG('circle', {
      cx: pos.x, cy: pos.y, r: 6,
      class: 'city-dot',
      'data-city': name,
    });
    dot.addEventListener('click', () => onCityClick(name));
    group.appendChild(dot);

    // Etiqueta
    const label = createSVG('text', {
      x: pos.x,
      y: pos.y - 10,
      class: 'city-label',
    });
    label.textContent = name;
    group.appendChild(label);
  }

  function updateMapClaims() {
    if (!gameState) return;

    // Actualizar vagones reclamados
    for (const route of ROUTES) {
      const routeG = document.getElementById(`route-${route.id}`);
      if (!routeG) continue;

      const claimedBy = gameState.claimedRoutes[route.id];
      const wagons = routeG.querySelectorAll('.route-wagon');

      if (claimedBy) {
        // Encontrar color del jugador
        const player = gameState.players.find(p => p.id === claimedBy);
        const playerColor = player ? PLAYER_COLORS_VIS[player.color] : '#666';

        wagons.forEach((w, i) => {
          w.setAttribute('fill', playerColor);
          w.setAttribute('opacity', '1');
          w.setAttribute('stroke', 'rgba(255,255,255,0.6)');
          w.setAttribute('stroke-width', '2');
          if (!w.classList.contains('claimed')) {
            w.classList.add('claimed', 'wagon-animate');
            w.style.animationDelay = `${i * 0.1}s`;
          }
        });
      }
    }

    // Actualizar estaciones
    const stationGroup = document.getElementById('stationGroup');
    if (stationGroup) {
      stationGroup.innerHTML = '';
      for (const player of gameState.players) {
        if (!player.placedStations) continue;
        for (const station of player.placedStations) {
          if (!station.city || !CITIES[station.city]) continue;
          const pos = CITIES[station.city];
          const marker = createSVG('rect', {
            x: pos.x - 5, y: pos.y + 8,
            width: 10, height: 10,
            rx: 2, ry: 2,
            fill: PLAYER_COLORS_VIS[player.color],
            stroke: '#fff',
            'stroke-width': 1.5,
            class: 'station-marker',
          });
          stationGroup.appendChild(marker);
        }
      }
    }
  }

  // --- Actualización de UI ---
  function updateUI() {
    if (!gameState) return;

    updateTurnBanner();
    updateFaceUpCards();
    updateHandUI();
    updateTicketsUI();
    updateScoreboard();
    updateLog();
    updateChatUI();
    updateDeckCounts();
    updateStationsInfo();
    updateMapClaims();
  }

  function updateTurnBanner() {
    const banner = document.getElementById('turnBanner');
    const dot = document.getElementById('turnDot');
    const text = document.getElementById('turnText');

    if (gameState.state === 'finished') {
      text.textContent = '¡Partida terminada!';
      dot.style.background = 'var(--gold)';
      return;
    }

    // Verificar si esperando billetes iniciales
    const waitingInitial = gameState.players.some(p => {
      // No podemos saber directamente, pero si el turno no avanza...
    });

    const current = gameState.players[gameState.currentPlayer];
    if (!current) return;

    dot.style.background = PLAYER_COLORS_VIS[current.color];

    if (current.id === myId) {
      text.textContent = '¡Tu turno!';
      banner.classList.add('your-turn-glow');
      // Mostrar ayuda automáticamente la primera vez que sea tu turno
      if (!helpShownOnce && !gameState.turnPhase) {
        helpShownOnce = true;
        showHelpModal();
      }
    } else {
      text.textContent = `Turno de ${current.name}`;
      banner.classList.remove('your-turn-glow');
    }

    if (gameState.state === 'lastRound') {
      text.textContent += ' (Última ronda)';
    }

    if (gameState.turnPhase === 'drewOneCard' && current.id === myId) {
      text.textContent = 'Roba tu segunda carta';
    }
    if (gameState.turnPhase === 'choosingTickets' && current.id === myId) {
      text.textContent = 'Elige tus billetes';
    }
  }

  function updateFaceUpCards() {
    const container = document.getElementById('faceUpCards');
    container.innerHTML = '';

    for (let i = 0; i < (gameState.faceUpCards || []).length; i++) {
      const card = gameState.faceUpCards[i];
      const div = document.createElement('div');
      div.className = `card-slot${card === 'locomotora' ? ' locomotive' : ''}`;
      div.style.background = card === 'locomotora' ? '' : CARD_COLORS_VIS[card];
      div.textContent = card === 'locomotora' ? 'LOCO' : card.substring(0, 3).toUpperCase();
      div.title = `Robar: ${card}`;
      div.addEventListener('click', () => {
        socket.emit('drawFaceUp', { index: i });
      });
      container.appendChild(div);
    }
  }

  function updateHandUI() {
    const container = document.getElementById('handCards');
    container.innerHTML = '';

    // Agrupar cartas
    const counts = {};
    for (const card of privateState.hand) {
      counts[card] = (counts[card] || 0) + 1;
    }

    // Ordenar
    const order = ['rojo', 'azul', 'verde', 'amarillo', 'negro', 'blanco', 'naranja', 'rosa', 'locomotora'];
    for (const color of order) {
      const count = counts[color];
      if (!count) continue;
      for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = `hand-card${color === 'locomotora' ? ' locomotive' : ''}`;
        div.style.background = color === 'locomotora' ? '' : CARD_COLORS_VIS[color];
        div.textContent = color === 'locomotora' ? 'L' : count;
        div.title = `${color} (${count})`;
        container.appendChild(div);
        break; // Solo 1 div por color, mostrar count
      }
      // Mostrar como badge
      const lastDiv = container.lastChild;
      if (lastDiv && count > 1) {
        lastDiv.textContent = count;
      } else if (lastDiv) {
        lastDiv.textContent = color === 'locomotora' ? 'L' : '1';
      }
    }
  }

  function updateTicketsUI() {
    const container = document.getElementById('ticketsList');
    container.innerHTML = '';

    for (const ticket of privateState.tickets) {
      const div = document.createElement('div');
      div.className = 'ticket-item';

      // Verificar si está completado (aproximación simple cliente)
      const myPlayer = gameState ? gameState.players.find(p => p.id === myId) : null;
      if (myPlayer) {
        const graph = GameLogic.buildPlayerGraph(
          myPlayer.claimedRoutes, ROUTES, myId,
          myPlayer.placedStations, gameState.claimedRoutes
        );
        const completed = GameLogic.hasPath(graph, ticket.from, ticket.to);
        if (completed) div.classList.add('completed');
      }

      div.innerHTML = `
        <span class="ticket-cities">${ticket.from} → ${ticket.to}</span>
        <span class="ticket-points">${ticket.points}</span>
      `;
      container.appendChild(div);
    }
  }

  function updateScoreboard() {
    const container = document.getElementById('scoreboard');
    container.innerHTML = '';

    for (let i = 0; i < gameState.players.length; i++) {
      const p = gameState.players[i];
      const div = document.createElement('div');
      div.className = `score-row${i === gameState.currentPlayer ? ' active-turn' : ''}`;

      div.innerHTML = `
        <span class="score-dot" style="background:${PLAYER_COLORS_VIS[p.color]}"></span>
        <span class="score-name${!p.connected ? ' disconnected' : ''}">${p.name}${p.id === myId ? ' (tú)' : ''}</span>
        <span class="score-info">
          <span title="Trenes restantes">🚂${p.trains}</span>
          <span title="Estaciones">🏠${p.stations}</span>
          <span title="Cartas en mano">🃏${p.handCount}</span>
        </span>
        <span class="score-pts">${p.score}pt</span>
      `;
      container.appendChild(div);
    }
  }

  function updateLog() {
    const container = document.getElementById('logArea');
    container.innerHTML = '';
    for (const entry of (gameState.log || [])) {
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.textContent = entry.message;
      container.appendChild(div);
    }
    container.scrollTop = container.scrollHeight;
  }

  function updateChatUI() {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    for (const msg of (gameState.chat || [])) {
      const div = document.createElement('div');
      div.className = 'chat-msg';
      div.innerHTML = `<span class="chat-name" style="color:${PLAYER_COLORS_VIS[msg.color]}">${msg.name}:</span> ${escapeHtml(msg.message)}`;
      container.appendChild(div);
    }
    container.scrollTop = container.scrollHeight;
  }

  function updateDeckCounts() {
    document.getElementById('deckCount').textContent = gameState.drawPileCount || 0;
    document.getElementById('ticketCount').textContent = gameState.ticketPileCount || 0;
  }

  function updateStationsInfo() {
    const myPlayer = gameState.players.find(p => p.id === myId);
    if (!myPlayer) return;
    document.getElementById('stationsInfo').textContent =
      `${myPlayer.stations} restantes (clic en ciudad para colocar)`;
  }

  // --- Eventos de clic ---
  function onRouteClick(route) {
    if (!gameState || gameState.state === 'finished') return;
    const current = gameState.players[gameState.currentPlayer];
    if (!current || current.id !== myId) return showToast('No es tu turno');
    if (gameState.turnPhase) return showToast('Termina tu acción actual primero');

    // ¿Ya reclamada?
    if (gameState.claimedRoutes[route.id]) return showToast('Ruta ya reclamada');

    // Calcular opciones
    GameLogic.setMapData({ ROUTES });
    const validation = GameLogic.canClaimRoute(
      route, privateState.hand, current.trains,
      gameState.claimedRoutes, myId, gameState.players.length
    );

    if (!validation.valid) return showToast(validation.reason);

    if (validation.options.length === 1) {
      // Solo una opción, reclamar directamente
      socket.emit('claimRoute', { routeId: route.id, option: validation.options[0] });
    } else {
      // Mostrar modal de opciones
      showClaimModal(route, validation.options);
    }
  }

  function onCityClick(cityName) {
    if (!gameState || gameState.state === 'finished') return;
    const current = gameState.players[gameState.currentPlayer];
    if (!current || current.id !== myId) return;
    if (gameState.turnPhase) return;

    const myPlayer = gameState.players.find(p => p.id === myId);
    if (!myPlayer || myPlayer.stations <= 0) return;

    // Mostrar modal para colocar estación
    showStationModal(cityName);
  }

  // --- Acciones de botones ---
  document.getElementById('btnDrawDeck').addEventListener('click', () => {
    socket.emit('drawFromDeck');
  });

  document.getElementById('btnDrawTickets').addEventListener('click', () => {
    socket.emit('drawTickets');
  });

  // Botón de ayuda
  document.getElementById('btnHelp').addEventListener('click', showHelpModal);

  // Chat
  document.getElementById('btnChat').addEventListener('click', sendChat);
  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit('chatMessage', { message: msg });
    input.value = '';
  }

  // --- Modales ---
  function showModal(html) {
    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalOverlay').style.display = 'flex';
  }

  function hideModal() {
    document.getElementById('modalOverlay').style.display = 'none';
  }

  function showInitialTicketModal(tickets) {
    let html = '<h3>Elige tus billetes iniciales</h3>';
    html += '<p style="font-size:0.85rem;color:var(--text-dim);margin-bottom:1rem">Debes conservar al menos 2 de 3</p>';

    tickets.forEach((t, i) => {
      html += `
        <div class="modal-ticket selected" data-idx="${i}" onclick="toggleTicket(this)">
          <input type="checkbox" checked data-idx="${i}">
          <div class="modal-ticket-info">
            <div class="modal-ticket-cities">${t.from} → ${t.to}</div>
          </div>
          <div class="modal-ticket-points">${t.points}pt</div>
        </div>`;
    });

    html += `
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="confirmInitialTickets()">Confirmar</button>
      </div>`;

    showModal(html);
  }

  // Funciones globales para modales
  window.toggleTicket = function (el) {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    el.classList.toggle('selected', cb.checked);
  };

  window.confirmInitialTickets = function () {
    const checkboxes = document.querySelectorAll('.modal-ticket input[type="checkbox"]');
    const kept = [];
    checkboxes.forEach((cb) => {
      if (cb.checked) kept.push(parseInt(cb.dataset.idx));
    });

    if (kept.length < 2) return showToast('Debes conservar al menos 2 billetes');

    socket.emit('chooseInitialTickets', { kept });
    hideModal();
  };

  function showTicketChoiceModal(tickets, minKeep) {
    let html = `<h3>Nuevos billetes de destino</h3>`;
    html += `<p style="font-size:0.85rem;color:var(--text-dim);margin-bottom:1rem">Conserva al menos ${minKeep}</p>`;

    tickets.forEach((t, i) => {
      html += `
        <div class="modal-ticket selected" data-idx="${i}" onclick="toggleTicket(this)">
          <input type="checkbox" checked data-idx="${i}">
          <div class="modal-ticket-info">
            <div class="modal-ticket-cities">${t.from} → ${t.to}</div>
          </div>
          <div class="modal-ticket-points">${t.points}pt</div>
        </div>`;
    });

    html += `
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="confirmDrawnTickets(${minKeep})">Confirmar</button>
      </div>`;

    showModal(html);
  }

  window.confirmDrawnTickets = function (minKeep) {
    const checkboxes = document.querySelectorAll('.modal-ticket input[type="checkbox"]');
    const kept = [];
    checkboxes.forEach((cb) => {
      if (cb.checked) kept.push(parseInt(cb.dataset.idx));
    });

    if (kept.length < minKeep) return showToast(`Debes conservar al menos ${minKeep} billete(s)`);

    socket.emit('chooseTickets', { kept });
    hideModal();
  };

  function showClaimModal(route, options) {
    let html = `<h3>Reclamar ${route.cities[0]} → ${route.cities[1]}</h3>`;
    html += `<p style="font-size:0.85rem;color:var(--text-dim);margin-bottom:1rem">${route.length} vagones · Color: ${route.color}${route.type === 'tunnel' ? ' · Túnel ⛰' : ''}${route.type === 'ferry' ? ' · Ferry ⚓' : ''}</p>`;

    options.forEach((opt, i) => {
      const desc = opt.color === 'locomotora'
        ? `${opt.locomotives} locomotora(s)`
        : `${opt.colorCards} ${opt.color} + ${opt.locomotives} locomotora(s)`;

      html += `
        <div class="claim-option${i === 0 ? ' selected' : ''}" data-idx="${i}" onclick="selectClaimOption(this, ${i})">
          ${desc}
        </div>`;
    });

    html += `
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="hideModalGlobal()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmClaim('${route.id}')">Reclamar</button>
      </div>`;

    showModal(html);
    window._claimOptions = options;
    window._selectedClaimOption = 0;
  }

  window.selectClaimOption = function (el, idx) {
    document.querySelectorAll('.claim-option').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    window._selectedClaimOption = idx;
  };

  window.confirmClaim = function (routeId) {
    const option = window._claimOptions[window._selectedClaimOption];
    socket.emit('claimRoute', { routeId, option });
    hideModal();
  };

  window.hideModalGlobal = hideModal;

  function showStationModal(cityName) {
    const myPlayer = gameState.players.find(p => p.id === myId);
    if (!myPlayer) return;

    const stationIndex = 3 - myPlayer.stations;
    const cost = GameLogic.stationCost(stationIndex);

    // Obtener cartas disponibles
    const counts = {};
    for (const card of privateState.hand) {
      counts[card] = (counts[card] || 0) + 1;
    }

    let html = `<h3>Colocar estación en ${cityName}</h3>`;
    html += `<p style="font-size:0.85rem;color:var(--text-dim);margin-bottom:1rem">Coste: ${cost} carta(s) del mismo color</p>`;

    // Opciones: cada color que tenga suficientes cartas
    const options = [];
    const colors = ['rojo', 'azul', 'verde', 'amarillo', 'negro', 'blanco', 'naranja', 'rosa'];
    for (const color of colors) {
      if ((counts[color] || 0) >= cost) {
        options.push({ color, locomotives: 0 });
      }
    }
    // Locomotoras
    if ((counts['locomotora'] || 0) >= cost) {
      options.push({ color: 'locomotora', locomotives: cost });
    }
    // Mix con locomotoras
    for (const color of colors) {
      const colorCount = counts[color] || 0;
      const locoCount = counts['locomotora'] || 0;
      if (colorCount > 0 && colorCount < cost && colorCount + locoCount >= cost) {
        options.push({ color, locomotives: cost - colorCount });
      }
    }

    if (options.length === 0) {
      html += '<p style="color:var(--danger)">No tienes suficientes cartas</p>';
      html += `<div class="modal-actions"><button class="btn btn-secondary" onclick="hideModalGlobal()">Cerrar</button></div>`;
      showModal(html);
      return;
    }

    options.forEach((opt, i) => {
      const desc = opt.color === 'locomotora'
        ? `${opt.locomotives} locomotora(s)`
        : `${cost - opt.locomotives} ${opt.color}${opt.locomotives > 0 ? ` + ${opt.locomotives} loco` : ''}`;
      html += `
        <div class="claim-option${i === 0 ? ' selected' : ''}" data-idx="${i}" onclick="selectClaimOption(this, ${i})">
          ${desc}
        </div>`;
    });

    html += `
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="hideModalGlobal()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmStation('${cityName}')">Colocar</button>
      </div>`;

    showModal(html);
    window._stationOptions = options;
    window._selectedClaimOption = 0;
  }

  window.confirmStation = function (cityName) {
    const option = window._stationOptions[window._selectedClaimOption];
    socket.emit('placeStation', { city: cityName, option });
    hideModal();
  };

  // --- Popup de ayuda "Cómo jugar" ---
  function showHelpModal() {
    showModal(`
      <h3>Como jugar tu turno</h3>
      <div style="font-size:0.85rem; line-height:1.6; color:var(--text)">

        <p style="margin-bottom:0.8rem; color:var(--text-dim)">En tu turno debes elegir <strong>UNA</strong> de estas acciones:</p>

        <div style="background:var(--bg-card); border:2px solid var(--border); border-radius:var(--radius-sm); padding:0.7rem; margin-bottom:0.5rem">
          <strong style="color:var(--sky)">🃏 ROBAR CARTAS DE VAGON</strong><br>
          Coge 2 cartas: del mazo (ciegas) o de las 5 cartas visibles.<br>
          Si coges una Locomotora visible, solo puedes coger esa (cuenta como 2).<br>
          Las locomotoras son comodin para cualquier color.
        </div>

        <div style="background:var(--bg-card); border:2px solid var(--border); border-radius:var(--radius-sm); padding:0.7rem; margin-bottom:0.5rem">
          <strong style="color:var(--accent)">🚂 RECLAMAR UNA RUTA</strong><br>
          Haz clic en una ruta del mapa para reclamarla.<br>
          Necesitas tantas cartas del color de la ruta como segmentos tenga.<br>
          Las rutas grises aceptan cualquier color (todos iguales).<br>
          Rutas con ⚓ (ferry): requieren locomotoras + cartas del color.<br>
          Rutas con ⛰ (tunel): pueden requerir cartas extra (se revelan 3 del mazo).
        </div>

        <div style="background:var(--bg-card); border:2px solid var(--border); border-radius:var(--radius-sm); padding:0.7rem; margin-bottom:0.5rem">
          <strong style="color:var(--gold)">🎫 ROBAR BILLETES DE DESTINO</strong><br>
          Roba 3 billetes y quedate al menos 1.<br>
          Completar un billete da puntos; no completarlo resta puntos.
        </div>

        <div style="background:var(--bg-card); border:2px solid var(--border); border-radius:var(--radius-sm); padding:0.7rem; margin-bottom:0.5rem">
          <strong style="color:var(--pink)">🏠 COLOCAR ESTACION</strong> (opcional)<br>
          Haz clic en una ciudad para colocar una estacion.<br>
          Te permite usar UNA ruta adyacente de otro jugador.<br>
          Cada estacion no usada al final da 4 puntos extra.
        </div>

        <p style="margin-top:0.8rem; color:var(--text-dim); font-size:0.8rem">
          <strong>Fin del juego:</strong> cuando un jugador tiene ≤2 trenes, se juega una ronda mas.
          Gana quien tenga mas puntos (rutas + billetes + estaciones + ruta mas larga).
        </p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="hideModalGlobal()">Entendido</button>
      </div>
    `);
  }

  function showInfoModal(title, message) {
    showModal(`
      <h3>${title}</h3>
      <p style="margin:1rem 0;font-size:0.9rem">${message}</p>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="hideModalGlobal()">Entendido</button>
      </div>
    `);
  }

  // --- Pantalla de resultados ---
  function showResults(results) {
    const overlay = document.getElementById('resultsOverlay');
    const panel = document.getElementById('resultsPanel');

    let html = '<h2>Fin de la partida</h2>';
    html += `<div class="results-winner">🏆 Ganador: ${results[0].name} con ${results[0].total} puntos</div>`;

    html += '<table class="results-table"><thead><tr>';
    html += '<th>Jugador</th><th>Rutas</th><th>Billetes +</th><th>Billetes -</th><th>Estaciones</th><th>Ruta larga</th><th>Total</th>';
    html += '</tr></thead><tbody>';

    for (const r of results) {
      html += `<tr>
        <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${PLAYER_COLORS_VIS[r.color]};margin-right:6px"></span>${r.name}</td>
        <td>${r.routePoints}</td>
        <td style="color:var(--success)">+${r.ticketPositive}</td>
        <td style="color:var(--danger)">${r.ticketNegative > 0 ? '-' + r.ticketNegative : '0'}</td>
        <td>${r.stationBonus}</td>
        <td>${r.longestRoute}${r.longestBonus > 0 ? ' (+10)' : ''}</td>
        <td class="total-col">${r.total}</td>
      </tr>`;
    }

    html += '</tbody></table>';

    // Detalle de billetes
    for (const r of results) {
      html += `<div style="margin-top:1rem"><strong style="color:${PLAYER_COLORS_VIS[r.color]}">${r.name}</strong> — Billetes:</div>`;
      html += '<div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.3rem">';
      for (const t of (r.ticketDetails || [])) {
        html += `<div class="ticket-item${t.completed ? ' completed' : ''}" style="flex:1;min-width:200px">
          <span class="ticket-cities">${t.from} → ${t.to}</span>
          <span class="ticket-points" style="color:${t.completed ? 'var(--success)' : 'var(--danger)'}">
            ${t.completed ? '+' : '-'}${t.points}
          </span>
        </div>`;
      }
      html += '</div>';
    }

    html += '<div style="text-align:center;margin-top:1.5rem"><button class="btn btn-primary" onclick="window.location.href=\'/\'">Volver al inicio</button></div>';

    panel.innerHTML = html;
    overlay.style.display = 'flex';
  }

  // --- Toast de errores ---
  function showToast(msg) {
    let toast = document.querySelector('.error-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'error-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.display = 'none'; }, 3000);
  }

  // --- Utilidades SVG ---
  function createSVG(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, val] of Object.entries(attrs)) {
      el.setAttribute(key, val);
    }
    return el;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

})();
