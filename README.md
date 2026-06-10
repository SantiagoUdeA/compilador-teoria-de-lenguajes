# SmartCompiler — Mini Compilador Inteligente

**Proyecto Integrador Final — Teoría de Lenguajes**
Caso: *DataLogic Systems / SmartCalc Engine*

Este documento explica **cómo funciona el compilador por dentro**, fase por fase, con el objetivo de que cualquier integrante del equipo pueda responder preguntas en la sustentación.

---

## 1. ¿Qué es y qué hace?

SmartCompiler es un **mini compilador** (técnicamente un *intérprete con fases de compilador*) que recibe expresiones matemáticas escritas por el usuario, las **analiza, valida, explica los errores y las evalúa**. No se limita a decir "error de sintaxis": indica el **tipo de error, la posición exacta, el detalle y una sugerencia de corrección**.

**Entrada aceptada (el "lenguaje"):**

| Elemento | Ejemplos |
|---|---|
| Números (enteros, varios dígitos, decimales) | `3`, `120`, `4.5` |
| Operadores aritméticos | `+  -  *  /` |
| Paréntesis | `(3+4)*2` |
| Variables (identificadores) | `x=5`, `total=(2+3)*4`, `x*2` |

**Archivos del proyecto:**

| Archivo | Contenido |
|---|---|
| `compiler.js` | **Todo el compilador**: lexer, parser, evaluador, postfijo, estadísticas |
| `app.js` | Lógica de la interfaz (conecta los botones con el compilador) |
| `index.html` | Estructura de la página |
| `styles.css` | Estilos visuales |

**Para ejecutarlo:** abrir `index.html` en cualquier navegador. No requiere instalación ni servidor.

---

## 2. Arquitectura: las fases del compilador

Un compilador real procesa el código en **fases secuenciales**. SmartCompiler imita esa arquitectura. La función `compilar()` (al final de `compiler.js`) es el "director de orquesta" que las ejecuta en orden:

```
   Texto del usuario:  "(3+4)*2"
          │
          ▼
┌──────────────────────┐
│ 1. VALIDACIÓN PREVIA │  ¿Está vacía? ¿Supera la longitud máxima? (Mejora 3)
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 2. ANÁLISIS LÉXICO   │  Texto → lista de TOKENS. Rechaza símbolos
│    (lexer/scanner)   │  no permitidos como $, #, &  → ERROR LÉXICO
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 3. ANÁLISIS          │  Tokens → ÁRBOL (AST). Verifica la gramática:
│    SINTÁCTICO        │  operadores bien ubicados, paréntesis balanceados
│    (parser)          │  → ERROR SINTÁCTICO
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 4. ANÁLISIS SEMÁNTICO│  Recorre el AST y calcula el resultado.
│    + EVALUACIÓN      │  División entre cero, variables no definidas
│                      │  → ERROR SEMÁNTICO
└──────────┬───────────┘
           ▼
   Resultado: 14   +  postfijo "3 4 + 2 *"  +  estadísticas
```

**Idea clave para la sustentación:** cada fase solo se ejecuta si la anterior tuvo éxito. La interfaz lo muestra con la línea de "chips" verdes/rojos: la fase roja es la que detectó el error.

---

## 3. Fase léxica (lexer) — `analizadorLexico()`

**¿Qué hace?** Recorre la cadena **carácter por carácter** y la agrupa en **tokens**: las unidades mínimas con significado del lenguaje.

**Ejemplo:** `x=120+35` produce:

| Token | Tipo | Posición |
|---|---|---|
| `x` | IDENTIFICADOR | 0 |
| `=` | ASIGNACION | 1 |
| `120` | NUMERO | 2 |
| `+` | OPERADOR | 5 |
| `35` | NUMERO | 6 |

**Cómo agrupa números de varios dígitos (Mejora 4):** cuando encuentra un dígito, entra en un bucle `while` que sigue consumiendo dígitos (y máximo un punto decimal) hasta encontrar otra cosa. Así `120` es **UN** token y no tres (`1`,`2`,`0`).

**Cómo reconoce variables (Mejora 5):** si encuentra una letra o `_`, consume letras/dígitos/`_` consecutivos → token IDENTIFICADOR. Por eso `total2` es un nombre válido.

**Cómo detecta símbolos no permitidos:** si el carácter no es dígito, letra, operador, paréntesis, `=` ni espacio, lanza un **ERROR LÉXICO** con la posición exacta. Ejemplo: `x=5+$4` → "El carácter `$` no está permitido" en posición 4.

**Detalle técnico:** al final agrega un token especial `FIN` (EOF). Sirve para que el parser sepa cuándo terminó la entrada sin estar comprobando índices.

> 💬 **Posible pregunta:** *¿Qué es un token?* → La unidad léxica mínima con significado: un número completo, un operador, un identificador. El lexer convierte una secuencia de caracteres en una secuencia de tokens.

---

## 4. Fase sintáctica (parser) — clase `AnalizadorSintactico`

**¿Qué hace?** Verifica que los tokens estén en un **orden válido según la gramática** del lenguaje y construye el **AST** (Árbol de Sintaxis Abstracta).

### 4.1 La gramática

```
entrada     →  asignacion | expresion
asignacion  →  IDENTIFICADOR '=' expresion
expresion   →  termino ( ('+' | '-') termino )*
termino     →  factor  ( ('*' | '/') factor  )*
factor      →  NUMERO | IDENTIFICADOR | '(' expresion ')'
```

Es una **gramática libre de contexto** escrita en notación tipo BNF. El `*` significa "cero o más repeticiones".

### 4.2 ¿Por qué tres niveles (expresion / termino / factor)?

**Para codificar la precedencia de operadores en la propia gramática:**

- `expresion` maneja `+` y `-` (menor precedencia)
- `termino` maneja `*` y `/` (mayor precedencia)
- `factor` maneja números, variables y paréntesis (máxima prioridad)

Como `expresion` está hecha de `termino`s, los `*` y `/` se agrupan **antes** que los `+` y `-`. Así `2+3*4` se interpreta como `2+(3*4)=14` automáticamente, sin tablas de precedencia.

### 4.3 Parser descendente recursivo

La técnica usada se llama **análisis descendente recursivo** (*recursive descent*): **cada regla de la gramática es una función** (`expresion()`, `termino()`, `factor()`), y las reglas que se referencian entre sí se traducen en llamadas (incluso recursivas: `factor` llama a `expresion` para los paréntesis).

Es un parser **LL(1)**: decide qué hacer mirando **un solo token de anticipación** (*lookahead*). Ejemplo: para distinguir `x=3+4` (asignación) de `x+4` (expresión), mira si el segundo token es `=`.

### 4.4 El AST

`(3+4)*2` genera este árbol:

```
        OPERADOR (*)
        ├── OPERADOR (+)
        │   ├── NÚMERO (3)
        │   └── NÚMERO (4)
        └── NÚMERO (2)
```

**Puntos importantes:**
- Los **paréntesis no aparecen** en el árbol: su efecto ya quedó codificado en la **estructura** (el `+` quedó como hijo del `*`, por eso se evalúa primero).
- Cada nodo guarda su **posición** en el texto original, para que los errores semánticos posteriores (ej. división entre cero) puedan señalar el lugar exacto.
- La asociatividad es **a la izquierda**: `10-2-3` = `(10-2)-3` = `5`, porque el bucle `while` de `expresion()` va envolviendo el árbol hacia la izquierda.

### 4.5 Detección de errores sintácticos

| Entrada | Error detectado | Dónde se detecta |
|---|---|---|
| `3+*4` | Se esperaba un número y se encontró `*` | `factor()` recibe un operador |
| `7//2` | Se esperaba un número y se encontró `/` | Igual al anterior; la sugerencia detecta que el token anterior también era operador → "elimine el operador duplicado" |
| `(8+2` | Falta cerrar el paréntesis | `factor()` esperaba `)` y llegó el FIN |
| `3+4)` | `)` sin pareja | `analizar()` encuentra tokens sobrantes |
| `3+` | Se esperaba un número y la expresión terminó | `factor()` recibe el token FIN |
| `()` | Paréntesis vacíos | `factor()` ve `)` justo después de `(` |
| `3 4` | Falta operador entre valores | tokens sobrantes tras analizar `3` |

> 💬 **Posible pregunta:** *¿Cómo valida los paréntesis balanceados?* → No se cuenta con un contador aparte: la propia gramática los valida. Cuando `factor()` consume un `(`, exige analizar una expresión y **luego exige el `)`**. Si no llega, error con la posición del paréntesis que quedó abierto.

---

## 5. Fase semántica y evaluación — `evaluarAST()`

**¿Qué hace?** Recorre el AST **recursivamente en post-orden** (primero los hijos, luego el nodo) y calcula el valor.

```js
caso "binario":
    izq = evaluar(hijo izquierdo)   // recursión
    der = evaluar(hijo derecho)     // recursión
    aplicar operador a izq y der
```

**Errores semánticos** (la expresión está *bien escrita* pero su *significado* es inválido):

1. **División entre cero (Mejora 1):** antes de dividir, se comprueba si el **valor** del divisor es 0. Como se valida el valor evaluado y no el texto, también detecta casos ocultos como `5/(3-3)` o `8/x` cuando `x` vale 0.
2. **Variable no definida:** si una variable no está en la **tabla de símbolos**, error con sugerencia ("Asigne primero un valor, por ejemplo: z=5").

**Tabla de símbolos (`tablaVariables`):** un objeto JavaScript que asocia nombre → valor. Las asignaciones la escriben (`x=5` guarda `{x:5}`), las lecturas la consultan. **Persiste entre ejecuciones**: puedes hacer `x=5` y después `x*2` → `10`.

> 💬 **Posible pregunta:** *¿Diferencia entre error sintáctico y semántico?* → Sintáctico: la estructura viola la gramática (`3+*4`). Semántico: la estructura es correcta pero el significado es inválido (`8/0` está perfectamente bien formada; el problema es la operación que representa).

---

## 6. Notación postfija (Mejora 7) — `convertirAPostfijo()`

La notación **postfija** (polaca inversa, RPN) pone el operador **después** de sus operandos y **no necesita paréntesis**:

| Infija | Postfija |
|---|---|
| `3+4` | `3 4 +` |
| `(3+4)*2` | `3 4 + 2 *` |
| `3+4*2` | `3 4 2 * +` |

**Cómo se genera aquí:** recorriendo el AST en **post-orden** (izquierda → derecha → raíz). No usamos el algoritmo shunting-yard de Dijkstra porque **el AST ya resolvió la precedencia y los paréntesis**: el orden del recorrido ya es el orden postfijo.

```js
postfijo(nodo) = postfijo(izquierda) + postfijo(derecha) + operador
```

> 💬 **Posible pregunta:** *¿Para qué sirve la postfija?* → Se evalúa con una simple pila, sin precedencias ni paréntesis. Las máquinas virtuales basadas en pila (como la JVM) ejecutan código en ese orden.

---

## 7. Las 8 mejoras del enunciado y dónde están

| # | Mejora | Implementación |
|---|---|---|
| 1 | División entre cero | `evaluarAST()`, caso `/`: comprueba `der === 0`. Detecta también ceros ocultos: `5/(3-3)` |
| 2 | Sugerencias automáticas | Clase `ErrorCompilador`: TODO error lleva `tipo + posicion + detalle + sugerencia`. Las sugerencias son contextuales (ej. detecta operador duplicado) |
| 3 | Validación de longitud | `validarLongitud()`. El máximo lo configura el usuario en la interfaz (campo "Longitud máxima", por defecto 30). Contador en vivo |
| 4 | Números de múltiples dígitos | Bucle del lexer que acumula dígitos consecutivos en un solo token. Soporta también decimales |
| 5 | Variables | Lexer (token IDENTIFICADOR) + parser (regla `asignacion`) + evaluador (tabla de símbolos). Panel "Variables" en la interfaz |
| 6 | Historial | Arreglo `historial` en `app.js`: cada compilación exitosa se agrega numerada (`1. 3+4=7`). Panel con botón de borrado |
| 7 | Notación postfija | `convertirAPostfijo()`: recorrido post-orden del AST. Se muestra en cada resultado |
| 8 | Estadísticas | `calcularEstadisticas()`: cuenta tokens por tipo (números, operadores, paréntesis, variables) |

---

## 8. Formato de errores (requisito central del enunciado)

Toda falla produce exactamente lo que pide la empresa:

```
ERROR SINTÁCTICO
Posición: 2
Detalle:    Se esperaba un número y se encontró '*'
Sugerencia: Ingrese un número después del operador

3+*4
  ^
```

- **Posición:** índice desde 0 (en `3+*4`: `3`=0, `+`=1, `*`=2 → posición 2, igual que el ejemplo del PDF).
- La interfaz además dibuja la expresión con un **puntero `^`** bajo el carácter problemático, como hacen gcc o Python.
- Tipos de error: `VALIDACIÓN` (longitud/vacía), `LÉXICO` (símbolo prohibido), `SINTÁCTICO` (estructura), `SEMÁNTICO` (división por cero, variable indefinida).

---

## 9. Casos de prueba del enunciado

| Entrada | Resultado |
|---|---|
| `3+*4` | ERROR SINTÁCTICO, posición 2, "se esperaba un número y se encontró '*'" |
| `(8+2` | ERROR SINTÁCTICO, "falta cerrar el paréntesis abierto en la posición 0" |
| `7//2` | ERROR SINTÁCTICO, posición 2, sugerencia de operador duplicado |
| `x=5+$4` | ERROR LÉXICO, posición 4, "el carácter '$' no está permitido" |
| `8/0` | ERROR SEMÁNTICO, "no se puede dividir entre cero" |
| `3+` | ERROR SINTÁCTICO, "se esperaba un número", sugerencia "ingrese un número después del operador" |
| `120+35` | Resultado: 155 |
| `(250+80)*4` | Resultado: 1320 |
| `x=3+4` | x = 7, queda en la tabla de variables |
| `(3+4)*2` | Resultado: 14, Postfijo: `3 4 + 2 *` |

---

## 10. Preguntas probables de sustentación (con respuesta corta)

1. **¿Cuáles son las fases de tu compilador?** Validación previa, análisis léxico, análisis sintáctico, análisis semántico + evaluación. Cada una solo corre si la anterior pasó.
2. **¿Qué tipo de parser usaste y por qué?** Descendente recursivo (LL(1)): cada regla de la gramática es una función; es el más claro de implementar a mano y permite mensajes de error muy precisos.
3. **¿Cómo logras que `*` se evalúe antes que `+`?** Por la estructura de la gramática: `expresion → termino → factor`. Los `*` se agrupan en `termino`, más profundo en el árbol, así que se evalúan primero.
4. **¿Qué es el AST y para qué sirve?** Árbol que representa la estructura de la expresión sin detalles superficiales (sin paréntesis). Sirve para evaluar, generar postfijo y dar errores con posición.
5. **¿Cómo detectas `5/(3-3)` como división por cero si el texto no contiene `/0`?** Porque la verificación es semántica, sobre el **valor evaluado** del divisor, no sobre el texto.
6. **¿Qué pasa si uso una variable sin definirla?** Error semántico con sugerencia; las variables viven en una tabla de símbolos que persiste entre operaciones.
7. **¿Cómo conviertes a postfijo sin shunting-yard?** Recorrido post-orden del AST: el árbol ya codifica precedencia y paréntesis.
8. **¿Por qué la posición del error en `3+*4` es 2?** Índices desde 0: el `*` es el tercer carácter. Coincide con el ejemplo del enunciado.
9. **¿Es un compilador o un intérprete?** Estrictamente, un **intérprete con arquitectura de compilador**: tiene las fases de análisis de un compilador (léxico, sintáctico, semántico) pero en vez de generar código máquina, evalúa el AST directamente. El enunciado lo llama "mini compilador" por sus fases de análisis.
10. **¿Qué es un token de FIN/EOF y para qué lo agregas?** Marca el final de la entrada; permite que el parser detecte expresiones incompletas (`3+`) y tokens sobrantes sin comprobar índices manualmente.

---

## 11. Glosario rápido

- **Token:** unidad léxica mínima (número, operador, identificador…).
- **Lexema:** el texto concreto de un token (`120` es el lexema de un token NUMERO).
- **Gramática libre de contexto:** conjunto de reglas de producción que define qué secuencias de tokens son válidas.
- **BNF:** notación para escribir gramáticas.
- **AST:** árbol de sintaxis abstracta; salida del parser.
- **LL(1):** parser descendente que decide con 1 token de anticipación.
- **Lookahead:** token(es) que el parser "mira" sin consumir para decidir qué regla aplicar.
- **Tabla de símbolos:** estructura que asocia identificadores con su información (aquí: nombre → valor).
- **Postfijo / RPN:** notación donde el operador va después de los operandos; se evalúa con una pila.
- **Error léxico:** carácter fuera del alfabeto del lenguaje.
- **Error sintáctico:** estructura que viola la gramática.
- **Error semántico:** estructura válida con significado inválido (división por cero, variable indefinida).
