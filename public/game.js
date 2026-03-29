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

    // --- Definiciones SVG (gradientes, filtros, patrones) ---
    const defs = createSVG('defs', {});

    // Gradiente oceánico
    const oceanGrad = createSVG('radialGradient', {
      id: 'oceanGrad', cx: '35%', cy: '35%', r: '75%'
    });
    [['0%','#2d6a9f'],['50%','#1e4d7a'],['100%','#1a3a5c']].forEach(([o,c]) => {
      const s = createSVG('stop', { offset: o, 'stop-color': c });
      oceanGrad.appendChild(s);
    });
    defs.appendChild(oceanGrad);

    // Patrón de ruido/textura para la tierra
    const noisePat = createSVG('pattern', {
      id: 'noiseTexture', width: 100, height: 100, patternUnits: 'userSpaceOnUse'
    });
    // Simular ruido con círculos aleatorios
    for (let i = 0; i < 60; i++) {
      const nc = createSVG('circle', {
        cx: Math.random()*100, cy: Math.random()*100,
        r: Math.random()*1.5+0.3,
        fill: Math.random()>0.5 ? '#c4b49a' : '#a09070',
        opacity: Math.random()*0.12+0.03,
      });
      noisePat.appendChild(nc);
    }
    defs.appendChild(noisePat);

    // Filtro de sombra para vagones reclamados
    const shadowFilter = createSVG('filter', { id: 'wagonShadow', x: '-20%', y: '-20%', width: '140%', height: '160%' });
    const feOffset = createSVG('feOffset', { in: 'SourceAlpha', dx: 0, dy: 2, result: 'offOut' });
    const feBlur = createSVG('feGaussianBlur', { in: 'offOut', stdDeviation: 2, result: 'blurOut' });
    const feBlend = createSVG('feBlend', { in: 'SourceGraphic', in2: 'blurOut', mode: 'normal' });
    shadowFilter.appendChild(feOffset);
    shadowFilter.appendChild(feBlur);
    shadowFilter.appendChild(feBlend);
    defs.appendChild(shadowFilter);

    // Gradientes de color para vagones de cada jugador
    const playerGradColors = {
      'rojo':    ['#f06060','#c03030'],
      'azul':    ['#5dade2','#2471a3'],
      'verde':   ['#58d68d','#1e8449'],
      'amarillo':['#f7dc6f','#d4ac0d'],
      'negro':   ['#5d6d7e','#2c3e50'],
    };
    for (const [pColor, [light, dark]] of Object.entries(playerGradColors)) {
      const g = createSVG('linearGradient', { id: `grad_${pColor}`, x1:'0', y1:'0', x2:'0', y2:'1' });
      g.appendChild(createSVG('stop', { offset: '0%', 'stop-color': light }));
      g.appendChild(createSVG('stop', { offset: '100%', 'stop-color': dark }));
      defs.appendChild(g);
    }

    svg.appendChild(defs);

    // --- Océano ---
    svg.appendChild(createSVG('rect', { x:0, y:0, width:900, height:650, fill:'url(#oceanGrad)' }));

    // Cuadrícula cartográfica
    const gridG = createSVG('g', { opacity: 0.08 });
    for (let y = 0; y < 650; y += 50) {
      gridG.appendChild(createSVG('line', { x1:0,y1:y,x2:900,y2:y, stroke:'#6a9fc0','stroke-width':0.4 }));
    }
    for (let x = 0; x < 900; x += 50) {
      gridG.appendChild(createSVG('line', { x1:x,y1:0,x2:x,y2:650, stroke:'#6a9fc0','stroke-width':0.4 }));
    }
    svg.appendChild(gridG);

    // --- Masas de tierra ---
    const landG = createSVG('g', { id: 'landMasses' });
    const landStyle = { fill: '#e8dcc8', stroke: '#a09070', 'stroke-width': 1.5 };
    const borderStyle = { fill: 'none', stroke: '#c4b49a', 'stroke-width': 0.8 };

    // Polígonos de tierra
    const lands = [
      // Escandinavia
      `M430,15 L465,22 Q500,30 515,60 L525,90 Q528,115 515,135 L495,145 Q475,120 460,90 Q445,55 430,15 Z`,
      // Gran Bretaña
      `M165,88 Q180,78 200,85 L215,100 Q230,112 235,140 L242,175 Q250,200 248,220 L238,235 Q222,245 208,238 L192,222 Q182,200 178,175 Q172,148 170,120 L165,88 Z`,
      // Irlanda
      `M138,140 Q150,130 168,138 L173,158 Q175,175 167,188 L157,193 Q143,186 139,168 L138,140 Z`,
      // Europa continental
      `M232,218 Q262,208 295,202 L345,192 Q388,182 425,188 L485,183 Q535,172 585,162 L645,142 Q685,128 725,112 L765,100 Q810,95 845,112 L875,138 Q888,170 878,215 L868,265 Q858,305 848,345 L838,385 Q832,418 848,448 L855,478 Q850,508 828,518 L795,508 Q765,498 745,478 L725,465 Q705,458 685,465 L665,478 Q645,498 625,518 L605,538 Q585,548 565,542 L545,528 Q525,508 505,498 L485,488 Q465,482 445,488 L425,498 Q405,508 385,502 L365,488 Q345,478 325,468 L305,458 Q285,448 265,438 L245,428 Q225,408 215,382 L205,350 Q198,318 205,288 L215,262 Q225,242 232,218 Z`,
      // Iberia
      `M48,428 Q58,395 82,375 L115,365 Q145,360 175,368 L215,378 Q245,385 270,402 L290,422 Q302,445 298,472 L288,498 Q278,522 255,538 L225,548 Q195,555 165,550 L132,542 Q102,530 82,515 L62,498 Q42,470 48,428 Z`,
      // Italia
      `M382,388 Q395,400 405,425 L415,452 Q425,478 435,498 L445,525 Q450,545 445,565 L440,578 Q428,588 418,582 L408,568 Q402,548 408,528 L405,508 Q395,488 385,468 L375,442 Q368,420 375,405 L382,388 Z`,
      // Sicilia
      `M402,585 Q418,575 435,580 L445,592 Q440,608 425,612 L408,607 Q398,598 402,585 Z`,
      // Grecia
      `M582,475 Q595,488 605,508 L615,528 Q620,548 610,562 L598,568 Q588,558 582,542 L578,518 Q575,498 582,475 Z`,
      // Turquía
      `M682,408 Q715,402 748,410 L785,425 Q818,438 845,452 L865,468 Q875,485 865,498 L845,508 Q815,518 785,512 L755,508 Q725,502 705,492 L685,478 Q672,458 682,408 Z`,
      // Rusia
      `M622,25 Q665,15 708,22 L758,38 Q808,55 845,82 L878,115 Q895,148 885,188 L878,218 Q868,188 848,168 L818,148 Q788,135 758,130 L718,125 Q688,122 658,115 L638,100 Q618,78 622,48 L622,25 Z`,
      // Norte de África
      `M0,625 Q55,605 125,615 L205,618 Q310,612 405,622 L505,628 Q605,622 705,632 L805,638 Q875,635 900,642 L900,650 L0,650 Z`,
    ];
    lands.forEach(d => {
      landG.appendChild(createSVG('path', { d, ...landStyle }));
    });

    // Textura de ruido sobre la tierra
    landG.appendChild(createSVG('rect', { x:0,y:0,width:900,height:650, fill:'url(#noiseTexture)', opacity:0.15 }));

    // Bordes de países (aproximados)
    const borders = [
      // Francia-España (Pirineos)
      'M185,388 Q210,378 240,385',
      // Francia-Alemania
      'M340,260 Q360,280 375,300',
      // Francia-Italia
      'M352,345 Q368,365 375,388',
      // Alemania-Polonia
      'M482,188 Q490,210 495,235 L498,268',
      // Austria-Hungría
      'M505,318 Q525,328 548,338',
      // Balcanes
      'M502,388 Q520,395 538,405 Q558,415 575,428',
      // Italia-Balcanes
      'M465,385 Q478,392 488,402',
    ];
    borders.forEach(d => {
      landG.appendChild(createSVG('path', { d, ...borderStyle, 'stroke-dasharray': '4 3' }));
    });
    svg.appendChild(landG);

    // --- Iconos de montañas ---
    const mtG = createSVG('g', { id: 'mountains', opacity: 0.35 });
    const mountainPositions = [
      // Alpes
      [378,340],[395,330],[412,335],[390,345],
      // Pirineos
      [195,395],[210,392],[225,398],
      // Cárpatos
      [558,310],[572,318],[585,325],
      // Balcanes
      [535,440],[548,435],[522,448],
    ];
    mountainPositions.forEach(([mx,my]) => {
      const mt = createSVG('path', {
        d: `M${mx-6},${my+4} L${mx},${my-6} L${mx+6},${my+4} Z`,
        fill: 'none', stroke: '#8a7a6a', 'stroke-width': 1, 'stroke-linejoin': 'round'
      });
      mtG.appendChild(mt);
    });
    svg.appendChild(mtG);

    // --- Etiquetas de mar ---
    const seaLabels = [
      [120,310,'Mar del Norte',11,-15], [80,580,'Océano\nAtlántico',10,0],
      [450,600,'Mar Mediterráneo',11,0], [680,350,'Mar Negro',9,0],
      [590,155,'Mar Báltico',8,-10],
    ];
    const seaG = createSVG('g', { opacity: 0.4 });
    seaLabels.forEach(([sx,sy,txt,fs,rot]) => {
      const st = createSVG('text', {
        x:sx, y:sy, 'font-size':`${fs}px`, fill:'#7ab0d4',
        'font-family': "'Crimson Text', serif", 'font-style':'italic',
        'text-anchor':'middle', transform: rot ? `rotate(${rot} ${sx} ${sy})` : ''
      });
      st.textContent = txt;
      seaG.appendChild(st);
    });
    svg.appendChild(seaG);

    // --- Rosa de los vientos ---
    const compassG = createSVG('g', { transform: 'translate(42,610)', opacity: 0.5 });
    // Círculo exterior
    compassG.appendChild(createSVG('circle', { cx:0,cy:0,r:16, fill:'none', stroke:'#a09070','stroke-width':1 }));
    // Flechas N/S/E/O
    compassG.appendChild(createSVG('path', { d:'M0,-14 L3,-4 L0,-6 L-3,-4 Z', fill:'#c03030' })); // N roja
    compassG.appendChild(createSVG('path', { d:'M0,14 L3,4 L0,6 L-3,4 Z', fill:'#a09070' }));
    compassG.appendChild(createSVG('path', { d:'M14,0 L4,3 L6,0 L4,-3 Z', fill:'#a09070' }));
    compassG.appendChild(createSVG('path', { d:'M-14,0 L-4,3 L-6,0 L-4,-3 Z', fill:'#a09070' }));
    const nLabel = createSVG('text', { x:0,y:-18, 'font-size':'7px', fill:'#a09070', 'text-anchor':'middle', 'font-family':'serif' });
    nLabel.textContent = 'N';
    compassG.appendChild(nLabel);
    svg.appendChild(compassG);

    // --- Escala visual ---
    const scaleG = createSVG('g', { transform: 'translate(820,630)', opacity: 0.4 });
    scaleG.appendChild(createSVG('line', { x1:0,y1:0,x2:50,y2:0, stroke:'#a09070','stroke-width':1.5 }));
    scaleG.appendChild(createSVG('line', { x1:0,y1:-3,x2:0,y2:3, stroke:'#a09070','stroke-width':1 }));
    scaleG.appendChild(createSVG('line', { x1:50,y1:-3,x2:50,y2:3, stroke:'#a09070','stroke-width':1 }));
    const scaleTxt = createSVG('text', { x:25,y:10, 'font-size':'6px', fill:'#a09070', 'text-anchor':'middle', 'font-family':'serif' });
    scaleTxt.textContent = '500 km';
    scaleG.appendChild(scaleTxt);
    svg.appendChild(scaleG);

    // --- Grupos de elementos del juego ---
    svg.appendChild(createSVG('g', { id: 'routeGroup' }));
    svg.appendChild(createSVG('g', { id: 'stationGroup' }));
    svg.appendChild(createSVG('g', { id: 'cityGroup' }));

    // Dibujar rutas
    const routeGroup = document.getElementById('routeGroup');
    for (const route of ROUTES) { drawRoute(routeGroup, route); }

    // Dibujar ciudades
    const cityGroup = document.getElementById('cityGroup');
    for (const [name, pos] of Object.entries(CITIES)) { drawCity(cityGroup, name, pos); }

    updateMapClaims();
  }

  // Calcular offset para rutas dobles
  function getRouteOffset(route) {
    const c1 = CITIES[route.cities[0]], c2 = CITIES[route.cities[1]];
    const dx = c2.x - c1.x, dy = c2.y - c1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    const nx = -dy/len, ny = dx/len;
    if (route.double) return { x: nx*5, y: ny*5 };
    const hasDouble = ROUTES.some(r =>
      r.id !== route.id && r.double &&
      ((r.cities[0]===route.cities[0] && r.cities[1]===route.cities[1]) ||
       (r.cities[0]===route.cities[1] && r.cities[1]===route.cities[0]))
    );
    if (hasDouble) return { x: -nx*5, y: -ny*5 };
    return { x:0, y:0 };
  }

  function drawRoute(group, route) {
    const c1 = CITIES[route.cities[0]], c2 = CITIES[route.cities[1]];
    if (!c1 || !c2) return;

    const off = getRouteOffset(route);
    const x1 = c1.x+off.x, y1 = c1.y+off.y, x2 = c2.x+off.x, y2 = c2.y+off.y;
    const dx = x2-x1, dy = y2-y1;
    const totalLen = Math.sqrt(dx*dx + dy*dy);
    const segLen = totalLen / route.length;
    const ux = dx/totalLen, uy = dy/totalLen;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const routeColor = CARD_COLORS_VIS[route.color] || '#7f8c8d';

    const routeG = createSVG('g', {
      id: `route-${route.id}`, class: 'route-group',
      'data-route-id': route.id, cursor: 'pointer',
    });

    // Hitarea invisible
    routeG.appendChild(createSVG('line', {
      x1,y1,x2,y2, stroke:'transparent', 'stroke-width':16, class:'route-hitarea'
    }));

    // Segmentos de vagón no reclamados (punteados)
    for (let i = 0; i < route.length; i++) {
      const midX = x1 + ux * ((i+0.5) * segLen);
      const midY = y1 + uy * ((i+0.5) * segLen);
      const wLen = segLen - 4, wH = 7;

      const wagon = createSVG('rect', {
        x: midX - wLen/2, y: midY - wH/2, width: wLen, height: wH,
        rx: 3, ry: 3, fill: routeColor, stroke: 'rgba(255,255,255,0.15)',
        'stroke-width': 0.8, opacity: 0.35,
        transform: `rotate(${angle} ${midX} ${midY})`,
        class: 'route-wagon', 'data-route-id': route.id, 'data-segment': i,
      });
      routeG.appendChild(wagon);
    }

    // Marcador túnel/ferry
    if (route.type === 'tunnel' || route.type === 'ferry') {
      const mx = (x1+x2)/2, my = (y1+y2)/2;
      const marker = createSVG('text', {
        x:mx, y:my-9, class: route.type==='tunnel'?'tunnel-marker':'ferry-marker',
        'font-size':'8px', 'text-anchor':'middle',
      });
      marker.textContent = route.type==='tunnel' ? '⛰' : '⚓';
      routeG.appendChild(marker);
    }

    routeG.addEventListener('click', () => onRouteClick(route));
    group.appendChild(routeG);
  }

  function drawCity(group, name, pos) {
    // Círculo exterior (borde) + interior (relleno oscuro)
    const outerDot = createSVG('circle', {
      cx: pos.x, cy: pos.y, r: 6.5,
      fill: '#e8dcc8', stroke: '#a09070', 'stroke-width': 1,
      filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))',
    });
    group.appendChild(outerDot);

    const dot = createSVG('circle', {
      cx: pos.x, cy: pos.y, r: 4.5,
      class: 'city-dot', 'data-city': name,
    });
    dot.addEventListener('click', () => onCityClick(name));
    group.appendChild(dot);

    // Etiqueta con fondo pastilla
    const labelBg = createSVG('rect', {
      x: pos.x - name.length*2.5 - 3, y: pos.y - 19,
      width: name.length*5 + 6, height: 11,
      rx: 3, ry: 3, fill: 'rgba(0,0,0,0.55)',
    });
    group.appendChild(labelBg);

    const label = createSVG('text', {
      x: pos.x, y: pos.y - 11, class: 'city-label',
    });
    label.textContent = name;
    group.appendChild(label);
  }

  function updateMapClaims() {
    if (!gameState) return;

    // Actualizar vagones reclamados con diseño 3D detallado
    for (const route of ROUTES) {
      const routeG = document.getElementById(`route-${route.id}`);
      if (!routeG) continue;

      const claimedBy = gameState.claimedRoutes[route.id];
      if (!claimedBy) continue;
      if (routeG.dataset.claimedRendered) continue; // Ya renderizado

      const player = gameState.players.find(p => p.id === claimedBy);
      if (!player) continue;
      const pColor = player.color; // rojo, azul, etc.
      const gradId = `grad_${pColor}`;

      // Eliminar vagones planos originales
      routeG.querySelectorAll('.route-wagon').forEach(w => w.remove());

      // Calcular posiciones de los vagones
      const c1 = CITIES[route.cities[0]], c2 = CITIES[route.cities[1]];
      if (!c1 || !c2) continue;
      const off = getRouteOffset(route);
      const x1 = c1.x+off.x, y1 = c1.y+off.y, x2 = c2.x+off.x, y2 = c2.y+off.y;
      const dx = x2-x1, dy = y2-y1;
      const totalLen = Math.sqrt(dx*dx + dy*dy);
      const segLen = totalLen / route.length;
      const ux = dx/totalLen, uy = dy/totalLen;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const wLen = Math.min(segLen - 3, 32);
      const wH = 14;

      for (let i = 0; i < route.length; i++) {
        const cx = x1 + ux * ((i+0.5) * segLen);
        const cy = y1 + uy * ((i+0.5) * segLen);

        // Grupo del vagón individual
        const wg = createSVG('g', {
          transform: `translate(${cx},${cy}) rotate(${angle})`,
          class: 'wagon-animate', style: `animation-delay:${i*0.1}s`,
          filter: 'url(#wagonShadow)',
        });

        // Cuerpo del vagón con degradado
        wg.appendChild(createSVG('rect', {
          x: -wLen/2, y: -wH/2, width: wLen, height: wH, rx: 3, ry: 3,
          fill: `url(#${gradId})`, stroke: 'rgba(255,255,255,0.3)', 'stroke-width': 0.8,
        }));

        // Línea divisoria horizontal
        wg.appendChild(createSVG('line', {
          x1: -wLen/2+2, y1: 1, x2: wLen/2-2, y2: 1,
          stroke: 'rgba(0,0,0,0.15)', 'stroke-width': 0.5,
        }));

        // Ventanitas
        const winW = Math.min(6, wLen/5), winH = 4;
        wg.appendChild(createSVG('rect', {
          x: -wLen/4-winW/2, y: -wH/2+2, width: winW, height: winH, rx: 1,
          fill: 'rgba(255,255,255,0.4)',
        }));
        wg.appendChild(createSVG('rect', {
          x: wLen/4-winW/2, y: -wH/2+2, width: winW, height: winH, rx: 1,
          fill: 'rgba(255,255,255,0.4)',
        }));

        // Ruedas
        const wheelR = 2.5;
        wg.appendChild(createSVG('circle', { cx: -wLen/4, cy: wH/2+1, r: wheelR, fill: '#1a1a2e', stroke:'#333','stroke-width':0.5 }));
        wg.appendChild(createSVG('circle', { cx: wLen/4, cy: wH/2+1, r: wheelR, fill: '#1a1a2e', stroke:'#333','stroke-width':0.5 }));

        routeG.appendChild(wg);
      }

      routeG.dataset.claimedRendered = 'true';
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
            x: pos.x - 5, y: pos.y + 10,
            width: 10, height: 10, rx: 2, ry: 2,
            fill: PLAYER_COLORS_VIS[player.color],
            stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 1.5,
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

        <div style="background:rgba(15,52,96,0.5); border:1px solid var(--border); border-radius:var(--radius-sm); padding:0.7rem; margin-bottom:0.5rem">
          <strong style="color:#5dade2">🃏 ROBAR CARTAS DE VAGON</strong><br>
          Coge 2 cartas: del mazo (ciegas) o de las 5 cartas visibles.<br>
          Si coges una Locomotora visible, solo puedes coger esa (cuenta como 2).<br>
          Las locomotoras son comodin para cualquier color.
        </div>

        <div style="background:rgba(15,52,96,0.5); border:1px solid var(--border); border-radius:var(--radius-sm); padding:0.7rem; margin-bottom:0.5rem">
          <strong style="color:#e94560">🚂 RECLAMAR UNA RUTA</strong><br>
          Haz clic en una ruta del mapa para reclamarla.<br>
          Necesitas tantas cartas del color de la ruta como segmentos tenga.<br>
          Las rutas grises aceptan cualquier color (todos iguales).<br>
          Rutas con ⚓ (ferry): requieren locomotoras + cartas del color.<br>
          Rutas con ⛰ (tunel): pueden requerir cartas extra (se revelan 3 del mazo).
        </div>

        <div style="background:rgba(15,52,96,0.5); border:1px solid var(--border); border-radius:var(--radius-sm); padding:0.7rem; margin-bottom:0.5rem">
          <strong style="color:#f0b429">🎫 ROBAR BILLETES DE DESTINO</strong><br>
          Roba 3 billetes y quedate al menos 1.<br>
          Completar un billete da puntos; no completarlo resta puntos.
        </div>

        <div style="background:rgba(15,52,96,0.5); border:1px solid var(--border); border-radius:var(--radius-sm); padding:0.7rem; margin-bottom:0.5rem">
          <strong style="color:#e084a0">🏠 COLOCAR ESTACION</strong> (opcional)<br>
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
