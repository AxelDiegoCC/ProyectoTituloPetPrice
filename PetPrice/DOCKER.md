# Docker

Este proyecto ahora se puede ejecutar dentro de un contenedor multi-stage.

## Construir imagen

```bash
docker build -t petprice .
```

Variables de construcción disponibles:

- `NODE_VERSION` (por defecto `22.12.0`, debe ser >=20.19 o >=22.12 para Angular 20)
- `NGINX_VERSION` (por defecto `1.27.2`)

## Ejecutar contenedor

```bash
docker run --rm -p 8080:80 petprice
```

La aplicación quedará disponible en http://localhost:8080 con `nginx` sirviendo los artefactos de `ng build`.

## Desarrollo

Para iterar sin reconstruir la imagen puedes seguir usando `npm start` fuera del contenedor o generar builds manuales con `npm run build`.
