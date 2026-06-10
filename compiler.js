/* ============================================================================
 *  SmartCompiler — Mini Compilador Inteligente
 *  Proyecto Integrador Final — DataLogic Systems
 *
 *  Este archivo contiene TODA la lógica del compilador, organizada igual
 *  que un compilador real, en fases:
 *
 *    1. VALIDACIÓN PREVIA   → longitud máxima de la expresión (Mejora 3)
 *    2. ANÁLISIS LÉXICO     → convierte el texto en tokens y detecta
 *                             símbolos no permitidos
 *    3. ANÁLISIS SINTÁCTICO → verifica la estructura (gramática) y construye
 *                             el Árbol de Sintaxis Abstracta (AST)
 *    4. ANÁLISIS SEMÁNTICO  → variables no definidas, división entre cero
 *       Y EVALUACIÓN          (Mejoras 1 y 5) y cálculo del resultado
 *    5. SALIDAS ADICIONALES → notación postfija (Mejora 7) y
 *                             estadísticas (Mejora 8)
 *
 *  Todos los errores se reportan con un formato amigable (Mejora 2):
 *      tipo, posición, detalle y sugerencia.
 * ============================================================================ */

"use strict";

/* ============================================================================
 *  TIPOS DE TOKEN
 *  Un "token" es la unidad mínima con significado dentro de la expresión.
 *  El analizador léxico transforma la cadena de entrada en una lista de
 *  estos tokens, que luego consume el analizador sintáctico.
 * ============================================================================ */
const TIPO_TOKEN = {
  NUMERO: "NUMERO",               // 3, 120, 45.5  (Mejora 4: múltiples dígitos)
  IDENTIFICADOR: "IDENTIFICADOR", // x, total, y2  (Mejora 5: variables)
  OPERADOR: "OPERADOR",           // + - * /
  PAREN_IZQ: "PAREN_IZQ",         // (
  PAREN_DER: "PAREN_DER",         // )
  ASIGNACION: "ASIGNACION",       // =
  FIN: "FIN",                     // marcador de fin de entrada (EOF)
};

/* ============================================================================
 *  ERROR DEL COMPILADOR
 *  Clase de error personalizada. En lugar de decir solo "Error de sintaxis",
 *  guarda toda la información que la empresa exige mostrar al usuario:
 *    - tipo:      LÉXICO | SINTÁCTICO | SEMÁNTICO | VALIDACIÓN
 *    - posicion:  índice (desde 0) donde ocurrió el problema
 *    - detalle:   qué se esperaba y qué se encontró
 *    - sugerencia: cómo corregirlo (Mejora 2: sugerencias automáticas)
 * ============================================================================ */
class ErrorCompilador extends Error {
  constructor(tipo, posicion, detalle, sugerencia) {
    super(detalle);
    this.tipo = tipo;
    this.posicion = posicion;   // null cuando el error no tiene posición puntual
    this.detalle = detalle;
    this.sugerencia = sugerencia;
  }
}

/* ============================================================================
 *  FASE 1 — VALIDACIÓN PREVIA (Mejora 3: validación de longitud)
 *  Antes de analizar nada, se controla que la expresión no supere el tamaño
 *  máximo permitido (configurable por el usuario desde la interfaz).
 * ============================================================================ */
function validarLongitud(expresion, longitudMaxima) {
  if (expresion.trim().length === 0) {
    throw new ErrorCompilador(
      "VALIDACIÓN",
      null,
      "La expresión está vacía",
      "Escriba una expresión, por ejemplo: 3+4"
    );
  }
  if (expresion.length > longitudMaxima) {
    throw new ErrorCompilador(
      "VALIDACIÓN",
      null,
      `La expresión supera el tamaño permitido (${expresion.length} de ${longitudMaxima} caracteres)`,
      `Reduzca la expresión a máximo ${longitudMaxima} caracteres o aumente el límite`
    );
  }
}

/* ============================================================================
 *  FASE 2 — ANALIZADOR LÉXICO (Lexer / Scanner)
 *
 *  Recorre la cadena carácter por carácter y produce la lista de tokens.
 *  Responsabilidades:
 *    - Agrupar dígitos consecutivos en UN solo número (Mejora 4),
 *      incluyendo decimales como 4.5
 *    - Agrupar letras en identificadores/variables (Mejora 5)
 *    - Reconocer operadores, paréntesis y el signo '='
 *    - Ignorar espacios en blanco
 *    - Rechazar cualquier símbolo NO permitido ($, #, &, etc.)
 *      generando un ERROR LÉXICO con posición y sugerencia
 * ============================================================================ */
function analizadorLexico(expresion) {
  const tokens = [];
  let i = 0; // posición actual dentro de la cadena

  // Funciones auxiliares de clasificación de caracteres
  const esDigito = (c) => c >= "0" && c <= "9";
  const esLetra = (c) =>
    (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";

  while (i < expresion.length) {
    const c = expresion[i];

    // --- Espacios en blanco: se ignoran, no generan token -----------------
    if (c === " " || c === "\t") {
      i++;
      continue;
    }

    // --- NÚMEROS (enteros o decimales) -------------------------------------
    // Se acumulan todos los dígitos seguidos para formar números de
    // múltiples dígitos (Mejora 4). Se permite UN solo punto decimal.
    if (esDigito(c)) {
      const inicio = i;
      let lexema = "";
      let tienePunto = false;

      while (i < expresion.length && (esDigito(expresion[i]) || expresion[i] === ".")) {
        if (expresion[i] === ".") {
          if (tienePunto) {
            // Segundo punto en el mismo número → error léxico (ej: 3..4)
            throw new ErrorCompilador(
              "LÉXICO",
              i,
              `El número '${lexema}.' contiene más de un punto decimal`,
              "Escriba el número con un solo punto decimal, por ejemplo: 3.4"
            );
          }
          tienePunto = true;
        }
        lexema += expresion[i];
        i++;
      }

      // Un número no puede terminar en punto (ej: "5.")
      if (lexema.endsWith(".")) {
        throw new ErrorCompilador(
          "LÉXICO",
          i - 1,
          `El número '${lexema}' termina en punto decimal`,
          "Agregue dígitos después del punto, por ejemplo: 5.0"
        );
      }

      tokens.push({
        tipo: TIPO_TOKEN.NUMERO,
        valor: lexema,
        posicion: inicio,
      });
      continue;
    }

    // --- IDENTIFICADORES / VARIABLES (Mejora 5) -----------------------------
    // Inician con letra o '_' y pueden continuar con letras, dígitos o '_'.
    // Ejemplos válidos: x, total, y2, _aux
    if (esLetra(c)) {
      const inicio = i;
      let lexema = "";
      while (i < expresion.length && (esLetra(expresion[i]) || esDigito(expresion[i]))) {
        lexema += expresion[i];
        i++;
      }
      tokens.push({
        tipo: TIPO_TOKEN.IDENTIFICADOR,
        valor: lexema,
        posicion: inicio,
      });
      continue;
    }

    // --- OPERADORES ARITMÉTICOS ---------------------------------------------
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ tipo: TIPO_TOKEN.OPERADOR, valor: c, posicion: i });
      i++;
      continue;
    }

    // --- PARÉNTESIS ----------------------------------------------------------
    if (c === "(") {
      tokens.push({ tipo: TIPO_TOKEN.PAREN_IZQ, valor: c, posicion: i });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ tipo: TIPO_TOKEN.PAREN_DER, valor: c, posicion: i });
      i++;
      continue;
    }

    // --- ASIGNACIÓN ------------------------------------------------------------
    if (c === "=") {
      tokens.push({ tipo: TIPO_TOKEN.ASIGNACION, valor: c, posicion: i });
      i++;
      continue;
    }

    // --- CARÁCTER NO PERMITIDO → ERROR LÉXICO -------------------------------
    // Cualquier otro símbolo ($, #, &, !, ?, etc.) no pertenece al alfabeto
    // del lenguaje y se rechaza inmediatamente con un mensaje claro.
    throw new ErrorCompilador(
      "LÉXICO",
      i,
      `El carácter '${c}' no está permitido en el lenguaje`,
      "Use solo números, letras, operadores (+, -, *, /), paréntesis y '='"
    );
  }

  // Token especial de fin de entrada: facilita al parser saber cuándo terminó.
  tokens.push({ tipo: TIPO_TOKEN.FIN, valor: "", posicion: expresion.length });
  return tokens;
}

/* ============================================================================
 *  FASE 3 — ANALIZADOR SINTÁCTICO (Parser)
 *
 *  Implementa un PARSER DESCENDENTE RECURSIVO basado en esta gramática
 *  (cada regla de la gramática es una función del parser):
 *
 *      entrada     →  asignacion | expresion
 *      asignacion  →  IDENTIFICADOR '=' expresion
 *      expresion   →  termino ( ('+' | '-') termino )*
 *      termino     →  factor  ( ('*' | '/') factor  )*
 *      factor      →  NUMERO | IDENTIFICADOR | '(' expresion ')'
 *
 *  La separación expresion/termino/factor garantiza la PRECEDENCIA de
 *  operadores: * y / se evalúan antes que + y -, y los paréntesis tienen
 *  la máxima prioridad.
 *
 *  El parser construye un AST (Árbol de Sintaxis Abstracta) cuyos nodos son:
 *      { tipo:'numero',     valor, posicion }
 *      { tipo:'variable',   nombre, posicion }
 *      { tipo:'binario',    operador, izquierda, derecha, posicion }
 *      { tipo:'asignacion', nombre, expresion, posicion }
 * ============================================================================ */
class AnalizadorSintactico {
  constructor(tokens) {
    this.tokens = tokens;
    this.actual = 0; // índice del token que se está analizando
  }

  // ---- Utilidades de navegación sobre la lista de tokens -------------------
  tokenActual() {
    return this.tokens[this.actual];
  }

  tokenAnterior() {
    return this.actual > 0 ? this.tokens[this.actual - 1] : null;
  }

  avanzar() {
    const t = this.tokenActual();
    if (t.tipo !== TIPO_TOKEN.FIN) this.actual++;
    return t;
  }

  // Descripción legible de un token para los mensajes de error
  describir(token) {
    if (token.tipo === TIPO_TOKEN.FIN) return "el final de la expresión";
    return `'${token.valor}'`;
  }

  // ---- Punto de entrada del análisis ----------------------------------------
  // entrada → asignacion | expresion
  analizar() {
    let ast;

    // Si la entrada empieza con IDENTIFICADOR seguido de '=' es una
    // asignación de variable (ej: x=3+4). Se decide con UN token de
    // anticipación (lookahead), como en los parsers LL(1).
    if (
      this.tokenActual().tipo === TIPO_TOKEN.IDENTIFICADOR &&
      this.tokens[this.actual + 1] &&
      this.tokens[this.actual + 1].tipo === TIPO_TOKEN.ASIGNACION
    ) {
      ast = this.asignacion();
    } else {
      ast = this.expresion();
    }

    // Si después de analizar la expresión completa quedan tokens sin
    // consumir, la entrada está mal formada. Se diagnostica el sobrante.
    const sobrante = this.tokenActual();
    if (sobrante.tipo !== TIPO_TOKEN.FIN) {
      if (sobrante.tipo === TIPO_TOKEN.PAREN_DER) {
        // Ej: "3+4)" → paréntesis de cierre sin pareja
        throw new ErrorCompilador(
          "SINTÁCTICO",
          sobrante.posicion,
          "Se encontró un paréntesis de cierre ')' sin su paréntesis de apertura",
          "Elimine el ')' sobrante o agregue '(' donde corresponda"
        );
      }
      if (sobrante.tipo === TIPO_TOKEN.ASIGNACION) {
        // Ej: "3=4" o "x+1=2" → el '=' solo es válido al inicio
        throw new ErrorCompilador(
          "SINTÁCTICO",
          sobrante.posicion,
          "El signo '=' solo puede usarse para asignar una variable al inicio",
          "Use el formato: variable = expresión, por ejemplo: x=3+4"
        );
      }
      // Ej: "3 4" o "(2)(3)" → falta un operador entre los valores
      throw new ErrorCompilador(
        "SINTÁCTICO",
        sobrante.posicion,
        `Se esperaba un operador y se encontró ${this.describir(sobrante)}`,
        "Agregue un operador (+, -, *, /) entre los valores"
      );
    }

    return ast;
  }

  // asignacion → IDENTIFICADOR '=' expresion       (Mejora 5)
  asignacion() {
    const nombre = this.avanzar();  // consume el identificador
    const igual = this.avanzar();   // consume el '='

    // Caso "x=" sin nada después
    if (this.tokenActual().tipo === TIPO_TOKEN.FIN) {
      throw new ErrorCompilador(
        "SINTÁCTICO",
        igual.posicion + 1,
        "Se esperaba una expresión después del signo '='",
        "Escriba el valor a asignar, por ejemplo: " + nombre.valor + "=5"
      );
    }

    const expr = this.expresion();
    return {
      tipo: "asignacion",
      nombre: nombre.valor,
      expresion: expr,
      posicion: nombre.posicion,
    };
  }

  // expresion → termino ( ('+' | '-') termino )*
  // Maneja los operadores de MENOR precedencia (suma y resta).
  expresion() {
    let nodo = this.termino();

    while (
      this.tokenActual().tipo === TIPO_TOKEN.OPERADOR &&
      (this.tokenActual().valor === "+" || this.tokenActual().valor === "-")
    ) {
      const operador = this.avanzar(); // consume + o -
      const derecha = this.termino();
      // Se construye el árbol asociando a la izquierda: 1+2+3 → ((1+2)+3)
      nodo = {
        tipo: "binario",
        operador: operador.valor,
        izquierda: nodo,
        derecha: derecha,
        posicion: operador.posicion,
      };
    }
    return nodo;
  }

  // termino → factor ( ('*' | '/') factor )*
  // Maneja los operadores de MAYOR precedencia (multiplicación y división).
  termino() {
    let nodo = this.factor();

    while (
      this.tokenActual().tipo === TIPO_TOKEN.OPERADOR &&
      (this.tokenActual().valor === "*" || this.tokenActual().valor === "/")
    ) {
      const operador = this.avanzar(); // consume * o /
      const derecha = this.factor();
      nodo = {
        tipo: "binario",
        operador: operador.valor,
        izquierda: nodo,
        derecha: derecha,
        posicion: operador.posicion,
      };
    }
    return nodo;
  }

  // factor → NUMERO | IDENTIFICADOR | '(' expresion ')'
  // Es el nivel más profundo de la gramática: los operandos.
  // Aquí se detectan la mayoría de los errores sintácticos clásicos.
  factor() {
    const token = this.tokenActual();

    // --- Operando numérico ---------------------------------------------------
    if (token.tipo === TIPO_TOKEN.NUMERO) {
      this.avanzar();
      return {
        tipo: "numero",
        valor: parseFloat(token.valor),
        posicion: token.posicion,
      };
    }

    // --- Operando variable (Mejora 5) ---------------------------------------
    if (token.tipo === TIPO_TOKEN.IDENTIFICADOR) {
      this.avanzar();
      return {
        tipo: "variable",
        nombre: token.valor,
        posicion: token.posicion,
      };
    }

    // --- Subexpresión entre paréntesis --------------------------------------
    if (token.tipo === TIPO_TOKEN.PAREN_IZQ) {
      const apertura = this.avanzar(); // consume '('

      // Caso "()" → paréntesis vacío
      if (this.tokenActual().tipo === TIPO_TOKEN.PAREN_DER) {
        throw new ErrorCompilador(
          "SINTÁCTICO",
          this.tokenActual().posicion,
          "Los paréntesis están vacíos",
          "Escriba una expresión dentro de los paréntesis, por ejemplo: (3+4)"
        );
      }

      const nodo = this.expresion();

      // Después de la subexpresión DEBE venir el ')' de cierre.
      // Caso "(8+2" → falta cerrar el paréntesis.
      if (this.tokenActual().tipo !== TIPO_TOKEN.PAREN_DER) {
        throw new ErrorCompilador(
          "SINTÁCTICO",
          this.tokenActual().posicion,
          `Falta cerrar el paréntesis abierto en la posición ${apertura.posicion}`,
          "Agregue ')' para cerrar el paréntesis"
        );
      }
      this.avanzar(); // consume ')'
      return nodo;
    }

    // --- A partir de aquí, el token NO puede iniciar un operando → ERROR ----

    // Caso "3+" → la expresión termina donde debería haber un número
    if (token.tipo === TIPO_TOKEN.FIN) {
      throw new ErrorCompilador(
        "SINTÁCTICO",
        token.posicion,
        "Se esperaba un número y la expresión terminó",
        "Ingrese un número después del operador"
      );
    }

    // Caso "3+*4" o "7//2" → operadores duplicados o mal ubicados.
    // Si el token anterior también era un operador, la sugerencia es
    // específica para operadores duplicados (Mejora 2).
    if (token.tipo === TIPO_TOKEN.OPERADOR) {
      const anterior = this.tokenAnterior();
      const esDuplicado = anterior && anterior.tipo === TIPO_TOKEN.OPERADOR;
      throw new ErrorCompilador(
        "SINTÁCTICO",
        token.posicion,
        `Se esperaba un número y se encontró '${token.valor}'`,
        esDuplicado
          ? "Elimine el operador duplicado o escriba un número entre los operadores"
          : "Ingrese un número después del operador"
      );
    }

    // Caso "3+)" → cierre de paréntesis donde debería haber un operando
    if (token.tipo === TIPO_TOKEN.PAREN_DER) {
      throw new ErrorCompilador(
        "SINTÁCTICO",
        token.posicion,
        "Se esperaba un número y se encontró ')'",
        "Ingrese un número antes de cerrar el paréntesis"
      );
    }

    // Caso "= " u otro token inesperado
    throw new ErrorCompilador(
      "SINTÁCTICO",
      token.posicion,
      `Se esperaba un número y se encontró ${this.describir(token)}`,
      "Revise la estructura de la expresión"
    );
  }
}

/* ============================================================================
 *  FASE 4 — ANÁLISIS SEMÁNTICO Y EVALUACIÓN (Intérprete)
 *
 *  Recorre el AST de forma recursiva (post-orden) y calcula el resultado.
 *  En esta fase se detectan los errores SEMÁNTICOS: la expresión está bien
 *  escrita, pero su SIGNIFICADO es inválido:
 *    - División entre cero (Mejora 1) — incluso si el cero proviene de una
 *      subexpresión, ej: 5/(3-3)
 *    - Uso de variables que no han sido definidas (Mejora 5)
 *
 *  `tablaVariables` es la tabla de símbolos: guarda el valor de cada
 *  variable asignada y persiste entre ejecuciones para poder reutilizarlas.
 * ============================================================================ */
function evaluarAST(nodo, tablaVariables) {
  switch (nodo.tipo) {
    // Hoja numérica: su valor es el número mismo
    case "numero":
      return nodo.valor;

    // Hoja variable: se busca su valor en la tabla de símbolos
    case "variable": {
      if (!(nodo.nombre in tablaVariables)) {
        throw new ErrorCompilador(
          "SEMÁNTICO",
          nodo.posicion,
          `La variable '${nodo.nombre}' no ha sido definida`,
          `Asigne primero un valor, por ejemplo: ${nodo.nombre}=5`
        );
      }
      return tablaVariables[nodo.nombre];
    }

    // Operación binaria: se evalúan recursivamente ambos lados
    case "binario": {
      const izq = evaluarAST(nodo.izquierda, tablaVariables);
      const der = evaluarAST(nodo.derecha, tablaVariables);

      switch (nodo.operador) {
        case "+": return izq + der;
        case "-": return izq - der;
        case "*": return izq * der;
        case "/":
          // Mejora 1: detección de división entre cero.
          // Se valida el VALOR del divisor, no su texto, por lo que también
          // detecta casos como 5/(3-3) u 8/x cuando x vale 0.
          if (der === 0) {
            throw new ErrorCompilador(
              "SEMÁNTICO",
              nodo.posicion,
              "No se puede dividir entre cero",
              "Cambie el divisor por un valor diferente de cero"
            );
          }
          return izq / der;
      }
      break;
    }

    // Asignación: se evalúa la expresión y se guarda en la tabla de símbolos
    case "asignacion": {
      const valor = evaluarAST(nodo.expresion, tablaVariables);
      tablaVariables[nodo.nombre] = valor;
      return valor;
    }
  }
}

/* ============================================================================
 *  FASE 5a — CONVERSIÓN A NOTACIÓN POSTFIJA (Mejora 7)
 *
 *  La notación postfija (o polaca inversa) escribe el operador DESPUÉS de
 *  sus operandos:  (3+4)*2  →  3 4 + 2 *
 *
 *  Como el AST ya codifica la precedencia y los paréntesis en su estructura,
 *  basta con recorrerlo en POST-ORDEN (izquierda, derecha, raíz) y no se
 *  necesitan paréntesis en la salida.
 * ============================================================================ */
function convertirAPostfijo(nodo) {
  switch (nodo.tipo) {
    case "numero":
      return String(nodo.valor);
    case "variable":
      return nodo.nombre;
    case "binario":
      // Post-orden: primero operandos, después el operador
      return (
        convertirAPostfijo(nodo.izquierda) + " " +
        convertirAPostfijo(nodo.derecha) + " " +
        nodo.operador
      );
    case "asignacion":
      // Para asignaciones se muestra: nombre = <postfijo de la expresión>
      return nodo.nombre + " = " + convertirAPostfijo(nodo.expresion);
  }
}

/* ============================================================================
 *  FASE 5b — ESTADÍSTICAS DEL COMPILADOR (Mejora 8)
 *
 *  Se calculan contando los tokens generados por el analizador léxico:
 *  cantidad de números, operadores, paréntesis y variables.
 * ============================================================================ */
function calcularEstadisticas(tokens) {
  const stats = {
    numeros: 0,
    operadores: 0,
    parentesis: 0,
    variables: 0,
    totalTokens: 0,
  };

  for (const t of tokens) {
    if (t.tipo === TIPO_TOKEN.FIN) continue; // el EOF no cuenta
    stats.totalTokens++;
    if (t.tipo === TIPO_TOKEN.NUMERO) stats.numeros++;
    else if (t.tipo === TIPO_TOKEN.OPERADOR) stats.operadores++;
    else if (t.tipo === TIPO_TOKEN.PAREN_IZQ || t.tipo === TIPO_TOKEN.PAREN_DER)
      stats.parentesis++;
    else if (t.tipo === TIPO_TOKEN.IDENTIFICADOR) stats.variables++;
  }
  return stats;
}

/* ============================================================================
 *  REPRESENTACIÓN VISUAL DEL AST
 *  Genera un dibujo en texto del árbol para mostrarlo en la interfaz.
 *  Es útil en la sustentación para explicar cómo el parser entiende
 *  la precedencia de operadores.
 * ============================================================================ */
function dibujarAST(nodo, prefijo = "", esUltimo = true, esRaiz = true) {
  // Etiqueta del nodo según su tipo
  let etiqueta;
  switch (nodo.tipo) {
    case "numero":     etiqueta = `NÚMERO (${nodo.valor})`; break;
    case "variable":   etiqueta = `VARIABLE (${nodo.nombre})`; break;
    case "binario":    etiqueta = `OPERADOR (${nodo.operador})`; break;
    case "asignacion": etiqueta = `ASIGNACIÓN (${nodo.nombre} =)`; break;
  }

  // La raíz no lleva conector; los demás nodos llevan rama └── o ├──
  const conector = esRaiz ? "" : esUltimo ? "└── " : "├── ";
  let salida = prefijo + conector + etiqueta + "\n";

  // Prefijo para los hijos: continúa la línea vertical si hay más hermanos
  const prefijoHijos = prefijo + (esRaiz ? "" : esUltimo ? "    " : "│   ");

  if (nodo.tipo === "binario") {
    salida += dibujarAST(nodo.izquierda, prefijoHijos, false, false);
    salida += dibujarAST(nodo.derecha, prefijoHijos, true, false);
  } else if (nodo.tipo === "asignacion") {
    salida += dibujarAST(nodo.expresion, prefijoHijos, true, false);
  }
  return salida;
}

/* ============================================================================
 *  FUNCIÓN PRINCIPAL — compilar()
 *
 *  Orquesta todas las fases en orden, igual que el "driver" de un compilador
 *  real. Recibe la expresión, el límite de longitud y la tabla de variables,
 *  y devuelve un objeto con TODO lo que la interfaz necesita mostrar:
 *
 *    { exito, tokens, ast, arbolTexto, resultado, postfijo,
 *      estadisticas, error, faseFallida }
 * ============================================================================ */
function compilar(expresion, longitudMaxima, tablaVariables) {
  const resultado = {
    exito: false,
    expresion: expresion,
    tokens: null,
    ast: null,
    arbolTexto: null,
    resultado: null,
    postfijo: null,
    estadisticas: null,
    error: null,
    faseFallida: null, // qué fase detectó el error (para la línea de fases en la UI)
  };

  try {
    // FASE 1: validación de longitud (Mejora 3)
    resultado.faseFallida = "validacion";
    validarLongitud(expresion, longitudMaxima);

    // FASE 2: análisis léxico → tokens
    resultado.faseFallida = "lexico";
    resultado.tokens = analizadorLexico(expresion);
    // Las estadísticas (Mejora 8) se calculan apenas hay tokens disponibles
    resultado.estadisticas = calcularEstadisticas(resultado.tokens);

    // FASE 3: análisis sintáctico → AST
    resultado.faseFallida = "sintactico";
    const parser = new AnalizadorSintactico(resultado.tokens);
    resultado.ast = parser.analizar();
    resultado.arbolTexto = dibujarAST(resultado.ast);
    // La notación postfija (Mejora 7) se obtiene del AST ya validado
    resultado.postfijo = convertirAPostfijo(resultado.ast);

    // FASE 4: análisis semántico + evaluación → resultado numérico
    resultado.faseFallida = "semantico";
    const valor = evaluarAST(resultado.ast, tablaVariables);
    // Se redondea a 10 decimales para evitar errores de coma flotante
    // típicos de JavaScript (ej: 0.1+0.2 = 0.30000000000000004)
    resultado.resultado = Math.round(valor * 1e10) / 1e10;

    // Si llegamos aquí, todas las fases pasaron
    resultado.exito = true;
    resultado.faseFallida = null;
  } catch (e) {
    if (e instanceof ErrorCompilador) {
      resultado.error = e; // error controlado: se muestra con formato amigable
    } else {
      throw e; // error inesperado de programación: no se oculta
    }
  }

  return resultado;
}
