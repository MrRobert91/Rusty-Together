# Dos a uno Documento de diseño

Versión 0.1 · 16 de octubre de 2026

## Dos a uno Documento de diseño

Campaña cooperativa online para dos jugadores · Plataformas 3D y acción ligera · Versión 0.1 · 16 de octubre de 2026

![Dos robots autónomos se acoplan en un único cuerpo compartido. La apariencia conserva la armadura marfil y la identidad cian y naranja de la exploración visual.](images/00_personajes.png)

### La propuesta

Dos pequeños robots deben devolver la energía a una ciudad de máquinas flotantes. Por separado corren, saltan, se ayudan y compiten en pruebas breves. Juntos forman un robot mayor: cada persona controla un brazo, una pierna y la mitad de un poder combinado. Para avanzar hay que aprender tanto a coordinarse como a recuperarse de los errores del otro.

Este documento define cinco niveles completos como objetivo de diseño: controles, habilidades, recorridos, obstáculos, clímax, recuperación y criterios de prueba. Los tiempos, distancias y ventanas son valores iniciales para prototipar; todavía no describen un juego implementado ni validado.

## Qué debe sentir la pareja

### Promesa de juego

«Sé hacerlo solo con mi robot pequeño; ahora tenemos que conseguirlo dentro del mismo cuerpo». La diversión nace de cambiar entre autonomía y dependencia sin que uno se convierta en pasajero. Debe ser posible fallar de manera graciosa, leer por qué ocurrió y probar una solución inmediatamente.

- Competencia personal: cada jugador domina movimiento, agarre y herramientas en su mini robot.
- Coordinación corporal: unidos comparten destino y física, pero conservan acciones relevantes por separado.
- Pique amable: pruebas de un minuto y recursos locales disputados cambian la relación durante un rato.
- Recuperación creativa: perder el equilibrio abre oportunidades de agarrarse, contrapesar o ayudar.

### Mundo y personajes

Cian y Ámbar son dos operarios de reparto que entregan por error la batería central a la torre de clasificación. Para recuperarla atraviesan cinco instalaciones automatizadas que continúan trabajando sin supervisión. Se entienden por gestos y pitidos; no hace falta diálogo hablado. El humor procede del contraste entre su entusiasmo y una infraestructura excesivamente seria.

### Alcance de la campaña

| Elemento | Decisión del MVP |
| --- | --- |
| Jugadores | Exactamente dos online, invitados a una sala privada. |
| Estructura | Cinco niveles lineales con pequeños desvíos y cinco pruebas competitivas opcionales. |
| Duración de diseño | 138 minutos de recorrido orientativo sin reintentos. Hipótesis de primera partida: 3 a 4 horas. |
| Combate | Empujar, aturdir y redirigir mecanismos. Sin armas de fuego ni árbol de combate. |
| Progresión | Cinco familias de módulos y mejoras cosméticas; sin estadísticas permanentes. |
| Presentación | Cómic 3D con cel shading, formas gruesas, expresividad y lectura clara. |

El MVP comercial contiene los cinco niveles. Antes se construye una muestra vertical del nivel 1 para decidir si el control compartido merece continuar. Ampliar a tres o cuatro jugadores requiere rediseño y queda fuera de esta campaña.

## Dos mandos para controlar un cuerpo

La distribución es simétrica. Cian controla el brazo y la pierna izquierdos; Ámbar, los derechos. El color identifica propiedad y nunca determina habilidad o dificultad. En las estaciones pueden intercambiar el lado corporal por acuerdo.

| Entrada | Mini robot separado | Robot unido |
| --- | --- | --- |
| Stick izquierdo | Movimiento relativo a cámara. | Dirección y fuerza de la pierna propia. |
| Stick derecho | Apuntar mano y herramienta. | Apuntar exclusivamente el brazo propio. |
| A | Saltar; mantener aumenta altura. | Impulso de la pierna propia. Dos impulsos próximos producen salto conjunto. |
| B | Agacharse o frenar. | Flexionar y anclar la pierna propia para estabilizar. |
| RT | Agarrar, mantener o soltar. | Agarrar con la mano propia; conserva agarre hasta soltar. |
| X | Acción principal del módulo. | Preparar o disparar la mitad propia del módulo. |
| LT | Acción secundaria del módulo. | Modular, sostener o confirmar el poder combinado. |
| Y mantenido | Aceptar acoplamiento. | Solicitar desacoplamiento en una superficie válida. |
| RB | Señalar objetivo y pedir ayuda. | Señalar objetivo y pedir sincronización. |
| LB más stick derecho | Ajustar cámara; suspende apuntado. | Pedir ajuste de cámara; suspende apuntado. |

### Desplazamiento que se puede aprender

La dirección del cuerpo unido deriva de la media de las dos intenciones de pierna; la discrepancia añade torsión visual y pérdida limitada de velocidad. Una sola pierna puede arrastrar el cuerpo lentamente. El controlador calcula pasos y suelo seguro: caminar no exige pulsaciones alternas constantes. B aumenta el anclaje y permite que el compañero pivote o tire.

### Muchos botones con decisiones distintas

Mientras una mano mantiene un agarre, el stick de esa persona puede orientar su pierna y X o LT operar su módulo. Saltar, tensar, apuntar, sujetar y estabilizar compiten por atención. El interés viene de combinar tareas simultáneas y de repartirlas; no de añadir pulsaciones sin efecto.

Ventanas iniciales: salto conjunto con pulsaciones a menos de 250 ms; salto unilateral produce un bote bajo recuperable. Mantener A ofrece preparación visible y el HUD anuncia el impulso de cada lado. Todo el mapeo debe ser remapeable; agarre y carga admiten alternancia en vez de mantener.

## Estados de unión y recuperación

Dos mini robots → doble consentimiento → un cuerpo compartido → superficie segura → dos mini robots.

### Acoplamiento con consentimiento

Los dos mini robots llegan a una placa con espacio para el cuerpo grande. Ambos mantienen Y durante 0,6 s dentro de un intervalo de 2 s. La unión dura como objetivo 1,2 s, conserva la dirección de avance y recupera la cámara sin fundido. Si falta consentimiento, el primero solo muestra una solicitud. El juego nunca transforma por la acción unilateral de un jugador.

### Desacoplamiento y límites espaciales

Ambos confirman Y sobre una superficie ancha con dos puntos de aterrizaje libres. Las puertas de servicio pequeñas exigen separados y los actuadores pesados exigen unidos. No se puede separar en el aire, en una pared magnética ni mientras se sostiene una carga crítica. Las zonas amplias permiten elegir forma para resolver variantes, pero el recorrido principal tiene estaciones claras.

### Estados de fallo

- Tropiezo: pie o mano pierde contacto; otro apoyo puede recuperar al cuerpo sin reiniciar.
- Mini caído: si aún hay plataforma, el otro puede ofrecer mano. Tras caer al vacío, reaparece en el último refugio de la sala en unos 3 s.
- Robot unido caído: ambos reaparecen juntos con todos los objetos críticos restituidos.
- Atasco: tras 8 s sin avance hay sugerencia visual. Cualquiera puede pedir reiniciar la sala; la confirmación evita borrar un intento activo del otro.

### Persistencia

Guardar al entrar en cada una de las seis salas y después de resolverla. Reintentar reinicia solo la sala activa, no una sección de cinco minutos ya superada. Los patrones largos de clímax tienen un guardado interno al cambiar de fase. No hay vidas, consumibles de recuperación ni pérdida de progreso por competir.

El dibujo muestra la intención de transformación. La solución de producción utiliza piezas plegadas y dos núcleos que se fijan a cada mitad; no necesita simular una reconstrucción libre de cada tornillo.

## Cooperación y rivalidad

| Relación | Dónde aparece | Regla de diseño |
| --- | --- | --- |
| Cooperación separados | Rutas paralelas, relevos, rescates. | Ambos actúan; sostener un mecanismo no puede ocupar más de 8 s seguidos. |
| Cooperación unidos | Plataformas grandes y poderes dobles. | Cada lado debe tener una acción relevante al menos cada 6 s. |
| Contracooperación | Bolsas locales de carga, atajos y plataformas compartidas. | Buscar ventaja propia puede dificultar al otro, pero todo se restituye en menos de 10 s. |
| Competición explícita | Cinco arenas de un minuto. | Entrada con consentimiento doble, mismas reglas y reinicio inmediato. |

### No confundir pique con sabotaje permanente

Una batería crítica nunca se puede gastar para ganar puntos personales. La rivalidad usa un recurso temporal de esa sala o una ruta alternativa. Si uno se cae, conserva lo ya obtenido fuera de la arena. El perdedor recibe la misma recompensa de campaña y el ganador solo una insignia de sesión. No se condiciona una puerta a vencer al compañero.

### Un minuto de carrera

10 s para entrar y anticipar reglas; dos rondas de 20 s; 10 s de resultado y salida. Empate permitido. El turno de salida cambia en la segunda ronda si importa la posición. Si cualquiera rechaza la arena o no hay doble aceptación en 10 s, la pareja continúa sin competir. Si se interrumpe la partida, la arena no cuenta como requisito pendiente.

### Alternancia de la campaña

Distribución de minutos separados / unidos / competición:
- 1 Muelles: 11 / 12 / 1
- 2 Jardín: 11 / 14 / 1
- 3 Fundición: 12.5 / 14.5 / 1
- 4 Teatro: 12.5 / 14.5 / 1
- 5 Torre: 14.5 / 16.5 / 1

Minutos de diseño: 61,5 separados, 71,5 unidos y 5 de competición formal. Las microdecisiones contracooperativas viven dentro de las salas separadas y no se suman otra vez. Los clímax mixtos se reparten al 50 por ciento para esta estimación. Buscar transiciones cada 2 a 6 minutos y un descanso corto después de cada pico.

## Cinco familias de poderes

Cada mundo introduce una familia que pueden utilizar ambos mini robots. Las rutas asignan funciones distintas y luego las intercambian. Se evita que un personaje tenga siempre la habilidad vistosa y el otro solo abra puertas.

| Nivel y familia | Separados | Unidos |
| --- | --- | --- |
| 1 Elasticidad | X lanza puño cableado hasta 4 m; LT recoge y carga el muelle. | Cada mano alcanza un anillo a 8 m. Dos anclajes crean tirachinas y pasamanos. |
| 2 Aire | X sopla; LT aspira y retiene objetos ligeros. Planeo corto en corriente. | Ambos aspiran para inflar el torso; cada X orienta una tobera. Vuelo por ráfagas. |
| 3 Magnetismo | X alterna atraer o repeler; LT aplica campo a piezas marcadas. | Cada LT ancla la bota propia. Dos campos X forman pantalla de inducción. |
| 4 Resonancia | X emite pulso; LT crea burbuja de silencio. No usa micrófono. | Dos X próximos generan golpe grave; ambos LT amortiguan ruido del cuerpo. |
| 5 Fase | X coloca un ancla personal; LT retorna con objeto pequeño dentro de 6 m. | Cada X propone aterrizaje; dos LT próximos confirman paso plegado de hasta 4 m. |

### Equipamiento y progresión

Solo hay una familia activa por sala. La estación cambia el módulo de ambos y muestra una demostración de cinco segundos. Las familias anteriores reaparecen en salas señalizadas y en el final, en secuencia; el MVP no necesita selector radial ni combinaciones arbitrarias de cinco poderes a la vez. Movimiento, agarre, salto y acoplamiento siempre permanecen.

### Recursos legibles

Elasticidad usa tensión del cable; aire usa presión; magnetismo usa calor; resonancia necesita cargar el pulso; fase usa enfriamiento. Todos se expresan con la misma barra local de 0 a 100 y un icono distinto, para reutilizar interfaz. No hay energía persistente ni gestión de inventario. La barra y los estados exactos se sincronizan desde el anfitrión.

Objetivo de aprendizaje por módulo: prueba segura, variación cooperativa, tentación o rivalidad, aplicación unida y clímax que mezcla lo aprendido. La novedad debe cambiar las decisiones y el movimiento, además del aspecto.

## Cámara física e información

### Cámara

Separados, cada cliente sigue a su mini robot en tercera persona. Un contorno y una flecha muestran al compañero detrás de obstáculos. Unido, ambos ven el mismo encuadre del cuerpo: cámara guiada por tramo, con adelantamiento hacia el salto y margen para ambos brazos. LB más stick derecho pide un giro; prevalece el guion de seguridad si la petición oculta un apoyo. El ajuste local de distancia no altera la dirección compartida de movimiento.

### Física acotada

El cuerpo lógico utiliza apoyos y volúmenes estables; la armadura, antenas y extremidades exageran el movimiento encima. Limitar torsión y extensión evita que un fallo del motor se confunda con un error de coordinación. El ragdoll completo se reserva para caídas y celebraciones. Una mano agarrada no se rompe por vibración ni por una corrección de red.

### Lenguaje de obstáculos

- Anillo con relieve: admite cable. Malla perforada: admite corriente. Placa estriada con signo: admite campo magnético.
- Membrana con ondas: reacciona a sonido. Disco con cuatro marcas: acepta ancla de fase.
- Aviso antes del impacto: animación, icono y sonido redundantes. Objetivo mínimo inicial: 0,8 s en ruta principal.
- Los colores de propiedad siempre se acompañan de símbolo y patrón; los peligros no dependen solo de distinguir rojo y verde.

### Accesibilidad y ayudas

Subtítulos para pitidos funcionales; metrónomo visual; cámara sin sacudidas y opción de reducir destellos. No exigir micrófono. Remapeo completo, inversión y sensibilidad por stick. Ayuda opcional aumenta sincronización a 450 ms, reduce retroceso de golpes y ensancha agarres. La pareja puede activar una ayuda tras tres fallos; no se aplica automáticamente ni cambia puntuaciones competitivas.

### Interfaz y audio

HUD reducido: dos mini retratos, forma actual, módulo, barra y estado de la mano propia. Unido añade dos indicadores de preparación y dirección de impulso. Pitidos cian y ámbar de alturas distintas ayudan a coordinar sin hablar. Todo aviso importante tiene equivalente visual. Música por capas: exploración suave, tensión por obstáculo y silencio breve para que la caída o el rescate respiren.

## 1 Muelles de rebote

![Ilustración de intención del nivel 1. Los números y proporciones de la ilustración son orientativos; el recorrido de la página siguiente define la secuencia jugable.](images/01_muelles.png)

**Promesa.** Pasar de darse la mano para cruzar un hueco a lanzar juntos un cuerpo enorme entre grúas.

**Objetivo compartido.** Recuperar el primer fusible del clasificador de paquetes y liberar el ascensor al jardín.

**Nuevo poder separados.** Cada mini lanza un puño cableado hasta 4 m a anillos o al guante ofrecido por el compañero. LT acorta el cable; mantenerlo carga un muelle hasta 1 s. Soltar produce un impulso previsible. No se engancha a enemigos no preparados.

**Nuevo poder unidos.** Cada piloto gobierna su brazo telescópico hasta 8 m. Con dos anclajes, ambos recogen cable para tensar y confirman X para lanzarse. Un solo anclaje permite colgar y buscar el segundo; nunca obliga a soltar el primero a ciegas.

**Duración orientativa.** 24 min sin reintentos. Tema mecánico: Elasticidad y confianza.

## Las seis salas del nivel 1

Recorrido: 1 Escuela de guantes [S] → 2 Cintas cruzadas [S] → 3 Carrera de muelles [C] → 4 Primer cuerpo [J] → 5 Pasamanos de grúas [J] → 6 Cangrejo clasificador [M]

| Sala | Modo | Min | Objetivo y obstáculo |
| --- | --- | --- | --- |
| 1 Escuela de guantes | S | 3 | Dos huecos de 2 m sobre red. Ofrecer mano, agarrar y rescatar; cambiar quién cruza primero. |
| 2 Cintas cruzadas | S | 5 | Dos rutas de cintas y cajas. Cada jugador mueve un tope para abrir el paso del otro y cruza después. |
| 3 Carrera de muelles | C | 1 | Dos rondas de 20 s para tocar campanas propias. Se permite rebotar al rival dentro de una pista acolchada. |
| 4 Primer cuerpo | J | 4 | Acoplarse, andar y saltar en tres plataformas de 5 m. Introducir impulso unilateral y luego conjunto. |
| 5 Pasamanos de grúas | J | 5 | Alternar anclajes sobre un balancín y terminar con un lanzamiento a una plataforma visible de 6 m. |
| 6 Cangrejo clasificador | M | 6 | Desacoplar para desviar dos cintas; volver a unir para abrir el frontal del cangrejo y extraer fusible. |

S significa separados. J significa unidos. C significa arena competitiva opcional. M significa clímax con ambas formas. Cada sala cuenta con refugio de entrada y salida legibles; la transición y el breve descanso están incluidos en su duración.

### Cómo enseñar y variar

La mano ofrecida se aprende antes del cable a larga distancia. Las cintas invierten quién ayuda y quién cruza para que ambos prueben el rescate. La primera unión enseña un bote unilateral seguro antes de pedir sincronía. El pasamanos termina con un lanzamiento que utiliza agarre, tensión y dos piernas, sin sumar otra habilidad.

### Construcción inicial

Kit de muelle, cinta y grúa; caja, anillo y tope; robot cangrejo con dos ataques; una arena de campanas. Se reutilizan caja, agarre y muelle en el resto de la campaña.

## Tres obstáculos clave del nivel 1

### 1 El guante de confianza

**Espacio.** Pasarela de 8 por 4 m con hueco central de 2 m y dos anillos de práctica.

**Acciones de la pareja.** Uno ofrece la mano desde un apoyo, el otro agarra y se deja elevar. Después invierten puestos para sacar una caja.

**Regla y aviso.** El cable solo tira si hay agarre confirmado y el pie del que sostiene está apoyado. Red a 1,5 m bajo el hueco.

**Fallo y recuperación.** Soltar pronto deja al otro en la red; escalerilla de retorno en 4 s. No se pierde la caja.

**Comprobación de diseño.** Prueba inicial: ambas personas rescatan y son rescatadas una vez sin instrucciones de voz.

### 2 La caja con tu nombre

**Espacio.** Dos cintas paralelas de 12 m, separadas por una pared baja con tres pasos.

**Acciones de la pareja.** Ambos necesitan una caja para abrir sus puertas. Hay una única carga rápida que puede ahorrarte 3 s pero acelera la cinta del compañero.

**Regla y aviso.** La carga rápida se ofrece solo después de resolver el primer relevo. Su efecto dura 5 s y es visible en un cartel mecánico.

**Fallo y recuperación.** El afectado puede frenar con un tope; cajas que caen vuelven por tubo. Ventaja individual sin pérdida compartida.

**Comprobación de diseño.** La ventaja no debe ahorrar más tiempo que el que permite recuperar al compañero.

### 3 La bisagra del gigante

**Espacio.** Balancín de 10 por 3,5 m, dos anillos a 6 m y llegada de 6 por 6 m.

**Acciones de la pareja.** Cian sujeta el primer anillo mientras Ámbar adelanta pierna y engancha el siguiente. Ambos tensan y preparan salto.

**Regla y aviso.** La tensión máxima se señala por vibración y muelle amarillo. Lanzamiento con dos confirmaciones en 350 ms.

**Fallo y recuperación.** Con una sola confirmación el cable queda cargado, no dispara. Una pérdida de pie se puede salvar con la otra mano.

**Comprobación de diseño.** El segundo piloto debe tomar decisiones de brazo y pierna, no limitarse a esperar una orden.

## El clímax de muelles de rebote

### La prueba competitiva

La carrera de muelles premia campanas tocadas, no terminar antes. El empujón consume el impulso que también podrías usar para puntuar. Ganar concede la pegatina de campana durante esa sesión. Omitir entrega la misma recompensa compartida.

### Cangrejo clasificador

**A Separados.** Esquivar pinzas con aviso de 1 s. Cada mini engancha un pestillo y lo arrastra a una cinta lateral. Al cruzar ambas cajas de calibración, el cangrejo muestra su frontal.

**B Unidos.** Colocar manos en las dos asas del frontal. Un piloto ancla su pierna; el otro da un paso lateral para abrirlo. Después intercambian apoyo y mano para sacar el fusible grande.

**C Remate corto.** El cangrejo retrocede hacia una cinta. Un salto conjunto salva un barrido lento y se deposita el fusible en una toma grande. No hay una tercera repetición idéntica.

### Reinicio y protección del ritmo

Antes de cada sala y al completar la fase A del cangrejo. Red bajo las dos primeras zonas. Desde sala 4, caídas al vacío restituyen el cuerpo en la plataforma previa.

### Criterio de salida del prototipo

Al menos 4 de 5 parejas nuevas deben entender la unión y completar un salto conjunto en dos intentos de práctica. En sala 5, ninguno pasa más de 8 s sin decidir una acción. Registrar frustración por cámara y agarre antes de añadir dificultad.

### Rejugabilidad sin inflar la campaña

Medallas de equipo por rescatarse en ambos sentidos, enlazar tres anillos sin caer y llevar una caja entre los dos. La carrera registra campanas de la pareja y ganador de sesión, sin alterar módulos.

Variante posterior de bajo coste: invertir una cinta y mover un anillo. Mantener las mismas reglas y conservar un descanso antes del lanzamiento.

## 2 Jardín del viento

![Ilustración de intención del nivel 2. Los números y proporciones de la ilustración son orientativos; el recorrido de la página siguiente define la secuencia jugable.](images/02_jardin.png)

**Promesa.** Ser dos pequeños jardineros que se lanzan polen y, después, un globo torpe que necesita dos toberas para no chocar.

**Objetivo compartido.** Reorientar el sistema de ventilación y liberar el segundo fusible atrapado en un ventilador de riego.

**Nuevo poder separados.** X sopla y LT aspira. Se puede retener una esfera ligera frente al robot y soltarla sin dañar al compañero. Las corrientes visibles permiten planeo corto, manteniendo A. Peso alto y superficies sólidas bloquean el aire.

**Nuevo poder unidos.** Ambos LT cargan el torso globo hasta presión 100. Cada X impulsa la tobera del lado propio; apuntar con el stick derecho permite giro. Presión desciende en vuelo y se rellena en corrientes. A y B modifican altura y lastre de cada pierna.

**Duración orientativa.** 26 min sin reintentos. Tema mecánico: Aire y control compartido de trayectoria.

## Las seis salas del nivel 2

Recorrido: 1 Semillero seguro [S] → 2 Invernaderos gemelos [S] → 3 Surf de hojas [C] → 4 Inflarse juntos [J] → 5 Molino de costado [J] → 6 Jardinero desbocado [M]

| Sala | Modo | Min | Objetivo y obstáculo |
| --- | --- | --- | --- |
| 1 Semillero seguro | S | 3 | Soplar una hoja puente, aspirar una esfera y planear 2 m sobre malla. |
| 2 Invernaderos gemelos | S | 5 | Uno mantiene una compuerta y el otro transporta polen; invierten roles en el segundo recinto. |
| 3 Surf de hojas | C | 1 | Carrera de puntos entre hojas flotantes. Coger una ráfaga propia reduce durante 3 s el empuje del carril vecino. |
| 4 Inflarse juntos | J | 5 | Acoplar, cargar globo y cruzar tres aros amplios con toberas independientes. |
| 5 Molino de costado | J | 6 | Alternar anclaje de manos, vuelos cortos y aterrizajes entre aspas acolchadas. |
| 6 Jardinero desbocado | M | 6 | Separados taponan escapes; unidos contrarrestan la ráfaga y giran el ventilador central. |

S significa separados. J significa unidos. C significa arena competitiva opcional. M significa clímax con ambas formas. Cada sala cuenta con refugio de entrada y salida legibles; la transición y el breve descanso están incluidos en su duración.

### Cómo enseñar y variar

El semillero hace visible la relación entre aire y peso. Los invernaderos intercambian transporte y apertura de ruta. La carrera permite gastar viento en ventaja individual. El vuelo unido traslada esa decisión al cuerpo: una tobera aislada sirve para girar, mientras avanzar exige acuerdo y presión compartida.

### Construcción inicial

Vegetación modular, hoja articulada, esfera, chorro, aro y ventilador. El volumen de viento comparte lógica con soplido, corrientes y patrón de jefe; la malla reutiliza recuperación del nivel 1.

## Tres obstáculos clave del nivel 2

### 1 Polen prestado

**Espacio.** Dos invernaderos de 12 por 10 m conectados por ventanas; tres receptáculos grandes.

**Acciones de la pareja.** El transportista aspira una esfera mientras el otro gira una hoja para construirle una rampa. Cambian roles para la esfera siguiente.

**Regla y aviso.** Una esfera bloquea el soplido del portador. Puede posarla sobre bandejas o entregarla al otro a menos de 2 m.

**Fallo y recuperación.** Si cae, vuelve al brote de origen. Cada receptáculo completado persiste al reiniciar el tramo.

**Comprobación de diseño.** No más de 6 s de mantener una compuerta; el soporte debe desplazarse entre controles.

### 2 La ráfaga egoísta

**Espacio.** Dos carriles de hojas con ventilador compartido y refugios laterales.

**Acciones de la pareja.** La entrada azul del carril propio da un impulso de puntuación, pero absorbe aire del vecino. Ayudar a estabilizarlo después abre un acceso para ambos.

**Regla y aviso.** Ventaja limitada a 3 s. Mostrar ambas mangas de viento en el mismo plano para que la consecuencia sea comprensible.

**Fallo y recuperación.** Un aterrizaje malo termina en malla; retorno de 3 s. No se puede apagar permanentemente el otro carril.

**Comprobación de diseño.** En pruebas, preguntar si la interferencia fue entendida y si provocó revancha amistosa o simple enfado.

### 3 El globo de dos escapes

**Espacio.** Corredor aéreo de 18 m por 12 m, tres aros de 5 m y descansos cada 6 m.

**Acciones de la pareja.** Dos toberas alineadas avanzan; una sola gira. Un piloto puede anclar mano en aro mientras el otro recompone trayectoria y presión.

**Regla y aviso.** Vuelo máximo objetivo 8 s por carga. Las rutas nunca exigen agotar la barra. Relleno visible y seguro en descansos.

**Fallo y recuperación.** Al chocar pierde presión y cae a un refugio inferior. No hay explosión ni daño persistente.

**Comprobación de diseño.** Debe poder completar el corredor una pareja que se coordina con señales y sin micrófono.

## El clímax de jardín del viento

### La prueba competitiva

Surf de hojas puntúa precisión de aterrizaje y esferas recogidas; cada jugador tiene igual número de oportunidades. Las ráfagas para molestar se toman de la propia reserva. El perdedor conserva el mismo fusible y desbloqueos.

### Jardinero desbocado

**A Separados.** Cerrar dos fugas con esferas de polen mientras una boquilla gira 180 grados en 4 s. Una fuga cerrada deja un refugio para la otra tarea. Roles intercambiables.

**B Unidos.** Inflarse en el conducto central y orientar las dos toberas para contrarrestar el ventilador durante ráfagas de 3 s. Una mano puede agarrar el aro para corregir una mala entrada.

**C Remate corto.** Aterrizar en la base, girar dos asas de orientación y enviar el aire hacia la torre. El ventilador se convierte en ascensor. El remate dura menos de un minuto.

### Reinicio y protección del ritmo

Refugios de vuelo cada 6 m y guardado de fase tras taponar las dos fugas. Un choque devuelve al descanso inmediatamente anterior, no al inicio del circuito.

### Criterio de salida del prototipo

La pareja debe poder atribuir un giro a la tobera correcta sin mirar el HUD. Si solo uno dirige y el otro espera, aumentar las necesidades alternas de anclaje y corrección. Probar mareo y opción de horizonte estable.

### Rejugabilidad sin inflar la campaña

Medallas por completar un corredor con un agarre salvador, intercambiar todas las esferas sin caída y pasar los tres aros con correcciones de ambos lados. El récord de vuelo pertenece a la pareja.

Variante posterior: invertir una corriente y cambiar la altura de una hoja. Evitar aleatoriedad de viento que oculte si la corrección de un piloto fue útil.

## 3 Fundición magnética

![Ilustración de intención del nivel 3. Los números y proporciones de la ilustración son orientativos; el recorrido de la página siguiente define la secuencia jugable.](images/03_fundicion.png)

**Promesa.** Empujaros y atraeros como imanes antes de aprender a caminar de lado por una torre agarrados con los pies.

**Objetivo compartido.** Transportar dos núcleos al puente exterior y recuperar el fusible que utiliza la grúa de reciclaje.

**Nuevo poder separados.** X alterna entre atraer y repeler; LT aplica campo dirigido de hasta 3 m a piezas marcadas. La carcasa de cada mini puede polarizarse para ayudarse con impulsos. El campo no atraviesa muros y un contador limita fuerza y calor.

**Nuevo poder unidos.** LT ancla o suelta la bota del lado propio sobre placas estriadas. X y dirección del brazo aplican inducción; dos campos compatibles durante 0,7 s generan una pantalla que desvía bolas metálicas. Una bota firme puede sostener el cuerpo mientras cambia la otra.

**Duración orientativa.** 28 min sin reintentos. Tema mecánico: Polos opuestos y apoyos alternos.

## Las seis salas del nivel 3

Recorrido: 1 Escuela de polaridad [S] → 2 Relevo de núcleos [S] → 3 Hockey de chatarra [C] → 4 Pies en la pared [J] → 5 El puente de inducción [J] → 6 Grúa de reciclaje [M]

| Sala | Modo | Min | Objetivo y obstáculo |
| --- | --- | --- | --- |
| 1 Escuela de polaridad | S | 3 | Desplazar discos en pistas y probar un empujón compañero sobre red. |
| 2 Relevo de núcleos | S | 6 | Rutas de rail paralelas; atraer una pieza propia abre un hueco al otro. Un atajo de carga introduce tentación. |
| 3 Hockey de chatarra | C | 1 | Dos rondas en arena acolchada. Repeler disco o defender portería, con posiciones invertidas. |
| 4 Pies en la pared | J | 5 | Acoplar y recorrer placas a 90 grados. Mantener una bota mientras cambia la otra. |
| 5 El puente de inducción | J | 6 | Cruzar vigas curvas y desviar dos bolas sobre raíles hacia contrapesos. |
| 6 Grúa de reciclaje | M | 7 | Separados encajan núcleos en raíles; unidos ascienden por el brazo y liberan el fusible. |

S significa separados. J significa unidos. C significa arena competitiva opcional. M significa clímax con ambas formas. Cada sala cuenta con refugio de entrada y salida legibles; la transición y el breve descanso están incluidos en su duración.

### Cómo enseñar y variar

Primero se mueve un disco sin riesgo; después se aplica el mismo campo al compañero. El relevo añade la tentación de usar un imán compartido. La pared gira la referencia de suelo y obliga a alternar apoyos. El billar combina brazos orientados con pies anclados antes de la grúa final.

### Construcción inicial

Raíl, disco, núcleo, placa, bola y pantalla. Grúa utiliza articulación del nivel 1 con nuevo patrón, sin crear un enemigo de física completamente distinto.

## Tres obstáculos clave del nivel 3

### 1 El núcleo que te conviene

**Espacio.** Dos pistas de 14 m con tres estaciones y un superimán central.

**Acciones de la pareja.** Para sacar tu núcleo puedes usar la estación central, pero atrae también el del compañero. Coordinando los momentos se ahorra recorrido a ambos.

**Regla y aviso.** La fuerza actúa solo en carriles marcados. Las piezas se detienen en topes y no golpean fuera del área.

**Fallo y recuperación.** Un núcleo desplazado a la pista equivocada vuelve por un desvío de 5 s; nunca se pierde debajo del escenario.

**Comprobación de diseño.** La tentación debe generar negociación sobre cuándo usar la estación, no sobre quién pierde progreso.

### 2 Paso de bota

**Espacio.** Pared curva de 20 m con apoyos de 3 m y plataformas de descanso.

**Acciones de la pareja.** Piloto con bota fija sostiene; el otro mueve pierna y ancla siguiente placa. Ambos brazos recogen contrapesos o bloquean un barrido.

**Regla y aviso.** Una última bota no se suelta si la otra no tiene apoyo, salvo confirmación mantenida con aviso. Pared de aprendizaje sin proyectiles.

**Fallo y recuperación.** Quedar colgado de una bota es recuperable por torso y brazo. Dos botas fuera provocan retorno a la última repisa.

**Comprobación de diseño.** Los pilotos deben alternar liderazgo al menos dos veces. Si hay órdenes continuas de uno, invertir geometría del siguiente tramo.

### 3 Billar de fundición

**Espacio.** Pasarela de 12 por 5 m, dos vías de bola y dos cuencos de contrapeso.

**Acciones de la pareja.** Ambos orientan sus brazos para formar pantalla y cambiar trayectoria de la bola hacia el cuenco correcto. Después caminan hasta la palanca abierta.

**Regla y aviso.** Bola anunciada 1,2 s antes; pantalla carga 0,7 s y dura 2 s. Bola lenta y contenida en raíl.

**Fallo y recuperación.** Fallo devuelve la bola al circuito tras 4 s. Ningún proyectil puede tumbar al robot más de una vez seguida.

**Comprobación de diseño.** Aceptar varias orientaciones útiles de pantalla, sin exigir precisión angular de un shooter.

## El clímax de fundición magnética

### La prueba competitiva

Hockey de chatarra usa un disco, dos porterías anchas y fuerza limitada. La arena impide arrastrar físicamente al rival fuera de cámara. Una entrada accidental en propia puerta cuenta; empates no exigen desempate.

### Grúa de reciclaje

**A Separados.** Cada mini lleva un núcleo por un raíl. La grúa intercambia la polaridad de un tramo tras aviso de 1 s. Uno puede estabilizar una carga del otro, y después avanzar la propia.

**B Unidos.** Con núcleos encajados se abren placas en el brazo. Alternar botas mientras una bola recorre el canal. Los dos brazos forman pantalla para abrir un contrapeso.

**C Remate corto.** Colgar de dos asas, desplazar el cuerpo para equilibrar la grúa y retirar el fusible. Si se balancean demasiado, vuelven a una repisa intermedia. El enemigo queda convertido en puente.

### Reinicio y protección del ritmo

Guardado de núcleos colocados y plataforma intermedia en brazo de grúa. Los ensayos de pared se resuelven sobre red; el tramo final admite vacío con retorno al último apoyo.

### Criterio de salida del prototipo

El estado de ambas botas debe entenderse con relieve e icono, sin color. Medir cuántas caídas proceden de soltar involuntariamente la última bota; si supera una por pareja, revisar confirmación y feedback antes de subir dificultad.

### Rejugabilidad sin inflar la campaña

Medallas por alternar seis apoyos sin soltar las dos botas, corregir una bola con pantalla y devolver un núcleo perdido al compañero. La carrera mantiene únicamente puntuación de sesión.

Variante posterior: cambiar el orden de dos placas y la entrada de una bola. No añadir polaridades nuevas ni aumentar el número de piezas físicas por pantalla.

## 4 Teatro del eco

![Ilustración de intención del nivel 4. Los números y proporciones de la ilustración son orientativos; el recorrido de la página siguiente define la secuencia jugable.](images/04_teatro.png)

**Promesa.** Convertir una discusión de pitidos en una actuación conjunta que hace rebotar al robot por todo un teatro.

**Objetivo compartido.** Restaurar el compás de la orquesta y obtener el fusible del director automático.

**Nuevo poder separados.** X emite un pulso de radio 3 m que activa membranas y despierta mecanismos. LT mantiene una burbuja de silencio de radio 2 m que bloquea pulsos dentro. Sirve para proteger al otro de alarmas o para estropear temporalmente su activación.

**Nuevo poder unidos.** Dos X en una ventana de 300 ms emiten un golpe grave que activa grandes tambores. Ambos LT amortiguan pasos para cruzar plataformas de cristal. Cada mano puede agarrar baquetas y cada pierna modificar el contrapeso de una membrana.

**Duración orientativa.** 28 min sin reintentos. Tema mecánico: turnos, cambios de tempo y silencio.

## Las seis salas del nivel 4

Recorrido: 1 Afinar sin público [S] → 2 El gran tambor [J] → 3 Bambalinas enfrentadas [S] → 4 Carrera de platillos [C] → 5 Puente de cristal [J] → 6 Director sin público [M]

| Sala | Modo | Min | Objetivo y obstáculo |
| --- | --- | --- | --- |
| 1 Afinar sin público | S | 3 | Activar una membrana y silenciar un detector con indicador visual. |
| 2 El gran tambor | J | 5 | Acoplar para saltar con dos golpes graves sobre una escalera de tambores. |
| 3 Bambalinas enfrentadas | S | 6 | Separar por puertas pequeñas. Uno necesita pulso y el otro silencio; deben colocarse sin anularse. |
| 4 Carrera de platillos | C | 1 | Puntuar secuencias de rebote y elegir entre activar tu salto o silenciar brevemente al rival. |
| 5 Puente de cristal | J | 6 | Alternar pasos amortiguados, agarres y salto grave hacia un balcón. |
| 6 Director sin público | M | 7 | Separados reconfiguran instrumentos; unidos siguen y alteran un patrón final de percusión. |

S significa separados. J significa unidos. C significa arena competitiva opcional. M significa clímax con ambas formas. Cada sala cuenta con refugio de entrada y salida legibles; la transición y el breve descanso están incluidos en su duración.

### Cómo enseñar y variar

Este nivel altera el orden habitual: tras un tutorial corto se unen pronto para descubrir el golpe grave. Luego vuelven a separarse para comprender cómo su silencio puede interferir al otro. La carrera ofrece un uso juguetón de esa interferencia. El puente exige decidir cuándo callar, moverse y volver a sonar.

### Construcción inicial

Tambor, membrana, cristal, detector, baqueta y burbuja. El director reutiliza sistema de avisos de otros automatismos; no necesita simulación musical ni reconocimiento de voz.

## Tres obstáculos clave del nivel 4

### 1 Escalera de bajos

**Espacio.** Tres tambores de 5 m con diferencia de altura de 1,5 m y refugios laterales.

**Acciones de la pareja.** Ambos preparan golpe grave y saltan al rebote. En el tercero, una mano agarra aro y la otra orienta una baqueta para abrir el siguiente balcón.

**Regla y aviso.** El tambor marca dos pulsos previos con luz y animación. La ayuda convierte sincronía de 300 en 450 ms.

**Fallo y recuperación.** Un golpe desigual produce rebote pequeño y deja al cuerpo en un anillo de seguridad. No dispara automáticamente al vacío.

**Comprobación de diseño.** Completable con audio apagado. El audio enriquece el tempo, no entrega información exclusiva.

### 2 Tu ruido Mi silencio

**Espacio.** Dos pasillos superpuestos con tres ventanas de comunicación.

**Acciones de la pareja.** Cian activa membrana de su pasillo mientras Ámbar protege un cristal con silencio. Deben separarse en distancia y alternar turnos; luego intercambian recorrido.

**Regla y aviso.** Burbuja de 2 m se dibuja en suelo y corta el pulso solo si lo intercepta. Aviso muestra quién canceló el mecanismo.

**Fallo y recuperación.** Cancelar una activación retrasa 2 s. Los mecanismos vuelven a posición base y no pierden piezas.

**Comprobación de diseño.** El pique procede de acercarse demasiado o ahorrar recorrido; tras 3 cancelaciones, aparece ruta más ancha opcional.

### 3 El suelo que escucha

**Espacio.** Pasarela de cristal de 15 por 4 m con descansos cada 5 m y dos péndulos.

**Acciones de la pareja.** Mantener ambos amortiguadores durante pasos cortos; soltar en descanso para cargar un salto grave. Brazos gestionan agarres mientras las piernas se desplazan.

**Regla y aviso.** Ruido acumulado en tres segmentos visibles. Sobrepasar umbral agrieta la placa antes de ceder tras un segundo.

**Fallo y recuperación.** Primer fallo deja colgarse de un borde. Si ambos pierden agarre, retorno al descanso anterior.

**Comprobación de diseño.** Evitar mantener dos botones sin decisiones durante más de 6 s; intercalar giro, agarre o liberación.

## El clímax de teatro del eco

### La prueba competitiva

En carrera de platillos cada pulso tiene coste de recarga de 2 s. Silenciar al rival consume la misma oportunidad de activar tu siguiente rebote. El efecto dura 1 s; la arena restituye posiciones y permite sumar puntos sin atacar.

### Director sin público

**A Separados.** Un mini envía pulso al instrumento correcto y el otro silencia el que interfiere. Un foco anticipa el siguiente objetivo. Tras dos instrumentos se intercambian las posiciones de los robots.

**B Unidos.** El director marca un patrón corto de dos golpes y pausa. La pareja lo reproduce para elevar una plataforma y agarra dos baquetas cuando pasa un barrido acolchado.

**C Remate corto.** La pareja rompe voluntariamente el último patrón con un único golpe grave para despertar al público mecánico. Extrae el fusible mientras el director saluda. No hay prueba larga de memoria musical.

### Reinicio y protección del ritmo

Al llegar a cada balcón y tras reconfigurar instrumentos. En el clímax se conserva la fase superada, aunque falle el patrón posterior.

### Criterio de salida del prototipo

Cinco parejas deben reconocer pulso y silencio sin explicación verbal adicional tras la sala 1. Probar con personas sin experiencia en juegos rítmicos; si el ritmo frena la campaña, ampliar ventanas antes de reducir posibilidades de rescate.

### Rejugabilidad sin inflar la campaña

Medallas por resolver con indicadores visuales, salvar un rebote desigual mediante agarre y reproducir un patrón sin cancelar el pulso del compañero. Se permite completar con audio apagado.

Variante posterior: alterar el tempo dentro de un rango anunciado y recolocar un descanso. No convertir la campaña en una prueba de oído o memoria larga.

## 5 Torre del reencuentro

![Ilustración de intención del nivel 5. Los números y proporciones de la ilustración son orientativos; el recorrido de la página siguiente define la secuencia jugable.](images/05_torre.png)

**Promesa.** Aprender a dejar un punto de retorno propio y decidir después, entre los dos, dónde debe aterrizar vuestro único cuerpo.

**Objetivo compartido.** Subir a la torre, recuperar la batería central y elegir juntos el destino final de la entrega.

**Nuevo poder separados.** X deja un disco ancla en una superficie marcada y estable; LT vuelve a él dentro de 6 m, con 3 s de recarga. Transporta solo objetos pequeños. Línea de visión y recorrido de fase libres de muro sólido. Un ancla por jugador, siempre visible.

**Nuevo poder unidos.** Cada X coloca un marcador de aterrizaje hasta 4 m. Si coinciden a menos de 1 m y ambos LT se confirman en 350 ms, el cuerpo realiza un paso plegado. Destino inválido cancela sin gasto. El paso conserva velocidad limitada y no atraviesa paredes.

**Duración orientativa.** 32 min sin reintentos. Tema mecánico: Confianza bajo cambios de forma.

## Las seis salas del nivel 5

Recorrido: 1 Escuela del regreso [S] → 2 Paso en pareja [J] → 3 Pozos de servicio [S] → 4 Mensajeros de fase [C] → 5 Subida de la torre [J] → 6 Guardián del enlace [M]

| Sala | Modo | Min | Objetivo y obstáculo |
| --- | --- | --- | --- |
| 1 Escuela del regreso | S | 4 | Poner ancla, saltar a por batería ligera y volver. Cada uno debe rescatar al otro sin ancla activa. |
| 2 Paso en pareja | J | 5 | Acoplar para acordar tres aterrizajes de fase sobre plataformas amplias. |
| 3 Pozos de servicio | S | 6 | Separar; rutas con anclas personales y relevo de batería. Reaparecen elasticidad y aire en estaciones sucesivas. |
| 4 Mensajeros de fase | C | 1 | Dos rondas de entregas por rutas espejo; cada uno decide cuándo abandonar su ancla segura por un atajo. |
| 5 Subida de la torre | J | 7 | Tres tramos: botas magnéticas, tambor grave y paso plegado. Estación cambia familia antes de cada tramo. |
| 6 Guardián del enlace | M | 9 | Separados abren dos conectores; unidos cruzan anillos y colocan batería en toma compartida. |

S significa separados. J significa unidos. C significa arena competitiva opcional. M significa clímax con ambas formas. Cada sala cuenta con refugio de entrada y salida legibles; la transición y el breve descanso están incluidos en su duración.

### Cómo enseñar y variar

El ancla se aprende con una batería ligera y una ayuda física que impide resolverlo todo regresando. La pareja practica acuerdo de destino pronto y después recupera autonomía en los pozos. La subida intercala módulos antiguos en estaciones seguras. El guardián exige elegir apoyos y coordinar una entrega, en vez de introducir un sexto poder.

### Construcción inicial

Disco ancla, marcador doble, toma central y anillos. Reutiliza placas, tambores, cables y corrientes. Guardián construido como mecanismo modular con fases de estado, evitando un jefe humanoide nuevo.

## Tres obstáculos clave del nivel 5

### 1 Regreso con paquete

**Espacio.** Dos plataformas de 5 por 5 m con hueco de 3 m, anclas a menos de 6 m y bandejas intermedias.

**Acciones de la pareja.** Uno deja ancla junto a una toma y salta a por batería; el otro mueve una pasarela y recibe el objeto. Después cambian la ruta y el portador.

**Regla y aviso.** Ancla solo sobre superficie estable. Llevar objeto grande impide fase y muestra icono claro. Ancla personal no se comparte.

**Fallo y recuperación.** Si un jugador vuelve sin entregar, conserva batería ligera. Si cae, batería aparece en última bandeja y puede recogerla cualquiera.

**Comprobación de diseño.** La solución debe incluir una ayuda física que no se pueda sustituir siempre pulsando retorno.

### 2 Acordar dónde caer

**Espacio.** Serie de tres huecos de 3 a 4 m con dos zonas posibles de aterrizaje, una lenta y una rápida.

**Acciones de la pareja.** Cada piloto propone lugar. Los marcadores deben solaparse y ambos confirmar. El que ve mejor el apoyo puede señalar una alternativa sin controlar al otro.

**Regla y aviso.** Marcadores anclados al suelo, con símbolo de validez y posición por cliente. La simulación resuelve acuerdo desde estado autoritativo.

**Fallo y recuperación.** Desacuerdo mantiene cuerpo donde estaba. Paso fallido por obstáculo móvil vuelve a refugio de origen, sin caída injusta.

**Comprobación de diseño.** La fase se concede si las confirmaciones entran en la ventana validada por red. Probar diferentes latencias antes de fijar 350 ms.

### 3 Tres recuerdos Un ascenso

**Espacio.** Tres repisas de 10 m, un kit antiguo por repisa y punto de retorno entre ellas.

**Acciones de la pareja.** Magnetismo para pasar una curva, resonancia para elevar balcón y fase para saltar anillo final. Cambiar familias solo en estaciones seguras.

**Regla y aviso.** Cada estación comunica módulo y restaura barra. No se mezclan cinco controles contextuales en un único combate.

**Fallo y recuperación.** Fallar solo repite la repisa actual. Los anteriores retos permanecen completos.

**Comprobación de diseño.** Debe sentirse dominio de mecánicas conocidas; recortar cualquier tramo que solo repita un tutorial.

## El clímax de torre del reencuentro

### La prueba competitiva

Mensajeros de fase puntúa entregas válidas, con igual número de paquetes en rutas espejo. Tomar el atajo deja atrás el ancla y expone a perder tiempo, no paquetes de campaña. Tras el resultado ambos deben accionar juntos la puerta de salida.

### Guardián del enlace

**A Separados.** Cada mini coloca ancla en su refugio y cruza para abrir un conector. Una batería pequeña debe pasar de mano en mano porque el cierre de un conector bloquea una de las rutas de regreso.

**B Unidos.** El guardián abre un circuito de anillos. Una estación instala magnetismo para rodear una placa; otra resonancia para levantar el acceso. No cambia módulo en medio de un salto.

**C Fase final.** Instalar fase y acordar dos aterrizajes para llegar a la toma central. Cada piloto sujeta un asa de la batería; dos impulsos suaves la insertan. El guardián se pliega y crea el paseo final.

**D Epílogo.** De nuevo separados, ambos pulsan la entrega o se desvían juntos a devolver la batería a su barrio. La diferencia es visual y narrativa; ninguna elección exige traicionar al compañero.

### Reinicio y protección del ritmo

Por conector y por cada tramo del guardián. Al reanudar aparece el mismo módulo, objetos y estado de puertas; no es necesario repetir niveles previos ni ganar ninguna carrera.

### Criterio de salida del prototipo

Una pareja debe completar la combinación final identificando los módulos por su forma. Objetivo inicial: desacuerdos de fase resueltos en menos de 5 s y cero teletransportes a geometría inválida. Preguntar si el final necesitó a ambos o solo coordinación verbal de uno.

### Rejugabilidad sin inflar la campaña

Medallas por ofrecer un destino alternativo, completar el relevo con ambos como portador y recuperar a un compañero sin usar retorno de fase. El cierre se guarda como logro de pareja.

Variante posterior: un contrato que recorra solo las tres repisas finales, con módulos conocidos en otro orden y una estación segura entre cambios.

## Amenazas y acción ligera

Los obstáculos tienen estados claros: reposo, aviso, acción, recuperación y resolución. Los clímax usan las mismas reglas a mayor escala. El daño es retroceso, desequilibrio o caída; no existe una barra de salud que obligue a administrar curación.

| Familia | Comportamiento inicial | Respuesta de la pareja |
| --- | --- | --- |
| Barrido | Gira un brazo acolchado en un arco fijo. Aviso de 1 s; barrido de 2 s; pausa de 2 s. | Saltar, frenar tras cobertura o agarrar anillo. Un piloto puede estabilizar mientras el otro se protege. |
| Carga por raíl | Proyectil limitado a un canal visible. Aviso de 1,2 s y retorno automático al fallar. | Apartarse, redirigirlo con módulo o usarlo para activar un contrapeso. |
| Detector y activador | Señala un área antes de bloquear o mover una plataforma. Ninguna acción instantánea oculta. | Colocar objeto, interrumpir pulso, cubrir con silencio o coordinar un relevo. |

### Acción de manos y objetos

RT sujeta asas, piezas o mano ofrecida. La fuerza del mini mueve objetos ligeros; dos minis pueden transportar una pieza media con menor velocidad. El cuerpo unido mueve piezas pesadas. Un barril o bola recibe impulso del módulo adecuado, pero no se lanza a precisión de shooter. Los antagonistas tienen puertos y pestillos; no se derrotan repitiendo golpes a una barra de salud.

### Reglas contra accidentes injustos

- Tras un golpe, 1,5 s de protección frente a otro retroceso del mismo mecanismo.
- Un objeto crítico restituye su posición si cae fuera del volumen de sala; nunca desaparece del guardado.
- No cerrar puertas sobre el cuerpo ni iniciar barridos durante transformación o reaparición.
- Una pieza atrapada fuera de alcance vuelve a la última bandeja tras 5 s sin contacto válido.
- Los enemigos no necesitan perseguir a un jugador por todo el nivel: trabajan sobre su área y avisan antes de actuar.

### Variedad y reutilización

Variar orientación, espacio, módulo y relación social antes de añadir otra inteligencia de enemigo. Un barrido puede ser pinza, aspa, grúa o batuta. Las fases de clímax añaden objetivos y cambios de forma, con un máximo de dos amenazas simultáneas en el MVP. Cada nueva combinación debe conservar una salida visible.

## Qué construir y en qué orden

### Muestra vertical antes de cinco mundos

Construir primero una sala separada, una placa de unión, un salto compartido, un agarre salvador, una arena de 60 s y una sección de grúa del nivel 1. Usar geometría simple y sonido temporal. Solo pasar a producción de campaña si dos jugadores pueden entender, disfrutar y repetir ese ciclo.

| Hito | Resultado revisable | Condición para avanzar |
| --- | --- | --- |
| A Control básico | Dos minis online, agarre, salto, cámara y refugio. | Sin atascos al agarrarse o reaparecer; cada jugador se mueve de forma independiente. |
| B Cuerpo unido | Acoplar, caminar, saltar, controlar dos brazos y rescatar. | Cada piloto usa su mitad y la cámara mantiene apoyos visibles. |
| C Muestra del nivel 1 | Una sección de cada relación social y clímax abreviado. | Pruebas externas muestran deseo de repetir y fallos entendibles. |
| D Campaña en geometría simple | 30 salas con cinco módulos y estados de guardado. | Todas las rutas se completan en dos clientes y con reconexión. |
| E Arte y acabado | Seis láminas como guía, kit modular, audio y animación. | Lectura de obstáculos consistente y coste visual estable. |
| F Candidato de lanzamiento | Campaña completa, opciones, invitación, guardados y QA. | Sin bloqueos conocidos y recorrido íntegro en condiciones de red objetivo. |

### Contenido cerrado del MVP

Dos minis, un cuerpo combinado, cinco familias con cinco variantes unidas, treinta salas, cinco arenas de un minuto y cinco clímax de mecanismos. Tres comportamientos base de amenaza: barrido, proyectil sobre raíl y detector/activador. Los clímax recombinan esos comportamientos y no cuentan como cinco sistemas de combate nuevos.

### Recortes si la producción crece

Reducir primero variantes decorativas, medallas y rutas opcionales. Acortar fases repetidas de clímax y usar un kit geométrico común para escenarios. Preservar las cinco familias, los cinco niveles y el cambio de forma, porque son el alcance definido. Si aun así no cabe, revisar explícitamente el alcance antes de prometer una entrega menor.

## Online y física compartida

### Autoridad y respuesta

Una persona aloja la sesión y valida movimiento, agarres, piezas físicas, cambios de forma, poderes y objetivos. Cada cliente envía intenciones de su mini o de su mitad. Predecir movimiento local y efectos de preparación, pero corregir el resultado desde el anfitrión. El motor y el transporte se eligen tras probar las restricciones de física y conectividad; este documento no fija una librería.

### Estado que debe viajar

- Identificador de sala y checkpoint; forma separada o unida; transformación y consentimiento.
- Posición, velocidad, apoyo de cada pie, objetivo y estado de cada mano; intención de cada piloto.
- Familia instalada, barra, enfriamiento, polaridad o ancla activa, cuando corresponda.
- Estados de cajas, puertas, plataformas, patrones y fase de clímax; semilla solo si se usan variaciones.
- Marcadores, confirmaciones de salto/poder, arena y puntuación cosmética de sesión.

### Sincronía justa

Las ventanas de 250 a 350 ms son valores de diseño, no fechas de recepción ingenuas de paquetes. Registrar tiempo de entrada y resolver con una tolerancia acotada que no favorezca sistemáticamente al anfitrión. Una cancelación de fase nunca deja al cliente en un lugar distinto del aceptado. No usar vídeo grabado de una animación como prueba de que la red funciona.

### Rendimiento y desconexión

Punto de partida técnico a medir: simulación a 60 Hz y envío de estado a 20 o 30 Hz. Mantener pocas piezas activas por sala y objetos clave con estados simples. Si se pierde conexión, el anfitrión pausa el intento hasta 90 s, conservando el estado para reingreso. Si cae el anfitrión, volver a sala de invitación y ofrecer reanudar el checkpoint; migración automática queda fuera del MVP.

### Guardados y pruebas

Ambos perfiles guardan su última sala completada y desbloqueos cosméticos. La campaña de la sesión sigue el checkpoint del anfitrión, mostrado antes de entrar. Los invitados pueden conservar el nivel completado sin sobrescribir una campaña propia más avanzada. Probar a 40, 100 y 180 ms de ida y vuelta, variación de 30 ms y 2 por ciento de pérdida; son condiciones de prueba, no compatibilidad ya demostrada.

## Cómo comprobar que resulta divertido

La primera ronda requiere al menos cinco parejas externas: amistades habituales, pareja con distinta experiencia y personas sin hábito de plataformas. Observar sin dar instrucciones de voz durante los primeros minutos; el propio juego debe enseñar sus reglas.

| Pregunta | Señal inicial deseada | Qué cambiar si falla |
| --- | --- | --- |
| ¿Ambos juegan de verdad? | Ningún rol supera 8 s continuos sin decisión relevante. | Añadir desplazamiento, apuntado o alternancia; eliminar botones de espera. |
| ¿Se entiende un fallo? | La pareja identifica su causa en 4 de 5 casos observados. | Mejorar aviso, encuadre y consistencia antes de añadir pistas de texto. |
| ¿Hay recuperación? | Al menos un rescate significativo por nivel resulta posible en pruebas. | Añadir borde, apoyo o margen; reducir caídas que cortan toda acción. |
| ¿El pique se disfruta? | Ambos aceptan revancha o comentan una jugada con humor. | Reducir castigo, aclarar coste al atacante o volver la prueba opcional. |
| ¿Importa cambiar de forma? | Cada forma resuelve situaciones que la otra no puede trivializar. | Ajustar escala, fuerzas y rutas; evitar que separarse sea solo una llave. |
| ¿La red permite coordinar? | El cliente obtiene la misma tasa de éxito que el anfitrión en tareas espejo. | Revisar confirmación, predicción y tolerancias antes de ampliar ventana global. |
| ¿Se quiere otra partida? | Al menos 3 de 5 parejas solicitan repetir un tramo o arena. | Revisar el ciclo central; más arte y contenido no resuelven esa señal. |

### Registro mínimo por sesión

Guardar anónimamente y de forma local para la prueba: sala, forma, intentos, tipo de fallo, tiempo hasta recuperar, agarres, rescates, cancelaciones de poder y lado anfitrión/cliente. Registrar manualmente si hubo risa, celebración, silencio por espera o frustración. Estos son criterios propuestos; este documento no afirma que ya se hayan alcanzado.

### Puerta de lanzamiento

Completar los cinco niveles de principio a fin con dos clientes; reanudar desde las treinta salas; verificar que ningún objeto crítico puede perderse; cruzar cada salto con ayuda y sin ayuda; probar omisión de las cinco arenas; comprobar texto y símbolos sin audio y sin distinguir colores. Todo bloqueo de progresión es prioritario frente a nuevo contenido.

## Después de la campaña para dos

| Ampliación | Qué aporta | Condición previa |
| --- | --- | --- |
| Contratos de revancha | Versiones cortas con objetivos de equipo y condiciones nuevas sobre salas existentes. | El ciclo de dos jugadores ya retiene interés al repetir. |
| Cambiar de lado | Estaciones que intercambian brazo y pierna controlados, con aviso y consentimiento. | Ambos entienden identidad corporal y la cámara no confunde. |
| Tres jugadores | Robot trípode y campaña propia con tres apoyos de igual importancia. | Prototipo independiente; no redistribuir sin más el mando de dos. |
| Cuatro jugadores | Cada persona controla una extremidad en un cuerpo mayor, con nuevas salas. | Demostrar que cuatro roles tienen decisiones y visibilidad. |
| Cooperativo local | Pantalla dividida separados y encuadre común unidos. | Presupuesto de render y pruebas de legibilidad específicas. |
| Combinación libre de módulos | Cruces como cable magnético o globo resonante en desafíos opcionales. | Herramientas y QA suficientes para la explosión de combinaciones. |
| Editor de pruebas | Crear arenas pequeñas con piezas ya verificadas. | Conjunto estable de piezas, restauración y límites de física. |
| Poderes cíclicos | Modo aparte donde los módulos cambian en estaciones temporizadas. | La campaña base ya enseña las cinco familias sin sobrecarga. |

### Ideas que pueden esperar

No incluir todavía mundo abierto, generación procedural de campaña, economía persistente, combate de botín ni creación libre de robots. Tampoco añadir una inteligencia generativa al centro del control: el personaje debe responder de forma previsible para que una decisión tenga consecuencias comprensibles.

### Relación con Retired Wizards

La rotación cíclica de poderes encaja como un modo de desafío posterior, pero el juego de magos mantiene una identidad propia y no forma parte del MVP del robot. En Dos a uno, las estaciones dan tiempo para aprender; un modo caótico puede añadir después cambios avisados de módulo y reglas cortas de adaptación.

### Decisión de producto

Construir una campaña pequeña pero variada alrededor del cuerpo compartido. La expansión a más jugadores merece personajes y recorridos propios. El primer criterio para ampliar es que las parejas recuerden jugadas, pidan repetirlas y sientan que ambos fueron necesarios.

## Valores de prototipo y dirección artística

| Parámetro | Valor inicial | Nota |
| --- | --- | --- |
| Altura mini y unido | 0,9 m y 2,2 m | La escala de puerta distingue rutas sin depender del color. |
| Ancho ruta mini y unida | 1,5 m y 3,5 m mínimos | Aumentar en giros, cámara lateral y zonas de aprendizaje. |
| Velocidad mini y unida | 5 m/s y 3,5 m/s | Una sola pierna mueve unido hasta 1,2 m/s. |
| Salto base mini y unido | Hueco seguro 2 m y 3 m | Modificadores y grandes huecos necesitan módulo y refugio. |
| Tolerancia de salto | 120 ms al abandonar borde | Añadir búfer de pulsación de 120 ms antes de aterrizar. |
| Ventanas conjuntas | 250 ms salto; 300 ms sonido; 350 ms cable y fase | Ayuda opcional 450 ms. Confirmar con red real. |
| Cambio de forma | Consentimiento 0,6 s; animación 1,2 s | Necesita suelo y dos destinos libres. |
| Rescate y reaparición | Agarre hasta 2 m; retorno objetivo 3 s | Nunca borrar salas completadas por una caída. |
| Pruebas competitivas | 5 arenas de 60 s | Dos rondas, empate permitido y omisión por cualquiera. |

### Arte que debe sobrevivir al prototipo

Robot manufacturado con visor negro, armadura marfil, juntas oscuras y dos identidades claras: cian y naranja. Piezas gruesas, manos y botas expresivas, marcas de uso y sombras de dos tonos. Los mini robots conservan la misma cara y rasgos del cuerpo grande. El humor se anima en apoyos, pausas, ojos y antenas; evitar complejidad de detalle que impida leer la pose.

### Cómo interpretar las imágenes

Las seis ilustraciones generadas establecen personaje, material, tono y tipos de obstáculo. Los mapas vectoriales, tablas y reglas de este documento prevalecen para secuencia, número de actores, distancias y comportamiento. Las poses exageradas o piezas ambiguas del concept art requieren revisión al modelar. Las mecánicas, rutas y nombres se han diseñado para esta campaña y quedan pendientes de prototipo.

### Archivos de trabajo

La carpeta incluye la fuente en Markdown, los datos estructurados del documento, las seis imágenes y sus prompts. La referencia visual procede de la hoja de personajes disponible en el proyecto, centrada en su robot de dos jugadores. Las imágenes nuevas se generaron con la herramienta integrada image_gen. La planificación temporal y los requisitos finales se concretarán después de la muestra vertical.

## Presentación y decisiones pendientes

### Cómo explicar el juego

Propuesta de ficha: Dos robots. Un cuerpo. Ningún acuerdo sobre dónde poner el pie. Plataformas 3D cooperativas para dos, con cinco mundos, poderes distintos, rescates torpes y carreras cortas entre amigos. El argumento de venta es alternar libertad individual y control compartido de un personaje, no una cantidad enorme de horas.

### Estructura de sesión

Anfitrión crea sala privada, invita al segundo jugador y elige continuar o repetir nivel desbloqueado. Antes de empezar se muestra checkpoint y modo de ayudas. Las personas eligen color y pueden intercambiarlo sin perder progreso. La pausa pertenece a ambos: en campaña cualquiera puede pausar; una arena termina sin resultado si alguien necesita detenerla.

### Comunicación

Campaña completable mediante señales de objetivo, preparación, solicitud de mano y confirmación, con emotes accesibles. La voz entre amigos es compatible con la experiencia, pero ningún obstáculo detecta o exige voz. Un chat de voz integrado se decide tras el prototipo de red; el MVP no debe depender de un servicio externo para resolver las pruebas.

### Modelo comercial propuesto

Compra única para PC en Steam. Sin moneda premium ni mejoras de pago. Una demo puede condensar la muestra vertical del nivel 1 y terminar tras un rescate y un lanzamiento conjuntos. Precio, política de acceso de invitado y requisitos finales de hardware se fijan después de medir producción y probar la demo; no se presupone que una sola compra permita jugar a dos.

### Decisiones que el prototipo debe cerrar

- ¿La dirección por media de piernas resulta expresiva sin volverse lenta? Compararla con una variante de apoyo alterno en la misma sala.
- ¿La cámara del cuerpo unido permite apuntar dos brazos con comodidad en dos clientes?
- ¿Qué ventana de sincronía conserva reto y funciona con la latencia observada?
- ¿Los dos minis pueden acoplarse con una animación clara y barata de producir?
- ¿Los piques breves mejoran la sesión o conviene ofrecer campaña sin arenas por defecto?
- ¿Cuánto contenido real cabe en cada mundo sin repetir soluciones ni multiplicar sistemas?

El siguiente resultado concreto es una muestra jugable del nivel 1 con dos clientes, captura de una partida y observación de cinco parejas. Ese resultado decide el ajuste de controles y el coste de la campaña antes de producir los cinco mundos.
