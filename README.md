### Глава 1. Dockerfile 
#### Backend
У меня мало опыта в работе с js приложениями, поэтому я опирался на практики, и написал Dockefile для backendа так:

![[Pasted image 20250910233753.png]]

Однако я получил ошибку о том, что  нет скрипта сборки. После чего немного погуглил, и понял, что сборка не нужна. Плюсом в самом контейнере нету диры src, и поэтому нужно было напрямую из /app запускать сервер.

![[Pasted image 20250911002107.png]]

После чего у меня собрался образ.

#### Frontend
Далее я написал Dockerfile для фронта. Здесь я генерил кастомный nginx.conf, для того, чтобы было проксирование бэка. Была ошибка в логах запуска nginx. Она заключалась в том, что я где то не поставил ;, думал ошибка в конфиге nginx, но потом перепроверил докерфайл, и увидел, что я не поставил ; в слое с запуском nginx. )))

```
FROM node:16-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci 

FROM node:16-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginx:alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Database
Также сделал образ для БД. Позже была ошибка с тем, что неправильно указал диру docker-entrypoint-initdb.d (не добавил .d в конец)

```
FROM postgres:16-alpine  
COPY init.sql /docker-entrypoint-initdb.d/  
RUN chmod 755 /docker-entrypoint-initdb.d/init.sql
```

### Глава 2. Docker Compose конфигурация

В целом не было каких либо проблем в написании docker-compose, кроме ошибок из за внимательности. Но были ошибки с переменными окружения, а именно с файлом backend/server.js. Пришлось переписывать немного код(нейронкой кнш), чтобы там тоже работали переменные окружения. Еще был небольшой затуп с тем, что бэк не подключался к бд, потому что он это делал через localhost. Указал в переменных окружения database и все заработало. 

```
services:  
 frontend:  
   build: ./frontend  
   image: frontend_crm_app:latest  
   ports:  
     - "${FRONTEND_PORT}:80"  
   networks:  
     - frontend_network  
   depends_on:  
     backend:  
       condition: service_started  
     database:  
       condition: service_healthy  
   restart: always  
 backend:  
   build: ./backend  
   image: backend_crm_app:latest  
   ports:  
     - "${BACKEND_PORT}:3001"  
   environment:  
     BACKEND_PORT: ${BACKEND_PORT}  
     DB_PORT: ${DB_PORT}  
     POSTGRES_USER: ${POSTGRES_USER}  
     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  
     POSTGRES_DB: ${POSTGRES_DB}  
     DB_HOST: database  
   networks:  
     - frontend_network  
     - backend_network  
   depends_on:  
     database:  
       condition: service_healthy  
   restart: always  
 database:  
   build: ./database  
   image: db_crm_app:latest  
   ports:  
     - "${DB_PORT}:5432"  
   environment:  
     POSTGRES_USER: ${POSTGRES_USER}  
     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  
     POSTGRES_DB: ${POSTGRES_DB}  
   volumes:  
     - postgres_data:/var/lib/postgresql/data  
   networks:  
     - backend_network  
   restart: always  
   healthcheck:  
     test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]  
     interval: 10s  
     timeout: 5s  
     retries: 5  
     start_period: 10s  
volumes:  
 postgres_data:  
networks:  
 backend_network:  
   driver: bridge  
 frontend_network:  
   driver: bridge
```

После итогового запуска все заработало 

![[Pasted image 20250912014513.png]]

Также же хотел добавить то, что неплохо бы было добавить в курс побольше про depends_on и healthcheck в compose.


