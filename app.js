/* ============================================================================
 *  app.js — Lógica de la INTERFAZ de SmartCompiler
 *
 *  Este archivo NO contiene lógica del compilador (esa vive en compiler.js).
 *  Aquí solo se conecta la interfaz con el compilador:
 *    - Lee la expresión y el límite de longitud ingresados por el usuario
 *    - Llama a compilar() y muestra los resultados en pantalla
 *    - Administra el historial de operaciones (Mejora 6)
 *    - Administra la tabla de variables visible (Mejora 5)
 *    - Carga los ejemplos de un clic
 * ============================================================================ */

"use strict";

/* ----------------------------------------------------------------------------
 *  ESTADO GLOBAL DE LA APLICACIÓN
 * ---------------------------------------------------------------------------- */

// Tabla de símbolos: persiste entre ejecuciones para que las variables
// asignadas (x=5) puedan usarse en expresiones posteriores (x*2).
const tablaVariables = {};

// Historial de operaciones exitosas (Mejora 6)
const historial = [];

/* ----------------------------------------------------------------------------
 *  REFERENCIAS A ELEMENTOS DEL DOM
 * ---------------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

const inputExpresion = $("expresion");
const inputLongitud = $("longitudMax");
const contadorCaracteres = $("contadorCaracteres");
const panelSalida = $("panelSalida");
const listaHistorial = $("listaHistorial");
const listaVariables = $("listaVariables");

/* ----------------------------------------------------------------------------
 *  EJEMPLOS DE UN CLIC
 *  Incluye los casos del enunciado del proyecto: válidos e inválidos.
 * ---------------------------------------------------------------------------- */
const EJEMPLOS = [
  // --- Válidos ---
  { expr: "3+4",        desc: "Suma simple",                        valido: true },
  { expr: "120+35",     desc: "Números de varios dígitos (Mejora 4)", valido: true },
  { expr: "(250+80)*4", desc: "Paréntesis y precedencia",           valido: true },
  { expr: "(3+4)*2",    desc: "Ver notación postfija (Mejora 7)",   valido: true },
  { expr: "x=3+4",      desc: "Asignación de variable (Mejora 5)",  valido: true },
  { expr: "y=(4+2)*3",  desc: "Asignación con paréntesis",          valido: true },
  { expr: "x*2",        desc: "Usar variable ya definida",          valido: true },
  { expr: "10/4",       desc: "División con decimales",             valido: true },
  // --- Inválidos (los del enunciado) ---
  { expr: "3+*4",   desc: "Operadores duplicados",          valido: false },
  { expr: "(8+2",   desc: "Paréntesis sin cerrar",          valido: false },
  { expr: "7//2",   desc: "Operador '/' duplicado",         valido: false },
  { expr: "x=5+$4", desc: "Símbolo no permitido '$'",       valido: false },
  { expr: "8/0",    desc: "División entre cero (Mejora 1)", valido: false },
  { expr: "3+",     desc: "Expresión incompleta (Mejora 2)", valido: false },
  { expr: "z+1",    desc: "Variable no definida",           valido: false },
  { expr: "5/(3-3)", desc: "División entre cero oculta",    valido: false },
];

// Genera los botones de ejemplo dentro de las dos columnas (válidos/erróneos)
function renderizarEjemplos() {
  const contValidos = $("ejemplosValidos");
  const contInvalidos = $("ejemplosInvalidos");

  for (const ej of EJEMPLOS) {
    const boton = document.createElement("button");
    boton.className = "ejemplo " + (ej.valido ? "ejemplo-ok" : "ejemplo-error");
    boton.innerHTML = `<code>${escaparHTML(ej.expr)}</code><span>${ej.desc}</span>`;
    boton.title = "Clic para compilar este ejemplo";
    // Al hacer clic: se carga la expresión en el editor y se compila de inmediato
    boton.addEventListener("click", () => {
      inputExpresion.value = ej.expr;
      actualizarContador();
      ejecutarCompilacion();
      inputExpresion.focus();
    });
    (ej.valido ? contValidos : contInvalidos).appendChild(boton);
  }
}

/* ----------------------------------------------------------------------------
 *  UTILIDADES
 * ---------------------------------------------------------------------------- */

// Evita inyección de HTML al mostrar texto que escribió el usuario
function escaparHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// Formatea un número para mostrarlo (sin decimales innecesarios)
function formatearNumero(n) {
  return Number.isInteger(n) ? String(n) : String(n);
}

// Actualiza el contador "n / max caracteres" bajo el editor (Mejora 3)
function actualizarContador() {
  const max = parseInt(inputLongitud.value, 10) || 30;
  const len = inputExpresion.value.length;
  contadorCaracteres.textContent = `${len} / ${max} caracteres`;
  contadorCaracteres.classList.toggle("excedido", len > max);
}

/* ----------------------------------------------------------------------------
 *  LÍNEA DE FASES DEL COMPILADOR
 *  Dibuja la "tubería" Validación → Léxico → Sintáctico → Semántico → Resultado
 *  marcando en verde las fases superadas y en rojo la fase que falló.
 * ---------------------------------------------------------------------------- */
const FASES = [
  { id: "validacion", nombre: "Validación" },
  { id: "lexico",     nombre: "Análisis Léxico" },
  { id: "sintactico", nombre: "Análisis Sintáctico" },
  { id: "semantico",  nombre: "Análisis Semántico" },
];

function htmlFases(faseFallida) {
  const indiceFallo = faseFallida
    ? FASES.findIndex((f) => f.id === faseFallida)
    : FASES.length; // sin fallo: todas en verde

  let html = '<div class="fases">';
  FASES.forEach((fase, i) => {
    let estado;
    if (i < indiceFallo) estado = "ok";        // fase superada
    else if (i === indiceFallo) estado = "fallo"; // fase que detectó el error
    else estado = "pendiente";                  // no se llegó a ejecutar
    // Icono de Lucide según el estado de la fase
    const icono = estado === "ok" ? "check" : estado === "fallo" ? "x" : "minus";
    html += `<div class="fase fase-${estado}"><i data-lucide="${icono}" class="fase-icono"></i>${fase.nombre}</div>`;
    if (i < FASES.length - 1) html += '<div class="fase-flecha">→</div>';
  });
  html += "</div>";
  return html;
}

/* ----------------------------------------------------------------------------
 *  RENDERIZADO DE RESULTADOS
 * ---------------------------------------------------------------------------- */

// Muestra la expresión con un puntero ^ bajo la posición del error,
// igual que lo hacen los compiladores reales (gcc, python, etc.)
function htmlPunteroError(expresion, posicion) {
  if (posicion === null || posicion === undefined) return "";
  const pos = Math.min(posicion, expresion.length);
  return (
    '<pre class="puntero-error">' +
    escaparHTML(expresion) + "\n" +
    " ".repeat(pos) + '<span class="caret">^</span>' +
    "</pre>"
  );
}

// Tabla de tokens producidos por el analizador léxico
function htmlTablaTokens(tokens) {
  const filas = tokens
    .filter((t) => t.tipo !== "FIN")
    .map(
      (t) => `<tr>
        <td><span class="badge badge-${t.tipo}">${t.tipo}</span></td>
        <td><code>${escaparHTML(t.valor)}</code></td>
        <td>${t.posicion}</td>
      </tr>`
    )
    .join("");
  return `<table class="tabla">
    <thead><tr><th>Tipo</th><th>Valor</th><th>Posición</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>`;
}

// Tarjetas con las estadísticas de la expresión (Mejora 8)
function htmlEstadisticas(stats) {
  const items = [
    { n: stats.numeros,    t: "Números" },
    { n: stats.operadores, t: "Operadores" },
    { n: stats.parentesis, t: "Paréntesis" },
    { n: stats.variables,  t: "Variables" },
    { n: stats.totalTokens, t: "Tokens totales" },
  ];
  return (
    '<div class="stats-grid">' +
    items
      .map(
        (it) =>
          `<div class="stat"><div class="stat-num">${it.n}</div><div class="stat-label">${it.t}</div></div>`
      )
      .join("") +
    "</div>"
  );
}

// Sección plegable reutilizable (<details>) para tokens, AST, etc.
function htmlSeccion(titulo, contenido, abierta = false) {
  return `<details class="seccion" ${abierta ? "open" : ""}>
    <summary>${titulo}</summary>
    <div class="seccion-cuerpo">${contenido}</div>
  </details>`;
}

// Pinta TODO el panel de salida según el resultado de compilar()
function mostrarResultado(res) {
  let html = htmlFases(res.faseFallida);

  if (res.exito) {
    // ---------- COMPILACIÓN EXITOSA ----------
    const esAsignacion = res.ast.tipo === "asignacion";
    html += `<div class="resultado-ok">
      <div class="resultado-titulo"><i data-lucide="check-circle"></i> EXPRESIÓN VÁLIDA</div>
      <div class="resultado-valor">
        ${esAsignacion ? `<span class="resultado-var">${escaparHTML(res.ast.nombre)} =</span> ` : "Resultado: "}
        <strong>${formatearNumero(res.resultado)}</strong>
      </div>
      <div class="resultado-postfijo">Postfijo: <code>${escaparHTML(res.postfijo)}</code></div>
    </div>`;
  } else {
    // ---------- ERROR: formato amigable exigido por la empresa ----------
    const e = res.error;
    html += `<div class="resultado-error">
      <div class="resultado-titulo"><i data-lucide="x-circle"></i> ERROR ${e.tipo}</div>
      ${e.posicion !== null ? `<div class="error-linea"><span class="error-etiqueta">Posición:</span> ${e.posicion}</div>` : ""}
      <div class="error-linea"><span class="error-etiqueta">Detalle:</span> ${escaparHTML(e.detalle)}</div>
      <div class="error-linea"><span class="error-etiqueta">Sugerencia:</span> ${escaparHTML(e.sugerencia)}</div>
      ${htmlPunteroError(res.expresion, e.posicion)}
    </div>`;
  }

  // Secciones detalladas: solo se muestran las fases que sí se completaron
  if (res.tokens) {
    html += htmlSeccion(
      `<i data-lucide="list"></i> Tokens (Análisis Léxico) — ${res.tokens.length - 1} tokens`,
      htmlTablaTokens(res.tokens)
    );
  }
  if (res.arbolTexto) {
    html += htmlSeccion(
      '<i data-lucide="network"></i> Árbol de Sintaxis (AST)',
      `<pre class="ast">${escaparHTML(res.arbolTexto)}</pre>`
    );
  }
  if (res.estadisticas) {
    html += htmlSeccion(
      '<i data-lucide="bar-chart-3"></i> Estadísticas (Mejora 8)',
      htmlEstadisticas(res.estadisticas),
      true
    );
  }

  panelSalida.innerHTML = html;
  // Lucide reemplaza las etiquetas <i data-lucide> por sus SVG.
  // Debe llamarse cada vez que se inserta HTML nuevo con iconos.
  lucide.createIcons();
}

/* ----------------------------------------------------------------------------
 *  HISTORIAL DE OPERACIONES (Mejora 6)
 * ---------------------------------------------------------------------------- */
function agregarAlHistorial(expresion, resultado) {
  historial.push({ expresion, resultado });
  renderizarHistorial();
}

function renderizarHistorial() {
  if (historial.length === 0) {
    listaHistorial.innerHTML = '<li class="vacio">Aún no hay operaciones</li>';
    return;
  }
  // Se muestra numerado, el más reciente al final (como pide el enunciado)
  listaHistorial.innerHTML = historial
    .map(
      (h, i) =>
        `<li><span class="hist-num">${i + 1}.</span> <code>${escaparHTML(h.expresion)}</code> = <strong>${formatearNumero(h.resultado)}</strong></li>`
    )
    .join("");
  // Auto-scroll al último elemento agregado
  listaHistorial.scrollTop = listaHistorial.scrollHeight;
}

/* ----------------------------------------------------------------------------
 *  TABLA DE VARIABLES VISIBLES (Mejora 5)
 * ---------------------------------------------------------------------------- */
function renderizarVariables() {
  const nombres = Object.keys(tablaVariables);
  if (nombres.length === 0) {
    listaVariables.innerHTML = '<li class="vacio">Sin variables definidas</li>';
    return;
  }
  listaVariables.innerHTML = nombres
    .map(
      (n) =>
        `<li><code class="var-nombre">${escaparHTML(n)}</code> = <strong>${formatearNumero(tablaVariables[n])}</strong></li>`
    )
    .join("");
}

/* ----------------------------------------------------------------------------
 *  ACCIÓN PRINCIPAL: COMPILAR
 * ---------------------------------------------------------------------------- */
function ejecutarCompilacion() {
  const expresion = inputExpresion.value;
  const longitudMax = parseInt(inputLongitud.value, 10) || 30;

  // Se invoca el compilador completo (todas las fases)
  const res = compilar(expresion, longitudMax, tablaVariables);

  // Se pinta el resultado en el panel de salida
  mostrarResultado(res);

  // Si fue exitosa: se registra en el historial (Mejora 6) y se
  // actualiza la tabla de variables por si hubo una asignación (Mejora 5)
  if (res.exito) {
    agregarAlHistorial(expresion.trim(), res.resultado);
    renderizarVariables();
  }
}

/* ----------------------------------------------------------------------------
 *  EVENTOS DE LA INTERFAZ
 * ---------------------------------------------------------------------------- */

// Botón "Compilar"
$("btnCompilar").addEventListener("click", ejecutarCompilacion);

// Tecla Enter dentro del editor también compila
inputExpresion.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    ejecutarCompilacion();
  }
});

// Contador de caracteres en vivo (Mejora 3)
inputExpresion.addEventListener("input", actualizarContador);
inputLongitud.addEventListener("input", actualizarContador);

// Botón "Limpiar": borra solo el editor y el panel de salida
$("btnLimpiar").addEventListener("click", () => {
  inputExpresion.value = "";
  actualizarContador();
  panelSalida.innerHTML =
    '<div class="placeholder">Escriba una expresión y presione <strong>Compilar</strong>, o seleccione un ejemplo.</div>';
  inputExpresion.focus();
});

// Botón "Borrar historial" (Mejora 6)
$("btnBorrarHistorial").addEventListener("click", () => {
  historial.length = 0;
  renderizarHistorial();
});

// Botón "Borrar variables" (Mejora 5)
$("btnBorrarVariables").addEventListener("click", () => {
  for (const k of Object.keys(tablaVariables)) delete tablaVariables[k];
  renderizarVariables();
});

/* ----------------------------------------------------------------------------
 *  INICIALIZACIÓN
 * ---------------------------------------------------------------------------- */
renderizarEjemplos();
renderizarHistorial();
renderizarVariables();
actualizarContador();
// Convierte todos los <i data-lucide> estáticos del HTML en iconos SVG
lucide.createIcons();
inputExpresion.focus();
