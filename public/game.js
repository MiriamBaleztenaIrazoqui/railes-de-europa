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

  // --- Inicialización ---
  socket.on('connect', () => {
    myId = socket.id;

    // Recuperar datos iniciales de sessionStorage
    const savedData = sessionStorage.getItem('gameData');
    if (savedData) {
      const data = JSON.parse(savedData);
      sessionStorage.removeItem('gameData');
      gameState = data.gameState;
      privateState = data.privateState;

      renderMap();
      updateUI();

      // Si hay billetes iniciales, mostrar modal
      if (data.initialTickets && data.initialTickets.length > 0) {
        showInitialTicketModal(data.initialTickets);
      }
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

    // Fondo decorativo — agua
    const bg = createSVG('rect', {
      x: 0, y: 0, width: 900, height: 650,
      fill: '#d4eaf7', rx: 0
    });
    svg.appendChild(bg);

    // Masas de tierra simplificadas
    const land = createSVG('path', {
      d: `M60,100 Q100,80 200,90 Q350,60 500,70 Q600,50 700,80
          Q800,70 860,120 L870,200 Q850,280 830,350 Q820,420 840,500
          L800,560 Q750,580 680,570 Q650,590 620,580 Q580,600 540,580
          Q500,620 460,610 Q430,640 380,620 Q320,600 280,580
          Q220,600 180,580 Q120,600 80,560 Q40,500 50,420
          Q30,340 40,260 Q50,180 60,100 Z`,
      fill: '#b8dfc9',
      opacity: 0.5,
      stroke: '#9fd4b8',
      'stroke-width': 1,
    });
    svg.appendChild(land);

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
