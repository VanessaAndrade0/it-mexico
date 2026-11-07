# IT Mexico · Inventario

Aplicación web para llevar el inventario del área de soporte TI: artículos, entradas y salidas por ticket, proveedores y alertas de stock bajo. Reemplaza el control manual en Excel.

## Qué hace (versión base)

- Inicio de sesión con correo y contraseña.
- Inventario con búsqueda, mínimo por artículo y alerta cuando el stock llega al mínimo.
- Registro de salidas, entradas y ajustes con ticket (REQ), sucursal, quién lo pidió y LPN.
- El stock se actualiza solo en la base de datos con cada movimiento.
- Editar fecha, ticket, sucursal, solicitante, LPN y nota de un movimiento sin afectar el stock.
- Eliminar un movimiento: el stock se corrige solo.
- Trucks: registrar lo que viene en camino (número de truck, fecha, proveedor, LPN y artículos) y recibirlo para dar entrada al inventario de una sola vez.
- Órdenes de compra con fecha de orden y llegada estimada: avisos de trucks atrasados o por llegar y tiempo de entrega promedio por proveedor.
- Eliminar artículos sin movimientos y proveedores.
- Proveedores con contacto, correo y teléfono. Un artículo puede tener varios proveedores.

## Tecnologías

- HTML, CSS y JavaScript (módulos), sin frameworks.
- [Supabase](https://supabase.com) para base de datos (PostgreSQL) e inicio de sesión.

## Cómo ponerla en marcha

1. Crea un proyecto en Supabase.
2. En **SQL Editor** pega y ejecuta todo `sql/schema.sql`, después `sql/02_anular_y_editar.sql` `sql/03_eliminar_y_trucks.sql` y al final `sql/04_ordenes_y_entregas.sql`.
3. En **Authentication > Sign In / Providers** desactiva "Allow new users to sign up", para que nadie más pueda crear cuenta.
4. En **Authentication > Users > Add user** crea una cuenta para cada persona que la va a usar.
5. En **Project Settings > API** copia la URL y la *anon key* y pégalas en `js/config.js`.
6. Abre la carpeta en Visual Studio Code y ejecútala con la extensión **Live Server** (clic derecho en `index.html` > Open with Live Server).

## Publicarla

Sube el repositorio a GitHub y conéctalo a [Cloudflare Pages](https://pages.cloudflare.com) o [Netlify](https://www.netlify.com) como sitio estático (no necesita comando de build). Los dos tienen plan gratis que permite uso de empresa. Como todo vive en Supabase, se puede usar desde cualquier lugar y cualquier red; no hace falta estar en la misma ubicación.

## Estructura

```
index.html          Pantallas de la app
css/styles.css      Estilos (azul, blanco y gris)
js/config.js        Datos de conexión a Supabase
js/supabase.js      Cliente de Supabase
js/app.js           Arranque, pestañas y carga de datos
js/auth.js          Inicio y cierre de sesión
js/estado.js        Datos compartidos entre pantallas
js/inventario.js    Artículos y alerta de stock bajo
js/movimientos.js   Entradas, salidas y ajustes
js/proveedores.js   Proveedores
js/truck.js         Trucks que llegan y su recepción
js/util.js          Funciones de apoyo
sql/schema.sql      Tablas, reglas de seguridad y cálculo de stock
sql/02_anular_y_editar.sql   Editar y anular movimientos
sql/03_eliminar_y_trucks.sql Eliminar movimientos y tablas de trucks
sql/04_ordenes_y_entregas.sql Órdenes de compra y fechas de entrega
sql/limpiar_pruebas.sql      Borra todos los registros para empezar de cero
```

## Próximas funciones

Importar Excel histórico, gráficas de consumo, facturas de proveedores con foto, escaneo de códigos de barras, lectura de capturas de tickets de ServiceNow y actualización en tiempo real.