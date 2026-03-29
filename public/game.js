// ============================================================
// game.js — Cliente del juego con mapa Leaflet + SVG overlay
// ============================================================

(function () {
  'use strict';

  const socket = io();

  // --- Estado local ---
  let gameState = null;
  let privateState = { hand: [], tickets: [] };
  let myId = null;
  let mapRendered = false;
  let leafletMap = null;
  let svgOverlay = null;
  let helpShownOnce = false;

  // Coordenadas geográficas reales de las ciudades
  const GEO_CITIES = {
    'Lisboa':         { lat: 38.7, lng: -9.1 },
    'Madrid':         { lat: 40.4, lng: -3.7 },
    'Barcelona':      { lat: 41.4, lng: 2.2 },
    'Pamplona':       { lat: 42.8, lng: -1.6 },
    'Burdeos':        { lat: 44.8, lng: -0.6 },
    'Marsella':       { lat: 43.3, lng: 5.4 },
    'Brest':          { lat: 48.4, lng: -4.5 },
    'París':          { lat: 48.9, lng: 2.3 },
    'Londres':        { lat: 51.5, lng: -0.1 },
    'Ámsterdam':      { lat: 52.4, lng: 4.9 },
    'Bruselas':       { lat: 50.8, lng: 4.4 },
    'Edimburgo':      { lat: 55.9, lng: -3.2 },
    'Frankfurt':      { lat: 50.1, lng: 8.7 },
    'Berlín':         { lat: 52.5, lng: 13.4 },
    'München':        { lat: 48.1, lng: 11.6 },
    'Zúrich':         { lat: 47.4, lng: 8.5 },
    'Génova':         { lat: 44.4, lng: 8.9 },
    'Venecia':        { lat: 45.4, lng: 12.3 },
    'Roma':           { lat: 41.9, lng: 12.5 },
    'Palermo':        { lat: 38.1, lng: 13.4 },
    'Viena':          { lat: 48.2, lng: 16.4 },
    'Budapest':       { lat: 47.5, lng: 19.0 },
    'Zagreb':         { lat: 45.8, lng: 16.0 },
    'Varsovia':       { lat: 52.2, lng: 21.0 },
    'Belgrado':       { lat: 44.8, lng: 20.5 },
    'Sarajevo':       { lat: 43.9, lng: 18.4 },
    'Sofía':          { lat: 42.7, lng: 23.3 },
    'Bucarest':       { lat: 44.4, lng: 26.1 },
    'Constantinopla': { lat: 41.0, lng: 29.0 },
    'Angora':         { lat: 39.9, lng: 32.9 },
    'Esmirna':        { lat: 38.4, lng: 27.1 },
    'Atenas':         { lat: 37.98, lng: 23.7 },
    'Riga':           { lat: 56.9, lng: 24.1 },
    'Petrogrado':     { lat: 59.9, lng: 30.3 },
    'Estocolmo':      { lat: 59.3, lng: 18.1 },
    'Moscú':          { lat: 55.8, lng: 37.6 },
  };

  // Colores visuales de jugadores
  const PLAYER_COLORS_VIS = {
    'rojo': '#e74c3c', 'azul': '#3498db', 'verde': '#2ecc71',
    'amarillo': '#f39c12', 'negro': '#555'
  };

  // Colores de cartas
  const CARD_COLORS_VIS = {
    'rojo': '#dc3545', 'azul': '#2980b9', 'verde': '#27ae60',
    'amarillo': '#f1c40f', 'negro': '#444', 'blanco': '#ccc',
    'naranja': '#e67e22', 'rosa': '#e84393', 'gris': '#999',
    'locomotora': '#8e44ad'
  };

  // Degradados de vagones (claro, oscuro)
  const WAGON_GRADS = {
    'rojo':    ['#f06060','#b02020'],
    'azul':    ['#5dade2','#1a6fa0'],
    'verde':   ['#58d68d','#1a7a40'],
    'amarillo':['#f7dc6f','#c4a00d'],
    'negro':   ['#7a7a7a','#3a3a3a'],
  };

  // --- Convertir coordenadas geográficas a píxeles del contenedor ---
  function geoToPixel(name) {
    const geo = GEO_CITIES[name];
    if (!geo || !leafletMap) { console.warn('[GEO] No geo/map para:', name); return { x: 0, y: 0 }; }
    const pt = leafletMap.latLngToContainerPoint([geo.lat, geo.lng]);
    return { x: pt.x, y: pt.y };
  }

  // --- Inicialización ---
  socket.on('connect', () => {
    myId = socket.id;
    console.log('[CLIENT] Conectado con socket.id:', myId);
    const roomCode = sessionStorage.getItem('roomCode');
    const playerName = sessionStorage.getItem('playerName');
    if (roomCode && playerName) {
      console.log(`[CLIENT] Enviando rejoin: sala=${roomCode}, nombre=${playerName}`);
      socket.emit('rejoinGame', { code: roomCode, name: playerName });
    }
  });

  socket.on('rejoinComplete', (data) => {
    console.log('[CLIENT] Rejoin completado');
    gameState = data.gameState;
    privateState = data.privateState;
    renderMap();
    updateUI();
    if (data.initialTickets && data.initialTickets.length > 0) {
      showInitialTicketModal(data.initialTickets);
    }
  });

  socket.on('gameState', (state) => {
    gameState = state;
    if (!mapRendered) renderMap();
    updateUI();
    if (state.state === 'finished' && state.results) showResults(state.results);
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

  socket.on('ticketsDrawn', (data) => { showTicketChoiceModal(data.tickets, 1); });

  socket.on('tunnelFailed', (data) => {
    showInfoModal('Túnel fallido',
      `Se revelaron ${data.tunnelCards.length} cartas: ${data.tunnelCards.join(', ')}. Necesitabas ${data.extraNeeded} carta(s) extra. Pierdes el turno.`);
  });

  socket.on('tunnelSuccess', (data) => {
    if (data.extraNeeded > 0) showInfoModal('Túnel superado', `Pagaste ${data.extraNeeded} carta(s) extra.`);
  });

  socket.on('chatUpdate', (chat) => { if (gameState) gameState.chat = chat; updateChatUI(); });
  socket.on('error', (data) => { showToast(data.message); });

  // ============================================================
  // RENDERIZADO DEL MAPA CON LEAFLET
  // ============================================================
  function renderMap() {
    if (mapRendered) { renderSVGOverlay(); return; }
    mapRendered = true;

    const container = document.getElementById('mapContainer');

    // Crear div para Leaflet (reemplaza el SVG estático)
    const mapDiv = document.createElement('div');
    mapDiv.id = 'leaflet-map';
    mapDiv.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;';
    // Eliminar SVG antiguo si existe
    const oldSvg = document.getElementById('mapSvg');
    if (oldSvg) oldSvg.remove();
    container.appendChild(mapDiv);

    // Inicializar Leaflet
    leafletMap = L.map('leaflet-map', {
      center: [50, 15],
      zoom: 4,
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
    });

    // Tiles CartoDB Positron (fondo claro elegante)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(leafletMap);

    // Crear SVG overlay DIRECTAMENTE en el contenedor del mapa (no en overlayPane)
    // Así usamos containerPoint y no hay offset de panes
    svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgOverlay.setAttribute('id', 'rutas-svg');
    svgOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:all;z-index:400;overflow:visible;';

    // Definiciones SVG (filtros, gradientes)
    const defs = createSVG('defs', {});
    const sf = createSVG('filter', { id: 'wShadow', x:'-20%', y:'-20%', width:'140%', height:'160%' });
    sf.appendChild(createSVG('feOffset', { in:'SourceAlpha', dx:0, dy:1.5, result:'o' }));
    sf.appendChild(createSVG('feGaussianBlur', { in:'o', stdDeviation:1.5, result:'b' }));
    sf.appendChild(createSVG('feBlend', { in:'SourceGraphic', in2:'b', mode:'normal' }));
    defs.appendChild(sf);

    for (const [pc, [lt, dk]] of Object.entries(WAGON_GRADS)) {
      const g = createSVG('linearGradient', { id:`wg_${pc}`, x1:'0',y1:'0',x2:'0',y2:'1' });
      g.appendChild(createSVG('stop', { offset:'0%', 'stop-color':lt }));
      g.appendChild(createSVG('stop', { offset:'100%', 'stop-color':dk }));
      defs.appendChild(g);
    }
    svgOverlay.appendChild(defs);

    // Añadir SVG al contenedor del mapa (encima de Leaflet)
    container.appendChild(svgOverlay);

    // Renderizar cuando el mapa y los tiles estén listos
    leafletMap.whenReady(() => {
      console.log('[MAP] Leaflet listo, renderizando SVG overlay');
      renderSVGOverlay();
    });

    leafletMap.on('resize', () => { renderSVGOverlay(); });
  }

  // Renderizar todo el contenido SVG sobre el mapa Leaflet
  function renderSVGOverlay() {
    if (!leafletMap || !svgOverlay) return;
    console.log('[SVG] renderSVGOverlay llamado, rutas:', ROUTES.length, 'ciudades:', Object.keys(GEO_CITIES).length);

    // Limpiar todo excepto <defs>
    const defs = svgOverlay.querySelector('defs');
    svgOverlay.innerHTML = '';
    if (defs) svgOverlay.appendChild(defs);

    // Grupo de rutas
    const routeG = createSVG('g', { id: 'routeGroup' });
    svgOverlay.appendChild(routeG);

    // Grupo de estaciones
    const stationG = createSVG('g', { id: 'stationGroup' });
    svgOverlay.appendChild(stationG);

    // Grupo de ciudades
    const cityG = createSVG('g', { id: 'cityGroup' });
    svgOverlay.appendChild(cityG);

    // Dibujar rutas
    for (const route of ROUTES) drawRoute(routeG, route);

    // Dibujar ciudades
    for (const name of Object.keys(GEO_CITIES)) drawCity(cityG, name);

    // Dibujar vagones reclamados
    renderClaimedWagons(routeG);

    // Dibujar estaciones
    renderStations(stationG);
  }

  // --- Offset para rutas dobles ---
  function getRouteOffset(route) {
    const p1 = geoToPixel(route.cities[0]), p2 = geoToPixel(route.cities[1]);
    const dx = p2.x-p1.x, dy = p2.y-p1.y;
    const len = Math.sqrt(dx*dx+dy*dy) || 1;
    const nx = -dy/len, ny = dx/len;
    if (route.double) return { x: nx*5, y: ny*5 };
    const hasDouble = ROUTES.some(r =>
      r.id !== route.id && r.double &&
      ((r.cities[0]===route.cities[0]&&r.cities[1]===route.cities[1]) ||
       (r.cities[0]===route.cities[1]&&r.cities[1]===route.cities[0]))
    );
    if (hasDouble) return { x:-nx*5, y:-ny*5 };
    return { x:0, y:0 };
  }

  // --- Dibujar ruta (segmentos no reclamados) ---
  function drawRoute(group, route) {
    const p1 = geoToPixel(route.cities[0]), p2 = geoToPixel(route.cities[1]);
    if (!p1 || !p2) return;
    const off = getRouteOffset(route);
    const x1=p1.x+off.x, y1=p1.y+off.y, x2=p2.x+off.x, y2=p2.y+off.y;
    const dx=x2-x1, dy=y2-y1;
    const totalLen = Math.sqrt(dx*dx+dy*dy) || 1;
    const segLen = totalLen / route.length;
    const ux=dx/totalLen, uy=dy/totalLen;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const routeColor = CARD_COLORS_VIS[route.color] || '#999';
    const isTunnel = route.type === 'tunnel';

    const rg = createSVG('g', {
      id: `route-${route.id}`, class:'route-group',
      'data-route-id': route.id, cursor:'pointer',
    });

    // Hitarea invisible
    rg.appendChild(createSVG('line', {
      x1,y1,x2,y2, stroke:'transparent', 'stroke-width':18, class:'route-hitarea'
    }));

    // Si no está reclamada, dibujar segmentos con estilo punteado para túneles
    const claimed = gameState && gameState.claimedRoutes[route.id];
    if (!claimed) {
      for (let i = 0; i < route.length; i++) {
        const mx = x1 + ux * ((i+0.5)*segLen);
        const my = y1 + uy * ((i+0.5)*segLen);
        const wL = Math.max(segLen-5, 8), wH = 7;

        const wagon = createSVG('rect', {
          x: mx-wL/2, y: my-wH/2, width:wL, height:wH,
          rx:3, ry:3, fill: routeColor, stroke:'rgba(0,0,0,0.15)',
          'stroke-width': 0.8, opacity: 0.4,
          'stroke-dasharray': isTunnel ? '3 2' : 'none',
          transform: `rotate(${angle} ${mx} ${my})`,
          class:'route-wagon', 'data-route-id':route.id, 'data-segment':i,
        });
        rg.appendChild(wagon);
      }

      // Marcador de túnel — arco SVG
      if (isTunnel) {
        const mx=(x1+x2)/2, my=(y1+y2)/2;
        // Icono de montaña sobre la ruta
        const mt = createSVG('path', {
          d: `M${mx-5},${my-4} L${mx},${my-11} L${mx+5},${my-4} Z`,
          fill:'none', stroke:'#6a5a4a', 'stroke-width':1, opacity:0.7,
        });
        rg.appendChild(mt);
      }

      // Marcador ferry
      if (route.type === 'ferry') {
        const mx=(x1+x2)/2, my=(y1+y2)/2;
        const marker = createSVG('text', {
          x:mx, y:my-10, 'font-size':'9px', 'text-anchor':'middle',
          fill:'#4a7fa5', opacity:0.8,
        });
        marker.textContent = '⚓';
        rg.appendChild(marker);
      }
    }

    rg.addEventListener('click', () => onRouteClick(route));
    group.appendChild(rg);
  }

  // --- Dibujar vagones reclamados con detalle 3D ---
  function renderClaimedWagons(routeGroup) {
    if (!gameState) return;

    for (const route of ROUTES) {
      const claimedBy = gameState.claimedRoutes[route.id];
      if (!claimedBy) continue;

      const player = gameState.players.find(p => p.id === claimedBy);
      if (!player) continue;

      const rg = routeGroup.querySelector(`#route-${route.id}`);
      if (!rg) continue;

      // Eliminar vagones no reclamados
      rg.querySelectorAll('.route-wagon').forEach(w => w.remove());

      const pColor = player.color;
      const gradId = `wg_${pColor}`;
      const p1 = geoToPixel(route.cities[0]), p2 = geoToPixel(route.cities[1]);
      const off = getRouteOffset(route);
      const x1=p1.x+off.x, y1=p1.y+off.y, x2=p2.x+off.x, y2=p2.y+off.y;
      const dx=x2-x1, dy=y2-y1;
      const totalLen = Math.sqrt(dx*dx+dy*dy) || 1;
      const segLen = totalLen / route.length;
      const ux=dx/totalLen, uy=dy/totalLen;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const wLen = Math.min(segLen-3, 30);
      const wH = 13;

      for (let i = 0; i < route.length; i++) {
        const cx = x1 + ux * ((i+0.5)*segLen);
        const cy = y1 + uy * ((i+0.5)*segLen);

        const wg = createSVG('g', {
          transform: `translate(${cx},${cy}) rotate(${angle})`,
          class: 'wagon-animate', style: `animation-delay:${i*0.08}s`,
          filter: 'url(#wShadow)',
        });

        // Cuerpo del vagón con degradado
        wg.appendChild(createSVG('rect', {
          x:-wLen/2, y:-wH/2, width:wLen, height:wH, rx:3, ry:3,
          fill:`url(#${gradId})`, stroke:'rgba(255,255,255,0.35)', 'stroke-width':0.7,
        }));

        // Línea divisoria
        wg.appendChild(createSVG('line', {
          x1:-wLen/2+2, y1:0.5, x2:wLen/2-2, y2:0.5,
          stroke:'rgba(0,0,0,0.12)', 'stroke-width':0.5,
        }));

        // Ventanitas
        const winW = Math.min(5, wLen/6), winH = 3.5;
        wg.appendChild(createSVG('rect', { x:-wLen/4-winW/2, y:-wH/2+1.5, width:winW, height:winH, rx:0.8, fill:'rgba(255,255,255,0.45)' }));
        wg.appendChild(createSVG('rect', { x:wLen/4-winW/2, y:-wH/2+1.5, width:winW, height:winH, rx:0.8, fill:'rgba(255,255,255,0.45)' }));

        // Ruedas
        wg.appendChild(createSVG('circle', { cx:-wLen/4, cy:wH/2+0.5, r:2, fill:'#333', stroke:'#555','stroke-width':0.4 }));
        wg.appendChild(createSVG('circle', { cx:wLen/4, cy:wH/2+0.5, r:2, fill:'#333', stroke:'#555','stroke-width':0.4 }));

        rg.appendChild(wg);
      }
    }
  }

  // --- Dibujar estaciones ---
  function renderStations(stationGroup) {
    if (!gameState) return;
    for (const player of gameState.players) {
      if (!player.placedStations) continue;
      for (const station of player.placedStations) {
        if (!station.city || !GEO_CITIES[station.city]) continue;
        const p = geoToPixel(station.city);
        const marker = createSVG('rect', {
          x:p.x-4, y:p.y+9, width:8, height:8, rx:2, ry:2,
          fill: PLAYER_COLORS_VIS[player.color],
          stroke:'#fff', 'stroke-width':1.5,
          class:'station-marker',
        });
        stationGroup.appendChild(marker);
      }
    }
  }

  // --- Dibujar ciudad ---
  function drawCity(group, name) {
    const p = geoToPixel(name);

    // Círculo exterior
    group.appendChild(createSVG('circle', {
      cx:p.x, cy:p.y, r:6, fill:'#e8dcc8', stroke:'#a09070', 'stroke-width':1,
      filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
    }));

    // Círculo interior (interactivo)
    const dot = createSVG('circle', {
      cx:p.x, cy:p.y, r:4, class:'city-dot', 'data-city':name, cursor:'pointer',
    });
    dot.addEventListener('click', () => onCityClick(name));
    group.appendChild(dot);

    // Etiqueta con fondo
    const labelBg = createSVG('rect', {
      x: p.x - name.length*2.2 - 3, y: p.y - 17,
      width: name.length*4.4 + 6, height: 10,
      rx:3, ry:3, fill:'rgba(0,0,0,0.55)',
    });
    group.appendChild(labelBg);

    const label = createSVG('text', {
      x:p.x, y:p.y-9.5, class:'city-label',
    });
    label.textContent = name;
    group.appendChild(label);
  }

  // ============================================================
  // ACTUALIZACIÓN DE UI
  // ============================================================
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
    // Re-renderizar SVG overlay (actualiza vagones reclamados)
    renderSVGOverlay();
  }

  function updateTurnBanner() {
    const banner = document.getElementById('turnBanner');
    const dot = document.getElementById('turnDot');
    const text = document.getElementById('turnText');

    if (gameState.state === 'finished') {
      text.textContent = '¡Partida terminada!';
      dot.style.background = '#f0b429';
      return;
    }

    const current = gameState.players[gameState.currentPlayer];
    if (!current) return;
    dot.style.background = PLAYER_COLORS_VIS[current.color];

    if (current.id === myId) {
      text.textContent = '¡Tu turno!';
      banner.classList.add('your-turn-glow');
      // Popup de ayuda automático la primera vez
      if (!helpShownOnce && !gameState.turnPhase) {
        helpShownOnce = true;
        setTimeout(() => showHelpModal(), 600);
      }
    } else {
      text.textContent = `Turno de ${current.name}`;
      banner.classList.remove('your-turn-glow');
    }

    if (gameState.state === 'lastRound') text.textContent += ' (Última ronda)';
    if (gameState.turnPhase === 'drewOneCard' && current.id === myId) text.textContent = 'Roba tu segunda carta';
    if (gameState.turnPhase === 'choosingTickets' && current.id === myId) text.textContent = 'Elige tus billetes';
  }

  function updateFaceUpCards() {
    const c = document.getElementById('faceUpCards');
    c.innerHTML = '';
    for (let i = 0; i < (gameState.faceUpCards||[]).length; i++) {
      const card = gameState.faceUpCards[i];
      const div = document.createElement('div');
      div.className = `card-slot${card==='locomotora'?' locomotive':''}`;
      div.style.background = card==='locomotora' ? '' : CARD_COLORS_VIS[card];
      div.textContent = card==='locomotora' ? 'LOCO' : card.substring(0,3).toUpperCase();
      div.title = `Robar: ${card}`;
      div.addEventListener('click', () => { socket.emit('drawFaceUp', { index: i }); });
      c.appendChild(div);
    }
  }

  function updateHandUI() {
    const c = document.getElementById('handCards');
    c.innerHTML = '';
    const counts = {};
    for (const card of privateState.hand) counts[card] = (counts[card]||0)+1;

    const order = ['rojo','azul','verde','amarillo','negro','blanco','naranja','rosa','locomotora'];
    for (const color of order) {
      const count = counts[color];
      if (!count) continue;
      const div = document.createElement('div');
      div.className = `hand-card${color==='locomotora'?' locomotive':''}`;
      div.style.background = color==='locomotora' ? '' : CARD_COLORS_VIS[color];
      div.textContent = color==='locomotora' ? `L×${count}` : count;
      div.title = `${color} (${count})`;
      c.appendChild(div);
    }
  }

  function updateTicketsUI() {
    const c = document.getElementById('ticketsList');
    c.innerHTML = '';
    for (const ticket of privateState.tickets) {
      const div = document.createElement('div');
      div.className = 'ticket-item';
      const myPlayer = gameState ? gameState.players.find(p => p.id === myId) : null;
      if (myPlayer) {
        const graph = GameLogic.buildPlayerGraph(myPlayer.claimedRoutes, ROUTES, myId, myPlayer.placedStations, gameState.claimedRoutes);
        if (GameLogic.hasPath(graph, ticket.from, ticket.to)) div.classList.add('completed');
      }
      div.innerHTML = `<span class="ticket-cities">${ticket.from} → ${ticket.to}</span><span class="ticket-points">${ticket.points}</span>`;
      c.appendChild(div);
    }
  }

  function updateScoreboard() {
    const c = document.getElementById('scoreboard');
    c.innerHTML = '';
    for (let i = 0; i < gameState.players.length; i++) {
      const p = gameState.players[i];
      const div = document.createElement('div');
      div.className = `score-row${i===gameState.currentPlayer?' active-turn':''}`;
      // Avatar con inicial
      const initial = p.name.charAt(0).toUpperCase();
      div.innerHTML = `
        <span class="score-avatar" style="background:${PLAYER_COLORS_VIS[p.color]}">${initial}</span>
        <span class="score-name${!p.connected?' disconnected':''}">${p.name}${p.id===myId?' (tú)':''}</span>
        <span class="score-info">
          <span>🚂${p.trains}</span>
          <span>🏠${p.stations}</span>
          <span>🃏${p.handCount}</span>
        </span>
        <span class="score-pts">${p.score}</span>
      `;
      c.appendChild(div);
    }
  }

  function updateLog() {
    const c = document.getElementById('logArea');
    c.innerHTML = '';
    for (const entry of (gameState.log||[])) {
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.textContent = entry.message;
      c.appendChild(div);
    }
    c.scrollTop = c.scrollHeight;
  }

  function updateChatUI() {
    const c = document.getElementById('chatMessages');
    c.innerHTML = '';
    for (const msg of (gameState.chat||[])) {
      const div = document.createElement('div');
      div.className = 'chat-msg';
      div.innerHTML = `<span class="chat-name" style="color:${PLAYER_COLORS_VIS[msg.color]}">${msg.name}:</span> ${escapeHtml(msg.message)}`;
      c.appendChild(div);
    }
    c.scrollTop = c.scrollHeight;
  }

  function updateDeckCounts() {
    document.getElementById('deckCount').textContent = gameState.drawPileCount||0;
    document.getElementById('ticketCount').textContent = gameState.ticketPileCount||0;
  }

  function updateStationsInfo() {
    const p = gameState.players.find(p => p.id === myId);
    if (p) document.getElementById('stationsInfo').textContent = `${p.stations} restantes (clic en ciudad)`;
  }

  // ============================================================
  // EVENTOS DE CLIC
  // ============================================================
  function onRouteClick(route) {
    if (!gameState || gameState.state === 'finished') return;
    const current = gameState.players[gameState.currentPlayer];
    if (!current || current.id !== myId) return showToast('No es tu turno');
    if (gameState.turnPhase) return showToast('Termina tu acción actual primero');
    if (gameState.claimedRoutes[route.id]) return showToast('Ruta ya reclamada');

    GameLogic.setMapData({ ROUTES });
    const validation = GameLogic.canClaimRoute(route, privateState.hand, current.trains, gameState.claimedRoutes, myId, gameState.players.length);
    if (!validation.valid) return showToast(validation.reason);

    if (validation.options.length === 1) {
      socket.emit('claimRoute', { routeId: route.id, option: validation.options[0] });
    } else {
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
    showStationModal(cityName);
  }

  // ============================================================
  // BOTONES
  // ============================================================
  document.getElementById('btnDrawDeck').addEventListener('click', () => { socket.emit('drawFromDeck'); });
  document.getElementById('btnDrawTickets').addEventListener('click', () => { socket.emit('drawTickets'); });
  document.getElementById('btnHelp').addEventListener('click', showHelpModal);
  document.getElementById('btnChat').addEventListener('click', sendChat);
  document.getElementById('chatInput').addEventListener('keydown', (e) => { if (e.key==='Enter') sendChat(); });

  function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit('chatMessage', { message: msg });
    input.value = '';
  }

  // ============================================================
  // MODALES
  // ============================================================
  function showModal(html) {
    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalOverlay').style.display = 'flex';
  }
  function hideModal() { document.getElementById('modalOverlay').style.display = 'none'; }

  function showInitialTicketModal(tickets) {
    let h = '<h3>Elige tus billetes iniciales</h3>';
    h += '<p style="font-size:0.8rem;color:var(--text-dim);margin-bottom:0.8rem">Conserva al menos 2 de 3</p>';
    tickets.forEach((t,i) => {
      h += `<div class="modal-ticket selected" data-idx="${i}" onclick="toggleTicket(this)">
        <input type="checkbox" checked data-idx="${i}">
        <div class="modal-ticket-info"><div class="modal-ticket-cities">${t.from} → ${t.to}</div></div>
        <div class="modal-ticket-points">${t.points}pt</div></div>`;
    });
    h += '<div class="modal-actions"><button class="btn btn-primary" onclick="confirmInitialTickets()">Confirmar</button></div>';
    showModal(h);
  }

  window.toggleTicket = function(el) {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    el.classList.toggle('selected', cb.checked);
  };

  window.confirmInitialTickets = function() {
    const kept = [];
    document.querySelectorAll('.modal-ticket input[type="checkbox"]').forEach(cb => { if(cb.checked) kept.push(parseInt(cb.dataset.idx)); });
    if (kept.length < 2) return showToast('Debes conservar al menos 2 billetes');
    socket.emit('chooseInitialTickets', { kept });
    hideModal();
  };

  function showTicketChoiceModal(tickets, minKeep) {
    let h = `<h3>Nuevos billetes de destino</h3>`;
    h += `<p style="font-size:0.8rem;color:var(--text-dim);margin-bottom:0.8rem">Conserva al menos ${minKeep}</p>`;
    tickets.forEach((t,i) => {
      h += `<div class="modal-ticket selected" data-idx="${i}" onclick="toggleTicket(this)">
        <input type="checkbox" checked data-idx="${i}">
        <div class="modal-ticket-info"><div class="modal-ticket-cities">${t.from} → ${t.to}</div></div>
        <div class="modal-ticket-points">${t.points}pt</div></div>`;
    });
    h += `<div class="modal-actions"><button class="btn btn-primary" onclick="confirmDrawnTickets(${minKeep})">Confirmar</button></div>`;
    showModal(h);
  }

  window.confirmDrawnTickets = function(minKeep) {
    const kept = [];
    document.querySelectorAll('.modal-ticket input[type="checkbox"]').forEach(cb => { if(cb.checked) kept.push(parseInt(cb.dataset.idx)); });
    if (kept.length < minKeep) return showToast(`Debes conservar al menos ${minKeep}`);
    socket.emit('chooseTickets', { kept });
    hideModal();
  };

  function showClaimModal(route, options) {
    let h = `<h3>Reclamar ${route.cities[0]} → ${route.cities[1]}</h3>`;
    h += `<p style="font-size:0.8rem;color:var(--text-dim);margin-bottom:0.8rem">${route.length} vagones · ${route.color}${route.type==='tunnel'?' · Túnel':''} ${route.type==='ferry'?' · Ferry':''}</p>`;
    options.forEach((opt,i) => {
      const desc = opt.color==='locomotora' ? `${opt.locomotives} locomotora(s)` : `${opt.colorCards} ${opt.color} + ${opt.locomotives} loco`;
      h += `<div class="claim-option${i===0?' selected':''}" data-idx="${i}" onclick="selectClaimOption(this,${i})">${desc}</div>`;
    });
    h += `<div class="modal-actions"><button class="btn btn-secondary" onclick="hideModalGlobal()">Cancelar</button><button class="btn btn-primary" onclick="confirmClaim('${route.id}')">Reclamar</button></div>`;
    showModal(h);
    window._claimOptions = options;
    window._selectedClaimOption = 0;
  }

  window.selectClaimOption = function(el,idx) {
    document.querySelectorAll('.claim-option').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    window._selectedClaimOption = idx;
  };
  window.confirmClaim = function(routeId) { socket.emit('claimRoute', { routeId, option: window._claimOptions[window._selectedClaimOption] }); hideModal(); };
  window.hideModalGlobal = hideModal;

  function showStationModal(cityName) {
    const myPlayer = gameState.players.find(p => p.id === myId);
    if (!myPlayer) return;
    const stationIndex = 3 - myPlayer.stations;
    const cost = GameLogic.stationCost(stationIndex);
    const counts = {};
    for (const card of privateState.hand) counts[card] = (counts[card]||0)+1;

    let h = `<h3>Estación en ${cityName}</h3><p style="font-size:0.8rem;color:var(--text-dim);margin-bottom:0.8rem">Coste: ${cost} carta(s) del mismo color</p>`;
    const options = [];
    for (const color of ['rojo','azul','verde','amarillo','negro','blanco','naranja','rosa']) {
      if ((counts[color]||0) >= cost) options.push({ color, locomotives:0 });
    }
    if ((counts['locomotora']||0) >= cost) options.push({ color:'locomotora', locomotives:cost });
    for (const color of ['rojo','azul','verde','amarillo','negro','blanco','naranja','rosa']) {
      const cc = counts[color]||0, lc = counts['locomotora']||0;
      if (cc>0 && cc<cost && cc+lc>=cost) options.push({ color, locomotives:cost-cc });
    }
    if (!options.length) {
      h += '<p style="color:var(--danger)">No tienes suficientes cartas</p>';
      h += '<div class="modal-actions"><button class="btn btn-secondary" onclick="hideModalGlobal()">Cerrar</button></div>';
      showModal(h); return;
    }
    options.forEach((opt,i) => {
      const desc = opt.color==='locomotora' ? `${opt.locomotives} loco` : `${cost-opt.locomotives} ${opt.color}${opt.locomotives>0?` + ${opt.locomotives} loco`:''}`;
      h += `<div class="claim-option${i===0?' selected':''}" data-idx="${i}" onclick="selectClaimOption(this,${i})">${desc}</div>`;
    });
    h += `<div class="modal-actions"><button class="btn btn-secondary" onclick="hideModalGlobal()">Cancelar</button><button class="btn btn-primary" onclick="confirmStation('${cityName}')">Colocar</button></div>`;
    showModal(h);
    window._stationOptions = options;
    window._selectedClaimOption = 0;
  }
  window.confirmStation = function(cityName) { socket.emit('placeStation', { city:cityName, option:window._stationOptions[window._selectedClaimOption] }); hideModal(); };

  // --- Popup de ayuda ---
  function showHelpModal() {
    showModal(`
      <h3>Cómo jugar tu turno</h3>
      <div style="font-size:0.8rem; line-height:1.6">
        <p style="margin-bottom:0.6rem; color:var(--text-dim)">Elige <strong>UNA</strong> acción:</p>
        <div style="background:rgba(0,0,0,0.05); border:1px solid var(--border); border-radius:6px; padding:0.6rem; margin-bottom:0.4rem">
          <strong style="color:#2980b9">🃏 ROBAR CARTAS</strong><br>
          2 cartas del mazo o visibles. Locomotora visible = 1 sola carta.
        </div>
        <div style="background:rgba(0,0,0,0.05); border:1px solid var(--border); border-radius:6px; padding:0.6rem; margin-bottom:0.4rem">
          <strong style="color:#c0392b">🚂 RECLAMAR RUTA</strong><br>
          Clic en ruta del mapa. Grises: cualquier color. ⚓ Ferry: locomotoras. ⛰ Túnel: cartas extra.
        </div>
        <div style="background:rgba(0,0,0,0.05); border:1px solid var(--border); border-radius:6px; padding:0.6rem; margin-bottom:0.4rem">
          <strong style="color:#e67e22">🎫 ROBAR BILLETES</strong><br>
          Roba 3, quédate al menos 1. Completar = +pts, no completar = -pts.
        </div>
        <div style="background:rgba(0,0,0,0.05); border:1px solid var(--border); border-radius:6px; padding:0.6rem; margin-bottom:0.4rem">
          <strong style="color:#8e44ad">🏠 ESTACIÓN</strong> (opcional)<br>
          Clic en ciudad. Usa ruta adyacente de rival. Estación no usada = +4pts.
        </div>
        <p style="margin-top:0.5rem; font-size:0.75rem; color:var(--text-dim)">
          ≤2 trenes → última ronda. Gana: rutas + billetes + estaciones + ruta más larga (+10).
        </p>
      </div>
      <div class="modal-actions"><button class="btn btn-primary" onclick="hideModalGlobal()">Entendido</button></div>
    `);
  }

  function showInfoModal(title, message) {
    showModal(`<h3>${title}</h3><p style="margin:0.8rem 0;font-size:0.85rem">${message}</p>
      <div class="modal-actions"><button class="btn btn-primary" onclick="hideModalGlobal()">Entendido</button></div>`);
  }

  // --- Resultados ---
  function showResults(results) {
    const panel = document.getElementById('resultsPanel');
    let h = '<h2>Fin de la partida</h2>';
    h += `<div class="results-winner">🏆 ${results[0].name} — ${results[0].total} puntos</div>`;
    h += '<table class="results-table"><thead><tr><th>Jugador</th><th>Rutas</th><th>Billetes +</th><th>Billetes -</th><th>Estaciones</th><th>Ruta larga</th><th>Total</th></tr></thead><tbody>';
    for (const r of results) {
      h += `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${PLAYER_COLORS_VIS[r.color]};margin-right:4px"></span>${r.name}</td>
        <td>${r.routePoints}</td><td style="color:var(--success)">+${r.ticketPositive}</td>
        <td style="color:var(--danger)">${r.ticketNegative>0?'-'+r.ticketNegative:'0'}</td>
        <td>${r.stationBonus}</td><td>${r.longestRoute}${r.longestBonus>0?' (+10)':''}</td>
        <td class="total-col">${r.total}</td></tr>`;
    }
    h += '</tbody></table>';
    h += '<div style="text-align:center;margin-top:1.2rem"><button class="btn btn-primary" onclick="window.location.href=\'/\'">Volver al inicio</button></div>';
    panel.innerHTML = h;
    document.getElementById('resultsOverlay').style.display = 'flex';
  }

  // --- Toast ---
  function showToast(msg) {
    let t = document.querySelector('.error-toast');
    if (!t) { t = document.createElement('div'); t.className = 'error-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._to); t._to = setTimeout(() => { t.style.display = 'none'; }, 3000);
  }

  // --- Utilidades SVG ---
  function createSVG(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

})();
