# ============================================================================
#  SMARTCOMPILER+ (versión mejorada)
#  Proyecto Integrador Final — DataLogic Systems
#
#  Mejoras sobre la versión anterior:
#    1. FASES SEPARADAS como un compilador real:
#         Fase 1: Validación previa   (longitud, expresión vacía)
#         Fase 2: Análisis LÉXICO     (cadena → lista de tokens)
#         Fase 3: Análisis SINTÁCTICO (tokens → notación postfija)
#         Fase 4: Análisis SEMÁNTICO + EVALUACIÓN (postfijo → resultado)
#    2. El error léxico ahora indica QUÉ carácter falló y EN QUÉ posición.
#    3. División entre cero y variable no definida se reportan como
#       ERROR SEMÁNTICO (no sintáctico): la expresión está bien escrita,
#       pero su significado es inválido.
#    4. La división muestra 8/2=4 (entero) y no 4.0.
#    5. La expresión vacía tiene su propio mensaje (antes decía
#       "símbolos no permitidos").
#    6. El programa ya no se cierra si la longitud máxima no es un número.
#
#  Gramática implementada (parser descendente recursivo):
#       S → id '=' E | E
#       E → T (('+'|'-') T)*       suma/resta: menor precedencia
#       T → F (('*'|'/') F)*       multiplicación/división: mayor precedencia
#       F → num | id | '(' E ')'   operandos: máxima prioridad
# ============================================================================


# ----------------------------------------------------------------------------
#  ERROR DEL COMPILADOR
#  Un solo tipo de excepción para todas las fases. Guarda el TIPO de error
#  (LÉXICO, SINTÁCTICO, SEMÁNTICO o VALIDACIÓN), la POSICIÓN exacta en la
#  cadena original, el DETALLE y la SUGERENCIA (Mejora 2 del enunciado).
# ----------------------------------------------------------------------------
class ErrorCompilador(Exception):
    def __init__(self, tipo, posicion, detalle, sugerencia):
        self.tipo = tipo
        self.posicion = posicion      # None cuando no aplica (ej. longitud)
        self.detalle = detalle
        self.sugerencia = sugerencia
        super().__init__(detalle)

    def imprimir(self, cadena=""):
        """Imprime el error con el formato amigable que exige la empresa,
        más un puntero ^ bajo el carácter problemático (como gcc/python)."""
        print(f"\nERROR {self.tipo}")
        if self.posicion is not None:
            print(f"Posición: {self.posicion}")
        print(f"Detalle: {self.detalle}")
        print(f"Sugerencia: {self.sugerencia}")
        if self.posicion is not None and cadena:
            print(f"\n  {cadena}")
            print("  " + " " * min(self.posicion, len(cadena)) + "^")


# ----------------------------------------------------------------------------
#  FASE 2 — ANALIZADOR LÉXICO
#  Convierte la cadena en una lista de tokens. Cada token es una tupla:
#       (tipo, valor, posicion)
#  Tipos: NUMERO, IDENT, OPERADOR, PAR_IZQ, PAR_DER, IGUAL, FIN
#
#  Aquí se resuelven:
#   - Mejora 4: números de varios dígitos (se acumulan dígitos consecutivos
#     en UN solo token, así "120" no son tres tokens sino uno).
#   - Detección de símbolos no permitidos CON posición y carácter exacto.
# ----------------------------------------------------------------------------
def analizador_lexico(cadena):
    tokens = []
    i = 0
    while i < len(cadena):
        c = cadena[i]

        # Los espacios se ignoran (no producen token)
        if c == ' ':
            i += 1
            continue

        # NÚMERO: acumula todos los dígitos seguidos (Mejora 4)
        if c.isdigit():
            inicio = i
            numero = ""
            while i < len(cadena) and cadena[i].isdigit():
                numero += cadena[i]
                i += 1
            tokens.append(("NUMERO", numero, inicio))
            continue

        # IDENTIFICADOR / VARIABLE (Mejora 5): letra inicial,
        # luego letras, dígitos o '_'
        if c.isalpha() or c == '_':
            inicio = i
            nombre = ""
            while i < len(cadena) and (cadena[i].isalnum() or cadena[i] == '_'):
                nombre += cadena[i]
                i += 1
            tokens.append(("IDENT", nombre, inicio))
            continue

        # OPERADORES Y SÍMBOLOS DEL LENGUAJE
        if c in '+-*/':
            tokens.append(("OPERADOR", c, i))
        elif c == '(':
            tokens.append(("PAR_IZQ", c, i))
        elif c == ')':
            tokens.append(("PAR_DER", c, i))
        elif c == '=':
            tokens.append(("IGUAL", c, i))
        else:
            # Carácter fuera del alfabeto del lenguaje → ERROR LÉXICO
            # con el carácter exacto y su posición (antes solo decía
            # "se encontraron símbolos no permitidos" sin más datos).
            raise ErrorCompilador(
                "LÉXICO", i,
                f"El carácter '{c}' no está permitido en el lenguaje",
                "Use solo números, letras, operadores + - * /, paréntesis y =")
        i += 1

    # Token de fin de entrada: permite al parser detectar expresiones
    # incompletas ("3+") sin comprobar índices manualmente.
    tokens.append(("FIN", "", len(cadena)))
    return tokens


# ----------------------------------------------------------------------------
#  FASE 3 — ANALIZADOR SINTÁCTICO (parser descendente recursivo)
#
#  Consume la lista de tokens y verifica la GRAMÁTICA. No calcula nada:
#  su salida es la expresión en NOTACIÓN POSTFIJA (Mejora 7), que la
#  siguiente fase evaluará. Cada función corresponde a una regla:
#       E() → suma/resta,  T() → mult/div,  F() → operandos.
#  La precedencia queda garantizada por la estructura: E llama a T y
#  T llama a F, así * y / se agrupan antes que + y -.
#
#  El postfijo conserva los tokens completos (con su posición) para que
#  la fase semántica pueda señalar el lugar exacto de sus errores.
# ----------------------------------------------------------------------------
def analizador_sintactico(tokens):
    pos = [0]          # índice del token actual (lista para mutarlo en funciones anidadas)
    postfijo = []      # salida: lista de tokens en orden postfijo

    def actual():
        return tokens[pos[0]]

    def avanzar():
        pos[0] += 1

    def error(posicion, detalle, sugerencia):
        raise ErrorCompilador("SINTÁCTICO", posicion, detalle, sugerencia)

    # F → num | id | (E)
    def F():
        tipo, valor, p = actual()

        if tipo == "NUMERO":
            avanzar()
            postfijo.append(("NUMERO", valor, p))
            return

        if tipo == "IDENT":
            avanzar()
            postfijo.append(("IDENT", valor, p))
            return

        if tipo == "PAR_IZQ":
            avanzar()
            # Caso "()" : paréntesis vacío
            if actual()[0] == "PAR_DER":
                error(actual()[2], "Los paréntesis están vacíos",
                      "Escriba una expresión dentro de los paréntesis, por ejemplo: (3+4)")
            E()
            # Después de la subexpresión DEBE venir ')'. Caso "(8+2".
            if actual()[0] != "PAR_DER":
                error(actual()[2],
                      f"Falta cerrar el paréntesis abierto en la posición {p}",
                      "Agregue ')' para cerrar el paréntesis")
            avanzar()
            return

        # Llegó algo que no puede iniciar un operando → diagnóstico preciso
        if tipo == "FIN":
            # Caso "3+" : la expresión terminó donde iba un número
            error(p, "Se esperaba un número y la expresión terminó",
                  "Ingrese un número después del operador")
        if tipo == "OPERADOR":
            # Caso "3+*4" o "7//2": operador donde iba un número.
            # Si el token anterior también era operador → duplicado.
            anterior = tokens[pos[0] - 1] if pos[0] > 0 else None
            if anterior and anterior[0] == "OPERADOR":
                error(p, f"Se esperaba un número y se encontró '{valor}'",
                      "Elimine el operador duplicado o escriba un número entre los operadores")
            error(p, f"Se esperaba un número y se encontró '{valor}'",
                  "Ingrese un número o una variable después del operador")
        if tipo == "PAR_DER":
            error(p, "Se esperaba un número y se encontró ')'",
                  "Ingrese un número antes de cerrar el paréntesis")
        error(p, f"Se esperaba un número y se encontró '{valor}'",
              "Revise la estructura de la expresión")

    # T → F (('*'|'/') F)*
    def T():
        F()
        while actual()[0] == "OPERADOR" and actual()[1] in "*/":
            op = actual()
            avanzar()
            F()
            postfijo.append(op)   # el operador va DESPUÉS de sus operandos

    # E → T (('+'|'-') T)*
    def E():
        T()
        while actual()[0] == "OPERADOR" and actual()[1] in "+-":
            op = actual()
            avanzar()
            T()
            postfijo.append(op)

    # ---- Punto de entrada: S → id '=' E | E -------------------------------
    # Asignación (Mejora 5): se decide con UN token de anticipación (LL(1)).
    nombre_asignacion = None
    if actual()[0] == "IDENT" and tokens[pos[0] + 1][0] == "IGUAL":
        nombre_asignacion = actual()[1]
        avanzar()  # consume el identificador
        igual = actual()
        avanzar()  # consume '='
        if actual()[0] == "FIN":
            error(igual[2] + 1, "Se esperaba una expresión después del signo '='",
                  f"Escriba el valor a asignar, por ejemplo: {nombre_asignacion}=3+4")
        E()
    else:
        E()

    # Si sobran tokens, la expresión está mal terminada
    tipo, valor, p = actual()
    if tipo != "FIN":
        if tipo == "PAR_DER":
            error(p, "Se encontró un paréntesis de cierre ')' sin su apertura",
                  "Elimine el ')' sobrante o agregue '(' donde corresponda")
        if tipo == "IGUAL":
            error(p, "El signo '=' solo puede usarse para asignar una variable al inicio",
                  "Use el formato: variable = expresión, por ejemplo: x=3+4")
        error(p, f"Se esperaba un operador y se encontró '{valor}'",
              "Agregue un operador (+, -, *, /) entre los valores")

    return nombre_asignacion, postfijo


# ----------------------------------------------------------------------------
#  FASE 4 — ANÁLISIS SEMÁNTICO + EVALUACIÓN
#
#  Evalúa la notación postfija con una PILA (así se ejecuta el postfijo en
#  las máquinas reales): los números se apilan y cada operador saca los dos
#  últimos valores, opera y apila el resultado.
#
#  Aquí se detectan los errores SEMÁNTICOS (la expresión está bien escrita
#  pero su significado es inválido):
#   - Mejora 1: división entre cero. Se valida el VALOR del divisor ya
#     evaluado, por eso también detecta casos ocultos como 5/(3-3).
#   - Variable sin definir (se consulta la tabla de símbolos `variables`).
# ----------------------------------------------------------------------------
def evaluar_postfijo(postfijo, variables):
    pila = []
    for tipo, valor, p in postfijo:
        if tipo == "NUMERO":
            pila.append(int(valor))
        elif tipo == "IDENT":
            if valor not in variables:
                raise ErrorCompilador(
                    "SEMÁNTICO", p,
                    f"La variable '{valor}' no ha sido definida",
                    f"Asigne primero un valor, por ejemplo: {valor}=5")
            pila.append(variables[valor])
        else:  # OPERADOR: saca dos operandos, opera, apila el resultado
            der = pila.pop()
            izq = pila.pop()
            if valor == '+':
                pila.append(izq + der)
            elif valor == '-':
                pila.append(izq - der)
            elif valor == '*':
                pila.append(izq * der)
            else:  # división
                if der == 0:
                    raise ErrorCompilador(
                        "SEMÁNTICO", p,
                        "No se puede dividir entre cero",
                        "Cambie el divisor por un valor diferente de cero")
                pila.append(izq / der)
    return pila[0]


# ----------------------------------------------------------------------------
#  UTILIDADES
# ----------------------------------------------------------------------------
def formatear(valor):
    """8/2 se muestra como 4 y no como 4.0; 10/4 sí muestra 2.5."""
    if isinstance(valor, float) and valor.is_integer():
        return int(valor)
    return valor


def estadisticas(tokens):
    """Mejora 8: cuenta tokens por tipo (el FIN no se cuenta)."""
    numeros = sum(1 for t in tokens if t[0] == "NUMERO")
    operadores = sum(1 for t in tokens if t[0] == "OPERADOR")
    parentesis = sum(1 for t in tokens if t[0] in ("PAR_IZQ", "PAR_DER"))
    variables_usadas = sum(1 for t in tokens if t[0] == "IDENT")
    return numeros, operadores, parentesis, variables_usadas


# ----------------------------------------------------------------------------
#  PROGRAMA PRINCIPAL (menú)
# ----------------------------------------------------------------------------
historial = []   # Mejora 6: operaciones exitosas, numeradas
variables = {}   # Tabla de símbolos: nombre → valor (Mejora 5)

while True:
    print("\nSMARTCOMPILER+")
    print("1. Ingresar expresión")
    print("2. Ver historial")
    print("3. Ver variables")
    print("4. Salir")

    opcion = input("Seleccione una opción: ")

    if opcion == '4':
        print("\nPrograma finalizado")
        break

    elif opcion == '2':
        print("\nHistorial:")
        if not historial:
            print("No hay operaciones registradas")
        for i, op in enumerate(historial, 1):
            print(f"{i}. {op}")
        continue

    elif opcion == '3':
        print("\nVariables:")
        if not variables:
            print("No hay variables almacenadas")
        for nombre, valor in variables.items():
            print(f"{nombre} = {formatear(valor)}")
        continue

    elif opcion != '1':
        print("\nOpción no válida")
        continue

    cadena = input("Ingrese la cadena: ").strip()

    # La longitud máxima la define el usuario (Mejora 3). Si escribe algo
    # que no es un número, se avisa y se vuelve al menú (antes el programa
    # se cerraba con un error de Python).
    try:
        max_len = int(input("Ingrese la longitud máxima permitida: "))
    except ValueError:
        print("\nERROR")
        print("La longitud máxima debe ser un número entero")
        continue

    try:
        # ---- FASE 1: validación previa (Mejora 3) ------------------------
        if len(cadena) == 0:
            raise ErrorCompilador("VALIDACIÓN", None,
                                  "La expresión está vacía",
                                  "Escriba una expresión, por ejemplo: 3+4")
        if len(cadena) > max_len:
            raise ErrorCompilador(
                "VALIDACIÓN", None,
                f"La expresión supera el tamaño permitido ({len(cadena)} de {max_len} caracteres)",
                f"Reduzca la expresión a máximo {max_len} caracteres")

        # ---- FASE 2: análisis léxico → tokens -----------------------------
        tokens = analizador_lexico(cadena)

        # ---- FASE 3: análisis sintáctico → postfijo (Mejora 7) -----------
        nombre, postfijo = analizador_sintactico(tokens)

        # ---- FASE 4: análisis semántico + evaluación ----------------------
        resultado = evaluar_postfijo(postfijo, variables)
        if nombre is not None:
            variables[nombre] = resultado   # asignación: guarda en la tabla

        # ---- SALIDAS -------------------------------------------------------
        res = formatear(resultado)
        print("\nCadena válida")
        if nombre is not None:
            print(f"Resultado: {nombre} = {res}")
            historial.append(f"{nombre}={res}")          # Mejora 6
        else:
            print(f"Resultado: {res}")
            historial.append(f"{cadena}={res}")          # Mejora 6

        print("Postfijo:", " ".join(t[1] for t in postfijo))   # Mejora 7

        n, o, par, v = estadisticas(tokens)                     # Mejora 8
        print("\nEstadísticas del compilador")
        print("Cantidad de números:", n)
        print("Cantidad de operadores:", o)
        print("Cantidad de paréntesis:", par)
        print("Cantidad de variables:", v)

    except ErrorCompilador as e:
        # Todos los errores de todas las fases salen con el mismo formato
        # amigable: tipo, posición, detalle, sugerencia y puntero ^.
        e.imprimir(cadena)
