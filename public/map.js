// ============================================================
// map.js — Datos del mapa de Europa: ciudades, rutas y billetes
// ============================================================

// Coordenadas de ciudades (x, y) para un viewBox de 1000x720
const CITIES = {
  'Lisboa':          { x: 52,  y: 540 },
  'Madrid':          { x: 130, y: 490 },
  'Barcelona':       { x: 235, y: 455 },
  'Pamplona':        { x: 190, y: 390 },
  'Burdeos':         { x: 215, y: 335 },
  'Marsella':        { x: 305, y: 415 },
  'París':           { x: 275, y: 270 },
  'Brest':           { x: 145, y: 260 },
  'Bruselas':        { x: 310, y: 225 },
  'Ámsterdam':       { x: 320, y: 185 },
  'Londres':         { x: 225, y: 195 },
  'Edimburgo':       { x: 195, y: 108 },
  'Frankfurt':       { x: 380, y: 255 },
  'Zúrich':          { x: 365, y: 325 },
  'München':         { x: 425, y: 305 },
  'Venecia':         { x: 425, y: 375 },
  'Génova':          { x: 370, y: 395 },
  'Roma':            { x: 420, y: 460 },
  'Palermo':         { x: 415, y: 555 },
  'Berlín':          { x: 460, y: 200 },
  'Varsovia':        { x: 570, y: 210 },
  'Viena':           { x: 490, y: 310 },
  'Budapest':        { x: 545, y: 345 },
  'Zagreb':          { x: 475, y: 370 },
  'Sarajevo':        { x: 510, y: 415 },
  'Belgrado':        { x: 560, y: 390 },
  'Sofía':           { x: 610, y: 420 },
  'Bucarest':        { x: 645, y: 370 },
  'Constantinopla':  { x: 700, y: 440 },
  'Atenas':          { x: 620, y: 520 },
  'Esmirna':         { x: 690, y: 510 },
  'Angora':          { x: 775, y: 455 },
  'Moscú':           { x: 770, y: 130 },
  'Petrogrado':      { x: 680, y: 68 },
  'Riga':            { x: 600, y: 118 },
  'Estocolmo':       { x: 490, y: 78 },
};

// Colores de cartas de vagón
const CARD_COLORS = [
  'rojo', 'azul', 'verde', 'amarillo',
  'negro', 'blanco', 'naranja', 'rosa'
];

// Colores visuales para cada tipo de carta/ruta
const COLOR_MAP = {
  'rojo':      '#dc3545',
  'azul':      '#2980b9',
  'verde':     '#27ae60',
  'amarillo':  '#f1c40f',
  'negro':     '#2c3e50',
  'blanco':    '#bdc3c7',
  'naranja':   '#e67e22',
  'rosa':      '#e84393',
  'gris':      '#7f8c8d',
  'locomotora':'#8e44ad',
};

// Colores de jugadores
const PLAYER_COLORS = {
  'rojo':    '#e74c3c',
  'azul':    '#3498db',
  'verde':   '#2ecc71',
  'amarillo':'#f39c12',
  'negro':   '#34495e',
};
const PLAYER_COLOR_LIST = ['rojo', 'azul', 'verde', 'amarillo', 'negro'];

// Definición de rutas
// type: 'normal' | 'tunnel' | 'ferry'
// ferryCount: locomotoras obligatorias para ferry
// double: true si hay ruta doble paralela (mismos extremos)
const ROUTES = [
  // === Iberia ===
  { id: 'r1',  cities: ['Lisboa', 'Madrid'],       color: 'rosa',     length: 3 },
  { id: 'r2',  cities: ['Madrid', 'Barcelona'],    color: 'amarillo', length: 2 },
  { id: 'r2b', cities: ['Madrid', 'Barcelona'],    color: 'gris',     length: 2, double: true },
  { id: 'r3',  cities: ['Madrid', 'Pamplona'],     color: 'blanco',   length: 3, type: 'tunnel' },
  { id: 'r4',  cities: ['Barcelona', 'Pamplona'],  color: 'gris',     length: 2, type: 'tunnel' },
  { id: 'r5',  cities: ['Barcelona', 'Marsella'],  color: 'gris',     length: 4 },
  { id: 'r3b', cities: ['Madrid', 'Pamplona'],     color: 'azul',     length: 3, type: 'tunnel', double: true },
  { id: 'r1b', cities: ['Lisboa', 'Madrid'],        color: 'gris',    length: 3, double: true },

  // === Francia ===
  { id: 'r6',  cities: ['Pamplona', 'Burdeos'],    color: 'gris',     length: 2 },
  { id: 'r7',  cities: ['Pamplona', 'París'],       color: 'azul',    length: 4 },
  { id: 'r8',  cities: ['Pamplona', 'Marsella'],   color: 'rojo',     length: 4 },
  { id: 'r9',  cities: ['Burdeos', 'París'],        color: 'gris',    length: 3 },
  { id: 'r9b', cities: ['Burdeos', 'París'],        color: 'rosa',    length: 3, double: true },
  { id: 'r10', cities: ['Burdeos', 'Marsella'],    color: 'gris',     length: 3 },
  { id: 'r11', cities: ['Marsella', 'Zúrich'],     color: 'rosa',     length: 2, type: 'tunnel' },
  { id: 'r12', cities: ['Marsella', 'Génova'],     color: 'gris',     length: 2 },
  { id: 'r13', cities: ['Brest', 'París'],          color: 'negro',   length: 3 },
  { id: 'r14', cities: ['Brest', 'Pamplona'],      color: 'rosa',     length: 4 },
  { id: 'r15', cities: ['París', 'Bruselas'],       color: 'amarillo',length: 2 },
  { id: 'r15b',cities: ['París', 'Bruselas'],       color: 'rojo',    length: 2, double: true },
  { id: 'r16', cities: ['París', 'Frankfurt'],      color: 'blanco',  length: 3 },
  { id: 'r16b',cities: ['París', 'Frankfurt'],      color: 'naranja', length: 3, double: true },
  { id: 'r17', cities: ['París', 'Zúrich'],         color: 'gris',    length: 3, type: 'tunnel' },

  // === Benelux / Reino Unido ===
  { id: 'r18', cities: ['Bruselas', 'Ámsterdam'],  color: 'negro',    length: 1 },
  { id: 'r19', cities: ['Bruselas', 'Frankfurt'],  color: 'azul',     length: 2 },
  { id: 'r20', cities: ['Londres', 'Ámsterdam'],   color: 'gris',     length: 2, type: 'ferry', ferryCount: 1 },
  { id: 'r21', cities: ['Londres', 'Edimburgo'],   color: 'naranja',  length: 4 },
  { id: 'r21b',cities: ['Londres', 'Edimburgo'],   color: 'negro',    length: 4, double: true },
  { id: 'r22', cities: ['Londres', 'Brest'],        color: 'gris',    length: 3, type: 'ferry', ferryCount: 1 },
  { id: 'r23', cities: ['Londres', 'París'],         color: 'gris',   length: 3, type: 'ferry', ferryCount: 1 },

  // === Alemania / Suiza / Austria ===
  { id: 'r24', cities: ['Ámsterdam', 'Frankfurt'],  color: 'gris',    length: 2 },
  { id: 'r25', cities: ['Frankfurt', 'München'],    color: 'rosa',    length: 2 },
  { id: 'r26', cities: ['Frankfurt', 'Berlín'],     color: 'gris',    length: 3 },
  { id: 'r26b',cities: ['Frankfurt', 'Berlín'],     color: 'rojo',    length: 3, double: true },
  { id: 'r27', cities: ['Zúrich', 'München'],       color: 'amarillo',length: 2 },
  { id: 'r28', cities: ['Zúrich', 'Venecia'],       color: 'verde',   length: 2, type: 'tunnel' },
  { id: 'r29', cities: ['München', 'Venecia'],      color: 'azul',    length: 2, type: 'tunnel' },
  { id: 'r30', cities: ['München', 'Viena'],        color: 'naranja', length: 3 },
  { id: 'r35', cities: ['Génova', 'Zúrich'],        color: 'gris',    length: 2, type: 'tunnel' },

  // === Italia ===
  { id: 'r31', cities: ['Venecia', 'Roma'],          color: 'negro',  length: 2 },
  { id: 'r32', cities: ['Génova', 'Roma'],           color: 'gris',   length: 2 },
  { id: 'r33', cities: ['Roma', 'Palermo'],          color: 'gris',   length: 4, type: 'ferry', ferryCount: 1 },
  { id: 'r34', cities: ['Venecia', 'Zagreb'],        color: 'gris',   length: 2 },

  // === Europa Central / Balcanes ===
  { id: 'r36', cities: ['Berlín', 'Varsovia'],       color: 'rosa',   length: 4 },
  { id: 'r36b',cities: ['Berlín', 'Varsovia'],       color: 'amarillo',length: 4, double: true },
  { id: 'r37', cities: ['Berlín', 'Viena'],          color: 'verde',  length: 3 },
  { id: 'r38', cities: ['Viena', 'Budapest'],        color: 'blanco', length: 1 },
  { id: 'r38b',cities: ['Viena', 'Budapest'],        color: 'rojo',   length: 1, double: true },
  { id: 'r39', cities: ['Viena', 'Zagreb'],          color: 'gris',   length: 2 },
  { id: 'r40', cities: ['Budapest', 'Zagreb'],       color: 'naranja',length: 2 },
  { id: 'r41', cities: ['Budapest', 'Belgrado'],    color: 'gris',    length: 2 },
  { id: 'r42', cities: ['Budapest', 'Bucarest'],    color: 'gris',    length: 4, type: 'tunnel' },
  { id: 'r43', cities: ['Zagreb', 'Sarajevo'],      color: 'rojo',    length: 3 },
  { id: 'r44', cities: ['Sarajevo', 'Belgrado'],    color: 'gris',    length: 2 },
  { id: 'r45', cities: ['Sarajevo', 'Sofía'],       color: 'gris',    length: 2, type: 'tunnel' },
  { id: 'r46', cities: ['Sarajevo', 'Atenas'],      color: 'verde',   length: 4 },
  { id: 'r47', cities: ['Belgrado', 'Sofía'],       color: 'gris',    length: 2 },
  { id: 'r48', cities: ['Belgrado', 'Bucarest'],    color: 'gris',    length: 4 },
  { id: 'r65', cities: ['Varsovia', 'Viena'],        color: 'azul',   length: 4 },

  // === Turquía / Grecia ===
  { id: 'r49', cities: ['Sofía', 'Constantinopla'], color: 'azul',    length: 3 },
  { id: 'r50', cities: ['Sofía', 'Bucarest'],       color: 'gris',    length: 2, type: 'tunnel' },
  { id: 'r51', cities: ['Bucarest', 'Constantinopla'],color:'amarillo',length: 3 },
  { id: 'r52', cities: ['Constantinopla', 'Esmirna'],color: 'gris',   length: 2 },
  { id: 'r53', cities: ['Constantinopla', 'Angora'], color: 'gris',   length: 2, type: 'tunnel' },
  { id: 'r54', cities: ['Esmirna', 'Angora'],       color: 'naranja', length: 3 },
  { id: 'r55', cities: ['Esmirna', 'Atenas'],       color: 'gris',    length: 2, type: 'ferry', ferryCount: 1 },
  { id: 'r56', cities: ['Atenas', 'Constantinopla'],color: 'gris',    length: 2 },
  { id: 'r57', cities: ['Palermo', 'Esmirna'],      color: 'gris',    length: 6, type: 'ferry', ferryCount: 2 },

  // === Norte / Este ===
  { id: 'r58', cities: ['Moscú', 'Petrogrado'],     color: 'blanco',  length: 4 },
  { id: 'r59', cities: ['Petrogrado', 'Riga'],      color: 'gris',    length: 4 },
  { id: 'r60', cities: ['Petrogrado', 'Estocolmo'], color: 'gris',    length: 3, type: 'tunnel' },
  { id: 'r61', cities: ['Riga', 'Varsovia'],         color: 'verde',  length: 4 },
  { id: 'r62', cities: ['Varsovia', 'Moscú'],        color: 'gris',   length: 6 },
  { id: 'r63', cities: ['Estocolmo', 'Ámsterdam'],  color: 'gris',    length: 5, type: 'ferry', ferryCount: 1 },
  { id: 'r64', cities: ['Riga', 'Berlín'],           color: 'gris',   length: 4 },
  { id: 'r67', cities: ['Estocolmo', 'Riga'],        color: 'gris',   length: 3 },
  { id: 'r68', cities: ['Moscú', 'Riga'],            color: 'gris',   length: 4 },
  { id: 'r66', cities: ['Edimburgo', 'Ámsterdam'],  color: 'gris',    length: 3, type: 'ferry', ferryCount: 1 },
  { id: 'r69', cities: ['Ámsterdam', 'Berlín'],     color: 'gris',    length: 3 },
  { id: 'r70', cities: ['Varsovia', 'Bucarest'],    color: 'gris',    length: 5 },
];

// Billetes de destino (ciudad origen, ciudad destino, puntos)
const TICKETS = [
  { from: 'Lisboa',       to: 'Moscú',           points: 20 },
  { from: 'Edimburgo',    to: 'Atenas',           points: 21 },
  { from: 'Barcelona',    to: 'Constantinopla',   points: 18 },
  { from: 'Brest',        to: 'Petrogrado',       points: 20 },
  { from: 'Londres',      to: 'Berlín',           points: 12 },
  { from: 'París',        to: 'Viena',            points: 8 },
  { from: 'Madrid',       to: 'Zúrich',           points: 8 },
  { from: 'Ámsterdam',    to: 'Varsovia',         points: 12 },
  { from: 'Budapest',     to: 'Sofía',            points: 5 },
  { from: 'Roma',         to: 'Esmirna',          points: 8 },
  { from: 'Marsella',     to: 'Budapest',         points: 10 },
  { from: 'Frankfurt',    to: 'Bucarest',         points: 13 },
  { from: 'Berlín',       to: 'Bucarest',         points: 15 },
  { from: 'Bruselas',     to: 'Budapest',         points: 9 },
  { from: 'Zagreb',       to: 'Constantinopla',   points: 8 },
  { from: 'Palermo',      to: 'Constantinopla',   points: 8 },
  { from: 'Edimburgo',    to: 'París',            points: 7 },
  { from: 'Ámsterdam',    to: 'Pamplona',         points: 7 },
  { from: 'Lisboa',       to: 'Constantinopla',   points: 22 },
  { from: 'Brest',        to: 'Marsella',         points: 7 },
  { from: 'París',        to: 'Zagreb',            points: 7 },
  { from: 'München',      to: 'Atenas',           points: 12 },
  { from: 'Varsovia',     to: 'Esmirna',          points: 14 },
  { from: 'Frankfurt',    to: 'Riga',             points: 12 },
  { from: 'Estocolmo',    to: 'Viena',            points: 11 },
  { from: 'Riga',         to: 'Bucarest',         points: 15 },
  { from: 'Burdeos',      to: 'Moscú',            points: 20 },
  { from: 'Petrogrado',   to: 'Constantinopla',   points: 17 },
  { from: 'Angora',       to: 'Petrogrado',       points: 20 },
  { from: 'Estocolmo',    to: 'Atenas',           points: 18 },
  { from: 'Londres',      to: 'Viena',            points: 10 },
  { from: 'Berlín',       to: 'Moscú',            points: 12 },
  { from: 'Atenas',       to: 'Angora',           points: 5 },
  { from: 'Venecia',      to: 'Constantinopla',   points: 10 },
  { from: 'Marsella',     to: 'Esmirna',          points: 12 },
  { from: 'Génova',       to: 'Budapest',         points: 8 },
  { from: 'Edimburgo',    to: 'Constantinopla',   points: 21 },
  { from: 'Madrid',       to: 'Bucarest',         points: 17 },
  { from: 'Brest',        to: 'Venecia',          points: 8 },
  { from: 'Sarajevo',     to: 'Angora',           points: 8 },
  { from: 'Palermo',      to: 'Moscú',            points: 20 },
  { from: 'Zúrich',       to: 'Belgrado',         points: 6 },
  { from: 'Roma',         to: 'Berlín',           points: 9 },
  { from: 'Frankfurt',    to: 'Constantinopla',   points: 14 },
  { from: 'Pamplona',     to: 'Moscú',            points: 18 },
  { from: 'Londres',      to: 'Atenas',           points: 15 },
];

// Puntuación por longitud de ruta
const ROUTE_POINTS = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 10,
  6: 15,
};

// Exportar para uso en Node.js o navegador
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CITIES, CARD_COLORS, COLOR_MAP, PLAYER_COLORS, PLAYER_COLOR_LIST, ROUTES, TICKETS, ROUTE_POINTS };
}
