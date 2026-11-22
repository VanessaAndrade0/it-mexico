# Historias de usuario · IT Mexico

Formato: **Como** [rol], **quiero** [acción], **para** [beneficio].
Cada historia lleva sus criterios de aceptación. `[x]` = ya cumplido, `[ ]` = pendiente.

Roles:
- **Equipo de IT:** registra y administra el inventario.
- **Jefatura:** consulta y da seguimiento.
- **Administrador:** gestiona accesos y seguridad.

---

## Inventario

### 1. Consultar el inventario
**Como** equipo de IT, **quiero** ver todos los artículos con su stock actual, **para** saber qué hay disponible sin abrir un Excel.
- [x] Muestra SKU, nombre, categoría, marca, modelo, ubicación, stock, mínimo y proveedores
- [x] La lista está numerada
- [x] Se puede buscar por nombre o SKU

### 2. Alertas de stock bajo
**Como** equipo de IT, **quiero** que el sistema me avise cuando un artículo llega a su mínimo, **para** pedirlo antes de quedarnos sin material.
- [x] Los artículos en su mínimo se marcan como "bajo mínimo"
- [x] Los artículos sin existencia se marcan como "agotados"
- [x] La pestaña Inventario muestra un número rojo con la cantidad de alertas

### 3. Filtrar y agrupar el inventario
**Como** jefatura, **quiero** agrupar el inventario por categoría, marca, proveedor, ubicación o estado, **para** analizarlo como una tabla dinámica.
- [x] Filtros por categoría, marca, proveedor y estado
- [x] Agrupación con total de piezas por grupo
- [x] Cada grupo indica cuántos artículos están bajo mínimo

### 4. Administrar artículos
**Como** equipo de IT, **quiero** dar de alta y editar artículos, **para** mantener el catálogo al día.
- [x] Formulario con SKU, categoría, marca, modelo, ubicación, mínimo y proveedores
- [x] Un artículo con movimientos no se puede eliminar, para conservar su historial

### 5. Descargar el inventario
**Como** jefatura, **quiero** descargar a Excel lo que veo en pantalla, **para** compartirlo o analizarlo.
- [x] La descarga respeta los filtros y la agrupación aplicados

---

## Movimientos

### 6. Registrar una salida
**Como** equipo de IT, **quiero** registrar cada envío con su ticket, sucursal, solicitante y LPN, **para** tener el control de lo que sale del inventario.
- [x] El ticket es obligatorio en toda salida
- [x] El LPN es opcional, porque algunas sucursales recogen en persona
- [x] El stock baja automáticamente
- [x] Se guarda la fecha y hora exactas

### 7. Registrar entradas y ajustes
**Como** equipo de IT, **quiero** registrar entradas de material y ajustes de inventario, **para** que el stock refleje la realidad.
- [x] Las entradas pueden indicar el proveedor
- [x] Los ajustes aceptan cantidades positivas o negativas
- [x] No se permiten movimientos de 0 piezas

### 8. Captura de sucursal sin errores
**Como** equipo de IT, **quiero** que el sistema me sugiera las sucursales y reconozca el código de 4, **para** no equivocarme al capturar.
- [x] Lista de sucursales mientras se escribe
- [x] Si se escribe el código de 4, muestra el equivalente y guarda el de 5

### 9. Consultar el historial de envíos
**Como** jefatura, **quiero** filtrar el historial por año, mes, tipo, categoría, artículo, sucursal, método de envío y origen, **para** encontrar cualquier envío rápidamente.
- [x] Buscador por ticket, LPN, número de serie o solicitante
- [x] Paginación de 100 renglones
- [x] Descarga a Excel de lo que se ve

### 10. Agrupar el historial
**Como** jefatura, **quiero** agrupar los envíos por artículo, sucursal, mes o año, **para** ver el consumo de un vistazo.
- [x] Totales por grupo
- [x] Al dar clic en un grupo se ve su detalle

### 11. Juntar piezas iguales
**Como** equipo de IT, **quiero** ver en un solo renglón las piezas idénticas de un mismo envío, **para** que el historial sea más fácil de leer.
- [x] Opción "Juntar piezas iguales" que se puede activar o desactivar
- [x] Las piezas con número de serie siempre se muestran por separado

### 12. Corregir movimientos
**Como** equipo de IT, **quiero** editar, anular o eliminar un movimiento, **para** corregir errores de captura.
- [x] Editar fecha, ticket, sucursal, solicitante, LPN y nota sin afectar el stock
- [x] Al anular se pide el motivo y el stock se corrige solo
- [x] Al eliminar, el stock se corrige y el registro queda en la bitácora

---

## Trucks

### 13. Seguimiento de órdenes de compra
**Como** equipo de IT, **quiero** registrar cada truck con su orden de compra, proveedor, fechas y artículos, **para** saber qué viene en camino.
- [x] Guarda orden de compra, proveedor, fecha de orden, fecha estimada, truck, LPN y artículos
- [x] Estados "en camino" y "recibido"

### 14. Alertas de llegada
**Como** equipo de IT, **quiero** que el sistema me avise qué trucks llegan pronto y cuáles están atrasados, **para** prepararme o dar seguimiento al proveedor.
- [x] Aviso de los que llegan en los próximos 2 días
- [x] Aviso de los atrasados, también en la pestaña Inventario

### 15. Recibir un truck
**Como** equipo de IT, **quiero** recibir un truck con un clic, **para** que todo su material entre al inventario de una vez.
- [x] Pide la fecha real de llegada
- [x] Todos los artículos del truck suben al stock en un solo paso

### 16. Tiempos de entrega por proveedor
**Como** jefatura, **quiero** ver el tiempo de entrega promedio de cada proveedor, **para** saber con cuánta anticipación pedir.
- [x] Tabla de tiempos por proveedor
- [x] Gráfica comparativa

### 17. Importar trucks desde Excel
**Como** equipo de IT, **quiero** cargar los trucks desde un Excel, **para** no capturarlos uno por uno.
- [x] Agrupa los renglones por orden de compra
- [x] Crea los proveedores y artículos que falten
- [x] No duplica trucks existentes
- [x] Avisa fechas inválidas con su número de fila

---

## Sucursales

### 18. Catálogo de sucursales
**Como** equipo de IT, **quiero** un catálogo con el código de 5 y el de 4 de cada sucursal, **para** identificarlas sin confusión.
- [x] Código de 5, código de 4, nombre, ciudad y si está activa
- [x] Piezas enviadas y fecha del último envío por sucursal

### 19. Detectar y corregir códigos mal escritos
**Como** equipo de IT, **quiero** que el sistema detecte códigos de sucursal mal escritos en el historial, **para** corregirlos sin perder registros.
- [x] Aviso de códigos que no están en el catálogo, con botón para agregarlos
- [x] Sugerencias para códigos con un carácter de más, de menos o cambiado
- [x] Corrección en un clic: "Es su código de 4" o "Está mal escrito"

### 20. Importar sucursales desde Excel
**Como** equipo de IT, **quiero** cargar el catálogo de sucursales desde un Excel, **para** no capturarlas a mano.
- [x] Detecta solo las columnas de código de 5 y de 4
- [x] Actualiza las sucursales existentes sin duplicarlas
- [x] Avisa problemas con el número de fila

---

## Proveedores

### 21. Directorio de proveedores
**Como** equipo de IT, **quiero** guardar el contacto, correo y teléfono de cada proveedor, **para** tenerlos a la mano al hacer pedidos.
- [x] Un artículo puede tener varios proveedores

---

## Excel y reportes

### 22. Importar inventario
**Como** equipo de IT, **quiero** importar el inventario desde Excel eligiendo qué columna es cada dato, **para** cargar información sin capturarla.
- [x] Omite hojas ocultas y tablas dinámicas
- [x] Muestra un resumen antes de importar

### 23. Importar el histórico por año
**Como** equipo de IT, **quiero** importar el archivo maestro de cada año con números de serie, marca, modelo y costos, **para** tener todo el historial en el sistema.
- [x] Unifica nombres escritos de distintas formas para el mismo artículo
- [x] Detecta fechas imposibles y las reporta con su fila
- [x] No duplica registros si el archivo se vuelve a subir
- [x] Lista de archivos importados con opción de quitarlos
- [x] 2023–2024 cargado
- [ ] 2025 cargado
- [ ] 2026 cargado

### 24. Reporte mensual
**Como** jefatura, **quiero** descargar un reporte mensual en Excel, **para** presentarlo en las juntas.
- [x] 8 hojas con consumo por artículo, por sucursal y por mes, entre otras
- [x] Las fechas no se recorren por diferencias de zona horaria

---

## Agenda

### 25. Tablero de tareas
**Como** equipo de IT, **quiero** un tablero To Do con columnas Por hacer, En proceso y Hecho, **para** organizar los pendientes del equipo.
- [x] Tarjetas con responsable, fecha límite y prioridad
- [x] Se mueven arrastrándolas o con botones
- [x] Las vencidas se marcan en rojo
- [x] Las terminadas se archivan solas después de 30 días

### 26. Recados en las tareas
**Como** equipo de IT, **quiero** dejar recados dentro de cada tarea, **para** que alguien pueda continuar el trabajo cuando salgo de viaje.
- [x] Cada recado guarda autor, fecha y hora
- [x] Buscador en tareas y recados

### 27. Calendario del equipo
**Como** jefatura, **quiero** un calendario con reuniones, viajes, vacaciones y recordatorios, **para** saber quién está disponible cada día.
- [x] Eventos de varios días
- [x] Un color por tipo de evento
- [x] Aviso de quién está de viaje o de vacaciones

---

## Seguridad

### 28. Acceso solo por invitación
**Como** administrador, **quiero** que solo entren usuarios invitados, **para** proteger la información de la empresa.
- [x] Registro público desactivado
- [x] Confirmación de correo obligatoria
- [x] Las cuentas nuevas entran sin permisos hasta ser autorizadas

### 29. Niveles de permiso
**Como** administrador, **quiero** asignar a cada usuario un nivel de permiso, **para** que cada quien haga solo lo que le corresponde.
- [x] Niveles Administrador, Editor, Solo lectura y Pendiente
- [x] Los permisos se validan dentro de la base de datos
- [x] Probado en 9 escenarios de seguridad

### 30. Bitácora de cambios
**Como** administrador, **quiero** ver quién editó o eliminó cada registro, **para** tener trazabilidad y recuperar información.
- [x] Guarda usuario, fecha, datos de antes y de después
- [x] Solo los administradores pueden consultarla

### 31. Respaldo automático
**Como** administrador, **quiero** un respaldo semanal de toda la base de datos, **para** recuperar la información si algo sale mal.
- [x] Cada lunes a las 2:17 a.m. por GitHub Actions
- [x] Se puede generar manualmente cuando se necesite
- [x] Se puede descargar y guardar de forma local

---

## Diseño

### 32. Interfaz accesible
**Como** usuario, **quiero** una interfaz clara y legible, **para** trabajar muchas horas frente a la pantalla con comodidad.
- [x] Contraste de colores superior al mínimo de WCAG (4.5 a 1)
- [x] Diseño consistente en todas las pestañas
- [x] Funciona en computadora y celular

### 33. Continuidad ante errores
**Como** usuario, **quiero** que una falla en una sección no detenga todo el sistema, **para** seguir trabajando.
- [x] Cada sección carga de forma independiente
- [x] Aviso que indica qué sección requiere revisión

---

## Pendientes (columna "Por hacer")

### 34. Conteo físico con escáneres Zebra
**Como** equipo de IT, **quiero** escanear lo que hay en el rack con los escáneres Zebra, **para** compararlo con el sistema y generar los ajustes automáticamente.
- [ ] Modo de conteo que acepte lecturas del escáner
- [ ] Comparación contra el stock del sistema
- [ ] Propuesta de ajustes para aprobar con un clic

### 35. Pantalla de inicio
**Como** jefatura, **quiero** una pantalla de inicio con el resumen del día, **para** ver lo importante al entrar.
- [ ] Artículos bajo mínimo, trucks en camino, envíos del mes y pendientes

### 36. Punto de pedido
**Como** equipo de IT, **quiero** que el sistema me diga cuándo pedir y cuánto, **para** anticipar las compras.
- [ ] Consumo promedio mensual por artículo
- [ ] Días de inventario restantes
- [ ] Cantidad sugerida a pedir

### 37. Búsqueda por número de serie
**Como** equipo de IT, **quiero** buscar un número de serie y ver todo su recorrido, **para** atender garantías y aclaraciones de sucursales.
- [ ] Sucursal, fecha y ticket de cada envío del equipo

### 38. Aviso semanal por correo
**Como** jefatura, **quiero** recibir un resumen semanal por correo, **para** estar al tanto sin entrar al sistema.
- [ ] Artículos bajo mínimo, trucks atrasados y tareas vencidas
- [ ] Confirmar con IT corporativo que el correo no se bloquee

### 39. Importaciones completas o nada
**Como** equipo de IT, **quiero** que una importación de Excel entre completa o no entre, **para** que una falla de internet no deje datos a medias.
- [ ] Importaciones procesadas como una sola operación en la base de datos

### 40. Pruebas automáticas
**Como** administrador, **quiero** que las pruebas corran solas antes de cada cambio, **para** detectar errores antes de que lleguen a los usuarios.
- [ ] Pruebas de las funciones principales
- [ ] Ejecución automática en GitHub Actions