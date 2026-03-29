// ============================================================
// test-game.js — Test automático: simula 2 jugadores, verifica flujo completo
// Ejecutar: node test-game.js
// ============================================================

const { io } = require('socket.io-client');

const URL = 'http://localhost:3000';
let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTests() {
  console.log('\n🚂 Test automático de Raíles de Europa\n');

  // --- Conectar 2 jugadores ---
  const p1 = io(URL, { forceNew: true });
  const p2 = io(URL, { forceNew: true });

  await new Promise(r => { let c = 0; p1.on('connect', () => { c++; if(c===2) r(); }); p2.on('connect', () => { c++; if(c===2) r(); }); });
  console.log('1. CONEXIÓN');
  assert(p1.connected, 'Jugador 1 conectado');
  assert(p2.connected, 'Jugador 2 conectado');
  assert(p1.id !== p2.id, 'IDs diferentes');

  // --- Crear sala ---
  console.log('\n2. CREAR SALA');
  let roomCode = null;
  p1.emit('createRoom', { name: 'Alice' });
  await sleep(300);

  roomCode = await new Promise(r => {
    p1.on('roomCreated', (data) => r(data.code));
    // Ya se emitió, re-emitir por si acaso
    p1.emit('createRoom', { name: 'Alice' });
  });
  // El primer createRoom ya se procesó, puede haber creado 2 salas. Usamos el último código.
  // Reconectemos limpio:
  p1.disconnect();
  p2.disconnect();
  await sleep(200);

  const player1 = io(URL, { forceNew: true });
  const player2 = io(URL, { forceNew: true });
  await new Promise(r => { let c=0; player1.on('connect',()=>{c++;if(c===2)r()}); player2.on('connect',()=>{c++;if(c===2)r()}); });

  // Crear sala limpia
  const code = await new Promise(r => {
    player1.once('roomCreated', data => r(data.code));
    player1.emit('createRoom', { name: 'Alice' });
  });
  assert(code && code.length === 4, `Sala creada: ${code}`);

  // --- Unirse a sala ---
  console.log('\n3. UNIRSE A SALA');
  const joinResult = await new Promise(r => {
    player2.once('roomJoined', data => r(data));
    player2.once('error', data => r({ error: data.message }));
    player2.emit('joinRoom', { name: 'Bob', code });
  });
  assert(!joinResult.error, `Bob se unió a sala ${code}`);

  // Verificar lobby
  await sleep(200);
  const lobby = await new Promise(r => {
    player1.once('lobbyUpdate', data => r(data));
    // Forzar re-emisión uniéndose de nuevo (ya está, el lobby ya se emitió)
    // Simplemente esperamos un poco más
    setTimeout(() => r(null), 500);
  });

  // --- Iniciar partida ---
  console.log('\n4. INICIAR PARTIDA');

  // Recoger eventos de ambos jugadores
  const p1Started = new Promise(r => player1.once('gameStarted', r));
  const p2Started = new Promise(r => player2.once('gameStarted', r));

  player1.emit('startGame');

  const [data1, data2] = await Promise.all([p1Started, p2Started]);

  assert(data1.gameState !== undefined, 'Alice recibió gameState');
  assert(data1.privateState !== undefined, 'Alice recibió privateState');
  assert(data1.initialTickets && data1.initialTickets.length === 3, `Alice recibió ${data1.initialTickets?.length} billetes iniciales`);
  assert(data1.privateState.hand.length === 4, `Alice tiene ${data1.privateState.hand.length} cartas en mano`);

  assert(data2.gameState !== undefined, 'Bob recibió gameState');
  assert(data2.privateState !== undefined, 'Bob recibió privateState');
  assert(data2.initialTickets && data2.initialTickets.length === 3, `Bob recibió ${data2.initialTickets?.length} billetes iniciales`);
  assert(data2.privateState.hand.length === 4, `Bob tiene ${data2.privateState.hand.length} cartas en mano`);

  // Verificar estado público
  const gs = data1.gameState;
  assert(gs.players.length === 2, `${gs.players.length} jugadores en la partida`);
  assert(gs.faceUpCards.length === 5, `${gs.faceUpCards.length} cartas visibles`);
  assert(gs.drawPileCount > 0, `Mazo: ${gs.drawPileCount} cartas`);
  assert(gs.state === 'playing', `Estado: ${gs.state}`);
  assert(gs.currentPlayer === 0, `Turno del jugador ${gs.currentPlayer}`);

  // --- Elegir billetes iniciales ---
  console.log('\n5. ELEGIR BILLETES INICIALES');

  const p1Private = new Promise(r => player1.once('privateUpdate', r));
  player1.emit('chooseInitialTickets', { kept: [0, 1] });
  const p1Priv = await p1Private;
  assert(p1Priv.tickets.length === 2, `Alice conservó ${p1Priv.tickets.length} billetes`);
  assert(p1Priv.hand.length === 4, `Alice sigue con ${p1Priv.hand.length} cartas`);

  const p2Private = new Promise(r => player2.once('privateUpdate', r));
  player2.emit('chooseInitialTickets', { kept: [0, 1, 2] });
  const p2Priv = await p2Private;
  assert(p2Priv.tickets.length === 3, `Bob conservó ${p2Priv.tickets.length} billetes`);

  await sleep(300);

  // --- Turno: robar carta del mazo ---
  console.log('\n6. ACCIONES DE TURNO');

  // Determinar quién tiene el turno (jugador 0 = Alice)
  const currentId = data1.gameState.players[0].id;
  const activePlayer = currentId === player1.id ? player1 : player2;
  const activeName = currentId === player1.id ? 'Alice' : 'Bob';

  // El jugador no activo intenta robar → debe fallar
  const otherPlayer = activePlayer === player1 ? player2 : player1;
  const otherName = activeName === 'Alice' ? 'Bob' : 'Alice';

  const errorPromise = new Promise(r => {
    otherPlayer.once('error', data => r(data.message));
    setTimeout(() => r(null), 1000);
  });
  otherPlayer.emit('drawFromDeck');
  const errorMsg = await errorPromise;
  assert(errorMsg === 'No es tu turno', `${otherName} bloqueado correctamente: "${errorMsg}"`);

  // El jugador activo roba 1 carta
  const drawPriv1 = new Promise(r => activePlayer.once('privateUpdate', r));
  activePlayer.emit('drawFromDeck');
  const afterDraw1 = await drawPriv1;
  assert(afterDraw1.hand.length === 5, `${activeName} robó 1ª carta: ${afterDraw1.hand.length} cartas`);

  // Roba la 2ª carta (fin de turno) — registrar listeners ANTES de emitir
  const drawPriv2 = new Promise(r => activePlayer.once('privateUpdate', r));
  // Esperar al gameState que viene DESPUÉS del nextTurn (currentPlayer cambiará)
  const stateAfterTurn = new Promise(r => {
    activePlayer.on('gameState', function handler(s) {
      // Solo resolver cuando el turno haya cambiado
      if (s.currentPlayer === 1) { activePlayer.off('gameState', handler); r(s); }
    });
    setTimeout(() => r(null), 3000); // timeout seguridad
  });
  activePlayer.emit('drawFromDeck');
  const afterDraw2 = await drawPriv2;
  assert(afterDraw2.hand.length === 6, `${activeName} robó 2ª carta: ${afterDraw2.hand.length} cartas`);

  const newState = await stateAfterTurn;
  assert(newState && newState.currentPlayer === 1, `Turno pasó al jugador ${newState ? newState.currentPlayer : 'TIMEOUT'}`);

  // --- Robar carta visible ---
  console.log('\n7. ROBAR CARTA VISIBLE');
  const nextActive = newState.currentPlayer === 0 ? player1 : player2;
  const nextName = newState.currentPlayer === 0 ? 'Alice' : 'Bob';

  const visPriv1 = new Promise(r => nextActive.once('privateUpdate', r));
  nextActive.emit('drawFaceUp', { index: 0 });
  const afterVis1 = await visPriv1;
  const prevHandSize = newState.currentPlayer === 0 ? afterDraw2.hand.length : p2Priv.hand.length;
  assert(afterVis1.hand.length >= 4, `${nextName} robó carta visible: ${afterVis1.hand.length} cartas`);

  // 2ª carta del mazo
  const visPriv2 = new Promise(r => nextActive.once('privateUpdate', r));
  nextActive.emit('drawFromDeck');
  await visPriv2;

  await sleep(200);

  // --- Verificar estado después de turnos ---
  console.log('\n8. ESTADO POST-TURNOS');
  await sleep(300);

  // --- Chat ---
  console.log('\n9. CHAT');
  const chatPromise = new Promise(r => {
    player2.once('chatUpdate', r);
    setTimeout(() => r(null), 500);
  });
  player1.emit('chatMessage', { message: 'Hola desde el test!' });
  const chat = await chatPromise;
  assert(chat && chat.length > 0, `Chat funciona: ${chat ? chat.length : 0} mensajes`);
  assert(chat && chat[0].message === 'Hola desde el test!', `Mensaje recibido correctamente`);

  // --- Simular rejoin (como game.html haría) ---
  console.log('\n10. REJOIN (simulación game.html)');
  const player1Rejoin = io(URL, { forceNew: true });
  await new Promise(r => player1Rejoin.on('connect', r));

  const rejoinData = await new Promise(r => {
    player1Rejoin.once('rejoinComplete', r);
    player1Rejoin.emit('rejoinGame', { code, name: 'Alice' });
  });

  assert(rejoinData.gameState !== undefined, 'Rejoin: recibió gameState');
  assert(rejoinData.privateState !== undefined, 'Rejoin: recibió privateState');
  assert(rejoinData.privateState.tickets.length >= 2, `Rejoin: Alice tiene ${rejoinData.privateState.tickets.length} billetes`);
  assert(rejoinData.privateState.hand.length >= 4, `Rejoin: Alice tiene ${rejoinData.privateState.hand.length} cartas`);

  // --- Verificar que las coordenadas GEO_CITIES están definidas para todas las rutas ---
  console.log('\n11. VERIFICACIÓN DE DATOS');
  const mapData = require('./public/map.js');
  const geoCities = ['Lisboa','Madrid','Barcelona','Pamplona','Burdeos','Marsella','Brest','París','Londres','Ámsterdam','Bruselas','Edimburgo','Frankfurt','Berlín','München','Zúrich','Génova','Venecia','Roma','Palermo','Viena','Budapest','Zagreb','Varsovia','Belgrado','Sarajevo','Sofía','Bucarest','Constantinopla','Angora','Esmirna','Atenas','Riga','Petrogrado','Estocolmo','Moscú'];
  const routeCities = new Set();
  mapData.ROUTES.forEach(r => { routeCities.add(r.cities[0]); routeCities.add(r.cities[1]); });
  const missing = [...routeCities].filter(c => !geoCities.includes(c));
  assert(missing.length === 0, `Todas las ciudades de rutas tienen coordenadas geo (faltan: ${missing.join(', ') || 'ninguna'})`);
  assert(mapData.ROUTES.length >= 70, `${mapData.ROUTES.length} rutas definidas`);
  assert(mapData.TICKETS.length >= 40, `${mapData.TICKETS.length} billetes definidos`);

  // --- Resumen ---
  console.log('\n════════════════════════════════════');
  console.log(`  ✅ Pasados: ${passed}`);
  console.log(`  ❌ Fallidos: ${failed}`);
  console.log('════════════════════════════════════\n');

  // Limpiar
  player1.disconnect();
  player2.disconnect();
  player1Rejoin.disconnect();

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Error en tests:', err);
  process.exit(1);
});
