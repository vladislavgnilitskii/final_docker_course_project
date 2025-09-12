### Глава 1. Dockerfile 
#### Backend
У меня мало опыта в работе с js приложениями, поэтому я опирался на практики, и написал Dockefile для backendа так:

<img width="527" height="245" alt="Pasted image 20250910233753" src="https://github.com/user-attachments/assets/7a16f5b7-2dec-4dba-ad04-fa0c08ee627c" />


Однако я получил ошибку о том, что  нет скрипта сборки. После чего немного погуглил, и понял, что сборка не нужна. Плюсом в самом контейнере нету диры src, и поэтому нужно было напрямую из /app запускать сервер.

```
FROM node:16-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

FROM node:16-alpine
WORKDIR /app
RUN addgroup -S nodeuser \
    && adduser -S nodeuser -G nodeuser
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app .
RUN chown -R nodeuser:nodeuser /app
EXPOSE 3001
USER nodeuser
CMD ["node", "server.js"]
```

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

В целом не было каких либо проблем в написании docker-compose, кроме ошибок из за невнимательности. Но были ошибки с переменными окружения, а именно с файлом backend/server.js. Пришлось переписывать немного server.js (нейронкой кнш), чтобы там тоже работали переменные окружения. Еще был небольшой затуп с тем, что бэк не подключался к бд, потому что он это делал через localhost. Указал в переменных окружения HOST=database и все заработало. 

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

<img width="916" height="1080" alt="Pasted image 20250912014513" src="https://github.com/user-attachments/assets/6b80c627-496c-4403-b0aa-4f2accdc65fb" />

Также же хотел добавить то, что неплохо бы было добавить в курс побольше про depends_on и healthcheck в compose.

### Настройка SSL/TLS для frontend (самоподписанный сертификат)

В папке с проектом создал диру для сертификатов. Потом ввел команду для создания самоподписанного сертификата.

```
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout certs/selfsigned.key -out certs/selfsigned.crt -subj "/CN=localhost"
```

После чего немного изменил docker-compose.yml в сервасе frontend, открыв порт и пробросил сертификаты.

```
   ports:  
     - "${FRONTEND_PORT_HTTP}:80"  
     - "${FRONTEND_PORT_HTTPS}:443"  
   volumes:  
     - ./certs:/etc/nginx/certs
```

Теперь изменим конфиг nginx.

```
server {  
   listen 80;  
   server_name localhost;  
  
   return 301 https://$host$request_uri;  
}  
  
server {  
   listen 443 ssl;  
   server_name localhost;  
  
   ssl_certificate /etc/nginx/certs/selfsigned.crt;  
   ssl_certificate_key /etc/nginx/certs/selfsigned.key;      
  
   root /usr/share/nginx/html;  
   index index.html;  
  
   location / {  
       try_files $uri /index.html;  
   }  
  
   location /api/ {  
       proxy_pass http://backend:3001/;  
       proxy_http_version 1.1;  
       proxy_set_header Upgrade $http_upgrade;  
       proxy_set_header Connection "upgrade";  
       proxy_set_header Host $host;  
       proxy_cache_bypass $http_upgrade;  
   }  
}
```

После запускаем docker-compose.yml и переходим на localhost и принимаем предупреждение и переходим на наш localhost

<img width="898" height="1068" alt="Pasted image 20250912203804" src="https://github.com/user-attachments/assets/55f581db-3edd-47b0-bac7-68d11ec64a10" />

<img width="919" height="615" alt="Pasted image 20250912203839" src="https://github.com/user-attachments/assets/324b0fa5-76e7-49ef-aeaa-2db9f3ce1c60" />
